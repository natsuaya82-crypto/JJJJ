/**
 * 裏の部（自分以外の部）の走行記録から数え直した通算成績が、
 * これまでの「出走数だけの集計」と一致することを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-away-records.ts --outfile=/tmp/car.cjs && node /tmp/car.cjs
 *
 * これまでは結果を捨てて awayAppearances（出走数と区間賞の数）だけ残していた。
 * 走行記録を残すようにしたので、通算成績はそこから数え直す（utils/careerStats）。
 * 数が変わると年俸も移籍金も動くので、切り替えで差が出ないことを先に見ておく。
 */
import { simulateAwayDivisions } from '../src/engine/domesticLeague'
import { buildCareerCounts } from '../src/utils/careerStats'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { LEAGUE_COURSE_POOL } from '../src/data/races'
import { DIVISIONS, DIVISION_LABEL, divisionOf } from '../src/utils/league'
import type { Race, Team } from '../src/types'

const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const players = generateCpuRosters(teams, 2028).cpuPlayers
const myDivision = 1

// 部ごとの日程（同じコースを使い回す。ここで見たいのは数え方だけ）
const mk = (id: string, tpl: typeof LEAGUE_COURSE_POOL[number]): Race => ({
  id, name: tpl.name, date: '2028-04-01', location: tpl.location ?? '',
  type: 'league', segments: tpl.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
})
const ROUNDS = 5
const divRaces: Record<number, Race[]> = {}
for (const d of DIVISIONS) {
  divRaces[d] = Array.from({ length: ROUNDS }, (_, i) => mk(`d${d}-r${i}`, LEAGUE_COURSE_POOL[i % LEAGUE_COURSE_POOL.length]))
}

// 走らせて、両方の数え方でためる
const oldCounts: Record<string, { races: number; wins: number }> = {}
const racedByDiv: Record<number, Race[]> = { 1: [], 2: [], 3: [] }
for (let r = 0; r < ROUNDS; r++) {
  const round = simulateAwayDivisions(divRaces[myDivision][r], teams, players, myDivision, 1, divRaces, r)
  for (const [pid, v] of Object.entries(round.careerAdd)) {
    const cur = oldCounts[pid] ?? { races: 0, wins: 0 }
    oldCounts[pid] = { races: cur.races + v.races, wins: cur.wins + v.segWins }
  }
  for (const { division, race } of round.raced) racedByDiv[division].push(race)
}

// 走行記録から数え直す（本番と同じ入口）
const fromRecords = buildCareerCounts([{ races: [], divisionRaces: racedByDiv }])

const ids = new Set([...Object.keys(oldCounts), ...fromRecords.keys()])
let sameRaces = 0, sameWins = 0
const diffs: string[] = []
for (const id of ids) {
  const a = oldCounts[id] ?? { races: 0, wins: 0 }
  const b = fromRecords.get(id) ?? { totalRaces: 0, segmentWins: 0 }
  if (a.races === b.totalRaces) sameRaces++
  else diffs.push(`  ${id}: 出走 ${a.races} → ${b.totalRaces}`)
  if (a.wins === b.segmentWins) sameWins++
  else diffs.push(`  ${id}: 区間賞 ${a.wins} → ${b.segmentWins}`)
}

const totalOldRaces = Object.values(oldCounts).reduce((s, v) => s + v.races, 0)
const totalNewRaces = [...fromRecords.values()].reduce((s, v) => s + v.totalRaces, 0)
const totalOldWins = Object.values(oldCounts).reduce((s, v) => s + v.wins, 0)
const totalNewWins = [...fromRecords.values()].reduce((s, v) => s + v.segmentWins, 0)

console.log(`裏の部 ${DIVISIONS.filter(d => d !== myDivision).map(d => DIVISION_LABEL[d]).join('・')} を ${ROUNDS}戦`)
console.log(`  走った選手        ${ids.size}人`)
console.log(`  のべ出走          集計 ${totalOldRaces} / 走行記録から ${totalNewRaces}`)
console.log(`  のべ区間賞        集計 ${totalOldWins} / 走行記録から ${totalNewWins}`)
console.log(`  一致した選手      出走 ${sameRaces}/${ids.size}・区間賞 ${sameWins}/${ids.size}`)
console.log('')
// 保存したレースの部が正しいことも見る
const wrongDiv = racedByDiv[myDivision].length
console.log(`  自分の部を二重に走らせていないか  ${wrongDiv === 0 ? 'OK（0本）' : `✗ ${wrongDiv}本`}`)
for (const d of DIVISIONS) {
  if (d === myDivision) continue
  const ok = racedByDiv[d].every(r => (r.results?.teamRankings ?? []).every(tr => divisionOf(teams.find(t => t.id === tr.teamId)) === d))
  console.log(`  ${DIVISION_LABEL[d]} の記録に他の部が混ざっていないか  ${ok ? 'OK' : '✗ 混ざっている'}`)
}
console.log('')
if (diffs.length === 0 && wrongDiv === 0) {
  console.log('✓ 走行記録から数え直しても、通算出走・通算区間賞は1つも変わらない')
  process.exit(0)
}
console.log(`✗ ${diffs.length}件の食い違い`)
for (const d of diffs.slice(0, 20)) console.log(d)
process.exit(1)
