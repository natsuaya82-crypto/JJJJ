/**
 * 【優勝トロフィー（A-19）の効き目】誰が使えて、どれだけ速くなるか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-trophy.ts \
 *     --outfile=node_modules/.cache/m-trophy.cjs --log-level=error && node node_modules/.cache/m-trophy.cjs
 *
 * ■何を見るのか
 *   トロフィーは**能力ごとの上限を99から1つずつ上げる**もの（自チーム限定・年最大2個）。
 *   効き目は「その能力が score に何割効くか」で決まるので、**OVR ではなく単体の能力**で
 *   見ないと話が合わない（オーナー・2026-08-20「ovrでみたらね？単体なら99とか行ってる
 *   人いるでしょ？その話」）。実際、開幕の1部には単体99の選手が10人いる。
 *
 * ■数字を動かすときは必ずこれを流すこと
 *   ①使える選手が何人いるか ②何秒速くなるか ③実際の着差と比べてどうか
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { SEASON_2027_RACES } from '../src/data/races'
import { simulateRace, bgLineup, calcBaseAbility } from '../src/engine/raceEngine'
import { lerpAnchors } from '../src/utils/anchors'
import { ovr } from '../src/utils/playerUtils'
import type { Race, Team } from '../src/types'

const KEYS = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery'] as const
const f = (t: number) => `${Math.floor(t / 60)}分${String(Math.round(t % 60)).padStart(2, '0')}秒`
const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]

// ── ① 誰が使えるか（99 に届いている能力を持つ選手） ──
for (const [name, teams] of [['1部', INITIAL_TEAMS as Team[]], ['1〜3部', [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]]] as const) {
  const ps = generateCpuRosters(teams, 2028).cpuPlayers.filter(p => p.status === 'active')
  const maxes = ps.map(p => Math.max(...KEYS.map(k => (p.ratings as Record<string, number>)[k] ?? 0)))
  console.log(`\n【${name}】選手 ${ps.length}人（開幕時・${teams.length}クラブ）`)
  console.log(`  単体の能力の最高値：中央値 ${med(maxes)} / 最大 ${Math.max(...maxes)}`)
  for (const t of [99, 95, 90, 85]) {
    const n = maxes.filter(m => m >= t).length
    console.log(`  1つでも ${t} 以上を持つ選手：${n}人（${(n / ps.length * 100).toFixed(1)}%）`)
  }
  const at99 = ps.filter(p => KEYS.some(k => ((p.ratings as Record<string, number>)[k] ?? 0) >= 99))
  if (at99.length) {
    const o = at99.map(p => ovr(p))
    console.log(`  99 を持つ選手の OVR：中央値 ${med(o)} / ${Math.min(...o)}〜${Math.max(...o)}`)
    const cnt = at99.map(p => KEYS.filter(k => ((p.ratings as Record<string, number>)[k] ?? 0) >= 99).length)
    console.log(`  そのうち 99 が2つ以上：${cnt.filter(c => c >= 2).length}人 / 3つ以上：${cnt.filter(c => c >= 3).length}人`)
  }
}

// ── ② 表を 110 まで伸ばしたときの効き目 ──
// いまの PACE_TABLE ＋ 95→99 と同じ勾配（1点 = 1.0秒/km）で 110 まで
const NOW: [number, number][] = [[0,252],[30,230],[40,218],[50,206],[60,194],[70,184],[80,174],[85,168],[90,163],[95,158],[99,154]]
const EXT: [number, number][] = [...NOW, [110, 143]]
const timeOf = (score: number, km: number, up: number, down: number) => {
  const pace = Math.max(50, lerpAnchors(EXT, score) + up * 0.4 - down * 0.35)
  const c = km <= 5 ? 1.0 : km <= 10 ? 1.038 : km <= 16 ? 1.06 : km <= 21 ? 1.077 : 1.10
  return Math.round(pace * km * c)
}
const R = (base: number, over?: Record<string, number>) =>
  ({ speed: base, stamina: base, mountainUp: base, mountainDown: base, pacing: base, mental: base, recovery: base, ...over }) as never

const race0 = SEASON_2027_RACES[0]
const seg = race0.segments[0]
const w = (seg.statWeights ?? {}) as Record<string, number>
const top = Object.entries(w).sort((a, b) => b[1] - a[1])[0]
console.log(`\n【${race0.name} 第${seg.index}区 ${seg.distanceKm}km】いちばん効く能力＝${top[0]}（重み ${top[1]}）`)
const base = timeOf(calcBaseAbility(R(99), seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights), seg.distanceKm, seg.uphillPct, seg.downhillPct)
for (const v of [99, 102, 105, 110]) {
  const sc = calcBaseAbility(R(99, { [top[0]]: v }), seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
  const t = timeOf(sc, seg.distanceKm, seg.uphillPct, seg.downhillPct)
  console.log(`  ${top[0]} ${String(v).padStart(3)}（トロフィー${String(v - 99).padStart(2)}個・${((v - 99) / 2).toFixed(1)}年） → score ${sc.toFixed(1)}  ${f(t)}  ${t === base ? '±0' : `-${base - t}秒`}`)
}

// ── ③ 実際の着差と比べる ──
const teams = INITIAL_TEAMS as Team[]
const players = generateCpuRosters(teams, 2028).cpuPlayers
const margins: number[] = [], segGaps: number[] = []
for (const c of SEASON_2027_RACES) {
  const race = { ...c, date: '2028-04-01' } as Race
  const lineups: Record<string, Record<number, string>> = {}
  for (const t of teams) lineups[t.id] = bgLineup(players.filter(p => p.teamId === t.id && p.status === 'active'), race)
  const res = simulateRace(race, lineups, teams, players, 0.5)
  const totals = res.teamRankings.map(r => r.totalTimeSec).filter(Number.isFinite).sort((a, b) => a - b)
  if (totals.length >= 2) margins.push(totals[1] - totals[0])
  for (const s of res.segmentResults) {
    const ts = s.runners.map(x => x.timeSec).filter(Number.isFinite).sort((a, b) => a - b)
    if (ts.length > 1) segGaps.push(ts[1] - ts[0])
  }
}
console.log(`\n【1部20クラブ・${SEASON_2027_RACES.length}戦を実際に走らせた着差】`)
console.log(`  優勝と2位の総合タイム差  中央値 ${f(med(margins))}（${f(Math.min(...margins))}〜${f(Math.max(...margins))}）`)
console.log(`  区間1位と2位の差         中央値 ${med(segGaps).toFixed(0)}秒`)
