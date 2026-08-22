import type { Ratings, Specialty } from '../types'
import { STAT_CAP, SPEC_STRONG_STATS } from './playerUtils'

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
 * ★成長上限のほうは `myPlayerCaps`（下）を見ること。**平均92は変えていません。**
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

/**
 * **育て切ったときの上限の合計**（＝全能力の平均92 × 7）。
 * オーナー・2026-08-22「全能力の平均が92です」。
 */
export const MY_PLAYER_CAP_TOTAL = 644

/**
 * **タイプごとの成長上限。** 平均は92のまま、**得意な能力は99・不得意はその下**に配る。
 *
 * ■なぜタイプで分けるのか（オーナー・2026-08-22
 *   「タイプがあるんだからタイプごとに上限数値決めて平均92にすればいいじゃん」）
 *   以前は合計644を低い能力から水で埋めるだけだったので、**7能力とも92で揃った
 *   のっぺりした選手**にしかなりませんでした。平均を92に保つのは変えず、
 *   **どこが伸びてどこが伸びないか**をタイプが決めます。
 *
 * ■決め方（新しい数字を置かない）
 *   得意な能力＝`SPEC_STRONG_STATS` は天井（`STAT_CAP`＝99）。
 *   残りは合計が `MY_PLAYER_CAP_TOTAL` ちょうどになるよう等分する。
 *   端数は `MY_PLAYER_STATS` の並びの先頭から1ずつ配る（乱数を使わない）。
 *
 *     スプリンター（速力・ペース） 99 89 89 89 99 89 90
 *     エース（ペース・メンタル・スタミナ） 87 99 87 87 99 99 86
 *
 * ★**振ったぶんは残ります**（`getStatPotentials` が `Math.max(現在値, 上限)`）。
 *   不得意へ99を振ればその99は消えないので、そこは振り分けの選択です。
 */
export function myPlayerCaps(specialty: Specialty): Ratings {
  const strong = new Set<string>(SPEC_STRONG_STATS[specialty] ?? [])
  const rest = MY_PLAYER_STATS.filter(k => !strong.has(k as string))
  const left = MY_PLAYER_CAP_TOTAL - STAT_CAP * (MY_PLAYER_STATS.length - rest.length)
  const base = Math.floor(left / rest.length)
  let extra = left - base * rest.length
  const out = {} as Record<string, number>
  for (const k of MY_PLAYER_STATS) out[k as string] = STAT_CAP
  for (const k of rest) { out[k as string] = base + (extra > 0 ? 1 : 0); if (extra > 0) extra -= 1 }
  return out as unknown as Ratings
}

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
