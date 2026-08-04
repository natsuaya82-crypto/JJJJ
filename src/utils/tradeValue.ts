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
// ■値段の物差しは2つある。混ぜないこと
//   ① 額面（faceValueOf）… その選手そのものの市場価値。
//      「この交換が損か得か」は**必ずこちらで見る**。上限・OVR差の判定は全部これ。
//   ② 言い値（askingValueOf）… 額面に「よく出ている」「主力だ」の上乗せを掛けたもの。
//      持ち主が手放すのを渋る分。**相手が首を縦に振るか**の判定だけに使う。
//
//   最初この2つを混ぜて、上限の判定にも上乗せ込みの値を使ってしまった。すると
//     ・CPUが打診を作るのは額面（上乗せ無し）／こちらが飲むかの判定は上乗せ込み
//       → 帯を通って届いた打診が、押した瞬間に上限で弾かれて**黙って消える**
//     ・主力の上乗せ1.5倍と出場の上乗せ1.4倍で最大2.1倍まで開くのに許容は1.30倍
//       → **同じOVR・同じ年齢の1対1すら成立しない**
//   の2つが起きた。物差しを分けたのはこのため。呼び出し側が取り違えられないよう、
//   値の合計もこのファイル（tradeValues）でやる。
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
/** これを超えると、こちらの持ち出しが大きすぎて成立させない（額面で見る） */
export const TRADE_MAX_RATIO = 1.30
/** 主力の割増。持ち主の言い値にだけ掛かる */
export const KEY_PLAYER_PREMIUM = 1.5
/** よく出ている選手の上乗せ（出場率×これ）。持ち主の言い値にだけ掛かる */
export const ACTIVITY_MAX_BONUS = 0.4
/** 出す最上位と、もらう最上位のOVR差の上限。これを超えたら額面で見合わない */
export const TRADE_OVR_SLACK = 8

/**
 * CPUが自分から持ちかける打診の気前の良さ（こちらがもらう額面 ÷ こちらが出す額面）。
 * 上の TRADE_〜 は「こちらが出す ÷ こちらがもらう」向きなので、**逆数の世界の定数**。
 * 同じ数字を使い回すと、片方を調整したときにもう片方が逆向きに動く。
 * 1 / AI_OFFER_GAIN_MIN <= TRADE_MAX_RATIO でないと、CPUが作った打診を
 * こちらが飲もうとした瞬間に上限で弾かれる（scripts/check-trade-value.ts が見張る）
 */
export const AI_OFFER_GAIN_MIN = 0.95
export const AI_OFFER_GAIN_MAX = 1.30

export type TradeValueCtx = {
  races: readonly RaceLike[]
  teamRaces: number
  currentSeason: Parameters<typeof keyPlayerStatus>[1]
  pastSeasons: Parameters<typeof keyPlayerStatus>[2]
}

/** よく出場している選手の上乗せ（1.0〜1.4） */
export function activityFactor(p: Player, ctx: TradeValueCtx): number {
  const apps = seasonAppearances(p.id, ctx.races)
  const frac = ctx.teamRaces > 0 ? apps / ctx.teamRaces : 0
  return 1 + frac * ACTIVITY_MAX_BONUS
}

/** 主力なら 1.5、そうでなければ 1 */
export function keyFactor(p: Player, ctx: TradeValueCtx): number {
  return keyPlayerStatus(p, ctx.currentSeason, ctx.pastSeasons) !== 'open' ? KEY_PLAYER_PREMIUM : 1
}

/** ①額面。損得の判定はすべてこれ */
export function faceValueOf(p: Player): number {
  return calcTransferValue(p)
}

/** ②言い値。持ち主が手放すのを渋る分の上乗せ込み。相手が承知するかの判定にだけ使う */
export function askingValueOf(p: Player, ctx: TradeValueCtx): number {
  return calcTransferValue(p) * activityFactor(p, ctx) * keyFactor(p, ctx)
}

/**
 * トレードの中身。すべて**自チーム（GM）から見た向き**で書く。
 * 指名権や移籍金は選手ではないので上乗せが無く、額面と言い値の区別がない
 */
export type TradeInput = {
  /** こちらが出す選手 */
  outPlayers?: readonly Player[]
  /** こちらがもらう選手 */
  inPlayers?: readonly Player[]
  /** こちらが出す指名権＋支払う移籍金の合計 */
  outExtra?: number
  /** こちらがもらう指名権＋受け取る移籍金の合計 */
  inExtra?: number
}

export type TradeValues = {
  /** こちらが出すぶんの額面 */
  outFace: number
  /** こちらがもらうぶんの額面 */
  inFace: number
  /** 相手が受け取るぶん（＝こちらが出すぶん）。額面で数える */
  cpuGain: number
  /** 相手が手放すぶん（＝こちらがもらうぶん）。相手の言い値で数える */
  cpuLoss: number
  /** 相手から見た旨み。1.0 で釣り合い */
  ratio: number
}

export function tradeValues(input: TradeInput, ctx: TradeValueCtx): TradeValues {
  const outP = input.outPlayers ?? []
  const inP = input.inPlayers ?? []
  const outExtra = input.outExtra ?? 0
  const inExtra = input.inExtra ?? 0
  const outFace = outP.reduce((s, p) => s + faceValueOf(p), 0) + outExtra
  const inFace = inP.reduce((s, p) => s + faceValueOf(p), 0) + inExtra
  const cpuGain = outFace
  const cpuLoss = inP.reduce((s, p) => s + askingValueOf(p, ctx), 0) + inExtra
  return { outFace, inFace, cpuGain, cpuLoss, ratio: cpuLoss > 0 ? cpuGain / cpuLoss : 0 }
}

export type TradeBalance = { ok: boolean; reason?: string }

/**
 * 「こちらが一方的に損をしていないか」だけを見る。**額面だけで判定する**。
 *
 * ・上振れ（出しすぎ）… 相手が得をしすぎる取引は成立させない。
 *   この上限が無かったせいで「額面で明らかに損な交換」が全部通っていた
 * ・OVR差            … 数を足して値段だけ合わせた交換を止める。
 *   出す最上位より、もらう最上位が TRADE_OVR_SLACK 以上低ければ額面で見合わない
 *
 * 相手から来た打診を飲むときは、相手が損をするぶんには止める理由が無いので、
 * 下限（相手が断る側）は見ずにこちらだけを使う
 */
export function tradeNotLopsided(input: TradeInput, ctx: TradeValueCtx): TradeBalance {
  const { outFace, inFace } = tradeValues(input, ctx)
  if (outFace > inFace * TRADE_MAX_RATIO) {
    return { ok: false, reason: 'その条件はこちらの持ち出しが大きすぎる。出す側を減らして出し直してくれ' }
  }
  const outP = input.outPlayers ?? []
  const inP = input.inPlayers ?? []
  if (outP.length > 0 && inP.length > 0) {
    const outTop = Math.max(...outP.map(ovr))
    const inTop = Math.max(...inP.map(ovr))
    if (inTop < outTop - TRADE_OVR_SLACK) {
      return { ok: false, reason: 'その選手を出して、これしか戻らないのは額面で見合わない' }
    }
  }
  return { ok: true }
}

/**
 * 成立するか。下限（相手が承知するか＝言い値で見る）と、
 * 上限・OVR差（こちらが損をしていないか＝額面で見る）の両方。
 */
export function tradeBalance(input: TradeInput, ctx: TradeValueCtx): TradeBalance {
  const { cpuGain, cpuLoss } = tradeValues(input, ctx)
  if (cpuLoss <= 0) return { ok: false, reason: 'こちらが受け取るものが指定されていない' }
  if (cpuGain < cpuLoss * TRADE_MIN_RATIO) return { ok: false, reason: '相手が手放すものに見合わない' }
  return tradeNotLopsided(input, ctx)
}
