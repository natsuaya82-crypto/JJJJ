import type { Ratings } from '../types'
import { STAT_CAP } from './playerUtils'

// ============================================================================
// **自分でつくる選手（マイプレイヤー）の決まり。**
// 振り分けの上限・下限と、「確定していいか」の判定はここ1本。
// **画面の「押せるか」と store の「受け付けるか」を同じ関数から出すこと**
// （`utils/bidGate` と同じ形。画面にだけ書くと store 側がザルになる）。
// ============================================================================

/**
 * **1つの能力に振れる下限。**
 *
 * ■なぜ要るのか（オーナー・2026-08-21）
 *   「99 99 1 99 99 99 とかやられるとカードで合成でバケモンが完成してしまう」
 *
 *   `createMyPlayer` は振り分けたあと、**合計が育成上限の合計になるまで低い能力から
 *   自動で埋めます**。だから捨てた能力はタダで戻ってきます。実測：
 *
 *     均等に振る   72 71 71 71 71 72 72 → 育て切ると 92 92 92 92 92 92 92
 *     1つ捨てる    99 99 99 99 99  4  1 → 育て切ると 99 99 99 99 99 75 74
 *                                            ↑捨てた1が75まで無料で戻る
 *
 *   **OVRはどちらも92**（合計が同じなので）。違うのは**99が5本あるかどうか**で、
 *   区間の重みは能力ごとに掛かるので、そこがそのままタイム差になります。
 *   画面のOVRでは気づけないのが厄介なところ。
 */
export const MY_PLAYER_STAT_MIN = 60

/** 1つの能力の上限。ふつうの天井と同じ */
export const MY_PLAYER_STAT_MAX = STAT_CAP

/**
 * **振り分けポイント。** 出どころで額が違います（オーナー・2026-08-21
 * 「500は新規作成記念でしょ？560は配布でしょ？ちゃんと違いがあるんだけど」）。
 */
export const MY_PLAYER_POINTS_INITIAL = 500   // 新規作成の記念（最初の1人）
export const MY_PLAYER_POINTS_GRANT = 560     // 記念の配布ぶん（1000DL記念など）

/** 能力の並び。振り分けも合計もこの順で数える */
export const MY_PLAYER_STATS: (keyof Ratings)[] =
  ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

/** 均等割り＋端数を速力へ。開いた瞬間に残り0＝そのまま確定できる形にする */
export function evenSpread(points: number): Ratings {
  const base = Math.floor(points / MY_PLAYER_STATS.length)
  const rest = points - base * MY_PLAYER_STATS.length
  const out = {} as Record<string, number>
  for (const k of MY_PLAYER_STATS) out[k] = base
  out.speed += rest
  return out as unknown as Ratings
}

/**
 * **確定していいか。押せないときは理由を返す。**
 * 画面はこれをボタンの見出しに出し、store は受け付けるかの判定に使う。
 */
export function myPlayerBlockReason(
  ratings: Ratings, points: number, name: string, canCreate: boolean,
): string | null {
  if (!canCreate) return '作成できる回数が残っていません'
  if (!name.trim()) return '名前を入力してください'
  const vals = MY_PLAYER_STATS.map(k => (ratings as unknown as Record<string, number>)[k] ?? 0)
  if (vals.some(v => v < MY_PLAYER_STAT_MIN)) return `どの能力も ${MY_PLAYER_STAT_MIN} 以上にしてください`
  if (vals.some(v => v > MY_PLAYER_STAT_MAX)) return `どの能力も ${MY_PLAYER_STAT_MAX} 以下にしてください`
  const rest = points - vals.reduce((s, v) => s + v, 0)
  if (rest !== 0) return `残り ${rest} を振り分けてください`
  return null
}
