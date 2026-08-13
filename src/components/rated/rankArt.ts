import bronze from '../../assets/ranks/bronze.png'
import silver from '../../assets/ranks/silver.png'
import gold from '../../assets/ranks/gold.png'
import platinum from '../../assets/ranks/platinum.png'
import diamond from '../../assets/ranks/diamond.png'
import master from '../../assets/ranks/master.png'
import legend from '../../assets/ranks/legend.png'
import type { RankName } from '../../engine/rating'

/**
 * **段位の紋章と色。** 段位の名前は `engine/rating` が持ち、見た目だけここ。
 * 画像は7枚1組（`src/assets/ranks/`）。**同じ絵を別の場所で持たないこと。**
 */
export const RANK_ART: Record<RankName, { img: string; color: string }> = {
  ブロンズ: { img: bronze, color: '#c98a5b' },
  シルバー: { img: silver, color: '#c3ced9' },
  ゴールド: { img: gold, color: '#d4af37' },
  プラチナ: { img: platinum, color: '#8fd9cb' },
  ダイヤモンド: { img: diamond, color: '#8fc4ef' },
  マスター: { img: master, color: '#b98fe0' },
  レジェンド: { img: legend, color: '#e88b5c' },
}
