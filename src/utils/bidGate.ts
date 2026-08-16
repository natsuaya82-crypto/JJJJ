/**
 * 【入札・レンタル申請が「出せるか」と、出せないときの理由】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「シーズン中にオファー出したけど、何レース経ってもオファーが来ないし、
 *     チャットに〇〇にオファー中の文字がないって話なんだけど」
 *
 *   `submitTransferBid` には**何も返さずに終わる早期リターンが6つ**ありました。
 *   画面はシートを閉じるだけなので、出したように見えて**札が1枚もできません**。
 *   札が無いので「出したオファー」にも出ず、決着する対象も無いので返事も永久に
 *   来ません。**返事が来ないのではなく、そもそも出ていなかった**という状態です。
 *
 *   しかも入口が2つあり、止め方が食い違っていました。
 *
 *   | 入口 | 押す前に見ていたもの |
 *   |---|---|
 *   | 移籍市場（`TransferPage`） | 入札中・移籍直後だけ（**赤字ペナルティは FA の枝にしか無い**） |
 *   | 他クラブのページ（`opponentMenu`） | **何も見ていない**（常に押せる） |
 *
 *   実際に黙って捨てられていたのは次の6つ。どれも珍しくありません——とくに
 *   **移籍して2年以内**（`TRANSFER_LOCK_YEARS`）と**残高マイナス**は普通に起きます。
 *
 * ■この形にした理由
 *   **「押せるか」と「受け付けるか」を同じ関数から出します。** 画面が独自に条件を
 *   組み直すと、また片方だけ緩い状態に戻ります（`signingBanned` が `TransferPage` に
 *   手書きされていたのがまさにそれ）。ここは理由の文字まで返すので、
 *   ボタンの見出しにそのまま出せます。
 */
import type { Player } from '../types'
import { reinforcementBanned } from '../data/economy'
import { canBePoached, eligibilityCtx, isTransferLocked } from './transferEligibility'

/** 同じ選手に入札できる回数（今季） */
export const MAX_BIDS_PER_PLAYER = 3

/** 借りられる人数 */
export const LOAN_SLOTS = 3

/** `eligibilityCtx` に渡せるシーズン（材料は向こう1本で作る。ここで手書きしないこと） */
type GateSeason = Parameters<typeof eligibilityCtx>[0]

export type BidGateCtx = {
  currentSeason: GateSeason
  /** 自チーム（赤字ペナルティを見る） */
  myTeam: { finance: { budget: number; deficitStreak?: number } } | undefined
  myTeamId: string
  /** 今季その選手に出した入札（決着したものも含めて全部） */
  bidsOnPlayer: readonly { status: string }[]
  /** 借りている人数（レンタルの枠） */
  loanSlotsUsed?: number
  /** その選手にレンタル申請が出ているか */
  loanRequested?: boolean
}

/** いま動いている入札か（＝もう1枚出せない） */
const LIVE = new Set(['pending', 'fee_accepted', 'countered', 'player_neg'])

/**
 * 入札を出せない理由。出せるなら null。
 * **文字はそのままボタンの見出しに出します**（画面で言い換えないこと）。
 */
export function bidBlockReason(p: Player, ctx: BidGateCtx): string | null {
  if (p.teamId === ctx.myTeamId) return '自チームの選手'
  // FA には移籍金の入札ではなく契約オファー（startAcquisitionOffer）を出す
  if (p.teamId === '') return 'FAなので契約オファーで獲得'
  if (ctx.bidsOnPlayer.some(b => LIVE.has(b.status))) return '入札中'
  if (reinforcementBanned(ctx.myTeam)) return '赤字で補強不可'
  // 材料は eligibilityCtx 1本から。**持ち主はその選手のクラブ**（自チームではない）
  const el = eligibilityCtx(ctx.currentSeason, p.teamId)
  if (p.transferLockedUntilYear != null && (el.currentYear ?? 0) < p.transferLockedUntilYear) {
    return '交渉決裂・来季まで交渉不可'
  }
  // canBePoached の中身を分解して、どれで止まったのかを言う。
  // ★判定そのものは transferEligibility 1本のまま（ここで条件を書き足さないこと）
  if (!canBePoached(p, el)) {
    if (p.loan) return 'レンタル中の選手'
    if (p.noSale) return '非売の選手'
    if (p.overseasListed) return '海外挑戦中の選手'
    if (p.pendingRetirementYear != null) return '引退が決まっている選手'
    if (el.retiringIds?.has(p.id)) return '引退を申し出ている選手'
    if (isTransferLocked(p, el.currentYear)) return '移籍したばかりで交渉不可'
    return '交渉できない選手'
  }
  if (ctx.bidsOnPlayer.length >= MAX_BIDS_PER_PLAYER) return `今季の入札は${MAX_BIDS_PER_PLAYER}回まで`
  return null
}

/**
 * レンタル申請を出せない理由。出せるなら null。
 * 入札と条件が違う（**移籍したばかりでもレンタルは通る**・非売は止まる）ので、
 * `submitLoanRequest` が実際に見ているものをそのまま並べる
 */
export function loanBlockReason(p: Player, ctx: BidGateCtx): string | null {
  if (p.teamId === ctx.myTeamId) return '自チームの選手'
  if (p.teamId === '') return 'FAなので契約オファーで獲得'
  if (p.loan) return 'レンタル中の選手'
  if (ctx.loanRequested) return 'レンタル要請中'
  if (reinforcementBanned(ctx.myTeam)) return '赤字で補強不可'
  if ((ctx.loanSlotsUsed ?? 0) >= LOAN_SLOTS) return `レンタル枠が満杯（${LOAN_SLOTS}/${LOAN_SLOTS}）`
  return null
}
