import { C, alpha, SAIRA } from '../../styles/tokens'


// アプリ調の確認ダイアログ（素の window.confirm の置き換え用）
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
  return (
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
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${alpha(accent, 0.5)}`,
          borderRadius: 18,
          boxShadow: `0 0 40px ${alpha(accent, 0.2)}, 0 8px 32px rgba(0,0,0,0.6)`,
          padding: '22px 20px 18px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: 9, color: accent, letterSpacing: '2px', fontWeight: 900, marginBottom: 8, fontFamily: SAIRA }}>確認</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: message || children ? 10 : 18, lineHeight: 1.4 }}>{title}</div>
        {children && <div style={{ marginBottom: message ? 10 : 18 }}>{children}</div>}
        {message && <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, marginBottom: 18 }}>{message}</div>}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: '12px', borderRadius: 12, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontFamily: SAIRA, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1.4, padding: '12px', borderRadius: 12,
              border: `2px solid ${accent}`,
              background: `linear-gradient(180deg, ${alpha(accent, 0.25)}, ${alpha(accent, 0.1)})`,
              color: accent, fontFamily: SAIRA, fontSize: 15, fontWeight: 900, cursor: 'pointer',
              boxShadow: `0 4px 0 ${alpha(accent, 0.25)}, inset 0 1px 0 rgba(255,255,255,0.1)`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
