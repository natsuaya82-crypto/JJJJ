import type { Player, TransferBid, ExpiredNegotiation } from '../types'
import { keyPlayerStatus, calcTransferValue } from './playerUtils'
import { bidThreshold, BID_COUNTER_RATIO, listedThreshold, LISTED_COUNTER_RATIO, roundFee } from '../data/economy'

// 入札(移籍金オファー)の合否を出す1本。
// 以前は gameStore の中に「本編の1戦を進めたとき」と「サブの1戦を進めたとき」で
// 同じ処理が2つ手書きされていて、しかも中身が食い違っていた：
//   ・主力ガード(locked)に当たったとき、片方は黙って却下するだけ、
//     もう片方は通知を出して1年ロックしていた（同じ入札が進め方で結果が変わる）
//   ・費用合意の放置による失効は片方にしか無かった
//   ・出品中の受諾ラインの数字が両方に手書きで、しかも逆提示額に下限が無く0円になり得た
// 判定はここだけに置き、呼ぶ側は結果を受け取るだけにする。

// 費用合意のあと、この試合数ぶん放置すると破談になる
export const FEE_ACCEPTED_EXPIRE_RACES = 5
// 逆提示できる上限の回数
export const BID_MAX_ROUND = 3

type SeasonArg = Parameters<typeof keyPlayerStatus>[1]
type PastArg = Parameters<typeof keyPlayerStatus>[2]

export type BidContext = {
  players: readonly Player[]
  // 移籍リストに出ている選手（クラブ希望額つき）
  listings: readonly { playerId: string; askingPrice: number }[]
  currentSeason: SeasonArg
  pastSeasons: PastArg
  // いま何戦目か
  raceIndex: number
  // 判定の揺れ。テストから固定するためだけの入口で、通常は渡さない
  rand?: () => number
}

export type BidResult = {
  bid: TransferBid
  // 通知に出す「流れた交渉」。ここが入っている＝その選手は来季まで交渉できなくなる
  expired: ExpiredNegotiation | null
}

export function resolveBid(bid: TransferBid, ctx: BidContext): BidResult {
  const rand = ctx.rand ?? Math.random
  const keep: BidResult = { bid, expired: null }

  // 費用合意・逆提示の途中
  if (bid.status === 'fee_accepted' || bid.status === 'countered') {
    const pl = ctx.players.find(p => p.id === bid.playerId)
    // 対象が他所へ移っていたら破談（永久に残るのを防ぐ）。相手が消えただけなので通知は出さない
    if (!pl || pl.teamId !== bid.targetTeamId) return { bid: { ...bid, status: 'failed' }, expired: null }
    // 費用合意から放置で自動失効
    if (bid.status === 'fee_accepted' && bid.feeAcceptedAtRace != null && ctx.raceIndex - bid.feeAcceptedAtRace >= FEE_ACCEPTED_EXPIRE_RACES) {
      return { bid: { ...bid, status: 'failed' }, expired: { id: bid.id, playerId: pl.id, playerName: pl.name, kind: 'bid' } }
    }
    return keep
  }

  if (bid.status !== 'pending') return keep

  const player = ctx.players.find(p => p.id === bid.playerId)
  if (!player || player.teamId !== bid.targetTeamId) return { bid: { ...bid, status: 'failed' }, expired: null }

  // 出品中(移籍リスト掲載)：クラブが自分で出した希望額が受諾ライン。
  // 主力割増は乗せない（クラブ自ら売りに出している額なので）
  const listed = ctx.listings.find(l => l.playerId === bid.playerId)
  if (listed) {
    const ask = listed.askingPrice
    if (bid.offeredFee >= listedThreshold(ask, rand())) {
      return { bid: { ...bid, status: 'fee_accepted', feeAcceptedAtRace: ctx.raceIndex }, expired: null }
    }
    if (bid.offeredFee >= ask * LISTED_COUNTER_RATIO && bid.round < BID_MAX_ROUND) {
      return { bid: { ...bid, status: 'countered', counterFee: roundFee(ask, 1_000_000) }, expired: null }
    }
    return { bid: { ...bid, status: 'rejected' }, expired: null }
  }

  // 主力ガード：出場データ(複数年)＋ECL経験で判定
  const kStatus = keyPlayerStatus(player, ctx.currentSeason, ctx.pastSeasons)
  if (kStatus === 'locked') {
    // いくら積んでも無理な相手。黙って却下すると「入札が消えた」ようにしか見えないので必ず通知する
    return { bid: { ...bid, status: 'rejected' }, expired: { id: bid.id, playerId: player.id, playerName: player.name, kind: 'bid' } }
  }

  // 受諾ラインは economy.bidThreshold の1本（入札画面の成立確率表示と共有）。判定は±10%の揺れ
  const threshold = bidThreshold(calcTransferValue(player), player.contract.yearsLeft <= 1, kStatus === 'key') * (0.9 + rand() * 0.2)
  if (bid.offeredFee >= threshold) {
    return { bid: { ...bid, status: 'fee_accepted', feeAcceptedAtRace: ctx.raceIndex }, expired: null }
  }
  if (bid.offeredFee >= threshold * BID_COUNTER_RATIO && bid.round < BID_MAX_ROUND) {
    return { bid: { ...bid, status: 'countered', counterFee: roundFee(threshold, 1_000_000) }, expired: null }
  }
  return { bid: { ...bid, status: 'rejected' }, expired: null }
}
