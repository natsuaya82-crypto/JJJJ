import { useNavigate } from 'react-router-dom'
import { C, SAIRA, FONT, F } from '../../styles/tokens'
import MenuButton from '../ui/MenuButton'
import { onlineAvailable } from '../../data/featureFlags'


// 下タブ「オンライン」の入口。通信を使う機能をここに集める。
// この下にさらにハブがある（例：フレンド → フレンド一覧／申請・承認）。
export default function OnlinePage() {
  const navigate = useNavigate()

  const SECTIONS: {
    key: string; label: string; en: string; badge: number; color: string
    icon: React.ReactNode; soon?: boolean
    /** オンラインが使えない状態でも押せる（端末内で完結する機能） */
    alwaysOn?: boolean
  }[] = [
    {
      // ★申請の数字はここに出さない（オーナー・2026-08-15「フレンドってとこに①って
      //   つくやついらんな。申請はあってもいい」）。ベルが出すようになったので、
      //   ここに出すと同じ数が2段重なる。出すのは1つ下の「申請・承認」の行だけ
      key: '/friends', label: 'フレンド', en: 'FRIENDS',
      badge: 0, color: C.gold,
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
      // イベント → **一覧の画面**（docs/ONLINE_RATED_DESIGN.md）。
      // ★以前はここから直接レート戦の画面へ入っていたので、押した瞬間に見出しが
      //   「イベント」から変わり、間に何も無かった。**ランクマッチ以外のイベントも
      //   やるので、一覧を挟む**（オーナー・2026-08-14「別もやるから分けて」）。
      // ★一覧に載せるのは**オンラインのイベントだけ**。カード強化の大成功アップの
      //   ような、押して入る場所でないものを混ぜないこと（オーナーの指摘）。
      key: '/online/events', label: 'イベント', en: 'EVENTS',
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
    <div style={{ fontFamily: FONT, paddingBottom: 80, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>ONLINE</div>
        <div style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: C.text }}>オンライン</div>
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sections.map(s => (
          <MenuButton
            key={s.key}
            icon={s.icon}
            label={s.label}
            en={s.en}
            badge={s.badge}
            badgeColor={s.color}
            note={s.soon ? '準備中' : undefined}
            color={s.color}
            disabled={s.soon}
            onClick={() => navigate(s.key)}
          />
        ))}
      </div>
    </div>
  )
}
