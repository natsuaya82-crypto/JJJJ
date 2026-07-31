import { useMemo } from 'react'
import { useGameStore } from '../store/gameStore'
import { makeClubIndex, type Club, type ClubIndex } from '../utils/clubs'

// ============================================================================
// 画面から「IDでクラブを引く」ときの入り口。
// 国内チームでも海外クラブでも同じように引ける（utils/clubs.ts が唯一のルール）。
//
//   const club = useClubIndex()
//   club.byId(player.teamId)?.name
//
// 索引はチーム／海外リーグが変わったときだけ作り直す。
// ============================================================================
export function useClubIndex(): ClubIndex {
  const teams = useGameStore(s => s.teams)
  const foreignLeagues = useGameStore(s => s.foreignLeagues)
  return useMemo(() => makeClubIndex(teams, foreignLeagues), [teams, foreignLeagues])
}

export type { Club, ClubIndex }
