/**
 * 「どのクラブがその選手を欲しがるか」を確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-foreign-suitors.ts --outfile=/tmp/cfs.cjs && node /tmp/cfs.cjs
 *
 * 見たいこと：
 *   ・3部のOVR70に、格1のクラブ（マドリードなど）から打診が来ないこと
 *   ・逆に誰からも来ない＝海外移籍が死ぬ、にもなっていないこと
 */
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { needsPlayer, wouldMakeLineup } from '../src/utils/squadNeeds'
import { foreignMinOvr, effectiveOvr } from '../src/utils/foreignClubProfile'
import { allForeignClubs } from '../src/utils/clubs'
import type { Player, Team } from '../src/types'

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, 2027).cpuPlayers as Player[]
const foreign = generateForeignLeaguePlayers(FOREIGN_LEAGUES, 2027).players as Player[]
const clubs = allForeignClubs(FOREIGN_LEAGUES)
const rosterOf = (id: string) => foreign.filter(p => p.teamId === id && p.status === 'active')

const suitors = (target: Player) => clubs.filter(c => {
  if (effectiveOvr(target) < foreignMinOvr(c.country)) return false
  const r = rosterOf(c.id)
  if (r.length === 0) return false
  return needsPlayer(r, target) || wouldMakeLineup(r, target)
})

// 代表的なOVR帯の選手を1人ずつ拾って、声を掛けてくるクラブを数える
const byOvr = new Map<number, Player>()
for (const p of domestic) {
  if (p.status !== 'active' || p.age > 33) continue
  const o = ovr(p)
  if (!byOvr.has(o)) byOvr.set(o, p)
}

console.log('OVR   年齢   声を掛けるクラブ数 / 全180   代表例')
for (const o of [70, 74, 77, 80, 84, 88]) {
  const p = byOvr.get(o)
  if (!p) { console.log(`${o}   —`); continue }
  const s = suitors(p)
  const names = s.slice(0, 3).map(c => c.shortName).join('・')
  console.log(`${o}    ${String(p.age).padStart(2)}歳    ${String(s.length).padStart(3)}クラブ                ${names || '（なし）'}`)
}

// 4大リーグのクラブが下位帯に声を掛けていないか
const ELITE = new Set(['africa_east', 'africa_ns', 'europe_ws', 'north_america'])
console.log('')
console.log('うち4大リーグ（世界最高峰）から声が掛かる数')
for (const o of [70, 74, 77, 80, 84, 88]) {
  const p = byOvr.get(o)
  if (!p) continue
  const n = suitors(p).filter(c => ELITE.has(c.leagueId ?? '')).length
  console.log(`  OVR${o}  ${n}クラブ`)
}
