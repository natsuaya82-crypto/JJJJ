import { rankOf } from '../../engine/rating'
import { C, alpha, FONT, SAIRA, F } from '../../styles/tokens'
import PageHeader from '../ui/PageHeader'

import { RANK_ART } from './rankArt'

// ランクマッチの3ページ（トップ・結果・順位表）で共通の見た目。
// ★段位の名前は `engine/rating` の rankOf 1本。ここが持つのは見た目だけ。

/**
 * **段位の紋章。名前の横に出すのはこれ1本。**
 *
 * ★**カタカナで「マスター」と書かないこと**（オーナー・2026-08-14
 *   「マスターってなんでカタカナ表示なんだよw なんのためのパッチだよ」）。
 *   絵が7枚あるのだから絵を出す。名前は読み上げ用の alt にだけ入れる。
 * ★**ランクマッチに一度も出ていない人は何も出さない**（オーナー判断）。
 *   `rating` に undefined を渡すと null を返すので、呼ぶ側で分岐しないこと。
 */
export function RankBadge({ rating, size = 20 }: { rating: number | undefined; size?: number }) {
  if (rating == null) return null
  const name = rankOf(rating)
  return (
    <img
      src={RANK_ART[name].img} alt={name} width={size} height={size}
      draggable={false}
      style={{ display: 'block', flexShrink: 0, objectFit: 'contain' }}
    />
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
