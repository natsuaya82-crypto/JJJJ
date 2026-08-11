// オフシーズンにCPUクラブ同士が動くところ。`beginSeasonDraft` から切り出した（挙動不変）。
//
// ■なぜ切り出すのか
//   `beginSeasonDraft` は456行あるが、**ドラフトの処理は60行ほどしかない**。
//   残りは「解雇 → CPU間移籍 → CPU間トレード → レンタル → FA補強」という
//   オフシーズンの市場そのもので、ドラフトとは別の話が同じボタンにぶら下がっている。
//   「なぜあのクラブがあの選手を手放したのか」を追うとき、`beginSeasonDraft` を
//   開く人はいない。
//
// ■出した順番の理由
//   最初に出したのはトレードだけだった。golden（`draft-flow`）がどの枝を通っているかを
//   枝ごとに壊して確かめたところ、**トレードだけ壊しても差分が出なかった**
//   ＝一度も成立していない（`docs/BACKLOG.md` A-7）。網の外にある処理を店子のまま
//   触るのが一番危ないので、そこを先に関数にして直接呼べるようにし、
//   `scripts/check-cpu-trade.ts` で成立側に網を張った。
//   残り（解雇・レンタル）は golden が効いているので、切り出して差分ゼロを見れば足りる。
import { tradeBalance, type TradeValueCtx } from '../utils/tradeValue'
import { hasNoPlayingTime, seeksPlayingTime, type Destination } from '../utils/transferDecision'
import { isOwnedBy } from '../utils/transferEligibility'
import { comparePlayers } from '../utils/playerSort'
import { buildCareerCounts } from '../utils/careerStats'
import { bigClub, domesticCpuTeamIds } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { roundRobin } from '../utils/roundRobin'
import { acquisitionDesiredSalary, calcTransferValue, faMarketSalary, ovr, perfOf, playerConsentToMove } from '../utils/playerUtils'
import { clubLabel, loanHeadline, seekPlayingTimeHeadline, transferHeadline, type NewsItem } from '../utils/newsItems'
import { needsPlayer, wouldMakeLineup } from '../utils/squadNeeds'
import { MAJOR_NEWS_OVR, tierOf, tierOfPlayerClub, tierStrength } from '../utils/clubTier'
import { DIVISION_SIZE, divisionOf, rankOfTeam, seasonDivisionStandings } from '../utils/league'
import { cpuSpecialtyNeeds } from './cpuMarket'
import { POACH_PREMIUM } from '../data/economy'
import { ROSTER_MAX } from '../data/rosterRules'
import type { ArchivedSeason, ForeignLeague, Player, Season, Team, TransferRecord } from '../types'

/**
 * 1軍の登録上限。解雇（超過ぶんを切る）とトレード（ここまで埋まっていたらもらう側に
 * ならない）が同じ数を見ている。元は両方 23 の直書きだった
 */
const FIRST_SQUAD_MAX = 23
/** 売り手の上位何人を保護するか（エース級は出さない） */
const TRADE_SELLER_PROTECTED = 3
/** 貸し出されるのはここまでの年齢（走らせて育てる相手なので） */
const LOAN_MAX_AGE = 24
/** これ以上いるクラブは、移籍市場で買う側にならない */
const CPU_BUY_ROSTER_MAX = 25
/** これ以下しかいないクラブからは引き抜かない（薄くしすぎない） */
const SELL_ROSTER_FLOOR = 16
/** これより多いクラブは、下の序列がまとめて余剰になる */
const SELL_ROSTER_CROWDED = 21

/**
 * 人数を減らすときに**先に切る順**（前から切る）。
 * 素のOVRではなく、31歳以上に−8、34歳以上にもう−8。同じOVRなら年上から切れる。
 *
 * 2箇所（1軍23人の超過ぶん・総在籍の上限超過ぶん）で同じ式を手書きしていたのを1本にした。
 * ★安定ソートの前提で、同点は元の並び順のまま残る。渡す配列の順を変えないこと。
 */
export const byReleasePriority = (a: Player, b: Player): number => {
  const score = (p: Player) => ovr(p) - (p.age > 30 ? 8 : 0) - (p.age > 33 ? 8 : 0)
  return score(a) - score(b)
}

/**
 * オフの頭に人数を整える（衰えたベテランと余剰を解雇してFAへ）。
 *
 * ★**誰を切るかは `world.players`（整える前の名簿）だけを見て全部決めてから**、
 *   まとめて `movePlayer` に流す。1人切るたびに名簿を数え直すと、先に処理された
 *   クラブと後のクラブで見ている世界が変わる。
 * ★借りている選手は切れない（保有権が無い）。返却はレンタル期間の処理に任せる。
 */
export function runCpuReleases(
  world: { players: Player[]; teams: Team[] },
  ctx: {
    playerTeamId: string
    year: number
    /** そのクラブの総在籍の上限（ドラフトで入る人数ぶんを空けてある） */
    rosterCapFor: (teamId: string) => number
  },
): { players: Player[]; teams: Team[] } {
  const releaseSet = new Set<string>()
  const isLoanedIn = (x: Player) => !!x.loan && x.loan.ownerTeamId !== x.teamId
  const cpuTeamIds = domesticCpuTeamIds(world.players, world.teams, ctx.playerTeamId)

  for (const teamId of cpuTeamIds) {
    const roster = world.players.filter(x => x.teamId === teamId && x.status === 'active' && !isLoanedIn(x))
    const avgOvr = roster.length > 0 ? roster.reduce((s, x) => s + ovr(x), 0) / roster.length : 60
    // 衰えたベテラン（チーム平均より6以上低く、契約も切れる）
    for (const p of roster) {
      if (p.age > 30 && ovr(p) < avgOvr - 6 && p.contract.yearsLeft <= 1) releaseSet.add(p.id)
    }
    // 1軍登録上限（23人）の超過ぶん
    const remaining = roster.filter(p => !releaseSet.has(p.id))
    if (remaining.length > FIRST_SQUAD_MAX) {
      [...remaining].sort(byReleasePriority).slice(0, remaining.length - FIRST_SQUAD_MAX).forEach(p => releaseSet.add(p.id))
    }
    // 総在籍（1軍+2軍・引退除く）の上限の超過ぶん。既に膨らんだセーブもここを通れば毎年是正される
    const cpuCap = ctx.rosterCapFor(teamId)
    const totalRoster = world.players.filter(x => x.teamId === teamId && x.status === 'active' && !releaseSet.has(x.id) && !isLoanedIn(x))
    if (totalRoster.length > cpuCap) {
      [...totalRoster].sort(byReleasePriority).slice(0, totalRoster.length - cpuCap).forEach(p => releaseSet.add(p.id))
    }
  }

  // 自チーム：シーズン中に整理しなかった超過分を強制的にFAへ（警告で猶予を与えた上での最終処理）。
  // ★ここだけ年齢ペナルティを掛けず、素のOVRの下位から切る。CPUと違って
  //   「誰を残すか」はプレイヤーが決める話なので、こちらで年齢の重みを付けない
  const myCap = ctx.rosterCapFor(ctx.playerTeamId)
  const myRoster = world.players.filter(x => x.teamId === ctx.playerTeamId && x.status === 'active' && !releaseSet.has(x.id) && !isLoanedIn(x))
  if (myRoster.length > myCap) {
    [...myRoster].sort((a, b) => ovr(a) - ovr(b)).slice(0, myRoster.length - myCap).forEach(p => releaseSet.add(p.id))
  }

  // 解雇も movePlayer に通す（所属を外す・名簿から消す・移籍リストの札をはがす）
  let players = world.players
  let teams = world.teams
  for (const id of releaseSet) {
    const m = movePlayer({ players, teams }, id, '', { year: ctx.year })
    if (!m.ok) continue
    players = m.players
    teams = m.teams
  }
  return { players, teams }
}

/**
 * CPU同士のレンタル（1年）。
 *
 * ★**動かすのは借りたい側**。出番の無い若手を、走らせてくれるクラブが借りに行く。
 *   以前は「人数が多いクラブが一番弱い選手を、人数の少ないクラブへ渡す」だけで、
 *   頭数合わせにしかなっていなかった（借りた側は走らせる気のない選手を受け取る）。
 * ★借りた側の名簿には載せない。以前はここだけ載せていて、セーブを読み直すと
 *   消える食い違いになっていた。
 * ★`excludeIds` はトレードと共有する。同じオフに移籍・トレードした選手を続けて
 *   貸し出さないため（1オフ1移動）。
 */
export function runCpuLoans(
  world: { players: Player[]; teams: Team[] },
  ctx: {
    playerTeamId: string
    year: number
    /** 同じオフに既に動いた選手。**呼び出し側と共有し、ここで書き足す** */
    excludeIds: Set<string>
  },
): { players: Player[]; teams: Team[]; news: NewsItem[] } {
  let players = world.players
  let teams = world.teams
  const news: NewsItem[] = []
  const loanedIds = ctx.excludeIds
  const loanYear = ctx.year + 1
  const cpuIds = domesticCpuTeamIds(players, world.teams, ctx.playerTeamId)
  const mainCount = (teamId: string) =>
    players.filter(p => p.teamId === teamId && p.status === 'active' && !p.loan).length
  const givenLoan: Record<string, number> = {}
  const receivedLoan: Record<string, number> = {}
  const rosterOf = (teamId: string) => players
    .filter(p => p.teamId === teamId && p.status === 'active' && !p.loan)
    .sort(comparePlayers('ovr'))

  for (const receiver of cpuIds) {
    if ((receivedLoan[receiver] ?? 0) >= 1 || mainCount(receiver) >= ROSTER_MAX) continue
    const myRoster = rosterOf(receiver)
    let candidate: Player | undefined
    let senderId = ''
    for (const sid of cpuIds) {
      if (sid === receiver || (givenLoan[sid] ?? 0) >= 1) continue
      const found = rosterOf(sid).find((p, i) =>
        hasNoPlayingTime(i + 1) && p.age <= LOAN_MAX_AGE
        && !loanedIds.has(p.id) && p.joinedYear !== ctx.year
        && needsPlayer(myRoster, p))
      if (found) { candidate = found; senderId = sid; break }
    }
    if (!candidate || !senderId) continue
    loanedIds.add(candidate.id)
    givenLoan[senderId] = (givenLoan[senderId] ?? 0) + 1
    receivedLoan[receiver] = (receivedLoan[receiver] ?? 0) + 1
    const m = movePlayer({ players, teams }, candidate.id, receiver, { year: ctx.year, until: loanYear })
    if (!m.ok) continue
    players = m.players
    teams = m.teams
    news.push({
      date: `${ctx.year}-11-15`,
      headline: loanHeadline({
        playerName: candidate.name, age: candidate.age, years: 1,
        ownerLabel: clubLabel(senderId, teams),
        borrowerLabel: clubLabel(receiver, teams) }),
      category: 'trade', relatedIds: [candidate.id] })
  }
  return { players, teams, news }
}

/**
 * CPU間移籍（メイン市場）。**移籍金を実際に払って引き抜く**ところ。
 *
 * ★1周につき1人だけ買う（`roundRobin`）。以前は1チームが上限まで買い切ってから
 *   次に回していたので、市場の良い選手が予算の多い上位チームに固まっていた。
 * ★順番は「前年順位が下のチームから」。同順は残高の多い方から。
 * ★誰を獲るかは `squadNeeds` の `needsPlayer` 1本。ここが抜けていた時期は
 *   needs が並び替えの優先度にしか使われておらず、**どのクラブでも誰でも買えた**。
 */
export function runCpuTransfers(
  world: { players: Player[]; teams: Team[] },
  ctx: {
    playerTeamId: string
    year: number
    /** 順位・出走数を引く今季と過去。`state.teams` は部の既定値を引くためだけに使う */
    season: Season
    pastSeasons: ArchivedSeason[]
    allTeams: Team[]
    /** 見出しの「大ニュース扱い」を決めるため（`bigClub`）。読むだけ */
    foreignLeagues: ForeignLeague[]
    rosterCapFor: (teamId: string) => number
    destinationOf: (clubId: string, player: Player) => Destination
    /** 同じオフに既に動いた選手。**呼び出し側と共有し、ここで書き足す** */
    excludeIds: Set<string>
  },
): { players: Player[]; teams: Team[]; records: TransferRecord[]; news: NewsItem[] } {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const news: NewsItem[] = []
  const bigClubCtx = { teams: ctx.allTeams, foreignLeagues: ctx.foreignLeagues }

  const lastSeason = ctx.pastSeasons[ctx.pastSeasons.length - 1]
  // そのクラブが前年に走った部の中での順位（順位表は部ごとに分かれている）。
  // 前年が無ければ、その部の真ん中に居たことにする
  const rankOfTx = (teamId: string) => {
    const r = lastSeason ? rankOfTeam(seasonDivisionStandings(lastSeason, teamId), teamId) : 0
    return r > 0 ? r : Math.ceil(DIVISION_SIZE[divisionOf(ctx.allTeams.find(t => t.id === teamId))] / 2)
  }

  // 実際の予算残高（finance.budget）から移籍金を払う。売った側は実際に受け取る（自チームと同じ金の動き）
  const buyers = world.teams
    .filter(t => t.id !== ctx.playerTeamId)
    .map(t => ({ team: t, tier: tierOf(t), budget: Math.max(0, t.finance.budget) }))
    .sort((a, b) => (rankOfTx(b.team.id) - rankOfTx(a.team.id)) || (b.budget - a.budget))

  const purchases: Record<string, number> = {}
  const sellCounts: Record<string, number> = {}   // 1チームが1オフに失う人数の上限（薄くしすぎない）
  const needsOf = new Map(buyers.map(x => [x.team.id, new Set(cpuSpecialtyNeeds(x.team.id, players))]))

  // 「出場機会を求めて出ていく人」を決めるための出走数。序列だけで決めると
  // 30人ロスターの下半分がまるごと市場に出るので、実際に走れたかを見る（utils/transferDecision）。
  // 数はレース結果から数え直す1本（utils/careerStats）。今季と前季を別々に取る
  const thisCounts = buildCareerCounts([ctx.season])
  const prevCounts = buildCareerCounts([lastSeason])
  const thisRaces = ctx.season.races.filter(r => r.results).length
  const prevRaces = (lastSeason?.races ?? []).filter(r => r.results).length

  const buyOnePlayer = ({ team: buyTeam, tier: buyTier }: typeof buyers[number]): boolean => {
    // 1オフに獲れる人数は格から（格1が4人、格20が2人）。強さの物差しは格1本
    const buyCap = 2 + Math.round(2 * tierStrength(buyTier))
    const needs = needsOf.get(buyTeam.id)!
    if ((purchases[buyTeam.id] ?? 0) >= buyCap) return false
    const remainBudget = Math.max(0, teams.find(t => t.id === buyTeam.id)?.finance.budget ?? 0)
    const buyRoster = players.filter(p => p.teamId === buyTeam.id && p.status === 'active')
    if (buyRoster.length >= CPU_BUY_ROSTER_MAX || buyRoster.length >= ctx.rosterCapFor(buyTeam.id)) return false

    const otherIds = buyers.map(x => x.team.id).filter(id => id !== buyTeam.id)
    const candidates = otherIds.flatMap(sellTeamId => {
      if ((sellCounts[sellTeamId] ?? 0) >= 2) return []   // 1チームから奪うのは最大2人
      const sellRoster = players
        .filter(p => p.teamId === sellTeamId && p.status === 'active')
        .sort(comparePlayers('ovr'))
      if (sellRoster.length <= SELL_ROSTER_FLOOR) return []   // 薄いチームからは引き抜かない（下限保護）
      // 売り手の絶対的エース(1番手)だけ保護。それ以外は主力でも引き抜き対象にする
      return sellRoster.slice(1)
        // isOwnedBy でレンタル中の選手を外す。ここが抜けていたため、貸し出した選手が
        // オフシーズンに貸出先の名簿として売られ、保有元に何も残らず消えていた
        .filter(p => isOwnedBy(p, sellTeamId) && !ctx.excludeIds.has(p.id) && p.joinedYear !== ctx.year)
        .map(p => {
          const rank = sellRoster.findIndex(x => x.id === p.id) + 1
          const benched = seeksPlayingTime({
            squadRank: rank, age: p.age,
            races: thisCounts.get(p.id)?.totalRaces ?? 0, teamRaces: thisRaces,
            prevRaces: prevCounts.get(p.id)?.totalRaces, prevTeamRaces: prevRaces })
          // 「余剰か（通常額）／主力の引き抜きか（割増＋本人同意）」も既にある1本で言う。
          // 以前はここに売り手の平均OVRから作った下限表（74/67/58）があった。
          // 出番が無い序列（走れる人数の2倍より下）なら、それがそのまま余剰という意味
          const surplus = hasNoPlayingTime(rank) || sellRoster.length > SELL_ROSTER_CROWDED || benched
          return { p, rank, benched, sellTeamId, surplus }
        })
    })
      // ★「必要だから動く」の関門（移籍金を払う移籍なので穴のときだけ）
      .filter(({ p }) => needsPlayer(buyRoster, p))
      // 欲しいタイプ・OVRの高い選手を優先
      .sort((a, b) => (Number(needs.has(b.p.specialty)) - Number(needs.has(a.p.specialty))) || (ovr(b.p) - ovr(a.p)))

    for (const { p: target, surplus, benched, rank: sellRank, sellTeamId } of candidates) {
      // 余剰は通常額、主力の引き抜きは割増移籍金＋昇給要求＋本人同意
      const fee = surplus ? calcTransferValue(target) : Math.round(calcTransferValue(target) * POACH_PREMIUM)
      const tgtPerf = perfOf(ctx.season, target.id)
      const newSalary = surplus ? faMarketSalary(target, tgtPerf) : acquisitionDesiredSalary(target, 'scout', 0.5, 0, tgtPerf)
      if (remainBudget < fee + newSalary) continue
      // 引き抜きは本人が移籍先の魅力で納得するか判定（クラブは割増で合意済み＝clubBlessed）
      if (!surplus && !playerConsentToMove(target, ctx.destinationOf(buyTeam.id, target), tierOfPlayerClub(target.teamId, teams), 0.5, 0, 0, true).ok) continue
      // 所属・名簿・移籍金・移籍履歴は movePlayer にまとめて任せる（自チームの獲得と同じ後始末）
      const moved = movePlayer({ players, teams }, target.id, buyTeam.id, {
        year: ctx.year,
        date: `${ctx.year}-02-01`,
        fee,
        years: 2,
        contract: { annualSalary: newSalary, yearsLeft: 2 } })
      if (!moved.ok) continue
      ctx.excludeIds.add(target.id)
      purchases[buyTeam.id] = (purchases[buyTeam.id] ?? 0) + 1
      sellCounts[moved.from] = (sellCounts[moved.from] ?? 0) + 1
      players = moved.players.map(p =>
        p.id !== target.id ? p : { ...p, contract: { ...p.contract, faEligibleYear: ctx.year + 2 } })
      teams = moved.teams
      if (moved.record) records.push(moved.record)
      // 序列から落ちて出番が無くなった選手は、その事情がわかる見出しにする。
      // 「何番手だったか」を出すと、市場が効いているかがニュースだけで追える
      news.push({
        date: `${ctx.year}-11-10`,
        headline: benched
          ? seekPlayingTimeHeadline({
              playerName: target.name, age: target.age, squadRank: sellRank,
              fromLabel: clubLabel(sellTeamId, teams),
              toLabel: clubLabel(buyTeam.id, teams) })
          : transferHeadline({
              playerName: target.name, playerOvr: ovr(target), fee,
              fromLabel: clubLabel(sellTeamId, teams),
              toLabel: clubLabel(buyTeam.id, teams) }),
        category: 'trade', relatedIds: [target.id],
        major: ovr(target) >= MAJOR_NEWS_OVR || bigClub(bigClubCtx, sellTeamId) || bigClub(bigClubCtx, buyTeam.id) })
      return true
    }
    return false
  }

  roundRobin(buyers, buyOnePlayer)
  return { players, teams, records, news }
}

/**
 * CPU同士の交換（お金が足りなくても、価値の近い選手同士なら動く）。
 *
 * 成立の条件は「**もらう側では走れて、出す側では走れない**」。両方が得をする交換だけを
 * 通すので、片方が明らかに損をする組み合わせは `tradeBalance` で落ちる。
 *
 * ★1クラブにつき1オフ1件まで（買い手としても売り手としても）。
 * ★`excludeIds` は**その場で書き足す**。呼び出し側はこの後のレンタルで同じ集合を見るので、
 *   ここで動いた選手が続けて貸し出されないようにするため（1オフ1移動）。
 */
export function runCpuTrades(
  world: { players: Player[]; teams: Team[] },
  ctx: {
    playerTeamId: string
    year: number
    tradeValueCtx: TradeValueCtx
    /** 同じオフに既に動いた選手。**呼び出し側と共有し、ここで書き足す** */
    excludeIds: Set<string>
  },
): { players: Player[]; teams: Team[]; records: TransferRecord[] } {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const tradedIds = ctx.excludeIds
  const tradeCount: Record<string, number> = {}
  const cpuIds = domesticCpuTeamIds(players, world.teams, ctx.playerTeamId)

  for (const buyerId of cpuIds) {
    if ((tradeCount[buyerId] ?? 0) >= 1) continue
    const buyRoster = players.filter(p => p.teamId === buyerId && p.status === 'active')
    if (buyRoster.length >= FIRST_SQUAD_MAX) continue
    // 出すのは「自分のところで出番が無い選手」（transferDecision の hasNoPlayingTime 1本）。
    // 以前はここに平均OVRから作った下限表（74/67/60）があった＝格とは別の物差し
    const buyerRanked = [...buyRoster].sort(comparePlayers('ovr'))
    const buyerSurplus = buyerRanked
      // レンタルで借りている選手は保有権が無いのでトレードに出せない
      .filter((p, i) => isOwnedBy(p, buyerId) && !tradedIds.has(p.id) && p.joinedYear !== ctx.year && hasNoPlayingTime(i + 1))
      .sort((a, b) => calcTransferValue(b) - calcTransferValue(a))
    if (buyerSurplus.length === 0) continue
    const offered = buyerSurplus[0]

    for (const sellerId of cpuIds) {
      if (sellerId === buyerId || (tradeCount[sellerId] ?? 0) >= 1) continue
      const sellRoster = players
        .filter(p => p.teamId === sellerId && p.status === 'active')
        .sort(comparePlayers('ovr'))
      // もらう側で走れて、出す側では走れない選手＝両方が得をする交換（squadNeeds 1本）。
      // 釣り合いは utils/tradeValue の tradeBalance 1本（以前はここだけ「×1.3」と直書きで、
      // 自チームのトレードが通る tradeValue.ts とは別の判定になっていた）
      const target = sellRoster.slice(TRADE_SELLER_PROTECTED).find((p, i) =>
        isOwnedBy(p, sellerId) &&
        !tradedIds.has(p.id) &&
        p.joinedYear !== ctx.year &&
        wouldMakeLineup(buyRoster, p) && hasNoPlayingTime(i + TRADE_SELLER_PROTECTED + 1) &&
        tradeBalance({ outPlayers: [offered], inPlayers: [p] }, ctx.tradeValueCtx).ok
      )
      // 売り手が受け取る側でも使えること（needsPlayer / wouldMakeLineup）
      if (!target || !(needsPlayer(sellRoster, offered) || wouldMakeLineup(sellRoster, offered))) continue
      tradedIds.add(offered.id); tradedIds.add(target.id)
      tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
      tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
      // 交換する2人とも movePlayer に通す（自チームのトレードと同じ後始末）
      for (const [pid, toId] of [[offered.id, sellerId], [target.id, buyerId]] as const) {
        const m = movePlayer({ players, teams }, pid, toId, {
          year: ctx.year,
          date: `${ctx.year}-02-01`,
          kind: 'trade' })
        if (!m.ok) continue
        players = m.players
        teams = m.teams
        if (m.record) records.push(m.record)
      }
      break
    }
  }
  return { players, teams, records }
}
