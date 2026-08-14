import { rankOf } from '../../engine/rating'
import { C, alpha, FONT, SAIRA, F } from '../../styles/tokens'
import PageHeader from '../ui/PageHeader'

import { RANK_ART } from './rankArt'

// レート戦の3ページ（トップ・結果・順位表）で共通の見た目。
// ★段位の名前は `engine/rating` の rankOf 1本。ここが持つのは色だけ。

export function RankChip({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const name = rankOf(rating)
  const col = RANK_ART[name].color
  return (
    <span style={{
      fontSize: size === 'sm' ? 9 : 11, fontWeight: 900, color: col,
      background: alpha(col, 0.14), border: `1px solid ${alpha(col, 0.5)}`,
padding: size === 'sm' ? '1px 5px' : '2px 8px', whiteSpace: 'nowrap',
    }}>{name}</span>
  )
}

/**
 * **前日からの順位の上下。** 順位表の矢印はこれ1本。
 *
 * ★数え直さないこと。上下はサーバー（`lib/ratedTick` の `runRatedRound`）が出して
 *   `rated_results.move` に入れたものをそのまま出す。画面で「前の順位」を覚えて
 *   引き算すると、開き直したときに 0 に戻る（前の順位を知らないので）。
 * ★動いていない人は**線1本**。空にすると行ごとに幅が変わって数字がガタつく。
 */
export function MoveArrow({ move }: { move: number }) {
  const col = move > 0 ? C.green : move < 0 ? C.red : C.textGhost
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1,
      width: 24, flexShrink: 0, color: col, fontFamily: SAIRA,
      fontSize: F.tiny, fontWeight: 900, lineHeight: 1,
    }}>
      {move === 0 ? '–' : <>{move > 0 ? '▲' : '▼'}{Math.abs(move)}</>}
    </span>
  )
}

/** レートの増減（前日の結果ぶん）。0のときは出さない */
export function DeltaText({ delta }: { delta: number }) {
  if (!delta) return null
  return (
    <span style={{
      fontFamily: SAIRA, fontSize: F.tiny, fontWeight: 900, lineHeight: 1,
      color: delta > 0 ? C.green : C.red,
    }}>{delta > 0 ? '+' : ''}{delta}</span>
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
        border: `1px solid ${alpha(accent, 0.25)}`,
        padding: '12px 14px', marginBottom: 10, cursor: onClick ? 'pointer' : undefined,
      }}>{children}</div>
  )
}

/** 3ページ共通の外枠。見出しは1つだけ */
export function RatedShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: FONT, paddingBottom: 90, minHeight: '100dvh' }}>
      <PageHeader eyebrow="RANKED MATCH" title={title} />
      <div style={{ padding: '12px 12px 0' }}>{children}</div>
    </div>
  )
}
