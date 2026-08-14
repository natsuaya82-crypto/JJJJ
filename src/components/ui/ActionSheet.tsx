import { C } from '../../styles/tokens'
import BottomSheet from './BottomSheet'

export type ActionSheetItem = {
  label: string
  color?: string
  disabled?: boolean
  onClick: () => void
}

// 画面下から出る、選択肢を縦に並べるシート。位置は常に画面下端で一定＝行の位置に依存せず見切れない。
// header に対象（選手の顔・名前など）を渡すと、誰に対するメニューか一目で分かる。
//
// 入れもの（画面下への固定・暗幕・スクロール止め）は BottomSheet が持つ。ここは中身だけ。
export default function ActionSheet({ open, onClose, items, header }: { open: boolean; onClose: () => void; items: ActionSheetItem[]; header?: React.ReactNode }) {
  return (
    <BottomSheet open={open} onClose={onClose}>
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
          background: C.surface2, border: `1px solid ${C.border}`,
          color: C.textDim, fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
          cursor: 'pointer',
        }}
      >
        キャンセル
      </button>
    </BottomSheet>
  )
}
