/**
 * ランダム生成のコースにも「◯◯推奨」が付くかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-segment-recommend.ts --outfile=/tmp/csr.cjs && node /tmp/csr.cjs
 *
 * 世界選手権など、コースを毎回作る大会では recommended を付け忘れていて
 * 区間配置のパッチが出ていなかった。地形から機械的に出す（utils/terrain）。
 */
import { recommendedSpecialtyFor, terrainKindOf, TERRAIN_LABEL } from '../src/utils/terrain'
import { SPECIALTY_LABELS } from '../src/types'

// want＝推奨の呼び名（SPECIALTY_LABELS）。中距離の平らな区間だけは推奨なし
const cases = [
  { distanceKm: 12.0, uphillPct: 55, downhillPct: 5, want: '山登り' },
  { distanceKm: 10.5, uphillPct: 5, downhillPct: 48, want: '山下り' },
  { distanceKm: 11.0, uphillPct: 20, downhillPct: 18, want: '起伏型' },
  { distanceKm: 6.5, uphillPct: 4, downhillPct: 3, want: 'スプリンター' },
  { distanceKm: 18.0, uphillPct: 6, downhillPct: 5, want: '長距離' },
  { distanceKm: 11.0, uphillPct: 6, downhillPct: 5, want: null },
]

// ★判定した結果は必ず exit につなぐこと（以前は表を出すだけで、何が出ても exit 0 だった）
let ng = 0

console.log('距離     登り  下り   地形         推奨ポジション')
for (const c of cases) {
  const kind = TERRAIN_LABEL[terrainKindOf(c.uphillPct, c.downhillPct, c.distanceKm)]
  const rec = recommendedSpecialtyFor(c)
  console.log(
    `${String(c.distanceKm).padStart(5)}km ${String(c.uphillPct).padStart(3)}% ${String(c.downhillPct).padStart(3)}%   ${kind.padEnd(10)}  ${rec ? SPECIALTY_LABELS[rec] + '推奨' : '（なし）'}`,
  )
  const got = rec ? SPECIALTY_LABELS[rec] : null
  if (got !== c.want) { ng++; console.log(`  NG  ${c.distanceKm}km 登り${c.uphillPct}% 下り${c.downhillPct}% — ${got ?? 'なし'}（期待：${c.want ?? 'なし'}）`) }
}
if (ng > 0) { console.log(`\n✗ ${ng}件 NG`); process.exit(1) }
console.log('\n✓ 地形から推奨が出る')
