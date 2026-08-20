import { createPortal } from 'react-dom'
import { C, SAIRA, F } from '../../styles/tokens'
import GlassButton from './GlassButton'
import { panelStyle } from './Panel'
import { useCoversScreen } from '../../lib/screenCover'


// アプリ調の確認ダイアログ（素の window.confirm の置き換え用）
//
// ★呼び出し元がどのページの中にいても、必ず document.body 直下（<main> の外）に
//   出すこと。<main> は -webkit-overflow-scrolling:touch のスクロール領域で、
//   iOS の WebView はこれを position:fixed の基準にしてしまうため、ページの中から
//   そのまま fixed で出すと画面全体を覆えない（詳しくは BottomSheet.tsx を参照）。
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  accent = C.cyan,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  accent?: string
  onConfirm: () => void
  onCancel: () => void
  /** タイトルの下に差し込む追加表示（相手のチームカードなど） */
  children?: React.ReactNode
}) {
  useCoversScreen()
  return createPortal((
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
      }}
      onClick={onCancel}
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
        <div style={{ fontSize: F.tiny, color: accent, letterSpacing: '2px', fontWeight: 900, marginBottom: 8, fontFamily: SAIRA }}>確認</div>
        <div style={{ fontSize: F.title, fontWeight: 800, color: C.text, marginBottom: message || children ? 10 : 18, lineHeight: 1.4 }}>{title}</div>
        {children && <div style={{ marginBottom: message ? 10 : 18 }}>{children}</div>}
        {message && <div style={{ fontSize: F.body, color: C.textSub, lineHeight: 1.6, marginBottom: 18 }}>{message}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <GlassButton color={C.textSub} onClick={onCancel} style={{ flex: 1, padding: '12px', fontFamily: SAIRA, fontSize: F.sub }}>
            {cancelLabel}
          </GlassButton>
          <GlassButton color={accent} onClick={onConfirm} style={{ flex: 1.4, padding: '12px', fontFamily: SAIRA, fontSize: F.subLg }}>
            {confirmLabel}
          </GlassButton>
        </div>
      </div>
    </div>
  ), document.body)
}
