/**
 * いま遊んでいるセーブ（build 105 相当＝persist v39）を読み込んだときに何が起きるかを測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-save-impact.ts --outfile=/tmp/msi.cjs && node /tmp/msi.cjs
 *
 * 見るのは3つ。
 *   1. 読み込みで落ちないか（移行が最後まで走るか）
 *   2. 消えてはいけないものが消えていないか（順位表・走行記録・資金・選手）
 *   3. セーブの大きさがどう変わるか（team.roster を落としたぶん）
 */
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES } from '../src/utils/league'
import { clubSeasonRank } from '../src/utils/clubStanding'
import { squadIdsOf } from '../src/utils/rosterSync'
import type { SeasonStanding, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2032
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players = [...cpu.cpuPlayers, ...fgen.players]

// v39 のセーブを組み立てる（team.roster あり／foreignStandings は teamId）
const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
let seed = 7
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
for (const d of DIVISIONS) for (let r = 0; r < DIVISION_RACES[d]; r++) for (const row of standings[d]) {
  const pts = Math.round(rnd() * 20)
  row.totalPoints += pts
  row.raceResults.push({ raceId: `d${d}-r${r}`, rank: 1 + Math.floor(rnd() * 16), points: pts })
}
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const l of fgen.updatedLeagues) {
  foreignStandings[l.id] = l.clubs.map(c => ({ teamId: c.id, totalPoints: Math.round(rnd() * 90), raceResults: [] }))
}
const teamsV39 = base.map(t => ({
  ...t,
  roster: { main: squadIdsOf(players, t.id) },   // v39 まではクラブ側にも名簿があった
  finance: { budget: 500_000_000 },
}))
const save: Record<string, unknown> = {
  isInitialized: true,
  playerTeamId: 'fukuoka',
  teams: teamsV39,
  players,
  foreignLeagues: fgen.updatedLeagues,
  currentSeason: { year: YEAR, races: [], standings, foreignStandings, newsFeed: [], objectives: [] },
  pastSeasons: [{ year: YEAR - 1, races: [], standings, foreignStandings }],
  worldAthleticsResults: [],
  worldRepresentatives: [],
}

const before = JSON.stringify(save).length
console.log(`v39 のセーブ：${(before / 1024).toFixed(0)} KB / 選手 ${players.length}人 / クラブ ${base.length + fgen.updatedLeagues.reduce((s, l) => s + l.clubs.length, 0)}`)
console.log('')

const migrate = (useGameStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => Record<string, unknown> }).migrate
if (!migrate) { console.log('✗ migrate が取り出せない'); process.exit(1) }
let after: Record<string, unknown>
try {
  after = migrate(JSON.parse(JSON.stringify(save)), 39)
} catch (e) {
  console.log(`✗ 読み込みで例外: ${(e as Error).message}`)
  process.exit(1)
}

console.log('[1] 読み込み')
check('例外なく読み込める', true)

console.log('')
console.log('[2] 消えてはいけないもの')
{
  const tA = after.teams as Record<string, unknown>[]
  const pA = after.players as unknown[]
  const cs = after.currentSeason as { standings?: Record<string, unknown[]>; foreignStandings?: Record<string, unknown[]> }
  check('選手が1人も消えていない', pA.length === players.length, `${pA.length} / ${players.length}`)
  check('チームが1つも消えていない', tA.length === base.length, `${tA.length} / ${base.length}`)
  check('資金が残っている', tA.every(t => (t.finance as { budget?: number })?.budget === 500_000_000))
  check('国内の順位表が残っている', DIVISIONS.every(d => (cs.standings?.[String(d)] ?? []).length > 0))
  check('海外の順位表が残っている', Object.keys(cs.foreignStandings ?? {}).length === fgen.updatedLeagues.length)
  // 順位が引けること（画面が見るのと同じ経路）
  const r = clubSeasonRank(after.currentSeason as never, 'fukuoka')
  check('自チームの順位が引ける', r.rank > 0 && r.total === 52, JSON.stringify(r))
  const fr = clubSeasonRank(after.currentSeason as never, fgen.updatedLeagues[0].clubs[0].id)
  check('海外クラブの順位が引ける', fr.rank > 0, JSON.stringify(fr))
}

console.log('')
console.log('[3] 落としたもの（クラブ側の名簿）')
{
  const tA = after.teams as Record<string, unknown>[]
  check('team.roster が消えている', !tA.some(t => 'roster' in t))
  // 在籍は player.teamId から引けること
  const ids = squadIdsOf(after.players as never, 'fukuoka')
  check('在籍は選手側から引ける', ids.length > 0, `${ids.length}人`)
  const afterSize = JSON.stringify(after).length
  const diff = before - afterSize
  console.log(`  セーブの大きさ：${(before / 1024).toFixed(0)} KB → ${(afterSize / 1024).toFixed(0)} KB（${diff > 0 ? '-' : '+'}${Math.abs(diff / 1024).toFixed(1)} KB）`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ いまのセーブを読み込んでも、選手・クラブ・資金・順位表は何も消えない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
