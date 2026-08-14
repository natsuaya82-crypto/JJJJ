import type { Facilities, EclResult, EclStanding, Player, Race, Team } from '../types'
import { runBackgroundRace } from './backgroundRace'
import { type TieredTeam } from '../utils/clubTier'

// ECL出場チーム（日本チーム or 海外クラブ）。playerIds から各区間へ地形適性に応じて割り当てて走らせる。
export type EclParticipant = Omit<EclStanding, 'points'> & { playerIds: string[] }

/**
 * 名簿の選手IDを「走れる人」と「最後の穴埋めにだけ使う人」に分ける。
 * **区間への並べ方は決めない**（engine/backgroundRace の bgLineup 1本）。
 *
 * 負傷者を reserve に回すのは、1区間でも走者が欠けると「再生では総合タイムが少なく＝1位、
 * 結果画面ではバケット方式で最下位」という順位の食い違いが起きるため。
 * 空区間を残すよりは負傷者でも走らせる。
 */
export function eclRoster(playerIds: string[], players: Player[]): { roster: Player[]; reserve: Player[] } {
  const all = playerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p && p.status !== 'retired')
  return { roster: all.filter(p => p.status !== 'injured'), reserve: all.filter(p => p.status === 'injured') }
}

// ECLを開催（一発勝負）。16チームが1つの国際コースを走り、総合タイムで世界一を決める。
// playerLineup を渡すと自チームはその区間配置で走る（未指定・不出場ならOVR上位を自動配置）。
export function simulateEclEvent(params: {
  year: number
  participants: EclParticipant[]
  races: Race[]
  teams: Team[]
  players: Player[]
  /**
   * 施設（戦術室）を効かせる相手。**国内52＋海外180をまとめて渡すこと**
   * （`allTieredClubs`）。ECLは海外クラブも走るので、`teams` だけだと
   * 国内クラブにしか施設が効かない
   */
  clubs?: readonly (TieredTeam & { id?: string; facilities?: Facilities })[]
  playerLineup?: { teamId: string; lineup: Record<number, string> }
}): EclResult {
  const { year, participants, races, teams, players, clubs, playerLineup } = params
  const race = races[0]

  // 走らせるのは engine/backgroundRace の1本（並べ方も穴埋めもそこ）。
  // 自チームが出るときだけ監督の配置を差し込む
  const out = runBackgroundRace({
    race, teams, players, clubs, seasonProgress: 0.5,
    entrants: participants.map(p => ({
      id: p.id,
      ...eclRoster(p.playerIds, players),
      lineup: (playerLineup && p.id === playerLineup.teamId) ? playerLineup.lineup : undefined,
    })),
  })
  const results = out.race.results!

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
