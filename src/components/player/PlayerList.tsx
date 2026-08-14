import { PLAYER_CARD_GAP } from '../../styles/tokens'

/**
 * 選手カードを縦に並べる入れもの。**カード同士のあきを決める唯一の場所。**
 *
 * ■なぜ要るのか
 *   同じ「選手カードの一覧」が11画面にあり、並べ方が3通りに割れていました。
 *
 *     箱に入れずに並べる（`gap: 8`）… ロスター・移籍市場                    … あきあり
 *     枠の箱に詰める（`border` ＋ `overflow: hidden`）… 代表詳細・チーム詳細・
 *       非売リスト・スカウト・殿堂入り                                      … あきなし
 *     ただ並べるだけ（指定なし）… カード育成・区間ピッカー・フレンド詳細・代表選出 … あきなし
 *
 *   `PlayerRow` は**それ自体が1枚のカード**（自前の背景・右下の切り欠き・上の光）
 *   なので、詰めて並べると切り欠きが隣のカードにぶつかります。オーナー判断
 *   （2026-08-14「ある方に統一して」）であきのある形へ寄せました。
 *
 * ■使い方
 *   一覧を `<PlayerList>` で包むだけ。外側の余白（margin / padding）は `style` で渡します。
 *   **画面側で `gap` を書かないこと**（また3通りに割れます）。空のときの案内も中に入れて構いません。
 */
export default function PlayerList({ children, style }: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: PLAYER_CARD_GAP, ...style }}>
      {children}
    </div>
  )
}
