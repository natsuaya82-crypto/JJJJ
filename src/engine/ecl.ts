import type { EclResult, EclStanding, Player, Race, Team } from '../types'
import { simulateRace } from './raceEngine'
import { ovr } from '../utils/playerUtils'

// ECL出場チーム（日本チーム or 海外クラブ）。playerIds から各区間にOVR上位を割り当てて走らせる。
export type EclParticipant = Omit<EclStanding, 'points'> & { playerIds: string[] }

function lineupFor(playerIds: string[], players: Player[], race: Race): Record<number, string> {
  const roster = playerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p && p.status === 'active')
    .sort((a, b) => ovr(b) - ovr(a))
  const lineup: Record<number, string> = {}
  race.segments.forEach((seg, i) => {
    if (roster[i]) lineup[seg.index] = roster[i].id
  })
  return lineup
}

// ECLを自動シミュレート。16チームが3戦を走り、合計勝点（順位点+区間点）で優勝を決める。
export function simulateEclEvent(params: {
  year: number
  participants: EclParticipant[]
  races: Race[]
  teams: Team[]
  players: Player[]
}): EclResult {
  const { year, participants, races, teams, players } = params
  const pts: Record<string, number> = {}
  participants.forEach(p => { pts[p.id] = 0 })

  for (const race of races) {
    const lineups: Record<string, Record<number, string>> = {}
    participants.forEach(p => { lineups[p.id] = lineupFor(p.playerIds, players, race) })
    const results = simulateRace(race, lineups, teams, players, 0.5)
    results.teamRankings.forEach(tr => {
      pts[tr.teamId] = (pts[tr.teamId] ?? 0) + tr.positionPoints + tr.segmentPoints
    })
  }

  const standings: EclStanding[] = participants
    .map(({ playerIds: _ids, ...p }) => ({ ...p, points: pts[p.id] ?? 0 }))
    .sort((a, b) => b.points - a.points)

  return {
    year,
    championId: standings[0]?.id ?? '',
    standings,
    races: races.map(r => ({ name: r.name, raceId: r.id })),
  }
}
