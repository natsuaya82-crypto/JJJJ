import { useNavigate } from 'react-router-dom'
import { listReceived } from '../../lib/friendsApi'
import { useFriendsQuery } from '../friends/friendsUi'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'
import { onlineAvailable } from '../../data/featureFlags'


// 下タブ「オンライン」の入口。通信を使う機能をここに集める。
// この下にさらにハブがある（例：フレンド → フレンド一覧／申請・承認）。
export default function OnlinePage() {
  const navigate = useNavigate()
  // 公開していない間はサーバーに一切つながない（申請件数のバッジも出さない）
  const received = useFriendsQuery(
    () => (onlineAvailable() ? listReceived() : Promise.resolve([])),
    [], 'received',
  )

  const SECTIONS: {
    key: string; label: string; en: string; badge: number; color: string
    icon: React.ReactNode; soon?: boolean
    /** オンラインが使えない状態でも押せる（端末内で完結する機能） */
    alwaysOn?: boolean
  }[] = [
    {
      key: '/friends', label: 'フレンド', en: 'FRIENDS',
      badge: received.data?.length ?? 0, color: C.gold,
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
      key: '/friends/club', label: '走友会', en: 'CLUB',
      badge: 0, color: C.orange,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="7" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7"/>
          <circle cx="17" cy="8" r="2.4" stroke="currentColor" strokeWidth="1.7"/>
          <circle cx="12" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.7"/>
          <path d="M3 19c0-2.5 1.8-4.5 4-4.5M21 19c0-2.5-1.8-4.5-4-4.5M8 20c0-3 1.8-5 4-5s4 2 4 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: '/online/match', label: 'オンライン対戦', en: 'VERSUS',
      badge: 0, color: C.cyan,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 18l3-9M11 18l1.5-9M18 18l-1-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <circle cx="7.6" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.7"/>
          <circle cx="16.4" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.7"/>
        </svg>
      ),
    },
    {
      key: '/online/history', label: '対戦履歴', en: 'HISTORY',
      badge: 0, color: C.blue,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 7v5l3.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      // イベント → レート戦（docs/ONLINE_RATED_DESIGN.md）。
      // いまはレート戦だけなので、そのままレート戦の画面へ入る
      key: '/online/rated', label: 'イベント', en: 'EVENTS',
      badge: 0, color: C.green,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 8.5l5.2-.8L12 3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      // 殿堂入りは端末内で完結するので、オンラインが使えない状態でも押せる（下の soon を付けない）
      key: '/online/hof', label: '殿堂入りチーム', en: 'HALL OF FAME',
      badge: 0, color: C.gold, alwaysOn: true,
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
          <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7 11M17 6h3v1.5A3.5 3.5 0 0 1 17 11" stroke="currentColor" strokeWidth="1.7"/>
          <path d="M12 13v4M9 20h6M10 17h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  // 公開していない間は薄く表示して押せなくする。
  // 殿堂入り（alwaysOn）だけは、オンラインが使えない状態でも押せる。端末内で完結するため
  const sections = onlineAvailable()
    ? SECTIONS
    : SECTIONS.map(s => (s.alwaysOn ? s : { ...s, soon: true, badge: 0 }))

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>ONLINE</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>オンライン</div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => { if (!s.soon) navigate(s.key) }}
            className={[
              'premium-menu-button',
              s.color === C.cyan ? 'premium-menu-button--cyan' : '',
              s.soon ? 'is-off' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="premium-menu-button__icon-area">
              <span className="premium-menu-button__icon">{s.icon}</span>
            </span>
            <span className="premium-menu-button__content">
              <span className="premium-menu-button__english">{s.en}</span>
              <span className="premium-menu-button__japanese">
                {s.label}
                {s.badge > 0 && (
                  <span style={{ marginLeft: 7, padding: '1px 7px', borderRadius: 6, background: s.color, color: C.bg, fontSize: 10, fontWeight: 900 }}>{s.badge}</span>
                )}
                {/* 説明は置かない（名前で分かるものに注釈を足さない）。「準備中」だけは状態なので出す */}
                {s.soon && <span style={{ fontSize: 10, color: alpha(C.text, 0.45), marginLeft: 8 }}>準備中</span>}
              </span>
            </span>
            {!s.soon && <span className="premium-menu-button__arrow">›</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
