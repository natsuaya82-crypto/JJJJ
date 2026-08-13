import { C, alpha } from '../../styles/tokens'

// ============================================================================
// **押すボタン（ガラス）。画面の中で実行するもの全部これ。**
//
// ★色は**もとの画面で使っていた色をそのまま渡すこと**（金は金、シアンはシアン）。
// ★同じ見た目を各画面で手書きしないこと。以前は
//   `border: 2px solid ${C.goldDark}` ＋ `boxShadow: 0 4px 0 #5a3500` の塊が
//   20画面以上にコピーされていた。
// ★画面から画面へ渡る「行」は `MenuButton`。こちらは実行するボタン。
// ============================================================================

export default function GlassButton({
  children, color = C.gold, size = 'md', disabled, full, style, onClick,
}: {
  children: React.ReactNode
  /** その ボタンの色。既定は金 */
  color?: string
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 横いっぱいに広げる */
  full?: boolean
  style?: React.CSSProperties
  onClick: () => void
}) {
  const pad = size === 'sm' ? '7px 11px' : size === 'lg' ? '15px 0' : '11px 14px'
  const fs = size === 'sm' ? 11 : size === 'lg' ? 16 : 13
  // ★角は丸めない（オーナー・2026-08-13「角丸全部やめて」）。
  //   ここは**斜めに切らない**——clip-path は枠線を斜めの辺だけ消すので、
  //   線で縁を描くボタンとは両立しない（形はメニュー行と選手カードで出す）
  return (
    <button
      onClick={() => { if (!disabled) onClick() }}
      disabled={disabled}
      className={disabled ? undefined : 'btn-press'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: full ? '100%' : undefined,
        padding: pad, borderRadius: 0,
        fontSize: fs, fontWeight: 900, letterSpacing: size === 'lg' ? '2px' : '0.5px',
        fontFamily: 'inherit', lineHeight: 1.25, whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? C.textGhost : color,
        background: disabled
          ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))'
          : `linear-gradient(180deg, ${alpha(color, 0.16)}, ${alpha(color, 0.04)})`,
        backdropFilter: 'blur(10px) saturate(118%)',
        WebkitBackdropFilter: 'blur(10px) saturate(118%)',
        border: `1px solid ${disabled ? alpha(C.border3, 0.6) : alpha(color, 0.65)}`,
        boxShadow: disabled ? 'none'
          : `inset 0 1px 0 rgba(255,255,255,0.22), 0 8px 20px rgba(0,0,0,0.4)`,
        ...style,
      }}
    >{children}</button>
  )
}
