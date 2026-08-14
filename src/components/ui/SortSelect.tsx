import { C, SAIRA } from '../../styles/tokens'


// 選手一覧の並び替えセレクトの見た目はここ1本（ScoutPageの見た目を基準にした）。
// 幅などレイアウトに関わる指定だけ、呼び出し側が style で足す（見た目の値そのものは書かせない）。
export default function SortSelect<T extends string>({
  options, value, onChange, style,
}: {
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  style?: React.CSSProperties
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as T)}
      style={{
        padding: '7px 10px',
        background: C.surface2, border: `1px solid ${C.border2}`,
        color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none', cursor: 'pointer',
        ...style,
      }}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}
