// 年俸の分布を測る（上限が安すぎないかの確認用）。使い捨てではなく残す。
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import type { Player, Team } from '../src/types'

const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].map(t => ({
  ...t, finance: { ...t.finance, budget: tierBudget(t) },
}))
const { cpuPlayers, teamRosters } = generateCpuRosters(teams, 2027)
const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, 2027)
const all = [...cpuPlayers, ...foreign]
const man = (n: number) => (n / 1e4).toFixed(0) + '万'

const sorted = [...all].sort((a, b) => b.contract.annualSalary - a.contract.annualSalary)
console.log('■ 全232クラブ・全選手の年俸トップ10')
for (const p of sorted.slice(0, 10)) {
  console.log(`  ${man(p.contract.annualSalary).padStart(7)}  OVR${ovr(p)}  ${p.age}歳  ${p.name}`)
}
console.log(`\n  中央値 ${man(sorted[Math.floor(sorted.length / 2)].contract.annualSalary)}  最低 ${man(sorted[sorted.length - 1].contract.annualSalary)}  人数 ${sorted.length}`)

console.log('\n■ 格1相当のクラブ（国内最上位＝格2）の年俸の並び')
const best = teams.filter(t => tierOf(t) === 2)[0]
const roster = (teamRosters[best.id]?.main ?? []).map(id => cpuPlayers.find(p => p.id === id)!).filter(Boolean) as Player[]
const rs = [...roster].sort((a, b) => b.contract.annualSalary - a.contract.annualSalary)
const total = rs.reduce((s, p) => s + p.contract.annualSalary, 0)
console.log(`  ${best.name}（格${tierOf(best)}・${rs.length}人・総年俸 ${(total / 1e8).toFixed(2)}億・平均 ${man(total / rs.length)}）`)
for (const [i, p] of rs.entries()) {
  console.log(`   ${String(i + 1).padStart(2)}. ${man(p.contract.annualSalary).padStart(7)}  OVR${ovr(p)}  ${p.age}歳  （平均の${(p.contract.annualSalary / (total / rs.length)).toFixed(2)}倍）`)
}
