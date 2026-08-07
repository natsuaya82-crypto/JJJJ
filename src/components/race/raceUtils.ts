// 地形の判定は utils/terrain.ts の1本。ここは表示用の入口だけ。
import { terrainKindOf, TERRAIN_LABEL, TERRAIN_COLOR } from '../../utils/terrain'

export function terrainColor(uphillPct: number, downhillPct: number): string {
  // 色は距離を見ない（スプリント・長距離・中距離は同じ平坦色）
  return TERRAIN_COLOR[terrainKindOf(uphillPct, downhillPct, 10)]
}

export function terrainLabel(uphillPct: number, downhillPct: number, distanceKm: number): string {
  return TERRAIN_LABEL[terrainKindOf(uphillPct, downhillPct, distanceKm)]
}
