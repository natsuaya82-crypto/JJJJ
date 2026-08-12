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
// ■値段の物差しは1つ（priceOf）
//   その選手を引き剥がすのに要る額。**現金の移籍とまったく同じ関数**
//   （`playerUtils.transferFeeFor` ＝ 市場価値 × 余剰でなければ POACH_PREMIUM）で、
//   市場価値そのものが今季の出場を見ます。現金（outExtra/inExtra）も選手も
//   **同じ1つの合計**に入るので、現金だけ・選手だけ・混合が同じ式で数えられます。
//
//   以前は「額面」と「言い値」の2つがあり、出す側は額面・もらう側は言い値、と
//   **同じ選手を左右で違う物差しで数えて**いました（相手は自分の選手を高く見積もる、
//   というバイアスをそこで表していた）。そのとき起きたのは
//     ・CPUが打診を作るのは額面／こちらが飲むかの判定は上乗せ込み
//       → 帯を通って届いた打診が、押した瞬間に上限で弾かれて**黙って消える**
//     ・主力の上乗せ1.5倍と出場の上乗せ1.4倍で最大2.1倍まで開くのに許容は1.30倍
//       → **同じOVR・同じ年齢の1対1すら成立しない**
//   の2つ。1本にすると割増は両側に同じだけ掛かって打ち消えるので、この形が消えます。
//   相手が渋るぶんは TRADE_MIN_RATIO(0.92) が受け持ちます。
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
import { keyPlayerStatus, ovr, seasonPerfProfile, transferFeeFor } from './playerUtils'
import { isSurplus } from './transferDecision'
import { squadRankOf } from './squadNeeds'
import type { SegRaceLike } from './playerUtils'

/** 相手が「こちらが手放すものに見合わない」と断る下限 */
export const TRADE_MIN_RATIO = 0.92
/** チャット交渉で相手が即OKする下限（下限より少しだけ厳しい） */
export const TRADE_OK_RATIO = 0.95
/** これを下回ると話にならない（門前払い） */
export const TRADE_HARD_NO_RATIO = 0.55
/** これを超えると、こちらの持ち出しが大きすぎて成立させない（額面で見る） */
export const TRADE_MAX_RATIO = 1.30
// ★主力の割増（1.5）と出場率の上乗せ（×1.0〜1.4）はここから消しました。
//   「その選手を引き剥がすのに要る額」は現金の移籍と同じ1本
//   （`playerUtils.transferFeeFor` ＝ 市場価値 × 余剰でなければ POACH_PREMIUM）。
//   市場価値そのものが今季の出場を見る（`calcTransferValue` の第2引数）ので、
//   「よく出ている選手ほど高い」はそちらで効きます。**ここで掛け直さないこと。**
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
  races: readonly SegRaceLike[]
  teamRaces: number
  currentSeason: Parameters<typeof keyPlayerStatus>[1]
  pastSeasons: Parameters<typeof keyPlayerStatus>[2]
  /**
   * 全選手。**出す側での序列**（＝余剰か）を数えるのに使う。
   * 省略すると「主力」として扱う（割増が掛かる側）。
   */
  players?: readonly Player[]
}

/** 今季どれだけ走ったか。**値付けの入口はここ1本**（現金の移籍とまったく同じ材料） */
function perfIn(p: Player, ctx: TradeValueCtx) {
  return seasonPerfProfile(p.id, ctx.races, ctx.teamRaces)
}

/** その選手は、いまのクラブで余剰か（序列15番手以降か） */
function surplusIn(p: Player, ctx: TradeValueCtx): boolean {
  if (!ctx.players) return false   // 分からなければ主力扱い（安く見積もらない）
  const roster = ctx.players.filter(x => x.teamId === p.teamId && x.status === 'active')
  return isSurplus({ squadRank: squadRankOf(roster, p) })
}

/**
 * **その選手の値段（唯一の物差し）。** 現金の移籍とまったく同じ1本
 * （`playerUtils.transferFeeFor` ＝ 市場価値 × 余剰でなければ `POACH_PREMIUM`）を通します。
 * 市場価値そのものが今季の出場を見る（`calcTransferValue` の第2引数）ので、
 * 「よく出ている選手ほど高い」もここに入っています。
 *
 * ■以前は「額面」と「言い値」の2つがありました
 *   額面 ＝ 素の市場価値／言い値 ＝ 額面 × 出場率(1.0〜1.4) × 主力(1 or 1.5)。
 *   出す側は額面・もらう側は言い値、と**同じ選手を左右で違う物差しで数えて**いて、
 *   「相手は自分の選手を高く見積もる」というバイアスをそこで表していました。
 *
 *   値段を1本にすると、そのバイアスは**両側に同じだけ掛かって打ち消えます**。
 *   打ち消えないと、同じOVR・同じ年齢の1対1すら 0.71倍 と判定されて成立しません
 *   （実際そうなりました）。相手が渋るぶんは `TRADE_MIN_RATIO`(0.92) が受け持ちます。
 */
export function priceOf(p: Player, ctx: TradeValueCtx): number {
  return transferFeeFor(p, surplusIn(p, ctx), perfIn(p, ctx))
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
  /** 相手が受け取るぶん（＝こちらが出すぶん）。`outFace` と同じ */
  cpuGain: number
  /** 相手が手放すぶん（＝こちらがもらうぶん）。`inFace` と同じ */
  cpuLoss: number
  /** 相手から見た旨み。1.0 で釣り合い */
  ratio: number
}

export function tradeValues(input: TradeInput, ctx: TradeValueCtx): TradeValues {
  const outP = input.outPlayers ?? []
  const inP = input.inPlayers ?? []
  const outExtra = input.outExtra ?? 0
  const inExtra = input.inExtra ?? 0
  const outFace = outP.reduce((s, p) => s + priceOf(p, ctx), 0) + outExtra
  const inFace = inP.reduce((s, p) => s + priceOf(p, ctx), 0) + inExtra
  // 左右とも同じ物差し。**現金（outExtra/inExtra）も選手も同じ1つの合計に入る**ので、
  // 現金だけ・選手だけ・現金＋選手の混合が同じ式で数えられる
  return { outFace, inFace, cpuGain: outFace, cpuLoss: inFace, ratio: inFace > 0 ? outFace / inFace : 0 }
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
