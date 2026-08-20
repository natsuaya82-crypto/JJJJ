import type { Segment, Specialty } from '../types'

// ECL（エキデン・チャンピオンズリーグ）の開催コース。毎年この10コースからランダムに1つ選ばれる。
// 7区間・全長60〜90km。コースごとに性格を変える（スピード型・山岳型・高地型など）。
export type EclCourse = {
  id: string
  name: string
  location: string
  character: string   // コースの性格（結果画面の説明用）
  segments: Segment[]
}

// ★**重みはここに書かない。** 本編（`data/races.ts`）は1区間ずつ手で調整した重みを持つが、
//   こちらは地形から決まるので `calcBaseAbility` が `data/segmentWeights` の
//   `terrainWeights` から作る。**データに焼くとセーブに乗って1シーズン8KB増える。**
function seg(index: number, distanceKm: number, uphillPct: number, downhillPct: number, recommended?: Specialty): Segment {
  return { index, distanceKm, uphillPct, downhillPct, ...(recommended ? { recommended } : {}) }
}

export const ECL_COURSES: EclCourse[] = [
  {
    id: 'london',
    name: 'ロンドン・テムズサーキット',
    location: 'ロンドン',
    character: '完全フラットの高速コース。純粋なスピード勝負',
    segments: [seg(1, 10.0, 2, 2, 'sprinter'), seg(2, 12.0, 3, 3, 'ace'), seg(3, 8.5, 2, 2, 'sprinter'), seg(4, 13.0, 3, 3, 'ace'), seg(5, 10.5, 2, 2, 'sprinter'), seg(6, 9.0, 2, 2, 'sprinter'), seg(7, 14.0, 3, 3, 'ace')],
  },
  {
    id: 'riftvalley',
    name: 'リフトバレー高地コース',
    location: 'ケニア・エルドレット',
    character: '標高2400mの高地。スタミナと回復力が試される',
    segments: [seg(1, 9.5, 15, 5, 'sprinter'), seg(2, 11.0, 20, 10, 'allrounder'), seg(3, 10.0, 10, 15, 'sprinter'), seg(4, 12.5, 15, 10, 'ace'), seg(5, 8.5, 20, 5, 'sprinter'), seg(6, 10.5, 10, 15, 'sprinter'), seg(7, 12.0, 15, 10, 'ace')],
  },
  {
    id: 'alps',
    name: 'アルプス山岳ステージ',
    location: 'シャモニー',
    character: '峠を2つ越える山岳コース。登りと下りの職人が主役',
    segments: [seg(1, 8.0, 5, 5, 'sprinter'), seg(2, 10.0, 45, 5, 'mountain_up'), seg(3, 9.0, 10, 45, 'mountain_down'), seg(4, 11.0, 30, 20, 'allrounder'), seg(5, 8.5, 40, 10, 'mountain_up'), seg(6, 9.5, 5, 40, 'mountain_down'), seg(7, 10.0, 10, 10, 'sprinter')],
  },
  {
    id: 'dubai',
    name: 'ドバイ・デザートハイウェイ',
    location: 'ドバイ',
    character: '灼熱のフラットコース。メンタルの強さが問われる',
    segments: [seg(1, 11.0, 1, 1, 'sprinter'), seg(2, 13.5, 2, 2, 'ace'), seg(3, 9.5, 1, 1, 'sprinter'), seg(4, 12.0, 2, 2, 'ace'), seg(5, 11.5, 1, 1, 'ace'), seg(6, 10.0, 1, 1, 'sprinter'), seg(7, 13.0, 2, 2, 'ace')],
  },
  {
    id: 'newyork',
    name: 'ニューヨーク・ファイブボロー',
    location: 'ニューヨーク',
    character: '橋のアップダウンが連続する市街地コース',
    segments: [seg(1, 10.5, 12, 12, 'sprinter'), seg(2, 11.5, 15, 10, 'ace'), seg(3, 9.0, 10, 15, 'sprinter'), seg(4, 12.5, 12, 12, 'ace'), seg(5, 10.0, 15, 10, 'sprinter'), seg(6, 9.5, 10, 15, 'sprinter'), seg(7, 12.0, 12, 12, 'ace')],
  },
  {
    id: 'addis',
    name: 'アディスアベバ高原コース',
    location: 'アディスアベバ',
    character: '標高2300m・緩い登り基調。持久力の消耗戦',
    segments: [seg(1, 10.0, 18, 8, 'sprinter'), seg(2, 12.0, 15, 10, 'ace'), seg(3, 9.5, 20, 5, 'sprinter'), seg(4, 11.0, 15, 10, 'sprinter'), seg(5, 10.5, 18, 8, 'sprinter'), seg(6, 9.0, 15, 10, 'sprinter'), seg(7, 12.5, 12, 12, 'ace')],
  },
  {
    id: 'paris',
    name: 'パリ・シャンゼリゼサーキット',
    location: 'パリ',
    character: '石畳と緩斜面の周回コース。ペース配分が鍵',
    segments: [seg(1, 9.0, 8, 8, 'sprinter'), seg(2, 10.5, 10, 8, 'sprinter'), seg(3, 11.0, 8, 10, 'sprinter'), seg(4, 9.5, 10, 8, 'sprinter'), seg(5, 12.0, 8, 10, 'ace'), seg(6, 10.0, 10, 8, 'sprinter'), seg(7, 11.5, 8, 8, 'ace')],
  },
  {
    id: 'sydney',
    name: 'シドニー・ベイサイドライン',
    location: 'シドニー',
    character: '海沿いの強風フラットコース。終盤に橋の急坂',
    segments: [seg(1, 10.5, 3, 3, 'sprinter'), seg(2, 12.0, 4, 4, 'ace'), seg(3, 10.0, 3, 3, 'sprinter'), seg(4, 11.5, 4, 4, 'ace'), seg(5, 9.5, 3, 3, 'sprinter'), seg(6, 10.5, 4, 4, 'sprinter'), seg(7, 11.0, 25, 25, 'allrounder')],
  },
  {
    id: 'fuji',
    name: '富士山麓インターナショナル',
    location: '富士山麓',
    character: '日本開催の山岳コース。5区の富士登りが最大の勝負所',
    segments: [seg(1, 10.0, 5, 5, 'sprinter'), seg(2, 11.5, 10, 8, 'ace'), seg(3, 9.5, 8, 10, 'sprinter'), seg(4, 12.0, 15, 10, 'ace'), seg(5, 9.0, 55, 5, 'mountain_up'), seg(6, 8.5, 5, 55, 'mountain_down'), seg(7, 13.0, 5, 5, 'ace')],
  },
  {
    id: 'seoul',
    name: 'ソウル・漢江リバーサイド',
    location: 'ソウル',
    character: '川沿いの高速コース。ラスト区間が長い総力戦',
    segments: [seg(1, 9.5, 4, 4, 'sprinter'), seg(2, 11.0, 5, 5, 'sprinter'), seg(3, 10.5, 4, 4, 'sprinter'), seg(4, 9.0, 5, 5, 'sprinter'), seg(5, 11.5, 4, 4, 'ace'), seg(6, 10.0, 5, 5, 'sprinter'), seg(7, 15.0, 6, 6, 'long')],
  },
]
