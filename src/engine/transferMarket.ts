// ============================================================================
// 移籍市場（唯一の経路）
// ============================================================================
//
// **選手がクラブからクラブへ移る道は、この1本だけです。**
// 国内52クラブと海外180クラブを**同じ1つの市場**に入れて回します。
//
//   > 海外とか日本とか関係ないのよ。全てが同一で、違うのがただリーグだけ。
//   > 資金もあって、欲しい選手もある。なら別にする理由はないよ
//   >                                        （オーナー・2026-08-12）
//
// ■以前は同じことを4本が別々にやっていました
//
//   | 経路 | どこ | 何が違っていたか |
//   |---|---|---|
//   | 国内CPU間 | `cpuOffseason.runCpuTransfers` | 2番手以降ぜんぶ見る（これが正しい形） |
//   | 海外↔海外 | `foreignTransfers.simulateForeignTransferMarket` | **上位10人しか候補にしない**・都落ち移籍という別の枝 |
//   | 海外→日本 | `simulateCrossBorderTransfers` の前半 | **絶対OVRの上位8人**だけ・穴のタイプ1つだけ |
//   | 日本→海外 | 同 後半＋スター引き抜き | 別の「余剰」の数え方・別の割増 |
//
//   その結果、**格1のクラブの15番手（OVR83）が動きませんでした**。
//   実測すると、その選手は格5〜8の81クラブのうち43クラブでスタメンに入り、
//   15〜18クラブが「必要」と判断します。**起きるべきことが、経路ごとの
//   絞り込みで消えていた**わけです。上位10人・上位8人という蓋を外せば済む話でした。
//
// ■1回の移動は必ずこの4つを順に通ります（`docs/AUDIT_TRANSFERS.md`）
//
//     ① そのクラブは要るか   needsPlayer（穴があって、そこで走れる）
//     ② その選手は出せるか   保有権・今季加入でない・下限（CPU_SELL_FLOOR）・エースは保護
//     ③ 対価は足りるか      transferFeeFor（余剰は市場価値／主力は割増）と手元の資金
//     ④ 本人は行くか        appraiseMove（格差・出場機会・憧れの地域・成長上限・性格）
//
//   **国内か海外かで変わるところは1つもありません。** 違うのは
//   「どの順位表から序列を引くか」（`destinationOf` の中）と、見出しの文面だけ。
//
// ■お金
//   置き場所は国内も海外も `finance.budget` 1本。ここでは1つの帳簿にまとめて動かし、
//   最後に `teams` と `foreignLeagues` の両方へ書き戻します。
//   `movePlayer` には `money: false` を渡します（国内側だけ二重に動くのを防ぐため）。
// ============================================================================
import { comparePlayers } from '../utils/playerSort'
import { clubSeasonRaces, playRateOf, type PlayRateSeason } from '../utils/playRate'
import { buildCareerCounts } from '../utils/careerStats'
import { allForeignClubs } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { roundRobin } from '../utils/roundRobin'
import { needsPlayer } from '../utils/squadNeeds'
import { isOwnedBy, isTransferLocked } from '../utils/transferEligibility'
import { isSurplus, seeksPlayingTime, willRelease, type Destination } from '../utils/transferDecision'
import {
  acquisitionDesiredSalary, faMarketSalary, newContractYears, ovr, seasonPerfProfile, playerConsentToMove,
  transferFeeFor,
} from '../utils/playerUtils'
import {
  MAJOR_NEWS_OVR, allTieredClubs, isBigClub, isStepUp, tierBudget, tierOf, tierOfPlayerClub, tierStrength,
  type ClubTier,
} from '../utils/clubTier'
import { CPU_SELL_FLOOR } from '../data/rosterRules'
import {
  clubLabel, crossBorderHeadline, overseasBreakthroughHeadline, seekPlayingTimeHeadline,
  transferHeadline, type NewsItem,
} from '../utils/newsItems'
import { cpuSpecialtyNeeds } from './cpuMarket'
import type { ArchivedSeason, ForeignClub, ForeignLeague, Player, Season, Team, TransferRecord } from '../types'

/** 1クラブが1回の市場で失う人数の上限（薄くしすぎない） */
const SELL_PER_CLUB = 2
/** ニュースに出す件数（多すぎると他の記事が流れる） */
const NEWS_MAX = 10

/** 市場に並ぶクラブ。国内も海外もここでは同じ形になる */
type MarketClub = { id: string; tier: ClubTier; domestic: boolean; name: string; label: string }

export type TransferMarketResult = {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  records: TransferRecord[]
  news: NewsItem[]
}

/**
 * 移籍市場を1回ぶん回す。**オフの一括処理もシーズン中の少量発生も同じ関数**で、
 * 違うのは `maxMoves` と `date` だけ。別実装を作らないこと。
 */
export function runTransferMarket(
  world: { players: Player[]; teams: Team[]; foreignLeagues: ForeignLeague[] },
  ctx: {
    playerTeamId: string
    year: number
    /**
     * **走り終わったシーズン**。値付け（今季どれだけ走ったか）と、
     * 見出しの選び分け（干されていたか）の両方がここを読む。
     *
     * ★オフに回すときは `pastSeasons` の最後（＝いま終わった年）を渡すこと。
     *   `beginSeasonDraft` の時点で `currentSeason` は**もう来季の空っぽの器**なので、
     *   それを渡すと全員が「出場0」になり、移籍金も年俸も一律 ×0.6 に潰れます
     *   （実測でオフ1回の移籍金が 1189億 → 712億）。
     */
    season: PlayRateSeason & Pick<Season, 'year'>
    pastSeasons: ArchivedSeason[]
    /** そのクラブの在籍上限。ドラフトで入る人数ぶんを空けてある（海外は ROSTER_MAX） */
    rosterCapFor: (clubId: string) => number
    destinationOf: (clubId: string, player: Player) => Destination
    /** 同じ期間に既に動いた選手。**呼び出し側と共有し、ここで書き足す** */
    excludeIds: Set<string>
    /** 市場全体で何人まで動かすか。**省略＝無制限**（オフの一括処理はこちら） */
    maxMoves?: number
    /**
     * その日の日付。**移籍記録にもニュースにも同じものを使う。**
     * ★以前は既定値が2つに割れていて（記録 2/1・ニュース 11/10）、同じ1件の移籍が
     *   履歴では2月・ニュースでは11月と**9か月ずれて**記録されていました。
     */
    date: string
  },
): TransferMarketResult {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const newsRows: { player: Player; from: MarketClub; to: MarketClub; fee: number; rank: number; benched: boolean }[] = []

  const foreignClubs = allForeignClubs(world.foreignLeagues)
  const foreignById = new Map(foreignClubs.map(c => [c.id, c]))
  const teamById = new Map(world.teams.map(t => [t.id, t]))

  // ── 市場に並ぶクラブ（国内52＋海外180）。自チームは入らない（プレイヤーが決めるので）
  const clubs: MarketClub[] = [
    ...world.teams.filter(t => t.id !== ctx.playerTeamId).map(t => ({
      id: t.id, tier: tierOf(t), domestic: true, name: t.shortName, label: clubLabel(t.id, world.teams) })),
    ...foreignClubs.map(c => ({
      id: c.id, tier: tierOf(c), domestic: false, name: c.name, label: c.name })),
  ]
  if (clubs.length < 2) return { players, teams, foreignLeagues: world.foreignLeagues, records, news: [] }

  // ── お金は1つの帳簿。国内も海外も finance.budget が唯一の置き場所
  //    （海外は finance の無い古いセーブだけ、その年に限り格の年間予算から始める）
  //
  // ★**残高をここで0に丸めないこと。** この帳簿は最後に全クラブへ書き戻すので、
  //   `Math.max(0, …)` を挟むと**マイナスの残高が0になって借金が消えます**。
  //   市場に一度も参加していない自チームまで書き戻しの対象なので、
  //   レースを1つ進めるだけで赤字が帳消しになっていました（2026-08-12 の監査で発見）。
  //   `finance.budget < 0` は補強禁止の条件（`data/economy.ts` の `reinforcementBanned`）で、
  //   `computeNextSeasonBudget` にも「赤字側は DEFICIT_LIMIT まで持ち越す（借金は消えない）」
  //   と書いてあります。丸めるとその決まりが破れます。
  //   赤字のクラブが買えないことは下の `budget[buyClub.id] <= 0` が見ているので、
  //   ここで丸めなくても買う側のふるまいは変わりません。
  const budget: Record<string, number> = {}
  for (const t of world.teams) budget[t.id] = t.finance.budget
  for (const c of foreignClubs) budget[c.id] = c.finance?.budget ?? tierBudget(c)

  // ── 買う順番は「格が上のクラブから」。同格なら手元の資金が多い方から。
  //
  //    ★以前は逆（格が下のクラブから）でした。「弱いクラブが先に選べるようにして、
  //      良い選手が上位クラブへ固まるのを防ぐ」という意図でしたが、**効きすぎて
  //      上位クラブから吸い出す側に回っていました。** 買う側は候補をOVRの高い順に
  //      並べて上から取る（下の `candidates.sort`）ので、**毎回いちばん弱いクラブが
  //      市場でいちばん強い選手を最初に選ぶ**ことになります。実測（3年・232クラブ）：
  //
  //        OVR85+ の76%が格下へ移り、平均の格が 6.7 → 8.9 とずり落ちる
  //        OVRと格の相関が -0.637 → -0.521 と**年々バラける**（強い選手ほど格上、が崩れる）
  //
  //      向きを変えるとOVR85+は 4.3 → 4.2 とその場に留まり、相関は -0.648 と**締まります**。
  //      オーナー指摘「なんで格下に流れるの？意味わからないやろ」（2026-08-14）。
  //
  //    ★上位クラブへ固まるのを防ぐのは、この順番ではなく**在籍上限**（`rosterCapFor`）と
  //      **1回に獲れる人数**（下の `2 + 2 * tierStrength`）の仕事です。
  const buyers = [...clubs].sort((a, b) => (a.tier - b.tier) || (budget[b.id] - budget[a.id]))

  // ── 各クラブの名簿（序列順）。**毎回 players を絞り直さないこと。**
  //    232クラブ × 6,000人を買うたびに走査すると、1回の市場で数億回の比較になります
  //    （実測：オフ1回が5分でも終わらなくなりました）。動いた2クラブだけ差し替える
  const rosters = new Map<string, Player[]>()
  for (const c of clubs) rosters.set(c.id, [])
  for (const p of players) {
    if (p.status !== 'active') continue
    rosters.get(p.teamId)?.push(p)
  }
  for (const arr of rosters.values()) arr.sort(comparePlayers('ovr'))
  // 格を引く材料は1回だけ組む（クラブ232件の配列を買うたびに作り直さない）
  const tieredClubs = allTieredClubs(world.teams, world.foreignLeagues)

  const purchases: Record<string, number> = {}
  const sellCounts: Record<string, number> = {}
  const needsOf = new Map(clubs.map(c => [c.id, new Set(cpuSpecialtyNeeds(c.id, players))]))

  // 「出場機会を求めて出ていく人」かどうか（見出しの選び分けだけに使う）。
  // 数はレース結果から数え直す1本（utils/careerStats）
  const lastSeason = ctx.pastSeasons[ctx.pastSeasons.length - 1]
  const thisCounts = buildCareerCounts([ctx.season])
  const prevCounts = buildCareerCounts([lastSeason])
  const thisRaces = (ctx.season.races ?? []).filter(r => r.results).length
  const prevRaces = (lastSeason?.races ?? []).filter(r => r.results).length

  // ── **今季どれだけ走っているか。** 移籍の判断に渡す出場率は `utils/playRate` 1本
  //    （CLAUDE.md「移籍の判断に出場率を渡すところは必ずここを通すこと」）。
  //
  //    ★以前ここが `playerConsentToMove(..., 0.5, 0, ...)` のベタ書きでした。
  //      `teamRaces` が 0 なので `appraiseMove` の
  //        starterNow = races >= 3 && frac >= 0.5
  //      が**常に false** になり、オーナー指示（2026-08-14「格下げてまでエースに
  //      なりたいやついないだろ。海外でやってる久保がいきなりJ3に移籍するか？」）で
  //      入れた関門 `tooFarDown` が**世界中で一度も発火していませんでした**。
  //      同じ理由で「主力として起用されており移籍を望んでいない」（`isDataKeyPlayer`）も
  //      死んでいました。実測（232クラブ5800人・1年）：格下へ動いた561件のうち
  //      **131件（23.4%）が本来は止まる**（OVR85+が58件、78-84が72件）。
  //
  //    ★`ctx.season.races` を直に数えないこと。自分の部の日程しか入っていないので、
  //      他の部と海外の212クラブが全員「出場0」になります。`playRateOf` が
  //      裏の部（divisionRaces）と海外リーグ（foreignRaces）まで見る唯一の入口です。
  //    ★選手ごとに1回だけ引く。1回の市場で数千回呼ばれるので、毎回レース結果を
  //      走査すると市場が終わらなくなります（動いた選手は excludeIds で二度と来ない）。
  const playRateCache = new Map<string, { fraction: number; teamRaces: number }>()
  const playRateFor = (p: Player) => {
    const hit = playRateCache.get(p.id)
    if (hit) return hit
    const v = playRateOf(p.id, p.teamId, ctx.season, world.teams, world.foreignLeagues, lastSeason)
    playRateCache.set(p.id, v)
    return v
  }

  // ── 出せる選手の一覧は**出す側だけで決まる**（買う側が誰かに関係しない）。
  //    232クラブぶんを買うたびに組み直していたので、1回の市場で数百万個の
  //    オブジェクトを作っては捨てていた。動いたクラブのぶんだけ作り直す。
  //    ★OVRは並べるたびに数え直さない。名簿が動かないかぎり値は変わらないので、
  //      一覧を作るときに1回だけ数えて持たせる（並べ替えは O(n log n) 回引く）
  type SellCandidate = { p: Player; sellClub: MarketClub; sellRoster: Player[]; rank: number; surplus: boolean; ovr: number }
  const sellCandidatesOf = (sellClub: MarketClub): SellCandidate[] => {
    if ((sellCounts[sellClub.id] ?? 0) >= SELL_PER_CLUB) return []
    const sellRoster = rosters.get(sellClub.id)!
    // ②薄いクラブからは1人も出さない（下限は data/rosterRules 1本）
    if (sellRoster.length <= CPU_SELL_FLOOR) return []
    // ②エース(1番手)だけ保護。それ以外は主力でも対象（割増と本人同意で守る）。
    //   ★ここに「上位10人まで」のような蓋を付けないこと。格上クラブの15番手が
    //     格下でスタメンになる、という当たり前の移籍が丸ごと消えます
    //   ★序列は**絞り込む前**に付けること。あとから index を取ると、
    //     借りている選手が1人混ざっただけで以降の序列が全部1つずつズレます
    return sellRoster
      .map((p, i) => ({ p, sellClub, sellRoster, rank: i + 1, surplus: isSurplus({ squadRank: i + 1 }), ovr: ovr(p) }))
      .slice(1)
      // 借りている選手は出せない（保有権が無い）。
      // ★契約が長く残っている選手は、出す側が渋る（`willRelease`）。壁ではなく坂で、
      //   残り5年でも0ではない。詳しくは utils/transferDecision の willRelease
      // ★移籍したばかりの選手は出せない（`TRANSFER_LOCK_YEARS`＝2年。レンタルは別）。
      //   ここが1年だったころ、2回目以降の移籍の**70.1%が「前の年に移ったばかり」**だった
      .filter(({ p }) => isOwnedBy(p, sellClub.id) && !ctx.excludeIds.has(p.id)
        && !isTransferLocked(p, ctx.year) && willRelease(p, ctx.date))
  }
  const sellCandidateCache = new Map<string, SellCandidate[]>(clubs.map(c => [c.id, sellCandidatesOf(c)]))

  // ── 市場に出ている選手を1本に並べたもの。**買う側が誰かに関係しない**ので、
  //    232クラブぶんを買うたびに繋ぎ直さない（クラブ232件の配列と、数千件の
  //    連結を毎回作っていた）。名簿が動いた（＝移籍が成立した）ときだけ繋ぎ直す。
  //    並びは clubs の順（＝今までと同じ）。並べ替えは安定なので結果も変わらない。
  let pool: SellCandidate[] = []
  const rebuildPool = () => {
    pool = []
    for (const c of clubs) {
      const arr = sellCandidateCache.get(c.id)
      if (arr) for (const cand of arr) pool.push(cand)
    }
  }
  rebuildPool()

  let moves = 0
  const buyOnePlayer = (buyClub: MarketClub): boolean => {
    if (ctx.maxMoves != null && moves >= ctx.maxMoves) return false
    // 1回の市場で獲れる人数は格から（格1が4人、格20が2人）。強さの物差しは格1本
    if ((purchases[buyClub.id] ?? 0) >= 2 + Math.round(2 * tierStrength(buyClub.tier))) return false
    if (budget[buyClub.id] <= 0) return false
    const buyRoster = rosters.get(buyClub.id)!
    // 買えるのは在籍上限に届いていないクラブだけ。**上限の数え方は1本**（rosterCapFor）。
    // ★ここに「25人まで」のような2つ目の蓋を置かないこと。国内は解雇で23人まで減るので
    //   気づきませんが、海外クラブは解雇をしないので25〜28人のまま＝**買う側から丸ごと消えます**
    if (buyRoster.length >= ctx.rosterCapFor(buyClub.id)) return false
    const needs = needsOf.get(buyClub.id)!

    // ①「必要だから動く」の関門（移籍金を払う移籍なので穴のときだけ）。
    //   自分のクラブは飛ばす（前は 232件の配列を作り直して除いていた）
    const candidates: SellCandidate[] = []
    for (const cand of pool) {
      if (cand.sellClub.id === buyClub.id) continue
      if (needsPlayer(buyRoster, cand.p)) candidates.push(cand)
    }
    // 欲しいタイプ・OVRの高い選手を優先
    candidates.sort((a, b) => (Number(needs.has(b.p.specialty)) - Number(needs.has(a.p.specialty))) || (b.ovr - a.ovr))

    for (const { p: target, sellClub, sellRoster, rank, surplus } of candidates) {
      // ③余剰は市場価値どおり、主力の引き抜きは割増。年俸も余剰かどうかで変わる。
      //   ★**今季どれだけ走ったかを移籍金にも渡すこと**（`calcTransferValue` の第2引数）。
      //     以前は同じ関数の中で年俸にだけ渡していて、移籍金は出場0の選手も
      //     フル出場の選手も同じ額でした（式にはあるのに誰も渡していなかった）。
      //     実測で OVR85 の移籍金が 1.85億〜3.72億 の幅を持つところ、全部 3.08億に潰れていた
      // ★**出場は「そのクラブが走っている日程」で数える**（utils/playRate 1本）。
      //   `perfOf(ctx.season, ...)` は `season.races`＝**自分の部の日程しか見ない**ので、
      //   他の部と海外の212クラブは全員「今季0戦」として値段が付いていました。
      const { fraction: tgtFrac, teamRaces: tgtRaces } = playRateFor(target)
      const tgtPerf = seasonPerfProfile(target.id,
        clubSeasonRaces(ctx.season, target.teamId, world.teams, world.foreignLeagues), tgtRaces)
      const fee = transferFeeFor(target, surplus, tgtPerf)
      const newSalary = surplus ? faMarketSalary(target, tgtPerf)
        : acquisitionDesiredSalary(target, 'scout', tgtFrac, tgtRaces, tgtPerf)
      if (budget[buyClub.id] < fee + newSalary) continue
      // ④本人が行くか。**余剰でも聞く**（出番が無いから必ず頷く、とは限らない）。
      //   主力の引き抜きだけクラブが割増で合意済み＝clubBlessed で「主力だから残りたい」を外す
      const srcTier = tierOfPlayerClub(target.teamId, tieredClubs)
      if (!playerConsentToMove(target, ctx.destinationOf(buyClub.id, target), srcTier,
        tgtFrac, tgtRaces, 0, !surplus).ok) continue

      // 所属・加入年・移籍履歴・移籍リストの札はがしは movePlayer 1本。
      // お金だけは上の帳簿で見ているので money: false（国内側だけ二重に動くのを防ぐ）
      const moved = movePlayer({ players, teams }, target.id, buyClub.id, {
        year: ctx.year,
        date: ctx.date,
        fee, money: false,
        toName: buyClub.domestic ? undefined : buyClub.name,
        contract: { annualSalary: newSalary, yearsLeft: newContractYears(target, ctx.year) },
      })
      if (!moved.ok) continue

      ctx.excludeIds.add(target.id)
      purchases[buyClub.id] = (purchases[buyClub.id] ?? 0) + 1
      sellCounts[sellClub.id] = (sellCounts[sellClub.id] ?? 0) + 1
      budget[buyClub.id] -= fee
      budget[sellClub.id] += fee
      players = moved.players.map(p =>
        p.id !== target.id ? p : { ...p, contract: { ...p.contract, faEligibleYear: ctx.year + 2 } })
      teams = moved.teams
      // 名簿は動いた2クラブだけ差し替える（全体を組み直さない）
      const movedPlayer = players.find(p => p.id === target.id)!
      rosters.set(sellClub.id, sellRoster.filter(p => p.id !== target.id))
      rosters.set(buyClub.id, [...buyRoster, movedPlayer].sort(comparePlayers('ovr')))
      // 名簿が動いた2クラブだけ、出せる選手の一覧を作り直す
      sellCandidateCache.set(sellClub.id, sellCandidatesOf(sellClub))
      sellCandidateCache.set(buyClub.id, sellCandidatesOf(buyClub))
      rebuildPool()
      if (moved.record) records.push(moved.record)
      moves++
      newsRows.push({
        player: target, from: sellClub, to: buyClub, fee, rank,
        benched: seeksPlayingTime({
          squadRank: rank, age: target.age,
          races: thisCounts.get(target.id)?.totalRaces ?? 0, teamRaces: thisRaces,
          prevRaces: prevCounts.get(target.id)?.totalRaces, prevTeamRaces: prevRaces }),
      })
      return true
    }
    return false
  }

  roundRobin(buyers, buyOnePlayer)
  if (moves === 0) return { players, teams, foreignLeagues: world.foreignLeagues, records, news: [] }

  // ── お金の書き戻し。**ここを飛ばすと使っても減らない**
  const nextTeams = teams.map(t =>
    budget[t.id] === undefined || budget[t.id] === t.finance.budget
      ? t : { ...t, finance: { ...t.finance, budget: budget[t.id] } })
  const nextLeagues = world.foreignLeagues.map(l => ({
    ...l,
    clubs: l.clubs.map((c: ForeignClub) =>
      budget[c.id] === undefined || budget[c.id] === (c.finance?.budget ?? tierBudget(c))
        ? c : { ...c, finance: { ...c.finance, budget: budget[c.id] } }),
  }))

  return { players, teams: nextTeams, foreignLeagues: nextLeagues, records, news: buildNews() }

  // ── 見出し。**判断はここまでで終わっていて、ここから先は文面だけ**
  function buildNews(): NewsItem[] {
    const date = ctx.date
    return [...newsRows]
      .sort((a, b) => ovr(b.player) - ovr(a.player))
      .slice(0, NEWS_MAX)
      .map(({ player: p, from, to, fee, rank, benched }) => {
        const relatedIds = [p.id]
        const crossBorder = from.domestic !== to.domestic
        const big = isBigClub(to.domestic ? teamById.get(to.id) : foreignById.get(to.id))
        if (crossBorder) {
          // 日本から世界最高峰へ渡った。列島が沸くやつ
          if (!to.domestic && big && ovr(p) >= MAJOR_NEWS_OVR) {
            return {
              date, category: 'trade' as const, relatedIds, major: true,
              headline: overseasBreakthroughHeadline({ playerName: p.name, playerOvr: ovr(p), toName: to.name, fee }),
            }
          }
          return {
            date, category: 'trade' as const, relatedIds, major: ovr(p) >= MAJOR_NEWS_OVR || big,
            headline: crossBorderHeadline({
              playerName: p.name, playerOvr: ovr(p), fee, dir: to.domestic ? 'in' : 'out',
              stepUp: !to.domestic && isStepUp(teamById.get(from.id), foreignById.get(to.id)),
              fromName: from.name, toName: to.name }),
          }
        }
        // 序列から落ちて出番が無くなった選手は、その事情がわかる見出しにする
        return {
          date, category: 'trade' as const, relatedIds,
          major: ovr(p) >= MAJOR_NEWS_OVR || big || isBigClub(from.domestic ? teamById.get(from.id) : foreignById.get(from.id)),
          headline: benched
            ? seekPlayingTimeHeadline({ playerName: p.name, age: p.age, squadRank: rank, fromLabel: from.label, toLabel: to.label })
            : transferHeadline({ playerName: p.name, playerOvr: ovr(p), fee, fromLabel: from.label, toLabel: to.label }),
        }
      })
  }
}
