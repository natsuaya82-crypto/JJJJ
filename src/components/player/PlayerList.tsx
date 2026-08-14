import { C, F } from '../../styles/tokens'

// ============================================================================
// **選手カードを縦に並べる箱。カードとカードの間隔はここ1本。**
//
//   > ページによって選手カードとカードの間があったりなかったりだから
//   > ある方に統一して（オーナー・2026-08-14）
//
// 並べ方が2通りに割れていた。
//   ・空いている方 … `display:flex / flexDirection:column / gap:8`（ロスター・移籍市場）
//   ・詰まっている方 … `overflow:hidden` の枠に隙間なく（代表・チーム詳細・非売・
//     スカウト・殿堂入り・ドラフト会場）。**枠の中で1枚の板に見える**
// 空いている方に揃える。
//
// ★`<PlayerRow>` を `.map` で並べるときは必ずこれを通すこと。画面側で
//   `gap` や枠を書くと、また片方だけ変わって割れる。
// ★左右の余白は画面ごとに違ってよい（`margin` で渡す）。**間隔だけ**をここが持つ。
// ============================================================================

/** カードとカードの間隔。ここだけ */
export const PLAYER_GAP = 8

export default function PlayerList({ children, margin = '0 12px', style }: {
  children: React.ReactNode
  /** 左右（と下）の余白。画面ごとに違ってよい */
  margin?: string
  /** 並び以外の指定。**gap と枠は書かないこと** */
  style?: React.CSSProperties
}) {
  return (
    <div style={{ margin, display: 'flex', flexDirection: 'column', gap: PLAYER_GAP, ...style }}>
      {children}
    </div>
  )
}

/** 「登録選手なし」など、一覧が空のときの1行（見た目を揃える） */
export function PlayerListEmpty({ label }: { label: string }) {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: C.textGhost, fontSize: F.sub }}>{label}</div>
}
