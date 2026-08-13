import { C, alpha } from '../../styles/tokens'

// ============================================================================
// **枠つきのカード（画面の中の四角い箱）。**
//
// ★「金枠2px ＋ 下に影（0 4px 0 #5a3500）＋ 内側にもう1本の枠」という塊が
//   **19画面に32か所**コピーされていました。カードの見た目を変えても、その32か所は
//   追随しません（角丸をやめたとき、部品を使っている画面だけが変わった）。
// ★形は選手カード（`player/PlayerRow`）と同じ「**右下だけ斜めに切る**」
//   （オーナー選定・2026-08-13）。角は丸めないこと。
// ★clip-path は**枠線を斜めの辺で切り落とす**ので、縁を線で描かないこと。
//   面の色と、上のふちの光と、左の色帯だけで形を出す。
// ★背景は透かさない（写真が透けると文字が読めない）。透かすのは
//   `MenuButton` / `GlassButton`（押すもの）だけ。
//
// 使い方は2つ。**どちらも同じ `panelStyle` を通る**ので、見た目を変えるのはここ1本。
//   <Panel accent={C.gold}>…</Panel>            … ふつうのカード
//   <div style={{ ...panelStyle(col), … }}>     … 条件で色が変わる・レイアウトを足す場合
// ============================================================================

/** カードの面。`accent` を渡すとその色の帯が左に出る */
export function panelStyle(accent?: string): React.CSSProperties {
  return {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 0,
    // 右下だけ斜めに切る（選手カードと同じ形）
    clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
    background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
    borderLeft: accent ? `3px solid ${alpha(accent, 0.85)}` : undefined,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
  }
}

export default function Panel({ children, accent, style, onClick }: {
  children: React.ReactNode
  /** 左の色帯。そのカードの意味の色（優勝は金、ECLは水色…） */
  accent?: string
  /** レイアウト（余白・幅・並び）だけ足すこと。**面の色と枠は書かない** */
  style?: React.CSSProperties
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? 'btn-press' : undefined}
      style={{ padding: '14px 16px', cursor: onClick ? 'pointer' : undefined, ...panelStyle(accent), ...style }}
    >
      {children}
    </div>
  )
}
