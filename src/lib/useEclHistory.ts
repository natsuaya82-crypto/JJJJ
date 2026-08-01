import { useGameStore } from '../store/gameStore'
import { eclHistoryOf } from '../utils/eclHistory'
import type { EclHistoryEntry } from '../types'

// ECLの歴代優勝を画面から読むためのフック。
// 記録はセーブに持たず、保存してあるECLのレース結果から数え直す（utils/eclHistory.ts）。
// 中身が変わらない限り同じ物を返すので、これで再描画が増えることはない。
export function useEclHistory(): EclHistoryEntry[] {
  return useGameStore(s => eclHistoryOf(s.pastSeasons, s.currentSeason))
}
