import type { Nationality } from '../../types'

// 国旗（SVG画像）。public/flags/<国コード>.svg を表示する。絵文字は使わない。
export default function Flag({ code, width = 26, radius = 3 }: { code: Nationality; width?: number; radius?: number }) {
  const h = Math.round((width * 3) / 4) // 4:3
  return (
    <img
      src={`/flags/${code}.svg`}
      alt=""
      width={width}
      height={h}
      draggable={false}
      style={{
        width, height: h, borderRadius: radius, objectFit: 'cover',
        display: 'block', flexShrink: 0,
        border: '1px solid rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
      }}
    />
  )
}
