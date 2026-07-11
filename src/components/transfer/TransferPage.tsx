import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Player, Specialty, Nationality } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, calcTransferValue, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, seasonAppearances, isDataKeyPlayer, isOpponentScouted, isScoutPending } from '../../utils/playerUtils'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import NumberDial from '../ui/NumberDial'
import { getMarketFilters, saveMarketFilters } from '../../utils/marketFilters'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const NAT_LABELS: Record<Nationality, string> = {
  JPN: '日本',
  KOR: '韓国',
  CHN: '中国',
  TWN: '台湾',
  ETH: 'エチオピア',
  KEN: 'ケニア',
  UGA: 'ウガンダ',
  TAN: 'タンザニア',
  USA: 'アメリカ',
  EUR: 'ヨーロッパ',
  FOREIGN: 'その他外国',
}

type Tab = 'market' | 'market-results' | 'fa' | 'roster' | 'trade' | 'listings'

const SALARY_STEP = 500000
const SALARY_MIN  = 3000000
const SALARY_MAX  = 80000000

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

function ContractBadge({ years }: { years: number }) {
  const col = years <= 1 ? C.red : years <= 2 ? C.gold : C.textDim
  return (
    <span style={{
      fontSize: '9px', fontWeight: '700', padding: '2px 6px', borderRadius: '6px',
      backgroundColor: alpha(col, 0.09), color: col, border: `1px solid ${alpha(col, 0.18)}`,
      fontFamily: SAIRA,
    }}>
      {years}年
    </span>
  )
}

const PERSONALITY_LABEL: Record<string, string> = {
  salary: '高年俸志向',
  winning: '勝利志向',
  loyalty: 'チーム愛着型',
}
const PERSONALITY_COLOR: Record<string, string> = {
  salary: C.gold,
  winning: C.green,
  loyalty: C.blue,
}

export default function TransferPage() {
  const {
    teams, players, playerTeamId, currentSeason, gmRep, foreignLeagues,
    signFAPlayer, tradePlayer, getTransferWindow, ensureFuturePicks, startAcquisitionOffer,
    submitTransferBid, submitLoanRequest,
    acceptIncomingOffer, declineIncomingOffer,
    counterIncomingOffer,
    listMyPlayerForSale, delistMyPlayer, sellDraftPick,
    scoutOpponentPlayer,
  } = useGameStore()
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)

  const { section } = useParams<{ section: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const tab = (section as Tab) ?? 'market'

  // 検索フィルタはモジュールスコープに退避してあり、遷移（結果⇄一覧・チャット往復）で消えない。
  // 市場系画面から完全に離れたときにApp側でクリアされる
  const savedF = getMarketFilters()
  const [mktSearch, setMktSearch] = useState(savedF.search)
  const [mktSpec, setMktSpec] = useState<Specialty | 'all'>(savedF.spec as Specialty | 'all')
  const [mktNat, setMktNat] = useState<Nationality | 'all'>(savedF.nat as Nationality | 'all')
  const [mktAvail, setMktAvail] = useState<'all' | 'listed' | 'expiring' | 'fa'>(savedF.avail as 'all' | 'listed' | 'expiring' | 'fa')
  const [mktTeam, setMktTeam] = useState<string>(savedF.team)
  const [mktAge, setMktAge] = useState<string>(savedF.age)
  const [mktLeague, setMktLeague] = useState<string>(savedF.league)

  useEffect(() => {
    if (tab === 'trade') ensureFuturePicks()
  }, [tab])  // eslint-disable-line react-hooks/exhaustive-deps

  const restoredNavKey = useRef<string | null>(null)
  useEffect(() => {
    if (tab !== 'market') return
    if (restoredNavKey.current === location.key) return
    restoredNavKey.current = location.key
    const s = location.state as { search?: string; spec?: Specialty | 'all'; nat?: Nationality | 'all'; avail?: 'all' | 'listed' | 'expiring'; team?: string; age?: string; league?: string } | null
    if (!s || typeof s.search !== 'string') return
    setMktSearch(s.search)
    setMktSpec(s.spec ?? 'all')
    setMktNat(s.nat ?? 'all')
    setMktAvail(s.avail ?? 'all')
    setMktTeam(s.team ?? 'all')
    setMktAge(s.age ?? 'all')
    setMktLeague(s.league ?? 'all')
  }, [location.key, location.state, tab])
  const [mktSortKey, setMktSortKey] = useState<'ovr' | 'value' | 'age' | 'salary' | 'name'>(savedF.sortKey as 'ovr' | 'value' | 'age' | 'salary' | 'name')
  const [mktSortDir, setMktSortDir] = useState<'desc' | 'asc'>(savedF.sortDir as 'desc' | 'asc')
  // フィルタ変更をモジュールスコープへ同期（アンマウント後の復元用）
  useEffect(() => {
    saveMarketFilters({ search: mktSearch, spec: mktSpec, nat: mktNat, avail: mktAvail, team: mktTeam, age: mktAge, league: mktLeague, sortKey: mktSortKey, sortDir: mktSortDir })
  }, [mktSearch, mktSpec, mktNat, mktAvail, mktTeam, mktAge, mktLeague, mktSortKey, mktSortDir])
  const [bidTarget, setBidTarget] = useState<string | null>(null)
  const [bidFee, setBidFee] = useState(0)

  const [filterSpec, setFilterSpec] = useState<Specialty | 'all'>('all')
  const [tradeTier, setTradeTier] = useState<'all' | 'main' | 'second'>('all')

  const [tradeTarget, setTradeTarget] = useState<string | null>(null)
  const [tradeStep, setTradeStep] = useState<1 | 2 | 3>(1)
  const [offerIds, setOfferIds] = useState<string[]>([])
  const [requestIds, setRequestIds] = useState<string[]>([])
  const [offerPickKeys, setOfferPickKeys] = useState<string[]>([])
  const [requestPickKeys, setRequestPickKeys] = useState<string[]>([])
  const [tradeFee, setTradeFee] = useState<number>(0)
  const [tradeRound, setTradeRound] = useState<number>(1)
  const [tradeStatus, setTradeStatus] = useState<'idle' | 'countered' | 'accepted' | 'rejected'>('idle')
  const [counterFee, setCounterFee] = useState<number>(0)
  const [counterMsg, setCounterMsg] = useState<string>('')
  const [listingPlayerId, setListingPlayerId] = useState<string | null>(null)
  const [listingPrice, setListingPrice] = useState<number>(0)
  const [pickSellTarget, setPickSellTarget] = useState<string | null>(null)
  const [pickSellTeam, setPickSellTeam] = useState<string>('')
  const [pickSellPrice, setPickSellPrice] = useState<number>(0)
  const [pickSellResult, setPickSellResult] = useState<'idle' | 'success' | 'failed'>('idle')
  const [tradeLeague, setTradeLeague] = useState<string>('jpel')

  function pickKey(p: { year: number; round: number; pickNumber: number }) {
    return `${p.year}-R${p.round}-${p.pickNumber}`
  }
  function pickValue(round: number) { return round === 1 ? 25_000_000 : 8_000_000 }

  function resetTrade(teamId: string | null) {
    setTradeTarget(teamId)
    setTradeStep(1)
    setOfferIds([]); setRequestIds([])
    setOfferPickKeys([]); setRequestPickKeys([])
    setTradeFee(0)
    setTradeRound(1); setTradeStatus('idle'); setCounterFee(0); setCounterMsg('')
  }

  function evaluateOffer(offOvr: number, reqOvr: number, fee: number, round: number, offPickVal: number, reqPickVal: number): { result: 'accept' | 'counter' | 'reject'; cFee: number; msg: string } {
    const ovrGap = (reqOvr - offOvr) * 4_000_000
    const netFee = fee + offPickVal - reqPickVal
    const counterpartGain = netFee - ovrGap
    const tolerance = round === 1 ? 3_000_000 : round === 2 ? 8_000_000 : 16_000_000
    if (counterpartGain >= -tolerance) {
      return { result: 'accept', cFee: 0, msg: 'トレード成立！' }
    }
    const gap = -(counterpartGain)
    if (gap <= 50_000_000) {
      const demand = Math.ceil((gap - tolerance) / 1_000_000) * 1_000_000
      const msgs = [
        `条件を詰めましょう。移籍金${fmt(demand)}の追加で合意できます。`,
        `悪くない提案ですが、${fmt(demand)}の上乗せをお願いします。`,
        `もう少し。${fmt(demand)}払っていただければ話は進みます。`,
      ]
      return { result: 'counter', cFee: demand, msg: msgs[round - 1] ?? msgs[0] }
    }
    const rejects = [
      '条件が大きく乖離しています。別の提案をお願いします。',
      'やはり条件が合いません。もっと良い選手か指名権が必要です。',
      '最終回答：この条件では合意できません。',
    ]
    return { result: 'reject', cFee: 0, msg: rejects[round - 1] ?? rejects[0] }
  }

  function handlePropose(offOvr: number, reqOvr: number, offPickVal: number, reqPickVal: number) {
    const { result, cFee, msg } = evaluateOffer(offOvr, reqOvr, tradeFee, tradeRound, offPickVal, reqPickVal)
    if (result === 'accept') {
      // UI判定が通っても、ストア側（主力放出拒否・価値釣り合い・本人同意・予算）で不成立になることがある。
      // 実際に成立した場合だけ「成立」を出す
      const ok = tradePlayer(offerIds, requestIds, tradeTarget!, tradeFee, offerPickKeys, requestPickKeys)
      if (ok) {
        setCounterMsg(msg)
        setTradeStatus('accepted')
      } else {
        setCounterMsg('先方が首を縦に振りません。主力の放出拒否か、選手本人が移籍に納得していないようです。')
        setTradeStatus('rejected')
      }
    } else if (result === 'counter') {
      setCounterMsg(msg)
      setCounterFee(cFee)
      setTradeStatus('countered')
    } else {
      setCounterMsg(msg)
      setTradeStatus('rejected')
    }
  }

  function handleAcceptCounter() {
    const ok = tradePlayer(offerIds, requestIds, tradeTarget!, counterFee, offerPickKeys, requestPickKeys)
    if (ok) {
      setCounterMsg('トレード成立！')
      setTradeStatus('accepted')
    } else {
      setCounterMsg('先方が最終確認で難色を示しました。主力の放出拒否か、選手本人が移籍に納得していないようです。')
      setTradeStatus('rejected')
    }
  }

  function handleReNegotiate() {
    setTradeFee(counterFee)
    setTradeRound(r => r + 1)
    setTradeStatus('idle')
    setCounterFee(0); setCounterMsg('')
  }

  const myTeam = teams.find(t => t.id === playerTeamId)
  if (!myTeam) return null

  const window = getTransferWindow()
  // 赤字ペナルティ中は新規補強不可（startAcquisitionOfferが内部で弾くため、ボタン側でも明示する）
  const signingBanned = (myTeam.finance.deficitStreak ?? 0) >= 1

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')
    .sort((a, b) => ovr(b) - ovr(a))

  const faPlayers = players
    .filter(p => p.teamId === '' && p.status === 'active')
    .filter(p => filterSpec === 'all' || p.specialty === filterSpec)
    .sort((a, b) => ovr(b) - ovr(a))

  const salaryUsed = myPlayers.reduce((sum, p) => sum + p.contract.annualSalary, 0)
  const sortedStandings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
  const isGoodTeam = myRank > 0 && myRank <= 5

  const selectStyle: React.CSSProperties = {
    flex: 1, padding: '7px 8px', borderRadius: '10px',
    backgroundColor: C.surface2, border: `1px solid ${C.border2}`,
    color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
  }

  const tabTitle = tab === 'market' ? '移籍市場' : tab === 'market-results' ? '検索結果' : tab === 'fa' ? 'FA' : tab === 'roster' ? 'ロスター' : tab === 'listings' ? '出品管理' : 'トレード'

  return (
    <div style={{ paddingTop: '4px', paddingBottom: '80px', fontFamily: SAIRA }}>
      <div style={{ padding: '10px 16px 12px' }}>
        <BackButton onClick={tab === 'trade' && tradeTarget ? () => resetTrade(null) : undefined} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 16px ${alpha(C.gold, 0.25)}` }}>
            {tabTitle}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: window.open ? C.green : C.red }}/>
            <span style={{ fontSize: '10px', fontWeight: '700', color: window.open ? C.green : C.red, fontFamily: SAIRA }}>
              {window.open ? 'OPEN' : 'CLOSED'}
            </span>
            <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{fmt(salaryUsed)}</span>
          </div>
        </div>

        {tab === 'roster' && (
          <div style={{
            padding: '10px 12px', borderRadius: '12px',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border2}`, marginBottom: '10px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>年俸総額</span>
            <span style={{ fontSize: '13px', fontWeight: 900, fontFamily: SAIRA, color: C.gold }}>{fmt(salaryUsed)}</span>
          </div>
        )}

        {!window.open && tab === 'market' && (
          <div style={{
            padding: '8px 12px', borderRadius: '10px', marginBottom: '10px',
            backgroundColor: alpha(C.red, 0.06), border: `1px solid ${alpha(C.red, 0.18)}`,
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: C.red, fontFamily: SAIRA }}>移籍ウィンドウ閉鎖中</span>
            {window.racesUntil != null && (
              <span style={{ fontSize: '10px', color: C.textDim, marginLeft: 'auto', fontFamily: SAIRA }}>
                あと{window.racesUntil}戦
              </span>
            )}
          </div>
        )}
      </div>

      {tab === 'market' && (() => {
        const allLeagues = foreignLeagues ?? []

        const leagueOptions = [
          { id: 'jpel', name: '日本 (JPEL)' },
          ...allLeagues.map(l => ({ id: l.id, name: l.name })),
        ]
        const clubsForLeague: { id: string; name: string }[] =
          mktLeague === 'all'
            ? [
                ...teams.filter(t => t.id !== playerTeamId).map(t => ({ id: t.id, name: t.name })),
                ...allLeagues.flatMap(l => l.clubs.map(c => ({ id: c.id, name: c.name }))),
              ].sort((a, b) => a.name.localeCompare(b.name))
            : mktLeague === 'jpel'
            ? teams.filter(t => t.id !== playerTeamId).map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name))
            : (allLeagues.find(l => l.id === mktLeague)?.clubs ?? []).map(c => ({ id: c.id, name: c.name }))

        const cell: React.CSSProperties = {
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `1px solid ${C.border2}`, borderRadius: 12, padding: '10px 12px',
        }
        const lbl: React.CSSProperties = {
          display: 'block', fontFamily: SAIRA, fontSize: 9, color: C.textDim,
          letterSpacing: '2px', marginBottom: 6,
        }
        const sel: React.CSSProperties = {
          width: '100%', background: C.surface2, border: 'none',
          color: C.text, fontSize: 15, fontWeight: 700, fontFamily: SAIRA,
          outline: 'none', cursor: 'pointer',
        }

        return (
          <div style={{ padding: '0 12px' }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ ...cell, marginBottom: 8 }}>
                <span style={lbl}>選手名</span>
                <input type="text" value={mktSearch} onChange={e => setMktSearch(e.target.value)}
                  placeholder="—" style={{ ...sel, background: 'transparent', fontSize: 14 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={cell}>
                  <span style={lbl}>移籍状況</span>
                  <select value={mktAvail} onChange={e => setMktAvail(e.target.value as typeof mktAvail)} style={sel}>
                    <option value="all">全員</option>
                    <option value="fa">契約満了（FA）</option>
                    <option value="listed">移籍リスト入り</option>
                    <option value="expiring">契約切れ間近</option>
                  </select>
                </div>
                <div style={cell}>
                  <span style={lbl}>国籍</span>
                  <select value={mktNat} onChange={e => setMktNat(e.target.value as Nationality | 'all')} style={sel}>
                    <option value="all">全国籍</option>
                    {(Object.keys(NAT_LABELS) as Nationality[]).map(n => (
                      <option key={n} value={n}>{NAT_LABELS[n]}</option>
                    ))}
                  </select>
                </div>
                <div style={cell}>
                  <span style={lbl}>ポジション</span>
                  <select value={mktSpec} onChange={e => setMktSpec(e.target.value as Specialty | 'all')} style={sel}>
                    <option value="all">全ポジ</option>
                    {(['ace','sprinter','long','mountain_up','mountain_down','allrounder','kick','grinder'] as const).map(s => (
                      <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div style={cell}>
                  <span style={lbl}>年齢</span>
                  <select value={mktAge} onChange={e => setMktAge(e.target.value)} style={sel}>
                    <option value="all">全年齢</option>
                    <option value="u22">22歳以下</option>
                    <option value="23-26">23〜26歳</option>
                    <option value="27-30">27〜30歳</option>
                    <option value="31+">31歳以上</option>
                  </select>
                </div>
                <div style={cell}>
                  <span style={lbl}>所属リーグ</span>
                  <select value={mktLeague} onChange={e => { setMktLeague(e.target.value); setMktTeam('all') }} style={sel}>
                    <option value="all">全リーグ</option>
                    {leagueOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div style={cell}>
                  <span style={lbl}>所属クラブ</span>
                  <select value={mktTeam} onChange={e => setMktTeam(e.target.value)} style={sel}>
                    <option value="all">全クラブ</option>
                    {clubsForLeague.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button
                className="btn-game btn-game--gold"
                onClick={() => navigate('/transfer/market-results', { state: { search: mktSearch, spec: mktSpec, nat: mktNat, avail: mktAvail, team: mktTeam, age: mktAge, league: mktLeague } })}
                style={{ width: '100%' }}
              >
                <span className="btn-game__inner" style={{ fontFamily: SAIRA, fontSize: 15 }}>検索</span>
              </button>
            </div>
          </div>
        )
      })()}

      {tab === 'market-results' && (() => {
        const f = location.state as { search: string; spec: Specialty | 'all'; nat: Nationality | 'all'; avail: 'all' | 'listed' | 'expiring' | 'fa'; team: string; age: string; league: string } | null
        if (!f) { navigate('/transfer/market'); return null }

        const allBids = currentSeason.transferBids ?? []
        const activeBids = allBids.filter(b => ['pending','fee_accepted','countered'].includes(b.status))
        const listings = currentSeason.transferListings ?? []
        const listedIds = new Set(listings.map(l => l.playerId))

        const jpelTeamIds = new Set(teams.map(t => t.id))
        const allLeagues = foreignLeagues ?? []
        const foreignClubToLeague: Record<string, string> = {}
        for (const lg of allLeagues) for (const club of lg.clubs) foreignClubToLeague[club.id] = lg.id

        const allForeignPlayerIds = new Set(allLeagues.flatMap(l => l.clubs.flatMap(c => c.playerIds)))

        const marketPlayers = players
          .filter(p => p.teamId !== playerTeamId && p.status === 'active' && (p.teamId === '' || p.rosterTier === 'main' || allForeignPlayerIds.has(p.id)))
          .filter(p => f.search === '' || p.name.includes(f.search))
          .filter(p => f.spec === 'all' || p.specialty === f.spec)
          .filter(p => f.nat === 'all' || p.nationality === f.nat)
          .filter(p => {
            const isFA = p.teamId === ''
            if (f.avail === 'fa') return isFA
            if (isFA) return f.avail === 'all'   // FAは「全員」か「契約満了(FA)」のときのみ表示
            if (f.avail === 'listed') return listedIds.has(p.id)
            if (f.avail === 'expiring') {
              if (p.contract.yearsLeft > 1) return false
              // 主力（データ上よく出場）は自チームが更新するので「契約切れ」候補から除外（移籍リスト入りは対象）
              const tr = currentSeason.currentRaceIndex
              const apps = seasonAppearances(p.id, currentSeason.races)
              const frac = tr > 0 ? apps / tr : (p.rosterTier === 'main' ? 0.5 : 0)
              return !!p.transferListed || !isDataKeyPlayer(p, frac, tr)
            }
            return true
          })
          .filter(p => {
            if (f.league === 'all') return true
            if (f.league === 'jpel') return jpelTeamIds.has(p.teamId)
            return foreignClubToLeague[p.teamId] === f.league
          })
          .filter(p => f.team === 'all' || p.teamId === f.team)
          .filter(p => {
            if (f.age === 'all') return true
            if (f.age === 'u22') return p.age <= 22
            if (f.age === '23-26') return p.age >= 23 && p.age <= 26
            if (f.age === '27-30') return p.age >= 27 && p.age <= 30
            return p.age >= 31
          })
          .sort((a, b) => {
            const diff = mktSortKey === 'value'  ? calcTransferValue(b) - calcTransferValue(a)
              : mktSortKey === 'age'    ? b.age - a.age
              : mktSortKey === 'salary' ? b.contract.annualSalary - a.contract.annualSalary
              : mktSortKey === 'name'   ? b.name.localeCompare(a.name)
              : ovr(b) - ovr(a)
            return mktSortDir === 'asc' ? -diff : diff
          })

        const allClubs: Record<string, string> = {}
        for (const t of teams) allClubs[t.id] = t.shortName
        for (const lg of allLeagues) for (const c of lg.clubs) allClubs[c.id] = c.shortName

        return (
          <div style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', color: C.textGhost, fontFamily: SAIRA }}>{marketPlayers.length}名</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <select
                  value={mktSortKey}
                  onChange={e => setMktSortKey(e.target.value as typeof mktSortKey)}
                  style={{
                    background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 8,
                    color: C.textSub, fontSize: 11, fontFamily: SAIRA, padding: '4px 8px', outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="ovr">総合値</option>
                  <option value="value">市場価値</option>
                  <option value="age">年齢</option>
                  <option value="salary">年俸</option>
                  <option value="name">名前</option>
                </select>
                <button
                  onClick={() => setMktSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                  style={{
                    background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 8,
                    color: C.textSub, fontSize: 13, fontFamily: SAIRA, padding: '3px 8px',
                    cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  {mktSortDir === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>
            {marketPlayers.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: C.textGhost, fontSize: '13px', fontFamily: SAIRA }}>条件に合う選手なし</div>
            )}
            {marketPlayers.map(p => {
              const specCol = SPEC_COLOR[p.specialty]
              const isListed = listedIds.has(p.id)
              const val = calcTransferValue(p)
              const listing = listings.find(l => l.playerId === p.id)
              const hasBid = activeBids.some(b => b.playerId === p.id)
              // 交渉決裂ペナルティ中は入札不可（グレーアウト）
              const bidLocked = p.transferLockedUntilYear != null && currentSeason.year < p.transferLockedUntilYear
              const isBidOpen = bidTarget === p.id
              const initFee = listing ? Math.round(listing.askingPrice * 0.82 / 500000) * 500000 : Math.round(val * 0.85 / 500000) * 500000
              const rating = ovr(p)
              const isScouted = isOpponentScouted(p.id, currentSeason)
              const scoutPending = isScoutPending(p.id, currentSeason)
              const isStarred = starredOpponents.includes(p.id)
              return (
                <div key={p.id} style={{ marginBottom: '7px', opacity: bidLocked ? 0.5 : 1 }}>
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    borderRadius: isBidOpen ? '14px 14px 0 0' : '14px',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `2px solid ${isListed ? C.goldDark : alpha(specCol, 0.25)}`,
                    boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}` }}
                          onClick={e => { e.stopPropagation(); openPlayerSheet(p.id) }}>
                          <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={e => { e.stopPropagation(); openPlayerSheet(p.id) }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(rating) }}>{rating}</span>
                            <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                            <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{allClubs[p.teamId] ?? '?'}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>価値 <span style={{ color: C.gold }}>{isScouted ? fmt(val) : '?'}</span></span>
                            <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>年俸 <span style={{ color: C.textSub }}>{isScouted ? fmt(p.contract.annualSalary) : '?'}</span></span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleStarOpponent(p.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: isStarred ? C.gold : C.textGhost, fontSize: 18, lineHeight: 1 }}
                          >
                            {isStarred ? '★' : '☆'}
                          </button>
                          {p.teamId === '' ? (
                            <button disabled={signingBanned}
                              onClick={() => { if (signingBanned) return; startAcquisitionOffer(p.id, 'fa'); navigate(`/team/chat?player=${p.id}`) }}
                              style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: signingBanned ? C.surface2 : `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: signingBanned ? C.textGhost : '#0A0912', fontSize: '11px', fontWeight: '800', cursor: signingBanned ? 'not-allowed' : 'pointer', fontFamily: SAIRA }}>
                              {signingBanned ? '赤字で補強不可' : '契約オファー'}
                            </button>
                          ) : hasBid ? (
                            <span style={{ fontSize: '10px', color: C.gold, fontWeight: '700', fontFamily: SAIRA }}>入札中</span>
                          ) : bidLocked ? (
                            <span style={{ fontSize: '10px', color: C.red, fontWeight: '700', fontFamily: SAIRA }}>交渉決裂・来季まで不可</span>
                          ) : (
                            <button disabled={!window.open}
                              onClick={() => { setBidTarget(isBidOpen ? null : p.id); if (!isBidOpen) setBidFee(initFee) }}
                              style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: !window.open ? C.surface2 : isBidOpen ? C.surface2 : `linear-gradient(135deg, ${C.gold}, #E8C86A)`, color: !window.open ? C.textGhost : isBidOpen ? C.textSub : '#0A0912', fontSize: '11px', fontWeight: '800', cursor: window.open ? 'pointer' : 'not-allowed', fontFamily: SAIRA }}>
                              {isBidOpen ? '閉じる' : '入札'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isBidOpen && (
                    <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderTop: 'none', borderRadius: '0 0 14px 14px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', color: C.textSub, marginBottom: '8px', fontFamily: SAIRA }}>
                        入札金額 — 市場価値: <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmt(val)}</span>
                        {listing && <span style={{ marginLeft: '8px', color: C.orange, fontFamily: SAIRA }}>クラブ希望: {fmt(listing.askingPrice)}</span>}
                      </div>
                      <div style={{ padding: '4px 0 10px' }}>
                        <NumberDial value={bidFee} onChange={v => setBidFee(Math.max(1000000, v))} min={1000000} accent={C.gold} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', marginBottom: '10px', fontFamily: SAIRA }}>
                        <span style={{ color: C.textGhost }}>低い</span>
                        <span style={{ fontWeight: '700', color: bidFee >= val ? C.green : bidFee >= val * 0.75 ? C.gold : C.red }}>
                          {bidFee >= val ? '合意圏' : bidFee >= val * 0.75 ? 'カウンター可能性' : '否決の可能性高'}
                        </span>
                        <span style={{ color: C.textGhost }}>高い</span>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => { submitTransferBid(p.id, bidFee); setBidTarget(null) }}
                          disabled={bidFee > myTeam.finance.budget}
                          style={{
                            flex: 1, padding: '11px', borderRadius: '11px', border: 'none', marginBottom: 8,
                            background: bidFee > myTeam.finance.budget ? C.surface2 : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                            color: bidFee > myTeam.finance.budget ? C.textGhost : C.gold,
                            fontSize: '13px', fontWeight: '900', cursor: bidFee <= myTeam.finance.budget ? 'pointer' : 'default', fontFamily: SAIRA,
                            boxShadow: bidFee > myTeam.finance.budget ? 'none' : '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                          } as React.CSSProperties}>
                          {bidFee > myTeam.finance.budget ? '予算不足' : '入札する（次レース回答）'}
                        </button>
                        <button onClick={() => setBidTarget(null)} style={{ padding: '11px 14px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: '12px', cursor: 'pointer', fontFamily: SAIRA }}>取消</button>
                      </div>
                      {/* レンタル要請（買わずに借りる） */}
                      <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 2, paddingTop: 10 }}>
                        {(() => {
                          const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
                          const reqPending = (currentSeason.loanRequests ?? []).some(r => r.playerId === p.id)
                          if (reqPending) return <div style={{ fontSize: 10, color: C.blue, fontFamily: SAIRA }}>レンタル要請中 — 次レースで回答</div>
                          if (slots >= 3) return <div style={{ fontSize: 10, color: C.red, fontFamily: SAIRA }}>レンタル枠が満杯（3/3）</div>
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, color: C.textDim, fontFamily: SAIRA, marginRight: 'auto' }}>買わずにレンタルで要請</span>
                              {[1, 2].map(y => (
                                <button key={y} onClick={() => { submitLoanRequest(p.id, y); setBidTarget(null) }} style={{ padding: '7px 13px', borderRadius: 8, border: `1.5px solid ${alpha(C.blue, 0.5)}`, background: alpha(C.blue, 0.12), color: C.blue, fontSize: 11, fontWeight: 800, cursor: 'pointer', fontFamily: SAIRA }}>{y}年</button>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })()}

      {tab === 'fa' && (
        <div style={{ padding: '0 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '9px', color: C.textGhost, fontFamily: SAIRA }}>{faPlayers.length}名</span>
            <select value={filterSpec} onChange={e => setFilterSpec(e.target.value as Specialty | 'all')} style={{ ...selectStyle }}>
              <option value="all">全タイプ</option>
              {(['ace','sprinter','long','mountain_up','mountain_down','allrounder','kick','grinder'] as const).map(s => (
                <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {faPlayers.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.textGhost, fontSize: '13px', fontFamily: SAIRA }}>条件に合う選手なし</div>
          ) : (
            faPlayers.map(p => {
              const specCol  = SPEC_COLOR[p.specialty]
              const market   = faMarketSalary(p)
              const rating   = ovr(p)
              const isStarred = starredOpponents.includes(p.id)
              return (
                <div key={p.id} style={{ marginBottom: '7px' }}>
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    borderRadius: '14px',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `2px solid ${alpha(specCol, 0.25)}`,
                    boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}` }}
                          onClick={e => { e.stopPropagation(); openPlayerSheet(p.id) }}>
                          <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }} onClick={e => { e.stopPropagation(); openPlayerSheet(p.id) }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(rating) }}>{rating}</span>
                            <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                            <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>FA</span>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>市場 <span style={{ color: C.gold }}>{fmt(market)}</span></span>
                            <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>年俸 <span style={{ color: C.textSub }}>{fmt(p.contract.annualSalary)}</span></span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <button
                            onClick={e => { e.stopPropagation(); toggleStarOpponent(p.id) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: isStarred ? C.gold : C.textGhost, fontSize: 18, lineHeight: 1 }}
                          >
                            {isStarred ? '★' : '☆'}
                          </button>
                          <button disabled={signingBanned}
                            onClick={() => { if (signingBanned) return; startAcquisitionOffer(p.id, 'fa'); navigate(`/team/chat?player=${p.id}`) }}
                            style={{ padding: '5px 10px', borderRadius: '8px', border: 'none', background: signingBanned ? C.surface2 : `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: signingBanned ? C.textGhost : '#0A0912', fontSize: '11px', fontWeight: '800', cursor: signingBanned ? 'not-allowed' : 'pointer', fontFamily: SAIRA }}
                          >
                            {signingBanned ? '赤字で補強不可' : '契約オファー'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div style={{ padding: '0 12px' }}>
          {myPlayers.map(p => {
            const rating   = ovr(p)
            const specCol  = SPEC_COLOR[p.specialty]
            const isExpiring  = p.contract.yearsLeft <= 1

            return (
              <div key={p.id} style={{ marginBottom: '8px' }}>
                <div style={{
                  position: 'relative', overflow: 'hidden',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${isExpiring ? alpha(C.red, 0.37) : C.goldDark}`,
                  boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                      backgroundColor: alpha(ratingColor(rating), 0.08), border: `1px solid ${alpha(ratingColor(rating), 0.25)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '14px', fontWeight: '900', color: ratingColor(rating), fontFamily: SAIRA,
                    }}>
                      {rating}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: C.text, marginBottom: '3px', fontFamily: SAIRA }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '9px', fontWeight: '700', padding: '1px 5px', borderRadius: '6px', backgroundColor: alpha(specCol, 0.09), color: specCol, fontFamily: SAIRA }}>
                          {SPECIALTY_LABELS[p.specialty]}
                        </span>
                        <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{p.age}歳</span>
                        <ContractBadge years={p.contract.yearsLeft}/>
                        <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{fmt(p.contract.annualSalary)}/年</span>
                        {isExpiring && <span style={{ fontSize: '9px', color: C.red, fontWeight: '700', fontFamily: SAIRA }}>FA間近</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'listings' && (() => {
        const incomingOffers = currentSeason.incomingOffers ?? []
        const listings = currentSeason.transferListings ?? []
        const listedIds = new Set(listings.map(l => l.playerId))

        return (
          <div style={{ padding: '0 12px' }}>
            {incomingOffers.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '9px', color: C.pink, letterSpacing: '2px', marginBottom: '8px', fontWeight: '700', fontFamily: SAIRA }}>
                  他クラブからのオファー {incomingOffers.length}件 — 要確認
                </div>
                {incomingOffers.map(offer => {
                  const p = players.find(pl => pl.id === offer.playerId)
                  const fromTeam = teams.find(t => t.id === offer.fromTeamId)
                  if (!p) return null
                  const rating = ovr(p)
                  const specCol = SPEC_COLOR[p.specialty]
                  return (
                    <div key={offer.id} style={{
                      position: 'relative', overflow: 'hidden',
                      borderRadius: '14px', marginBottom: '8px',
                      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                      border: `2px solid ${alpha(C.pink, 0.37)}`,
                      boxShadow: '0 4px 0 #5a0028, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.pink, 0.12)}`, borderRadius: 10, pointerEvents: 'none' }} />
                      <div style={{ position: 'relative', zIndex: 1, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          <div style={{
                            width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
                            backgroundColor: alpha(ratingColor(rating), 0.08), border: `1px solid ${alpha(ratingColor(rating), 0.25)}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '14px', fontWeight: '900', color: ratingColor(rating), fontFamily: SAIRA,
                          }}>
                            {rating}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{p.name}</div>
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '2px' }}>
                              <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '6px', backgroundColor: alpha(specCol, 0.09), color: specCol, fontWeight: '700', fontFamily: SAIRA }}>
                                {SPECIALTY_LABELS[p.specialty]}
                              </span>
                              <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{p.age}歳</span>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: '9px', color: C.textDim, marginBottom: '2px', fontFamily: SAIRA }}>{fromTeam?.shortName} からのオファー</div>
                            <div style={{ fontSize: '16px', fontWeight: '900', color: C.pink, fontFamily: SAIRA, textShadow: `0 0 12px ${alpha(C.pink, 0.25)}` }}>
                              {fmt(offer.offeredPrice)}
                            </div>
                            <div style={{ fontSize: '8px', color: C.textDim, fontFamily: SAIRA }}>移籍金</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => acceptIncomingOffer(offer.id)}
                            style={{
                              flex: 2, padding: '9px', borderRadius: '11px', border: `2px solid ${C.green}`, marginBottom: 8,
                              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                              color: C.green, fontSize: '12px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                              boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                          >
                            承諾 — {fmt(offer.offeredPrice)}
                          </button>
                          <button
                            onClick={() => counterIncomingOffer(offer.id, Math.round(offer.offeredPrice * 1.3 / 500000) * 500000)}
                            style={{
                              flex: 2, padding: '9px', borderRadius: '11px', border: `2px solid ${C.goldDark}`, marginBottom: 8,
                              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                              color: C.gold, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                              boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                          >
                            カウンター — {fmt(Math.round(offer.offeredPrice * 1.3 / 500000) * 500000)}
                          </button>
                          <button
                            onClick={() => declineIncomingOffer(offer.id)}
                            style={{
                              flex: 1, padding: '9px', borderRadius: '11px', border: `2px solid ${C.red}`, marginBottom: 8,
                              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                              color: C.red, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                              boxShadow: '0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                          >
                            拒否
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {incomingOffers.length === 0 && (
              <div style={{ padding: '10px 12px', borderRadius: '10px', backgroundColor: C.surface2, border: `1px solid ${C.border}`, marginBottom: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '11px', color: C.textGhost, padding: '8px 0', fontFamily: SAIRA }}>現在オファーなし</div>
              </div>
            )}

            <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px', fontFamily: SAIRA }}>
              1軍選手 — 出品管理
            </div>
            {myPlayers.map(p => {
              const specCol = SPEC_COLOR[p.specialty]
              const isListed = listedIds.has(p.id)
              const myListing = listings.find(l => l.playerId === p.id && l.fromTeamId === playerTeamId)
              const val = calcTransferValue(p)
              const stage = careerStage(p)
              const stageCol = CAREER_STAGE_COLOR[stage]
              const competingOffers = (incomingOffers).filter(o => o.playerId === p.id)
              const isSettingPrice = listingPlayerId === p.id
              const isPeakSell = stage === 'peak' && val >= 200_000_000
              return (
                <div key={p.id} style={{ marginBottom: '8px' }}>
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    padding: '10px 12px',
                    borderRadius: isSettingPrice ? '12px 12px 0 0' : '12px',
                    background: isListed
                      ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                      : `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
                    border: `2px solid ${competingOffers.length > 0 ? C.green : isListed ? C.goldDark : isPeakSell ? alpha(C.gold, 0.4) : C.border}`,
                    boxShadow: isListed || competingOffers.length > 0 ? '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                  }}>
                    {(isListed || competingOffers.length > 0) && <div style={{ position: 'absolute', inset: 4, border: `1px solid ${competingOffers.length > 0 ? alpha(C.green, 0.15) : 'rgba(245,200,66,0.15)'}`, borderRadius: 10, pointerEvents: 'none' }} />}
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SAIRA }}>
                              {p.name}
                            </div>
                            {isPeakSell && !isListed && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold, fontWeight: '800', fontFamily: SAIRA, flexShrink: 0 }}>売り時</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '8px', padding: '1px 4px', borderRadius: '5px', backgroundColor: alpha(specCol, 0.08), color: specCol, fontWeight: '700', fontFamily: SAIRA }}>{SPECIALTY_LABELS[p.specialty]}</span>
                            <span style={{ fontSize: '9px', color: C.textDim, fontFamily: SAIRA }}>{p.age}歳</span>
                            <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '4px', backgroundColor: alpha(stageCol, 0.08), color: stageCol, fontWeight: '700', fontFamily: SAIRA }}>{CAREER_STAGE_LABEL[stage]}</span>
                            <span style={{ fontSize: '9px', color: C.textSub, fontFamily: SAIRA }}>{fmt(val)}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                          {myListing ? (
                            <>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9px', color: C.gold, fontFamily: SAIRA }}>出品中 {fmt(myListing.askingPrice)}</div>
                                {competingOffers.length > 0 && (
                                  <div style={{ fontSize: '10px', fontWeight: '800', color: C.green, fontFamily: SAIRA, textShadow: `0 0 8px ${alpha(C.green, 0.4)}` }}>
                                    入札 {competingOffers.length}件！
                                  </div>
                                )}
                              </div>
                              <button onClick={() => delistMyPlayer(p.id)} style={{
                                padding: '5px 9px', borderRadius: '7px',
                                border: `1px solid ${alpha(C.textDim, 0.25)}`, background: 'transparent',
                                color: C.textDim, fontSize: '10px', cursor: 'pointer', fontFamily: SAIRA,
                              }}>取下</button>
                            </>
                          ) : (
                            <button
                              disabled={!window.open}
                              onClick={() => { setListingPlayerId(isSettingPrice ? null : p.id); setListingPrice(Math.round(val * 1.1 / 1000000) * 1000000) }}
                              style={{
                                padding: '6px 10px', borderRadius: '8px',
                                border: !window.open ? `1px solid ${C.border2}` : `2px solid ${C.goldDark}`,
                                background: !window.open ? C.surface2 : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                                color: !window.open ? C.textGhost : C.gold,
                                fontSize: '11px', fontWeight: '700', cursor: window.open ? 'pointer' : 'not-allowed', fontFamily: SAIRA,
                                boxShadow: window.open ? '0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                              }}
                            >
                              出品する
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isSettingPrice && !myListing && (
                    <div style={{ background: C.surface2, border: `1px solid ${C.border2}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 14px' }}>
                      <div style={{ fontSize: '10px', color: C.textSub, marginBottom: '8px', fontFamily: SAIRA }}>
                        希望移籍金 — 市場価値: <span style={{ color: C.gold }}>{fmt(val)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <button onClick={() => setListingPrice(Math.max(1000000, listingPrice - 5000000))} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 16, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>−</button>
                        <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
                          <span style={{ fontSize: '17px', fontWeight: '900', color: C.gold, fontFamily: SAIRA }}>{fmt(listingPrice)}</span>
                        </div>
                        <button onClick={() => setListingPrice(listingPrice + 5000000)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 16, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>＋</button>
                      </div>
                      <input type="range" min={Math.round(val * 0.5 / 1000000) * 1000000} max={Math.round(val * 2.0 / 1000000) * 1000000} step={1000000}
                        value={listingPrice} onChange={e => setListingPrice(Number(e.target.value))}
                        style={{ width: '100%', accentColor: C.gold, marginBottom: '10px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { listMyPlayerForSale(p.id, listingPrice); setListingPlayerId(null) }} style={{
                          flex: 1, padding: '10px', borderRadius: '10px', border: `2px solid ${C.goldDark}`, marginBottom: 8,
                          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                          color: C.gold, fontSize: '12px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                          boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}>
                          出品を確定（次レースで反映）
                        </button>
                        <button onClick={() => setListingPlayerId(null)} style={{ padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: '12px', cursor: 'pointer', fontFamily: SAIRA }}>取消</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {(() => {
              const myPicks = (myTeam?.draftPicks ?? []).filter(pk => pk.year > currentSeason.year)
              const cpuTeamsList = teams.filter(t => t.id !== playerTeamId)
              if (myPicks.length === 0) return null
              return (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px', fontFamily: SAIRA }}>指名権の売却</div>
                  {myPicks.map(pk => {
                    const k = `${pk.year}-R${pk.round}-${pk.pickNumber}`
                    const fairVal = pk.round === 1 ? 25_000_000 : 8_000_000
                    const isSelling = pickSellTarget === k
                    return (
                      <div key={k} style={{ marginBottom: '6px' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 13px',
                          borderRadius: isSelling ? '12px 12px 0 0' : '12px',
                          background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`,
                          border: `1px solid ${isSelling ? alpha(C.blue, 0.35) : C.border2}`,
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{pk.year}年 第{pk.round}巡指名権</div>
                            <div style={{ fontSize: '9px', color: C.textDim, fontFamily: SAIRA }}>参考価値 ≈ {fmt(fairVal)}</div>
                          </div>
                          <button onClick={() => {
                            if (isSelling) { setPickSellTarget(null); setPickSellResult('idle') }
                            else { setPickSellTarget(k); setPickSellPrice(Math.round(fairVal * 0.85 / 1000000) * 1000000); setPickSellTeam(''); setPickSellResult('idle') }
                          }} style={{
                            padding: '6px 10px', borderRadius: '8px',
                            border: `1px solid ${alpha(C.blue, 0.35)}`, background: alpha(C.blue, 0.07),
                            color: C.blue, fontSize: '10px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA, flexShrink: 0,
                          }}>
                            {isSelling ? '閉じる' : '売却する'}
                          </button>
                        </div>
                        {isSelling && (
                          <div style={{ background: C.surface2, border: `1px solid ${alpha(C.blue, 0.18)}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '12px 14px' }}>
                            {pickSellResult === 'success' ? (
                              <div style={{ textAlign: 'center', padding: '10px', color: C.green, fontSize: '12px', fontWeight: '700', fontFamily: SAIRA }}>売却完了！</div>
                            ) : pickSellResult === 'failed' ? (
                              <div style={{ textAlign: 'center', padding: '10px', color: C.red, fontSize: '11px', fontFamily: SAIRA }}>条件が合いませんでした</div>
                            ) : (
                              <>
                                <select value={pickSellTeam} onChange={e => setPickSellTeam(e.target.value)} style={{
                                  width: '100%', padding: '8px', borderRadius: '8px', marginBottom: '10px',
                                  background: C.surface, border: `1px solid ${C.border2}`, color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
                                }}>
                                  <option value="">売却先チームを選択</option>
                                  {cpuTeamsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                  <button onClick={() => setPickSellPrice(Math.max(1000000, pickSellPrice - 1000000))} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 16, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>−</button>
                                  <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
                                    <span style={{ fontSize: '16px', fontWeight: '900', color: C.blue, fontFamily: SAIRA }}>{fmt(pickSellPrice)}</span>
                                  </div>
                                  <button onClick={() => setPickSellPrice(pickSellPrice + 1000000)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 16, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>＋</button>
                                </div>
                                <input type="range" min={1000000} max={Math.round(fairVal * 1.3)} step={1000000}
                                  value={pickSellPrice} onChange={e => setPickSellPrice(Number(e.target.value))}
                                  style={{ width: '100%', accentColor: C.blue, marginBottom: '6px' }}
                                />
                                <div style={{ fontSize: '9px', color: pickSellPrice > fairVal * 1.2 ? C.red : pickSellPrice >= fairVal * 0.7 ? C.gold : C.green, textAlign: 'center', marginBottom: '10px', fontFamily: SAIRA }}>
                                  {pickSellPrice > fairVal * 1.2 ? '高すぎる — 合意困難' : pickSellPrice >= fairVal * 0.85 ? '合意圏内' : '安値 — 合意しやすい'}
                                </div>
                                <button disabled={!pickSellTeam} onClick={() => {
                                  if (!pickSellTeam) return
                                  const ok = sellDraftPick(k, pickSellTeam, pickSellPrice)
                                  setPickSellResult(ok ? 'success' : 'failed')
                                  if (ok) setPickSellTarget(null)
                                }} style={{
                                  width: '100%', padding: '11px', borderRadius: '10px', marginBottom: 8,
                                  border: !pickSellTeam ? `1px solid ${C.border2}` : `2px solid ${alpha(C.blue, 0.5)}`,
                                  background: !pickSellTeam ? C.surface2 : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                                  color: !pickSellTeam ? C.textGhost : C.blue,
                                  fontSize: '12px', fontWeight: '800', cursor: pickSellTeam ? 'pointer' : 'default', fontFamily: SAIRA,
                                  boxShadow: pickSellTeam ? '0 4px 0 #2a3580, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                                }}>
                                  売却する（即時実行）
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )
      })()}

      {tab === 'trade' && (
        <div style={{ padding: '8px 12px' }}>
          {!tradeTarget ? (
            <>
              <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '10px', padding: '0 2px', fontFamily: SAIRA }}>選手トレード — 取引相手チームを選択（国内のみ）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {tradeLeague === 'jpel'
                  ? teams.filter(t => t.id !== playerTeamId).map(t => {
                      const theirMain = t.roster.main.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p)
                      const avgOvr = theirMain.length > 0 ? Math.round(theirMain.reduce((s, p) => s + ovr(p), 0) / theirMain.length) : 0
                      return (
                        <button key={t.id} onClick={() => navigate(`/team/chat?trade=${t.id}`)} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                          padding: '12px 8px', borderRadius: '12px',
                          background: `linear-gradient(160deg, ${alpha(t.colors.primary, 0.18)}, ${alpha(t.colors.primary, 0.06)})`,
                          border: `1px solid ${alpha(t.colors.primary, 0.3)}`,
                          cursor: 'pointer', fontFamily: SAIRA,
                        }}>
                          <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={48} />
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontFamily: SAIRA, lineHeight: 1.2 }}>{t.name}</div>
                            <div style={{ fontSize: '9px', color: C.textDim, marginTop: '2px', fontFamily: SAIRA }}>{t.city}</div>
                          </div>
                          <span style={{ fontSize: '18px', fontWeight: '900', color: ratingColor(avgOvr), fontFamily: SAIRA, lineHeight: 1 }}>{avgOvr}</span>
                        </button>
                      )
                    })
                  : (foreignLeagues.find(l => l.id === tradeLeague)?.clubs ?? []).map(club => {
                      const clubPlayers = players.filter(p => p.teamId === club.id)
                      const avgOvr = clubPlayers.length > 0 ? Math.round(clubPlayers.reduce((s, p) => s + ovr(p), 0) / clubPlayers.length) : 0
                      return (
                        <button key={club.id} onClick={() => resetTrade(club.id)} style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                          padding: '12px 8px', borderRadius: '12px',
                          background: `linear-gradient(160deg, ${alpha(club.colors.primary, 0.18)}, ${alpha(club.colors.primary, 0.06)})`,
                          border: `1px solid ${alpha(club.colors.primary, 0.3)}`,
                          cursor: 'pointer', fontFamily: SAIRA,
                        }}>
                          <TeamLogoSVG primary={club.colors.primary} secondary={club.colors.secondary} shortName={club.shortName} teamId={club.id} size={48} />
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontFamily: SAIRA, lineHeight: 1.2 }}>{club.name}</div>
                            <div style={{ fontSize: '9px', color: C.textDim, marginTop: '2px', fontFamily: SAIRA }}>{NAT_LABELS[club.country] ?? club.country}</div>
                          </div>
                          <span style={{ fontSize: '18px', fontWeight: '900', color: ratingColor(avgOvr), fontFamily: SAIRA, lineHeight: 1 }}>{avgOvr}</span>
                        </button>
                      )
                    })
                }
              </div>
            </>
          ) : (() => {
            const targetTeam = teams.find(t => t.id === tradeTarget)
            const targetForeignClub = targetTeam ? null : foreignLeagues.flatMap(l => l.clubs).find(c => c.id === tradeTarget)
            if (!targetTeam && !targetForeignClub) return null
            const isForeignTrade = !targetTeam
            const targetShortName = targetTeam?.shortName ?? targetForeignClub?.shortName ?? ''
            const theirPlayers = targetTeam
              ? targetTeam.roster.main.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p).sort((a, b) => ovr(b) - ovr(a))
              : players.filter(p => p.teamId === tradeTarget).sort((a, b) => ovr(b) - ovr(a))
            const offeredOvr   = offerIds.reduce((s, id) => { const p = players.find(x => x.id === id); return s + (p ? ovr(p) : 0) }, 0)
            const requestedOvr = requestIds.reduce((s, id) => { const p = players.find(x => x.id === id); return s + (p ? ovr(p) : 0) }, 0)
            const myPicks = (myTeam?.draftPicks ?? []).filter(pk => pk.year > currentSeason.year)
            const theirPicks = isForeignTrade ? [] : (targetTeam!.draftPicks ?? []).filter(pk => pk.year > currentSeason.year)
            const offPickVal = offerPickKeys.reduce((s, k) => { const pk = myPicks.find(p => pickKey(p) === k); return s + (pk ? pickValue(pk.round) : 0) }, 0)
            const reqPickVal = requestPickKeys.reduce((s, k) => { const pk = theirPicks.find(p => pickKey(p) === k); return s + (pk ? pickValue(pk.round) : 0) }, 0)
            const canPropose = (offerIds.length > 0 || offerPickKeys.length > 0) && (requestIds.length > 0 || requestPickKeys.length > 0) && tradeStatus !== 'accepted' && tradeStatus !== 'rejected'
            const isFinalRound = tradeRound >= 3

            return (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <BackButton onClick={() => {
                    if (tradeStep === 1) resetTrade(null)
                    else setTradeStep(s => (s - 1) as 1 | 2 | 3)
                  }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {[1,2,3].map(r => (
                      <div key={r} style={{
                        width: '20px', height: '4px', borderRadius: '2px',
                        backgroundColor: r <= tradeRound ? C.gold : C.border2,
                      }}/>
                    ))}
                    <span style={{ fontSize: '9px', color: C.textDim, marginLeft: '4px', fontFamily: SAIRA }}>第{tradeRound}回交渉</span>
                  </div>
                </div>

                {(tradeStatus === 'accepted' || tradeStatus === 'rejected') && (
                  <div style={{
                    padding: '14px', borderRadius: '12px', marginBottom: '12px', textAlign: 'center',
                    backgroundColor: tradeStatus === 'accepted' ? alpha(C.green, 0.09) : alpha(C.red, 0.09),
                    border: `1px solid ${tradeStatus === 'accepted' ? alpha(C.green, 0.25) : alpha(C.red, 0.25)}`,
                  }}>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: tradeStatus === 'accepted' ? C.green : C.red, marginBottom: '4px', fontFamily: SAIRA }}>
                      {tradeStatus === 'accepted' ? 'トレード成立！' : '交渉決裂'}
                    </div>
                    <div style={{ fontSize: '11px', color: C.textSub, fontFamily: SAIRA }}>{counterMsg}</div>
                  </div>
                )}

                {tradeStatus === 'countered' && (
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    padding: '14px', borderRadius: '14px', marginBottom: '12px',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `2px solid ${alpha(C.gold, 0.4)}`,
                    boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
                  }}>
                    <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '6px', fontFamily: SAIRA }}>
                        {targetShortName}からのカウンター
                      </div>
                      <div style={{ fontSize: '12px', color: C.text, marginBottom: '10px', lineHeight: 1.5, fontFamily: SAIRA }}>
                        {counterMsg}
                      </div>
                      <div style={{
                        padding: '8px 12px', borderRadius: '8px', backgroundColor: C.surface,
                        border: `1px solid ${C.border2}`, marginBottom: '10px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                        <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>要求移籍金</span>
                        <span style={{ fontSize: '16px', fontWeight: '900', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 12px ${alpha(C.gold, 0.25)}` }}>
                          {fmt(counterFee)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={handleAcceptCounter} style={{
                          flex: 1, padding: '10px', borderRadius: '11px', border: `2px solid ${C.green}`, marginBottom: 8,
                          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                          color: C.green, fontSize: '12px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                          boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}>
                          受け入れる ({fmt(counterFee)})
                        </button>
                        {!isFinalRound && (
                          <button onClick={handleReNegotiate} style={{
                            flex: 1, padding: '10px', borderRadius: '11px',
                            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                            border: `2px solid ${alpha(C.gold, 0.4)}`,
                            color: C.gold, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                            marginBottom: 8,
                            boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                          }}>
                            再交渉する
                          </button>
                        )}
                        <button onClick={() => setTradeStatus('rejected')} style={{
                          padding: '10px 12px', borderRadius: '11px',
                          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                          border: `2px solid ${C.red}`,
                          color: C.red, fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                          marginBottom: 8,
                          boxShadow: '0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                        }}>
                          拒否
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {tradeStatus !== 'accepted' && (
                  <>
                    {(() => {
                      const playerCard = (p: Player, sel: boolean, accentColor: string, onClick: () => void) => (
                        <button key={p.id} onClick={onClick} style={{
                          width: '100%', padding: '10px 12px', borderRadius: '10px', marginBottom: '5px', textAlign: 'left', cursor: 'pointer', fontFamily: SAIRA,
                          background: sel ? alpha(accentColor, 0.12) : C.surface2,
                          border: `1px solid ${sel ? alpha(accentColor, 0.5) : C.border2}`,
                          borderLeft: `4px solid ${sel ? accentColor : alpha(SPEC_COLOR[p.specialty] ?? C.border2, 0.6)}`,
                          display: 'flex', alignItems: 'center', gap: '10px',
                        }}>
                          <PlayerFace playerId={p.id} nationality={p.nationality} size={38} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SAIRA }}>{p.name}</div>
                              <span style={{ fontSize: '18px', fontWeight: '900', color: ratingColor(ovr(p)), fontFamily: SAIRA, marginLeft: '8px', flexShrink: 0 }}>{ovr(p)}</span>
                            </div>
                            <div style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{p.age}歳 • {fmt(p.contract.annualSalary)}/年 • 残{p.contract.yearsLeft}年</div>
                            <div style={{ fontSize: '10px', color: C.gold, fontFamily: SAIRA }}>移籍価値 {fmt(calcTransferValue(p))}</div>
                          </div>
                          {sel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
                        </button>
                      )
                      const pickCard = (pk: typeof myPicks[0], sel: boolean, accentColor: string, onClick: () => void) => (
                        <button key={pickKey(pk)} onClick={onClick} style={{
                          width: '100%', padding: '10px 12px', borderRadius: '10px', marginBottom: '5px', textAlign: 'left', cursor: 'pointer', fontFamily: SAIRA,
                          background: sel ? alpha(accentColor, 0.12) : C.surface2,
                          border: `1px solid ${sel ? alpha(accentColor, 0.5) : C.border2}`,
                          borderLeft: `4px solid ${sel ? accentColor : C.blue}`,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '700', color: C.blue, fontFamily: SAIRA }}>{pk.year}年 第{pk.round}巡指名権</div>
                            <div style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>参考価値 ≈ {fmt(pickValue(pk.round))}</div>
                          </div>
                          {sel && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: accentColor, flexShrink: 0 }} />}
                        </button>
                      )

                      if (tradeStep === 1) return (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: 8 }}>
                            <div style={{ fontSize: '10px', color: C.green, letterSpacing: '2px', fontFamily: SAIRA }}>
                              STEP 1 — {targetShortName}から選ぶ
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={tradeTier} onChange={e => setTradeTier(e.target.value as typeof tradeTier)} style={{ ...selectStyle }}>
                                <option value="all">全登録</option>
                                <option value="main">1軍</option>
                                <option value="second">2軍</option>
                              </select>
                              <select value={filterSpec} onChange={e => setFilterSpec(e.target.value as Specialty | 'all')} style={{ ...selectStyle }}>
                                <option value="all">全タイプ</option>
                                {(['ace','sprinter','long','mountain_up','mountain_down','allrounder','kick','grinder'] as const).map(s => (
                                  <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {theirPlayers.filter(p => (filterSpec === 'all' || p.specialty === filterSpec) && (tradeTier === 'all' || p.rosterTier === tradeTier)).map(p => playerCard(p, requestIds.includes(p.id), C.green, () => { setRequestIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]); setTradeStatus('idle') }))}
                          {!isForeignTrade && theirPicks.map(pk => pickCard(pk, requestPickKeys.includes(pickKey(pk)), C.green, () => { const k = pickKey(pk); setRequestPickKeys(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]); setTradeStatus('idle') }))}
                          <button onClick={() => setTradeStep(2)} style={{
                            width: '100%', padding: '13px', borderRadius: '11px', marginTop: '6px',
                            position: 'sticky', bottom: '12px', zIndex: 5,
                            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                            border: `2px solid ${alpha(C.green, 0.5)}`,
                            color: C.green, fontSize: '13px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                            boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.4)',
                          }}>
                            次へ — 提供する選手を選ぶ
                            {(requestIds.length > 0 || requestPickKeys.length > 0) && <span style={{ marginLeft: '8px', fontSize: '11px', color: C.gold }}>{requestIds.length + requestPickKeys.length}件選択中</span>}
                          </button>
                        </div>
                      )

                      if (tradeStep === 2) return (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: 8 }}>
                            <div style={{ fontSize: '10px', color: C.red, letterSpacing: '2px', fontFamily: SAIRA }}>
                              STEP 2 — 自チームから選ぶ
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={tradeTier} onChange={e => setTradeTier(e.target.value as typeof tradeTier)} style={{ ...selectStyle }}>
                                <option value="all">全登録</option>
                                <option value="main">1軍</option>
                                <option value="second">2軍</option>
                              </select>
                              <select value={filterSpec} onChange={e => setFilterSpec(e.target.value as Specialty | 'all')} style={{ ...selectStyle }}>
                                <option value="all">全タイプ</option>
                                {(['ace','sprinter','long','mountain_up','mountain_down','allrounder','kick','grinder'] as const).map(s => (
                                  <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {myPlayers.filter(p => (filterSpec === 'all' || p.specialty === filterSpec) && (tradeTier === 'all' || p.rosterTier === tradeTier)).map(p => playerCard(p, offerIds.includes(p.id), C.red, () => { setOfferIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]); setTradeStatus('idle') }))}
                          {!isForeignTrade && myPicks.map(pk => pickCard(pk, offerPickKeys.includes(pickKey(pk)), C.red, () => { const k = pickKey(pk); setOfferPickKeys(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]); setTradeStatus('idle') }))}
                          <button disabled={offerIds.length === 0 && offerPickKeys.length === 0} onClick={() => setTradeStep(3)} style={{
                            width: '100%', padding: '13px', borderRadius: '11px', marginTop: '6px',
                            position: 'sticky', bottom: '12px', zIndex: 5,
                            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                            border: `2px solid ${offerIds.length > 0 || offerPickKeys.length > 0 ? alpha(C.gold, 0.5) : C.border2}`,
                            color: offerIds.length > 0 || offerPickKeys.length > 0 ? C.gold : C.textGhost,
                            fontSize: '13px', fontWeight: '800', cursor: offerIds.length > 0 || offerPickKeys.length > 0 ? 'pointer' : 'default', fontFamily: SAIRA,
                            boxShadow: offerIds.length > 0 || offerPickKeys.length > 0 ? '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4)' : 'none',
                          }}>
                            次へ — 条件を確認する
                            {(offerIds.length > 0 || offerPickKeys.length > 0) && <span style={{ marginLeft: '8px', fontSize: '11px', color: C.gold }}>{offerIds.length + offerPickKeys.length}件選択中</span>}
                          </button>
                        </div>
                      )

                      // Step 3: 確認・移籍金・提案
                      return (
                        <div>
                          <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '10px', fontFamily: SAIRA }}>STEP 3 — 交換内容の確認・移籍金</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '8px', marginBottom: '12px', alignItems: 'start' }}>
                            <div style={{ padding: '10px', borderRadius: '10px', background: alpha(C.green, 0.07), border: `1px solid ${alpha(C.green, 0.2)}` }}>
                              <div style={{ fontSize: '8px', color: C.green, letterSpacing: '2px', marginBottom: '6px', fontFamily: SAIRA }}>もらう — {targetShortName}</div>
                              {requestIds.map(id => { const p = players.find(x => x.id === id); if (!p) return null; return <div key={id} style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: '2px' }}>{p.name} <span style={{ color: ratingColor(ovr(p)) }}>{ovr(p)}</span></div> })}
                              {requestPickKeys.map(k => <div key={k} style={{ fontSize: '10px', color: C.blue, fontFamily: SAIRA }}>{k.replace(/-R(\d+)-\d+$/, '年 第$1巡指名権')}</div>)}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: '22px', color: C.gold, fontSize: '18px', fontWeight: '900', fontFamily: SAIRA }}>
                              ⇄
                            </div>
                            <div style={{ padding: '10px', borderRadius: '10px', background: alpha(C.red, 0.07), border: `1px solid ${alpha(C.red, 0.2)}` }}>
                              <div style={{ fontSize: '8px', color: C.red, letterSpacing: '2px', marginBottom: '6px', fontFamily: SAIRA }}>出す — {myTeam.shortName}</div>
                              {offerIds.map(id => { const p = players.find(x => x.id === id); if (!p) return null; return <div key={id} style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: '2px' }}>{p.name} <span style={{ color: ratingColor(ovr(p)) }}>{ovr(p)}</span></div> })}
                              {offerPickKeys.map(k => <div key={k} style={{ fontSize: '10px', color: C.blue, fontFamily: SAIRA }}>{k.replace(/-R(\d+)-\d+$/, '年 第$1巡指名権')}</div>)}
                            </div>
                          </div>
                          <div style={{ padding: '12px 14px', borderRadius: '12px', background: `linear-gradient(180deg, ${C.surface2}, ${C.surface})`, border: `1px solid ${C.border2}`, marginBottom: '10px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '10px', color: C.textDim, letterSpacing: '1px', fontFamily: SAIRA }}>移籍金調整</span>
                              <span style={{ fontSize: '13px', fontWeight: '800', fontFamily: SAIRA, color: tradeFee > 0 ? C.red : tradeFee < 0 ? C.green : C.textDim }}>
                                {tradeFee === 0 ? 'なし' : tradeFee > 0 ? `${myTeam.shortName}支払 ${fmt(tradeFee)}` : `${myTeam.shortName}受取 ${fmt(-tradeFee)}`}
                              </span>
                            </div>
                            <input type="range" min={-50000000} max={50000000} step={1000000} value={tradeFee}
                              onChange={e => { setTradeFee(Number(e.target.value)); setTradeStatus('idle') }}
                              style={{ width: '100%', accentColor: tradeFee >= 0 ? C.red : C.green }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: C.textGhost, marginTop: '2px', fontFamily: SAIRA }}>
                              <span>{myTeam.shortName}受取 5000万</span><span>{myTeam.shortName}支払 5000万</span>
                            </div>
                            {(() => {
                              const ovrDiff = (requestedOvr - offeredOvr) * 4_000_000
                              const netContrib = tradeFee + offPickVal - reqPickVal
                              const counterpartGain = netContrib - ovrDiff
                              const tolerance = tradeRound === 1 ? 3_000_000 : tradeRound === 2 ? 8_000_000 : 16_000_000
                              const isOk = counterpartGain >= -tolerance
                              const shortage = Math.ceil((-counterpartGain - tolerance) / 1_000_000) * 1_000_000
                              const color = isOk ? C.green : shortage <= 20_000_000 ? C.gold : C.red
                              const label = isOk ? '合意圏内' : `あと${fmt(shortage)}不足`
                              return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: `1px solid ${C.border}` }}>
                                <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>相手から見た評価</span>
                                <span style={{ fontSize: '11px', fontWeight: '700', color, fontFamily: SAIRA }}>{label}</span>
                              </div>
                            })()}
                          </div>
                          <button
                            disabled={!canPropose}
                            onClick={() => handlePropose(offeredOvr, requestedOvr, offPickVal, reqPickVal)}
                            style={{
                              width: '100%', padding: '14px', borderRadius: '11px', marginTop: 8, marginBottom: 8,
                              border: canPropose ? `2px solid ${C.goldDark}` : `1px solid ${C.border2}`,
                              background: canPropose ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : C.surface2,
                              color: canPropose ? C.gold : C.textGhost,
                              fontSize: '14px', fontWeight: '900',
                              cursor: canPropose ? 'pointer' : 'default',
                              fontFamily: SAIRA,
                              boxShadow: canPropose ? '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)' : 'none',
                              textShadow: canPropose ? `0 0 12px ${alpha(C.gold, 0.25)}` : 'none',
                            }}
                          >
                            {isFinalRound ? '最終提案する' : 'トレードを提案する'}
                          </button>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
