// 格ごとの平均OVRを出す。
//   npx esbuild --bundle --platform=node --format=cjs scripts/measure-tier.ts --outfile=/tmp/mt.cjs && node /tmp/mt.cjs
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { tierBudget, tierOf, TIER_BUDGET, CLUB_TIERS, type ClubTier } from '../src/utils/clubTier'
import { divisionOf } from '../src/utils/league'
import type { Player, Team } from '../src/types'

const avg = (v: number[]) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
const top10 = (ps: Player[]) => avg(ps.map(ovr).sort((a, b) => b - a).slice(0, 10))

const allTeams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].map(t => ({
  ...t, finance: { ...t.finance, budget: tierBudget(t) },
}))

// 生成は乱数なので1回だけだと1〜2ポイント揺れる。RUNS回まわして平均を出す
const RUNS = 20
const allSamples = new Map<string, number[]>()   // teamId → 上位10平均OVR のサンプル
const squadSamples = new Map<string, number[]>() // teamId → 全選手平均OVR のサンプル
for (let run = 0; run < RUNS; run++) {
  const { cpuPlayers, teamRosters } = generateCpuRosters(allTeams, 2027)
  for (const [tid, r] of Object.entries(teamRosters)) {
    const ps = r.main.map(id => cpuPlayers.find(p => p.id === id)!).filter(Boolean)
    ;(allSamples.get(tid) ?? allSamples.set(tid, []).get(tid)!).push(top10(ps))
    ;(squadSamples.get(tid) ?? squadSamples.set(tid, []).get(tid)!).push(avg(ps.map(ovr)))
  }
}
const top10Of = (tid: string) => avg(allSamples.get(tid) ?? [])
const squadOf = (tid: string) => avg(squadSamples.get(tid) ?? [])

console.log(`■ ${RUNS}回生成した平均\n格  帯          予算    チーム数  部       全選手平均  上位10平均  上位10平均の最強〜最弱`)
for (const tier of [...CLUB_TIERS].reverse() as ClubTier[]) {
  const teams = allTeams.filter(t => tierOf(t) === tier)
  if (teams.length === 0) {
    console.log(`${String(tier).padStart(2)}  ${''}  ${(TIER_BUDGET[tier] / 1e8).toFixed(2)}億      0     —        —           —`)
    continue
  }
  const all = teams.map(t => squadOf(t.id))
  const t10 = teams.map(t => top10Of(t.id))
  const divs = [...new Set(teams.map(t => divisionOf(t)))].sort().map(d => `${d}部`).join('/')
  console.log(
    `${String(tier).padStart(2)}  ${''}  ${(TIER_BUDGET[tier] / 1e8).toFixed(2)}億` +
    `  ${String(teams.length).padStart(6)}  ${divs.padEnd(7)}  ${avg(all).toFixed(1).padStart(8)}` +
    `  ${avg(t10).toFixed(1).padStart(10)}  ${Math.max(...t10).toFixed(1)} 〜 ${Math.min(...t10).toFixed(1)}`)
}
