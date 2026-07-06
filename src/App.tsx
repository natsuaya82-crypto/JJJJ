import { MemoryRouter as BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useGameStore } from './store/gameStore'
import { audio } from './utils/audio'
import { initAds, removeBanner, showBanner } from './utils/ads'
import { initLocalNotifications } from './utils/notifications'
import LoadingOverlay from './components/ui/LoadingOverlay'
import ForceUpdateModal from './components/ui/ForceUpdateModal'
import { runWithLoading } from './store/loadingStore'
import TitleScreen from './components/title/TitleScreen'
import Layout from './components/layout/Layout'
import MorePage from './components/more/MorePage'
import Dashboard from './components/dashboard/Dashboard'
import TeamManagement from './components/team/TeamManagement'
import Onboarding from './components/onboarding/Onboarding'
import DraftRoom from './components/draft/DraftRoom'
import RacePage from './components/race/RacePage'
import TeamsPage from './components/teams/TeamsPage'
import ScoutPage from './components/scout/ScoutPage'
import TransferPage from './components/transfer/TransferPage'
import TransferHub from './components/transfer/TransferHub'
import AcquisitionPage from './components/acquire/AcquisitionPage'
import TeamHub from './components/team/TeamHub'
import TeamsHub from './components/teams/TeamsHub'
import TeamDetailPage from './components/teams/TeamDetailPage'
import ForeignLeaguesPage from './components/teams/ForeignLeaguesPage'
import ForeignLeagueDetailPage from './components/teams/ForeignLeagueDetailPage'
import ForeignClubDetailPage from './components/teams/ForeignClubDetailPage'
import ContractRenewalPage from './components/team/ContractRenewalPage'
import ContractPage from './components/team/ContractPage'
import ChatPage from './components/team/ChatPage'
import RecordsHub from './components/records/RecordsHub'
import RecordsPage from './components/records/RecordsPage'
import PlayersStatsPage from './components/records/PlayersStatsPage'
import HistoryPage from './components/records/HistoryPage'
import AchievementsPage from './components/records/AchievementsPage'
import ReserveLeaguePage from './components/reserve/ReserveLeaguePage'
import PlayerSheet from './components/shared/PlayerSheet'
import NotificationsPage from './components/notifications/NotificationsPage'
import HelpPage from './components/help/HelpPage'
import SchedulePage from './components/schedule/SchedulePage'
import RosterSelectPage from './components/roster/RosterSelectPage'
import ShopPage from './components/shop/ShopPage'
import SponsorPage from './components/sponsors/SponsorPage'
import StarredPlayersPage from './components/transfer/StarredPlayersPage'
import NegotiationPage from './components/transfer/NegotiationPage'
import OfferListPage from './components/transfer/OfferListPage'
import RentalPage from './components/transfer/RentalPage'
import PlayerProfilePage from './components/player/PlayerProfilePage'
import FacilitiesPage from './components/facilities/FacilitiesPage'
import IndividualEventsPage from './components/events/IndividualEventsPage'
import WorldEkidenPage from './components/international/WorldEkidenPage'
import WECSimPage from './components/international/WECSimPage'
import ObjectivesPage from './components/objectives/ObjectivesPage'
import CardTrainingPage from './components/training/CardTrainingPage'
import CardInventoryPage from './components/training/CardInventoryPage'
import BudgetPage from './components/budget/BudgetPage'
import LoginBonusPage from './components/login/LoginBonusPage'
import NewsPage from './components/news/NewsPage'
import JewelsPage from './components/jewels/JewelsPage'
import PrivacyPolicyPage from './components/more/PrivacyPolicyPage'

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
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/team" element={<TeamHub />} />
          <Route path="/team/renewals" element={<ContractRenewalPage />} />
          <Route path="/team/contracts" element={<ContractPage />} />
          <Route path="/team/chat" element={<ChatPage />} />
          <Route path="/team/facilities" element={<FacilitiesPage />} />
          <Route path="/team/:section" element={<TeamManagement />} />
          <Route path="/race" element={<RacePage />} />
          <Route path="/acquire" element={<AcquisitionPage />} />
          <Route path="/scout" element={<ScoutPage />} />

          <Route path="/teams" element={<TeamsHub />} />
          <Route path="/teams/detail/:teamId" element={<TeamDetailPage />} />
          <Route path="/teams/foreign" element={<ForeignLeaguesPage />} />
          <Route path="/teams/foreign/:leagueId" element={<ForeignLeagueDetailPage />} />
          <Route path="/teams/foreign/:leagueId/:clubId" element={<ForeignClubDetailPage />} />
          <Route path="/teams/list" element={<TeamsPage />} />
          <Route path="/teams/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/transfer" element={<TransferHub />} />
          <Route path="/transfer/starred" element={<StarredPlayersPage />} />
          <Route path="/transfer/offers" element={<OfferListPage />} />
          <Route path="/transfer/rental" element={<RentalPage />} />
          <Route path="/transfer/negotiate/:mode/:id" element={<NegotiationPage />} />
          <Route path="/transfer/:section" element={<TransferPage />} />
          <Route path="/player/:playerId" element={<PlayerProfilePage />} />
          <Route path="/events" element={<IndividualEventsPage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/jewels" element={<JewelsPage />} />
          <Route path="/international" element={<WorldEkidenPage />} />
          <Route path="/records" element={<RecordsHub />} />
          <Route path="/records/season" element={<RecordsPage />} />
          <Route path="/records/players" element={<PlayersStatsPage />} />
          <Route path="/records/history" element={<HistoryPage />} />
          <Route path="/records/achievements" element={<AchievementsPage />} />
          <Route path="/records/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/roster-select" element={<RosterSelectPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/sponsors" element={<SponsorPage />} />
          <Route path="/reserve" element={<ReserveLeaguePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/cards" element={<CardTrainingPage />} />
          <Route path="/cards/list" element={<CardInventoryPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/login-bonus" element={<LoginBonusPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/more" element={<MorePage onBackToTitle={onBackToTitle} />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
        </Routes>
      </Layout>
    </>
  )
}

const BUNDLE_ID = 'com.tokinets.jpelmanager'
const APP_VERSION = '1.0.4'

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
  const [titleShown, setTitleShown] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)

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
  if (!titleShown) {
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
      {forceUpdate && <ForceUpdateModal />}
    </>
  )
}
