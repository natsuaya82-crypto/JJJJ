import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { audio } from '../../utils/audio'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { useNotifCount } from '../notifications/useNotifCount'
import { C, alpha, HEADER_H, NAV_H, NAV_FLOAT, NAV_STACK, MAIN_GAP, bottomStack } from '../../styles/tokens'
import PressButton from '../ui/PressButton'
import ConfirmDialog from '../ui/ConfirmDialog'
import { leaveRoom } from '../../lib/roomsApi'

type MenuAction = { label: string; path?: string; action?: () => void; color?: string }
type NavItem = { to: string; label: string; icon: () => React.ReactElement }

const NAV: NavItem[] = [
  {
    to: '/', label: 'ホーム',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M9 21V12h6v9" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    to: '/team', label: 'マイチーム',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M14 20c0-2.8 1.5-5 3-5s3 2.2 3 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/transfer', label: '移籍',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M7 16l-4-4 4-4M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    to: '/teams', label: 'チーム',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    to: '/online', label: 'オンライン',
    icon: () => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
  },
]

const AD_H = 50
// ページ側が「ヘッダーと下タブの間にちょうど収まる高さ」を計算できるように公開する。
// main は position:fixed で top/bottom を固定しているため、ページで 100dvh を使うと
// ヘッダー＋タブ＋広告のぶんだけ縦に溢れて無駄なスクロールが生まれる。
// 下タブの高さは styles/tokens.ts の1本（HEADER_H と同じ場所）。ここは再輸出だけ。
// ★高さを使った**足し算はここでしないこと**。ページで要るのは
//   `contentHeight(adH)`（tokens）で、そちらが NAV_FLOAT ぶんも見ている
export { NAV_H, MAIN_GAP }

// 画面下部の広告バナーの高さ。買い切り版（adsRemoved）なら0。
// 固定配置の要素（ボトムバー・シート類）はこれを使って広告の上で止める
export function useAdHeight(): number {
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  return adsRemoved ? 0 : AD_H
}

/* ── Animated page wrapper ─────────────────── */
function PageWrapper({ children, locationKey }: { children: React.ReactNode; locationKey: string }) {
  const [key, setKey] = useState(locationKey)
  const [animating, setAnimating] = useState(false)
  const prevKey = useRef(locationKey)

  useEffect(() => {
    if (locationKey !== prevKey.current) {
      prevKey.current = locationKey
      setKey(locationKey)
      setAnimating(true)
      const t = setTimeout(() => setAnimating(false), 220)
      return () => clearTimeout(t)
    }
  }, [locationKey])

  return (
    <div
      key={key}
      style={{
        minHeight: '100%',
        animation: animating ? 'page-in 0.22s cubic-bezier(0.25, 0.46, 0.45, 0.94)' : undefined,
      }}
    >
      {children}
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { teams, playerTeamId, currentSeason, jewels, activeRacePhase } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  // 買い切り版は下部広告なし。確保していた高さ(50px)を詰めてタブ・本文を下まで広げる。
  const adH = adsRemoved ? 0 : AD_H
  const team = teams.find(t => t.id === playerTeamId)
  const location = useLocation()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const notifCount = useNotifCount()
  const mainRef = useRef<HTMLElement>(null)

  // レース準備(lineup)〜進行(simulating)〜結果発表(results)中は下ナビを隠して集中させる（勝手にホーム等へ抜けさせない）
  // 世界選手権(/national/tournament)もECL等と同じくレース進行中はタブバーを隠す。
  // ここに入れ忘れるとLineupPhase等の下部バー(広告の上に固定)がタブバーの裏に隠れて進行不能になる
  const raceInProgress = (activeRacePhase === 'simulating' || activeRacePhase === 'lineup' || activeRacePhase === 'results') && (location.pathname === '/race' || location.pathname === '/ecl' || location.pathname === '/national/tournament')

  // 対戦の部屋にいる間は、下タブの誤タップでそのまま抜けてしまわないように確認をはさむ。
  const roomId = location.pathname.startsWith('/online/room/') ? location.pathname.split('/online/room/')[1] : ''
  const [askLeaveRoom, setAskLeaveRoom] = useState<string | null>(null)   // 移動先のパス
  const leaveRoomAndGo = async () => {
    const to = askLeaveRoom ?? '/'
    setAskLeaveRoom(null)
    try { if (roomId) await leaveRoom(roomId) } catch { /* 通信できなくても画面は進める */ }
    audio.playSe('transition')
    navigate(to)
  }

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [location.pathname])

  const MENU_ITEMS: MenuAction[] = [
    { label: 'ログインボーナス', path: '/login-bonus', color: C.text },
    { label: '記録室', path: '/records', color: C.text },
    { label: 'お知らせ', path: '/announcements', color: C.text },
    { label: '操作方法・遊び方', path: '/help', color: C.text },
    { label: '設定', path: '/more', color: C.text },
  ]

  const isActive = (to: string) => {
    if (to === '/') return location.pathname === '/'
    const hit = (p: string) => location.pathname === p || location.pathname.startsWith(p + '/')
    // フレンド・走友会は「オンライン」タブの下にぶら下がっている。
    // パスは既存の /friends のままなので、タブの点灯だけここで面倒を見る。
    if (to === '/online') return hit('/online') || hit('/friends')
    // 順位表も「チーム」タブの下（パスは /standings なので点灯だけここで面倒を見る）
    if (to === '/teams') return hit('/teams') || hit('/standings')
    return hit(to)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: '480px', margin: '0 auto', position: 'relative',
      // ★背景の写真は `layout/AppBackground` へ移した（`App.tsx` が content を包む）。
      //   Layout はゲームが始まってからしかマウントされないので、ここに置くと
      //   タイトル・オンボーディング・ドラフト・復旧に写真が出ない。
      //   **ページの一番外側に `background: C.bg` を敷かないこと**（写真が消える）。
    }}>

      {/* ── Header（実機で固定：viewport上端＋safe-area） ── */}
      <header style={{
        position: 'fixed', top: 'env(safe-area-inset-top)', left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: '480px', zIndex: 40,
        background: C.bg,
        padding: '2px 16px 2px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${alpha(C.gold, 0.1)}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {team && (
            <>
              <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={32}/>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, lineHeight: 1.2 }}>{team.shortName}</div>
                <div className="season-tag" style={{ marginTop: 3 }}>
                  {currentSeason.year} SEASON
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {/* Jewel display */}
          {raceInProgress ? null : (<>
          <button
            onClick={() => navigate('/jewels')}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'linear-gradient(135deg, #0f2240 0%, #0a1729 100%)', border: `1px solid ${alpha('#6dd5fa', 0.3)}`,padding: '5px 6px 5px 7px', margin: '0 4px', cursor: 'pointer' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="url(#jg)" stroke="#4ab8ea" strokeWidth="1.2" strokeLinejoin="round"/>
              <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="none" stroke="#a8e4ff" strokeWidth="0.6" strokeLinejoin="round" opacity="0.5" transform="scale(0.55) translate(10.9 10.9)"/>
              <defs>
                <linearGradient id="jg" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#a8e4ff"/>
                  <stop offset="100%" stopColor="#3b9fd4"/>
                </linearGradient>
              </defs>
            </svg>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#6dd5fa', letterSpacing: '0.3px', minWidth: '24px', textAlign: 'right' }}>
              {jewels.toLocaleString()}
            </span>
            <span style={{ fontSize: '14px', fontWeight: '900', color: alpha('#6dd5fa', 0.85), lineHeight: 1, paddingLeft: '2px' }}>+</span>
          </button>

          {/* Notification bell */}
          <button
            onClick={() => navigate('/notifications')}
            style={{
              position: 'relative', background: 'none', border: 'none', cursor: 'pointer',
              color: notifCount > 0 ? C.gold : C.border2, padding: '10px',
              display: 'flex', alignItems: 'center', minHeight: '44px', minWidth: '44px', justifyContent: 'center',
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {notifCount > 0 && (
              <div style={{
                position: 'absolute', top: 6, right: 6,
                width: '16px', height: '16px', borderRadius: '50%',
                backgroundColor: C.red,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '9px', fontWeight: '800', color: '#fff',
                border: `1.5px solid ${C.bg}`,
              }}>
                {notifCount > 9 ? '9+' : notifCount}
              </div>
            )}
          </button>

          {/* Hamburger */}
          <button
            onClick={() => setMenuOpen(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: menuOpen ? C.gold : C.border2, padding: '10px',
              display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', justifyContent: 'center',
              minHeight: '44px', minWidth: '44px',
              transition: 'color 0.15s ease',
            }}
          >
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: 'currentColor',transition: 'transform 0.15s ease', transform: menuOpen ? 'rotate(45deg) translate(4px, 4px)' : 'none' }}/>
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: 'currentColor',transition: 'opacity 0.15s ease', opacity: menuOpen ? 0 : 1 }}/>
            <span style={{ display: 'block', width: '18px', height: '2px', backgroundColor: 'currentColor',transition: 'transform 0.15s ease', transform: menuOpen ? 'rotate(-45deg) translate(4px, -4px)' : 'none' }}/>
          </button>
          </>)}
        </div>
      </header>

      {/* ── Hamburger Menu Dropdown ── */}
      {menuOpen && (
        <>
          <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 45 }}/>
          <div style={{
            position: 'fixed', top: `calc(${HEADER_H}px + env(safe-area-inset-top))`, right: 'max(8px, calc(50% - 232px))', zIndex: 46,
            backgroundColor: C.surface, border: `1px solid ${C.border2}`,
            minWidth: '180px', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}>
            {MENU_ITEMS.map((item, i) => (
              <button key={i} onClick={() => { setMenuOpen(false); if (item.path) navigate(item.path); item.action?.() }} style={{
                width: '100%', padding: '14px 16px', background: 'none', border: 'none',
                borderBottom: i < MENU_ITEMS.length - 1 ? `1px solid ${C.border}` : 'none',
                color: item.color ?? C.textSub, fontSize: '13px', fontWeight: '600',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                minHeight: '48px',
              }}>
                {item.label}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Content（ヘッダーの下から、広告/セーフエリアの上までをスクロール） ──
          ★下タブは**ガラスなので、中身はその裏まで続ける**（下で切ると
            透ける物が無くなって、ただの暗い板になる）。下タブに隠れないよう
            スクロールの終わりに下タブぶんの余白を足す。 */}
      <main ref={mainRef} style={{
        position: 'fixed', left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: '480px',
        top: `calc(${HEADER_H}px + env(safe-area-inset-top))`,
        bottom: bottomStack(adH),
        paddingBottom: raceInProgress ? 0 : NAV_STACK + MAIN_GAP,
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        <PageWrapper locationKey={location.pathname}>
          {children}
        </PageWrapper>
      </main>

      {/* ── Bottom Nav ── */}
      {/* ── Bottom Nav ──
          下端に貼り付けず**浮かせたガラス**。浮かせたぶん（NAV_FLOAT）は
          `bottomStack` が足すので、上に置く画面がずれない。 */}
      {raceInProgress ? null : <nav className="bottom-nav" style={{
        position: 'fixed', bottom: bottomStack(adH, { extra: NAV_FLOAT }),
        left: NAV_FLOAT, right: NAV_FLOAT, margin: '0 auto',
        width: `calc(100% - ${NAV_FLOAT * 2}px)`, maxWidth: 480 - NAV_FLOAT * 2,
        height: `${NAV_H}px`,
        // スモークガラス。**後ろが透けること**が大事なので塗りを濃くしない
        background: 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
        backdropFilter: 'blur(14px) saturate(118%)',
        WebkitBackdropFilter: 'blur(14px) saturate(118%)',
        border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around',
        zIndex: 50,
        boxShadow: [
          'inset 0 0 0 1px rgba(255,255,255,0.16)', // 細い縁
          'inset 0 1px 0 rgba(255,255,255,0.26)',   // 上のふちの光
          'inset 0 -1px 0 rgba(0,0,0,0.35)',        // 下の屈折
          '0 12px 28px -14px rgba(0,0,0,0.95)',     // 浮いている影
        ].join(', '),
        overflow: 'hidden',
      }}>
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = isActive(to)
          return (
            <PressButton key={to}
              data-se="transition"
              onClick={() => {
                if (roomId) { setAskLeaveRoom(to); return }
                audio.playSe('transition'); navigate(to)
              }}
              style={{
                flex: 1, height: '100%', border: 'none', background: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2, cursor: 'pointer', position: 'relative', minHeight: '44px',
                color: active ? '#fff' : C.textDim,
              }}
            >
              {/* 選んでいるものだけ、光が閉じ込められた小さなガラス */}
              <div className="bottom-nav__pill" style={{
                width: 46, height: 28,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: active
                  ? `linear-gradient(180deg, ${alpha(C.cyan, 0.24)} 0%, ${alpha(C.cyan, 0.09)} 100%)`
                  : 'none',
                border: active ? `1px solid ${alpha(C.cyan, 0.55)}` : '1px solid transparent',
                boxShadow: active
                  ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 0 10px ${alpha(C.cyan, 0.18)}`
                  : 'none',
                transform: active ? 'translateY(-1px)' : 'none',
                transition: 'all 0.18s ease',
                flexShrink: 0,
                color: active ? C.cyan : C.textDim,
              }}>
                <Icon/>
              </div>
              <span style={{
                fontSize: '10px',
                fontWeight: active ? 700 : 400,
                letterSpacing: '0.3px',
                color: active ? C.cyan : C.textDim,
                transition: 'color 0.18s ease',
              }}>
                {label}
              </span>
            </PressButton>
          )
        })}
      </nav>}


      {/* ── Ad Space（買い切り版では非表示） ── */}
      {!adsRemoved && (
        <div style={{
          position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px',
          height: `${AD_H}px`,
          backgroundColor: '#070610',
          borderTop: `1px solid ${C.border}`,
          zIndex: 60,
        }}>
          {/* 実機はネイティブのAdMobバナーがこの枠に表示される。Web側のプレースホルダーは出さない（二重表示防止）。 */}
        </div>
      )}

      {askLeaveRoom && (
        <ConfirmDialog
          title="部屋を抜けますか？"
          message="対戦中の部屋から出ます。もう一度入るには番号が必要です。"
          confirmLabel="抜ける"
          cancelLabel="対戦を続ける"
          accent={C.red}
          onConfirm={leaveRoomAndGo}
          onCancel={() => setAskLeaveRoom(null)}
        />
      )}
    </div>
  )
}
