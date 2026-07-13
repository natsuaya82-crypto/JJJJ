import { useState, useEffect, useRef } from 'react'
import { useGameStore } from '../../store/gameStore'
import type { Player, Specialty, Team, GrowthCurve, TeamRole } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, SPEC_COLOR, ratingColor, faMarketSalary, statCapBand } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { useAdHeight } from '../layout/Layout'
import PlayerFace from '../player/PlayerFace'
import NumberDial from '../ui/NumberDial'
import { audio } from '../../utils/audio'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type SortKey = 'ovr' | 'potential' | 'age'
type TabKey = 'players' | 'board' | 'teams'
type PickLog = {
  pickNum: number; teamId: string; teamName: string; teamShort: string
  playerName: string; playerId: string; specialty: Specialty | null; isPlayer: boolean
}

const GROWTH_LABEL: Record<GrowthCurve, string> = { early: '早熟', normal: '標準', late_bloomer: '晩成' }
const GROWTH_COLOR: Record<GrowthCurve, string> = { early: C.orange, normal: C.blue, late_bloomer: C.green }

// ドラフト後の契約設定用
const DC_CONTRACT_OPTS = [
  { key: 'standard' as const, label: '本契約' },
  { key: 'dual' as const, label: '2way契約' },
  { key: 'development' as const, label: '育成契約' },
]
const DC_ROLE_OPTS: { key: TeamRole; label: string }[] = [
  { key: 'ace', label: 'エース' },
  { key: 'key_player', label: '主力' },
  { key: 'sub_ace', label: 'サブ' },
  { key: 'rotation', label: 'ローテ' },
  { key: 'development', label: '育成' },
]
const DC_SALARY_STEP = 1000000
const DC_SALARY_MIN = 3000000
// ドラフト新人でも年俸は市場相場の半分未満には下げられない（極端に安く囲えないようにする）
function draftSalaryFloor(p: Player): number {
  const half = Math.round(faMarketSalary(p) / 2 / DC_SALARY_STEP) * DC_SALARY_STEP
  return Math.max(DC_SALARY_MIN, half)
}
const DC_SALARY_MAX = 60000000
function dcFmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}
type DraftContract = { salary: number; years: number; contractType: 'standard' | 'development' | 'dual'; teamRole: TeamRole | null }
const PERSONALITY_LABEL: Record<string, string> = { salary: '年俸重視', winning: '勝利志向', loyalty: 'チーム愛' }
const PERSONALITY_ICON: Record<string, string>  = { salary: '¥', winning: '★', loyalty: '♡' }
const PERSONALITY_COLOR: Record<string, string> = { salary: C.orange, winning: C.gold, loyalty: C.pink }

function getTeamNeeds(teamId: string, picks: PickLog[], allPlayers: Player[]): Specialty[] {
  const drafted = picks.filter(p => p.teamId === teamId).map(p => allPlayers.find(pl => pl.id === p.playerId)).filter(Boolean) as Player[]
  const existing = allPlayers.filter(p => p.teamId === teamId && p.rosterTier === 'main')
  const all = [...existing, ...drafted]
  const specs: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const counts = specs.reduce((acc, s) => { acc[s] = all.filter(p => p.specialty === s).length; return acc }, {} as Record<Specialty, number>)
  return [...specs].sort((a, b) => counts[a] - counts[b]).slice(0, 2)
}

function getAIBuzz(player: Player, teams: Team[], playerTeamId: string, pickLog: PickLog[], allPlayers: Player[]): number {
  return teams
    .filter(t => t.id !== playerTeamId)
    .filter(t => getTeamNeeds(t.id, pickLog, allPlayers).includes(player.specialty))
    .length
}

const SELECT_STYLE: React.CSSProperties = {
  padding: '6px 24px 6px 10px',
  borderRadius: '8px',
  border: `1px solid ${C.border2}`,
  backgroundColor: C.surface2,
  color: C.textSub,
  fontSize: '11px',
  fontWeight: '700',
  fontFamily: SAIRA,
  cursor: 'pointer',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238c9aaf'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
  backgroundSize: '8px',
  flexShrink: 0,
}

function PickedPlayerSheet({ playerId, players, onClose }: {
  playerId: string; players: Player[]; onClose: () => void
}) {
  const adH = useAdHeight()
  const p = players.find(pl => pl.id === playerId)
  if (!p) return null
  const rating = ovr(p)
  const isElite = rating >= 80
  const ovrCol = ratingColor(rating)
  const growthLabel = GROWTH_LABEL[p.growthCurve]
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 180 }}/>
      <div style={{
        position: 'fixed', bottom: adH, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', zIndex: 190,
        background: C.surface, borderRadius: '20px 20px 0 0',
        border: `1px solid ${C.border2}`, borderBottom: 'none',
        padding: '20px 16px 40px',
      }}>
        <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: C.border2, margin: '0 auto 16px' }}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <PlayerFaceCard playerId={p.id} nationality={p.nationality} color={ovrCol} size={48}/>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: C.text }}>{p.name}</div>
            <div style={{ fontSize: '11px', color: C.textSub, marginTop: '2px' }}>
              {SPECIALTY_LABELS[p.specialty]} / {p.age}歳 / {growthLabel}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
            <div style={{
              fontSize: '28px', fontWeight: '900', lineHeight: 1, fontFamily: SAIRA,
              background: isElite ? 'linear-gradient(180deg,#FFD700,#C9A84C)' : `linear-gradient(180deg,${C.textSub},${C.textDim})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>{rating}</div>
            <div style={{ fontSize: '8px', color: C.textDim }}>OVR</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '4px', marginBottom: '12px' }}>
          {(['speed','stamina','mountainUp','mountainDown','pacing','mental','recovery'] as const).map(k => {
            const labels: Record<string,string> = { speed:'速力', stamina:'持久', mountainUp:'登り', mountainDown:'下り', pacing:'ペース', mental:'精神', recovery:'回復' }
            return (
              <div key={k} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: '8px', background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: '7px', color: C.textDim, marginBottom: '2px' }}>{labels[k]}</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: ratingColor(p.ratings[k]), fontFamily: SAIRA }}>{p.ratings[k]}</div>
              </div>
            )
          })}
        </div>
        {p.traits && p.traits.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {p.traits.map(t => (
              <span key={t} style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '7px', backgroundColor: alpha(C.blue, 0.12), color: C.blue, border: `1px solid ${alpha(C.blue, 0.28)}` }}>
                {t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export default function DraftRoom() {
  const { draftState, playerTeamId, teams, players, cpuPick, playerPick, advanceDraft, currentSeason, openPlayerSheet } = useGameStore()
  const adH = useAdHeight()
  const [tab, setTab]           = useState<TabKey>('players')
  const [sortKey, setSortKey]   = useState<SortKey>('ovr')
  const [filterSpec, setFilterSpec] = useState<Specialty | 'all'>('all')
  const [pickLog, setPickLog]   = useState<PickLog[]>([])
  const [myTurnFlash, setMyTurnFlash] = useState(false)
  const [pickAnnounce, setPickAnnounce] = useState<{ teamName: string; playerName: string; teamColor: string } | null>(null)
  const orderStripRef = useRef<HTMLDivElement>(null)
  const prevIsMyPickRef = useRef(false)

  const pool         = draftState?.pool         ?? []
  const pickOrder    = draftState?.pickOrder    ?? []
  const currentPick  = draftState?.currentPick  ?? 0
  const picks        = draftState?.picks        ?? []
  const isComplete   = draftState?.isComplete   ?? false
  const isMyPick     = !isComplete && pickOrder[currentPick] === playerTeamId

  useEffect(() => {
    if (isMyPick && !prevIsMyPickRef.current) {
      setMyTurnFlash(true)
      setTimeout(() => setMyTurnFlash(false), 2200)
    }
    prevIsMyPickRef.current = isMyPick
  }, [isMyPick])

  useEffect(() => {
    if (orderStripRef.current) {
      const el = orderStripRef.current.querySelector('[data-current="true"]') as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [currentPick])

  useEffect(() => {
    if (isComplete || isMyPick) return
    const t = setTimeout(() => {
      const state = useGameStore.getState()
      const ds = state.draftState
      if (!ds || ds.isComplete || ds.pickOrder[ds.currentPick] === playerTeamId) return
      const prevLen = ds.picks.length
      cpuPick()
      const after = useGameStore.getState().draftState
      if (after && after.picks.length > prevLen) {
        const pk  = after.picks[after.picks.length - 1]
        const team = state.teams.find(t => t.id === pk.teamId)
        const p   = state.players.find(pl => pl.id === pk.playerId)
        setPickLog(prev => [...prev, {
          pickNum: pk.pickNumber, teamId: pk.teamId,
          teamName: team?.name ?? '', teamShort: team?.shortName ?? '',
          playerName: pk.playerName, playerId: pk.playerId,
          specialty: p?.specialty ?? null,
          isPlayer: pk.teamId === playerTeamId,
        }])
        if (team && p) {
          setPickAnnounce({ teamName: team.shortName, playerName: pk.playerName, teamColor: team.colors.primary })
          setTimeout(() => setPickAnnounce(null), 1300)
        }
      }
    }, 1800)
    return () => clearTimeout(t)
  }, [currentPick, isComplete, isMyPick]) // eslint-disable-line

  if (!draftState) return null

  const currentTeam  = teams.find(t => t.id === pickOrder[currentPick])
  const round        = currentPick < 20 ? 1 : 2
  const pickInRound  = (currentPick % 20) + 1
  const myPicksDone  = picks.filter(p => p.teamId === playerTeamId).length
  const myPicksTotal = pickOrder.filter(id => id === playerTeamId).length
  const playerTeamObj = teams.find(t => t.id === playerTeamId)

  const specOrder: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
  const myRosterSpecs = [
    ...players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main').map(p => p.specialty),
    ...picks.filter(pk => pk.teamId === playerTeamId).map(pk => players.find(p => p.id === pk.playerId)?.specialty).filter(Boolean) as Specialty[],
  ]
  const needSpec = specOrder.reduce<Specialty>((least, s) =>
    myRosterSpecs.filter(x => x === s).length < myRosterSpecs.filter(x => x === least).length ? s : least
  , specOrder[0])

  const picksUntilMyTurn = pickOrder.slice(currentPick).findIndex(id => id === playerTeamId)

  const filtered = pool.filter(p => filterSpec === 'all' || p.specialty === filterSpec)
  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'potential') return b.potential - a.potential
    if (sortKey === 'age')       return a.age - b.age
    return ovr(b) - ovr(a)
  })
  const recommendId = sorted.find(p => p.specialty === needSpec)?.id ?? sorted[0]?.id ?? ''

  const scoutedIds = new Set((currentSeason?.scoutProspects ?? []).map(p => p.id))

  function skipToMyPick() {
    const MAX = 200
    let i = 0
    while (i < MAX) {
      const state = useGameStore.getState()
      const ds = state.draftState
      if (!ds || ds.isComplete || ds.pickOrder[ds.currentPick] === playerTeamId) break
      const prevLen = ds.picks.length
      cpuPick()
      const after = useGameStore.getState().draftState
      if (after && after.picks.length > prevLen) {
        const pk   = after.picks[after.picks.length - 1]
        const team = state.teams.find(t => t.id === pk.teamId)
        const p    = state.players.find(pl => pl.id === pk.playerId)
        setPickLog(prev => [...prev, {
          pickNum: pk.pickNumber, teamId: pk.teamId,
          teamName: team?.name ?? '', teamShort: team?.shortName ?? '',
          playerName: pk.playerName, playerId: pk.playerId,
          specialty: p?.specialty ?? null,
          isPlayer: false,
        }].slice(-80))
      }
      i++
    }
  }

  function handlePlayerPick(playerId: string) {
    playerPick(playerId)
    audio.playSe('great_success')
    const state = useGameStore.getState()
    const ds = state.draftState
    if (ds && ds.picks.length > 0) {
      const pk = ds.picks[ds.picks.length - 1]
      const p  = state.players.find(pl => pl.id === pk.playerId)
      setPickLog(prev => [...prev, {
        pickNum: pk.pickNumber, teamId: playerTeamId,
        teamName: playerTeamObj?.name ?? '', teamShort: playerTeamObj?.shortName ?? '',
        playerName: pk.playerName, playerId: pk.playerId,
        specialty: p?.specialty ?? null,
        isPlayer: true,
      }])
    }
  }

  if (isComplete) {
    return <DraftComplete picks={picks} teams={teams} playerTeamId={playerTeamId} onFinish={advanceDraft} />
  }

  const stripStart    = Math.max(0, currentPick - 2)
  const upcomingPicks = pickOrder.slice(stripStart, currentPick + 14)

  return (
    <div style={{
      height: '100svh', backgroundColor: C.bg,
      maxWidth: '480px', margin: '0 auto',
      // 上端はダイナミックアイランドの下（セーフエリア）から、下は広告＋ホームバーの上で止める
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: `calc(${adH}px + env(safe-area-inset-bottom))`,
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes fadeOut    { 0%{opacity:1;transform:scale(1)} 70%{opacity:1} 100%{opacity:0;transform:scale(1.05)} }
        @keyframes announceIn { from{opacity:0;transform:translate(-50%,-50%) scale(.9)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
        @keyframes pulse      { 0%,100%{opacity:1} 50%{opacity:.3} }
        @keyframes glow       { 0%,100%{box-shadow:0 0 14px rgba(245,200,66,.4)} 50%{box-shadow:0 0 28px rgba(245,200,66,.9)} }
        select option { background: ${C.surface2}; }
      `}</style>

      {myTurnFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200, pointerEvents: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: `radial-gradient(ellipse at center, ${alpha(C.gold, 0.28)} 0%, ${alpha(C.bg, 0.96)} 65%)`,
          animation: 'fadeOut 2.2s forwards',
        }}>
          <div style={{ fontSize: '48px', fontWeight: '900', color: C.gold, letterSpacing: '-1px', textShadow: `0 0 60px ${C.gold}`, fontFamily: SAIRA }}>
            指名ターン！
          </div>
          <div style={{ fontSize: '13px', color: C.textSub, marginTop: '6px' }}>{playerTeamObj?.name} の番です</div>
        </div>
      )}

      {pickAnnounce && (
        <div style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 150, pointerEvents: 'none',
          padding: '18px 28px', borderRadius: '20px', textAlign: 'center',
          background: `linear-gradient(135deg, ${alpha(pickAnnounce.teamColor, 0.22)}, ${alpha(pickAnnounce.teamColor, 0.06)})`,
          border: `1px solid ${alpha(pickAnnounce.teamColor, 0.5)}`,
          backdropFilter: 'blur(24px)',
          boxShadow: `0 0 60px ${alpha(pickAnnounce.teamColor, 0.28)}`,
          animation: 'announceIn 0.18s ease',
          minWidth: '240px',
        }}>
          <div style={{ fontSize: '11px', color: alpha(pickAnnounce.teamColor, 0.9), letterSpacing: '2px', marginBottom: '6px', fontWeight: 700 }}>
            {pickAnnounce.teamName} が指名
          </div>
          <div style={{ fontSize: '22px', fontWeight: '900', color: C.text, marginBottom: '5px' }}>
            {pickAnnounce.playerName}
          </div>
        </div>
      )}

      <div style={{
        padding: '12px 14px 0',
        background: `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0, zIndex: 40,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '3px', marginBottom: '2px' }}>
              JPEL DRAFT {currentSeason?.year ?? ''}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <div style={{ fontSize: '22px', fontWeight: '900', color: C.text, lineHeight: 1, fontFamily: SAIRA }}>
                第{round}巡<span style={{ fontSize: '13px', color: C.textSub, fontWeight: '600' }}>第</span>
                {pickInRound}<span style={{ fontSize: '13px', color: C.textSub, fontWeight: '600' }}>指名</span>
              </div>
              <div style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>全体 {currentPick + 1}/{pickOrder.length}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!isMyPick && picksUntilMyTurn > 0 && (
              <div style={{
                textAlign: 'center', padding: '5px 10px', borderRadius: '10px',
                background: C.surface, border: `1px solid ${C.border2}`,
              }}>
                <div style={{ fontSize: '16px', fontWeight: '900', color: C.textSub, lineHeight: 1, fontFamily: SAIRA }}>
                  {picksUntilMyTurn}
                </div>
                <div style={{ fontSize: '8px', color: C.textDim, marginTop: '1px' }}>指名待ち</div>
              </div>
            )}
            <div style={{
              textAlign: 'center', padding: '5px 10px', borderRadius: '10px',
              background: `linear-gradient(135deg, ${alpha(C.gold, 0.2)}, ${alpha(C.gold, 0.06)})`,
              border: `1px solid ${alpha(C.gold, 0.3)}`,
            }}>
              <div style={{ fontSize: '16px', fontWeight: '900', color: C.gold, lineHeight: 1, fontFamily: SAIRA, textShadow: '0 0 10px rgba(245,200,66,0.5)' }}>
                {myPicksDone}<span style={{ fontSize: '10px', color: C.textDim }}>/{myPicksTotal}</span>
              </div>
              <div style={{ fontSize: '8px', color: C.textDim, marginTop: '1px' }}>MY PICKS</div>
            </div>
            {!isMyPick && !isComplete && (
              <button onClick={skipToMyPick} style={{
                padding: '6px 11px', borderRadius: '10px',
                border: `2px solid ${C.blue}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                color: C.blue, fontSize: '10px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: `0 4px 0 #2a3580, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }}/>
                {myPicksDone < myPicksTotal ? '自番へ →' : '最後までスキップ →'}
              </button>
            )}
          </div>
        </div>

        <div style={{ height: '2px', backgroundColor: C.border2, borderRadius: '1px', overflow: 'hidden', marginBottom: '2px' }}>
          <div style={{
            height: '100%', width: `${(currentPick / pickOrder.length) * 100}%`,
            background: `linear-gradient(90deg, ${C.blue}, ${C.gold})`,
            transition: 'width 0.4s ease',
          }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '8px', color: C.textDim, fontFamily: SAIRA }}>第1巡</span>
          <span style={{ fontSize: '8px', color: currentPick >= 20 ? C.gold : C.textDim, fontFamily: SAIRA }}>第2巡</span>
        </div>

        <div ref={orderStripRef} style={{ display: 'flex', gap: '4px', overflowX: 'auto', padding: '0 0 8px', scrollbarWidth: 'none' }}>
          {upcomingPicks.map((teamId, i) => {
            const idx         = stripStart + i
            const isCurrent   = idx === currentPick
            const isMe        = teamId === playerTeamId
            const isPast      = idx < currentPick
            const t           = teams.find(tm => tm.id === teamId)
            const accentColor = isMe ? C.gold : (t?.colors.primary ?? C.border2)
            return (
              <div
                key={idx}
                data-current={isCurrent ? 'true' : undefined}
                style={{
                  flexShrink: 0, padding: '4px 9px', borderRadius: '8px',
                  border: `1px solid ${isCurrent ? alpha(accentColor, 0.7) : isPast ? C.border : alpha(accentColor, 0.22)}`,
                  background: isCurrent
                    ? `linear-gradient(135deg, ${alpha(accentColor, 0.22)}, ${alpha(accentColor, 0.06)})`
                    : isPast ? 'transparent' : C.surface,
                  opacity: isPast ? 0.3 : 1,
                  boxShadow: isCurrent ? `0 0 12px ${alpha(accentColor, 0.4)}` : 'none',
                  animation: isCurrent && isMe ? 'glow 1.5s infinite' : 'none',
                }}
              >
                <div style={{ fontSize: '7px', color: isCurrent ? accentColor : C.textDim, marginBottom: '1px', fontFamily: SAIRA }}>
                  {idx < 20 ? `R1-${(idx % 20) + 1}` : `R2-${(idx % 20) + 1}`}
                </div>
                <div style={{ fontSize: '10px', fontWeight: isCurrent ? '800' : '600', color: isCurrent ? accentColor : isMe ? C.gold : C.textSub, whiteSpace: 'nowrap', fontFamily: SAIRA }}>
                  {isMe ? '★ ' : ''}{t?.shortName ?? '?'}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{
          padding: '8px 12px', borderRadius: '10px', marginBottom: '8px',
          background: isMyPick ? `linear-gradient(135deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})` : C.surface,
          border: `1px solid ${isMyPick ? alpha(C.gold, 0.45) : C.border}`,
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <div style={{
            width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
            backgroundColor: isMyPick ? C.gold : currentTeam?.colors.primary ?? C.border3,
            boxShadow: isMyPick ? `0 0 8px ${alpha(C.gold, 0.8)}` : 'none',
            animation: !isMyPick ? 'pulse 1.2s infinite' : 'none',
          }}/>
          <div style={{ flex: 1, fontSize: '13px', fontWeight: '700', color: isMyPick ? C.gold : C.text, fontFamily: SAIRA }}>
            {isMyPick
              ? `${playerTeamObj?.shortName ?? ''} — ON THE CLOCK`
              : `${currentTeam?.shortName ?? ''} 指名中...`}
          </div>
          <div style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>残{pool.length}人</div>
        </div>

        <div style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '12px', background: C.surface2 }}>
          {(['players','board','teams'] as TabKey[]).map(key => {
            const labels: Record<TabKey, string> = { players: '選手プール', board: '指名ボード', teams: 'チーム動向' }
            const active = tab === key
            return (
              <button key={key} onClick={() => setTab(key)} style={{
                flex: 1, padding: '8px 4px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: '11px', fontWeight: active ? 800 : 500,
                borderRadius: 10,
                background: active
                  ? `linear-gradient(135deg, ${alpha(C.gold, 0.18)}, ${alpha(C.gold, 0.06)})`
                  : 'transparent',
                border: active
                  ? `1.5px solid ${alpha(C.gold, 0.4)}`
                  : '1.5px solid transparent',
                color: active ? C.gold : C.textDim,
              }}>
                {labels[key]}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '64px' }}>

        {tab === 'players' && (
          <>
            <div style={{
              padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center',
              borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg,
            }}>
              <div style={{ position: 'relative' }}>
                <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)} style={SELECT_STYLE}>
                  <option value="ovr">総合順</option>
                  <option value="potential">潜在力順</option>
                  <option value="age">年齢順</option>
                </select>
              </div>
              <div style={{ position: 'relative' }}>
                <select value={filterSpec} onChange={e => setFilterSpec(e.target.value as Specialty | 'all')} style={SELECT_STYLE}>
                  <option value="all">全タイプ</option>
                  <option value="ace">エース</option>
                  <option value="sprinter">スプリンター</option>
                  <option value="long">長距離</option>
                  <option value="mountain_up">山登り</option>
                  <option value="mountain_down">山下り</option>
                  <option value="allrounder">オールラウンダー</option>
                  <option value="kick">スパート型</option>
                  <option value="grinder">粘り型</option>
                </select>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontSize: '9px', color: C.textDim }}>必要:</span>
                <span style={{
                  fontSize: '9px', fontWeight: '800',
                  color: SPEC_COLOR[needSpec], padding: '2px 7px', borderRadius: '8px',
                  backgroundColor: alpha(SPEC_COLOR[needSpec], 0.12),
                  border: `1px solid ${alpha(SPEC_COLOR[needSpec], 0.3)}`,
                }}>
                  {SPECIALTY_LABELS[needSpec]}
                </span>
              </div>
            </div>

            <div style={{ padding: '8px 10px' }}>
              {sorted.map(p => (
                <PoolCard
                  key={p.id}
                  player={p}
                  isMyPick={isMyPick}
                  onPick={handlePlayerPick}
                  isScouted={scoutedIds.has(p.id)}
                  isRecommend={!isComplete && p.id === recommendId}
                  buzz={getAIBuzz(p, teams, playerTeamId, pickLog, players)}
                />
              ))}
              {sorted.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: C.textDim, fontSize: '13px' }}>該当選手なし</div>
              )}
            </div>
          </>
        )}

        {tab === 'board' && (
          <div style={{ padding: '10px 12px' }}>
            {[1, 2].map(r => {
              const rOrder = pickOrder.slice((r - 1) * 20, r * 20)
              return (
                <div key={r} style={{ marginBottom: '20px' }}>
                  <div style={{
                    fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '800',
                    marginBottom: '8px', padding: '6px 10px',
                    background: alpha(C.gold, 0.07), borderRadius: '8px',
                    borderLeft: `3px solid ${C.gold}`,
                    fontFamily: SAIRA,
                  }}>
                    第{r}巡
                  </div>
                  {rOrder.map((teamId, i) => {
                    const pickNum   = (r - 1) * 20 + i + 1
                    const pk        = pickLog.find(p => p.pickNum === pickNum)
                    const t         = teams.find(tm => tm.id === teamId)
                    const isMe      = teamId === playerTeamId
                    const isCurr    = pickNum === currentPick + 1
                    const accentColor = isMe ? C.gold : (t?.colors.primary ?? C.border2)
                    return (
                      <div key={pickNum} onClick={() => pk && openPlayerSheet(pk.playerId)} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '7px 12px', marginBottom: '2px', borderRadius: '10px',
                        background: isCurr ? alpha(accentColor, 0.12) : pk ? (isMe ? alpha(C.gold, 0.05) : C.surface) : 'transparent',
                        border: `1px solid ${isCurr ? alpha(accentColor, 0.4) : C.border}`,
                        opacity: !pk && !isCurr ? 0.45 : 1,
                        cursor: pk ? 'pointer' : 'default',
                      }}>
                        <span style={{ fontSize: '10px', color: C.textDim, minWidth: '20px', fontFamily: SAIRA }}>{pickNum}</span>
                        <div style={{ width: '3px', height: '26px', borderRadius: '2px', flexShrink: 0, background: `linear-gradient(180deg, ${accentColor}, ${alpha(accentColor, 0.6)})` }}/>
                        <div style={{ minWidth: '50px', flexShrink: 0 }}>
                          <span style={{ fontSize: '11px', fontWeight: '700', color: isMe ? C.gold : C.textSub }}>{t?.shortName ?? '?'}</span>
                        </div>
                        {pk ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: isMe ? C.gold : C.text }}>{pk.playerName}</span>
                            {pk.specialty && <span style={{ fontSize: '9px', color: SPEC_COLOR[pk.specialty], padding: '1px 5px', borderRadius: '4px', backgroundColor: alpha(SPEC_COLOR[pk.specialty], 0.1) }}>{SPECIALTY_LABELS[pk.specialty]}</span>}
                          </div>
                        ) : isCurr ? (
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: accentColor, animation: 'pulse 0.9s infinite' }}/>
                            <span style={{ fontSize: '11px', color: accentColor, fontWeight: '700' }}>指名中...</span>
                          </div>
                        ) : (
                          <span style={{ fontSize: '11px', color: C.textDim }}>―</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {tab === 'teams' && (
          <div style={{ padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', color: C.textDim, padding: '4px 4px 10px', lineHeight: 1.6 }}>
              各チームの補強ニーズと指名状況。自チームが狙う選手との競合を確認しよう。
            </div>
            {teams.map(t => {
              const isMe          = t.id === playerTeamId
              const teamPicks     = pickLog.filter(pk => pk.teamId === t.id)
              const needs         = getTeamNeeds(t.id, pickLog, players)
              const remaining     = pickOrder.slice(currentPick).filter(id => id === t.id).length
              const accentColor   = isMe ? C.gold : t.colors.primary
              const isRival       = !isMe && needs.includes(needSpec)
              return (
                <div key={t.id} style={{
                  marginBottom: '8px', padding: '12px 14px', borderRadius: '14px',
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${isRival ? C.red : isMe ? C.goldDark ?? '#b8860b' : C.border2}`,
                  boxShadow: isMe ? `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)` : 'none',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {isMe && <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: teamPicks.length > 0 ? '8px' : 0 }}>
                    <div style={{ width: '4px', height: '30px', borderRadius: '2px', flexShrink: 0, background: `linear-gradient(180deg, ${accentColor}, ${alpha(accentColor, 0.6)})` }}/>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '800', color: isMe ? C.gold : C.text }}>{t.shortName}</span>
                        {isMe && <span style={{ fontSize: '8px', color: C.gold, fontWeight: '700', padding: '1px 5px', borderRadius: '4px', backgroundColor: alpha(C.gold, 0.12) }}>自チーム</span>}
                        {isRival && <span style={{ fontSize: '8px', color: C.red, fontWeight: '700', padding: '1px 5px', borderRadius: '4px', backgroundColor: alpha(C.red, 0.12) }}>競合</span>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                        <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>指名{teamPicks.length}名</span>
                        <span style={{ fontSize: '10px', color: remaining > 0 ? C.blue : C.textDim, fontFamily: SAIRA }}>残{remaining}指名</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                      <div style={{ fontSize: '8px', color: C.textDim }}>補強ポジション</div>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {needs.map(s => (
                          <span key={s} style={{
                            fontSize: '9px', fontWeight: '700',
                            color: SPEC_COLOR[s], padding: '2px 5px', borderRadius: '5px',
                            backgroundColor: alpha(SPEC_COLOR[s], 0.12),
                            border: `1px solid ${alpha(SPEC_COLOR[s], 0.28)}`,
                          }}>
                            {SPECIALTY_LABELS[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {teamPicks.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {teamPicks.map(pk => {
                        return (
                          <div key={pk.pickNum} onClick={() => openPlayerSheet(pk.playerId)} style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            padding: '2px 7px', borderRadius: '7px',
                            backgroundColor: C.surface2,
                            border: `1px solid ${C.border}`,
                            cursor: 'pointer',
                          }}>
                            <span style={{ fontSize: '10px', color: isMe ? C.text : C.textSub }}>{pk.playerName.split(' ')[0]}</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 実機のAdMobバナーはsafe-areaの上に出るため、帯も同じ位置に合わせる（Layoutと同じ配置） */}
      {adH > 0 && (
        <div style={{
          position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px', height: '50px',
          backgroundColor: '#070610', borderTop: `1px solid ${C.border}`,
          zIndex: 60,
        }}/>
      )}
    </div>
  )
}

function PlayerFaceCard({ playerId, nationality, color, size = 38 }: {
  playerId: string; nationality: string; color: string; size?: number
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{
        borderRadius: Math.floor(size * 0.22),
        border: `1.5px solid ${alpha(color, 0.55)}`,
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <PlayerFace playerId={playerId} nationality={nationality as import('../../types').Nationality} size={size} />
      </div>
    </div>
  )
}

function StatNum({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: 'center', minWidth: '30px' }}>
      <div style={{ fontSize: '8px', color: C.textDim, marginBottom: '1px' }}>{label}</div>
      <div style={{ fontSize: '15px', fontWeight: '800', color: ratingColor(value), fontFamily: SAIRA, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

function PoolCard({ player: p, isMyPick, onPick, isScouted, isRecommend, buzz }: {
  player: Player; isMyPick: boolean; onPick: (id: string) => void
  isScouted?: boolean; isRecommend?: boolean; buzz?: number
}) {
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const specCol  = SPEC_COLOR[p.specialty]
  const rating   = ovr(p)
  const ovrCol   = ratingColor(rating)
  const isElite  = rating >= 80
  const isStar   = isElite || p.potential >= 92

  const growthLabel      = GROWTH_LABEL[p.growthCurve]
  const growthColor      = GROWTH_COLOR[p.growthCurve]
  const personalityColor = p.personality ? PERSONALITY_COLOR[p.personality] : C.textDim
  const personalityLabel = p.personality ? PERSONALITY_LABEL[p.personality] : null
  const personalityIcon  = p.personality ? PERSONALITY_ICON[p.personality] : null

  const isHotPick = (buzz ?? 0) >= 3
  const isWanted  = (buzz ?? 0) >= 2

  return (
    <div style={{ marginBottom: '8px' }}>
      <div
        onClick={() => openPlayerSheet(p.id)}
        style={{
          borderRadius: '14px',
          background: `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
          border: isMyPick
            ? `1px solid ${alpha(ovrCol, 0.55)}`
            : isRecommend
            ? `1px solid ${alpha(C.gold, 0.45)}`
            : isStar
            ? `1px solid ${alpha(C.gold, 0.22)}`
            : `1px solid ${alpha(specCol, 0.3)}`,
          boxShadow: isStar ? `0 0 12px ${alpha(C.gold, 0.06)}` : 'none',
          overflow: 'hidden', cursor: 'pointer', position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '3px',
          background: `linear-gradient(180deg, ${specCol}, ${alpha(specCol, 0.6)})`,
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 12px 12px 16px' }}>
          <PlayerFaceCard playerId={p.id} nationality={p.nationality} color={ovrCol} size={38}/>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: '700', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </span>
              {p.nationality === 'FOREIGN' && (
                <span style={{ padding: '1px 4px', borderRadius: '3px', backgroundColor: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.25)}`, fontSize: '8px', color: C.blue, fontWeight: '700', flexShrink: 0 }}>外</span>
              )}
              {isRecommend && (
                <span style={{ padding: '1px 5px', borderRadius: '4px', flexShrink: 0, backgroundColor: alpha(C.green, 0.18), border: `1px solid ${alpha(C.green, 0.4)}`, fontSize: '8px', color: C.green, fontWeight: '800' }}>補強ニーズ◎</span>
              )}
              {isScouted && (
                <span style={{ padding: '1px 5px', borderRadius: '4px', flexShrink: 0, backgroundColor: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.25)}`, fontSize: '8px', color: C.blue, fontWeight: '700' }}>偵察済</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ padding: '2px 6px', borderRadius: '10px', backgroundColor: alpha(specCol, 0.08), border: `1px solid ${alpha(specCol, 0.3)}`, fontSize: '9px', fontWeight: '700', color: specCol }}>
                {SPECIALTY_LABELS[p.specialty]}
              </span>
              <span style={{ fontSize: '10px', color: C.textDim }}>{p.age}歳</span>
              <span style={{ fontSize: '9px', fontWeight: '700', color: growthColor, padding: '1px 5px', borderRadius: '5px', backgroundColor: alpha(growthColor, 0.1) }}>
                {growthLabel}
              </span>
              {personalityLabel && (
                <span style={{ fontSize: '9px', color: personalityColor, padding: '1px 5px', borderRadius: '5px', backgroundColor: alpha(personalityColor, 0.1) }}>
                  {personalityIcon} {personalityLabel}
                </span>
              )}
            </div>
          </div>

          <div style={{ textAlign: 'center', flexShrink: 0, minWidth: '52px' }}>
            <div style={{
              fontSize: '26px', fontWeight: '900', lineHeight: 1, fontFamily: SAIRA,
              background: isElite
                ? 'linear-gradient(180deg, #FFD700, #C9A84C)'
                : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {rating}
            </div>
            <div style={{ fontSize: '8px', color: C.textDim, letterSpacing: '1px', marginTop: '-1px' }}>OVR</div>
            {isWanted && (
              <div style={{ fontSize: '8px', fontWeight: '800', color: isHotPick ? C.red : C.orange, marginTop: '3px', lineHeight: 1, fontFamily: SAIRA }}>
                {isHotPick ? '激戦' : '競合'}{buzz}
              </div>
            )}
          </div>

        </div>

        <div style={{
          display: 'flex', gap: '4px', justifyContent: 'space-between',
          padding: '4px 16px 12px',
          borderTop: `1px solid ${alpha(C.border2, 0.5)}`,
        }}>
          <StatNum label="速力" value={p.ratings.speed}/>
          <StatNum label="持久" value={p.ratings.stamina}/>
          <StatNum label="登り" value={p.ratings.mountainUp}/>
          <StatNum label="下り" value={p.ratings.mountainDown}/>
          <StatNum label="ペース" value={p.ratings.pacing}/>
          <StatNum label="精神" value={p.ratings.mental}/>
          <StatNum label="回復" value={p.ratings.recovery}/>
        </div>
      </div>

      {isMyPick && (
        <button className="btn-game btn-game--gold" onClick={e => { e.stopPropagation(); onPick(p.id) }} style={{ width: '100%', marginTop: '6px' }}>
          <span className="btn-game__inner" style={{ textShadow: '-1.25px 0 0 #061224, 1.25px 0 0 #061224, 0 -1.25px 0 #061224, 0 1.25px 0 #061224, -1.25px -1.25px 0 #061224, 1.25px -1.25px 0 #061224, -1.25px 1.25px 0 #061224, 1.25px 1.25px 0 #061224, 0 1px 2px rgba(0,0,0,0.5)' }}>{p.name} を指名する</span>
        </button>
      )}
    </div>
  )
}

function DraftComplete({ picks, teams, playerTeamId, onFinish }: {
  picks: { pickNumber: number; teamId: string; playerId: string; playerName: string }[]
  teams: { id: string; name: string; shortName: string; colors: { primary: string; secondary: string } }[]
  playerTeamId: string
  onFinish: () => void
}) {
  const adH = useAdHeight()
  const myPicks    = picks.filter(p => p.teamId === playerTeamId)
  const playerTeam = teams.find(t => t.id === playerTeamId)
  const { players, setDraftContract } = useGameStore()

  const myDrafted = myPicks
    .map(pk => players.find(pl => pl.id === pk.playerId))
    .filter((p): p is Player => !!p)

  const [contracts, setContracts] = useState<Record<string, DraftContract>>(() => {
    const init: Record<string, DraftContract> = {}
    for (const p of myDrafted) {
      const o = ovr(p)
      init[p.id] = {
        salary: Math.min(DC_SALARY_MAX, Math.max(draftSalaryFloor(p), Math.round(p.contract.annualSalary / DC_SALARY_STEP) * DC_SALARY_STEP)),
        years: 3,
        contractType: 'standard',
        teamRole: o >= 82 ? 'ace' : o >= 75 ? 'key_player' : o >= 68 ? 'rotation' : 'development',
      }
    }
    return init
  })
  const upd = (id: string, patch: Partial<DraftContract>) => setContracts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const handleFinish = () => {
    // 契約設定の途中で1件でも失敗しても開幕（onFinish）は必ず実行する（ボタン無反応＝開幕しないを防ぐ）
    for (const p of myDrafted) {
      const c = contracts[p.id]
      try { if (c) setDraftContract(p.id, c.salary, c.years, c.contractType, c.teamRole ?? undefined) }
      catch (e) { console.error('[draft] setDraftContract failed', p.id, e) }
    }
    onFinish()
  }

  return (
    <div style={{
      minHeight: '100svh', backgroundColor: C.bg,
      maxWidth: '480px', margin: '0 auto',
      display: 'flex', flexDirection: 'column', padding: '0 0 130px',
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
    }}>
      {/* 実機のAdMobバナーはsafe-areaの上に出るため、帯も同じ位置に合わせる（Layoutと同じ配置） */}
      {adH > 0 && (
        <div style={{
          position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px', height: '50px',
          backgroundColor: '#070610', borderTop: `1px solid ${C.border}`,
          zIndex: 60,
        }}/>
      )}

      <div style={{
        padding: '40px 24px 28px', textAlign: 'center',
        background: `radial-gradient(ellipse at top, ${alpha(C.gold, 0.16)} 0%, transparent 60%)`,
      }}>
        <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '3px', marginBottom: '6px', fontWeight: '800', fontFamily: SAIRA }}>DRAFT COMPLETE</div>
        <div style={{ fontSize: '28px', fontWeight: '900', color: C.text, marginBottom: '4px', fontFamily: SAIRA }}>ドラフト終了</div>
        <div style={{ fontSize: '13px', color: C.textSub }}>{playerTeam?.name} 指名 {myPicks.length}名</div>
      </div>

      <div style={{ padding: '0 16px 24px' }}>
        <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '12px', padding: '0 2px', fontFamily: SAIRA }}>契約を決める（年俸・役割・契約形態・年数）</div>
        {myDrafted.map(p => {
          const rating = ovr(p)
          const ovrCol = ratingColor(rating)
          const c = contracts[p.id]
          if (!c) return null
          const salaryMin = draftSalaryFloor(p)
          const btn = (active: boolean): React.CSSProperties => ({
            flex: 1, padding: '5px 2px', borderRadius: 6, border: 'none', cursor: 'pointer',
            backgroundColor: active ? C.blue : C.surface, color: active ? '#fff' : C.textDim,
            fontSize: 10, fontWeight: active ? 800 : 500, fontFamily: 'inherit',
          })
          return (
            <div key={p.id} style={{
              padding: '12px 14px', borderRadius: '14px', marginBottom: '10px',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark ?? '#b8860b'}`,
              boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4)`,
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PlayerFaceCard playerId={p.id} nationality={p.nationality} color={ovrCol} size={34}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: C.text }}>{p.name}</div>
                  <div style={{ fontSize: '10px', color: C.textDim }}>{SPECIALTY_LABELS[p.specialty]} / {p.age}歳 · {GROWTH_LABEL[p.growthCurve]}</div>
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: ovrCol }}>{rating}</div>
              </div>

              {/* 年俸 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: C.textDim, width: 28, flexShrink: 0 }}>年俸</span>
                <div style={{ flex: 1 }}>
                  <NumberDial value={c.salary} onChange={v => upd(p.id, { salary: Math.max(salaryMin, Math.min(DC_SALARY_MAX, v)) })} min={salaryMin} max={DC_SALARY_MAX} accent={C.gold} />
                </div>
              </div>
              {/* 契約年数 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: C.textDim, width: 28, flexShrink: 0 }}>年数</span>
                {[1, 2, 3, 4].map(y => (
                  <button key={y} onClick={() => upd(p.id, { years: y })} style={btn(c.years === y)}>{y}年</button>
                ))}
              </div>
              {/* 契約形態は廃止（フラット化）。全員standard固定のため選択UIは非表示 */}
              {false && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, color: C.textDim, width: 28, flexShrink: 0 }}>形態</span>
                {DC_CONTRACT_OPTS.map(o => (
                  <button key={o.key} onClick={() => upd(p.id, { contractType: o.key })} style={btn(c.contractType === o.key)}>{o.label}</button>
                ))}
              </div>
              )}
              {/* 役割 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 9, color: C.textDim, width: 28, flexShrink: 0 }}>役割</span>
                {DC_ROLE_OPTS.map(o => (
                  <button key={o.key} onClick={() => upd(p.id, { teamRole: o.key })} style={btn(c.teamRole === o.key)}>{o.label}</button>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{
        // 広告バナーはsafe-area基点で描画されるので、ボタンもsafe-area分を足さないと重なる
        position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', zIndex: 61,
        padding: '10px 16px 12px',
        background: `linear-gradient(180deg, transparent, ${C.bg} 28%)`,
      }}>
        <button className="btn-game btn-game--gold" onClick={handleFinish} style={{ width: '100%' }}>
          <span className="btn-game__inner">契約を確定してシーズン開幕へ！</span>
        </button>
      </div>
    </div>
  )
}
