import type { EclResult, EclStanding, Player, Race, Team } from '../types'
import { simulateRace, assignLineupByTerrain } from './raceEngine'

// ECL出場チーム（日本チーム or 海外クラブ）。playerIds から各区間へ地形適性に応じて割り当てて走らせる。
export type EclParticipant = Omit<EclStanding, 'points'> & { playerIds: string[] }

function lineupFor(playerIds: string[], players: Player[], race: Race): Record<number, string> {
  // 出場不可（引退/負傷）だけ除外。status未設定の海外選手も走れるようにする。
  const roster = playerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p && p.status !== 'retired' && p.status !== 'injured')
  // OVR順の機械配置ではなく、区間の地形（山・下り）に応じて専門選手を最適配置する。
  return assignLineupByTerrain(roster, race)
}

// 全区間に必ず走者を立てる（空区間を控えで穴埋め）。
// 1区間でも走者が欠けると「再生では総合タイムが少なく＝1位、結果画面ではバケット方式で最下位」という
// 順位の食い違いが起きるため、シミュ前に必ず全区間を埋めて incomplete を発生させない。
function ensureAllSegments(lineup: Record<number, string>, playerIds: string[], players: Player[], race: Race): Record<number, string> {
  const out: Record<number, string> = { ...lineup }
  const used = new Set(Object.values(out).filter(Boolean))
  const roster = playerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p && p.status !== 'retired')
  // 空区間はまず健康な控えで、足りなければ負傷者でも埋める（空区間を残すよりは走らせる）
  const bench = [...roster.filter(p => p.status !== 'injured'), ...roster.filter(p => p.status === 'injured')]
  for (const seg of race.segments) {
    const cur = out[seg.index]
    if (cur && players.some(p => p.id === cur)) continue   // 既に有効な選手が入っている
    const pick = bench.find(p => !used.has(p.id))
    if (pick) { out[seg.index] = pick.id; used.add(pick.id) }
  }
  return out
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
    const base = (playerLineup && p.id === playerLineup.teamId && Object.keys(playerLineup.lineup).length > 0)
      ? playerLineup.lineup
      : lineupFor(p.playerIds, players, race)
    // 自チーム・AIとも、空区間を必ず控えで埋めて全区間完走させる（順位の食い違いバグの根本対策）
    lineups[p.id] = ensureAllSegments(base, p.playerIds, players, race)
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
