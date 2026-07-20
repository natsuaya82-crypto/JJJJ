import { C } from '../../styles/tokens'

export default function FriendsPage() {

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px', gap: 20,
    }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" opacity={0.35}>
        <circle cx="9" cy="7" r="3" stroke={C.text} strokeWidth="1.6"/>
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={C.text} strokeWidth="1.6" strokeLinecap="round"/>
        <circle cx="17" cy="8" r="2.5" stroke={C.text} strokeWidth="1.6"/>
        <path d="M14 20c0-2.8 1.5-5 3-5s3 2.2 3 5" stroke={C.text} strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: 1 }}>フレンド</div>
        <div style={{ fontSize: 13, color: C.textDim, marginTop: 8, lineHeight: 1.7 }}>
          Coming Soon<br/>
          ver 1.13 で実装予定
        </div>
      </div>
    </div>
  )
}
