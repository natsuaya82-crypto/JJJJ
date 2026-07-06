import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { runWithLoading } from '../../store/loadingStore'
import PressButton from '../ui/PressButton'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { SectionLabel } from '../ui'
import HeroCard from './HeroCard'
import KeyPlayersSection from './KeyPlayersSection'
import NextRaceCard from './NextRaceCard'
import { SPECIALTY_LABELS } from '../../types'
import type { Race } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function StepDoneIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function StepBadge({ n, done, color }: { n: number; done: boolean; color: string }) {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: done ? alpha(color, 0.18) : alpha(color, 0.12),
      border: `2px solid ${done ? color : alpha(color, 0.5)}`,
      boxShadow: done ? `0 0 10px ${alpha(color, 0.4)}` : 'none',
    }}>
      {done
        ? <StepDoneIcon color={color} />
        : <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color }}>{n}</span>
      }
    </div>
  )
}

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
  year, isFirstSeason, campBonus, reserveLeagueJoined, draftState,
  rosterSubmitted, mainCount, secondCount, lastRank, objectivesCount,
  onClaimCards, onReserve, onDraft, onStart, navigate,
}: {
  year: number
  isFirstSeason: boolean
  campBonus?: { type: string; applied: boolean }
  reserveLeagueJoined?: boolean
  draftState: DraftState
  rosterSubmitted: boolean
  mainCount: number
  secondCount: number
  lastRank: number
  objectivesCount: number
  onClaimCards: () => void
  onReserve: (v: boolean) => void
  onDraft: () => void
  onStart: () => void
  navigate: (path: string) => void
}) {
  const rosterDone  = rosterSubmitted
  const campDone    = !!campBonus?.applied
  const reserveDone = reserveLeagueJoined !== undefined
  const draftDone   = isFirstSeason || (!!draftState && draftState.isComplete)
  const allReady    = rosterDone && campDone && (isFirstSeason || reserveDone) && draftDone

  return (
    <div style={{ padding: '14px 12px 0' }}>
      {/* 全体カード */}
      <div style={{
        borderRadius: 20, overflow: 'hidden', position: 'relative',
        background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
        border: `3px solid ${allReady ? C.gold : alpha(C.gold, 0.5)}`,
        boxShadow: allReady
          ? `0 8px 0 #8b6914, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3)`
          : `0 5px 0 #5a3500, 0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)`,
      }}>
        <div style={{ position: 'absolute', inset: 5, border: `1px solid rgba(245,200,66,0.22)`, borderRadius: 14, pointerEvents: 'none', zIndex: 0 }}/>

        {/* ヘッダー */}
        <div style={{
          padding: '16px 18px 14px', position: 'relative', zIndex: 1,
          background: `linear-gradient(90deg, ${alpha(C.gold, 0.14)}, transparent)`,
          borderBottom: `1px solid ${alpha(C.gold, 0.18)}`,
        }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 3 }}>
            {year} PRE-SEASON
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text, marginBottom: 2,
            textShadow: `-1px -1px 0 #061224, 1px -1px 0 #061224, -1px 1px 0 #061224, 1px 1px 0 #061224` }}>
            {isFirstSeason ? '開幕準備' : '新シーズン準備'}
          </div>
          <div style={{ fontSize: 11, color: C.textSub }}>
            {isFirstSeason ? 'スカッドを提出してカードを受け取り、開幕へ' : 'ドラフト・カード受取を済ませてシーズン開幕へ'}
          </div>
        </div>

        {/* ① ドラフト — 2年目以降のみ（先にドラフトで新人を獲得してからスカッド提出） */}
        {!isFirstSeason && (
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
            <StepBadge n={1} done={draftDone} color={draftDone ? C.green : C.gold}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: draftDone ? C.textDim : C.text }}>新人ドラフト</div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
                {draftDone ? '指名完了' : '今年の新入団選手を指名する'}
              </div>
            </div>
            {!draftDone && (
              <button onClick={onDraft} className="btn-press" style={{
                padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: SAIRA, flexShrink: 0,
                fontSize: 12, fontWeight: 900,
                background: `linear-gradient(180deg, ${C.goldHi} 0%, ${C.gold} 60%, ${C.goldDark} 100%)`,
                border: `2px solid #8b6914`, color: C.bg,
                boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.4)`,
              }}>開催 →</button>
            )}
          </div>
        )}

        {/* ② スカッド提出 */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <StepBadge n={isFirstSeason ? 1 : 2} done={rosterDone} color={rosterDone ? C.green : C.gold}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: rosterDone ? C.textDim : C.text }}>
              {rosterDone ? 'スカッド提出完了' : 'スカッド提出'}
            </div>
            <div style={{ fontSize: 11, color: rosterDone ? C.green : C.textDim, marginTop: 1 }}>
              {rosterDone ? `1軍 ${mainCount}名 · リザーブ ${secondCount}名` : '1軍16〜20名を選んで提出（必須）'}
            </div>
          </div>
          <button onClick={() => navigate('/roster-select')} className="btn-press" style={{
            padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: SAIRA, flexShrink: 0,
            fontSize: 12, fontWeight: 900,
            ...(rosterDone
              ? { background: C.surface, border: `1px solid ${C.border2}`, color: C.textDim, boxShadow: 'none' }
              : { background: `linear-gradient(180deg, ${C.goldHi} 0%, ${C.gold} 60%, ${C.goldDark} 100%)`, border: `2px solid #8b6914`, color: C.bg, boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.4)` }
            ),
          } as React.CSSProperties}>
            {rosterDone ? '再編集' : '編成する →'}
          </button>
        </div>

        {/* ③ リザーブリーグ — 2年目以降のみ */}
        {!isFirstSeason && (
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: reserveDone ? 0 : 10 }}>
              <StepBadge n={3} done={reserveDone} color={reserveDone ? C.green : C.cyan}/>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: reserveDone ? C.textDim : C.text }}>
                  {reserveDone ? `リザーブリーグ — ${reserveLeagueJoined ? '参加' : '不参加'}` : 'リザーブリーグ参加'}
                </div>
                {!reserveDone && <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>若手の実戦経験（疲労増加あり）</div>}
              </div>
            </div>
            {!reserveDone && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => onReserve(true)} className="btn-press" style={{
                  flex: 1, padding: '11px 4px', borderRadius: 11, cursor: 'pointer',
                  fontFamily: SAIRA, fontSize: 12, fontWeight: 900,
                  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                  border: `2px solid ${C.cyan}`, color: C.cyan,
                  boxShadow: `0 4px 0 #0e3f5a, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.07)`,
                }}>参加する</button>
                <button onClick={() => onReserve(false)} className="btn-press" style={{
                  flex: 1, padding: '11px 4px', borderRadius: 11, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                  background: C.surface, border: `1px solid ${C.border2}`, color: C.textDim,
                  boxShadow: `0 2px 0 rgba(0,0,0,0.4)`,
                }}>見送る</button>
              </div>
            )}
          </div>
        )}

        {/* ④ シーズン目標の確認 */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
          <StepBadge n={isFirstSeason ? 2 : 4} done color={C.green}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>今シーズンの目標</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
              {objectivesCount > 0 ? `${objectivesCount}件の目標を確認（達成で報酬）` : '目標を確認する'}
            </div>
          </div>
          <button onClick={() => navigate('/objectives')} className="btn-press" style={{
            padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: SAIRA, flexShrink: 0,
            fontSize: 12, fontWeight: 900,
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            border: `2px solid ${C.blue}`, color: C.blue,
            boxShadow: `0 3px 0 #2a3580, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}>確認 →</button>
        </div>

        {/* ⑤ シーズン前カード */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${alpha(C.gold, 0.1)}`, position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: campDone ? 0 : 10 }}>
            <StepBadge n={isFirstSeason ? 3 : 5} done={campDone} color={campDone ? C.green : C.cyan}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: campDone ? C.textDim : C.text }}>
                {campDone ? 'カード受取完了' : 'シーズン前カード'}
              </div>
              {!campDone && (
                <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>
                  {isFirstSeason ? '開幕記念カード配布（6枚）' : lastRank >= 15 ? `前年${lastRank}位 — 救済カード配布（7枚）` : `前年${lastRank}位 — カード配布（6枚）`}
                </div>
              )}
            </div>
          </div>
          {!campDone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {preseasonCardDist(lastRank).map(({ rarity, count }) => (
                  <div key={rarity} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 9px', borderRadius: 7,
                    background: `${RARITY_COLOR[rarity]}18`,
                    border: `1px solid ${RARITY_COLOR[rarity]}55`,
                  }}>
                    <span style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 900, color: RARITY_COLOR[rarity] }}>{RARITY_LABEL[rarity]}</span>
                    <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: RARITY_COLOR[rarity] }}>×{count}</span>
                  </div>
                ))}
              </div>
              <button onClick={onClaimCards} className="btn-press" style={{
                width: '100%', padding: '11px 4px', borderRadius: 11, cursor: 'pointer',
                fontFamily: SAIRA, fontSize: 12, fontWeight: 900,
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${C.cyan}`, color: C.cyan,
                boxShadow: `0 4px 0 #0e3f5a, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
              }}>受け取る</button>
            </div>
          )}
        </div>

        {/* 開幕ボタン */}
        <div style={{ padding: '14px 18px', position: 'relative', zIndex: 1,
          background: allReady ? `linear-gradient(90deg, ${alpha(C.gold, 0.1)}, transparent)` : 'transparent',
        }}>
          {!allReady && (
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10, textAlign: 'center' }}>
              上記の準備を済ませると開幕できます。スキップも可能です。
            </div>
          )}
          {allReady ? (
            <button className="btn-game btn-game--gold" onClick={() => { onStart(); navigate('/schedule') }} style={{ width: '100%' }}>
              <span className="btn-game__inner">{year}シーズン 開幕！</span>
            </button>
          ) : (
            <button onClick={() => { onStart(); navigate('/schedule') }} style={{
              width: '100%', padding: 15, borderRadius: 13,
              background: C.surface, color: C.textDim,
              fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${C.border2}`,
              boxShadow: `0 2px 0 rgba(0,0,0,0.4)`,
            }}>
              {year}シーズン 開幕
            </button>
          )}
        </div>
      </div>
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
    claimPreseasonCards, setReserveLeagueJoined,
    startRegularSeason, initObjectivesIfEmpty,
  } = useGameStore()
  const navigate = useNavigate()
  useEffect(() => {
    initObjectivesIfEmpty()
  }, [])
  const team = teams.find(t => t.id === playerTeamId)
  if (!team) return null

  const gmRepVal = gmRep ?? 50
  const mainPlayers = players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main')
  const avgMorale = mainPlayers.length > 0
    ? Math.round(mainPlayers.reduce((s, p) => s + (p.morale ?? 70), 0) / mainPlayers.length) : 70

  const hasReserve = currentSeason.reserveLeagueJoined === true
  const stIdx = currentSeason.secondTeamRaceIndex ?? 0
  const nextMainRace = currentSeason.races[currentSeason.currentRaceIndex] ?? null
  const nextReserveRace = hasReserve ? (currentSeason.secondTeamRaces ?? [])[stIdx] ?? null : null
  type NextRaceData = { race: Race; kind: 'main' | 'reserve'; number: number; total: number }
  const nextRaceCandidates: NextRaceData[] = [
    ...(nextMainRace ? [{ race: nextMainRace, kind: 'main' as const, number: currentSeason.currentRaceIndex + 1, total: currentSeason.races.length }] : []),
    ...(nextReserveRace ? [{ race: nextReserveRace, kind: 'reserve' as const, number: stIdx + 1, total: (currentSeason.secondTeamRaces ?? []).length }] : []),
  ]
  const nextRaceData = nextRaceCandidates.sort((a, b) => a.race.date.localeCompare(b.race.date))[0] ?? null
  const seasonDone = currentSeason.currentRaceIndex >= currentSeason.races.length && currentSeason.races.length > 0
  const sorted = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const myRank = sorted.findIndex(s => s.teamId === playerTeamId) + 1
  const lastSeason = pastSeasons[pastSeasons.length - 1]
  const lastRank = lastSeason?.standings?.length
    ? [...lastSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints).findIndex(s => s.teamId === playerTeamId) + 1
    : 0

  /* Season end */
  const isChampion = seasonDone && sorted[0]?.teamId === playerTeamId
  const segWins = currentSeason.races.filter(r => r.results)
    .flatMap(r => r.results!.segmentResults)
    .filter(sr => sr.runners[0]?.teamId === playerTeamId)
    .reduce((acc, sr) => { const w = sr.runners[0]?.playerId; if (w) acc[w] = (acc[w] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const mvpEntry = Object.entries(segWins).sort((a, b) => b[1] - a[1])[0]
  const mvp = mvpEntry ? players.find(p => p.id === mvpEntry[0]) : null
  const mvpWins = mvpEntry?.[1] ?? 0
  const rookie = (() => {
    const pool = mainPlayers.filter(p => p.draftYear >= currentSeason.year - 1)
    return pool.length > 0 ? [...pool].sort((a, b) => ovr(b) - ovr(a))[0] : null
  })()

  const RANK_COLOR = (r: number) => r === 1 ? C.gold : r === 2 ? '#c5c5d4' : r === 3 ? '#cd7f32' : C.textDim

  const unresolvedMandatoryCount = players.filter(p => {
    if (p.teamId !== playerTeamId || p.status !== 'active') return false
    if (p.contract.yearsLeft !== 1) return false
    const req = (currentSeason.contractRequests ?? []).find(r => r.playerId === p.id)
    return req?.status !== 'accepted' && req?.status !== 'rejected'
  }).length

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

      {/* ── QUICK ACTIONS ── */}
      <div style={{ padding: '0 12px 16px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {([
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
            label: '年間予定', path: '/schedule', color: C.gold, shadow: '#5a3500',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M3 6h18M16 10a4 4 0 01-8 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
            label: 'ショップ', path: '/shop', color: C.cyan, shadow: '#0e3f5a',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            label: 'シーズン目標', path: '/objectives', color: C.blue, shadow: '#2a3580',
          },
          {
            icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
            label: 'チャット', path: '/team/chat', color: C.green, shadow: '#0d3d22',
          },
        ] as const).map(({ icon, label, path, color, shadow }) => (
          <PressButton
            key={path}
            onClick={() => navigate(path)}
            style={{
              background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
              border: `2px solid ${color}`,
              borderRadius: 14, padding: '14px 4px 11px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
              cursor: 'pointer', fontFamily: 'inherit',
              color,
              position: 'relative', overflow: 'hidden',
              boxShadow: `0 5px 0 ${shadow}, 0 8px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.25)`,
            }}
          >
            <div style={{ position: 'absolute', top: 3, left: 6, right: 6, height: '36%', background: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)', borderRadius: '6px 6px 50% 50%', pointerEvents: 'none' }}/>
            <div style={{ position: 'relative', zIndex: 1 }}>{icon}</div>
            <div style={{ fontFamily: "'Saira Condensed', system-ui, sans-serif", fontSize: 10, fontWeight: 700, color, lineHeight: 1.3, textAlign: 'center', letterSpacing: '0.04em', position: 'relative', zIndex: 1 }}>{label}</div>
          </PressButton>
        ))}
      </div>

      {/* ── PHASE CONTENT ── */}
      {currentSeason.phase === 'preseason' ? (
        <PreseasonHub
          year={currentSeason.year}
          isFirstSeason={pastSeasons.length === 0}
          campBonus={currentSeason.campBonus}
          reserveLeagueJoined={currentSeason.reserveLeagueJoined}
          draftState={draftState}
          rosterSubmitted={!!currentSeason.rosterSubmitted}
          mainCount={mainPlayers.length}
          secondCount={players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'second').length}
          lastRank={lastRank}
          objectivesCount={currentSeason.objectives.length}
          onClaimCards={claimPreseasonCards}
          onReserve={setReserveLeagueJoined}
          onDraft={beginSeasonDraft}
          onStart={startRegularSeason}
          navigate={navigate}
        />
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
                {mvp && mvpWins > 0 && (
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(C.gold, 0.3)}` }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: '2px', marginBottom: 3 }}>MVP</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{mvp.name}</div>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>区間賞 {mvpWins}回</div>
                  </div>
                )}
                {rookie && (
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(C.green, 0.3)}` }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.green, letterSpacing: '2px', marginBottom: 3 }}>新人王</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{rookie.name}</div>
                    <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>OVR {ovr(rookie)}</div>
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
              {null /* TODO: 世界駅伝選手権（未実装） */}
              {unresolvedMandatoryCount > 0 && (
                <div style={{ fontSize: 11, color: C.orange, textAlign: 'center', marginBottom: 10 }}>
                  契約未解決の選手が{unresolvedMandatoryCount}人います — 契約管理で対応してください
                </div>
              )}
              <button
                className="btn-game btn-game--gold"
                onClick={() => runWithLoading('シーズンを更新中…', endSeason, 800)}
                style={{ width: '100%' }}
              >
                <span className="btn-game__inner">{currentSeason.year + 1}シーズン開幕へ →</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* 通常シーズン */
        <div style={{ padding: '0 12px 16px' }}>
          {nextRaceData ? (
            <NextRaceCard
              race={nextRaceData.race}
              raceNumber={nextRaceData.number}
              totalRaces={nextRaceData.total}
              onClick={() => navigate(nextRaceData.kind === 'reserve' ? '/reserve' : '/race')}
            />
          ) : (
            <div style={{ padding: 16, textAlign: 'center', color: C.border3, fontSize: 13, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 14 }}>
              レーススケジュール未設定
            </div>
          )}
        </div>
      )}

      {/* ── STANDINGS ── */}
      <div style={{ margin: '0 12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
          <h2 className="section-h2">{currentSeason.year} 順位</h2>
          <button onClick={() => navigate('/teams')} style={{ background: 'none', border: 'none', color: C.cyan, fontSize: 11, fontWeight: 700, fontFamily: SAIRA, letterSpacing: '0.1em', cursor: 'pointer', padding: 0 }}>FULL →</button>
        </div>
        <div className="standings-card">
          {sorted.slice(0, 5).map((s, i) => {
            const t = teams.find(tm => tm.id === s.teamId)
            const isMe = s.teamId === playerTeamId
            const rank = i + 1
            const rc = RANK_COLOR(rank)
            const isLeader = rank === 1
            return (
              <div key={s.teamId} onClick={() => navigate(`/teams/detail/${s.teamId}`)} style={{
                padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < 4 ? `1px solid ${alpha(C.gold, 0.12)}` : 'none',
                background: isMe
                  ? `linear-gradient(90deg, ${alpha(C.cyan, 0.13)} 0%, transparent 80%)`
                  : isLeader
                  ? `linear-gradient(90deg, ${alpha(C.gold, 0.08)} 0%, transparent 80%)`
                  : 'transparent',
                position: 'relative', zIndex: 2, cursor: 'pointer',
              }}>
                {isMe && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${C.cyan}, ${alpha(C.cyan, 0.5)})`, boxShadow: `0 0 10px ${C.cyan}` }}/>}
                {isLeader && !isMe && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.4)})`, boxShadow: `0 0 8px ${alpha(C.gold, 0.6)}` }}/>}
                <div style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 20, width: 26, textAlign: 'center', color: rc, flexShrink: 0,
                  textShadow: isLeader ? `0 0 10px ${alpha(C.gold, 0.6)}` : isMe ? `0 0 8px ${alpha(C.cyan, 0.4)}` : 'none',
                }}>{rank}</div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20}/>}
                <div style={{ flex: 1, fontSize: 13, fontWeight: isMe || isLeader ? 700 : 400, color: isMe ? C.text : isLeader ? C.goldHi : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? s.teamId}</div>
                <div style={{ fontFamily: SAIRA, fontWeight: 900, fontSize: 15, color: isMe ? C.cyan : isLeader ? C.gold : C.textSub, flexShrink: 0,
                  textShadow: isLeader ? `0 0 8px ${alpha(C.gold, 0.5)}` : isMe ? `0 0 8px ${alpha(C.cyan, 0.5)}` : 'none',
                }}>
                  {s.totalPoints} <span style={{ fontSize: 10, opacity: 0.7 }}>PT</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── KEY PLAYERS ── */}
      {currentSeason.phase !== 'preseason' && mainPlayers.length > 0 && (
        <KeyPlayersSection players={mainPlayers} team={team} />
      )}

      {/* ── LEGENDS ── */}
      {team.history.legends && team.history.legends.length > 0 && (
        <div style={{ padding: '0 12px 16px' }}>
          <SectionLabel style={{ marginBottom: 10 }}>フランチャイズ名鑑</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {team.history.legends.map((legend, i) => (
              <div key={i} style={{
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${C.goldDark}`,
                borderRadius: 12, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: `0 3px 0 #5a3500, 0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 9, flexShrink: 0,
                  background: `linear-gradient(135deg, ${alpha(C.gold, 0.25)}, ${alpha(C.gold, 0.08)})`,
                  border: `1px solid ${alpha(C.gold, 0.4)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2l2.5 7.5H22l-6.5 4.7 2.5 7.5L12 17.5l-6 4.2 2.5-7.5L2 9.5h7.5L12 2z" fill={C.gold} opacity="0.9"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{legend.name}</div>
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>
                    {SPECIALTY_LABELS[legend.specialty]} · 引退{legend.retiredYear} · OVR {legend.peakOvr}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.gold, textShadow: `0 0 8px ${alpha(C.gold, 0.5)}` }}>{legend.career.championships}優</div>
                </div>
              </div>
            ))}
          </div>
        </div>
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
          <div style={{ margin: '0 12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 className="section-h2">ニュース</h2>
              <button onClick={() => navigate('/news')} style={{ background: 'none', border: 'none', color: C.gold, fontSize: 11, fontWeight: 700, fontFamily: SAIRA, letterSpacing: '0.1em', cursor: 'pointer', padding: 0 }}>FULL →</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: C.border3, fontSize: 13, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 12 }}>
                  ニュースなし
                </div>
              ) : filtered.map((news, i) => {
                const col = catColor[news.category] ?? C.textDim
                return (
                  <div key={i} style={{
                    background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                    border: `2px solid ${C.goldDark}`, borderRadius: 12, padding: 10,
                    display: 'flex', alignItems: 'center', gap: 10,
                    boxShadow: `0 3px 0 #5a3500, 0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
                  }}>
                    <div style={{ width: 36, height: 36, flexShrink: 0, background: `linear-gradient(180deg, ${C.surface3} 0%, #0f2440 100%)`, border: `1px solid ${alpha(col, 0.4)}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>
                      {catIcon[news.category] ?? <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: col, marginBottom: 2 }}>
                        {catLabel[news.category] ?? news.category.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.45 }}>{news.headline}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 700, color: C.textDim }}>{news.date.slice(5)}</div>
                      <button
                        onClick={() => navigate('/news', { state: { cat: news.category } })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: alpha(col, 0.7), fontSize: 13, fontFamily: SAIRA, fontWeight: 900, lineHeight: 1 }}
                      >
                        →
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
