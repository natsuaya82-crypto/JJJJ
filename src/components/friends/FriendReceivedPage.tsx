import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { TeamLogoSVG } from '../icons/Icons'
import { MOCK_RECEIVED } from '../../data/mockFriends'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendReceivedPage() {
  const [received, setReceived] = useState(MOCK_RECEIVED)

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>承認</div>
      </div>

      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>届いた申請 {received.length}</div>
        {received.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textGhost, fontSize: 12, padding: '28px 0', background: C.surface2, borderRadius: 12, border: `1px solid ${C.border2}` }}>新しい申請はありません</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {received.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}` }}>
                <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} logoId={r.logoId} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginTop: 2 }}>GM {r.gmName}</div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
                  <button onClick={() => { alert(`${r.teamName} を承認しました（※UIモック）`); setReceived(s => s.filter(x => x.id !== r.id)) }} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: C.gold, color: '#1a0d00', fontSize: 12, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>承認</button>
                  <button onClick={() => setReceived(s => s.filter(x => x.id !== r.id))} style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 12, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>拒否</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
