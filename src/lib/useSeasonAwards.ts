import { useGameStore } from '../store/gameStore'
import { seasonAwardsOf } from '../utils/awards'
import type { SeasonAward } from '../types'

// 歴代の年度MVP・新人王を画面から読むためのフック。
// 表彰はセーブに持たず、保存してあるレース結果から選び直す（utils/awards.ts）。
// 中身が変わらない限り同じ物を返すので、これで再描画が増えることはない。
export function useSeasonAwards(): SeasonAward[] {
  return useGameStore(s => seasonAwardsOf(s.pastSeasons, s.players, s.removedPlayers))
}
