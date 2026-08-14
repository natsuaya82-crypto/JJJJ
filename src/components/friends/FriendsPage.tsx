import MenuButton from '../ui/MenuButton'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { listFriends, listReceived } from '../../lib/friendsApi'
import { useFriendsQuery } from './friendsUi'
import { C, FONT } from '../../styles/tokens'


// 記録室（RecordsHub）と同じカード意匠でフレンド各画面への入口をまとめる。
export default function FriendsPage() {
  const navigate = useNavigate()
  const friends = useFriendsQuery(listFriends, [], 'friends')
  const received = useFriendsQuery(listReceived, [], 'received')

  const SECTIONS = [
    {
      key: '/friends/list', label: 'フレンド一覧', en: 'FRIENDS',
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
      key: '/friends/requests', label: '申請・承認', en: 'REQUESTS',
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
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100dvh' }}>
      <PageHeader eyebrow="FRIENDS" title="フレンド" />
      {offline && (
        <div style={{ padding: '0 16px 14px', fontSize: 11, color: C.textDim }}>
          オフラインです。通信できる場所で開くとフレンド情報が読み込まれます。
        </div>
      )}

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECTIONS.map(s => (
          <MenuButton
            key={s.key}
            icon={s.icon}
            label={s.label}
            en={s.en}
            badge={s.count}
            badgeColor={s.color}
            color={s.color}
            onClick={() => navigate(s.key)}
          />
        ))}
      </div>
    </div>
  )
}
