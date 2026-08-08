import { MemoryRouter as BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useGameStore } from './store/gameStore'
import { flushSaveNow, sawSavedGame } from './store/saveStorage'
import { getSaveHealth, onSaveHealthChange, setSaveHealth } from './store/saveHealth'
import { clearDataUpdateNeeded, isDataUpdateNeeded } from './store/dataUpdate'
import DataUpdateScreen from './components/ui/DataUpdateScreen'
import SaveRecoveryScreen from './components/ui/SaveRecoveryScreen'
import { audio } from './utils/audio'
import { initAds, removeBanner, showBanner, setAdsDisabled } from './utils/ads'
import { initLocalNotifications } from './utils/notifications'
import { hasAdFree } from './utils/iap'
import { clearMarketFilters } from './utils/marketFilters'
import LoadingOverlay from './components/ui/LoadingOverlay'
import { TeamLogoSVG } from './components/icons/Icons'
import ForceUpdateModal from './components/ui/ForceUpdateModal'
import TwitterModal from './components/ui/TwitterModal'
import { useLoadingStore } from './store/loadingStore'
import { useFriendSync } from './lib/useFriendSync'
import { onlineAvailable } from './data/featureFlags'
import TitleScreen from './components/title/TitleScreen'
import TermsGate from './components/title/TermsGate'
import { hasAgreedTerms, agreeTerms } from './utils/termsConsent'
import Layout from './components/layout/Layout'
import MorePage from './components/more/MorePage'
import HofTeamPage from './components/online/HofTeamPage'
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
import StandingsPage from './components/teams/StandingsPage'
import TeamDetailPage from './components/teams/TeamDetailPage'
import ForeignLeagueDetailPage from './components/teams/ForeignLeagueDetailPage'
import NationalTeamDetailPage from './components/teams/NationalTeamDetailPage'
import NationalSquadSelectPage from './components/international/NationalSquadSelectPage'
import NationalResultPage from './components/international/NationalResultPage'
import WorldTournamentPage from './components/international/WorldTournamentPage'
import ChatPage from './components/team/ChatPage'
import NoSalePage from './components/team/NoSalePage'
import FriendsPage from './components/friends/FriendsPage'
import FriendListPage from './components/friends/FriendListPage'
import FriendDetailPage from './components/friends/FriendDetailPage'
import FriendRequestsPage from './components/friends/FriendRequestsPage'
import FriendClubPage from './components/friends/FriendClubPage'
import OnlinePage from './components/online/OnlinePage'
import MatchEntryPage from './components/online/MatchEntryPage'
import RoomLobbyPage from './components/online/RoomLobbyPage'
import MatchHistoryPage from './components/online/MatchHistoryPage'
import MatchReplayPage from './components/online/MatchReplayPage'
import RecordsHub from './components/records/RecordsHub'
import FranchiseRecordsPage, { IndividualRecordsPage, GmCareerPage } from './components/records/RecordsPage'
import PlayersStatsPage from './components/records/PlayersStatsPage'
import DraftHistoryPage from './components/records/DraftHistoryPage'
import ChampionsHistoryPage from './components/records/ChampionsHistoryPage'
import EclPage from './components/ecl/EclPage'
import PlayerSheet from './components/shared/PlayerSheet'
import ContractInfoModal from './components/shared/ContractInfoModal'
import NotificationsPage from './components/notifications/NotificationsPage'
import HelpPage from './components/help/HelpPage'
import SchedulePage from './components/schedule/SchedulePage'
import ShopPage from './components/shop/ShopPage'
import SponsorPage from './components/sponsors/SponsorPage'
import StarredPlayersPage from './components/transfer/StarredPlayersPage'
import RentalPage from './components/transfer/RentalPage'
import FacilitiesPage from './components/facilities/FacilitiesPage'
import ObjectivesPage from './components/objectives/ObjectivesPage'
import CardTrainingPage from './components/training/CardTrainingPage'
import CreateMyPlayerPage from './components/player/CreateMyPlayerPage'
import CardInventoryPage from './components/training/CardInventoryPage'
import CardConvertPage from './components/training/CardConvertPage'
import CardSelectPage from './components/training/CardSelectPage'
import BudgetPage from './components/budget/BudgetPage'
import LoginBonusPage from './components/login/LoginBonusPage'
import NewsPage from './components/news/NewsPage'
import JewelsPage from './components/jewels/JewelsPage'
import { APP_VERSION as APP_VERSION_LABEL } from './data/appMeta'
import { SAIRA } from './styles/tokens'

const BUNDLE_ID = 'com.tokinets.jpelmanager'
// 強制アップデート判定用の現在バージョン。過去に App.tsx 内の手書き定数の上げ忘れで
// 「最新版なのにアップデートしてくださいが出る」事故があったため、リリース時に必ず上げる
// appMeta の APP_VERSION（例 'v1.1.1'）を唯一の情報源にする。さらに CI（ios-deploy.yml）が
// ネイティブの MARKETING_VERSION と一致することを検証し、ズレたままのリリースを構造的に防ぐ。
const APP_VERSION = APP_VERSION_LABEL.replace(/^v/, '')
// セーブ読み込みがこの時間を過ぎても完了しなかったら、復旧画面へ回す（新規ゲーム画面は絶対に出さない）。
// アップデート直後の初回起動はキャッシュが冷えていて数MBのセーブ読み込みに時間がかかるため、
// 「遅いだけ」を失敗と誤判定しないよう十分に長く取る。
const HYDRATE_STALL_MS = 20_000

// 桁数が違っても壊れない比較（'1.10' vs '1.1.1' など。欠け桁は0扱い）。
// 解釈できない文字列は「差なし」を返す＝モーダルは出さない（誤ブロックより出さない方に倒す）
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10))
  const pb = b.split('.').map(n => parseInt(n, 10))
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (Number.isNaN(x) || Number.isNaN(y)) return 0
    if (x !== y) return x - y
  }
  return 0
}

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

// オファーの種類ごとの見出しと本文（判定は utils/gmOffer.ts）
const OFFER_KIND_LABEL: Record<string, string> = {
  promotion: '格上からの招聘',
  rebuild: '名門再建の要請',
  comeback: '再起の誘い',
}
const OFFER_KIND_TEXT: Record<string, string> = {
  promotion: '上位クラブから監督就任のオファーが届きました。',
  rebuild: 'かつての強豪から、チーム再建を託したいと打診が届きました。',
  comeback: '一から立て直してほしい、とオファーが届きました。',
}

// 他チームからの監督オファーをホームで出す。答えるまで消えない。
// 受けると指揮するチームが入れ替わる（store の acceptGmOffer / utils/gmOffer.ts）。
function GmOfferNotice() {
  const offers = useGameStore(s => s.gmOffers) ?? []
  const teams = useGameStore(s => s.teams)
  const accept = useGameStore(s => s.acceptGmOffer)
  const decline = useGameStore(s => s.declineGmOffer)
  const [pick, setPick] = useState(0)
  if (offers.length === 0) return null
  const offer = offers[Math.min(pick, offers.length - 1)]
  const dest = teams.find(t => t.id === offer.teamId)
  if (!dest) return null
  const fmtYen = (yen: number) => `${Math.round(yen / 10000).toLocaleString()}万`
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1001, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: 'min(360px, 90vw)', background: '#1a2c47', borderRadius: 18, border: '2px solid #f5c842', padding: '24px 20px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 11, color: '#f5c842', letterSpacing: '3px', fontWeight: 900, marginBottom: 12 }}>OFFER</div>
        {/* 退任したときは複数届く。タブで見比べてから選ぶ（1件のときは出さない） */}
        {offers.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {offers.map((o, i) => {
              const t = teams.find(x => x.id === o.teamId)
              const on = i === Math.min(pick, offers.length - 1)
              return (
                <button key={o.teamId} onClick={() => setPick(i)} style={{
                  flex: 1, padding: '7px 4px', borderRadius: 9, cursor: 'pointer',
                  border: `1px solid ${on ? '#f5c842' : '#3c4d68'}`,
                  background: on ? 'rgba(245,200,66,0.16)' : 'transparent',
                  color: on ? '#f5c842' : '#8fa0bb', fontSize: 11, fontWeight: 800, fontFamily: 'inherit',
                }}>{t?.shortName ?? '—'}</button>
              )
            })}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#f5c842', fontWeight: 800, marginBottom: 8 }}>{OFFER_KIND_LABEL[offer.kind ?? 'promotion']}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <TeamLogoSVG primary={dest.colors.primary} secondary={dest.colors.secondary} shortName={dest.shortName} teamId={dest.id} logoId={dest.logoId} size={56} />
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, color: '#fff', marginBottom: 6 }}>{dest.name}</div>
        <div style={{ fontSize: 13, color: '#cfd8e8', lineHeight: 1.7, marginBottom: 16 }}>
          {OFFER_KIND_TEXT[offer.kind ?? 'promotion']}<br />
          {offer.year}シーズンから指揮を執りますか？
        </div>
        <div style={{ background: '#122034', borderRadius: 12, padding: '12px 14px', marginBottom: 18, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cfd8e8', marginBottom: 6 }}>
            <span>前季順位</span><span style={{ fontWeight: 800, color: '#fff' }}>{offer.prevRank}位</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#cfd8e8' }}>
            <span>来季予算</span><span style={{ fontWeight: 800, color: '#fff' }}>{fmtYen(offer.budget)}</span>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#8fa0bb', lineHeight: 1.7, marginBottom: 16 }}>
          受けると選手・予算・施設はすべて{dest.shortName}のものを引き継ぎます。<br />
          今のチームの選手や予算は持って行けません。
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => decline()} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid #6b7a94', background: 'transparent', color: '#cfd8e8', fontSize: 15, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>{offers.length > 1 ? 'すべて断る' : '断る'}</button>
          <button onClick={() => accept(offer.teamId)} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: '#f5c842', color: '#1a0d00', fontSize: 15, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>受ける</button>
        </div>
      </div>
    </div>
  )
}

// シーズン終了で確定した来期予算をホームで一度だけポップ表示する。
function SeasonBudgetNotice() {
  const notice = useGameStore(s => s.seasonBudgetNotice)
  const dismiss = useGameStore(s => s.dismissBudgetNotice)
  // 監督オファーに答えると予算が移籍先のものに入れ替わる。答えるまでは出さない
  const offers = useGameStore(s => s.gmOffers) ?? []
  const navigate = useNavigate()
  if (offers.length > 0) return null
  if (!notice) return null
  // 予算ページと同じ万円単位表記（億に切り上げない）
  const fmtYen = (yen: number) => `${Math.round(yen / 10000).toLocaleString()}万`
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

function AppRoutes({ onBackToTitle }: { resetGame: () => void; onBackToTitle: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const prevPath = useRef(location.pathname)

  // タイトル／ドラフトからゲーム画面に入ったときは、前回いた画面に関わらず必ずホーム(/)から始める
  useEffect(() => { navigate('/', { replace: true }) }, [])

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

  return (
    <>
      <ContractInfoModal />
      <GmOfferNotice />
      <SeasonBudgetNotice />
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/team" element={<TeamHub />} />
          <Route path="/team/chat" element={<ChatPage />} />
          <Route path="/team/facilities" element={<FacilitiesPage />} />
          <Route path="/team/nosale" element={<NoSalePage />} />
          <Route path="/team/:section" element={<TeamManagement />} />
          <Route path="/race" element={<RacePage />} />
          <Route path="/scout" element={<ScoutPage />} />

          <Route path="/teams" element={<TeamsHub />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/standings/:league" element={<StandingsPage />} />
          <Route path="/teams/detail/:teamId" element={<TeamDetailPage />} />
          <Route path="/teams/foreign/:leagueId" element={<ForeignLeagueDetailPage />} />
          <Route path="/teams/foreign/:leagueId/:clubId" element={<TeamDetailPage />} />
          <Route path="/teams/national/:code" element={<NationalTeamDetailPage />} />
          <Route path="/national/select" element={<NationalSquadSelectPage />} />
          <Route path="/national/result" element={<NationalResultPage />} />
          <Route path="/national/tournament" element={<WorldTournamentPage />} />
          <Route path="/teams/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/transfer" element={<TransferHub />} />
          <Route path="/transfer/starred" element={<StarredPlayersPage />} />
          {/* オファー一覧は廃止。受けたオファーも出したオファーもチャットで対応する */}
          <Route path="/transfer/offers" element={<Navigate to="/team/chat" replace />} />
          <Route path="/transfer/rental" element={<RentalPage />} />
          <Route path="/transfer/:section" element={<TransferPage />} />
          <Route path="/objectives" element={<ObjectivesPage />} />
          <Route path="/jewels" element={<JewelsPage />} />
          {/* 下タブ「オンライン」。フレンド・走友会もこの下にぶら下がる（パスは互換のため /friends のまま）
              入口の /online だけは常に出す（中身は ONLINE_ENABLED が false の間すべてグレーアウト）。
              その先の画面は false のあいだ出さないので、直接URLでも入れない（コードは残す） */}
          <Route path="/online" element={<OnlinePage />} />
          {onlineAvailable() && <Route path="/online/match" element={<MatchEntryPage />} />}
          {onlineAvailable() && <Route path="/online/room/:roomId" element={<RoomLobbyPage />} />}
          {onlineAvailable() && <Route path="/online/history" element={<MatchHistoryPage />} />}
          {/* 殿堂入りチームはオフラインでも使う（登録・固定は端末内で完結する） */}
          <Route path="/online/hof" element={<HofTeamPage />} />
          {onlineAvailable() && <Route path="/online/history/:matchId" element={<MatchReplayPage />} />}
          {onlineAvailable() && <Route path="/friends" element={<FriendsPage />} />}
          {onlineAvailable() && <Route path="/friends/list" element={<FriendListPage />} />}
          {/* 申請と承認は1画面にまとめてある。旧パスは念のため同じ画面へ通す */}
          {onlineAvailable() && <Route path="/friends/requests" element={<FriendRequestsPage />} />}
          {onlineAvailable() && <Route path="/friends/received" element={<FriendRequestsPage />} />}
          {onlineAvailable() && <Route path="/friends/sent" element={<FriendRequestsPage />} />}
          {onlineAvailable() && <Route path="/friends/club" element={<FriendClubPage />} />}
          {onlineAvailable() && <Route path="/friends/team/:id" element={<FriendDetailPage />} />}
          <Route path="/records" element={<RecordsHub />} />
          <Route path="/records/franchise" element={<FranchiseRecordsPage />} />
          <Route path="/records/individual" element={<IndividualRecordsPage />} />
          <Route path="/records/gm" element={<GmCareerPage />} />
          <Route path="/records/season" element={<FranchiseRecordsPage />} />
          <Route path="/records/players" element={<PlayersStatsPage />} />
          <Route path="/records/draft" element={<DraftHistoryPage />} />
          <Route path="/records/draft/:year" element={<DraftHistoryPage />} />
          <Route path="/records/champions" element={<ChampionsHistoryPage />} />
          <Route path="/records/:section" element={<Placeholder title="coming soon" />} />
          <Route path="/ecl" element={<EclPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/sponsors" element={<SponsorPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/cards" element={<CardTrainingPage />} />
          <Route path="/create-player" element={<CreateMyPlayerPage />} />
          <Route path="/cards/list" element={<CardInventoryPage />} />
          <Route path="/cards/convert" element={<CardConvertPage />} />
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

// 起動時のロード表示の最低時間。
// 読み込みそのものが終わるまでは必ず待つ（時間で先へ進めることはしない）うえで、
// 揃ったかを見る余裕を持たせるためにここまでは出しておく。
// 昔ここに「5秒で必ず先へ進める」保険があり、アップデート後にセーブが消える最大の原因だった。
const LOAD_MIN_MS = 1800

export default function App() {
  const { isInitialized, draftState, resetGame } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const grantUpdateGifts = useGameStore(s => s.grantUpdateGifts)
  const ensureIndividualEvents = useGameStore(s => s.ensureIndividualEvents)
  const ensureEclSeries = useGameStore(s => s.ensureEclSeries)
  const twitterIntroSeen = useGameStore(s => s.twitterIntroSeen ?? false)
  const markTwitterIntroSeen = useGameStore(s => s.markTwitterIntroSeen)
  // 初回起動時に匿名アカウント（＝フレンドコード）を用意し、
  // チームがあれば自チーム情報とロスターもサーバーへ送る（起動時＋シーズン更新時。失敗しても無視）。
  // Layout ではなくここに置く。Layout はゲーム開始後しかマウントされず、タイトル画面では走らないため。
  useFriendSync()
  const [titleShown, setTitleShown] = useState(false)
  // 初回起動（と規約を改訂したあとの初回）だけ、タイトルをタップしたときに同意の枠を出す。
  // 同意の記録はセーブデータとは別の localStorage なので、データリセットしても消えない。
  const [termsOk, setTermsOk] = useState(hasAgreedTerms)
  const [showTerms, setShowTerms] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const [showTwitter, setShowTwitter] = useState(false)
  // セーブ読み込み（非同期）完了までタイトルから先へ進めない。
  // 完了前に isInitialized=false の初期状態を見て新規ゲーム画面を出すと、既存セーブを上書きする事故になるため
  const [hydrated, setHydrated] = useState(() => useGameStore.persist.hasHydrated())
  // 読み込みの成否。'failed' のときは絶対に新規ゲーム画面へ進めず、復旧画面を出す。
  const [saveHealth, setSaveHealthState] = useState(getSaveHealth)
  useEffect(() => onSaveHealthChange(setSaveHealthState), [])
  // アップデート後の初回起動だけ「データ更新中」を出す（古いセーブを読み込んだときに migrate が合図を立てる）。
  // 出すのはタイトルを抜けたあと。先に出すとタイトル→更新中→またタイトル、と行ったり来たりして見える。
  // 合図が立つのは読み込みが終わってからなので、判定は下の handleTitleStart の finish で行う
  const [dataUpdating, setDataUpdating] = useState(false)
  const finishDataUpdate = useCallback(() => { clearDataUpdateNeeded(); setDataUpdating(false) }, [])
  useEffect(() => {
    if (hydrated) return
    // 購読前に読み込みが完了しているケース（実機のファイル読込は速い）。
    // ここで再確認しないと完了通知を永遠に待ち続けてタイトルから進めなくなる
    if (useGameStore.persist.hasHydrated()) { setHydrated(true); return }
    const unsub = useGameStore.persist.onFinishHydration(() => setHydrated(true))
    // 【重要】かつてここには「5秒で必ず先へ進める」保険があったが、これが
    //   アップデート後にセーブが消える最大の原因だった。読み込みの成否を見ずにゲートを開けるため、
    //   読み込みが失敗／遅延しているだけの状態で初期状態（isInitialized=false）が見え、
    //   新規ゲーム画面が出る → ユーザーが新チームを作る → 本物のセーブが上書きされて復元不能、
    //   という流れになっていた。
    //   そこで時間による強制進行はやめ、読み込みが終わらないまま長時間経った場合は
    //   新規ゲーム画面ではなく復旧画面（＝書き込み停止・再試行できる）へ回す。
    const stall = setTimeout(() => {
      if (useGameStore.persist.hasHydrated()) return
      console.error('[save] hydration did not finish in time')
      setSaveHealth('failed', 'セーブの読み込みが完了しませんでした（タイムアウト）')
    }, HYDRATE_STALL_MS)
    return () => { unsub(); clearTimeout(stall) }
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
    // App Store に新しいバージョンが出ていたら強制アップデート案内を表示。
    // ストア側のバージョンが「厳密に」新しいときだけ出す（TestFlightで先行中は出ない）。
    // 配信直後はストアの反映ラグで「アップデート」を押しても旧版しか落とせない場合があり、
    // 閉じられないモーダルで詰むため、ストア公開から1日経ってから出す。
    fetch(`https://itunes.apple.com/jp/lookup?bundleId=${BUNDLE_ID}&_=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        const info = data.results?.[0]
        const storeVersion: string | undefined = info?.version
        if (!storeVersion || compareVersions(storeVersion, APP_VERSION) <= 0) return
        const released = Date.parse(info?.currentVersionReleaseDate ?? '')
        if (!Number.isFinite(released) || Date.now() - released < 24 * 60 * 60 * 1000) return
        setForceUpdate(true)
      })
      .catch(() => {})
  }, [])

  // 広告の初期化はセーブ読み込み(hydration)が終わってから行う。
  // マウント直後の adsRemoved はまだ初期値 false なので、ここで初期化すると
  // GMパス購入者にも initAds(false) が走る。しかも initAds は ATT ダイアログを挟む
  // 非同期処理のため、後追いの removeBanner() が「まだ出ていないバナー」に空振りし、
  // その後 showBanner() が走って課金者に広告が出たまま残る。
  useEffect(() => {
    if (!hydrated) return
    const paid = useGameStore.getState().adsRemoved ?? false
    setAdsDisabled(paid)
    initAds(paid)
  }, [hydrated])
  // GMパスの買い忘れ救済：端末に残っている購入の権利を起動時に黙って確認する。
  // 購入シートもパスワード入力も出ない。これがないと、
  //   ・家族の承認待ちで購入した人（承認が下りても自分で「復元」を押すまで無効のまま）
  //   ・購入の途中で通信が切れた人（課金だけ成立して権利が反映されない）
  // が取り残されてしまう。すでに有効なら何もしない。
  useEffect(() => {
    if (!hydrated) return
    if (useGameStore.getState().adsRemoved) return
    void hasAdFree().then(owned => {
      if (owned && !useGameStore.getState().adsRemoved) useGameStore.getState().setAdsRemoved(true)
    })
  }, [hydrated])
  // アップデート記念プレゼントを配布（冪等。ゲーム開始済みのときだけ）
  useEffect(() => { if (isInitialized) grantUpdateGifts() }, [isInitialized])
  // 既存セーブ移行：現シーズンに新しい記録会7回を注入（冪等。リセット不要で反映）
  useEffect(() => { if (isInitialized) ensureIndividualEvents() }, [isInitialized])
  // 既存セーブ救済：リーグ再編年にECLが生成されずスキップされたセーブへ後から補充（冪等）
  useEffect(() => { if (isInitialized) ensureEclSeries() }, [isInitialized])
  // 公式Xフォロー案内を初回起動時に一度だけ表示（タイトルを抜けてホームに入ったタイミング）
  useEffect(() => { if (titleShown && isInitialized && !twitterIntroSeen) setShowTwitter(true) }, [titleShown, isInitialized, twitterIntroSeen])
  // 端末ローカル通知（毎日10時・18時の再訪リマインド）。native のみ、初回に許可を取得。
  useEffect(() => { initLocalNotifications() }, [])
  // 買い切りの購入/復元でフラグが変わったらバナー表示を切り替える（初回マウントは initAds が担当）
  const adsRemovedInit = useRef(adsRemoved)
  useEffect(() => {
    if (adsRemoved === adsRemovedInit.current) return
    adsRemovedInit.current = adsRemoved
    setAdsDisabled(adsRemoved)
    if (adsRemoved) removeBanner()
    else showBanner()
  }, [adsRemoved])

  // タイトルをタップしたら、セーブ読み込み(hydration)が終わるまでロード表示を出しっぱなしにする。
  // 固定時間で消すと、重いセーブでは読み込み前にタイトルへ戻ってしまう（タップ→ロード→またタイトル）。
  const handleTitleStart = () => {
    audio.unlock(); audio.playSe('title')
    // まだ規約に同意していなければ、タイトルの上に同意の枠を出して、ここで一旦止める。
    // 同意したら beginGame() を呼んで、いつも通りの読み込みへ進む。
    if (!termsOk) { setShowTerms(true); return }
    beginGame()
  }

  const beginGame = () => {
    const { show, hide } = useLoadingStore.getState()
    show('ゲームを準備中…')
    const start = Date.now()
    setTitleShown(true)
    const finish = () => {
      // アップデート後の初回だけは、続けて「データ更新中」を出す。
      // 進み具合は向こうの画面で見せるので、ロード表示はすぐ消す
      if (isDataUpdateNeeded()) { hide(); setDataUpdating(true); return }
      // 【読み込みは急がない】
      //   読み込みが終わってから、中身が揃っているかを見てロード表示を閉じる。
      //   ここを急いで閉じると、まだ揃っていない画面が一瞬でも操作できてしまい、
      //   そのまま保存が走って本物のセーブを上書きする。数秒待つほうが安い。
      const st = useGameStore.getState()
      if (st.isInitialized && (st.players?.length ?? 0) === 0) {
        // セーブは読めたのに中身が空。ここで遊ばせない（保存層のガードも書き込みを止める）
        setSaveHealth('failed', 'セーブは読み込めましたが、選手のデータが入っていませんでした')
        hide()
        return
      }
      setTimeout(hide, Math.max(0, LOAD_MIN_MS - (Date.now() - start)))
    }
    if (useGameStore.persist.hasHydrated()) finish()
    else {
      const unsub = useGameStore.persist.onFinishHydration(() => { unsub(); unsubHealth(); finish() })
      // 読み込みが失敗した場合は完了通知が来ないので、ここでもロード表示を必ず閉じる
      // （閉じないとロード画面のまま操作不能になり、復旧画面が見えない）
      const unsubHealth = onSaveHealthChange(s => {
        if (s !== 'failed') return
        unsub(); unsubHealth(); hide()
      })
    }
  }

  let content
  if (saveHealth === 'failed') {
    // 読み込みが失敗した起動。ここで新規ゲーム画面を出すと本物のセーブが上書きされるため、
    // 必ず復旧画面（書き込み停止中・再試行できる）だけを見せる。
    content = <SaveRecoveryScreen />
  } else if (!titleShown || !hydrated) {
    content = <TitleScreen onStart={handleTitleStart} />
  } else if (dataUpdating) {
    // アップデート後の初回起動。数え直しを先に済ませ、新しい形でセーブを書き直す。
    // 終わるまで先へ進めない（途中で閉じても冪等なので壊れない）
    content = <DataUpdateScreen onDone={finishDataUpdate} />
  } else if (!isInitialized && !draftState && sawSavedGame()) {
    // 【最後の砦】セーブは読めたのに、開始前の状態で起動した。
    //   読み込み自体は成功しているので saveHealth は 'ok' のままで、このままだと
    //   新規ゲーム画面が出る。そこで新チームを作られると、破壊ガードから見れば
    //   「isInitialized:true を書いているだけ」なので素通りし、本物のセーブが物理的に消える。
    //   ここでは絶対に新規作成させず、復旧画面（書き込み停止中・再試行できる）だけを見せる。
    content = <SaveRecoveryScreen reason="セーブは見つかりましたが、中身を読み出せませんでした" />
  } else if (!isInitialized && !draftState) {
    content = <Onboarding />
  } else if (draftState && !draftState.isComplete) {
    // 進行中のドラフトは isInitialized を見ずに draftState だけで判定する。
    // 2年目以降のドラフトでも isInitialized=true のままセーブを効かせるため（途中で落ちても巻き戻らない）。
    content = <DraftRoom />
  } else if (draftState?.isComplete && !draftState.contractsDone) {
    // 指名は終わったが契約画面（DraftComplete）がまだ。2年目以降も必ず通す。
    // contractsDone は advanceDraft() で立つ。
    content = <DraftRoom />
  } else {
    content = <AppRoutes resetGame={resetGame} onBackToTitle={() => setTitleShown(false)} />
  }

  return (
    <BrowserRouter>
      <LoadingOverlay />
      {content}
      {/* 選手詳細シートは最上位に常時マウント（ドラフト画面など Layout 外でも openPlayerSheet で開ける） */}
      <PlayerSheet />
      {/* 利用規約の同意。タイトルをタップしたときだけ、その上に四角い枠で出す。 */}
      {showTerms && (
        <TermsGate onAgree={() => {
          agreeTerms(); setTermsOk(true); setShowTerms(false); beginGame()
        }} />
      )}
      {showTwitter && !forceUpdate && <TwitterModal onClose={() => { markTwitterIntroSeen(); setShowTwitter(false) }} />}
      {forceUpdate && <ForceUpdateModal />}
    </BrowserRouter>
  )
}
