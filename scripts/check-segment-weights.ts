/**
 * 【区間の重みと、表の引き方】目盛りが 1.00 か・引き方が1本か
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-segment-weights.ts \
 *     --outfile=node_modules/.cache/check-sw.cjs --log-level=error && node node_modules/.cache/check-sw.cjs
 *
 * ■なぜ要るか（2026-08-20・実測）
 *   タイムは `能力7つ → 加重平均で score → PACE_TABLE で 秒/km` の順で出る。
 *   `PACE_TABLE` の上端は `[99, 154]` で表の外はクランプするので、
 *   **重みの合計が 1.00 でないと score の目盛りがずれ、上位の能力差が消える。**
 *
 *   実際に消えていた。本編の400区間は手で調整した重みを持ち合計は 1.000 だったが、
 *   重みを持たない区間（ECL の70本・ランクマッチのコース）は `calcBaseAbility` の
 *   **2本目の枝**を通り、そちらは足したぶんを引いていないので合計が 1.18 まで膨らむ。
 *   ECL では OVR 89〜95 から上が同タイムだった（10km・登り2% で OVR 95 と 99 が 26分40秒）。
 *
 * ■見張るのは4つ
 *   ①どの区間も重みを持っている（本編・ECL・オンライン）
 *   ②重みの合計は 1.00
 *   ③`calcBaseAbility` に2本目の式を書いていない
 *   ④アンカー表を引くループを写していない（`utils/anchors` 1本）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { calcBaseAbility } from '../src/engine/raceEngine'
import { terrainWeights } from '../src/data/segmentWeights'
import { SEASON_2027_RACES, LEAGUE_COURSE_POOL, FINAL_COURSES, RESERVE_RACE_POOL } from '../src/data/races'
import { ECL_COURSES } from '../src/data/eclCourses'
import { MATCH_COURSES } from '../src/data/matchCourses'
import { ratedCourse } from '../src/engine/ratedCourse'
import { worldRace, worldRacePlans } from '../src/utils/worldCourses'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

type Seg = { index: number; distanceKm: number; uphillPct: number; downhillPct: number; statWeights?: Record<string, number> }
const SETS: [string, Seg[]][] = [
  ['本編 JPEL', [...SEASON_2027_RACES, ...LEAGUE_COURSE_POOL, ...FINAL_COURSES, ...RESERVE_RACE_POOL].flatMap(r => r.segments as unknown as Seg[])],
  ['ECL', (ECL_COURSES as { segments: Seg[] }[]).flatMap(c => c.segments)],
  ['オンライン対戦', (MATCH_COURSES as unknown as { segments: Seg[] }[]).flatMap(c => c.segments)],
  ['ランクマッチ', (ratedCourse('2026-09-01').segments as unknown as Seg[])],
  ['世界選手権', worldRacePlans(2030).flatMap((p, i) =>
    worldRace(p, { id: `w${i}`, name: 'w', date: '2030-01-01' }).segments as unknown as Seg[])],
]

// ── ①② 目盛りが 1.00 か（重みを持つ区間も、地形から作る区間も） ──
//   ★**「重みを持っているか」ではなく「目盛りが合っているか」を見ること。**
//     重みをデータに焼くとセーブに乗る（実測で1シーズン8KB増えた）ので、
//     地形から決まる区間（ECL・ランクマッチ・世界選手権）は**持たないのが正しい**。
//     持たない区間は `calcBaseAbility` が `terrainWeights` から作る——**その1本だけ**。
for (const [name, segs] of SETS) {
  const sums = segs.map(s => Object.values(
    (s.statWeights ?? terrainWeights(s.distanceKm, s.uphillPct, s.downhillPct)) as Record<string, number>)
    .reduce((a, b) => a + b, 0))
  const off = sums.filter(v => Math.abs(v - 1) > 0.001)
  const own = segs.filter(s => s.statWeights).length
  check(`${name}：重みの合計が 1.00（${segs.length}区間・うち手で調整 ${own}）`, off.length === 0,
    `${off.length}区間がずれています（${Math.min(...sums).toFixed(3)}〜${Math.max(...sums).toFixed(3)}）`)
}

// ★ここが本体。合計が 1.00 でも掛け違えていれば落ちる
const flat = (o: number) => ({ speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o })
let worst = 0
for (const [, segs] of SETS) for (const s of segs) for (const o of [60, 80, 99]) {
  worst = Math.max(worst, Math.abs(calcBaseAbility(flat(o) as never, s.uphillPct, s.downhillPct, s.distanceKm, s.statWeights as never) - o))
}
check('score が OVR と同じ目盛り（全区間・全能力帯）', worst < 0.01, `最大 ${worst.toFixed(3)} ずれています`)

// 地形から作る側も 1.00 か（重みを持たない区間ができたときの受け皿）
let tw = 0
for (const km of [3, 5, 8, 10, 15, 20, 23]) for (const up of [0, 10, 45, 70]) for (const down of [0, 10, 30]) {
  if (up + down > 100) continue
  tw = Math.max(tw, Math.abs(Object.values(terrainWeights(km, up, down)).reduce((a, b) => a + b, 0) - 1))
}
check('terrainWeights の合計も 1.00', tw < 0.001, `最大 ${tw.toFixed(4)} ずれています`)

// ── ③ calcBaseAbility に2本目の式を書いていない ──
const engine = readFileSync('src/engine/raceEngine.ts', 'utf8')
const body = engine.slice(engine.indexOf('export function calcBaseAbility('), engine.indexOf('export function calcAffinity('))
check('calcBaseAbility に2本目の式が無い', !/flatScore|upScore|downScore|longBonus|shortBonus/.test(body),
  '重みの組み立ては data/segmentWeights の terrainWeights 1本')

// ── ④ アンカー表を引くループを写していない ──
const walk = (d: string): string[] => readdirSync(d).flatMap(f => {
  const p = join(d, f)
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []
})
const copies = walk('src').filter(f => f !== 'src/utils/anchors.ts'
  && /for \(let i = 0; i < (pts|t)\.length - 1; i\+\+\)/.test(readFileSync(f, 'utf8')))
check('アンカー表を引くループを写していない', copies.length === 0,
  `${copies.join(', ')} — utils/anchors の lerpAnchors を使うこと`)

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
