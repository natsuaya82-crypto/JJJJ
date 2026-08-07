/**
 * 「必要だから動く」が、移籍の入口すべてを通っているかを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-demand-gates.ts --outfile=/tmp/cdg.cjs && node /tmp/cdg.cjs
 *
 * 入口ごとに「そのクラブがその選手を欲しがるか」を数え、
 * どこかが素通り（＝全クラブが欲しがる）になっていないかを見る。
 */
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { needsPlayer } from '../src/utils/squadNeeds'
import { allForeignClubs } from '../src/utils/clubs'
import type { Player, Team } from '../src/types'

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, 2027).cpuPlayers as Player[]
const foreign = generateForeignLeaguePlayers(FOREIGN_LEAGUES, 2027).players as Player[]
const fClubs = allForeignClubs(FOREIGN_LEAGUES)

const dRoster = (id: string) => domestic.filter(p => p.teamId === id && p.status === 'active')
const fRoster = (id: string) => foreign.filter(p => p.teamId === id && p.status === 'active')

const byOvr = new Map<number, Player>()
for (const p of domestic) {
  if (p.status !== 'active' || p.age > 33) continue
  if (!byOvr.has(ovr(p))) byOvr.set(ovr(p), p)
}

console.log('その選手を「必要」とするクラブの割合')
console.log('OVR    国内52クラブ    海外180クラブ')
for (const o of [70, 74, 77, 80, 85, 90]) {
  const p = byOvr.get(o)
  if (!p) continue
  const d = teams.filter(t => needsPlayer(dRoster(t.id), p)).length
  const f = fClubs.filter(c => needsPlayer(fRoster(c.id), p)).length
  console.log(`${o}      ${String(d).padStart(2)} (${String(Math.round(d / teams.length * 100)).padStart(2)}%)      ${String(f).padStart(3)} (${String(Math.round(f / fClubs.length * 100)).padStart(2)}%)`)
}
