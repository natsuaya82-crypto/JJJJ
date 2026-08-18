/** 世界を回して、格1のクラブが残っているかを数える（使い捨ての計測） */
let sd = 20260818
Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }

import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { tierOf } from '../src/utils/clubTier'
import { useGameStore } from '../src/store/gameStore'
import type { Player, SeasonStanding, Team } from '../src/types'

const YEAR = 2030, MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
for (const d of DIVISIONS) standings[d].forEach((row, i) => {
  row.totalPoints = (standings[d].length - i) * DIVISION_RACES[d]
  for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: standings[d].length - i })
})
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))
const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))
useGameStore.setState({
  isInitialized: true, playerTeamId: MY, teams, players, foreignLeagues: fgen.updatedLeagues,
  currentSeason: { year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
    standings, foreignStandings, newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
  pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
} as never)

const count = (label: string) => {
  const lgs = useGameStore.getState().foreignLeagues ?? []
  const all = lgs.flatMap(l => l.clubs.map(c => tierOf(c)))
  const hist: Record<number, number> = {}
  for (const t of all) hist[t] = (hist[t] ?? 0) + 1
  console.log(`${label}  格1=${hist[1] ?? 0}  格2=${hist[2] ?? 0}  格3=${hist[3] ?? 0}  格4=${hist[4] ?? 0}  (海外${all.length}クラブ)`)
}
count('初期    ')
for (let y = 0; y < 8; y++) {
  useGameStore.getState().endSeason()
  count(`${YEAR + y + 1}年 `)
}
