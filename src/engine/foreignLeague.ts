import type { ForeignLeague, ForeignStanding, Player, Race } from '../types'
import { simulateRace } from './raceEngine'
import { ovr } from '../utils/playerUtils'

// 海外リーグの順位表を初期化（全クラブ 0pt）。
export function initForeignStandings(foreignLeagues: ForeignLeague[]): Record<string, ForeignStanding[]> {
  const out: Record<string, ForeignStanding[]> = {}
  for (const league of foreignLeagues) {
    out[league.id] = league.clubs.map(c => ({ clubId: c.id, totalPoints: 0, raceResults: [] }))
  }
  return out
}

// 各クラブのOVR上位選手を race の各区間に割り当てる。
function buildClubLineup(clubPlayerIds: string[], players: Player[], race: Race): Record<number, string> {
  const roster = clubPlayerIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is Player => !!p && p.status === 'active')
    .sort((a, b) => ovr(b) - ovr(a))
  const lineup: Record<number, string> = {}
  race.segments.forEach((seg, i) => {
    if (roster[i]) lineup[seg.index] = roster[i].id
  })
  return lineup
}

// 海外リーグを1マッチデー進める。全リーグの各クラブが race を走り、順位表と
// 出走選手の career（通算レース・区間賞）を更新する。プレイヤーは干渉せず結果のみ。
export function simulateForeignLeagueRound(
  race: Race,
  foreignLeagues: ForeignLeague[],
  players: Player[],
  standingsByLeague: Record<string, ForeignStanding[]>,
  seasonProgress: number,
): { standingsByLeague: Record<string, ForeignStanding[]>; players: Player[] } {
  const careerAdd: Record<string, { races: number; segWins: number }> = {}
  const newStandings: Record<string, ForeignStanding[]> = { ...standingsByLeague }

  for (const league of foreignLeagues) {
    const lineups: Record<string, Record<number, string>> = {}
    for (const club of league.clubs) {
      lineups[club.id] = buildClubLineup(club.playerIds, players, race)
    }
    // teams=[] で呼ぶ（海外クラブはteams未登録＝本拠地補正1.0中立になる）
    const results = simulateRace(race, lineups, [], players, seasonProgress)

    const prev = newStandings[league.id] ?? league.clubs.map(c => ({ clubId: c.id, totalPoints: 0, raceResults: [] }))
    newStandings[league.id] = prev.map(s => {
      const tr = results.teamRankings.find(r => r.teamId === s.clubId)
      if (!tr) return s
      const earned = tr.positionPoints + tr.segmentPoints
      return {
        ...s,
        totalPoints: s.totalPoints + earned,
        raceResults: [...s.raceResults, { raceId: race.id, rank: tr.rank, points: earned }],
      }
    })

    // career: 出走選手の通算レース+1、区間賞ぶんの segmentWins を加算
    const racingIds = new Set(Object.values(lineups).flatMap(l => Object.values(l)))
    for (const id of racingIds) {
      const segWins = results.segmentResults.filter(sr => sr.runners[0]?.playerId === id).length
      const cur = careerAdd[id] ?? { races: 0, segWins: 0 }
      careerAdd[id] = { races: cur.races + 1, segWins: cur.segWins + segWins }
    }
  }

  const updatedPlayers = players.map(p => {
    const add = careerAdd[p.id]
    if (!add) return p
    return { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + add.races, segmentWins: p.career.segmentWins + add.segWins } }
  })

  return { standingsByLeague: newStandings, players: updatedPlayers }
}

// シーズン終了時、各海外リーグの優勝クラブ所属選手に career.championships +1。
export function applyForeignChampions(
  foreignLeagues: ForeignLeague[],
  players: Player[],
  standingsByLeague: Record<string, ForeignStanding[]>,
): Player[] {
  const champIds = new Set<string>()
  for (const league of foreignLeagues) {
    const st = standingsByLeague[league.id]
    if (!st || st.length === 0) continue
    const champ = [...st].sort((a, b) => b.totalPoints - a.totalPoints)[0]
    if (!champ) continue
    const club = league.clubs.find(c => c.id === champ.clubId)
    club?.playerIds.forEach(id => champIds.add(id))
  }
  if (champIds.size === 0) return players
  return players.map(p => champIds.has(p.id)
    ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
    : p)
}
