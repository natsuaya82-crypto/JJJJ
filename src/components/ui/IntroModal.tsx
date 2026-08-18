import type { ReactNode } from 'react'
import { C, alpha, F } from '../../styles/tokens'

/**
 * 【起動時に一度だけ出す全画面のお知らせ】
 *
 * 公式Xのフォロー案内（`TwitterModal`）と、アップデートのお知らせポップ
 * （`NewsModal`）が**同じ形**であるための入れもの。
 *
 * ★**この形を画面ごとに書き写さないこと。** 中身（アイコン・見出し・本文・
 *   ボタンの文字と行き先）だけを渡す。写しを作ると、片方だけ色や余白が
 *   ずれる（`check-ui-tokens` の予算がそれを見張っている）。
 *
 * ★下から出るシートではなく**全画面の四角**です（オーナーが嫌うのは
 *   「下から出るやつ」なので、ここは今までどおり）。
 */
export default function IntroModal({
  icon, title, body, actionLabel, onAction, closeLabel = 'あとで', onClose, accent = C.gold,
}: {
  /** 見出しの上に置く四角いアイコン（56px の中に収まるもの） */
  icon: ReactNode
  title: string
  /** `\n` で改行できる */
  body: string
  actionLabel: string
  /** 押したときの動き。押したあとは呼ぶ側が閉じること */
  onAction: () => void
  closeLabel?: string
  onClose: () => void
  accent?: string
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(4,12,26,0.97)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '360px',
        background: C.surface,
        border: `1px solid ${C.border2}`,
        padding: '32px 26px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
        <div style={{ fontSize: F.titleLg, fontWeight: 800, color: C.text, marginBottom: '10px' }}>
          {title}
        </div>
        <div style={{ fontSize: F.bodyLg, color: C.textDim, lineHeight: 1.7, marginBottom: '26px', whiteSpace: 'pre-line' }}>
          {body}
        </div>
        <button
          onClick={onAction}
          style={{
            display: 'block', width: '100%',
            background: `linear-gradient(180deg, ${alpha(accent, 0.16)}, ${alpha(accent, 0.04)})`,
            border: `1px solid ${alpha(accent, 0.65)}`,
            color: accent,
            fontWeight: 800,
            fontSize: F.subLg,
            padding: '14px 0',
            letterSpacing: '0.05em',
            marginBottom: '10px',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {actionLabel}
        </button>
        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%',
            background: 'transparent', border: 'none',
            color: C.textDim, fontSize: F.bodyLg, padding: '8px 0',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
