import { useNavigate } from 'react-router-dom'
import { panelStyle } from '../ui/Panel'
import PageHeader from '../ui/PageHeader'
import { TeamLogoSVG } from '../icons/Icons'
import { listFriends } from '../../lib/friendsApi'
import { clubsOfUsers } from '../../lib/clubsApi'
import { clubLogoSrc } from '../../data/clubLogos'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { C, alpha, SAIRA } from '../../styles/tokens'


export default function FriendListPage() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useFriendsQuery(listFriends, [], 'friends')
  const friends = data ?? []

  // 全員ぶんの所属走友会を1回のリクエストでまとめて取る。
  // 取れなくても一覧はそのまま出す（走友会の行が出ないだけ）。
  const ids = friends.map(f => f.id).join(',')
  const clubs = useFriendsQuery(
    () => clubsOfUsers(ids ? ids.split(',') : []),
    [ids],
    'friendClubs',
  )

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 80, minHeight: '100%', background: C.bg }}>
      <PageHeader title="フレンド一覧" />

      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '2px', fontWeight: 900, marginBottom: 8, paddingLeft: 4 }}>フレンド {loading || error ? '' : friends.length}</div>
        {loading ? <LoadingBox /> : error ? <ErrorBox onRetry={reload} /> : friends.length === 0 ? (
          <EmptyBox label="まだフレンドがいません。「申請・承認」からコードで追加できます" />
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {friends.map(f => (
            <button key={f.id} onClick={() => navigate(`/friends/team/${f.id}`)} className="btn-press" style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '12px', fontFamily: SAIRA, ...panelStyle(C.border3),
            }}>
              <TeamLogoSVG primary={f.primary} secondary={f.secondary} shortName={f.shortName} logoId={f.logoId} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.teamName}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.gold, marginTop: 3 }}>GM {f.gmName}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>最終ログイン {f.lastLogin}</div>
                {clubs.data?.get(f.id) && (
                  // ここだけ押すと、走友会の画面がその走友会を探した状態で開く。
                  // 外側がボタンなので、中にボタンは置けない（入れ子は駄目）。
                  <div
                    onClick={e => { e.stopPropagation(); navigate(`/friends/club?code=${clubs.data!.get(f.id)!.code}`) }}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 3, maxWidth: '100%', padding: '2px 6px 2px 4px', marginLeft: -4, borderRadius: 8, border: `1px solid ${C.border}`, background: alpha(C.bg, 0.35), cursor: 'pointer' }}>
                    <img src={clubLogoSrc(clubs.data.get(f.id)!.logoId)} alt="" width={14} height={14} draggable={false} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} />
                    <div style={{ fontSize: 10, color: C.textSub, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clubs.data.get(f.id)!.name}</div>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: C.goldDark, flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </div>
                )}
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
