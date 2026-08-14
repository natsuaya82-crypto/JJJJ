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
import { ovr } from './utils/playerUtils'
import { fmtYen } from './utils/money'
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
import GmInvitePicker from './components/team/GmInvitePicker'
import AppBackground from './components/layout/AppBackground'
import MorePage from './components/more/MorePage'
import HofTeamPage from './components/online/HofTeamPage'
import AnnouncementsPage, { AnnouncementDetailPage } from './components/more/AnnouncementsPage'
import EventsPage from './components/online/EventsPage'
import RatedPage from './components/rated/RatedPage'
import RatedLineupPage from './components/rated/RatedLineupPage'
import RatedResultPage from './components/rated/RatedResultPage'
import RatedStandingsPage from './components/rated/RatedStandingsPage'
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
import { C, alpha, SAIRA, F } from './styles/tokens'
import GlassButton from './components/ui/GlassButton'
import Panel, { panelStyle } from './components/ui/Panel'

const BUNDLE_ID = 'com.tokinets.jpelmanager'
// 強制アップデート判定用の現在バージョン。過去に App.tsx 内の手書き定数の上げ忘れで
// 「最新版なのにアップデートしてくださいが出る」事故があったため、リリース時に必ず上げる
// appMeta の APP_VERSION（例 'v1.1.1'）を唯一の情報源にする。さらに CI（ios-deploy.yml）が
// ネイティブの MARKETING_VERSION と一致することを検証し、ズレたままのリリースを構造的に防ぐ。
const APP_VERSION = APP_VERSION_LABEL.replace(/^v/, '')
// セーブ読み込みがこの時間を過ぎても完了しなかったら、復旧画面へ回す（新規ゲーム画面は絶対に出さない）。
// アップデート直後の初回起動はキャッシュが冷えていて数MBのセーブ読み込みに時間がかかるため、
// 「遅いだけ」を失敗と誤判定しないよう十分に長く取る。
// 【1分待つ】30シーズンぶんのセーブは実機で数秒かかる。20秒でも足りるはずだが、
//   足りなかったときに失うものが大きすぎる（＝データそのもの）。待つのは1回だけなので長く取り、
//   それでも終わらなければ復旧画面へ回す。**時間切れで先へ進めることは絶対にしない。**
const HYDRATE_STALL_MS = 60_000

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
      <div style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '3px', marginBottom: '12px' }}>
        {title.toUpperCase()}
      </div>
      <Panel style={{ padding: '60px 20px', textAlign: 'center', color: C.textGhost, fontSize: F.sub }}>
        Coming soon...
      </Panel>
    </div>
  )
}

// ── ホームの上に出る3つのモーダル（監督オファー・同行の返事・来季予算）────────
//
// **見た目は `ui/NoticeDialog` / `ui/ConfirmDialog` とまったく同じ作り**
// （幕 ＋ `panelStyle`（右下だけ斜めに切る）＋ `GlassButton`）。
//
// ★ここは長いあいだ **`check-ui-tokens` の範囲外**だった（点検は `src/components` しか
//   見ていない）。そのため「角丸を全部やめる」も「ボタンを GlassButton へ寄せる」も
//   このファイルには届かず、**アプリで唯一この3つだけが丸いまま**残っていた。
//   範囲は⑤⑥⑧に広げてある。**自前の幕・自前のカード・自前のボタンを書かないこと。**

/** 幕。3つとも同じで、重なり順だけ違う */
const MODAL_VEIL = (z: number): React.CSSProperties => ({
  position: 'fixed', inset: 0, zIndex: z,
  background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
})
/** カードの面。ダイアログ2つと同じ（角は丸めない・右下だけ斜め） */
const MODAL_CARD: React.CSSProperties = {
  width: '100%', ...panelStyle(C.gold),
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), 0 8px 32px rgba(0,0,0,0.6)',
  padding: '22px 20px 18px', textAlign: 'center',
}
/** カードの中に置く囲み（順位・予算など）。枠も角丸も持たせない */
const MODAL_BOX: React.CSSProperties = {
  background: 'rgba(0,0,0,0.26)', padding: '12px 14px', textAlign: 'left',
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
  const players = useGameStore(s => s.players)
  const myTeamId = useGameStore(s => s.playerTeamId)
  const accept = useGameStore(s => s.acceptGmOffer)
  const decline = useGameStore(s => s.declineGmOffer)
  const [pick, setPick] = useState(0)
  // 一緒に連れて行きたい選手（1人だけ）。**行くかどうかは選手が決める**ので、
  // ここで選べるのは「声をかける相手」まで
  const [invite, setInvite] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const myRoster = players
    .filter(p => p.teamId === myTeamId && p.status === 'active')
    .sort((a, b) => ovr(b) - ovr(a))
  const invited = myRoster.find(p => p.id === invite)
  if (offers.length === 0) return null
  const offer = offers[Math.min(pick, offers.length - 1)]
  const dest = teams.find(t => t.id === offer.teamId)
  if (!dest) return null
  return (
    <>
    <div style={MODAL_VEIL(1001)}>
      <div style={{ ...MODAL_CARD, maxWidth: 360 }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 12 }}>OFFER</div>
        {/* 退任したときは複数届く。並べて見比べてから選ぶ（1件のときは出さない） */}
        {offers.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {offers.map((o, i) => {
              const t = teams.find(x => x.id === o.teamId)
              const on = i === Math.min(pick, offers.length - 1)
              return (
                <GlassButton key={o.teamId} size="sm" color={on ? C.gold : C.textDim}
                  onClick={() => setPick(i)} style={{ flex: 1 }}>{t?.shortName ?? '—'}</GlassButton>
              )
            })}
          </div>
        )}
        <div style={{ fontSize: F.label, color: C.gold, fontWeight: 800, marginBottom: 8 }}>{OFFER_KIND_LABEL[offer.kind ?? 'promotion']}</div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <TeamLogoSVG primary={dest.colors.primary} secondary={dest.colors.secondary} shortName={dest.shortName} teamId={dest.id} logoId={dest.logoId} size={56} />
        </div>
        <div style={{ fontSize: F.title, fontWeight: 900, color: C.text, marginBottom: 6 }}>{dest.name}</div>
        <div style={{ fontSize: F.bodyLg, color: C.textSub, lineHeight: 1.7, marginBottom: 16 }}>
          {OFFER_KIND_TEXT[offer.kind ?? 'promotion']}<br />
          {offer.year}シーズンから指揮を執りますか？
        </div>
        <div style={{ ...MODAL_BOX, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.bodyLg, color: C.textSub, marginBottom: 6 }}>
            <span>前季順位</span><span style={{ fontWeight: 800, color: C.text }}>{offer.prevRank}位</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: F.bodyLg, color: C.textSub }}>
            <span>来季予算</span><span style={{ fontWeight: 800, color: C.text }}>{fmtYen(offer.budget)}</span>
          </div>
        </div>
        <div style={{ fontSize: F.label, color: C.textDim, lineHeight: 1.7, marginBottom: 12 }}>
          受けると選手・予算・施設はすべて{dest.shortName}のものを引き継ぎます。<br />
          今のチームの予算は持って行けません。
        </div>

        {/* 1人だけ声をかけられる。返事をするのは選手（移籍と同じ判断）。
            **相手はロスターと同じ行で別画面から選ぶ**（ここに一覧を畳んで入れないこと） */}
        <div style={{ ...MODAL_BOX, marginBottom: 16 }}>
          <div style={{ fontSize: F.label, color: C.textDim, marginBottom: 8, lineHeight: 1.6 }}>
            1人だけ声をかけられます。<b style={{ color: C.textSub }}>行くかどうかは選手が決めます。</b><br />
            移籍金は{dest.shortName}が払います。
          </div>
          <button onClick={() => setInviteOpen(true)} style={{
            width: '100%', padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 8,
            border: `1px solid ${alpha(invited ? C.gold : C.border3, 0.75)}`,
            background: invited ? alpha(C.gold, 0.12) : 'transparent',
            color: invited ? C.gold : C.textDim, fontSize: F.body, fontWeight: 800, fontFamily: 'inherit',
          }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {invited ? `${invited.name}（OVR${ovr(invited)}）に声をかける` : '声をかける選手を選ぶ'}
            </span>
            <span style={{ flexShrink: 0, opacity: 0.7 }}>›</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <GlassButton size="lg" color={C.textSub} onClick={() => decline()} style={{ flex: 1, fontFamily: SAIRA }}>
            {offers.length > 1 ? 'すべて断る' : '断る'}
          </GlassButton>
          <GlassButton size="lg" color={C.gold} onClick={() => accept(offer.teamId, invite || undefined)} style={{ flex: 1, fontFamily: SAIRA }}>
            受ける
          </GlassButton>
        </div>
      </div>
    </div>
    {inviteOpen && (
      <GmInvitePicker roster={myRoster} dest={dest} invite={invite} onPick={setInvite} onClose={() => setInviteOpen(false)} />
    )}
    </>
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
  return (
    <div onClick={dismiss} style={MODAL_VEIL(1000)}>
      <div onClick={e => e.stopPropagation()} style={{ ...MODAL_CARD, maxWidth: 360 }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 8 }}>SEASON BUDGET</div>
        <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text, marginBottom: 16 }}>{notice.year}シーズンの予算が確定しました</div>
        <div style={{ fontFamily: SAIRA, fontSize: 44, fontWeight: 900, color: notice.budget >= 0 ? C.green : C.red, lineHeight: 1, marginBottom: 20 }}>{fmtYen(notice.budget)}</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <GlassButton size="lg" color={C.gold} onClick={() => { dismiss(); navigate('/') }} style={{ flex: 1, fontFamily: SAIRA }}>OK</GlassButton>
          <GlassButton size="lg" color={C.cyan} onClick={() => { dismiss(); navigate('/budget') }} style={{ flex: 1, fontFamily: SAIRA }}>確認</GlassButton>
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
          {/* イベント → 一覧 → ランクマッチ（docs/ONLINE_RATED_DESIGN.md）。
              一覧を挟むのは、ランクマッチ以外のイベントもやるため */}
          <Route path="/online/events" element={<EventsPage />} />
          <Route path="/online/rated" element={<RatedPage />} />
          <Route path="/online/rated/lineup" element={<RatedLineupPage />} />
          <Route path="/online/rated/result" element={<RatedResultPage />} />
          <Route path="/online/rated/standings" element={<RatedStandingsPage />} />
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
          {/* お知らせ1件。蛇腹をやめて別ページにした（本文が長いので一覧が吹き飛ぶ） */}
          <Route path="/announcements/:key" element={<AnnouncementDetailPage />} />
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
      {/* 背景の写真はここ1枚。タイトルもオンボーディングもドラフトも同じ上に乗る */}
      <AppBackground>{content}</AppBackground>
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
