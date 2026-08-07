import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { squadPlayersOf } from '../../utils/rosterSync'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import type { Specialty, Nationality } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, seasonAppearances, isDataKeyPlayer } from '../../utils/playerUtils'
import SortSelect from '../ui/SortSelect'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerRow from '../player/PlayerRow'
import ActionSheet from '../ui/ActionSheet'
import BidSheet from './BidSheet'
import LoanSheet from './LoanSheet'
import { getMarketFilters, saveMarketFilters } from '../../utils/marketFilters'
import { canBePoached } from '../../utils/transferEligibility'
import { useOfferResults } from './useOfferResults'
import { OfferResultList } from './OfferResultList'
import { draftPickValue, roundFee, COUNTER_OFFER_CAP } from '../../data/economy'
import { NAT_LABEL as NAT_LABELS } from '../../data/nationalities'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { C, alpha } from '../../styles/tokens'
import { fmtYen } from '../../utils/money'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const MARKET_SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'value', label: PLAYER_SORT_LABEL.value },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
  { value: 'salary', label: PLAYER_SORT_LABEL.salary },
  { value: 'name', label: PLAYER_SORT_LABEL.name },
]

type Tab = 'market' | 'market-results' | 'trade' | 'listings'

export default function TransferPage() {
  const {
    teams, players, playerTeamId, currentSeason, foreignLeagues,
    ensureFuturePicks, startAcquisitionOffer,
    submitTransferBid, submitLoanRequest,
    acceptIncomingOffer, declineIncomingOffer,
    counterIncomingOffer,
    listMyPlayerForSale, delistMyPlayer, sellDraftPick,

  } = useGameStore()
  const clubIndex = useClubIndex()
  const starredOpponents = useGameStore(s => s.starredOpponents) ?? []
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

  // 戻ってきたときに絞り込みを復元する。useEffect でやると復元前の1フレームだけ
  // **絞り込み無しの全選手**が出てちらつくので、描画中に直す（Reactの標準の形）
  const [restoredNavKey, setRestoredNavKey] = useState<string | null>(null)
  if (tab === 'market' && restoredNavKey !== location.key) {
    setRestoredNavKey(location.key)
    const s = location.state as { search?: string; spec?: Specialty | 'all'; nat?: Nationality | 'all'; avail?: 'all' | 'listed' | 'expiring'; team?: string; age?: string; league?: string } | null
    if (s && typeof s.search === 'string') {
      setMktSearch(s.search)
      setMktSpec(s.spec ?? 'all')
      setMktNat(s.nat ?? 'all')
      setMktAvail(s.avail ?? 'all')
      setMktTeam(s.team ?? 'all')
      setMktAge(s.age ?? 'all')
      setMktLeague(s.league ?? 'all')
    }
  }
  const [mktSortKey, setMktSortKey] = useState<PlayerSortKey>(savedF.sortKey as PlayerSortKey)
  const [mktSortDir, setMktSortDir] = useState<'desc' | 'asc'>(savedF.sortDir as 'desc' | 'asc')
  // フィルタ変更をモジュールスコープへ同期（アンマウント後の復元用）
  useEffect(() => {
    saveMarketFilters({ search: mktSearch, spec: mktSpec, nat: mktNat, avail: mktAvail, team: mktTeam, age: mktAge, league: mktLeague, sortKey: mktSortKey, sortDir: mktSortDir })
  }, [mktSearch, mktSpec, mktNat, mktAvail, mktTeam, mktAge, mktLeague, mktSortKey, mktSortDir])
  const [bidTarget, setBidTarget] = useState<string | null>(null)
  // 移籍市場カード：タップ＝ボトムシートメニュー / 長押し＝選手詳細
  const [menuPlayerId, setMenuPlayerId] = useState<string | null>(null)
  const [loanTarget, setLoanTarget] = useState<string | null>(null)
  const lpRef = useRef<{ t?: number; long: boolean }>({ long: false })

  const [listingPlayerId, setListingPlayerId] = useState<string | null>(null)
  const [listingPrice, setListingPrice] = useState<number>(0)
  const [pickSellTarget, setPickSellTarget] = useState<string | null>(null)
  const [pickSellTeam, setPickSellTeam] = useState<string>('')
  const [pickSellPrice, setPickSellPrice] = useState<number>(0)
  const [pickSellResult, setPickSellResult] = useState<'idle' | 'success' | 'failed'>('idle')
  // 被オファー対応の結果（オファーはストアから消えるため、ここで結果を見せて確認で消す）。
  // 状態も見た目も OfferResultList の1本（チャット画面・オファー一覧と同じもの）
  const { results: offerResults, push: pushOfferResult, dismiss: dismissOfferResult } = useOfferResults()


  const myTeam = teams.find(t => t.id === playerTeamId)
  if (!myTeam) return null

  // 補強不可判定（reinforcementBannedと同基準）：3シーズン連続赤字、または残高マイナスの間は新規補強不可
  const signingBanned = (myTeam.finance.deficitStreak ?? 0) >= 3 || myTeam.finance.budget < 0

  // 移籍市場カードの押下：タップ＝メニュー / 長押し(450ms)＝選手詳細。
  const rowHandlers = (pid: string) => ({
    onPointerDown: () => { lpRef.current.long = false; lpRef.current.t = setTimeout(() => { lpRef.current.long = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lpRef.current.t) { clearTimeout(lpRef.current.t); lpRef.current.t = undefined } },
    onPointerLeave: () => { if (lpRef.current.t) { clearTimeout(lpRef.current.t); lpRef.current.t = undefined } },
    onPointerMove: () => { if (lpRef.current.t) { clearTimeout(lpRef.current.t); lpRef.current.t = undefined } },
    onClick: () => { if (lpRef.current.long) { lpRef.current.long = false; return } setMenuPlayerId(pid) },
  })

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')
    .sort(comparePlayers('ovr'))

  const salaryUsed = myPlayers.reduce((sum, p) => sum + p.contract.annualSalary, 0)


  const tabTitle = tab === 'market' ? '移籍市場' : tab === 'market-results' ? '検索結果' : tab === 'listings' ? '出品管理' : 'トレード'

  return (
    <div style={{ paddingTop: '4px', paddingBottom: '80px', fontFamily: SAIRA }}>
      <div style={{ padding: '10px 16px 12px' }}>
        <BackButton />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div style={{ fontSize: '20px', fontWeight: '900', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 16px ${alpha(C.gold, 0.25)}` }}>
            {tabTitle}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: C.green }}/>
            <span style={{ fontSize: '10px', fontWeight: '700', color: C.green, fontFamily: SAIRA }}>
              OPEN
            </span>
            <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>{fmtYen(salaryUsed)}</span>
          </div>
        </div>
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
                    {SPECIALTIES.map(s => (
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

        // 一覧に出す＝入札できる、なので判定は入札と同じものを使う（utils/transferEligibility.ts）。
        // ここに判定が無く、レンタルで貸している自分の選手や、よそが借りている選手まで
        // 「所属＝貸出先クラブ」の顔で並んでいて、そのまま買えてしまっていた。
        // FA（teamId が空）は保有クラブが無いので判定の対象外
        const marketPlayers = players
          .filter(p => p.teamId !== playerTeamId && p.status === 'active')
          .filter(p => p.teamId === '' || canBePoached(p, { teamId: p.teamId, currentYear: currentSeason.year }))
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
              const frac = tr > 0 ? apps / tr : 0.5
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
          .sort(comparePlayers(mktSortKey, mktSortDir))


        return (
          <div style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', color: C.textGhost, fontFamily: SAIRA }}>{marketPlayers.length}名</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SortSelect options={MARKET_SORT_OPTIONS} value={mktSortKey} onChange={setMktSortKey} />
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
            {/* ロスターと同じカード：タップ＝メニュー / 長押し＝詳細 */}
            <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {marketPlayers.map(p => {
              const isListed = listedIds.has(p.id)
              const hasBid = activeBids.some(b => b.playerId === p.id)
              const bidLocked = p.transferLockedUntilYear != null && currentSeason.year < p.transferLockedUntilYear
              const ownerTeam = clubIndex.byId(p.teamId)
              const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 8, padding: '1px 5px', borderRadius: 3, fontWeight: 700, flexShrink: 0 }
              return (
                <div key={p.id} style={{ opacity: bidLocked ? 0.5 : 1 }}>
                  <PlayerRow
                    player={p}
                    handlers={rowHandlers(p.id)}
                    extra={
                      <>
                        <span style={{ ...badge, backgroundColor: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.25)}`, color: C.textSub }}>
                          {ownerTeam && <TeamLogoSVG primary={ownerTeam.colors.primary} secondary={ownerTeam.colors.secondary} shortName={ownerTeam.shortName} teamId={ownerTeam.id} size={11} />}
                          {clubIndex.byId(p.teamId)?.shortName ?? '未所属'}
                        </span>
                        {isListed && <span style={{ ...badge, backgroundColor: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold }}>出品中</span>}
                        {hasBid && <span style={{ ...badge, backgroundColor: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold }}>入札中</span>}
                        {bidLocked && <span style={{ ...badge, backgroundColor: alpha(C.red, 0.08), border: `1px solid ${alpha(C.red, 0.25)}`, color: C.red }}>交渉不可</span>}
                      </>
                    }
                  />
                </div>
              )
            })}
            </div>

            {/* タップメニュー（ロスターと同じ操作系） */}
            {(() => {
              const mp = menuPlayerId ? players.find(x => x.id === menuPlayerId) : undefined
              if (!mp) return null
              const isFA = mp.teamId === ''
              const mHasBid = activeBids.some(b => b.playerId === mp.id)
              const mLocked = mp.transferLockedUntilYear != null && currentSeason.year < mp.transferLockedUntilYear
              const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
              const reqPending = (currentSeason.loanRequests ?? []).some(r => r.playerId === mp.id)
              const mVal = calcTransferValue(mp)
              const isStarred = starredOpponents.includes(mp.id)
              const items: { label: string; disabled?: boolean; color?: string; onClick: () => void }[] = isFA ? [
                { label: signingBanned ? '赤字で補強不可' : mLocked ? '退団直後・来季まで交渉不可' : '契約オファー', disabled: signingBanned || mLocked, color: C.green, onClick: () => { setMenuPlayerId(null); startAcquisitionOffer(mp.id, 'fa'); navigate(`/team/chat?player=${mp.id}`) } },
                { label: isStarred ? 'ウォッチリストから外す' : 'ウォッチリストに追加', onClick: () => { toggleStarOpponent(mp.id); setMenuPlayerId(null) } },
              ] : [
                { label: mHasBid ? '入札中' : mLocked ? '来季まで交渉不可' : '入札して獲得', disabled: mHasBid || mLocked, color: C.gold, onClick: () => { setMenuPlayerId(null); setBidTarget(mp.id) } },
                { label: reqPending ? 'レンタル要請中' : slots >= 3 ? 'レンタル枠が満杯（3/3）' : 'レンタルで借りる', disabled: reqPending || slots >= 3, color: C.blue, onClick: () => { setMenuPlayerId(null); setLoanTarget(mp.id) } },
                { label: isStarred ? 'ウォッチリストから外す' : 'ウォッチリストに追加', onClick: () => { toggleStarOpponent(mp.id); setMenuPlayerId(null) } },
              ]
              return (
                <ActionSheet
                  open={!!mp}
                  onClose={() => setMenuPlayerId(null)}
                  header={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        <PlayerFace playerId={mp.id} nationality={mp.nationality} size={44} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{mp.name}</div>
                        <div style={{ fontSize: 10, color: C.textDim }}>{SPECIALTY_LABELS[mp.specialty]} · {mp.age}歳 · {clubIndex.byId(mp.teamId)?.shortName ?? '未所属'}</div>
                        <div style={{ fontSize: 10, color: C.textSub, marginTop: 2, fontFamily: SAIRA }}>価値 <span style={{ color: C.gold }}>{fmtYen(mVal)}</span> 年俸 {fmtYen(mp.contract.annualSalary)}</div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(ovr(mp)) }}>{ovr(mp)}</div>
                    </div>
                  }
                  items={items}
                />
              )
            })()}

            {/* 入札シート（成立確率つき）— 他チームタブと共通 */}
            {bidTarget && (() => {
              const bp = players.find(x => x.id === bidTarget)
              if (!bp) return null
              const bListing = listings.find(l => l.playerId === bp.id)
              return <BidSheet player={bp} budget={myTeam.finance.budget} listing={bListing} onSubmit={fee => { submitTransferBid(bp.id, fee); setBidTarget(null) }} onClose={() => setBidTarget(null)} />
            })()}

            {/* レンタルシート — 他チームタブと共通 */}
            {loanTarget && (() => {
              const rp = players.find(x => x.id === loanTarget)
              if (!rp) return null
              const slots = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length
              const pending = (currentSeason.loanRequests ?? []).some(r => r.playerId === rp.id)
              return <LoanSheet player={rp} slots={slots} pending={pending} onSubmit={y => { submitLoanRequest(rp.id, y); setLoanTarget(null) }} onClose={() => setLoanTarget(null)} />
            })()}
          </div>
        )
      })()}


      {tab === 'listings' && (() => {
        // フリー移籍の接触（offeredPrice=0）はGMが対応できないため対応カードから除外（通知ページで情報表示）
        const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice > 0)
        const listings = currentSeason.transferListings ?? []
        const listedIds = new Set(listings.map(l => l.playerId))

        return (
          <div style={{ padding: '0 12px' }}>
            {(incomingOffers.length > 0 || offerResults.length > 0) && (
              <div style={{ marginBottom: '14px' }}>
                {/* 返事の結果だけが残っている状態では見出しを出さない（「0件 — 要確認」と出ていた） */}
                {incomingOffers.length > 0 && (
                  <div style={{ fontSize: '9px', color: C.pink, letterSpacing: '2px', marginBottom: '8px', fontWeight: '700', fontFamily: SAIRA }}>
                    他クラブからのオファー {incomingOffers.length}件 — 要確認
                  </div>
                )}
                <OfferResultList results={offerResults} dismiss={dismissOfferResult} />
                {incomingOffers.map(offer => {
                  const p = players.find(pl => pl.id === offer.playerId)
                  // 海外クラブからのオファーもあるため、国内チーム→海外クラブの順で名前を解決する
                  const offerFrom = clubIndex.byId(offer.fromTeamId)?.shortName ?? '他クラブ'
                  if (!p) return null
                  const rating = ovr(p)
                  const specCol = SPEC_COLOR[p.specialty]
                  // 移籍金0＝契約満了間近の選手へのフリー移籍オファー
                  const isFreeOffer = offer.offeredPrice === 0
                  // フリー移籍へのカウンターは市場価値ベース（0×1.3=0を出さない）
                  const counterPrice = roundFee(isFreeOffer ? calcTransferValue(p) : offer.offeredPrice * COUNTER_OFFER_CAP)
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
                            <div style={{ fontSize: '9px', color: C.textDim, marginBottom: '2px', fontFamily: SAIRA }}>{offerFrom} からのオファー</div>
                            <div style={{ fontSize: isFreeOffer ? '12px' : '16px', fontWeight: '900', color: isFreeOffer ? C.textSub : C.pink, fontFamily: SAIRA, textShadow: isFreeOffer ? 'none' : `0 0 12px ${alpha(C.pink, 0.25)}` }}>
                              {isFreeOffer ? 'フリー移籍' : fmtYen(offer.offeredPrice)}
                            </div>
                            <div style={{ fontSize: '8px', color: C.textDim, fontFamily: SAIRA }}>{isFreeOffer ? '移籍金なし' : '移籍金'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => {
                              // 結果の文章は OfferResultList の1本。チャット画面と同じ言葉が出る
                              pushOfferResult(offer.id, acceptIncomingOffer(offer.id), { playerName: p.name, teamName: offerFrom, price: offer.offeredPrice })
                            }}
                            style={{
                              flex: 2, padding: '9px', borderRadius: '11px', border: `2px solid ${C.green}`, marginBottom: 8,
                              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                              color: C.green, fontSize: '12px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                              boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                          >
                            {isFreeOffer ? '承諾 — フリー移籍' : `承諾 — ${fmtYen(offer.offeredPrice)}`}
                          </button>
                          <button
                            onClick={() => {
                              pushOfferResult(offer.id, counterIncomingOffer(offer.id, counterPrice), { playerName: p.name, teamName: offerFrom, price: counterPrice })
                            }}
                            style={{
                              flex: 2, padding: '9px', borderRadius: '11px', border: `2px solid ${C.goldDark}`, marginBottom: 8,
                              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                              color: C.gold, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                              boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                            }}
                          >
                            カウンター — {fmtYen(counterPrice)}
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
                            <span style={{ fontSize: '9px', color: C.textSub, fontFamily: SAIRA }}>{fmtYen(val)}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                          {myListing ? (
                            <>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9px', color: C.gold, fontFamily: SAIRA }}>出品中 {fmtYen(myListing.askingPrice)}</div>
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
                              onClick={() => { setListingPlayerId(isSettingPrice ? null : p.id); setListingPrice(Math.round(val * 1.1 / 1000000) * 1000000) }}
                              style={{
                                padding: '6px 10px', borderRadius: '8px',
                                border: `2px solid ${C.goldDark}`,
                                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                                color: C.gold,
                                fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                                boxShadow: '0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.06)',
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
                        希望移籍金 — 市場価値: <span style={{ color: C.gold }}>{fmtYen(val)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <button onClick={() => setListingPrice(Math.max(1000000, listingPrice - 5000000))} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 16, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>−</button>
                        <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: '8px' }}>
                          <span style={{ fontSize: '17px', fontWeight: '900', color: C.gold, fontFamily: SAIRA }}>{fmtYen(listingPrice)}</span>
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
                          出品を確定
                        </button>
                        <button onClick={() => setListingPlayerId(null)} style={{ padding: '10px 12px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textDim, fontSize: '12px', cursor: 'pointer', fontFamily: SAIRA }}>取消</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {(() => {
              // 直近オフに使う指名権(今シーズン+1)は売却不可。2シーズン以上先の未来指名権のみ売れる。
              const myPicks = (myTeam?.draftPicks ?? []).filter(pk => pk.year > currentSeason.year + 1)
              const cpuTeamsList = teams.filter(t => t.id !== playerTeamId)
              if (myPicks.length === 0) return null
              return (
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px', fontFamily: SAIRA }}>指名権の売却</div>
                  {myPicks.map(pk => {
                    const k = `${pk.year}-R${pk.round}-${pk.pickNumber}`
                    const fairVal = draftPickValue(pk.round, pk.pickNumber)
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
                            <div style={{ fontSize: '9px', color: C.textDim, fontFamily: SAIRA }}>指名順位は{pk.year}年の成績で確定 · 参考価値 ≈ {fmtYen(fairVal)}</div>
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
                                    <span style={{ fontSize: '16px', fontWeight: '900', color: C.blue, fontFamily: SAIRA }}>{fmtYen(pickSellPrice)}</span>
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
              <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '10px', padding: '0 2px', fontFamily: SAIRA }}>選手トレード — 取引相手チームを選択（国内のみ）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  {teams.filter(t => t.id !== playerTeamId).map(t => {
                      // 所属は player.teamId が正（rosterSync）。roster配列だとズレたチームの平均OVRが狂う
                      const theirMain = squadPlayersOf(players, t.id)
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
                }
              </div>
        </div>
      )}
    </div>
  )
}
