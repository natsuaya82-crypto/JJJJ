/**
 * 【タイムの目盛り】能力→score の目盛りが 1.00 か、タイムが頭打ちしていないか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-pace-cap.ts \
 *     --outfile=node_modules/.cache/m-pace.cjs --log-level=error && node node_modules/.cache/m-pace.cjs
 *
 * ■なにを見るか（2026-08-20・「数値を最大110まで」を調べて見つけた）
 *   タイムは `能力7つ → calcBaseAbility で score → PACE_TABLE で 秒/km` の順で出る。
 *   `PACE_TABLE` の上端は `[99, 154]` で、`scoreToBasePace` は表の外をクランプする。
 *   だから **score の目盛りが OVR と一致していないと、上位の能力差が消える。**
 *
 *   区間が `statWeights`（コース固有の重み）を持てばその重みが使われ、無ければ
 *   `calcBaseAbility` の**既定の枝**（地形＋距離から重みを組む）が使われる。
 *   実測すると、
 *
 *     ・`statWeights` 付きの区間 … 合計はどれも 1.000 ＝ score は OVR と一致。頭打ちなし
 *     ・既定の枝 … 合計が 1.00〜1.18（長い平地ほど膨らむ）＝ score が OVR より上に出る
 *
 *   ★**本編（JPEL）と記録会は正常です。** 400区間すべてが `statWeights` を持っている。
 *     壊れているのは既定の枝を通る **ECL の70区間と、オンライン対戦の70区間**だけ。
 *     そこでは OVR 89〜95 あたりから上の能力差がタイムに出ていない。
 *
 * ■使い方
 *   そのまま流すと、コースの束ごとに「頭打ちする区間が何本か」を出す。
 *   `DUMP=<path>` を付けると全区間 × OVR のタイムをJSONへ書き出す。
 *   **目盛りを触るときは前後で流して差分を見ること**（挙動が動くため）。
 */
import { calcBaseAbility, scoreToTime } from '../src/engine/raceEngine'
import { SEASON_2027_RACES, LEAGUE_COURSE_POOL, FINAL_COURSES, RESERVE_RACE_POOL } from '../src/data/races'
import { ECL_COURSES } from '../src/data/eclCourses'
import { MATCH_COURSES } from '../src/data/matchCourses'
import { writeFileSync } from 'node:fs'

type Seg = { index: number; distanceKm: number; uphillPct: number; downhillPct: number; statWeights?: Record<string, number> }
type Course = { name?: string; id?: string; segments: readonly Seg[] }

const SETS: [string, readonly Course[]][] = [
  ['本編 JPEL', [...SEASON_2027_RACES, ...LEAGUE_COURSE_POOL, ...FINAL_COURSES, ...RESERVE_RACE_POOL] as unknown as Course[]],
  ['ECL', ECL_COURSES as unknown as Course[]],
  ['オンライン対戦', MATCH_COURSES as unknown as Course[]],
]

const flat = (o: number) => ({ speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o })
const f = (t: number) => `${Math.floor(t / 60)}分${String(t % 60).padStart(2, '0')}秒`
const timeAt = (s: Seg, o: number) =>
  scoreToTime(calcBaseAbility(flat(o) as never, s.uphillPct, s.downhillPct, s.distanceKm, s.statWeights as never),
    s.distanceKm, s.uphillPct, s.downhillPct)

const dump = process.env.DUMP
if (dump) {
  const out: Record<string, number> = {}
  for (const [name, courses] of SETS) {
    courses.forEach((c, ci) => c.segments.forEach(s => {
      for (const o of [50, 60, 70, 75, 80, 85, 90, 95, 99]) out[`${name}/${ci}/${s.index}/${o}`] = timeAt(s, o)
    }))
  }
  writeFileSync(dump, JSON.stringify(out))
  console.log(`  ${Object.keys(out).length}件を書き出しました → ${dump}`)
} else {
  for (const [name, courses] of SETS) {
    const segs = courses.flatMap(c => c.segments.map(s => ({ c, s })))
    const withW = segs.filter(x => x.s.statWeights).length
    const clamped: { n: string; from: number }[] = []
    for (const { c, s } of segs) {
      const t99 = timeAt(s, 99)
      let from: number | null = null
      for (let o = 60; o <= 99; o++) if (timeAt(s, o) === t99 && from === null) from = o
      if (from !== null && from < 99) clamped.push({ n: `${c.name ?? c.id} 第${s.index + 1}区(${s.distanceKm}km)`, from })
    }
    console.log(`\n【${name}】区間 ${segs.length}（statWeights あり ${withW} / 既定の枝 ${segs.length - withW}）`)
    console.log(`  頭打ちする区間: ${clamped.length} 本${clamped.length === 0 ? '  ← 正常（score が OVR と一致）' : ''}`)
    clamped.sort((a, b) => a.from - b.from)
    for (const w of clamped.slice(0, 4)) console.log(`    OVR ${w.from} から頭打ち — ${w.n}`)
    if (clamped.length > 0) {
      const s = segs.find(x => !x.s.statWeights)!.s
      console.log(`  例：${s.distanceKm}km・登り${s.uphillPct}%`)
      for (const o of [85, 90, 95, 99]) {
        const sc = calcBaseAbility(flat(o) as never, s.uphillPct, s.downhillPct, s.distanceKm)
        console.log(`    OVR ${o} → score ${sc.toFixed(1).padStart(6)}  ${f(timeAt(s, o))}`)
      }
    }
  }
}
