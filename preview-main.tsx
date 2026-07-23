// 開発プレビュー専用エントリ（コミットしない）。モックデータで各画面を直接レンダリングする
// URLハッシュで画面切替: #select=選考 / #tournament=大会 / #result=最終結果
// ★実機と同じ条件で確認するため、必ず Layout（タブバー）＋広告バナー実寸ダミー込みでレンダリングする。
//   固定ボタンがタブバー・広告に隠れる系のバグ（build 53の進行不能）をプレビュー段階で検出するため
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { useGameStore } from './src/store/gameStore'
import Layout from './src/components/layout/Layout'
import NationalSquadSelectPage from './src/components/international/NationalSquadSelectPage'
import WorldTournamentPage from './src/components/international/WorldTournamentPage'
import NationalResultPage from './src/components/international/NationalResultPage'
import RecordsPage from './src/components/records/RecordsPage'
import ChampionsHistoryPage from './src/components/records/ChampionsHistoryPage'
import CreateMyPlayerPage from './src/components/player/CreateMyPlayerPage'
import PlayerSheet from './src/components/shared/PlayerSheet'
import PlayerRow from './src/components/player/PlayerRow'
import { NATIONALITY_META } from './src/data/nationalities'
import './src/index.css'

// PlayerRow の新レイアウト確認用（#roster）
function RosterPreview() {
  const players = useGameStore(s => s.players) as never as { id: string; nationality: string }[]
  const ids = ['JPN_0', 'JPN_1', 'JPN_2', 'JPN_3', 'JPN_4', 'JPN_5']
  return (
    <div style={{ padding: 12 }}>
      <div style={{ color: '#F0EDE8', fontWeight: 900, fontSize: 16, margin: '6px 0 10px' }}>PlayerRow プレビュー</div>
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #26243A' }}>
        {ids.map(id => {
          const p = players.find(x => x.id === id)
          return p ? <PlayerRow key={id} player={p as never} handlers={{ onClick: () => {} }} /> : null
        })}
      </div>
    </div>
  )
}

const AD_H = 50 // Layout.tsx の AD_H と同じ値（広告バナーの実寸）

const SPECS = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
const FAM = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '石井', '中島', '前田', '藤田']
const GIV = ['大翔', '蓮', '悠真', '湊', '陽翔', '樹', '朝陽', '悠人', '陸', '駿']
const LFAM = ['Kip', 'Che', 'Bek', 'Tad', 'Mos', 'Kor', 'Ger', 'San', 'Mar', 'Lop', 'Nda', 'Wan', 'Oba', 'Tes', 'Ale', 'Bra', 'Cas', 'Dia', 'Eri', 'Fon', 'Gom', 'Hay', 'Iba', 'Jim', 'Kal', 'Lem', 'Mun', 'Nur', 'Osei', 'Par']
const LGIV = ['ruto', 'ronoh', 'ele', 'ese', 'hiwot', 'ir', 'ard', 'tos', 'quez', 'ez', 'iri', 'gi', 'nna', 'faye', 'mu', 'ga', 'tro', 'llo', 'kson', 'seca']
const rnd = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1))

const YEAR = 2044
// EURも意図的に含める（エンジン側の除外が効いているかの確認用）
const NATS = Object.keys(NATIONALITY_META)

function mkPlayer(nat: string, i: number) {
  const jp = nat === 'JPN'
  const meta = NATIONALITY_META[nat as keyof typeof NATIONALITY_META]
  const base = jp ? 0 : meta.strength === 'AFRICA' ? 8 : meta.geo === 'アジア' || meta.geo === 'オセアニア' ? 80 : 35
  const name = jp
    ? `${FAM[rnd(0, FAM.length - 1)]}${GIV[rnd(0, GIV.length - 1)]}`
    : `${LFAM[rnd(0, LFAM.length - 1)]}${LGIV[rnd(0, LGIV.length - 1)]}・${LFAM[rnd(0, LFAM.length - 1)]}${LGIV[rnd(0, LGIV.length - 1)]}`
  // 得意種目を1つ決めてその種目だけ速くする（実際の持ちタイム分布に近づける）
  const prim = ['d5000', 'd10000', 'marathon'][rnd(0, 2)]
  const off = (ev: string) => ev === prim ? rnd(base, base + 40) : rnd(base + 40, base + 160)
  return {
    id: `${nat}_${i}`,
    name,
    age: rnd(19, 33),
    nationality: nat,
    status: 'active',
    teamId: jp ? ['t_tokyo', 't_hakata', 't_shizu', 't_aomori', ''][rnd(0, 4)] : '',
    rosterTier: 'main',
    specialty: SPECS[rnd(0, SPECS.length - 1)],
    ratings: {
      speed: rnd(58, 96), stamina: rnd(58, 96), mountainUp: rnd(50, 96), mountainDown: rnd(50, 96),
      pacing: rnd(55, 92), mental: rnd(55, 92), recovery: rnd(55, 92),
    },
    contract: { yearsLeft: rnd(1, 3), annualSalary: 3000, totalYears: 3, contractType: 'standard' },
    career: { totalRaces: rnd(5, 40), segmentWins: rnd(0, 6), championships: 0, mvpAwards: 0 },
    fatigue: rnd(0, 40), form: rnd(-2, 2), morale: rnd(60, 96),
    eventBests: {
      d5000: { timeSec: 12 * 60 + 50 + off('d5000'), year: YEAR },
      d10000: { timeSec: 26 * 60 + 40 + Math.round(off('d10000') * 1.6), year: YEAR },
      marathon: { timeSec: 2 * 3600 + 3 * 60 + off('marathon') * 4, year: YEAR },
    },
  }
}

const players: unknown[] = []
for (const nat of NATS) {
  for (let i = 0; i < 40; i++) players.push(mkPlayer(nat, i))
}

function seedAndMount() {
  const st = useGameStore.getState() as unknown as { currentSeason: object }
  useGameStore.setState({
    players,
    teams: [
      { id: 't_tokyo', name: '東京ロードキングス', shortName: '東京', colors: { primary: '#f5c842', secondary: '#14121F' }, roster: { main: [], second: [] }, finance: { budget: 0 }, history: { championships: 0, bestRank: 1, seasons: [] } },
      { id: 't_hakata', name: '博多レッドドラゴン', shortName: '博多', colors: { primary: '#e74c3c', secondary: '#14121F' }, roster: { main: [], second: [] }, finance: { budget: 0 }, history: { championships: 0, bestRank: 1, seasons: [] } },
      { id: 't_shizu', name: '静岡ティーフィールド', shortName: '静岡', colors: { primary: '#2ecc71', secondary: '#14121F' }, roster: { main: [], second: [] }, finance: { budget: 0 }, history: { championships: 0, bestRank: 1, seasons: [] } },
      { id: 't_aomori', name: '青森ねぶたランナーズ', shortName: '青森', colors: { primary: '#ff7043', secondary: '#14121F' }, roster: { main: [], second: [] }, finance: { budget: 0 }, history: { championships: 0, bestRank: 1, seasons: [] } },
    ],
    playerTeamId: 't_tokyo',
    isInitialized: true,
    adsRemoved: false,  // 広告バナーあり＝実機の最悪条件でレイアウト確認
    currentSeason: { ...st.currentSeason, year: YEAR },
  } as never)

  const hash = location.hash.replace('#', '') || 'select'
  const path = hash === 'tournament' ? '/national/tournament' : hash === 'result' ? '/national/result' : hash === 'records' ? '/records/season' : hash === 'champions' ? '/records/champions' : hash === 'roster' ? '/preview/roster' : hash === 'create' ? '/create-player' : '/national/select'
  if (hash === 'roster') {
    // パッチ確認用のモック実績を仕込む（金/銀/銅メダル・国旗代表・アジア最優秀・年間最速）
    const mut = (id: string, patch: object) => {
      const st = useGameStore.getState() as unknown as { players: { id: string }[] }
      useGameStore.setState({ players: st.players.map(p => p.id === id ? { ...p, ...patch } : p) } as never)
    }
    useGameStore.setState({
      worldRepresentatives: [
        { playerId: 'JPN_0', year: 2044, nat: 'JPN', label: '5000m', rank: 1 },
        { playerId: 'JPN_0', year: 2044, nat: 'JPN', label: '駅伝', rank: 1 },
        { playerId: 'JPN_1', year: 2044, nat: 'JPN', label: 'マラソン', rank: 2 },
        { playerId: 'JPN_1', year: 2043, nat: 'JPN', label: '駅伝' },
        { playerId: 'JPN_2', year: 2044, nat: 'JPN', label: '10000m', rank: 3 },
        { playerId: 'JPN_3', year: 2043, nat: 'JPN', label: '駅伝' },
        { playerId: 'JPN_5', year: 2044, nat: 'JPN', label: 'マラソン' },
      ],
      worldAthleticsResults: [
        { year: 2043, kind: 'qualifier', region: 'アジア＋オセアニア', standings: [], advanced: [], bestPlayer: { playerId: 'JPN_3', nat: 'JPN', avgRank: 1.3 } },
      ],
    } as never)
    mut('JPN_1', { displayBadge: 'nat-2043-駅伝' })
    mut('JPN_2', { fatigue: 78, form: -1 })
    mut('JPN_3', { contract: { yearsLeft: 1, annualSalary: 3000, totalYears: 3, contractType: 'standard' }, form: 2 })
    mut('JPN_4', { status: 'injured', injuredUntilRace: 3 })
    mut('JPN_5', { pendingRetirementYear: 2044, age: 36 })
  }
  if (hash === 'tournament' || hash === 'result' || hash === 'records' || hash === 'champions') {
    ;(useGameStore.getState() as unknown as { startWorldTournament: () => void }).startWorldTournament()
  }
  if (hash === 'result' || hash === 'records' || hash === 'champions') {
    const adv = (useGameStore.getState() as unknown as { advanceWorldRace: () => void }).advanceWorldRace
    for (let i = 0; i < 3; i++) (useGameStore.getState() as unknown as { advanceWorldRace: () => void }).advanceWorldRace()
    void adv
  }
  ;(window as unknown as { store: typeof useGameStore }).store = useGameStore

  createRoot(document.getElementById('root')!).render(
    <MemoryRouter initialEntries={[path]}>
      <Layout>
        <Routes>
          <Route path="/national/select" element={<NationalSquadSelectPage />} />
          <Route path="/national/tournament" element={<WorldTournamentPage />} />
          <Route path="/national/result" element={<NationalResultPage />} />
          <Route path="/records/season" element={<RecordsPage />} />
          <Route path="/records/champions" element={<ChampionsHistoryPage />} />
          <Route path="/create-player" element={<CreateMyPlayerPage />} />
          <Route path="/preview/roster" element={<RosterPreview />} />
        </Routes>
      </Layout>
      <PlayerSheet />
      {/* 広告バナー実寸ダミー（実機ではネイティブAdMobがここに重なる） */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: AD_H, zIndex: 9999, background: '#1b1b1b', color: '#777', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, letterSpacing: 2 }}>AD BANNER（ダミー）</div>
    </MemoryRouter>
  )
}

if (useGameStore.persist.hasHydrated()) seedAndMount()
else {
  useGameStore.persist.onFinishHydration(() => seedAndMount())
  setTimeout(() => { if (!document.getElementById('root')!.hasChildNodes()) seedAndMount() }, 1500)
}
