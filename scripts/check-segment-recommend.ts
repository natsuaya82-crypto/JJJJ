/**
 * ランダム生成のコースにも「◯◯推奨」が付くかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-segment-recommend.ts --outfile=/tmp/csr.cjs && node /tmp/csr.cjs
 *
 * 世界選手権など、コースを毎回作る大会では recommended を付け忘れていて
 * 区間配置のパッチが出ていなかった。地形から機械的に出す（utils/terrain）。
 */
import { recommendedSpecialtyFor, terrainKindOf, TERRAIN_LABEL } from '../src/utils/terrain'
import { SPECIALTY_LABELS } from '../src/types'

const cases = [
  { distanceKm: 12.0, uphillPct: 55, downhillPct: 5 },
  { distanceKm: 10.5, uphillPct: 5, downhillPct: 48 },
  { distanceKm: 11.0, uphillPct: 20, downhillPct: 18 },
  { distanceKm: 6.5, uphillPct: 4, downhillPct: 3 },
  { distanceKm: 18.0, uphillPct: 6, downhillPct: 5 },
  { distanceKm: 11.0, uphillPct: 6, downhillPct: 5 },
]

console.log('距離     登り  下り   地形         推奨ポジション')
for (const c of cases) {
  const kind = TERRAIN_LABEL[terrainKindOf(c.uphillPct, c.downhillPct, c.distanceKm)]
  const rec = recommendedSpecialtyFor(c)
  console.log(
    `${String(c.distanceKm).padStart(5)}km ${String(c.uphillPct).padStart(3)}% ${String(c.downhillPct).padStart(3)}%   ${kind.padEnd(10)}  ${rec ? SPECIALTY_LABELS[rec] + '推奨' : '（なし）'}`,
  )
}
