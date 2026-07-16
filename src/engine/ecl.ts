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

// ECLを開催（一発勝負）。16チームが1つの国際コースを走り、総合タイムで世界一を決める。
// playerLineup を渡すと自チームはその区間配置で走る（未指定・不出場ならOVR上位を自動配置）。
export function simulateEclEvent(params: {
  year: number
  participants: EclParticipant[]
  races: Race[]
  teams: Team[]
  players: Player[]
  playerLineup?: { teamId: string; lineup: Record<number, string> }
}): EclResult {
  const { year, participants, races, teams, players, playerLineup } = params
  const race = races[0]

  const lineups: Record<string, Record<number, string>> = {}
  participants.forEach(p => {
    if (playerLineup && p.id === playerLineup.teamId && Object.keys(playerLineup.lineup).length > 0) {
      lineups[p.id] = playerLineup.lineup
    } else {
      lineups[p.id] = lineupFor(p.playerIds, players, race)
    }
  })

  const results = simulateRace(race, lineups, teams, players, 0.5)

  // 最終順位＝総合タイム昇順
  const timeById = new Map(results.teamRankings.map(tr => [tr.teamId, tr.totalTimeSec]))
  const ptsById = new Map(results.teamRankings.map(tr => [tr.teamId, tr.positionPoints + tr.segmentPoints]))
  const standings: EclStanding[] = participants
    .map(({ playerIds: _ids, ...p }) => ({
      ...p,
      points: ptsById.get(p.id) ?? 0,
      timeSec: timeById.get(p.id) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => (a.timeSec ?? 0) - (b.timeSec ?? 0))

  const championId = standings[0]?.id ?? ''
  // 優勝チームの出走メンバー（記録パッチ付与用）
  const winnerPlayerIds = results.segmentResults
    .flatMap(sr => sr.runners.filter(r => r.teamId === championId).map(r => r.playerId))

  // 大会MVP：区間1位のうち「2位に最も差をつけた」選手（最も突出した走り）
  let mvpPlayerId: string | undefined
  let bestGap = -1
  for (const sr of results.segmentResults) {
    const sorted = [...sr.runners].sort((a, b) => a.timeSec - b.timeSec)
    const top = sorted[0]
    if (!top) continue
    const gap = (sorted[1]?.timeSec ?? top.timeSec) - top.timeSec
    if (gap > bestGap) { bestGap = gap; mvpPlayerId = top.playerId }
  }

  return {
    year,
    championId,
    standings,
    races: [{ name: race.name, raceId: race.id }],
    raceResults: results,
    winnerPlayerIds,
    mvpPlayerId,
  }
}
