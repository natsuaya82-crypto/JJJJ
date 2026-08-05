// リーグごとの戦力を実測する（クラブの格の帯を決めるための計測）。
//
//   npx ts-node --compilerOptions '{"module":"commonjs"}' scripts/measure-strength.ts
//
// 出すのは「上位10人の平均OVR」。クラブの強さを1つの数で比べたいときの物差しで、
// utils/clubPrestige.ts の prestigeScore と同じ考え方（あちらは年俸ベース）。
//
// 環境変数 RANK_UP=off で generateCpuRosters のランク引き上げを外して測れる。
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { tierBudget, tierOf, TIER_LABEL } from '../src/utils/clubTier'
import type { Player, Team } from '../src/types'

const top10 = (ps: Player[]): number => {
  const v = ps.map(ovr).sort((a, b) => b - a).slice(0, 10)
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0
}

function run() {
  const allTeams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].map(t => ({
    ...t,
    finance: { ...t.finance, budget: tierBudget(t) },
  }))

  const { cpuPlayers, teamRosters } = generateCpuRosters(allTeams, 2027)
  const byTeam = new Map<string, Player[]>()
  for (const [tid, roster] of Object.entries(teamRosters)) {
    byTeam.set(tid, roster.main.map(id => cpuPlayers.find(p => p.id === id)!).filter(Boolean))
  }

  console.log('■ 国内（上位10人の平均OVR）')
  for (const div of [1, 2, 3] as const) {
    const teams = allTeams.filter(t => (t.division ?? 1) === div)
    const rows = teams
      .map(t => ({ t, v: top10(byTeam.get(t.id) ?? []) }))
      .sort((a, b) => b.v - a.v)
    const avg = rows.reduce((s, r) => s + r.v, 0) / rows.length
    console.log(`  ${div}部  平均 ${avg.toFixed(1)}  最強 ${rows[0].v.toFixed(1)}(${rows[0].t.shortName})  最弱 ${rows[rows.length - 1].v.toFixed(1)}(${rows[rows.length - 1].t.shortName})`)
    for (const r of rows) console.log(`        ${r.v.toFixed(1)}  格${String(tierOf(r.t)).padStart(2)} ${TIER_LABEL[tierOf(r.t)]}  ${r.t.name}  (予算 ${(r.t.finance.budget / 1e8).toFixed(2)}億)`)
  }

  console.log('\n■ 海外（上位10人の平均OVR）')
  const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, 2027)
  const byClub = new Map<string, Player[]>()
  for (const p of foreign) {
    if (!p.teamId) continue
    const arr = byClub.get(p.teamId)
    if (arr) arr.push(p)
    else byClub.set(p.teamId, [p])
  }
  for (const league of FOREIGN_LEAGUES) {
    const rows = league.clubs
      .map(c => ({ c, v: top10(byClub.get(c.id) ?? []) }))
      .sort((a, b) => b.v - a.v)
    const avg = rows.reduce((s, r) => s + r.v, 0) / rows.length
    console.log(`  ${league.name.padEnd(12)} 平均 ${avg.toFixed(1)}  最強 ${rows[0].v.toFixed(1)}(${rows[0].c.shortName})  最弱 ${rows[rows.length - 1].v.toFixed(1)}`)
  }
}

run()
