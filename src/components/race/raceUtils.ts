export function terrainColor(uphillPct: number, downhillPct: number): string {
  if (uphillPct >= 40) return '#4CAF50'
  if (downhillPct >= 40) return '#26C6DA'
  if (uphillPct + downhillPct >= 30) return '#FF9800'
  return '#7986CB'
}

export function terrainLabel(uphillPct: number, downhillPct: number, distanceKm: number): string {
  if (uphillPct >= 40) return '山登り'
  if (downhillPct >= 40) return '山下り'
  if (uphillPct + downhillPct >= 30) return '起伏'
  if (distanceKm <= 8) return 'スプリント'
  if (distanceKm >= 15) return '長距離'
  return '中距離'
}
