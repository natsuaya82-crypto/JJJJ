// トレードの「釣り合っているか」の判断を、ここ1箇所にまとめたもの。
//
// ■なぜ要るのか
//   同じ判断が5箇所に手書きされていて、しかも全部ちがっていた。
//     ・tradePlayer（成立）        … 下限0.92だけ。上限なし
//     ・proposeTrade（チャット交渉）… 下限0.95／門前払い0.55。上限なし
//     ・acceptTradeCounter（逆提示を飲む）… 判定なし（tradePlayer任せ）
//     ・acceptTradeOffer（相手からの打診を飲む）… 判定が1つも無い
//     ・CPUが打診を作るところ       … 0.95〜1.30の帯＋OVR差3以内（ここだけ両側を見ていた）
//   上限が無いのはこちら（GM）が損をする側だけなので、**こちらが一方的に持ち出す取引が
//   いくらでも通っていた**。「90の30歳を70の22歳と交換」が成立していたのはこれ。
//
// ■もう1つの原因（主力の割増が片側にしか掛かっていなかった）
//   「主力は1.5倍の価値を要求する」という割増が、相手から**もらう**選手にしか掛かっておらず、
//   こちらが**出す**選手には掛かっていなかった。つまりこちらの主力だけ額面より安く数えられていた。
//   割増は両側に掛ける。出す側が主力ならその分ちゃんと重く数える。
//
// ■もう1つの原因（年齢の減点が実際の衰えより急だった）
//   市場価値の年齢補正は 28歳から下がり始めて 30歳で0.80、32歳で0.60だった。
//   ところが実際の成長処理(growPlayer)のピークは27前後で、下降が始まるのは31歳。
//   「30歳の90」が「22歳の70」と同じ値段になっていたのは、この食い違いのぶんが大きい。
//   → playerUtils.calcTransferValue の年齢補正を growPlayer に合わせて寝かせた。
//
// 新しい条件を足すときは必ずこのファイルに足すこと。
// 呼び出し側に 0.92 や 1.5 を直接書かないこと（scripts/check-trade-value.ts が検出する）。
import type { Player } from '../types'
import { calcTransferValue, keyPlayerStatus, ovr, seasonAppearances } from './playerUtils'
import type { RaceLike } from './playerUtils'

/** 相手が「こちらが手放すものに見合わない」と断る下限 */
export const TRADE_MIN_RATIO = 0.92
/** チャット交渉で相手が即OKする下限（下限より少しだけ厳しい） */
export const TRADE_OK_RATIO = 0.95
/** これを下回ると話にならない（門前払い） */
export const TRADE_HARD_NO_RATIO = 0.55
/** これを超えると、こちらの持ち出しが大きすぎて成立させない */
export const TRADE_MAX_RATIO = 1.30
/** 主力の割増。両側に同じだけ掛ける */
export const KEY_PLAYER_PREMIUM = 1.5
/** よく出ている選手の上乗せ（出場率×これ） */
export const ACTIVITY_MAX_BONUS = 0.4
/** 出す最上位と、もらう最上位のOVR差の上限。これを超えたら額面で見合わない */
export const TRADE_OVR_SLACK = 8

export type TradeValueCtx = {
  races: readonly RaceLike[]
  teamRaces: number
  currentSeason: Parameters<typeof keyPlayerStatus>[1]
  pastSeasons: Parameters<typeof keyPlayerStatus>[2]
}

/** よく出場している選手の価値プレミアム（1.0〜1.4） */
export function activityFactor(p: Player, ctx: TradeValueCtx): number {
  const apps = seasonAppearances(p.id, ctx.races)
  const frac = ctx.teamRaces > 0 ? apps / ctx.teamRaces : 0
  return 1 + frac * ACTIVITY_MAX_BONUS
}

/** 主力なら 1.5、そうでなければ 1。出す側・もらう側の区別なく同じものを使う */
export function keyFactor(p: Player, ctx: TradeValueCtx): number {
  return keyPlayerStatus(p, ctx.currentSeason, ctx.pastSeasons) !== 'open' ? KEY_PLAYER_PREMIUM : 1
}

/** トレードで数えるその選手の値打ち（市場価値 × 出場 × 主力割増） */
export function tradeValueOf(p: Player, ctx: TradeValueCtx): number {
  return calcTransferValue(p) * activityFactor(p, ctx) * keyFactor(p, ctx)
}

export type TradeBalance = { ok: boolean; reason?: string }

/**
 * 「こちらが一方的に損をしていないか」だけを見る。
 *
 * ・上振れ（出しすぎ）… 相手が得をしすぎる取引は成立させない。
 *   この上限が無かったせいで「額面で明らかに損な交換」が全部通っていた
 * ・OVR差            … 数を足して値段だけ合わせた交換を止める。
 *   出す最上位より、もらう最上位が TRADE_OVR_SLACK 以上低ければ額面で見合わない
 *
 * 相手から来た打診を飲むときは、相手が損をするぶんには止める理由が無いので、
 * 下限（相手が断る側）は見ずにこちらだけを使う
 */
export function tradeNotLopsided(
  offeredVal: number, requestedVal: number,
  offeredPlayers: readonly Player[] = [], requestedPlayers: readonly Player[] = [],
): TradeBalance {
  if (offeredVal > requestedVal * TRADE_MAX_RATIO) {
    return { ok: false, reason: 'その条件はそちらの持ち出しが大きすぎる。釣り合う形にして出し直してくれ。' }
  }
  if (offeredPlayers.length > 0 && requestedPlayers.length > 0) {
    const outTop = Math.max(...offeredPlayers.map(ovr))
    const inTop = Math.max(...requestedPlayers.map(ovr))
    if (inTop < outTop - TRADE_OVR_SLACK) {
      return { ok: false, reason: 'その選手を出して、これしか戻らないのは額面で見合わない。' }
    }
  }
  return { ok: true }
}

/**
 * 両サイドの値打ちが釣り合っているか。**上下どちらにもはみ出したら不成立**。
 * 下限は相手（受け取る側）が断る線、上限と OVR差 は tradeNotLopsided と同じ。
 */
export function tradeBalance(
  offeredVal: number, requestedVal: number,
  offeredPlayers: readonly Player[] = [], requestedPlayers: readonly Player[] = [],
): TradeBalance {
  if (requestedVal <= 0) return { ok: false, reason: 'こちらが渡すものが指定されていない。' }
  if (offeredVal < requestedVal * TRADE_MIN_RATIO) return { ok: false, reason: 'こちらが手放すものに見合わない。' }
  return tradeNotLopsided(offeredVal, requestedVal, offeredPlayers, requestedPlayers)
}
