/**
 * **選手の格の2つのツマミが何を変えるか。**
 *   ① TIER_FALL_LIMIT       … どこまで格を落として移籍していいか
 *   ② YOUTH_POTENTIAL_WEIGHT … 若さ（伸びしろ）をどれだけ格に織り込むか
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { allTieredClubs, tierOfPlayerClub } from '../src/utils/clubTier'
import { tierLines, playerTierOf } from '../src/utils/playerTier'
import { effectiveOvr } from '../src/utils/foreignClubProfile'
import { peakAgeOfCurve } from '../src/engine/ageCurve'
import { ovr } from '../src/utils/playerUtils'
import type { Player, Team } from '../src/types'

const YEAR = 2030
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
const clubs = allTieredClubs(base, fgen.updatedLeagues)
const tierOf = (id: string) => tierOfPlayerClub(id, clubs)

// ② 重みを差し替えて選手の格を出し直す（定数を触らずに同じ式を写す）
const careerAt = (p: Player, w0: number) => {
  const peak = peakAgeOfCurve(p.growthCurve ?? 'normal')
  const now = effectiveOvr(p)
  if (p.age >= peak) return now
  const w = Math.min(1, Math.max(0, (peak - p.age) / Math.max(1, peak - 18))) * w0
  return now + Math.max(0, (p.potential ?? now) - now) * w
}
const linesAt = (w0: number) => {
  const orig = players.map(p => ({ p, v: careerAt(p, w0) }))
  // tierLines と同じ数え方（席を格順に、選手を強い順に、順位を突き合わせる）
  const seats: number[] = new Array(21).fill(0)
  const seen = new Map<string, number>()
  for (const p of players) { if (p.status === 'active' && p.teamId) seen.set(p.teamId, (seen.get(p.teamId) ?? 0) + 1) }
  for (const [id, n] of seen) { const t = tierOf(id); if (t) seats[t] += n }
  const sorted = orig.filter(x => x.p.status === 'active' && x.p.teamId).sort((a, b) => b.v - a.v)
  const line: number[] = new Array(21).fill(-Infinity)
  let i = 0
  for (let t = 1; t <= 20; t++) { i += seats[t]; if (i > 0) line[t] = sorted[Math.min(i, sorted.length) - 1].v }
  return line
}
const tierAt = (p: Player, line: number[], w0: number) => {
  const v = careerAt(p, w0)
  for (let t = 1; t <= 20; t++) if (v >= line[t]) return t
  return 20
}

console.log('══ ② YOUTH_POTENTIAL_WEIGHT（若さをどれだけ格に織り込むか）══\n')
console.log('同じ選手の「選手の格」が、重みでどう変わるか')
const samples = [...players].filter(p => p.status === 'active').sort((a, b) => (b.potential - ovr(b)) - (a.potential - ovr(a)))
const picks = [samples[0], samples[300], samples[1500],
  ...players.filter(p => p.age >= 30 && ovr(p) >= 80).slice(0, 1),
  ...players.filter(p => p.age === 27 && ovr(p) >= 85).slice(0, 1)].filter(Boolean)
const WS = [0, 0.25, 0.5, 0.75, 1]
const L = new Map(WS.map(w => [w, linesAt(w)]))
console.log('  選手                      年齢 OVR 天井 |' + WS.map(w => ` w=${w}`).join(''))
for (const p of picks) {
  console.log(`  ${p.name.padEnd(22)} ${String(p.age).padStart(3)} ${String(ovr(p)).padStart(3)} ${String(p.potential).padStart(4)} |`
    + WS.map(w => String(tierAt(p, L.get(w)!, w)).padStart(5)).join(''))
}
console.log('\n18〜21歳が「格5以上（＝1部の上位が獲る帯）」に入る人数')
const young = players.filter(p => p.status === 'active' && p.age <= 21)
for (const w of WS) {
  const n = young.filter(p => tierAt(p, L.get(w)!, w) <= 5).length
  console.log(`  w=${w}  ${String(n).padStart(4)}人 / ${young.length}人（${(n / young.length * 100).toFixed(1)}%）`)
}
console.log('\n★w=0 だと、ドラフト新人（18歳・OVR55前後）は全員こうなる：')
{
  const l0 = L.get(0)!
  const rookies = players.filter(p => p.status === 'active' && p.age === 18)
  const ts = rookies.map(p => tierAt(p, l0, 0))
  console.log(`  18歳 ${rookies.length}人の選手の格：最小${Math.min(...ts)} 中央${ts.sort((a,b)=>a-b)[ts.length>>1]} 最大${Math.max(...ts)}`)
}

console.log('\n\n══ ① TIER_FALL_LIMIT（どこまで落ちて移籍していいか）══\n')
const line = L.get(0.5)!
const pt = new Map(players.map(p => [p.id, tierAt(p, line, 0.5)]))
console.log('いまの世界で、「選手の格 + N」より下のクラブに在籍している人の割合')
console.log('（初期世界は生成しただけなので、この人たちは移籍で来たのではない）')
for (const N of [0, 1, 2, 3, 4, 5]) {
  const act = players.filter(p => p.status === 'active' && p.teamId)
  const over = act.filter(p => (tierOf(p.teamId) ?? 20) > (pt.get(p.id) ?? 20) + N).length
  console.log(`  N=${N}  ${String(over).padStart(4)}人（${(over / act.length * 100).toFixed(1)}%）が「行けないはずの格」にいる`)
}
console.log('\nOVR85+ の選手が行けるクラブの数（世界232クラブ中）')
const strong = players.filter(p => p.status === 'active' && ovr(p) >= 85)
for (const N of [1, 2, 3, 4, 5]) {
  const avg = strong.reduce((s, p) => s + clubs.filter(c => (tierOf(c.id) ?? 20) <= (pt.get(p.id) ?? 20) + N).length, 0) / Math.max(1, strong.length)
  console.log(`  N=${N}  平均 ${avg.toFixed(0)}クラブ`)
}
