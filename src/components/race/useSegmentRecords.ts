// 本編の区間記録（大会名-区番号 → 速い順）。3D中継と一覧の区間記録の札が同じここを読む
import { useMemo } from 'react'
import { useGameStore } from '../../store/gameStore'
import { segmentRecordsOf, type SegmentRecordMap } from '../../utils/segmentRecords'

export function useSegmentRecords(): SegmentRecordMap {
  const pastSeasons = useGameStore(s => s.pastSeasons)
  const currentSeason = useGameStore(s => s.currentSeason)
  return useMemo(() => segmentRecordsOf(pastSeasons, currentSeason, 'main'), [pastSeasons, currentSeason])
}
