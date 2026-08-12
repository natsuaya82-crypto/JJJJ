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
import { appraiseMove, hasNoPlayingTime, type Destination } from '../utils/transferDecision'
import { isOwnedBy } from '../utils/transferEligibility'
import { comparePlayers } from '../utils/playerSort'
import { domesticCpuTeamIds } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { calcTransferValue, ovr, playerConsentToMove } from '../utils/playerUtils'
import { clubLabel, loanHeadline, type NewsItem } from '../utils/newsItems'
import { needsPlayer } from '../utils/squadNeeds'
import { allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import { runTransferMarket } from './transferMarket'
import { ROSTER_MAX } from '../data/rosterRules'
import type { ArchivedSeason, ForeignLeague, Player, Season, Team, TransferRecord } from '../types'

/** 1軍の登録上限。**解雇で超過ぶんを切るときだけ**使う（元は 23 の直書き） */
const FIRST_SQUAD_MAX = 23
/** 売り手の上位何人を保護するか（エース級は出さない） */
const TRADE_SELLER_PROTECTED = 3
/** 貸し出されるのはここまでの年齢（走らせて育てる相手なので） */
const LOAN_MAX_AGE = 24

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
    /** リーグ全体で何件まで貸し出すか。**省略＝無制限** */
    maxLoans?: number
    /** その日の日付。**省略＝オフの既定（11/15）** */
    date?: string
    /**
     * ④本人が行くか。**省略すると聞かない**（呼び出し側の移行用）。
     * ★`loan: true` で渡すこと。レンタルは保有元が変わらないので、
     *   「格下のクラブへ行くのは嫌だ」が効かない（`transferDecision` の `loan`）
     */
    destinationOf?: (clubId: string, player: Player) => Destination
    allTeams?: Team[]
    foreignLeagues?: ForeignLeague[]
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

  let lent = 0
  for (const receiver of cpuIds) {
    if (ctx.maxLoans != null && lent >= ctx.maxLoans) break
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
    // ④本人が行くか。**このまま控えでいるか、1年よそで走るか**の選択なので、
    //   格下への減点は効かせない（loan: true）
    if (ctx.destinationOf) {
      const clubs = allTieredClubs(ctx.allTeams ?? teams, ctx.foreignLeagues ?? [])
      const a = appraiseMove(candidate, ctx.destinationOf(receiver, candidate),
        { srcTier: tierOfPlayerClub(senderId, clubs), loan: true })
      if (!a.ok) continue
    }
    lent++
    loanedIds.add(candidate.id)
    givenLoan[senderId] = (givenLoan[senderId] ?? 0) + 1
    receivedLoan[receiver] = (receivedLoan[receiver] ?? 0) + 1
    const m = movePlayer({ players, teams }, candidate.id, receiver, { year: ctx.year, until: loanYear, date: ctx.date })
    if (!m.ok) continue
    players = m.players
    teams = m.teams
    news.push({
      date: ctx.date ?? `${ctx.year}-11-15`,
      headline: loanHeadline({
        playerName: candidate.name, age: candidate.age, years: 1,
        ownerLabel: clubLabel(senderId, teams),
        borrowerLabel: clubLabel(receiver, teams) }),
      category: 'trade', relatedIds: [candidate.id] })
  }
  return { players, teams, news }
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
    /** リーグ全体で何件まで成立させるか。**省略＝無制限** */
    maxTrades?: number
    /** その日の日付。**省略＝オフの既定（2/1）** */
    date?: string
    /** ④本人の同意に渡す材料。**省略すると聞かない**（旧セーブ経路の保険） */
    destinationOf?: (clubId: string, player: Player) => Destination
    allTeams?: Team[]
    foreignLeagues?: ForeignLeague[]
  },
): { players: Player[]; teams: Team[]; records: TransferRecord[] } {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const tradedIds = ctx.excludeIds
  const tradeCount: Record<string, number> = {}
  const cpuIds = domesticCpuTeamIds(players, world.teams, ctx.playerTeamId)

  let done = 0
  for (const buyerId of cpuIds) {
    if (ctx.maxTrades != null && done >= ctx.maxTrades) break
    if ((tradeCount[buyerId] ?? 0) >= 1) continue
    const buyRoster = players.filter(p => p.teamId === buyerId && p.status === 'active')
    // ★人数の門は**置かない**。1対1の交換なので在籍数は増えも減りもしない。
    //   以前は「23人以上は買い手にならない」と書いてあったが、その直前の解雇が
    //   1軍上限23人に揃えるので**51クラブ全部がちょうど23人**になり、買い手が
    //   1クラブも残らなかった（`docs/AUDIT_TRANSFERS.md` 2-4）。
    //   実際に通っていたのは「その前の移籍で人が抜けて22人になったクラブ」だけ。
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
      // ★**問いは現金の移籍とまったく同じ**（`docs/AUDIT_TRANSFERS.md` §3）。
      //   ① 買う側が要るか      … needsPlayer（穴があって、そこで走れる）
      //   ② 売る側で出せる選手か … 保有権・今季加入でない・出番が無い（hasNoPlayingTime）
      //   ③ 対価が足りるか      … **形に応じたやり方**。現金なら予算、選手なら tradeBalance
      //   ④ 本人が行くか        … 下の playerConsentToMove（2人とも動くので2人に聞く）
      //
      //   以前はここに**5つ目**があった：「売り手も、もらう選手を使えること」。
      //   現金の移籍にはこの問いがありません（売り手は対価をもらうだけ）。
      //   トレードだけ両側に「必要か」を課していたので、
      //   「相手で15番手以降なのに、うちの走れる7人に入る」を**両クラブが互いに**
      //   満たす必要があり、実測で1件も成立しませんでした。
      const target = sellRoster.slice(TRADE_SELLER_PROTECTED).find((p, i) =>
        isOwnedBy(p, sellerId) &&
        !tradedIds.has(p.id) &&
        p.joinedYear !== ctx.year &&
        needsPlayer(buyRoster, p) && hasNoPlayingTime(i + TRADE_SELLER_PROTECTED + 1) &&
        tradeBalance({ outPlayers: [offered], inPlayers: [p] }, ctx.tradeValueCtx).ok
      )
      if (!target) continue
      // ④ 本人が行くか。**2人とも動くので2人に聞く**（現金の移籍と同じ入口）。
      //   クラブ同士は釣り合いで合意済みなので clubBlessed = true
      if (ctx.destinationOf) {
        const clubs = allTieredClubs(ctx.allTeams ?? teams, ctx.foreignLeagues ?? [])
        const asks: [Player, string][] = [[target, buyerId], [offered, sellerId]]
        if (asks.some(([pl, to]) =>
          !playerConsentToMove(pl, ctx.destinationOf!(to, pl), tierOfPlayerClub(pl.teamId, clubs), 0.5, 0, 0, true).ok)) continue
      }
      done++
      tradedIds.add(offered.id); tradedIds.add(target.id)
      tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
      tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
      // 交換する2人とも movePlayer に通す（自チームのトレードと同じ後始末）
      for (const [pid, toId] of [[offered.id, sellerId], [target.id, buyerId]] as const) {
        const m = movePlayer({ players, teams }, pid, toId, {
          year: ctx.year,
          date: ctx.date ?? `${ctx.year}-02-01`,
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

// ── シーズン中も同じことをする ─────────────────────────────────────
//
// ■なぜ
//   移籍ウィンドウは撤廃済みで、プレイヤーが絡む移籍・トレード・レンタルは
//   **いつでも**起きます。ところが**CPU同士の3つだけ**がオフの1回に固まっていました
//   （`beginSeasonDraft` の中）。オフとシーズン中で扱いが違う理由は無い、という
//   オーナー判断で、同じものをシーズン中にも回します（`docs/BACKLOG.md` A-7）。
//
// ■**日付で測ります。レースの本数では測りません。**
//   部ごとにレース数が違うからです（1部10戦・2部8戦・3部7戦）。記録会7回を足しても
//   コマ数は 17／15／14 と揃わず、**間の空き方も違います**。
//
//     部   レース  ＋記録会  間隔の中央値   いちばん空くところ
//     1部    10      17コマ      21日            28日
//     2部     8      15コマ      21日            42日
//     3部     7      14コマ      21日            49日
//
//   コマのたびに回すと、1部だけ市場が17回動いて3部は14回になり、しかも3部には
//   49日も市場が止まる区間ができます。**日程に日付が振ってあるのは、本数が違っても
//   1年の長さは同じに保つため**なので、こちらもその日付で数えます。
//
//   最後に回した日から `CPU_MARKET_INTERVAL_DAYS`（21日＝3週）経つごとに1回。
//   3/8〜12/27 の295日なので、**どの部でも年14回**で揃います。
//
// ■オフの一括処理は残します
//   解雇の直後は市場に人が溢れるので、そこでまとめて動くのは自然です。それに
//   `needsPlayer` が門番なので、**シーズン中に埋まった穴はオフでは埋めません**
//   （オフの件数は自動的に減ります）。

/** CPU市場を回す間隔（日）。「3週に1回くらい」＝21日 */
export const CPU_MARKET_INTERVAL_DAYS = 21
/** セーブを跨いだときなどに一気に走らせないための上限 */
const CPU_MARKET_MAX_CATCHUP = 3

/**
 * 今日までに何回ぶん市場を回すか。**日付だけで決める**（レースの本数を見ない）。
 *
 * ★**基準日は21日ずつ進めます。その日の日付にリセットしません。**
 *   リセットすると、日程の間隔が21日ちょうどでない部だけ端数が毎回捨てられ、
 *   1部12回・2部11回・3部12回のように差が残ります。21日ずつ進めれば余りが次へ繰り越され、
 *   **どの部でも年14回**に揃います（3/8〜12/27 の295日 ÷ 21日）。
 *
 * @param lastDate 最後に回した基準日（`YYYY-MM-DD`）。無ければ今日を初回として1回
 * @param today    その日程の日付
 * @returns rounds＝回す回数（0なら今回は回さない）／nextDate＝次に控える基準日
 */
export function cpuMarketRounds(lastDate: string | undefined, today: string): { rounds: number; nextDate: string } {
  if (!lastDate) return { rounds: 1, nextDate: today }
  const days = (Date.parse(today) - Date.parse(lastDate)) / 86_400_000
  if (!Number.isFinite(days) || days < CPU_MARKET_INTERVAL_DAYS) return { rounds: 0, nextDate: lastDate }
  const due = Math.floor(days / CPU_MARKET_INTERVAL_DAYS)
  const rounds = Math.min(CPU_MARKET_MAX_CATCHUP, due)
  // 進めるのは**実際に回したぶんだけ**。上限で切り捨てたぶんは繰り越さない
  // （セーブを長く開かなかったときに、あとからまとめて動くのを防ぐ）
  const next = new Date(Date.parse(lastDate) + rounds * CPU_MARKET_INTERVAL_DAYS * 86_400_000)
  return { rounds, nextDate: next.toISOString().slice(0, 10) }
}

/**
 * 1回ぶんで市場全体に許す件数。**ここを触れば移籍の活発さが変わります。**
 *
 * ■オフシーズンという考えはありません（オーナー・2026-08-12）
 *   以前は「ドラフトの直前に上限なしで1回」＋「シーズン中は21日ごとに3人」でした。
 *   実測すると **413件 対 39件** で、同じ市場を年に一度だけ10倍の勢いで回していたことになります。
 *   塊があったのは「解雇で枠が空くのがそこだから」で、遊びの決まりではありません。
 *   いまは**どの回も同じ件数**で、ドラフトの直前の1回もただの1回です。
 *
 * ■目安は「1クラブが1年に5人」（オーナー）
 *   1年に回るのは 15回（レース中14回 ＋ ドラフト直前1回）。
 *   232クラブ × 5人 ÷ 15回 ≒ 77件／回。
 */
export const CPU_TICK_TRANSFERS = 77
export const CPU_TICK_TRADES = 1
export const CPU_TICK_LOANS = 1

/**
 * シーズン中の1回ぶんのCPU市場。オフの一括処理と**同じ関数**を、件数だけ絞って呼ぶ。
 * 別実装を作らないこと（オフとシーズン中で判定が食い違う原因になる）。
 * 何回ぶん回すかは `cpuMarketRounds`（日付で決まる）。
 */
export function runCpuMarketTick(
  world: { players: Player[]; teams: Team[]; foreignLeagues: ForeignLeague[] },
  ctx: {
    playerTeamId: string
    year: number
    season: Season
    pastSeasons: ArchivedSeason[]
    allTeams: Team[]
    foreignLeagues: ForeignLeague[]
    rosterCapFor: (teamId: string) => number
    destinationOf: (clubId: string, player: Player) => Destination
    tradeValueCtx: TradeValueCtx
    /** その日の日付（ニュースに出る）。日程の日付をそのまま渡すこと */
    date: string
  },
): { players: Player[]; teams: Team[]; foreignLeagues: ForeignLeague[]; records: TransferRecord[]; news: NewsItem[] } {
  // 1回の中で同じ選手を2回動かさない（オフの一括処理と同じ決まり）
  const excludeIds = new Set<string>()
  // 移籍は engine/transferMarket の1本。オフの一括処理と同じ関数を件数だけ絞って呼ぶ
  const bought = runTransferMarket(world, { ...ctx, excludeIds, maxMoves: CPU_TICK_TRANSFERS })
  const traded = runCpuTrades({ players: bought.players, teams: bought.teams },
    { playerTeamId: ctx.playerTeamId, year: ctx.year, tradeValueCtx: ctx.tradeValueCtx, excludeIds, maxTrades: CPU_TICK_TRADES, date: ctx.date,
      destinationOf: ctx.destinationOf, allTeams: ctx.allTeams, foreignLeagues: ctx.foreignLeagues })
  const lent = runCpuLoans({ players: traded.players, teams: traded.teams },
    { playerTeamId: ctx.playerTeamId, year: ctx.year, excludeIds, maxLoans: CPU_TICK_LOANS, date: ctx.date,
      destinationOf: ctx.destinationOf, allTeams: ctx.allTeams, foreignLeagues: ctx.foreignLeagues })
  return {
    players: lent.players,
    teams: lent.teams,
    foreignLeagues: bought.foreignLeagues,
    records: [...bought.records, ...traded.records],
    news: [...bought.news, ...lent.news],
  }
}
