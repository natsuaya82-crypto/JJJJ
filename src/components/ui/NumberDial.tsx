import { useRef, useState } from 'react'
import { C, alpha, SAIRA } from '../../styles/tokens'

const STEP = 1_000_000            // 100万円単位
const MAXV = 9_999_000_000        // 99億9900万
const ITEM_H = 30                 // ホイール1目盛りの高さ

// 桁ごとの回転ホイール。上下にドラッグ（スワイプ）して0〜9を循環させる。
// ポップアップを出さないので画面端でも見切れない。
function DigitWheel({ digit, onChange, accent }: {
  digit: number
  onChange: (d: number) => void
  accent: string
}) {
  const [offset, setOffset] = useState(0)          // ドラッグ中の残り移動量(px)
  // ドラッグ中はアニメーションを切る。ref を描画中に読むと、指を離した瞬間の再描画で
  // 古い値のまま transition が付いたり付かなかったりするので state で持つ
  const [dragging, setDragging] = useState(false)
  const drag = useRef<{ startY: number; base: number; moved: boolean } | null>(null)

  const wrap = (n: number) => ((n % 10) + 10) % 10

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { startY: e.clientY, base: digit, moved: false }
    setDragging(true)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const dy = e.clientY - drag.current.startY
    if (Math.abs(dy) > 4) drag.current.moved = true
    // 下にドラッグ＝ホイールが下に回る＝数字が小さくなる（iOSピッカーと同じ向き）
    const steps = Math.round(dy / ITEM_H)
    const newDigit = wrap(drag.current.base - steps)
    if (newDigit !== digit) onChange(newDigit)
    setOffset(dy - steps * ITEM_H)
  }
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!drag.current) return
    // ドラッグせずタップ：見えている数字を選ぶ（上半分タップで-1、下半分タップで+1）
    if (!drag.current.moved) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      const upper = e.clientY < r.top + r.height / 2
      onChange(wrap(digit + (upper ? -1 : 1)))
    }
    drag.current = null
    setDragging(false)
    setOffset(0)
  }

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      style={{
        width: 34, height: ITEM_H * 3,overflow: 'hidden', position: 'relative',
        border: `1.5px solid ${C.border2}`,
        background: `linear-gradient(180deg, ${C.surface} 0%, ${C.surface3} 50%, ${C.surface} 100%)`,
        cursor: 'ns-resize', touchAction: 'none', userSelect: 'none', flexShrink: 0,
      }}
    >
      {/* 中央の選択枠 */}
      <div style={{ position: 'absolute', top: ITEM_H, left: 2, right: 2, height: ITEM_H,border: `1.5px solid ${alpha(accent, 0.55)}`, background: alpha(accent, 0.1), pointerEvents: 'none' }}/>
      {/* 上下のフェード */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H, background: `linear-gradient(180deg, ${C.surface} 15%, transparent)`, pointerEvents: 'none', zIndex: 2 }}/>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H, background: `linear-gradient(0deg, ${C.surface} 15%, transparent)`, pointerEvents: 'none', zIndex: 2 }}/>
      {/* 数字列：上=-1、中央=現在値、下=+1。上にドラッグすると下の大きい数字が中央に入ってくる（＝増える） */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${offset}px)`, transition: dragging ? 'none' : 'transform 0.12s ease' }}>
        {[wrap(digit - 1), digit, wrap(digit + 1)].map((n, i) => (
          <div key={i} style={{
            height: ITEM_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SAIRA, fontWeight: 900,
            fontSize: i === 1 ? 22 : 16,
            color: i === 1 ? C.text : C.textGhost,
          }}>{n}</div>
        ))}
      </div>
    </div>
  )
}

// ホイール式の金額入力。年俸・移籍金など全金額入力で共通利用。
// 表示は6桁の「万円」。上4桁を桁ごとのホイールで変更、下2桁(00)は固定＝常に100万円単位。
export default function NumberDial({
  value, onChange, min = 0, max = MAXV, accent = C.gold,
}: {
  value: number
  onChange: (yen: number) => void
  min?: number
  max?: number
  accent?: string
}) {
  const clampMax = Math.min(max, MAXV)
  const clamp = (yen: number) => Math.max(min, Math.min(clampMax, Math.round(yen / STEP) * STEP))
  const N = Math.round(clamp(value) / STEP)              // 0..9999（100万円単位の個数）
  const digits = String(N).padStart(4, '0').split('').map(Number)  // [十億, 億, 千万, 百万]

  const setDigit = (idx: number, d: number) => {
    const arr = [...digits]
    arr[idx] = d
    const newN = arr[0] * 1000 + arr[1] * 100 + arr[2] * 10 + arr[3]
    onChange(clamp(newN * STEP))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      {digits.map((d, idx) => (
        <DigitWheel key={idx} digit={d} onChange={n => setDigit(idx, n)} accent={accent} />
      ))}
      <span style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>00</span>
      <span style={{ fontSize: 12, color: C.textDim, marginLeft: 2, flexShrink: 0 }}>万円</span>
    </div>
  )
}
