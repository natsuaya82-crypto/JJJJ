import { C, SAIRA } from '../../styles/tokens'

// 新加入（joinedYear が現在のシーズン年と一致）の選手に付く「NEW」バッジ。
export default function NewBadge({ joinedYear, currentYear, size = 8 }: { joinedYear?: number; currentYear: number; size?: number }) {
  if (joinedYear == null || joinedYear !== currentYear) return null
  return (
    <span style={{
      fontSize: size, fontWeight: 900, letterSpacing: '0.5px', flexShrink: 0,
      padding: '1px 5px',lineHeight: 1.3,
      background: `linear-gradient(180deg, ${C.red}, #b01020)`,
      color: '#fff', boxShadow: `0 0 6px ${C.red}66`,
      fontFamily: SAIRA,
    }}>NEW</span>
  )
}
