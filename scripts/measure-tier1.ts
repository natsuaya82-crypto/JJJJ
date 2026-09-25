/** 世界を回して、格1のクラブが残っているかを数える（使い捨ての計測） */
let sd = 20260818
Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }

import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { clubsWhere, isJpelLeague } from '../src/utils/world'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { tierOf } from '../src/utils/clubTier'
import { useGameStore } from '../src/store/gameStore'
import type { Player, SeasonStanding, Team } from '../src/types'
import { seasonLeaguesFixture } from './seasonFixture'

const YEAR = 2030, MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, YEAR)
const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
for (const d of DIVISIONS) standings[d].forEach((row, i) => {
  row.totalPoints = (standings[d].length - i) * DIVISION_RACES[d]
  for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: standings[d].length - i })
})
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const l of FOREIGN_LEAGUES) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))
const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))
useGameStore.setState({
  isInitialized: true, playerTeamId: MY, clubs: [...teams, ...INITIAL_FOREIGN_CLUBS], players,
  currentSeason: { year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    leagues: seasonLeaguesFixture({ myDivision: divisionOf(teams.find(t => t.id === MY)!),
      races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as never), standings, foreignStandings }),
    newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
  pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
} as never)

const count = (label: string) => {
  const all = clubsWhere(useGameStore.getState().clubs, c => !isJpelLeague(c.leagueId)).map(c => tierOf(c))
  const hist: Record<number, number> = {}
  for (const t of all) hist[t] = (hist[t] ?? 0) + 1
  console.log(`${label}  格1=${hist[1] ?? 0}  格2=${hist[2] ?? 0}  格3=${hist[3] ?? 0}  格4=${hist[4] ?? 0}  (海外${all.length}クラブ)`)
}
count('初期    ')
for (let y = 0; y < 8; y++) {
  useGameStore.getState().endSeason()
  count(`${YEAR + y + 1}年 `)
}
