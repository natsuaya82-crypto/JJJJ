import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { squadPlayersOf } from '../../utils/rosterSync'
import PageHeader from '../ui/PageHeader'
import GlassButton from '../ui/GlassButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import type { Specialty, Nationality } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, calcTransferValue, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, isDataKeyPlayer } from '../../utils/playerUtils'
import { playRateOf, prevSeasonOf } from '../../utils/playRate'
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
// 入札・レンタルを出せるか（store が受け付けるかと同じ1本）
import { bidBlockReason, loanBlockReason } from '../../utils/bidGate'
import { useOfferResults } from './useOfferResults'
import { OfferResultList } from './OfferResultList'
import { draftPickValue, reinforcementBanned, roundFee, COUNTER_OFFER_CAP } from '../../data/economy'
import { NAT_LABEL as NAT_LABELS } from '../../data/nationalities'
import { SPECIALTIES } from '../../utils/squadNeeds'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { fmtYen } from '../../utils/money'
import { offersAwaitingReply } from '../../utils/notifItems'
import { SpecChip } from '../player/PlayerChips'
import PlayerList from '../player/PlayerList'

const MARKET_SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'value', label: PLAYER_SORT_LABEL.value },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
  { value: 'salary', label: PLAYER_SORT_LABEL.salary },
  { value: 'name', label: PLAYER_SORT_LABEL.name },
]

type Tab = 'market' | 'market-results' | 'trade' | 'listings'

/** 検索結果を一度に出す件数。足りなければ「もっと見る」で100件ずつ増える */
const MARKET_PAGE = 100

export default function TransferPage() {
  const {
    teams, players, playerTeamId, currentSeason, foreignLeagues, pastSeasons,
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
  /**
   * **一度に出す件数。**（オーナー・2026-08-20「aにしよう / 100件ずつ出るように」）
   *
   * ★何も選ばずに検索すると、**世界の5,775人ぶんの行を一度に描いて**いた
   *   （世界5,800人 − 自チーム）。上限も、映っているぶんだけ描く仕組みも無い。
   *   実機ではメモリが尽きて**WebViewごと読み直され、タイトル画面に戻る**
   *   （テスターの報告・2026-08-20「とても重くなってスクロールが上手くできなかったり、
   *   タイトルに戻る」）。ブラウザのプレビューでは再現しにくい。
   */
  const [mktShown, setMktShown] = useState(MARKET_PAGE)
  // 絞り込みや並べ替えを変えたら先頭に戻す（前の続きから100件、にしない）
  useEffect(() => { setMktShown(MARKET_PAGE) }, [location.key, mktSortKey, mktSortDir])
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

  // 補強不可は data/economy の reinforcementBanned 1本。**同じ式をここに書き写さないこと**
  // （写しがあったせいで、入札の枝だけ赤字ペナルティを見ていなかった）
  const signingBanned = reinforcementBanned(myTeam)

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
      <PageHeader
        title={tabTitle}
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0 }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: C.green }}/>
            <span style={{ fontSize: F.caption, fontWeight: '800', color: C.green, fontFamily: SAIRA, letterSpacing: '1px' }}>
              OPEN
            </span>
            <span style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA }}>{fmtYen(salaryUsed)}</span>
          </div>
        }
      />

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

        // 枠で囲まない。下の細い線と文字だけで組む（レート戦・ロスターと同じ）
        const cell: React.CSSProperties = {
          padding: '4px 2px 7px', minWidth: 0,
          borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
        }
        const lbl: React.CSSProperties = {
          display: 'block', fontFamily: SAIRA, fontSize: F.tiny, color: C.textDim,
          letterSpacing: '2px', marginBottom: 5,
        }
        const sel: React.CSSProperties = {
          width: '100%', background: 'transparent', border: 'none',
          color: C.text, fontSize: F.sub, fontWeight: 700, fontFamily: SAIRA,
          outline: 'none', cursor: 'pointer', padding: 0,
        }

        return (
          <div style={{ padding: '0 18px' }}>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ ...cell, marginBottom: 14 }}>
                <span style={lbl}>選手名</span>
                <input type="text" value={mktSearch} onChange={e => setMktSearch(e.target.value)}
                  placeholder="—" style={{ ...sel, fontWeight: 700 }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 16px', marginBottom: 20 }}>
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
              <GlassButton
                full size="lg"
                onClick={() => navigate('/transfer/market-results', { state: { search: mktSearch, spec: mktSpec, nat: mktNat, avail: mktAvail, team: mktTeam, age: mktAge, league: mktLeague } })}
              >検索</GlassButton>
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
              // 出場率は「そのクラブが走っている日程」で数える1本（utils/playRate）。
              // 自分の部の日程で数えると、1部・2部の選手は全員0＝全員が主力でない扱いになる
              const { fraction: frac, teamRaces: tr } = playRateOf(p.id, p.teamId, currentSeason, teams, foreignLeagues, prevSeasonOf(pastSeasons, currentSeason.year))
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
          <div style={{ padding: '0 18px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 0 9px', marginBottom: '12px',
              borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
            }}>
              <span style={{ fontSize: F.label, color: C.textSub, fontFamily: SAIRA, fontWeight: 800 }}>{marketPlayers.length}名</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SortSelect options={MARKET_SORT_OPTIONS} value={mktSortKey} onChange={setMktSortKey} />
                <button
                  onClick={() => setMktSortDir(d => d === 'desc' ? 'asc' : 'desc')}
                  style={{
                    background: 'transparent', border: 'none',
                    color: C.textSub, fontSize: F.sub, fontFamily: SAIRA, padding: '3px 4px',
                    cursor: 'pointer', lineHeight: 1,
                  }}
                >
                  {mktSortDir === 'desc' ? '↓' : '↑'}
                </button>
              </div>
            </div>
            {marketPlayers.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: C.textGhost, fontSize: F.bodyLg, fontFamily: SAIRA }}>条件に合う選手なし</div>
            )}
            {/* ロスターと同じカード：タップ＝メニュー / 長押し＝詳細。箱に入れず縦に並べる */}
            <PlayerList>
            {marketPlayers.slice(0, mktShown).map(p => {
              const isListed = listedIds.has(p.id)
              const hasBid = activeBids.some(b => b.playerId === p.id)
              const bidLocked = p.transferLockedUntilYear != null && currentSeason.year < p.transferLockedUntilYear
              const ownerTeam = clubIndex.byId(p.teamId)
              const badge: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: F.micro, padding: '1px 5px',fontWeight: 700, flexShrink: 0 }
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
            </PlayerList>

            {/* ★**全部を一度に描かない。** 5,775人ぶん並べると実機が落ちる（上の mktShown）。
                残りが分かるように件数を出す */}
            {marketPlayers.length > mktShown && (
              <div style={{ padding: '14px 0 4px' }}>
                <GlassButton full color={C.cyan} onClick={() => setMktShown(n => n + MARKET_PAGE)}>
                  もっと見る（残り{marketPlayers.length - mktShown}名）
                </GlassButton>
              </div>
            )}

            {/* タップメニュー（ロスターと同じ操作系） */}
            {(() => {
              const mp = menuPlayerId ? players.find(x => x.id === menuPlayerId) : undefined
              if (!mp) return null
              const isFA = mp.teamId === ''
              const mLocked = mp.transferLockedUntilYear != null && currentSeason.year < mp.transferLockedUntilYear
              // 出せるかどうかは utils/bidGate 1本（store が受け付けるかと同じもの）。
              // ★以前はここが「入札中・移籍直後」しか見ておらず、**赤字ペナルティは
              //   FA の枝にしか無かった**ので、入札は押せるのに黙って捨てられていた
              const gate = {
                currentSeason,
                myTeam,
                myTeamId: playerTeamId,
                bidsOnPlayer: (currentSeason.transferBids ?? []).filter(b => b.playerId === mp.id),
                loanSlotsUsed: players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length,
                loanRequested: (currentSeason.loanRequests ?? []).some(r => r.playerId === mp.id),
              }
              const bidNg = bidBlockReason(mp, gate)
              const loanNg = loanBlockReason(mp, gate)
              const mVal = calcTransferValue(mp)
              const isStarred = starredOpponents.includes(mp.id)
              const items: { label: string; disabled?: boolean; color?: string; onClick: () => void }[] = isFA ? [
                { label: signingBanned ? '赤字で補強不可' : mLocked ? '退団直後・来季まで交渉不可' : '契約オファー', disabled: signingBanned || mLocked, color: C.green, onClick: () => { setMenuPlayerId(null); startAcquisitionOffer(mp.id, 'fa'); navigate(`/team/chat?player=${mp.id}`) } },
                { label: isStarred ? 'ウォッチリストから外す' : 'ウォッチリストに追加', onClick: () => { toggleStarOpponent(mp.id); setMenuPlayerId(null) } },
              ] : [
                { label: bidNg ?? '入札して獲得', disabled: !!bidNg, color: C.gold, onClick: () => { setMenuPlayerId(null); setBidTarget(mp.id) } },
                { label: loanNg ?? 'レンタルで借りる', disabled: !!loanNg, color: C.blue, onClick: () => { setMenuPlayerId(null); setLoanTarget(mp.id) } },
                { label: isStarred ? 'ウォッチリストから外す' : 'ウォッチリストに追加', onClick: () => { toggleStarOpponent(mp.id); setMenuPlayerId(null) } },
              ]
              return (
                <ActionSheet
                  open={!!mp}
                  onClose={() => setMenuPlayerId(null)}
                  header={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{overflow: 'hidden', flexShrink: 0 }}>
                        <PlayerFace playerId={mp.id} nationality={mp.nationality} size={44} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text }}>{mp.name}</div>
                        <div style={{ fontSize: F.caption, color: C.textDim }}>{SPECIALTY_LABELS[mp.specialty]} · {mp.age}歳 · {clubIndex.byId(mp.teamId)?.shortName ?? '未所属'}</div>
                        <div style={{ fontSize: F.caption, color: C.textSub, marginTop: 2, fontFamily: SAIRA }}>価値 <span style={{ color: C.gold }}>{fmtYen(mVal)}</span> 年俸 {fmtYen(mp.contract.annualSalary)}</div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, color: ratingColor(ovr(mp)) }}>{ovr(mp)}</div>
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
        // 返事が要るオファーの判定は offersAwaitingReply 1本（ベル・チャット一覧と同じ）。
        // フリー移籍の接触（offeredPrice=0）と、「譲ります」と返事済みの選手はここに出ない
        const incomingOffers = offersAwaitingReply(currentSeason)
        const listings = currentSeason.transferListings ?? []
        const listedIds = new Set(listings.map(l => l.playerId))

        return (
          <div style={{ padding: '0 18px' }}>
            {(incomingOffers.length > 0 || offerResults.length > 0) && (
              <div style={{ marginBottom: '18px' }}>
                {/* 返事の結果だけが残っている状態では見出しを出さない（「0件 — 要確認」と出ていた） */}
                {incomingOffers.length > 0 && (
                  <div style={{ fontSize: F.tiny, color: C.pink, letterSpacing: '2px', marginBottom: '10px', fontWeight: '800', fontFamily: SAIRA }}>
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
                  // 移籍金0＝契約満了間近の選手へのフリー移籍オファー
                  const isFreeOffer = offer.offeredPrice === 0
                  // フリー移籍へのカウンターは市場価値ベース（0×1.3=0を出さない）
                  const counterPrice = roundFee(isFreeOffer ? calcTransferValue(p) : offer.offeredPrice * COUNTER_OFFER_CAP)
                  return (
                    <div key={offer.id} style={{
                      marginBottom: '16px', paddingBottom: '16px',
                      borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '11px', marginBottom: '11px' }}>
                        <div style={{
                          fontSize: '26px', fontWeight: '900', color: ratingColor(rating),
                          fontFamily: SAIRA, lineHeight: 1, flexShrink: 0,
                        }}>
                          {rating}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: F.sub, fontWeight: '800', color: C.text, fontFamily: SAIRA }}>{p.name}</div>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '3px' }}>
                            <SpecChip specialty={p.specialty} />
                            <span style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA }}>{p.age}歳</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: F.tiny, color: C.textDim, marginBottom: '2px', fontFamily: SAIRA }}>{offerFrom} からのオファー</div>
                          <div style={{ fontSize: isFreeOffer ? '13px' : '20px', fontWeight: '900', color: isFreeOffer ? C.textSub : C.pink, fontFamily: SAIRA, lineHeight: 1.1 }}>
                            {isFreeOffer ? 'フリー移籍' : fmtYen(offer.offeredPrice)}
                          </div>
                          <div style={{ fontSize: F.micro, color: C.textDim, fontFamily: SAIRA, marginTop: 2 }}>{isFreeOffer ? '移籍金なし' : '移籍金'}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <GlassButton
                          color={C.green} size="sm" style={{ flex: 2 }}
                          onClick={() => {
                            // 結果の文章は OfferResultList の1本。チャット画面と同じ言葉が出る
                            pushOfferResult(offer.id, acceptIncomingOffer(offer.id), { playerName: p.name, teamName: offerFrom, price: offer.offeredPrice })
                          }}
                        >{isFreeOffer ? '承諾 — フリー移籍' : `承諾 — ${fmtYen(offer.offeredPrice)}`}</GlassButton>
                        <GlassButton
                          color={C.gold} size="sm" style={{ flex: 2 }}
                          onClick={() => {
                            pushOfferResult(offer.id, counterIncomingOffer(offer.id, counterPrice), { playerName: p.name, teamName: offerFrom, price: counterPrice })
                          }}
                        >カウンター — {fmtYen(counterPrice)}</GlassButton>
                        <GlassButton
                          color={C.red} size="sm" style={{ flex: 1 }}
                          onClick={() => declineIncomingOffer(offer.id)}
                        >拒否</GlassButton>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {incomingOffers.length === 0 && (
              <div style={{ padding: '14px 0 18px', textAlign: 'center', borderBottom: `1px solid ${alpha(C.border3, 0.6)}`, marginBottom: '18px' }}>
                <div style={{ fontSize: F.label, color: C.textGhost, fontFamily: SAIRA }}>現在オファーなし</div>
              </div>
            )}

            <div style={{ fontSize: F.tiny, color: C.cyan, letterSpacing: '2px', marginBottom: '10px', fontWeight: '800', fontFamily: SAIRA }}>
              1軍選手 — 出品管理
            </div>
            {myPlayers.map(p => {
              const isListed = listedIds.has(p.id)
              const myListing = listings.find(l => l.playerId === p.id && l.fromTeamId === playerTeamId)
              const val = calcTransferValue(p)
              const stage = careerStage(p)
              const stageCol = CAREER_STAGE_COLOR[stage]
              const competingOffers = (incomingOffers).filter(o => o.playerId === p.id)
              const isSettingPrice = listingPlayerId === p.id
              const isPeakSell = stage === 'peak' && val >= 200_000_000
              return (
                <div key={p.id}>
                  <div style={{
                    position: 'relative',
                    padding: '11px 2px 11px 12px',
                    borderBottom: isSettingPrice ? 'none' : `1px solid ${alpha(C.border3, 0.6)}`,
                  }}>
                    {/* 状態は左の縦線1本で出す（枠で囲まない） */}
                    <div style={{
                      position: 'absolute', left: 0, top: 8, bottom: 8, width: 2,
                      background: competingOffers.length > 0 ? C.green : isListed ? C.gold : isPeakSell ? alpha(C.gold, 0.45) : 'transparent',
                    }}/>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                            <div style={{ fontSize: F.bodyLg, fontWeight: '600', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SAIRA }}>
                              {p.name}
                            </div>
                            {isPeakSell && !isListed && <span style={{ fontSize: F.micro, padding: '1px 5px',backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}`, color: C.gold, fontWeight: '800', fontFamily: SAIRA, flexShrink: 0 }}>売り時</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginTop: '2px', flexWrap: 'wrap' }}>
                            <SpecChip specialty={p.specialty} size="sm" />
                            <span style={{ fontSize: F.tiny, color: C.textDim, fontFamily: SAIRA }}>{p.age}歳</span>
                            <span style={{ fontSize: F.tiny, padding: '1px 4px',backgroundColor: alpha(stageCol, 0.08), color: stageCol, fontWeight: '700', fontFamily: SAIRA }}>{CAREER_STAGE_LABEL[stage]}</span>
                            <span style={{ fontSize: F.tiny, color: C.textSub, fontFamily: SAIRA }}>{fmtYen(val)}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                          {myListing ? (
                            <>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: F.tiny, color: C.gold, fontFamily: SAIRA }}>出品中 {fmtYen(myListing.askingPrice)}</div>
                                {competingOffers.length > 0 && (
                                  <div style={{ fontSize: F.caption, fontWeight: '800', color: C.green, fontFamily: SAIRA, textShadow: `0 0 8px ${alpha(C.green, 0.4)}` }}>
                                    入札 {competingOffers.length}件！
                                  </div>
                                )}
                              </div>
                              <button onClick={() => delistMyPlayer(p.id)} style={{
                                padding: '5px 9px',
                                border: `1px solid ${alpha(C.textDim, 0.25)}`, background: 'transparent',
                                color: C.textDim, fontSize: F.caption, cursor: 'pointer', fontFamily: SAIRA,
                              }}>取下</button>
                            </>
                          ) : (
                            <GlassButton
                              size="sm"
                              onClick={() => { setListingPlayerId(isSettingPrice ? null : p.id); setListingPrice(Math.round(val * 1.1 / 1000000) * 1000000) }}
                            >出品する</GlassButton>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {isSettingPrice && !myListing && (
                    <div style={{ padding: '4px 12px 16px', borderBottom: `1px solid ${alpha(C.border3, 0.6)}`, marginBottom: 0 }}>
                      <div style={{ fontSize: F.caption, color: C.textSub, marginBottom: '10px', fontFamily: SAIRA }}>
                        希望移籍金 — 市場価値: <span style={{ color: C.gold }}>{fmtYen(val)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <button onClick={() => setListingPrice(Math.max(1000000, listingPrice - 5000000))} style={{ padding: '4px 12px', border: 'none', background: 'transparent', color: C.textSub, fontSize: F.head, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>−</button>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <span style={{ fontSize: F.hero, fontWeight: '900', color: C.gold, fontFamily: SAIRA }}>{fmtYen(listingPrice)}</span>
                        </div>
                        <button onClick={() => setListingPrice(listingPrice + 5000000)} style={{ padding: '4px 12px', border: 'none', background: 'transparent', color: C.textSub, fontSize: F.head, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>＋</button>
                      </div>
                      <input type="range" min={Math.round(val * 0.5 / 1000000) * 1000000} max={Math.round(val * 2.0 / 1000000) * 1000000} step={1000000}
                        value={listingPrice} onChange={e => setListingPrice(Number(e.target.value))}
                        style={{ width: '100%', accentColor: C.gold, marginBottom: '12px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <GlassButton full style={{ flex: 1 }} onClick={() => { listMyPlayerForSale(p.id, listingPrice); setListingPlayerId(null) }}>
                          出品を確定
                        </GlassButton>
                        <button onClick={() => setListingPlayerId(null)} style={{ padding: '10px 14px',border: `1px solid ${alpha(C.border3, 0.7)}`, background: 'transparent', color: C.textDim, fontSize: F.body, cursor: 'pointer', fontFamily: SAIRA, flexShrink: 0 }}>取消</button>
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
                <div style={{ marginTop: '22px' }}>
                  <div style={{ fontSize: F.tiny, color: C.cyan, letterSpacing: '2px', marginBottom: '10px', fontWeight: '800', fontFamily: SAIRA }}>指名権の売却</div>
                  {myPicks.map(pk => {
                    const k = `${pk.year}-R${pk.round}-${pk.pickNumber}`
                    const fairVal = draftPickValue(pk.round, pk.pickNumber)
                    const isSelling = pickSellTarget === k
                    return (
                      <div key={k}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 2px',
                          borderBottom: isSelling ? 'none' : `1px solid ${alpha(C.border3, 0.6)}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: F.body, fontWeight: '800', color: C.text, fontFamily: SAIRA }}>{pk.year}年 第{pk.round}巡指名権</div>
                            <div style={{ fontSize: F.tiny, color: C.textDim, fontFamily: SAIRA, marginTop: 2 }}>指名順位は{pk.year}年の成績で確定 · 参考価値 ≈ {fmtYen(fairVal)}</div>
                          </div>
                          <GlassButton color={C.blue} size="sm" onClick={() => {
                            if (isSelling) { setPickSellTarget(null); setPickSellResult('idle') }
                            else { setPickSellTarget(k); setPickSellPrice(Math.round(fairVal * 0.85 / 1000000) * 1000000); setPickSellTeam(''); setPickSellResult('idle') }
                          }}>
                            {isSelling ? '閉じる' : '売却する'}
                          </GlassButton>
                        </div>
                        {isSelling && (
                          <div style={{ padding: '4px 2px 16px', borderBottom: `1px solid ${alpha(C.border3, 0.6)}` }}>
                            {pickSellResult === 'success' ? (
                              <div style={{ textAlign: 'center', padding: '10px', color: C.green, fontSize: F.body, fontWeight: '700', fontFamily: SAIRA }}>売却完了！</div>
                            ) : pickSellResult === 'failed' ? (
                              <div style={{ textAlign: 'center', padding: '10px', color: C.red, fontSize: F.label, fontFamily: SAIRA }}>条件が合いませんでした</div>
                            ) : (
                              <>
                                <select value={pickSellTeam} onChange={e => setPickSellTeam(e.target.value)} style={{
                                  width: '100%', padding: '8px 0', marginBottom: '12px',
                                  background: 'transparent', border: 'none', borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
                                  color: C.textSub, fontSize: F.body, fontFamily: SAIRA, outline: 'none',
                                }}>
                                  <option value="">売却先チームを選択</option>
                                  {cpuTeamsList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                  <button onClick={() => setPickSellPrice(Math.max(1000000, pickSellPrice - 1000000))} style={{ padding: '4px 12px', border: 'none', background: 'transparent', color: C.textSub, fontSize: F.head, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>−</button>
                                  <div style={{ flex: 1, textAlign: 'center' }}>
                                    <span style={{ fontSize: F.headLg, fontWeight: '900', color: C.blue, fontFamily: SAIRA }}>{fmtYen(pickSellPrice)}</span>
                                  </div>
                                  <button onClick={() => setPickSellPrice(pickSellPrice + 1000000)} style={{ padding: '4px 12px', border: 'none', background: 'transparent', color: C.textSub, fontSize: F.head, fontFamily: SAIRA, cursor: 'pointer', flexShrink: 0 }}>＋</button>
                                </div>
                                <input type="range" min={1000000} max={Math.round(fairVal * COUNTER_OFFER_CAP)} step={1000000}
                                  value={pickSellPrice} onChange={e => setPickSellPrice(Number(e.target.value))}
                                  style={{ width: '100%', accentColor: C.blue, marginBottom: '6px' }}
                                />
                                <div style={{ fontSize: F.tiny, color: pickSellPrice > fairVal * 1.2 ? C.red : pickSellPrice >= fairVal * 0.7 ? C.gold : C.green, textAlign: 'center', marginBottom: '10px', fontFamily: SAIRA }}>
                                  {pickSellPrice > fairVal * 1.2 ? '高すぎる — 合意困難' : pickSellPrice >= fairVal * 0.85 ? '合意圏内' : '安値 — 合意しやすい'}
                                </div>
                                <GlassButton full color={C.blue} disabled={!pickSellTeam} onClick={() => {
                                  if (!pickSellTeam) return
                                  const ok = sellDraftPick(k, pickSellTeam, pickSellPrice)
                                  setPickSellResult(ok ? 'success' : 'failed')
                                  if (ok) setPickSellTarget(null)
                                }}>
                                  売却する（即時実行）
                                </GlassButton>
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
        <div style={{ padding: '4px 18px' }}>
              <div style={{ fontSize: F.tiny, color: C.cyan, letterSpacing: '2px', fontWeight: '800', marginBottom: '12px', fontFamily: SAIRA }}>選手トレード — 取引相手チームを選択（国内のみ）</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {teams.filter(t => t.id !== playerTeamId).map(t => {
                      // 所属は player.teamId が正（rosterSync）。roster配列だとズレたチームの平均OVRが狂う
                      const theirMain = squadPlayersOf(players, t.id)
                      const avgOvr = theirMain.length > 0 ? Math.round(theirMain.reduce((s, p) => s + ovr(p), 0) / theirMain.length) : 0
                      return (
                        <button key={t.id} onClick={() => navigate(`/team/chat?trade=${t.id}`)} className="btn-press" style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px',
                          padding: '14px 8px',
                          // スモークガラス（クラブの色で染める）
                          background: `linear-gradient(180deg, ${alpha(t.colors.primary, 0.16)}, ${alpha(t.colors.primary, 0.03)})`,
                          backdropFilter: 'blur(10px) saturate(118%)',
                          WebkitBackdropFilter: 'blur(10px) saturate(118%)',
                          border: `1px solid ${alpha(t.colors.primary, 0.42)}`,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.20), 0 10px 26px -14px rgba(0,0,0,0.9)',
                          cursor: 'pointer', fontFamily: SAIRA,
                        }}>
                          <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={48} />
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: F.label, fontWeight: '700', color: C.text, fontFamily: SAIRA, lineHeight: 1.2 }}>{t.name}</div>
                            <div style={{ fontSize: F.tiny, color: C.textDim, marginTop: '2px', fontFamily: SAIRA }}>{t.city}</div>
                          </div>
                          <span style={{ fontSize: F.titleLg, fontWeight: '900', color: ratingColor(avgOvr), fontFamily: SAIRA, lineHeight: 1 }}>{avgOvr}</span>
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
