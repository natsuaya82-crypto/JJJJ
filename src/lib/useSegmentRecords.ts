import { useGameStore } from '../store/gameStore'
import { segmentRecordsOf, type RecordKind, type SegmentRecordMap } from '../utils/segmentRecords'

// 区間記録（歴代トップ10）を画面から読むためのフック。
// 記録はセーブに持たず、保存してあるレース結果から数え直す（utils/segmentRecords.ts）。
// 中身が変わらない限り同じ物を返すので、これで再描画が増えることはない。
export function useSegmentRecords(kind: RecordKind = 'main'): SegmentRecordMap {
  return useGameStore(s => segmentRecordsOf(s.pastSeasons, s.currentSeason, kind))
}
