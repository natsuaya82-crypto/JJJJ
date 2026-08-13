import PressButton from './PressButton'
import { SAIRA } from '../../styles/tokens'
import { C } from '../../styles/tokens'

// ============================================================================
// 横に並べる四角いボタン（ホームのクイックボタン）。
//
// ★**単色で塗らない。** 暗い面に色の枠と色の文字、下に影、押すと縮む。
//   ホームの4つ（年間予定・ショップ・シーズン目標・チャット）がこれで、
//   レート戦の3つも同じものを使う。**新しく作らないこと。**
// ============================================================================

export default function QuickTile({ icon, label, color, shadow, disabled, onClick }: {
  icon: React.ReactNode
  label: string
  /** 枠と文字の色 */
  color: string
  /** 下に落ちる影の色（`color` の暗い版） */
  shadow: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <PressButton
      onClick={() => { if (!disabled) onClick() }}
      style={{
        background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
        border: `2px solid ${disabled ? C.border3 : color}`,
        borderRadius: 14, padding: '14px 4px 11px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
        color: disabled ? C.textDim : color,
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 5px 0 ${disabled ? '#12151c' : shadow}, 0 8px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.25)`,
      }}
    >
      <div style={{ position: 'absolute', top: 3, left: 6, right: 6, height: '36%', background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)', borderRadius: '6px 6px 50% 50%', pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{icon}</div>
      <div style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 700, lineHeight: 1.3, textAlign: 'center', letterSpacing: '0.04em', position: 'relative', zIndex: 1 }}>{label}</div>
    </PressButton>
  )
}
