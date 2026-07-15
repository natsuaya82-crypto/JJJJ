import BackButton from '../ui/BackButton'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendClubPage() {
  const ACTIONS = [
    {
      key: 'create', label: '走友会を作る', desc: '自分が会長になって走友会を結成する', color: C.gold,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M19 4v5M21.5 6.5h-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: 'join', label: '走友会に加入する', desc: '既存の走友会を探して参加する', color: C.cyan,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="7" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7"/>
          <circle cx="17" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7"/>
          <circle cx="12" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.7"/>
          <path d="M3 19c0-2.5 1.8-4.5 4-4.5M21 19c0-2.5-1.8-4.5-4-4.5M8 20c0-3 1.8-5 4-5s4 2 4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100%', background: C.bg, paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>走友会</div>
      </div>

      <div style={{ padding: '6px 16px 14px' }}>
        <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>
          仲間と「走友会」を結成して、合同記録会やチーム対抗で競い合う機能。
          <span style={{ color: alpha(C.gold, 0.85), fontWeight: 700 }}>（近日実装予定）</span>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ACTIONS.map(a => (
          <button key={a.key} onClick={() => alert(`${a.label}（※近日実装予定）`)} className="btn-press" style={{
            width: '100%', padding: '14px', borderRadius: 14, border: `2px solid ${C.goldDark}`, cursor: 'pointer',
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
            display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', position: 'relative', overflow: 'hidden', opacity: 0.92,
          }}>
            <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
            <div style={{ width: 44, height: 44, borderRadius: 11, flexShrink: 0, position: 'relative', zIndex: 1, background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)', border: `2px solid ${C.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: a.color }}>
              {a.icon}
            </div>
            <div style={{ flex: 1, textAlign: 'left', position: 'relative', zIndex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>{a.label}</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{a.desc}</div>
            </div>
            <span style={{ fontSize: 9, color: C.goldDark, fontWeight: 900, position: 'relative', zIndex: 1, flexShrink: 0 }}>近日</span>
          </button>
        ))}
      </div>
    </div>
  )
}
