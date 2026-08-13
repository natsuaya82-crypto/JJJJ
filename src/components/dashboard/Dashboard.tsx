import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { runWithLoading } from '../../store/loadingStore'
import { showInterstitialAd } from '../../utils/ads'
import PlayerFace from '../player/PlayerFace'
import { SPECIALTY_LABELS } from '../../types'
import { ovr } from '../../utils/playerUtils'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha, SAIRA } from '../../styles/tokens'
import JewelGainPopup from '../ui/JewelGainPopup'
import HeroCard from './HeroCard'
import KeyPlayersSection from './KeyPlayersSection'
import NextRaceCard from './NextRaceCard'
import { computeSeasonAwards } from '../../utils/awards'
import { clubSeasonRank } from '../../utils/clubStanding'
import type { Race } from '../../types'
import { getDueIndividualEvent } from '../../utils/eventTime'
import { hostForYear } from '../../engine/worldAthletics'
import { ROSTER_MIN } from '../../data/rosterRules'
import ConfirmDialog from '../ui/ConfirmDialog'
import { GmPassSheet, IAP_ENABLED } from '../shared/GmPassSheet'
import { contractTalkCtx, contractMonthsLeft, needsRenewalAttention } from '../../utils/contractTalk'
import { seasonDivisionStandings, rankOfTeam } from '../../utils/league'



/* ── PreseasonHub ─────────────────────────── */
type DraftState = { isComplete: boolean } | null

const RARITY_COLOR: Record<string, string> = {
  legendary: '#F59E0B', epic: '#A855F7', rare: '#3B82F6', normal: '#7A7A8C',
}
const RARITY_LABEL: Record<string, string> = {
  legendary: 'LEG', epic: 'EPIC', rare: 'RARE', normal: 'NRM',
}
function preseasonCardDist(rank: number) {
  if (rank === 1)  return [{ rarity: 'legendary', count: 1 }, { rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 2 }]
  if (rank === 2)  return [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 2 }, { rarity: 'normal', count: 3 }]
  if (rank === 3)  return [{ rarity: 'epic', count: 1 }, { rarity: 'rare', count: 1 }, { rarity: 'normal', count: 4 }]
  if (rank <= 6)   return [{ rarity: 'rare', count: 2 }, { rarity: 'normal', count: 4 }]
  if (rank <= 10)  return [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }]
  if (rank <= 14)  return [{ rarity: 'normal', count: 6 }]
  if (rank >= 15)  return [{ rarity: 'epic', count: 1 }, { rarity: 'normal', count: 6 }]
  return [{ rarity: 'rare', count: 1 }, { rarity: 'normal', count: 5 }] // first season
}

function PreseasonHub({
  year, isFirstSeason, campBonus, draftState,
  lastRank, objectivesCount, rosterCount,
  onClaimCards, onDraft, onStart, navigate,
}: {
  year: number
  isFirstSeason: boolean
  campBonus?: { type: string; applied: boolean }
  draftState: DraftState
  lastRank: number
  objectivesCount: number
  rosterCount: number
  onClaimCards: () => void
  onDraft: () => void
  onStart: () => void
  navigate: (path: string) => void
}) {
  const campDone    = !!campBonus?.applied
  const draftDone   = isFirstSeason || (!!draftState && draftState.isComplete)
  const inauguralPlayerCreated = useGameStore(s => s.inauguralPlayerCreated)
  // ロスターが下限(15人)未満だと開幕できない（契約切れ等で割った場合はドラフト・移籍で補強してから）
  const rosterShort = rosterCount < ROSTER_MIN
  const allReady    = campDone && draftDone && !rosterShort

  // 準備の行。中身は今までと同じで、見た目だけ細い線に寄せる
  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0',
    borderBottom: `1px solid ${alpha(C.border3, 0.35)}`,
  }
  const dot = (done: boolean) => (
    <span style={{
      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
      background: done ? C.green : C.textGhost,
    }}/>
  )
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
    fontFamily: 'inherit', fontSize: 12, fontWeight: 900, color: C.cyan,
  }

  return (
    <div style={{ padding: '0 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '22px 0 8px' }}>
        <div style={{ width: 2, height: 12, background: C.cyan }}/>
        <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, letterSpacing: '2.5px', color: C.cyan }}>
          {year} PRE-SEASON
        </span>
        <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.6) }}/>
        <span style={{ fontSize: 11, color: C.textDim }}>{isFirstSeason ? '開幕準備' : '新シーズン準備'}</span>
      </div>

      {/* ① ドラフト — 2年目以降 */}
      {!isFirstSeason && (
        <div style={{ ...rowStyle, borderTop: `1px solid ${alpha(C.border3, 0.6)}` }}>
          {dot(draftDone)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: draftDone ? C.textDim : C.text }}>新人ドラフト</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {draftDone ? '指名完了' : '今年の新入団選手を指名する'}
            </div>
          </div>
          {!draftDone && <button onClick={onDraft} style={linkBtn}>開催 ›</button>}
        </div>
      )}

      {/* ①' 初年度のマイ選手作成 */}
      {isFirstSeason && !inauguralPlayerCreated && (
        <div style={{ ...rowStyle, borderTop: `1px solid ${alpha(C.border3, 0.6)}` }}>
          {dot(false)}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>選手を1人つくる</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>名前・年齢・国籍・ポジション・能力・顔を決めて加入させる</div>
          </div>
          <button onClick={() => navigate('/create-player')} style={linkBtn}>つくる ›</button>
        </div>
      )}

      {/* ③ シーズン目標 */}
      <div style={{ ...rowStyle, borderTop: (isFirstSeason && inauguralPlayerCreated) ? `1px solid ${alpha(C.border3, 0.6)}` : 'none' }}>
        {dot(true)}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>今シーズンの目標</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {objectivesCount > 0 ? `${objectivesCount}件の目標を確認（達成で報酬）` : '目標を確認する'}
          </div>
        </div>
        <button onClick={() => navigate('/objectives')} style={{ ...linkBtn, color: C.textSub }}>確認 ›</button>
      </div>

      {/* ④ シーズン前カード */}
      <div style={rowStyle}>
        {dot(campDone)}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: campDone ? C.textDim : C.text }}>
            {campDone ? 'カード受取完了' : 'シーズン前カード'}
          </div>
          {!campDone && (
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
              {isFirstSeason ? '開幕記念カード配布（6枚）' : lastRank >= 15 ? `前年${lastRank}位 — 救済カード配布（7枚）` : `前年${lastRank}位 — カード配布（6枚）`}
            </div>
          )}
        </div>
        {!campDone && <button onClick={onClaimCards} style={linkBtn}>受け取る ›</button>}
      </div>

      {!campDone && (
        <div style={{ display: 'flex', gap: 8, margin: '10px 0 0', flexWrap: 'wrap' }}>
          {preseasonCardDist(lastRank).map(({ rarity, count }) => (
            <span key={rarity} style={{
              fontFamily: SAIRA, fontSize: 10, fontWeight: 900, letterSpacing: 1,
              padding: '3px 8px', borderRadius: 4,
              color: RARITY_COLOR[rarity], background: `${RARITY_COLOR[rarity]}1f`,
            }}>{RARITY_LABEL[rarity]} ×{count}</span>
          ))}
        </div>
      )}

      {/* 開幕 */}
      {rosterShort && (
        <div style={{ fontSize: 11, color: C.red, margin: '14px 0 0', textAlign: 'center', fontWeight: 700 }}>
          ロスターが下限（{ROSTER_MIN}人）未満のため開幕できません（現在{rosterCount}人）。<br/>ドラフト・移籍で人数を確保してください。
        </div>
      )}
      <button
        onClick={() => { if (!rosterShort) { onStart(); navigate('/schedule') } }}
        disabled={rosterShort}
        className="btn-press"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', margin: '14px 0 0', padding: '15px 0', borderRadius: 16, overflow: 'hidden',
          fontFamily: 'inherit', cursor: rosterShort ? 'default' : 'pointer',
          // ★もとが金のボタンなので、金のガラスにする（色は元のまま）
          color: rosterShort ? C.textGhost : C.goldHi,
          background: rosterShort
            ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))'
            : `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})`,
          backdropFilter: 'blur(10px) saturate(118%)',
          WebkitBackdropFilter: 'blur(10px) saturate(118%)',
          border: `1px solid ${rosterShort ? alpha(C.border3, 0.6) : alpha(C.gold, 0.7)}`,
          boxShadow: rosterShort ? 'none'
            : `inset 0 1px 0 rgba(255,255,255,0.24), 0 8px 22px rgba(0,0,0,0.45), 0 0 18px ${alpha(C.gold, 0.10)}`,
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '3px' }}>
          {year}シーズン {allReady ? '開幕！' : rosterShort ? '開幕（補強が必要）' : '開幕'}
        </span>
      </button>
      {!allReady && !rosterShort && (
        <div style={{ fontSize: 10.5, color: C.textGhost, margin: '9px 0 0' }}>
          上記の準備を済ませると開幕できます。スキップも可能です。
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════
   Dashboard
   ══════════════════════════════════════════ */
export default function Dashboard() {
  const {
    teams, playerTeamId, players, currentSeason, pastSeasons,
    gmRep,
    endSeason, growthReport, beginSeasonDraft, draftState,
    claimPreseasonCards,
    startRegularSeason, initObjectivesIfEmpty, getTeamPlayers,
  } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  // 世界選手権関連のstate。early return（!team）より後ろで useGameStore を呼ぶとフック数が変わり、
  // 「Rendered fewer hooks than expected」で白画面になるため必ずここで取る。
  const worldAthleticsResults = useGameStore(s => s.worldAthleticsResults)
  const worldSquad = useGameStore(s => s.worldSquad)
  const worldTournament = useGameStore(s => s.worldTournament)
  const startWorldTournament = useGameStore(s => s.startWorldTournament)
  // シーズン更新の広告分岐（GMパス未購入のときだけ出す）
  const [seasonAdAsk, setSeasonAdAsk] = useState(false)
  const [gmPassOpen, setGmPassOpen] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    initObjectivesIfEmpty()
  }, [])
  const team = teams.find(t => t.id === playerTeamId)
  if (!team) return null

  // 「次のシーズンへ」。GMパス購入済みならそのまま更新。
  // 未購入なら「広告を見て進む／広告を消す」を選んでもらう（広告が出る場面が
  // 一番GMパスの価値が伝わるので、購入への入り口をここに置く）
  const goNextSeason = () => {
    if (adsRemoved || !IAP_ENABLED) {
      runWithLoading('シーズンを更新中…', endSeason, 800)
      return
    }
    setSeasonAdAsk(true)
  }
  const goNextSeasonWithAd = async () => {
    setSeasonAdAsk(false)
    await showInterstitialAd()
    runWithLoading('シーズンを更新中…', endSeason, 800)
  }

  const gmRepVal = gmRep ?? 50
  // 在籍は player.teamId 1本（utils/rosterSync）。ロスター画面と同じ取り方
  const mainPlayers = getTeamPlayers(playerTeamId).filter(p => p.status !== 'retired')
  const avgMorale = mainPlayers.length > 0
    ? Math.round(mainPlayers.reduce((s, p) => s + (p.morale ?? 70), 0) / mainPlayers.length) : 70

  const nextMainRace = currentSeason.races[currentSeason.currentRaceIndex] ?? null
  type NextRaceData = { race: Race; kind: 'main'; number: number; total: number }
  const nextRaceData: NextRaceData | null = nextMainRace
    ? { race: nextMainRace, kind: 'main', number: currentSeason.currentRaceIndex + 1, total: currentSeason.races.length }
    : null
  // カレンダー進行: 次のリーグ戦より前に未実施の記録会があればNEXTはそちら
  const dueTT = getDueIndividualEvent(currentSeason)
  const showTTNext = !!dueTT && (!nextRaceData || dueTT.date <= nextRaceData.race.date)
  const seasonDone = currentSeason.currentRaceIndex >= currentSeason.races.length && currentSeason.races.length > 0
  // 順位表は全52チームぶんを1本で持っているので、自分が走っている部だけに絞る
  // （絞らないと、部ごとにレース数が違うぶんだけ順位がずれる）
  const sorted = seasonDivisionStandings(currentSeason, playerTeamId)
  const myRank = rankOfTeam(sorted, playerTeamId)

  // ── ホーム下段の四角2つ（順位表・選手）に出すぶん ──
  // 順位表は上位3つ＋自分（自分が3位以内なら上位4つ）
  const rankedRows = sorted.map((s2, i2) => ({ ...s2, rank: i2 + 1 }))
  const meRow = rankedRows.find(r => r.teamId === playerTeamId)
  const miniRows = meRow && meRow.rank > 3
    ? [...rankedRows.slice(0, 3), meRow]
    : rankedRows.slice(0, 4)
  const topPlayer = [...mainPlayers].sort((a, b) => ovr(b) - ovr(a))[0]
  const avgOvrAll = mainPlayers.length > 0
    ? Math.round(mainPlayers.reduce((acc, p) => acc + ovr(p), 0) / mainPlayers.length) : 0
  const expiring = mainPlayers.filter(p => p.contract.yearsLeft <= 1).length

  // 四角の見た目（スモークガラス）。ここ以外で書かないこと
  const sqStyle: React.CSSProperties = {
    aspectRatio: '1 / 1', padding: '13px 13px 12px', borderRadius: 16, overflow: 'hidden',
    display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
    backdropFilter: 'blur(10px) saturate(118%)',
    WebkitBackdropFilter: 'blur(10px) saturate(118%)',
    boxShadow: [
      'inset 0 0 0 1px rgba(255,255,255,0.13)',
      'inset 0 1px 0 rgba(255,255,255,0.22)',
      '0 10px 26px -14px rgba(0,0,0,0.9)',
    ].join(', '),
  }
  const sqTitleRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }
  const sqTitle: React.CSSProperties = { fontSize: 13, fontWeight: 900, color: C.text }

  // 世界選手権：JPELファイナル後〜シーズン終了の間に挟むステップ。
  // 偶数年=本番 / 奇数年=アジア＋オセアニア予選。実行済み(waDone)になって初めてシーズン終了カードが出る
  const waDone = (worldAthleticsResults ?? []).some(r => r.year === currentSeason.year)
  const waIsMain = (currentSeason.year - 2028) % 2 === 0
  const waTitle = waIsMain ? `世界選手権 ${currentSeason.year}` : `世界選手権アジア予選 ${currentSeason.year}`
  const waSquadReady = worldSquad?.year === currentSeason.year && (worldSquad?.playerIds.length ?? 0) > 0
  // 本番年は前年の予選を通過していないと出場できない（開催国なら免除）。予選記録が無い場合は出場扱い
  const waPrevQual = (worldAthleticsResults ?? []).find(r => r.kind === 'qualifier' && r.year === currentSeason.year - 1)
  const waJapanIn = !waIsMain
    || hostForYear(currentSeason.year) === 'JPN'
    || !waPrevQual || waPrevQual.kind !== 'qualifier'
    || waPrevQual.advanced.includes('JPN')
  const waInProgress = worldTournament?.year === currentSeason.year && !worldTournament.finished
  const goWorldAthletics = () => { startWorldTournament(); navigate('/national/tournament') }

  // ECL（シーズン中の5戦シリーズ）：NEXTカードは常に1枚だけ。日付が最も早いイベントだけを出す
  const eclS = currentSeason.eclSeries
  const nextEclRace = eclS && eclS.raceIndex < eclS.races.length ? eclS.races[eclS.raceIndex] : null
  const eclQualified = !!eclS?.participants.some(pt => pt.isPlayerTeam)
  const eclDue = !!nextEclRace && (!nextMainRace || nextEclRace.date <= nextMainRace.date)
  // 他の駅伝と全く同じ見た目のNextRaceCard（赤基準）。出場しない年はCTAを「観戦する」に
  const eclNextCard = nextEclRace && eclS ? (
    <NextRaceCard
      race={nextEclRace}
      raceNumber={eclS.raceIndex + 1}
      totalRaces={eclS.races.length}
      variant="ecl"
      ctaLabel={eclQualified ? undefined : '観戦する'}
      secondaryCtaLabel={!eclQualified && eclDue ? 'スキップ' : undefined}
      onSecondaryClick={!eclQualified && eclDue ? () => runWithLoading('結果を計算中…', () => useGameStore.getState().advanceEclRace(), 500) : undefined}
      onClick={() => navigate('/ecl')}
    />
  ) : null
  const lastSeason = pastSeasons[pastSeasons.length - 1]
  const lastRank = lastSeason
    ? rankOfTeam(seasonDivisionStandings(lastSeason, playerTeamId), playerTeamId)
    : 0

  /* Season end */
  const isChampion = seasonDone && sorted[0]?.teamId === playerTeamId
  // リーグMVP・新人王（endSeasonで保存されるのと同じルール: 6戦以上・平均区間順位）
  // ★MVPは部ごと（1部MVP・2部MVP・3部MVP）。ここは自分の部のぶん
  const seasonAward = seasonDone ? computeSeasonAwards(currentSeason.races, players, currentSeason.year, clubSeasonRank(currentSeason, playerTeamId).division) : null
  const mvp = seasonAward?.mvpId ? players.find(p => p.id === seasonAward.mvpId) : null
  const rookie = seasonAward?.rookieId ? players.find(p => p.id === seasonAward.rookieId) : null


  // 契約の「未解決」は通知・チャット一覧・レース後と同じ needsRenewalAttention 1本で数える。
  // ここだけ独自に数えていたので、退団予定・引退の話・海外挑戦を承認した選手や、
  // フリー接触中でチャットに用件が出ない選手まで数に入り、
  // 「契約未解決の選手が○人います」と言われても対応する場所が無い状態になっていた
  const renewCtx = contractTalkCtx(currentSeason, playerTeamId)
  const renewRaceIndex = currentSeason.currentRaceIndex ?? 0
  const renewTotalRaces = currentSeason.races?.length ?? 1
  const unresolvedMandatoryCount = players.filter(p =>
    needsRenewalAttention(p, contractMonthsLeft(p.contract.yearsLeft, renewRaceIndex, renewTotalRaces), renewCtx)
  ).length

  return (
    <div className="page-enter" style={{ paddingBottom: 8 }}>

      {/* ── HERO ── */}
      <HeroCard
        team={team}
        seasonYear={currentSeason.year}
        rank={myRank}
        totalRaces={currentSeason.races.length}
        completedRaces={currentSeason.currentRaceIndex}
        gmRep={gmRepVal}
        avgMorale={avgMorale}
        seasonDone={seasonDone}
      />

      {/* ── QUICK ACTIONS（枠なし・ヘアラインで区切る） ── */}
      <div style={{
        display: 'flex', margin: '18px 18px 0',
        borderTop: `1px solid ${alpha(C.border3, 0.6)}`, borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
      }}>
        {([
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
            label: '年間予定', path: '/schedule',
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M3 6h18M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
            label: 'ショップ', path: '/shop',
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            label: 'シーズン目標', path: '/objectives',
          },
          {
            icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            label: 'チャット', path: '/team/chat',
          },
        ] as const).map(({ icon, label, path }, i) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="btn-press"
            style={{
              flex: 1, padding: '13px 0', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
              border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${alpha(C.border3, 0.35)}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ color: C.textDim, display: 'flex' }}>{icon}</span>
            <span style={{ fontSize: 10.5, color: C.textSub }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── PHASE CONTENT ── */}
      {currentSeason.phase === 'preseason' ? (
        <PreseasonHub
          year={currentSeason.year}
          isFirstSeason={pastSeasons.length === 0}
          campBonus={currentSeason.campBonus}
          draftState={draftState}
          lastRank={lastRank}
          objectivesCount={currentSeason.objectives.length}
          rosterCount={players.filter(p => p.teamId === playerTeamId && p.status !== 'retired').length}
          onClaimCards={claimPreseasonCards}
          onDraft={beginSeasonDraft}
          onStart={startRegularSeason}
          navigate={navigate}
        />
      ) : seasonDone && nextEclRace ? (
        /* ECLの残り戦。JPELファイナル後なので代表選考にはいつでも入れる */
        <div style={{ margin: '0 12px 16px' }}>
          {eclNextCard}
          {!waDone && waJapanIn && (
            <button onClick={() => navigate('/national/select')} className="btn-press" style={{
              width: '100%', marginTop: 10, padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
              background: `linear-gradient(180deg, ${alpha(C.purple, 0.16)}, ${alpha(C.purple, 0.06)})`,
              border: `2px solid ${C.purpleDark}`, display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit',
            }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: C.purple }}>{waSquadReady ? '代表選考済み ✓（変更する）' : '日本代表を選考する'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: C.textDim }}>{waSquadReady ? 'ECL消化後に大会へ ›' : `${waTitle} ›`}</span>
            </button>
          )}
          {/* ★ECLの残り戦があるあいだも大会へ進めるようにする。
              以前はこの分岐に選考ボタンしか無く、**大会へ入る導線がここだけ無かった**。
              シーズンを終わらせると二度と開催できないので、入口はどの分岐にも置く。
              **選考が済んでいるかどうかで隠さないこと**（選考は大会に入ってからでもできる。
              入口を隠すと、選考をしていない人からはその年の大会が消える） */}
          {!waDone && (
            <button onClick={goWorldAthletics} className="btn-game btn-game--purple" style={{ width: '100%', marginTop: 8 }}>
              <span className="btn-game__inner" style={{ fontSize: 13, padding: '10px 14px', borderRadius: 12 }}>{waTitle}へ進む →</span>
            </button>
          )}
        </div>
      ) : seasonDone && !waDone ? (
        /* 世界選手権／予選：シーズン終了の前に必ずここを通る */
        <div style={{ margin: '0 12px 16px' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            border: `3px solid ${C.purple}`, borderRadius: 20,
            boxShadow: `0 8px 0 ${C.purpleDark}, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15)`,
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 5, border: `1px solid ${alpha(C.purple, 0.35)}`, borderRadius: 13, pointerEvents: 'none' }}/>
            <div style={{ padding: '18px 18px 12px', textAlign: 'center', borderBottom: `1px solid ${alpha(C.purple, 0.18)}`, position: 'relative' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: '3px', marginBottom: 4, fontWeight: 900 }}>WORLD LONG DISTANCE</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: C.text }}>{waTitle}</div>
              <div style={{ fontSize: 11, color: waJapanIn ? C.textSub : C.red, marginTop: 4 }}>
                {!waJapanIn
                  ? '前年の世界選手権アジア予選で敗退したため、日本は出場できません'
                  : waSquadReady ? '代表選考済み。大会に進みます' : '駅伝代表20人を選考してから大会に進みます'}
              </div>
            </div>
            <div style={{ padding: '14px 18px', position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {waInProgress ? (
                <button onClick={() => navigate('/national/tournament')} className="btn-game btn-game--purple" style={{ width: '100%' }}>
                  <span className="btn-game__inner" style={{ fontSize: 14, padding: '11px 14px', borderRadius: 12 }}>駅伝 第{(worldTournament?.raceIndex ?? 0) + 1}戦へ →</span>
                </button>
              ) : !waJapanIn ? (
                <button onClick={goWorldAthletics} className="btn-game btn-game--purple" style={{ width: '100%' }}>
                  <span className="btn-game__inner" style={{ fontSize: 14, padding: '11px 14px', borderRadius: 12 }}>大会を観戦する</span>
                </button>
              ) : (<>
              {waSquadReady ? (
                <button onClick={() => navigate('/national/select')} className="btn-press" style={{
                  width: '100%', padding: '12px 14px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                  background: C.surface2, border: `2px solid ${C.border2}`, color: C.textSub, fontSize: 14, fontWeight: 900,
                }}>選考をやり直す</button>
              ) : (
                <button onClick={() => navigate('/national/select')} className="btn-game btn-game--purple" style={{ width: '100%' }}>
                  <span className="btn-game__inner" style={{ fontSize: 14, padding: '11px 14px', borderRadius: 12 }}>日本代表を選考する</span>
                </button>
              )}
              {waSquadReady && (
                <button onClick={goWorldAthletics} className="btn-game btn-game--purple" style={{ width: '100%' }}>
                  <span className="btn-game__inner" style={{ fontSize: 14, padding: '11px 14px', borderRadius: 12 }}>大会へ進む →</span>
                </button>
              )}
              </>)}
            </div>
          </div>
        </div>
      ) : seasonDone ? (
        /* シーズン終了 */
        <div style={{ margin: '0 12px 16px' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            border: `3px solid ${C.gold}`, borderRadius: 20,
            boxShadow: `0 8px 0 #8b6914, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)`,
            overflow: 'hidden', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 5, border: `1px solid rgba(245,200,66,0.35)`, borderRadius: 13, pointerEvents: 'none', zIndex: 0 }}/>
            <div style={{ padding: '18px 18px 14px', textAlign: 'center', borderBottom: `1px solid ${alpha(C.gold, 0.15)}`, position: 'relative', zIndex: 1 }}>
              {isChampion && <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.gold, letterSpacing: '3px', marginBottom: 4, fontWeight: 900, textShadow: `0 0 10px ${alpha(C.gold, 0.7)}` }}>★ CHAMPION ★</div>}
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', marginBottom: 4 }}>SEASON FINAL</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: C.text, marginBottom: 2 }}>{currentSeason.year} シーズン終了</div>
              <div style={{ fontSize: 12, color: C.textSub }}>優勝：{teams.find(t => t.id === sorted[0]?.teamId)?.name ?? '―'}</div>
            </div>
            {(mvp || rookie) && (
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, display: 'flex', gap: 8, position: 'relative', zIndex: 1 }}>
                {/* 選出基準（平均区間順位）は内部ロジック。表示は誰が選ばれたかだけ */}
                {mvp && (
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(C.gold, 0.3)}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${alpha(C.gold, 0.4)}` }}>
                      <PlayerFace playerId={mvp.id} nationality={mvp.nationality} size={36}/>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: '2px', marginBottom: 3 }}>MVP</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mvp.name}</div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{teams.find(t => t.id === mvp.teamId)?.shortName ?? ''}</div>
                    </div>
                  </div>
                )}
                {rookie && (
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha('#4FC3F7', 0.3)}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${alpha('#4FC3F7', 0.4)}` }}>
                      <PlayerFace playerId={rookie.id} nationality={rookie.nationality} size={36}/>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, color: '#4FC3F7', letterSpacing: '2px', marginBottom: 3 }}>新人王</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rookie.name}</div>
                      <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>{teams.find(t => t.id === rookie.teamId)?.shortName ?? ''}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {growthReport?.year === currentSeason.year && growthReport.entries.length > 0 && (
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, position: 'relative', zIndex: 1 }}>
                <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, letterSpacing: '2px', marginBottom: 8 }}>選手成長レポート</div>
                {growthReport.entries.slice(0, 6).map(e => {
                  const delta = e.ovrAfter - e.ovrBefore
                  const col = delta > 0 ? C.green : delta < 0 ? C.red : C.textDim
                  return (
                    <div key={e.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8, marginBottom: 3, background: delta !== 0 ? alpha(col, 0.06) : 'transparent', border: `1px solid ${delta !== 0 ? alpha(col, 0.15) : C.border}` }}>
                      <span style={{ flex: 1, fontSize: 12, color: C.text }}>{e.name}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{e.ovrBefore}</span>
                      <span style={{ fontSize: 10, color: C.border3 }}>→</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.text }}>{e.ovrAfter}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: col, minWidth: 30, textAlign: 'right' }}>
                        {delta > 0 ? `+${delta}` : delta === 0 ? '±0' : `${delta}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
            <div style={{ padding: '14px 18px', position: 'relative', zIndex: 1 }}>
              {waDone && (
                <button onClick={() => navigate(`/national/result?y=${currentSeason.year}`)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', marginBottom: 10, borderRadius: 10, border: `1px solid ${alpha(C.purple, 0.4)}`, background: alpha(C.purple, 0.08), cursor: 'pointer' }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: C.purple }}>{waTitle} の結果</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: C.textDim }}>›</span>
                </button>
              )}
              {unresolvedMandatoryCount > 0 && (
                <div style={{ fontSize: 11, color: C.orange, textAlign: 'center', marginBottom: 10 }}>
                  契約未解決の選手が{unresolvedMandatoryCount}人います — 契約管理で対応してください
                </div>
              )}
              <button
                className="btn-game btn-game--gold"
                onClick={goNextSeason}
                style={{ width: '100%' }}
              >
                <span className="btn-game__inner">{currentSeason.year + 1}シーズン開幕へ →</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 通常シーズン：NEXTカードは日付が最も早いイベント1枚だけ */
        <div style={{ padding: '0 12px 16px' }}>
          {eclDue && eclNextCard && (!showTTNext || !dueTT || nextEclRace!.date <= dueTT.date) ? eclNextCard
          : showTTNext && dueTT ? (() => {
            const distLabel = dueTT.distance === 5000 ? '5000m' : dueTT.distance === 10000 ? '10000m' : dueTT.distance === 21097 ? 'ハーフ' : 'マラソン'
            const distKm = (dueTT.distance / 1000).toFixed(dueTT.distance >= 10000 ? 0 : 1)
            return (
            <div role="button" tabIndex={0} className="pressable" onClick={() => navigate('/race')} style={{
              borderRadius: 20, overflow: 'hidden', position: 'relative',
              background: `linear-gradient(135deg, ${alpha(C.green, 0.08)} 0%, transparent 50%), linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
              border: `3px solid ${C.green}`,
              boxShadow: `0 8px 0 #0d3d22, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)`,
            }}>
              <div style={{ position: 'absolute', inset: 5, border: `1px solid ${alpha(C.green, 0.28)}`, borderRadius: 14, pointerEvents: 'none', zIndex: 1 }}/>
              {/* Header */}
              <div style={{ background: `linear-gradient(90deg, ${alpha(C.green, 0.18)}, ${alpha(C.green, 0.04)})`, padding: '14px 16px 12px', borderBottom: `1px solid ${alpha(C.green, 0.18)}`, position: 'relative', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.green, boxShadow: `0 0 8px ${C.green}` }}/>
                      <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.green, letterSpacing: '0.22em', fontWeight: 900 }}>NEXT 記録会</span>
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: `-1px -1px 0 #061224, 1px -1px 0 #061224, -1px 1px 0 #061224, 1px 1px 0 #061224` }}>{dueTT.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub, marginTop: 3, letterSpacing: '0.06em' }}>{dueTT.date.replace(/-/g, '/')}</div>
                  </div>
                  <div style={{ padding: '5px 12px', borderRadius: 20, flexShrink: 0, background: `linear-gradient(180deg, #66BB6A 0%, ${C.green} 60%, #0d5a30 100%)`, border: `2px solid #0d3d22`, fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.bg, boxShadow: `0 3px 0 #0a2e1a, inset 0 1px 0 rgba(255,255,255,0.4)` }}>TIME TRIAL</div>
                </div>
              </div>
              {/* Info tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr', padding: '10px 16px', gap: 0, background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.2) 100%)`, borderBottom: `1px solid ${alpha(C.green, 0.15)}`, position: 'relative', zIndex: 2 }}>
                <div style={{ textAlign: 'center', padding: '2px 0' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '1px', marginBottom: 2 }}>種目</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: SAIRA }}>{distLabel}</div>
                </div>
                <div style={{ width: 1, alignSelf: 'center', height: 24, background: `linear-gradient(180deg, transparent, #0d5a30, transparent)` }}/>
                <div style={{ textAlign: 'center', padding: '2px 0' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '1px', marginBottom: 2 }}>距離</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: SAIRA }}>{distKm}km</div>
                </div>
              </div>
              {/* CTA */}
              <div style={{ padding: '10px 14px 12px', position: 'relative', zIndex: 2 }}>
                <button className="btn-game btn-game--gold" style={{ width: '100%', border: 'none', cursor: 'pointer' }}>
                  <span className="btn-game__inner" style={{ fontSize: 14, padding: '11px 14px', borderRadius: 12 }}>
                    記録会を開催
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </span>
                </button>
              </div>
            </div>
            )
          })()
          : nextRaceData ? (
            <NextRaceCard
              race={nextRaceData.race}
              raceNumber={nextRaceData.number}
              totalRaces={nextRaceData.total}
              variant={nextRaceData.kind}
              onClick={() => navigate('/race')}
            />
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: C.border3, fontSize: 13, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 14 }}>
              レーススケジュール未設定
            </div>
          )}
        </div>
      )}

      {/* ── 順位 / 選手（横並びの四角） ── */}
      <div style={{ margin: '0 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '22px 0 8px' }}>
          <div style={{ width: 2, height: 12, background: C.cyan }}/>
          <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, letterSpacing: '2.5px', color: C.cyan }}>CLUB</span>
          <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.6) }}/>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* 順位表 */}
          <div onClick={() => navigate('/standings')} className="btn-press" style={{ ...sqStyle, cursor: 'pointer' }}>
            <div style={sqTitleRow}>
              <span style={sqTitle}>順位表</span>
              <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.6) }}/>
              <span style={{ color: C.textGhost, fontSize: 14 }}>›</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {miniRows.map((s2, i2) => {
                const t = teams.find(tm => tm.id === s2.teamId)
                const isMe = s2.teamId === playerTeamId
                return (
                  <div key={s2.teamId} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 11.5,
                    borderTop: i2 === 0 ? 'none' : `1px solid ${alpha(C.border3, 0.35)}`,
                    color: isMe ? C.cyan : C.textSub,
                  }}>
                    <span style={{ width: 14, fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: isMe ? C.cyan : C.textDim }}>
                      {s2.rank}
                    </span>
                    {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={16}/>}
                    <span style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{t?.shortName ?? s2.teamId}</span>
                    <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900 }}>{s2.totalPoints}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 選手 */}
          <div onClick={() => navigate('/team/roster')} className="btn-press" style={{ ...sqStyle, cursor: 'pointer' }}>
            <div style={sqTitleRow}>
              <span style={sqTitle}>選手</span>
              <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.6) }}/>
              <span style={{ color: C.textGhost, fontSize: 14 }}>›</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {topPlayer && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <PlayerFace playerId={topPlayer.id} nationality={topPlayer.nationality} size={44}/>
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {topPlayer.name}
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                      {SPECIALTY_LABELS[topPlayer.specialty]} ・ {topPlayer.age}歳
                    </div>
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, flexShrink: 0 }}>{ovr(topPlayer)}</div>
                </div>
              )}
              <div style={{
                display: 'flex', marginTop: 10, paddingTop: 9,
                borderTop: `1px solid ${alpha(C.border3, 0.35)}`,
              }}>
                {[
                  { v: `${mainPlayers.length}`, k: '在籍' },
                  { v: `${avgOvrAll}`, k: '平均OVR' },
                  { v: `${expiring}`, k: 'FA間近', warn: expiring > 0 },
                ].map(x => (
                  <div key={x.k} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, lineHeight: 1, color: x.warn ? C.red : C.text }}>{x.v}</div>
                    <div style={{ fontSize: 9, color: C.textDim, marginTop: 3 }}>{x.k}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── KEY PLAYERS ── */}
      {currentSeason.phase !== 'preseason' && mainPlayers.length > 0 && (
        <KeyPlayersSection players={mainPlayers} team={team} />
      )}

      {/* ── NEWS ── */}
      {(() => {
        const catColor: Record<string, string> = { race: C.gold, fa: C.cyan, draft: C.green, trade: C.orange, college: C.textSub, injury: C.red, finance: C.blue }
        const catLabel: Record<string, string> = { race: 'RACE', fa: 'FA', draft: 'DRAFT', trade: 'TRADE', college: 'COLLEGE', injury: 'INJURY', finance: 'FINANCE' }
        const catIcon: Record<string, React.ReactNode> = {
          race: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 4a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/><path d="M5.5 20l3-6 3 3 3-5 3.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
          fa: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 14l4 4-4 4M21 18h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
          draft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
          trade: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 16V4m0 0L3 8m4-4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
          college: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 9l10 6 10-6-10-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M2 9v6M7 12v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
          injury: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
          finance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 1.5-1 2-2.5 2.5S9 13.5 9 15s1.1 2 3 2 3-1 3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
        }
        const filtered = currentSeason.newsFeed.slice(0, 5)
        return (
          <div style={{ margin: '0 18px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '22px 0 8px' }}>
              <div style={{ width: 2, height: 12, background: C.cyan }}/>
              <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, letterSpacing: '2.5px', color: C.cyan }}>NEWS</span>
              <div style={{ flex: 1, height: 1, background: alpha(C.border3, 0.6) }}/>
              <button onClick={() => navigate('/news')} style={{ background: 'none', border: 'none', color: C.textDim, fontSize: 11, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>すべて ›</button>
            </div>
            {filtered.length === 0 ? (
              <div style={{
                padding: '22px 0', textAlign: 'center', color: C.textGhost, fontSize: 12,
                borderTop: `1px solid ${alpha(C.border3, 0.6)}`, borderBottom: `1px solid ${alpha(C.border3, 0.6)}`,
              }}>ニュースなし</div>
            ) : filtered.map((news, i) => {
              const col = catColor[news.category] ?? C.textDim
              return (
                <div
                  key={i}
                  onClick={() => navigate('/news', { state: { cat: news.category } })}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', cursor: 'pointer',
                    borderTop: i === 0 ? `1px solid ${alpha(C.border3, 0.6)}` : 'none',
                    borderBottom: `1px solid ${alpha(C.border3, 0.35)}`,
                  }}
                >
                  <div style={{ width: 20, flexShrink: 0, display: 'flex', justifyContent: 'center', color: col }}>
                    {catIcon[news.category] ?? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.45 }}>{news.headline}</div>
                    <div style={{ fontSize: 10.5, color: C.textDim, marginTop: 3 }}>
                      {catLabel[news.category] ?? news.category.toUpperCase()} ・ {news.date.slice(5)}
                    </div>
                  </div>
                  <span style={{ color: C.textGhost, fontSize: 15 }}>›</span>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* シーズン更新前の広告分岐。「広告を見て進む」か「広告を消す（GMパス）」 */}
      {seasonAdAsk && (
        <ConfirmDialog
          title={`${currentSeason.year + 1}シーズンへ進みます`}
          message="このあと広告が1回流れます。"
          accent={C.gold}
          confirmLabel="広告を見て進む"
          cancelLabel="やめる"
          onConfirm={goNextSeasonWithAd}
          onCancel={() => setSeasonAdAsk(false)}
        >
          <button
            onClick={() => { setSeasonAdAsk(false); setGmPassOpen(true) }}
            className="btn-press"
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 11, cursor: 'pointer',
              background: `linear-gradient(180deg, ${alpha(C.gold, 0.2)}, ${alpha(C.gold, 0.06)})`,
              border: `1.5px solid ${alpha(C.gold, 0.5)}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="2.5" y="14" width="19" height="6" rx="1.6" stroke={C.gold} strokeWidth="1.7"/>
              <path d="M4 21.5L20 4" stroke={C.gold} strokeWidth="1.9" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 13, fontWeight: 900, color: C.gold }}>GMパスで広告を消す（買い切り）</span>
          </button>
        </ConfirmDialog>
      )}
      {gmPassOpen && <GmPassSheet onClose={() => setGmPassOpen(false)} />}

      {/* レース／シーズン終了で得たジュエルの内訳。結果画面では出さず、ホームに戻ったここで知らせる */}
      <JewelGainPopup />

    </div>
  )
}
