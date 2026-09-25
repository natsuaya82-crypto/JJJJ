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
// 索引はクラブの並びが変わったときだけ作り直す。
// ============================================================================
export function useClubIndex(): ClubIndex {
  const clubs = useGameStore(s => s.clubs)
  return useMemo(() => makeClubIndex(clubs), [clubs])
}

export type { Club, ClubIndex }
