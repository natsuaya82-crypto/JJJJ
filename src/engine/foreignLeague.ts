import type { LeagueId, Player, Season } from '../types'
// 所属の判定は国内チームと同じものを使う（クラブ側に名簿は持たない）
import { belongsToClub } from '../utils/rosterSync'
import { rankedStandings } from '../utils/league'

// ★海外リーグを走らせるのは engine/leagueDay の runLeaguesThrough（国内の他の部と同じ1本）。
//   以前ここにあった simulateForeignLeagueRound（自チームの何戦目かで1戦ずつ進める）は消した。

// シーズン終了時、各海外リーグの優勝クラブ所属選手に career.championships +1。
export function applyForeignChampions(
  leagueIds: readonly LeagueId[],
  players: Player[],
  leagues: Season['leagues'],
): Player[] {
  const champIds = new Set<string>()
  for (const id of leagueIds) {
    const st = leagues[id]?.standings
    if (!st || st.length === 0) continue
    const champ = rankedStandings(st)[0]
    if (!champ) continue
    for (const p of players) if (belongsToClub(p, champ.teamId)) champIds.add(p.id)
  }
  if (champIds.size === 0) return players
  return players.map(p => champIds.has(p.id)
    ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
    : p)
}
