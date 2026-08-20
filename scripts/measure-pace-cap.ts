/**
 * 【タイムの頭打ち】能力差がどこから効かなくなるかを数える
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-pace-cap.ts \
 *     --outfile=node_modules/.cache/m-pace.cjs --log-level=error && node node_modules/.cache/m-pace.cjs
 *
 * ■なぜ要るか（2026-08-20・「数値を最大110まで」を検討して見つけた）
 *   タイムは `能力7つ → calcBaseAbility で score → PACE_TABLE で 秒/km` の順で出る。
 *   ところが `calcBaseAbility` の**重みの合計は 1.0 を超える**（20km の平地なら
 *   OVR 85 で score 100）のに、`PACE_TABLE` は **score 99 で打ち止め**で、
 *   `scoreToBasePace` は表の外をクランプする。
 *
 *       if (score >= t[t.length - 1][0]) return t[t.length - 1][1]   // 154秒/km
 *
 *   つまり**上位の選手はもう能力差がタイムに出ていない**（20km の区間だと
 *   OVR 84 と OVR 99 が同じ 55分17秒）。110 を入れる入れない以前の話。
 *
 *   ★数字を動かすときは、必ずこれを流して「頭打ちが始まるOVR」を見ること。
 */
import { calcBaseAbility, scoreToTime } from '../src/engine/raceEngine'

const flat = (o: number) => ({ speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o })
const f = (t: number) => `${Math.floor(t / 60)}分${String(t % 60).padStart(2, '0')}秒`

for (const km of [5, 10, 15, 20, 23]) {
  console.log(`\n【${km}km・平地】OVR → score → タイム`)
  let clampFrom: number | null = null
  for (let o = 60; o <= 99; o++) {
    if (calcBaseAbility(flat(o) as never, 0, 0, km) >= 99 && clampFrom === null) clampFrom = o
  }
  for (const o of [70, 75, 80, 85, 90, 95, 99]) {
    const sc = calcBaseAbility(flat(o) as never, 0, 0, km)
    console.log(`  OVR ${o} → score ${sc.toFixed(1).padStart(6)}  ${f(scoreToTime(sc, km, 0, 0))}${sc >= 99 ? '   ← 頭打ち' : ''}`)
  }
  console.log(`  ★頭打ちが始まるOVR: ${clampFrom ?? '（99までで到達しない）'}`)
}

// トロフィーで1能力だけ上げたとき（いまの表のままだと1秒も変わらないことの確認）
const base = { speed: 99, stamina: 92, mountainUp: 88, mountainDown: 88, pacing: 94, mental: 94, recovery: 92 }
console.log('\n【トロフィーで速さだけ上げる／20km 平地】')
const t0 = scoreToTime(calcBaseAbility(base as never, 0, 0, 20), 20, 0, 0)
for (const v of [99, 100, 105, 110]) {
  const r = { ...base, speed: v }
  const sc = calcBaseAbility(r as never, 0, 0, 20)
  const t = scoreToTime(sc, 20, 0, 0)
  console.log(`  速さ ${String(v).padStart(3)}（トロフィー${String(v - 99).padStart(2)}個） → score ${sc.toFixed(1).padStart(6)}  ${f(t)}  99比 ${t0 - t === 0 ? '±0' : `-${t0 - t}秒`}`)
}
