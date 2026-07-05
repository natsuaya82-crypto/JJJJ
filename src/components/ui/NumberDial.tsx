import { useState } from 'react'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const STEP = 1_000_000            // 100万円単位
const MAXV = 9_999_000_000        // 99億9900万

// ダイヤル式の金額入力。年俸・移籍金など全金額入力で共通利用。
// 表示は6桁の「万円」。上4桁だけダイヤルで変更、下2桁(00)は固定＝常に100万円単位。
// 桁をタップすると縦に0〜9のダイヤルが伸び、タップ/スライドで数値変更できる。
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
  const digits = String(N).padStart(4, '0').split('').map(Number)  // [万億, 億, 千万, 百万]
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const setDigit = (idx: number, d: number) => {
    const arr = [...digits]
    arr[idx] = d
    const newN = arr[0] * 1000 + arr[1] * 100 + arr[2] * 10 + arr[3]
    onChange(clamp(newN * STEP))
  }

  const cell = (open: boolean): React.CSSProperties => ({
    width: 30, height: 40, borderRadius: 8, cursor: 'pointer',
    border: `1.5px solid ${open ? accent : C.border2}`,
    background: open ? alpha(accent, 0.15) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    color: C.text, fontFamily: SAIRA, fontSize: 24, fontWeight: 900,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, position: 'relative' }}>
      {digits.map((d, idx) => (
        <div key={idx} style={{ position: 'relative' }}>
          <button onClick={() => setOpenIdx(openIdx === idx ? null : idx)} style={cell(openIdx === idx)}>{d}</button>
          {openIdx === idx && (
            <>
              <div onClick={() => setOpenIdx(null)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', top: -4, left: '50%', transform: 'translate(-50%, -100%)', zIndex: 41,
                maxHeight: 200, overflowY: 'auto', borderRadius: 10,
                background: C.surface, border: `1.5px solid ${alpha(accent, 0.6)}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)', padding: 4,
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                {Array.from({ length: 10 }, (_, n) => (
                  <button key={n} onClick={() => { setDigit(idx, n); setOpenIdx(null) }}
                    style={{
                      width: 34, height: 30, borderRadius: 6, cursor: 'pointer', border: 'none',
                      background: n === d ? accent : 'transparent',
                      color: n === d ? '#0A0912' : C.textSub,
                      fontFamily: SAIRA, fontSize: 18, fontWeight: 900,
                    }}>{n}</button>
                ))}
              </div>
            </>
          )}
        </div>
      ))}
      <span style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>00</span>
      <span style={{ fontSize: 12, color: C.textDim, marginLeft: 2, flexShrink: 0 }}>万円</span>
    </div>
  )
}
