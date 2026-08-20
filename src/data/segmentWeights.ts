import type { Ratings } from '../types'

/**
 * **区間の重み（どの能力がどれだけ効くか）の唯一の決まり。**
 *
 * ■なぜここにあるのか（2026-08-20）
 *   タイムは `能力7つ → 加重平均で score → PACE_TABLE で 秒/km` の順で出る。
 *   `PACE_TABLE` の上端は `[99, 154]` で表の外はクランプするので、
 *   **重みの合計が 1.00 でないと score の目盛りがずれ、上位の能力差が消える。**
 *
 *   実際に消えていた。本編の400区間は1つずつ手で調整した重み（`data/races.ts` の `seg`）を
 *   持っていて合計はどれも 1.000 だったが、**重みを持たない区間**——ECL の70区間、
 *   ランクマッチのコース（`engine/ratedCourse`）——は `calcBaseAbility` の中の
 *   **2本目の枝**を通っていた。そちらは地形と距離から重みを組むのに
 *   **足したぶんをどこからも引いていない**ので合計が 1.00〜1.18 に膨らみ、
 *   ECL では **OVR 89〜95 から上の差がタイムに出ていなかった**
 *   （10km・登り2% で OVR 95 と 99 が同じ 26分40秒）。
 *
 * ■決まり
 *   **区間は必ず重みを持つこと。** 手で調整したものが無いなら、ここで地形から作る。
 *   `calcBaseAbility` に2本目の枝を戻さないこと（`check-segment-weights` が見張る）。
 *
 * ■中身
 *   もとの式（`raceEngine` の中にあったもの）そのままで、最後に**合計で割る**だけ。
 *   比率は変えていないので、区間の性格（平地は速さ支配・登りは登り支配）は同じ。
 */
export function terrainWeights(distanceKm: number, uphillPct: number, downhillPct: number): Ratings {
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct)
  const longBonus = Math.min(distanceKm / 20, 1.0)
  const shortBonus = Math.max(0, 1 - distanceKm / 8)

  // 地形ごとの重み。平地は速さ支配、登りは登り支配、下りは下り支配
  const flat: Ratings = {
    speed: 0.62 + shortBonus * 0.12,
    stamina: 0.14 + longBonus * 0.12,
    mountainUp: 0, mountainDown: 0,
    pacing: 0.12, mental: 0.06,
    recovery: 0.06 + longBonus * 0.06,
  }
  const up: Ratings = {
    speed: 0, mountainDown: 0,
    mountainUp: 0.72,
    stamina: 0.15 + longBonus * 0.05,
    mental: 0.07, pacing: 0.04, recovery: 0.02,
  }
  const down: Ratings = {
    mountainDown: 0.72, speed: 0.16,
    mountainUp: 0, stamina: 0,
    mental: 0.07, pacing: 0.03, recovery: 0.02,
  }

  const keys = Object.keys(flat) as (keyof Ratings)[]
  const mixed = {} as Ratings
  for (const k of keys) {
    mixed[k] = (flatPct / 100) * flat[k] + (uphillPct / 100) * up[k] + (downhillPct / 100) * down[k]
  }
  // ★**合計で割る。** ここを外すと score が OVR より大きく出て、表の上端で潰れる
  const sum = keys.reduce((s, k) => s + mixed[k], 0)
  if (sum <= 0) return mixed
  for (const k of keys) mixed[k] = mixed[k] / sum
  return mixed
}
