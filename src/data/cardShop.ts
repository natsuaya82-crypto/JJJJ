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
