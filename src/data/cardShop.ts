// カードショップの値段の唯一の決まり。
//
// 以前は「1枚あたりの値段」が gameStore の buyTrainingCard に、
// 「パックの値段」が ShopPage に、それぞれ別の数字として書かれていた。
// 掛け算の結果がたまたま一致していただけで、片方だけ変えると
// 画面に出ている額と実際に引かれる額がズレる。ここ1本にする。
//
// パックの値段 ＝ 1枚あたりの値段 × 枚数。画面はこの関数から出す。

import type { CardRarity } from '../types'

/**
 * カード1枚あたりのジュエル。
 *
 * ★2026-08 に半額にした（オーナーの指示）。
 *   施設のレベル上げにもジュエルを使うので、カードに回す余裕が無かった。
 *   ジュエルの入手量は変えていない＝実質2倍配布と同じ効き方をする。
 *   半額前: normal 30 / rare 120 / epic 500 / legendary 1500
 */
export const CARD_UNIT_PRICE: Record<CardRarity, number> = {
  normal: 15,
  rare: 60,
  epic: 250,
  legendary: 750,
}

/**
 * カード1枚で入るEXP。中身は utils/cardCombo.ts の RARITY_EXP 1本。
 * ここで書き直すと、合成の計算とショップで配るカードの中身がズレる
 */
export { RARITY_EXP as CARD_UNIT_EXP } from '../utils/cardCombo'

/** そのパックの値段（1枚あたり × 枚数） */
export function cardPackPrice(rarity: CardRarity, cards: number): number {
  return CARD_UNIT_PRICE[rarity] * cards
}

/**
 * **プレシーズンに配る練習カードの中身。ここ1本。**
 *
 * ★**画面（`components/dashboard/Dashboard`）と store（`store/slices/cardsSlice`）が
 *   同じここを通すこと。** 以前は同じ6分岐が**1文字違わず2本**あり、片方だけ中身を
 *   変えると「画面には EPIC 1枚と出ているのに配られない」になります。
 * ★`rank === 0`（初年度でまだ順位が無い）は `rank <= 6` の枝に入ります——
 *   2本あったころは最後に `// first season` の行がありましたが、
 *   **手前の `rank <= 6` が先に拾うので到達しません**でした。そのぶんを消して、
 *   初年度は 0 として明示的に拾います。
 */
export type PreseasonCardDist = { rarity: CardRarity; count: number }

export function preseasonCardDist(rank: number): PreseasonCardDist[] {
  if (rank === 1) return [{ rarity: 'legendary', count: 1 }, { rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 2 }]
  if (rank === 2) return [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 3 }]
  if (rank === 3) return [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 1 }, { rarity: 'normal', count: 4 }]
  if (rank >= 15) return [{ rarity: 'epic', count: 1 }, { rarity: 'normal', count: 6 }]
  if (rank <= 6) return [{ rarity: 'rare', count: 2 }, { rarity: 'normal', count: 4 }]
  if (rank <= 10) return [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }]
  return [{ rarity: 'normal', count: 6 }]
}
