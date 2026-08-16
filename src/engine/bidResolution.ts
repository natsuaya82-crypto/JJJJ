// 出した入札（移籍金オファー）への応答（store/slices/raceSlice の runRace から切り出し）。
//
// **判定そのものは utils/transferBid の resolveBid 1本**。サブの1戦を進めたときも
// 同じ関数を呼ぶので、進め方で結果が変わらない。ここがやるのは
// 「全部の入札を順に通し、失効・競り負けを仕分ける」ところだけ。
//
// ★取り合いの相手（rivals）は utils/transferRivals の rivalClubsFor 1本で数える。
//   クラブは「強いから」ではなく「必要だから」動く（needsPlayer / wouldMakeLineup）。
//   誰が参加するかは需要、誰が勝つかは格（出せる額は格の年間予算から）。
// ★競り負けは金額の問題なので、来季まで交渉不可のロックはかけない。
import type { ExpiredNegKind, ExpiredNegotiation, ForeignLeague, Player, Race, Season, Team, TransferBid, TransferListing } from '../types'
import { resolveBid, type BidContext } from '../utils/transferBid'
import { rivalClubsFor } from '../utils/transferRivals'
import type { Destination } from '../utils/transferDecision'

/**
 * **入札が終わったとき、その選手と来季まで交渉できなくするか。唯一の決まり。**
 *
 * 来季まで止めるのは「話が決裂した」ときだけ——主力ガードで門前払い（`bid`）や、
 * 費用合意を放置して流れたとき。
 *
 * 止めないのは**そのときの事情**で終わったもの：
 *   ・`bid_rejected` … 額が足りなかった（積み直せばいい）
 *   ・`outbid`       … 競り負けた（金額の問題）
 *   ・`bid_gone`     … 相手が他所へ移った（こちらは何もしていない）
 *
 * ★**呼ぶ側で書かないこと。** 本編の1戦（`resolveTransferBids`）とサブの1戦
 *   （`competitionSlice`）に別々に書いてあり、**サブ側は競り負けまで来季まで
 *   ロックしていました**（本編は外していたのに）。同じ入札が、進め方によって
 *   違う結果になっていた。
 */
export function locksNegotiation(kind: ExpiredNegKind | undefined): boolean {
  return !NO_LOCK_KINDS.has(kind ?? 'bid')
}
const NO_LOCK_KINDS = new Set<ExpiredNegKind>(['outbid', 'bid_rejected', 'bid_gone'])

export function resolveTransferBids(params: {
  bids: TransferBid[]
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  listings: TransferListing[]
  currentSeason: Season
  pastSeasons: BidContext['pastSeasons']
  /** 今季の日程（結果入り）。実績の参照に使う */
  races: Race[]
  /** レース通算数（期限の判定に使う） */
  raceClock: number
  playerTeamId: string
  destinationOf: (clubId: string, player: Player) => Destination
}): {
  bids: TransferBid[]
  expiredNegs: ExpiredNegotiation[]
  expiredPlayerIds: string[]
  outbidMoves: { playerId: string; toTeamId: string; fee: number; playerName: string; clubName: string }[]
} {
  const { bids, players, teams, foreignLeagues, listings, currentSeason, pastSeasons, races, raceClock, playerTeamId, destinationOf } = params
  // 入札(移籍金オファー)の応答。判定は utils/transferBid の resolveBid 1本。
  // サブの1戦を進めたときも同じ関数を呼ぶので、進め方で結果が変わらない
  const bidExpiredNegs: ExpiredNegotiation[] = []
  const bidExpiredPlayerIds: string[] = []
  // 同じ選手を狙う他クラブ。買う側も取り合いになる（売る側だけ5クラブなのは非対称だった）。
  //
  // クラブは「強いから」ではなく「必要だから」動く。山が薄いクラブは山型を狙うし、
  // 山が足りているクラブは同じ山型のエースが出ても手を出さない。
  //   ・そのタイプが必要（utils/squadNeeds.ts。頭数が足りない or 今いる同タイプより強い）
  //   ・そのクラブで7区間に入れる＝実際に走れる（弱い専門家を穴埋めで買わない）
  //   ・ロスターに空きがある（ROSTER_MAX）
  //   ・本人がそのクラブへ行く気になる（utils/transferDecision.ts の1本）
  // 需要で絞る前は「強い選手は全クラブが欲しがる」状態で、1人に43クラブが群がっていた。
  //
  // 出せる額は「格の年間予算の TRANSFER_BUDGET_SHARE まで」。手元の資金がそれより
  // 少なければそちらが上限になる。**誰が参加するかは需要、誰が勝つかは格**。
  // 以前は市場価値×1.4の頭打ちで、全クラブが同額を出すので競売になっていなかった
  const rivalsFor = (target: Player) => rivalClubsFor(target, {
    teams: teams, players: players, playerTeamId,
    foreignLeagues: foreignLeagues ?? [],
    destinationOf: (clubId, p) => destinationOf(clubId, p) })
  // 競り負けた選手（相手クラブへ実際に移す）
  const outbidMoves: { playerId: string; toTeamId: string; fee: number; playerName: string; clubName: string }[] = []
  const processedBids = bids.map(bid => {
    const target = players.find(p => p.id === bid.playerId)
    const r = resolveBid(bid, {
      players: players,
      listings: listings,
      currentSeason: { year: currentSeason.year, races: races, eclSeries: currentSeason.eclSeries },
      pastSeasons: pastSeasons,
      raceIndex: raceClock,
      rivals: bid.status === 'pending' && target ? rivalsFor(target) : undefined })
    if (r.expired) {
      bidExpiredNegs.push(r.expired)
      // ★**来季まで交渉できなくなるのは「決裂した」ときだけ。**
      //   金額が足りなかった（`bid_rejected`）・競り負けた（`outbid`）・
      //   相手が他所へ移った（`bid_gone`）は**そのときの事情**なので、
      //   もう一度出せる。ここを分けずに全部ロックすると、断られた瞬間に
      //   その選手とは1年まったく話せなくなる
      if (locksNegotiation(r.expired.kind)) bidExpiredPlayerIds.push(r.expired.playerId)
    }
    if (r.outbidBy && target) {
      outbidMoves.push({ playerId: target.id, toTeamId: r.outbidBy.clubId, fee: r.outbidBy.fee, playerName: target.name, clubName: r.outbidBy.name })
    }
    return r.bid
  })
  return { bids: processedBids, expiredNegs: bidExpiredNegs, expiredPlayerIds: bidExpiredPlayerIds, outbidMoves }
}
