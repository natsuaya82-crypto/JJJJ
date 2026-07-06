import { useState } from 'react'

// 押下フィードバックをCSS :active に頼らず、JSのpointerイベントで“押したボタンだけ”に付ける。
// iOSで :active が別要素に誤爆する問題を回避する。
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { pressScale?: number }

export default function PressButton({ children, style, pressScale = 0.95, onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, ...rest }: Props) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      {...rest}
      onPointerDown={(e) => { setPressed(true); onPointerDown?.(e) }}
      onPointerUp={(e) => { setPressed(false); onPointerUp?.(e) }}
      onPointerLeave={(e) => { setPressed(false); onPointerLeave?.(e) }}
      onPointerCancel={(e) => { setPressed(false); onPointerCancel?.(e) }}
      style={{
        ...style,
        transform: pressed ? `scale(${pressScale})` : (style?.transform ?? undefined),
        transition: style?.transition ? `${style.transition}, transform 0.08s ease` : 'transform 0.08s ease',
        touchAction: 'manipulation',
      }}
    >
      {children}
    </button>
  )
}
