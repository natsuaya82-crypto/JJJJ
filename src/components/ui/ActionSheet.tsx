import { C } from '../../styles/tokens'

export type ActionSheetItem = {
  label: string
  color?: string
  disabled?: boolean
  onClick: () => void
}

// 画面下から出る固定ボトムシート。位置は常に画面下端で一定＝行の位置に依存せず見切れない。
export default function ActionSheet({ open, onClose, items }: { open: boolean; onClose: () => void; items: ActionSheetItem[] }) {
  if (!open) return null
  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300 }}
      />
      <div
        className="sheet-up"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, zIndex: 301,
          background: C.surface,
          borderRadius: '18px 18px 0 0',
          border: `1px solid ${C.border2}`,
          borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,0.6)',
          padding: '8px 14px calc(14px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border3, margin: '4px auto 10px' }} />
        {items.map((it, i) => (
          <button
            key={i}
            onClick={() => { if (it.disabled) return; it.onClick() }}
            disabled={it.disabled}
            style={{
              display: 'block', width: '100%', minHeight: 52,
              padding: '14px 12px',
              background: 'transparent', border: 'none',
              borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none',
              color: it.disabled ? C.textGhost : (it.color ?? C.text),
              fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
              textAlign: 'center',
              cursor: it.disabled ? 'not-allowed' : 'pointer',
            }}
          >
            {it.label}
          </button>
        ))}
        <button
          onClick={onClose}
          style={{
            display: 'block', width: '100%', minHeight: 52,
            marginTop: 8, padding: '14px 12px',
            background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12,
            color: C.textDim, fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          キャンセル
        </button>
      </div>
    </>
  )
}
