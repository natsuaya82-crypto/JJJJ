import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { TeamLogoSVG } from '../icons/Icons'
import { listFriends } from '../../lib/friendsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendListPage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFriendsQuery(listFriends)
  const friends = data ?? []

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px 4px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>フレンド一覧</div>
      </div>

      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, marginBottom: 8, paddingLeft: 4 }}>フレンド {loading || error ? '' : friends.length}</div>
        {loading ? <LoadingBox /> : error ? <ErrorBox onRetry={reload} /> : friends.length === 0 ? (
          <EmptyBox label="まだフレンドがいません。「申請」からコードで追加できます" />
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {friends.map(f => (
            <button key={f.id} onClick={() => navigate(`/friends/team/${f.id}`)} className="btn-press" style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '12px', borderRadius: 14, fontFamily: SAIRA,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.border2}`, boxShadow: `0 4px 0 ${alpha('#000', 0.45)}, inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <TeamLogoSVG primary={f.primary} secondary={f.secondary} shortName={f.shortName} logoId={f.logoId} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.teamName}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginTop: 3 }}>GM {f.gmName}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>最終ログイン {f.lastLogin}</div>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: C.goldDark, flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}
