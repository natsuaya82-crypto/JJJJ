import { useEffect } from 'react'
import { C } from '../../styles/tokens'

export type ActionSheetItem = {
  label: string
  color?: string
  disabled?: boolean
  onClick: () => void
}

// 画面下から出る固定ボトムシート。位置は常に画面下端で一定＝行の位置に依存せず見切れない。
// header に対象（選手の顔・名前など）を渡すと、誰に対するメニューか一目で分かる。
export default function ActionSheet({ open, onClose, items, header }: { open: boolean; onClose: () => void; items: ActionSheetItem[]; header?: React.ReactNode }) {
  // 表示中は背景ページのスクロールをロックする
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

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
          // 下端の50pxは広告バナーに覆われるため、その分の余白を確保する
          padding: '8px 14px calc(64px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.border3, margin: '4px auto 10px' }} />
        {header && (
          <div style={{ padding: '2px 4px 10px', marginBottom: 6, borderBottom: `1px solid ${C.border}` }}>
            {header}
          </div>
        )}
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
