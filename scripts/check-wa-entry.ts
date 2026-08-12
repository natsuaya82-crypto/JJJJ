/**
 * 【世界選手権・アジア予選への入口】
 *
 * ■なぜ要るか
 *   「アジア予選が開催されない」という報告が build 100番台を通してずっと残っていた。
 *   出場国を決める側（qualifierNations）は自国を必ず入れるように直してあるのに、
 *   **その年の大会に入る道のほうが塞がる**ことがあった。塞がり方は2つある。
 *
 *     ① セーブに残った古い大会  … 昔の版が作った「日本の居ない予選」がその年ぶんとして
 *                                  残っていると、作り直されず観戦のまま凍結される
 *     ② 画面の入口              … ホームのカードは1年に1度しか通らない。ECLの残り戦が
 *                                  あるあいだ大会のカードは出ないので、そちらにも入口が
 *                                  必要。無いとその年の大会が丸ごと消える
 *
 *   どちらも「開催されない」という同じ症状になるので、両方をここで見る。
 */
import { readFileSync } from 'node:fs'
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { newSeasonStandings, divisionOf } from '../src/utils/league'
import { HOME_NATION } from '../src/data/nationalities'
import type { SeasonStanding, Team, Player, Race } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const MY = 'tokyo'
const YEAR = 2029   // 奇数年＝アジア予選の年

// ── 予選の年・シーズン終了直後の世界を作る ─────────────────────────
function buildWorld() {
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  const foreignStandings: Record<string, SeasonStanding[]> = {}
  for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))
  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))
    .map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as Race)
  useGameStore.setState({
    isInitialized: true, playerTeamId: MY, teams, players, foreignLeagues: fgen.updatedLeagues,
    currentSeason: {
      year: YEAR, phase: 'regular', currentRaceIndex: races.length,
      races, standings, foreignStandings, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [] },
    pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
    worldTournament: undefined, worldRacePlans: undefined,
  } as never)
}

/** 古い版が作った「日本の居ない予選」を、その年ぶんとして置く */
function staleTournament(withResults: boolean) {
  return {
    year: YEAR, kind: 'qualifier' as const, host: 'JPN',
    participants: [{ id: 'nat_KOR', nat: 'KOR', name: '韓国', shortName: '韓国',
      colors: { primary: '#fff', secondary: '#000' }, isPlayerTeam: false }],
    squads: {}, raceIndex: withResults ? 1 : 0, points: {}, japanIn: false, finished: false,
    races: [1, 2, 3].map(i => ({
      id: `wa-${YEAR}-r${i}`, name: `${YEAR} 世界選手権アジア予選 第${i}戦`, location: '東京',
      type: 'league' as const, date: `${YEAR + 1}-01-0${i}`, segments: [],
      conditions: { temperature: 10, weather: 'sunny' as const, elevation: 0 },
      ...(withResults && i === 1 ? { results: { teamResults: [], segmentResults: [] } } : {}) })),
  }
}

console.log('① セーブに残った古い大会')
{
  buildWorld()
  useGameStore.setState({ worldTournament: staleTournament(false) } as never)
  useGameStore.getState().startWorldTournament()
  const t = useGameStore.getState().worldTournament!
  check('日本の居ない予選が残っていたら作り直す',
    t.participants.some(p => p.nat === HOME_NATION) && t.japanIn === true,
    `japanIn=${t.japanIn} 出場${t.participants.length}カ国`)
}
{
  // 走り出したものまで作り直すと、消化済みの結果が消える
  buildWorld()
  useGameStore.setState({ worldTournament: staleTournament(true) } as never)
  useGameStore.getState().startWorldTournament()
  const t = useGameStore.getState().worldTournament!
  check('走り出した大会は作り直さない（途中経過を消さない）',
    t.raceIndex === 1 && t.participants.length === 1, `raceIndex=${t.raceIndex} 出場${t.participants.length}カ国`)
}
{
  // 自国が入っている普通の大会は、当然そのまま続く
  buildWorld()
  useGameStore.getState().startWorldTournament()
  const first = useGameStore.getState().worldTournament!
  useGameStore.getState().startWorldTournament()
  const again = useGameStore.getState().worldTournament!
  check('普通に開催中の大会は毎回作り直されない', first === again)
  check('予選には自国が必ず入る', again.japanIn === true && again.kind === 'qualifier')
}

console.log('\n② 画面の入口')
{
  const dash = readFileSync('src/components/dashboard/Dashboard.tsx', 'utf8')
  // ECLの残り戦の分岐（seasonDone && nextEclRace）から、大会カードの分岐までを切り出す
  const from = dash.indexOf('seasonDone && nextEclRace ?')
  const to = dash.indexOf('seasonDone && !waDone ?', from)
  const eclBranch = from >= 0 && to > from ? dash.slice(from, to) : ''
  check('ECLの残り戦の分岐がある', eclBranch.length > 0)
  check('その分岐にも大会へ進む入口がある', eclBranch.includes('goWorldAthletics'),
    'ECL消化中は大会のカードが出ないので、ここに入口が無いとその年の大会が消える')
  check('入口を「選考済みかどうか」で隠していない',
    !/waSquadReady\s*&&[\s\S]{0,200}goWorldAthletics/.test(eclBranch),
    '選考前でも大会には入れること（選考は大会の中でもやり直せる）')

  const page = readFileSync('src/components/international/WorldTournamentPage.tsx', 'utf8')
  check('大会ページは「無い」で終わらせず、その場で開く',
    /if\s*\(!t\)\s*useGameStore\.getState\(\)\.startWorldTournament\(\)/.test(page),
    '行き止まりにすると、その年の大会は二度と開けない')
}

console.log(problems.length === 0 ? '\n  → OK' : `\n  → NG ${problems.length}件`)
process.exit(problems.length === 0 ? 0 : 1)
