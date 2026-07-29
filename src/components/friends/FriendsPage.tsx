import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { listFriends, listReceived } from '../../lib/friendsApi'
import { useFriendsQuery } from './friendsUi'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 記録室（RecordsHub）と同じカード意匠でフレンド各画面への入口をまとめる。
export default function FriendsPage() {
  const navigate = useNavigate()
  const friends = useFriendsQuery(listFriends, [], 'friends')
  const received = useFriendsQuery(listReceived, [], 'received')

  const SECTIONS = [
    {
      key: '/friends/list', label: 'フレンド一覧',
      count: friends.data?.length ?? 0, badge: 0, color: C.gold,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M14 20c0-2.8 1.5-5 3-5s3 2.2 3 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      // 申請と承認は同じ画面。分けていると申請のたびに行き来が要って面倒なため
      key: '/friends/requests', label: '申請・承認',
      count: 0, badge: received.data?.length ?? 0, color: C.cyan,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="10" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M3 20c0-3.6 3.1-6.2 7-6.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M18 12v7M14.5 15.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    // 走友会は1つ上の「オンライン」ハブへ移した（OnlinePage.tsx）
  ]

  const offline = friends.error && received.error

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 12px 0' }}><BackButton /></div>
      <div style={{ padding: '8px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>FRIENDS</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>フレンド</div>
        {offline && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.textDim }}>
            オフラインです。通信できる場所で開くとフレンド情報が読み込まれます。
          </div>
        )}
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => navigate(s.key)} className="btn-press" style={{
            width: '100%', padding: '12px 14px', borderRadius: 14, border: `2px solid ${C.goldDark}`, cursor: 'pointer',
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
            display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0, position: 'relative', zIndex: 1,
              background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)', border: `2px solid ${C.bg}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
            }}>
              {s.icon}
            </div>
            <div style={{ flex: 1, textAlign: 'left', position: 'relative', zIndex: 1 }}>
              <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.text }}>{s.label}</span>
              {s.count > 0 && (
                <span style={{ marginLeft: 7, fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: alpha(C.gold, 0.8) }}>{s.count}</span>
              )}
              {s.badge > 0 && (
                <span style={{ marginLeft: 7, padding: '1px 7px', borderRadius: 6, background: s.color, color: C.bg, fontSize: 10, fontWeight: 900 }}>{s.badge}</span>
              )}
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
