import type { Specialty } from '../types'

// 区間の「地形」の唯一の決まり。
//
// ■なぜ要るのか
//   同じ「登り40%以上なら山登り」という線引きが、色（terrainColor）・名前（terrainLabel）に
//   別々に書かれていて、そこから決まるはずの「その区間に向いているポジション」は
//   どこにも無かった。コースを手で書いていたころは data/races.ts に直接
//   recommended を並べていたが、コースがランダムになった大会（世界選手権など）では
//   誰も recommended を付けないので、**推奨のパッチが出ない**状態になっていた。
//
// ■決まり
//   地形の判定はここ1本。色も名前も推奨ポジションも、全部この結果から出す。
//   新しい大会でコースを作るときは recommendedSpecialtyFor を通すこと。

export type TerrainKind = 'uphill' | 'downhill' | 'undulating' | 'sprint' | 'long' | 'middle'

/** 登り・下りの割合と距離から地形を決める。**線引きはここだけ** */
export function terrainKindOf(uphillPct: number, downhillPct: number, distanceKm: number): TerrainKind {
  if (uphillPct >= 40) return 'uphill'
  if (downhillPct >= 40) return 'downhill'
  if (uphillPct + downhillPct >= 30) return 'undulating'
  if (distanceKm <= 8) return 'sprint'
  if (distanceKm >= 15) return 'long'
  return 'middle'
}

export const TERRAIN_LABEL: Record<TerrainKind, string> = {
  uphill: '山登り', downhill: '山下り', undulating: '起伏',
  sprint: 'スプリント', long: '長距離', middle: '中距離',
}

export const TERRAIN_COLOR: Record<TerrainKind, string> = {
  uphill: '#4CAF50', downhill: '#26C6DA', undulating: '#FF9800',
  sprint: '#7986CB', long: '#7986CB', middle: '#7986CB',
}

/**
 * その地形に向いているポジション。区間配置の「◯◯推奨」のパッチと、
 * レースでの適性ボーナス（raceEngine の calcSegmentAffinity）が同じ答えを見る。
 *
 * 中距離だけは「誰の区間でもない」ので推奨を出さない。
 * ここでオールラウンダーを推奨にすると、平坦な区間が全部オールラウンダー向けになって
 * エースとの違いが消える（エース区間はコース側が明示的に指定する）。
 */
export function recommendedSpecialtyFor(seg: { uphillPct: number; downhillPct: number; distanceKm: number }): Specialty | undefined {
  switch (terrainKindOf(seg.uphillPct, seg.downhillPct, seg.distanceKm)) {
    case 'uphill': return 'mountain_up'
    case 'downhill': return 'mountain_down'
    case 'undulating': return 'undulating'
    case 'sprint': return 'sprinter'
    case 'long': return 'long'
    default: return undefined
  }
}
