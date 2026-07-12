import { MemoryRouter as BrowserRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useGameStore } from './store/gameStore'
import { flushSaveNow } from './store/saveStorage'
import { audio } from './utils/audio'
import { initAds, removeBanner, showBanner } from './utils/ads'
import { initLocalNotifications } from './utils/notifications'
import { clearMarketFilters } from './utils/marketFilters'
import LoadingOverlay from './components/ui/LoadingOverlay'
import ForceUpdateModal from './components/ui/ForceUpdateModal'
import TwitterModal from './components/ui/TwitterModal'
import { runWithLoading } from './store/loadingStore'
import TitleScreen from './components/title/TitleScreen'
import Layout from './components/layout/Layout'
import MorePage from './components/more/MorePage'
import AnnouncementsPage from './components/more/AnnouncementsPage'
import Dashboard from './components/dashboard/Dashboard'
import TeamManagement from './components/team/TeamManagement'
import Onboarding from './components/onboarding/Onboarding'
import DraftRoom from './components/draft/DraftRoom'
import RacePage from './components/race/RacePage'
import ScoutPage from './components/scout/ScoutPage'
import TransferPage from './components/transfer/TransferPage'
import TransferHub from './components/transfer/TransferHub'
import TeamHub from './components/team/TeamHub'
import TeamsHub from './components/teams/TeamsHub'
import TeamDetailPage from './components/teams/TeamDetailPage'
import ForeignLeagueDetailPage from './components/teams/ForeignLeagueDetailPage'
import ForeignClubDetailPage from './components/teams/ForeignClubDetailPage'
import ChatPage from './components/team/ChatPage'
import FriendsPage from './components/friends/FriendsPage'
import RecordsHub from './components/records/RecordsHub'
import RecordsPage from './components/records/RecordsPage'
import PlayersStatsPage from './components/records/PlayersStatsPage'
import DraftHistoryPage from './components/records/DraftHistoryPage'
import AchievementsPage from './components/records/AchievementsPage'
import ReserveLeaguePage from './components/reserve/ReserveLeaguePage'
import PlayerSheet from './components/shared/PlayerSheet'
import ContractInfoModal from './components/shared/ContractInfoModal'
import NotificationsPage from './components/notifications/NotificationsPage'
import HelpPage from './components/help/HelpPage'
import SchedulePage from './components/schedule/SchedulePage'
import ShopPage from './components/shop/ShopPage'
import SponsorPage from './components/sponsors/SponsorPage'
import StarredPlayersPage from './components/transfer/StarredPlayersPage'
import OfferListPage from './components/transfer/OfferListPage'
import RentalPage from './components/transfer/RentalPage'
import FacilitiesPage from './components/facilities/FacilitiesPage'
import WorldEkidenPage from './components/international/WorldEkidenPage'
import WECSimPage from './components/international/WECSimPage'
import ObjectivesPage from './components/objectives/ObjectivesPage'
import CardTrainingPage from './components/training/CardTrainingPage'
import CardInventoryPage from './components/training/CardInventoryPage'
import CardSelectPage from './components/training/CardSelectPage'
import BudgetPage from './components/budget/BudgetPage'
import LoginBonusPage from './components/login/LoginBonusPage'
import NewsPage from './components/news/NewsPage'
import JewelsPage from './components/jewels/JewelsPage'

function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: '28px 20px' }}>
      <div style={{ fontSize: '11px', color: '#5C5870', letterSpacing: '3px', marginBottom: '12px' }}>
        {title.toUpperCase()}
      </div>
      <div style={{
        padding: '60px 20px', textAlign: 'center',
        backgroundColor: '#1E1B2E', borderRadius: '14px', border: '1px solid #2E2B42',
        color: '#3A3758', fontSize: '14px',
      }}>
        Coming soon...
      </div>
    </div>
  )
}

// シーズン終了で確定した来期予算をホームで一度だけポップ表示する。
function SeasonBudgetNotice() {
  const notice = useGameStore(s => s.seasonBudgetNotice)
  const dismiss = useGameStore(s => s.dismissBudgetNotice)
  const navigate = useNavigate()
  if (!notice) return null
  const SAIRA = "'Saira Condensed', system-ui, sans-serif"
  const fmtYen = (yen: number) => yen >= 100000000 ? `${(yen / 100000000).toFixed(1)}億` : `${Math.round(yen / 10000)}万`
  return (
    <div onClick={dismiss} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(360px, 90vw)', background: '#1a2c47', borderRadius: 18, border: '2px solid #f5c842', padding: '24px 20px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 11, color: '#f5c842', letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>SEASON BUDGET</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 16 }}>{notice.year}シーズンの予算が確定しました</div>
        <div style={{ fontFamily: SAIRA, fontSize: 44, fontWeight: 900, color: notice.budget >= 0 ? '#2ecc71' : '#ff4757', lineHeight: 1, marginBottom: 20 }}>{fmtYen(notice.budget)}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { dismiss(); navigate('/') }} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: '#f5c842', color: '#1a0d00', fontSize: 15, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>OK</button>
          <button onClick={() => { dismiss(); navigate('/budget') }} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #f5c842', background: 'transparent', color: '#f5c842', fontSize: 15, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>確認</button>
        </div>
      </div>
    </div>
  )
}

function AppRoutes({ resetGame, onBackToTitle }: { resetGame: () => void; onBackToTitle: () => void }) {
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  // 画面遷移SE。BGMは基本ホーム（/race 中の race BGM は RacePage が制御する）。
  // 戻る操作のときは back音が鳴るので遷移SEは抑制する。
  useEffect(() => {
    // /race 中の BGM（home/race 切替）は RacePage が制御するので、ここでは触らない
    if (location.pathname !== '/race') audio.playBgm('home')
    if (prevPath.current !== location.pathname) {
      prevPath.current = location.pathname
    }
    // 移籍市場の検索フィルタは、市場系画面（/transfer配下と契約交渉のチャット往復）を
    // 完全に離れたときだけクリアする（結果⇄一覧の行き来では保持）
    const p = location.pathname
    if (!p.startsWith('/transfer') && p !== '/team/chat') clearMarketFilters()
  }, [location.pathname])

  // 全タップSE。このアプリは <div onClick> が多いので、button/a に加えて
  // cursor:pointer を持つ要素も「押せる要素」とみなして鳴らす。
  // 固有音を持つ要素（data-se 付き＝戻る等）の配下は除外する。
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target || target.closest('[data-se]')) return
      let el: HTMLElement | null = target
      while (el && el !== document.body) {
        if (el.matches('button, a, [role="button"]') || getComputedStyle(el).cursor === 'pointer') {
          audio.playSe('tap')
          return
        }
        el = el.parentElement
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  if (location.pathname === '/international/sim') {
    return <WECSimPage />
  }

  return (
    <>
      <PlayerSheet />
      <ContractInfoModal />
      <SeasonBudgetNotice />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/team" element={<TeamHub />} />
          <Route path="/team/chat" element={<ChatPage />} />
          <Route path="/team/facilities" element={<FacilitiesPage />} />
          <Route path="/team/:section" element={<TeamManagement />} />
          <Route path="/race" element={<RacePage />} />
          <Route path="/scout" element={<ScoutPage />} />

          <Route path="/teams" element={<TeamsHub />} />
          <Route path="/teams/detail/:teamId" element={<TeamDetailPage />} />
          <Route path="/teams/foreign/:leagueId" element={<ForeignLeagueDetailPage />} />
          <Route path="/teams/foreign/:leagueId/:clubId" element={<ForeignClubDetailPage />} />
          <Route path="/teams/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/transfer" element={<TransferHub />} />
          <Route path="/transfer/starred" element={<StarredPlayersPage />} />
          <Route path="/transfer/offers" element={<OfferListPage />} />
          <Route path="/transfer/rental" element={<RentalPage />} />
          <Route path="/transfer/:section" element={<TransferPage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/jewels" element={<JewelsPage />} />
          <Route path="/international" element={<WorldEkidenPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/records" element={<RecordsHub />} />
          <Route path="/records/season" element={<RecordsPage />} />
          <Route path="/records/players" element={<PlayersStatsPage />} />
          <Route path="/records/draft" element={<DraftHistoryPage />} />
          <Route path="/records/draft/:year" element={<DraftHistoryPage />} />
          <Route path="/records/achievements" element={<AchievementsPage />} />
          <Route path="/records/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/sponsors" element={<SponsorPage />} />
          <Route path="/reserve" element={<ReserveLeaguePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/cards" element={<CardTrainingPage />} />
          <Route path="/cards/list" element={<CardInventoryPage />} />
          <Route path="/cards/select" element={<CardSelectPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/login-bonus" element={<LoginBonusPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/more" element={<MorePage onBackToTitle={onBackToTitle} />} />
          <Route path="/announcements" element={<AnnouncementsPage />} />
        </Routes>
      </Layout>
    </>
  )
}

const BUNDLE_ID = 'com.tokinets.jpelmanager'
const APP_VERSION = '1.0.5'

function compareVersions(a: string, b: string): number {
  const toArr = (v: string) => v.split('.').map(Number)
  const [a1, a2, a3] = toArr(a)
  const [b1, b2, b3] = toArr(b)
  if (a1 !== b1) return a1 - b1
  if (a2 !== b2) return a2 - b2
  return a3 - b3
}

export default function App() {
  const { isInitialized, draftState, resetGame } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const grantUpdateGifts = useGameStore(s => s.grantUpdateGifts)
  const ensureIndividualEvents = useGameStore(s => s.ensureIndividualEvents)
  const twitterIntroSeen = useGameStore(s => s.twitterIntroSeen ?? false)
  const markTwitterIntroSeen = useGameStore(s => s.markTwitterIntroSeen)
  const [titleShown, setTitleShown] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const [showTwitter, setShowTwitter] = useState(false)
  // セーブ読み込み（非同期）完了までタイトルから先へ進めない。
  // 完了前に isInitialized=false の初期状態を見て新規ゲーム画面を出すと、既存セーブを上書きする事故になるため
  const [hydrated, setHydrated] = useState(() => useGameStore.persist.hasHydrated())
  useEffect(() => {
    if (hydrated) return
    const unsub = useGameStore.persist.onFinishHydration(() => setHydrated(true))
    return unsub
  }, [hydrated])

  // 重要操作（レース確定=currentRaceIndex / シーズン更新=year / 購入=adsRemoved / 開始・リセット=isInitialized）の
  // 直後にセーブを即時フラッシュ（デバウンス待ちの間にアプリがキルされても消えないように）。native のみ実効。
  // persist の setItem 完了後に走らせるため microtask で1拍遅らせる。
  useEffect(() => {
    const unsub = useGameStore.subscribe((s, p) => {
      if (
        s.currentSeason.year !== p.currentSeason.year ||
        s.currentSeason.currentRaceIndex !== p.currentSeason.currentRaceIndex ||
        s.adsRemoved !== p.adsRemoved ||
        s.isInitialized !== p.isInitialized
      ) queueMicrotask(() => { void flushSaveNow() })
    })
    return unsub
  }, [])

  useEffect(() => {
    fetch(`https://itunes.apple.com/jp/lookup?bundleId=${BUNDLE_ID}`)
      .then(r => r.json())
      .then(data => {
        const storeVersion: string | undefined = data.results?.[0]?.version
        if (storeVersion && compareVersions(storeVersion, APP_VERSION) > 0) {
          setForceUpdate(true)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => { initAds(adsRemoved) }, [])
  // アップデート記念プレゼントを配布（冪等。ゲーム開始済みのときだけ）
  useEffect(() => { if (isInitialized) grantUpdateGifts() }, [isInitialized])
  // 既存セーブ移行：現シーズンに新しい記録会7回を注入（冪等。リセット不要で反映）
  useEffect(() => { if (isInitialized) ensureIndividualEvents() }, [isInitialized])
  // 公式Xフォロー案内を初回起動時に一度だけ表示（タイトルを抜けてホームに入ったタイミング）
  useEffect(() => { if (titleShown && isInitialized && !twitterIntroSeen) setShowTwitter(true) }, [titleShown, isInitialized, twitterIntroSeen])
  // 端末ローカル通知（毎日10時・18時の再訪リマインド）。native のみ、初回に許可を取得。
  useEffect(() => { initLocalNotifications() }, [])
  // 買い切りの購入/復元でフラグが変わったらバナー表示を切り替える（初回マウントは initAds が担当）
  const adsRemovedInit = useRef(adsRemoved)
  useEffect(() => {
    if (adsRemoved === adsRemovedInit.current) return
    adsRemovedInit.current = adsRemoved
    if (adsRemoved) removeBanner()
    else showBanner()
  }, [adsRemoved])

  let content
  if (!titleShown || !hydrated) {
    content = <TitleScreen onStart={() => { audio.unlock(); audio.playSe('title'); runWithLoading('ゲームを準備中…', () => setTitleShown(true), 800) }} />
  } else if (!isInitialized && !draftState) {
    content = <Onboarding />
  } else if (!isInitialized && draftState && !draftState.isComplete) {
    content = <DraftRoom />
  } else if (!isInitialized && draftState?.isComplete) {
    content = <DraftRoom />
  } else {
    content = (
      <BrowserRouter>
        <AppRoutes resetGame={resetGame} onBackToTitle={() => setTitleShown(false)} />
      </BrowserRouter>
    )
  }

  return (
    <>
      <LoadingOverlay />
      {content}
      {showTwitter && !forceUpdate && <TwitterModal onClose={() => { markTwitterIntroSeen(); setShowTwitter(false) }} />}
      {forceUpdate && <ForceUpdateModal />}
    </>
  )
}
