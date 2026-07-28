import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import PlayerRow from '../player/PlayerRow'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { TeamLogoSVG } from '../icons/Icons'
import { getFriend, getFriendRoster, removeFriend } from '../../lib/friendsApi'
import { useFriendsQuery, LoadingBox, ErrorBox, EmptyBox } from './friendsUi'
import { usePreviewStore } from '../../store/previewStore'
import { ovr } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function FriendDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const longPress = usePlayerLongPress()
  const setPreview = usePreviewStore(s => s.setPlayers)

  const head = useFriendsQuery(() => getFriend(id), [id])
  const list = useFriendsQuery(() => (id ? getFriendRoster(id) : Promise.resolve([])), [id])
  const friend = head.data
  const roster = list.data ?? []

  // フレンドのロスター選手を「長押し詳細」で開けるよう、この画面の間だけプレビュー登録する
  // list.data を依存にする（roster は毎レンダー新しい配列になるため、入れると無限ループする）
  useEffect(() => {
    setPreview(list.data ?? [])
    return () => setPreview([])
  }, [id, list.data]) // eslint-disable-line react-hooks/exhaustive-deps

  if (head.loading) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px', minHeight: '100%', background: C.bg }}>
        <BackButton />
        <div style={{ marginTop: 40 }}><LoadingBox /></div>
      </div>
    )
  }
  if (head.error) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px', minHeight: '100%', background: C.bg }}>
        <BackButton />
        <div style={{ marginTop: 40 }}><ErrorBox onRetry={head.reload} /></div>
      </div>
    )
  }
  if (!friend) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px' }}>
        <BackButton />
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 14, padding: '60px 0' }}>フレンドが見つかりません</div>
      </div>
    )
  }

  const avgOvr = roster.length ? Math.round(roster.reduce((s, p) => s + ovr(p), 0) / roster.length) : 0

  const onRemove = async () => {
    if (!confirm(`${friend.teamName} とのフレンドを解除しますか？`)) return
    try { await removeFriend(friend.id); navigate('/friends/list', { replace: true }) }
    catch { alert('通信できませんでした') }
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: 32, minHeight: '100%', background: C.bg }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 6px' }}>
        <BackButton />
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.6), letterSpacing: '3px', fontWeight: 900 }}>FRIEND</div>
        <div style={{ flex: 1 }} />
        <button onClick={onRemove} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>解除</button>
      </div>

      {/* チーム情報 */}
      <div style={{ margin: '4px 12px 0', padding: '14px 16px', borderRadius: 16, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.gold, 0.4)}`, boxShadow: `0 4px 0 ${C.goldDark}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <TeamLogoSVG primary={friend.primary} secondary={friend.secondary} shortName={friend.shortName} logoId={friend.logoId} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: C.text, lineHeight: 1.2 }}>{friend.teamName}</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.gold, marginTop: 3 }}>GM {friend.gmName}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[['平均OVR', `${avgOvr}`], ['最終ログイン', friend.lastLogin], ['通算優勝', `${friend.champs}回`]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, padding: '9px 8px', borderRadius: 10, background: alpha(C.bg, 0.4), border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 8, color: C.textDim, marginBottom: 2 }}>{k}</div>
              <div style={{ fontSize: 15, fontWeight: 900, color: C.text, fontFamily: SAIRA }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 現状ロスター（全員）— 既存の PlayerRow を流用。長押しで選手詳細 */}
      <div style={{ padding: '16px 0 0' }}>
        <div style={{ fontSize: 10, color: alpha(C.gold, 0.55), letterSpacing: '2px', fontWeight: 900, marginBottom: 8, paddingLeft: 16 }}>現在のロスター（長押しで詳細）</div>
        {list.loading ? (
          <div style={{ padding: '0 16px' }}><LoadingBox /></div>
        ) : list.error ? (
          <div style={{ padding: '0 16px' }}><ErrorBox onRetry={list.reload} /></div>
        ) : roster.length === 0 ? (
          <div style={{ padding: '0 16px' }}><EmptyBox label="相手がまだロスターを共有していません" /></div>
        ) : (
          <div>
            {roster.map(p => (
              <PlayerRow key={p.id} player={p} handlers={{ ...longPress(p.id), onClick: () => {} }} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
