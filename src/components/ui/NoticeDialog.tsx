import { createPortal } from 'react-dom'
import { C, SAIRA } from '../../styles/tokens'
import GlassButton from './GlassButton'
import { panelStyle } from './Panel'


// アプリ調のお知らせダイアログ（素の window.alert の置き換え用）。
// ボタンは1つだけ。確認・キャンセルが要る場面は ConfirmDialog を使うこと。
//
// ★呼び出し元がどのページの中にいても、必ず document.body 直下（<main> の外）に
//   出すこと。理由は ConfirmDialog.tsx / BottomSheet.tsx と同じ。
export default function NoticeDialog({
  title,
  message,
  okLabel = 'OK',
  accent = C.gold,
  onClose,
  children,
}: {
  title: string
  message?: string
  okLabel?: string
  accent?: string
  onClose: () => void
  /** タイトルの下に差し込む追加表示（相手のチームカードなど） */
  children?: React.ReactNode
}) {
  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 340,
          ...panelStyle(accent),
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.6)`,
          padding: '22px 20px 18px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 9, color: accent, letterSpacing: '2px', fontWeight: 900, marginBottom: 8, fontFamily: SAIRA }}>お知らせ</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: message || children ? 10 : 18, lineHeight: 1.4 }}>{title}</div>
        {children}
        {message && <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, marginTop: children ? 10 : 0, marginBottom: 18 }}>{message}</div>}
        <GlassButton full color={accent} onClick={onClose} style={{ padding: '12px', marginTop: message ? 0 : 8, fontFamily: SAIRA, fontSize: 15 }}>
          {okLabel}
        </GlassButton>
      </div>
    </div>
  ), document.body)
}
