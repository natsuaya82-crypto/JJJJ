import { rankOf } from '../../engine/rating'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'
import BackButton from '../ui/BackButton'

// レート戦の3ページ（トップ・結果・順位表）で共通の見た目。
// ★段位の名前は `engine/rating` の rankOf 1本。ここが持つのは色だけ。

const RANK_COLOR: Record<string, string> = {
  ブロンズ: '#b87333', シルバー: '#b8c4d0', ゴールド: '#f5c842',
  プラチナ: '#7fe3d4', ダイヤモンド: '#7fc4ff', マスター: '#c78bff', レジェンド: '#ff8a5c',
}

export function RankChip({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const name = rankOf(rating)
  const col = RANK_COLOR[name] ?? C.textSub
  return (
    <span style={{
      fontSize: size === 'sm' ? 9 : 11, fontWeight: 900, color: col,
      background: alpha(col, 0.14), border: `1px solid ${alpha(col, 0.5)}`,
      borderRadius: 6, padding: size === 'sm' ? '1px 5px' : '2px 8px', whiteSpace: 'nowrap',
    }}>{name}</span>
  )
}

export function Card({ children, accent = C.cyan, onClick }: {
  children: React.ReactNode; accent?: string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={onClick ? 'btn-press' : undefined}
      style={{
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `1px solid ${alpha(accent, 0.25)}`, borderRadius: 14,
        padding: '12px 14px', marginBottom: 10, cursor: onClick ? 'pointer' : undefined,
      }}>{children}</div>
  )
}

/** 3ページ共通の外枠。見出しは1つだけ */
export function RatedShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '18px 12px 0', display: 'flex', alignItems: 'center', gap: 4 }}>
        <BackButton />
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: '3px', fontWeight: 900, lineHeight: 1.4 }}>RATED SERIES</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>{title}</div>
        </div>
      </div>
      <div style={{ padding: '12px 12px 0' }}>{children}</div>
    </div>
  )
}
