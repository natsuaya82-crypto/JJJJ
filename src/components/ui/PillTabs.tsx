// 横並びの切り替えボタン（1本化）。
//
// レース結果の区間タブ・順位表の部の切り替え・代表の並び替えが、それぞれ別の見た目で
// 手書きされていた。「同じ操作なのに画面ごとに見た目が違う」を無くすため、ここ1本にする。
//
// ★横並びで何かを切り替えたくなったら、必ずこれを使うこと。button を新しく書かないこと。
import { C, alpha, SAIRA } from '../../styles/tokens'


export default function PillTabs({ labels, value, onChange, fill = false, style }: {
  labels: string[]
  /** 選択中の添字 */
  value: number
  onChange: (i: number) => void
  /** true なら幅を等分して埋める（項目数が少なく固定のとき）。false は横スクロール */
  fill?: boolean
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      display: 'flex', gap: 6,
      ...(fill ? {} : { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties),
      ...style,
    }}>
      {labels.map((label, i) => {
        const sel = i === value
        return (
          <button key={i} onClick={() => onChange(i)} style={{
            ...(fill ? { flex: 1, padding: '7px 0' } : { flexShrink: 0, padding: '7px 14px' }),
cursor: 'pointer', fontFamily: SAIRA,
            fontSize: 13, fontWeight: sel ? 900 : 700,
            background: sel ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : C.surface2,
            color: sel ? C.bg : C.textDim,
            border: `1px solid ${sel ? C.gold : C.border2}`,
          }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}
