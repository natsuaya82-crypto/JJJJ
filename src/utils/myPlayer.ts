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
 *   捨てた能力は**カードで育て直せる**ので、極端に振ってもいずれ埋まります。
 *   下限が無いと「捨てた1本」が最初から丸損にならず、5本を99で始められる形に
 *   なるので、そこを止める線。**これはオーナーが決めた数字です。**
 *
 * ★**「育て切ると全能力の平均が92（合計644）」は廃止しました**（オーナー・2026-08-22）。
 *   合計を644に固定して低い能力から水を張る形だったので、**どう振っても到達点が
 *   同じ（OVR92）**でした。いまは成長上限が `STAT_CAP` 1本で、どの能力も99まで
 *   伸ばせます。振り分けが決めるのは**どこから始めるか**だけです。
 *   ★この 92 は実装のとき（`2c008b3`・2026-07-23）に**確認せずこちらで決めた**もの。
 *     バランスの数字を勝手に置かないこと。
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
