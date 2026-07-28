import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { TeamLogoSVG } from '../icons/Icons'
import { listReceived, acceptRequest, rejectRequest } from '../../lib/friendsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendReceivedPage() {
  const { data, loading, error, reload, setData } = useFriendsQuery(listReceived)
  const received = data ?? []
  const [busy, setBusy] = useState<string | null>(null)

  const drop = (id: string) => setData(received.filter(x => x.id !== id))

  const onAccept = async (id: string, name: string) => {
    if (busy) return
    setBusy(id)
    try { await acceptRequest(id); drop(id); alert(`${name} と フレンドになりました`) }
    catch { alert('通信できませんでした') }
    finally { setBusy(null) }
  }

  const onReject = async (id: string) => {
    if (busy) return
    setBusy(id)
    try { await rejectRequest(id); drop(id) }
    catch { alert('通信できませんでした') }
    finally { setBusy(null) }
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>承認</div>
      </div>

      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>届いた申請 {loading || error ? '' : received.length}</div>
        {loading ? <LoadingBox /> : error ? <ErrorBox onRetry={reload} /> : received.length === 0 ? (
          <EmptyBox label="新しい申請はありません" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {received.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, opacity: busy === r.id ? 0.5 : 1 }}>
                <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.shortName} logoId={r.logoId} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.gold, marginTop: 2 }}>GM {r.gmName}</div>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 6 }}>
                  <button onClick={() => onAccept(r.id, r.teamName)} disabled={!!busy} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', background: C.gold, color: '#1a0d00', fontSize: 12, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>承認</button>
                  <button onClick={() => onReject(r.id)} disabled={!!busy} style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 12, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>拒否</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
