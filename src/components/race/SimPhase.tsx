import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Race, Player, WorldClub } from '../../types'
import type { RaceSegmentEvent } from '../../engine/interactiveRace'
import { choiceSuccessProb } from '../../engine/interactiveRace'
import { formatDiff } from '../../engine/raceEngine'
import {
  legBoardAt, legEndAt, runnerAt, snapshotAt,
  type RaceTimeline, type TimelineSnapshot,
} from '../../engine/raceTimeline'
import { terrainColor, terrainLabel } from './raceUtils'
import { C, alpha, glassStyle, rankColor, SAIRA, bottomStack, F } from '../../styles/tokens'
import { TeamLogoSVG } from '../icons/Icons'
import { audio } from '../../utils/audio'
import { useAdHeight } from '../layout/Layout'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { FaceOrDot } from './SegmentDetailCard'
import PillTabs from '../ui/PillTabs'
import ScreenPortal from '../ui/ScreenPortal'
import { useStickyTab } from '../../lib/useStickyTab'
import { clubById } from '../../utils/world'
import { focusTeamOf, useRaceClock } from './useRaceClock'

/** その区間（`race.segments` の添字）をそのチームで走る選手 */
export type RunnerIdOf = (teamId: string, leg: number) => string | undefined

const BOARDS = ['total', 'leg'] as const

// レーストラック表示。位置と差は `engine/raceTimeline` だけから出す（ここで計算しない）
export function RaceTrack({
  race, raceTeams, players, playerTeamId, timeline, t, runnerIdOf, renderStage,
}: {
  race: Race
  raceTeams: readonly WorldClub[]
  players?: Player[]
  playerTeamId: string
  timeline: RaceTimeline
  /** レース秒（`useRaceClock`） */
  t: number
  runnerIdOf: RunnerIdOf
  /** 一覧の上に差し込む口（2.0.9 の3D）。同じ時計の同じ瞬間を渡す */
  renderStage?: (snap: TimelineSnapshot) => ReactNode
}) {
  const longPress = usePlayerLongPress()
  const [board, setBoard] = useStickyTab('board', BOARDS, 'total')
  const snap = snapshotAt(timeline, t)
  const focusId = focusTeamOf(timeline, playerTeamId, t)
  const focus = focusId ? runnerAt(timeline, focusId, t) : null
  const leg = focus?.leg ?? 0
  const currentSeg = race.segments[leg]
  const distanceKm = timeline.distances[leg] ?? 0
  const legStartKm = timeline.startKm[leg] ?? 0
  const segCol = currentSeg ? terrainColor(currentSeg.uphillPct, currentSeg.downhillPct) : C.blue

  const rows = board === 'total'
    ? snap.overall.map(s => ({ teamId: s.teamId, gap: s.gap as number | null, raceKm: s.raceKm, runnerId: runnerIdOf(s.teamId, s.leg) }))
    : legBoardAt(timeline, t, leg).map(r => ({
        ...r,
        raceKm: runnerAt(timeline, r.teamId, t)?.raceKm ?? 0,
        runnerId: runnerIdOf(r.teamId, leg),
      }))

  const myRank = snap.overall.findIndex(p => p.teamId === playerTeamId) + 1
  const prevRankRef = useRef(0)
  const overtakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [overtakeKey, setOvertakeKey] = useState(0)
  const [showOvertake, setShowOvertake] = useState(false)
  const [overtakeCount, setOvertakeCount] = useState(0)

  useEffect(() => {
    const prev = prevRankRef.current
    prevRankRef.current = myRank
    if (prev > 0 && myRank > 0 && myRank < prev) {
      setOvertakeCount(prev - myRank)
      setOvertakeKey(k => k + 1)
      setShowOvertake(true)
      if (overtakeTimerRef.current) clearTimeout(overtakeTimerRef.current)
      overtakeTimerRef.current = setTimeout(() => setShowOvertake(false), 1800)
    }
  }, [myRank])
  const flash = showOvertake && board === 'total'

  return (
    <div>
      <style>{`
        @keyframes overtake-glow { 0%{opacity:1} 100%{opacity:0} }
        @keyframes overtake-arrow { 0%{opacity:0;transform:translateY(5px) translateX(-50%)} 20%{opacity:1;transform:translateY(-1px) translateX(-50%)} 75%{opacity:1;transform:translateY(-1px) translateX(-50%)} 100%{opacity:0;transform:translateY(-1px) translateX(-50%)} }
      `}</style>
      {/* 区間情報ヘッダー（自チームの走者の区間。走っていなければ先頭の区間） */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 10px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.45)})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: F.title, fontWeight: 900, color: C.bg, flexShrink: 0,
          }}>{currentSeg?.index}</div>
          {currentSeg && (
            <div>
              <div style={{ fontSize: F.sub, fontWeight: 800, color: segCol }}>{currentSeg.distanceKm.toFixed(1)} km</div>
              <div style={{ fontSize: F.caption, color: C.textDim }}>{terrainLabel(currentSeg.uphillPct, currentSeg.downhillPct, currentSeg.distanceKm)}</div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.text, fontFamily: SAIRA, lineHeight: 1 }}>
            {(focus?.km ?? 0).toFixed(1)}
          </div>
          <div style={{ fontSize: F.caption, color: C.textDim }}>/ {distanceKm.toFixed(1)} km</div>
        </div>
      </div>

      {renderStage?.(snap)}

      <div style={{ padding: '4px 0' }}>
        <PillTabs labels={['総合', '区間']} value={BOARDS.indexOf(board)} onChange={i => setBoard(BOARDS[i])} fill style={{ padding: '6px 12px' }} />
        {rows.map((row, rank) => {
          const tm = clubById(raceTeams, row.teamId)
          if (!tm) return null
          const isMe = row.teamId === playerTeamId
          // 棒はヘッダーの区間の中の位置（先の区間にいるチームは満タン、まだ来ていないチームは空）
          const pct = distanceKm > 0 ? Math.max(0, Math.min(1, (row.raceKm - legStartKm) / distanceKm)) * 100 : 0
          const rankCol = rankColor(rank + 1)
          const player = players?.find(p => p.id === row.runnerId)

          return (
            <div key={row.teamId} {...(row.runnerId ? longPress(row.runnerId) : {})} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px',
              background: isMe ? alpha(segCol, 0.07) : 'transparent',
              borderLeft: isMe ? `3px solid ${segCol}` : '3px solid transparent',
              borderBottom: `1px solid ${C.border}`,
              position: 'relative', overflow: 'hidden',
              cursor: row.runnerId ? 'pointer' : 'default',
            }}>
              {/* オーバーテイクフラッシュ */}
              {isMe && flash && (
                <div key={`flash-${overtakeKey}`} style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                  background: `linear-gradient(90deg, ${alpha(C.green, 0.4)}, transparent 70%)`,
                  animation: 'overtake-glow 1.8s ease forwards',
                }} />
              )}
              {/* 順位 + 矢印 */}
              <div style={{
                width: 20, textAlign: 'center', flexShrink: 0, position: 'relative', zIndex: 1,
                fontSize: rank < 3 ? 15 : 12, fontWeight: 900,
                color: isMe && flash ? C.green : rankCol, fontFamily: SAIRA,
              }}>
                {row.gap != null && rank + 1}
                {isMe && flash && (
                  <div key={`arrow-${overtakeKey}`} style={{
                    position: 'absolute', bottom: '100%', left: '50%',
                    fontSize: F.label, fontWeight: 900, color: C.green, fontFamily: SAIRA,
                    animation: 'overtake-arrow 1.8s ease forwards',
                    whiteSpace: 'nowrap',
                  }}>↑{overtakeCount > 1 ? overtakeCount : ''}</div>
                )}
              </div>

              {/* 選手顔 */}
              <div style={{ position: 'relative', zIndex: 1, flexShrink: 0 }}>
                <FaceOrDot playerId={player?.id} nationality={player?.nationality} size={30} />
              </div>

              {/* テキスト + バー */}
              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                  <TeamLogoSVG primary={tm.colors.primary} secondary={tm.colors.secondary} shortName={tm.shortName} teamId={tm.id} logoId={tm.logoId} size={16} />
                  <span style={{ fontSize: F.caption, fontWeight: 700, color: isMe ? segCol : tm.colors.primary, flexShrink: 0 }}>{tm.shortName}</span>
                  {player && (
                    <span style={{ fontSize: F.label, fontWeight: isMe ? 800 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {player.name}
                    </span>
                  )}
                </div>
                <div style={{ position: 'relative', height: 5,background: C.border2 }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${pct}%`,
                    background: isMe
                      ? `linear-gradient(90deg, ${segCol}, ${alpha(segCol, 0.5)})`
                      : `linear-gradient(90deg, ${alpha(tm.colors.primary, 0.8)}, ${alpha(tm.colors.primary, 0.3)})`,
                  }} />
                </div>
              </div>

              {/* タイム差（折り返し禁止：折り返すと行高が変わり下位がガタつくため） */}
              <div style={{ minWidth: 52, textAlign: 'right', flexShrink: 0, fontFamily: SAIRA, position: 'relative', zIndex: 1, whiteSpace: 'nowrap' }}>
                {row.gap == null ? null : rank === 0 ? (
                  <span style={{ fontSize: F.label, color: C.gold, fontWeight: 900, whiteSpace: 'nowrap' }}>TOP</span>
                ) : (
                  <span style={{ fontSize: F.body, fontWeight: 700, color: isMe ? C.red : C.textDim, whiteSpace: 'nowrap' }}>
                    {formatDiff(row.gap)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type Props = {
  race: Race
  raceTeams: readonly WorldClub[]
  players: Player[]
  playerTeamId: string
  timeline: RaceTimeline
  runnerIdOf: RunnerIdOf
  /** 自チームの走者に出るイベント。`leg` はそのイベントの区間（`race.segments` の添字） */
  pending?: { leg: number; event: RaceSegmentEvent } | null
  lowStaminaHint?: boolean
  segStamina?: number
  /** 選んだ肢と、選んだ時刻（レース秒） */
  onChoiceMade?: (choiceIdx: number, t: number) => void
  /** 自チームの走者がその区間（添字）を走り終えた */
  onHandoff?: (leg: number) => void
  /** 「この区間をスキップ」。自チームの走者の残りのイベントを捨てる */
  onSkipLeg?: () => void
  /** 全チームが走り終えたあとの「最終結果を見る」 */
  onFinish: () => void
}

export function SimPhase({
  race, raceTeams, players, playerTeamId, timeline, runnerIdOf,
  pending = null, lowStaminaHint = false, segStamina = 0,
  onChoiceMade, onHandoff, onSkipLeg, onFinish,
}: Props) {
  const adH = useAdHeight()

  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [eventIntro, setEventIntro] = useState(false)
  const [peekRace, setPeekRace] = useState(false)
  const [manualPause, setManualPause] = useState(false)  // 手動の一時停止
  // イベントは自チームの走者の位置で出て、そこで時計を止める
  const eventAt = (at: number) => {
    const r = pending ? runnerAt(timeline, playerTeamId, at) : null
    return !!pending && !!r && !r.finished && r.leg === pending.leg
      && r.km / (timeline.distances[r.leg] || 1) >= pending.event.trigger.min
  }
  const { t, jumpTo } = useRaceClock(timeline, playerTeamId, { pausedAt: at => manualPause || eventAt(at) })
  const me = runnerAt(timeline, playerTeamId, t)
  const pendingEvent = pending && eventAt(t) ? pending.event : null

  // タスキを渡した区間を伝える（飛ばした区間があっても1本ずつ順に）
  const handedRef = useRef(0)
  const handed = me ? race.segments.filter((_, j) => { const end = legEndAt(timeline, playerTeamId, j); return end != null && end <= t }).length : 0
  useEffect(() => {
    while (handedRef.current < handed) onHandoff?.(handedRef.current++)
  }, [handed, onHandoff])

  // イベントが発火したら選択状態をリセット＋「イベント発生」演出
  const activeEventId = pendingEvent?.id ?? null
  useEffect(() => {
    setSelectedChoice(null)
    setPeekRace(false)
    if (!activeEventId) { setEventIntro(false); return }
    setEventIntro(true)
    audio.playSe('event')
    const tm = setTimeout(() => setEventIntro(false), 900)
    return () => clearTimeout(tm)
  }, [activeEventId])

  function handleChoice(i: number) {
    if (selectedChoice !== null) return
    setSelectedChoice(i)
    setTimeout(() => onChoiceMade?.(i, t), 380)
  }

  // 「この区間をスキップ」：速さを決めているチームの区間の終わりへ（走り終えていればゴールへ）
  function skipLeg() {
    const id = focusTeamOf(timeline, playerTeamId, t)
    const r = id ? runnerAt(timeline, id, t) : null
    const end = id && r && !r.finished ? legEndAt(timeline, id, r.leg) : null
    if (me && !me.finished) onSkipLeg?.()
    jumpTo(end != null && end > t ? end : timeline.endTime)
  }

  const done = t >= timeline.endTime
  const totalSegs = race.segments.length
  const focusId = focusTeamOf(timeline, playerTeamId, t)
  const focusLeg = (focusId ? runnerAt(timeline, focusId, t)?.leg : 0) ?? 0
  const currentSeg = race.segments[focusLeg]
  const progressPct = totalSegs > 0 && currentSeg ? (currentSeg.index / totalSegs) * 100 : 0
  const segCol = currentSeg ? terrainColor(currentSeg.uphillPct, currentSeg.downhillPct) : C.blue

  // ── イベント発生：ヘッダーと広告の間に固定（スクロールなし）──
  if (pendingEvent && !peekRace) {
    return (
      <ScreenPortal>
        <div style={{
          fontFamily: SAIRA,
          position: 'fixed', top: 52, bottom: bottomStack(adH), left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, zIndex: 30, overflow: 'hidden',
          background: `radial-gradient(ellipse at 50% 30%, ${alpha(segCol, 0.22)} 0%, ${C.bg} 65%)`,
          display: 'flex', flexDirection: 'column',
        }}>
          <style>{`
            @keyframes ev-pop { 0%{opacity:0;transform:scale(0.6)} 55%{opacity:1;transform:scale(1.08)} 100%{opacity:1;transform:scale(1)} }
            @keyframes ev-in  { from{opacity:0;transform:translateY(18px)} to{opacity:1;transform:translateY(0)} }
            @keyframes ev-line { from{width:0} to{width:64px} }
          `}</style>

          {eventIntro ? (
            /* 発生演出 */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <div style={{ height: 2, background: segCol, animation: 'ev-line 0.5s ease forwards', boxShadow: `0 0 10px ${segCol}` }} />
              <div style={{ fontSize: 34, fontWeight: 900, color: C.text, letterSpacing: 4, animation: 'ev-pop 0.6s cubic-bezier(0.2,0.8,0.3,1.2) forwards', textShadow: `0 0 20px ${alpha(segCol, 0.6)}` }}>
                イベント発生
              </div>
              <div style={{ fontSize: F.body, fontWeight: 800, color: segCol, letterSpacing: 3, animation: 'ev-in 0.5s ease 0.2s both' }}>
                {pendingEvent.type}
              </div>
            </div>
          ) : (
            /* 選択画面 */
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', animation: 'ev-in 0.3s ease' }}>
              {/* 状況 */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: F.caption, fontWeight: 900, letterSpacing: 3, color: segCol, textShadow: `0 0 8px ${alpha(segCol, 0.5)}` }}>{pendingEvent.type}</span>
                  <span style={{ fontSize: F.caption, color: C.textDim }}>{currentSeg?.index}区</span>
                  {lowStaminaHint && (
                    <span style={{ marginLeft: 'auto', fontSize: F.caption, fontWeight: 800, color: C.red }}>スタミナ低下</span>
                  )}
                </div>
                <div style={{ fontSize: F.title, fontWeight: 700, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>
                  {pendingEvent.situation}
                </div>
                {pendingEvent.battleContext && (
                  <div style={{ fontSize: F.body, color: C.textSub, lineHeight: 1.6 }}>{pendingEvent.battleContext}</div>
                )}
                {/* レース状況を別画面で確認 */}
                <button onClick={() => setPeekRace(true)} style={{
                  alignSelf: 'flex-start', marginTop: 16,
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px',cursor: 'pointer',
                  background: 'transparent', border: `1px solid ${alpha(segCol, 0.5)}`,
                  color: segCol, fontFamily: SAIRA, fontSize: F.body, fontWeight: 700,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  </svg>
                  レース状況を見る
                </button>
              </div>

              {/* 選択肢 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pendingEvent.choices.map((c, i) => {
                  const sel = selectedChoice === i
                  const label = lowStaminaHint && c.lowStaminaText ? c.lowStaminaText : c.text
                  const effortType = pendingEvent._effects[i]?.effortType
                  const prob = effortType ? choiceSuccessProb(effortType, segStamina, pendingEvent.opponentOvr ?? segStamina) : 1
                  const isSure = prob >= 1
                  const probPct = Math.round(prob * 100)
                  const probCol = isSure ? C.green : probPct >= 65 ? C.green : probPct >= 40 ? C.gold : C.red
                  return (
                    <button
                      key={c.id}
                      onClick={() => handleChoice(i)}
                      disabled={selectedChoice !== null}
                      style={{
                        width: '100%', textAlign: 'left', padding: '14px 16px',
                        cursor: selectedChoice !== null ? 'default' : 'pointer',
                        ...glassStyle(sel ? segCol : C.textSub),
                        // 選んだ肢だけ光らせる（ガラスの影に足す）
                        ...(sel ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), 0 0 18px ${alpha(segCol, 0.4)}`, color: C.text } : null),
                        fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 800,
                        opacity: selectedChoice !== null && !sel ? 0.4 : 1,
                        transition: 'all 0.15s ease',
                        display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <span style={{ flex: 1 }}>{label}</span>
                      <span style={{
                        flexShrink: 0, fontSize: F.label, fontWeight: 900, color: probCol,
                        background: alpha(probCol, 0.13), border: `1px solid ${alpha(probCol, 0.4)}`,
  padding: '3px 8px', textAlign: 'center', minWidth: 52,
                      }}>
                        {isSure ? '確実' : `成功 ${probPct}%`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </ScreenPortal>
    )
  }

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100svh', paddingBottom: 80 }}>

      {/* レース状況の覗き見中：イベントに戻る（広告枠の上に配置。買い切り版は0） */}
      {pendingEvent && peekRace && (
        <ScreenPortal>
          <div style={{
            position: 'fixed', bottom: bottomStack(adH), left: 0, right: 0, margin: '0 auto',
            width: '100%', maxWidth: 480, zIndex: 55,
            padding: '14px 12px', background: `linear-gradient(0deg, ${C.bg} 70%, transparent)`,
          }}>
            <button onClick={() => setPeekRace(false)} className="btn-game btn-game--gold" style={{ width: '100%' }}>
              <span className="btn-game__inner">イベントに戻る</span>
            </button>
          </div>
        </ScreenPortal>
      )}

      {/* 上部：レース全体の進行バー */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: C.surface2,
        borderBottom: `1px solid ${C.border}`,
        padding: '8px 16px 6px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: C.red, boxShadow: `0 0 5px ${C.red}` }}/>
          <span style={{ fontSize: F.tiny, color: C.red, fontWeight: 800, letterSpacing: 2 }}>LIVE</span>
          <span style={{ fontSize: F.bodyLg, fontWeight: 700, color: C.text, flex: 1 }}>{race.name}</span>
          <span style={{ fontSize: F.caption, color: C.textDim }}>{currentSeg?.index}/{totalSegs}区</span>
        </div>
        <div style={{ height: 3, backgroundColor: C.border2,overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.red}, ${C.gold})`,}}/>
        </div>
      </div>

      {/* 一時停止・区間スキップ。全チームが走り終えたら結果へ */}
      <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        {done ? (
          <button className="btn-game btn-game--gold" onClick={onFinish} style={{ width: '100%' }}>
            <span className="btn-game__inner">最終結果を見る</span>
          </button>
        ) : (<>
          <button
            onClick={() => setManualPause(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',cursor: 'pointer',
              background: manualPause ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `1px solid ${manualPause ? C.gold : C.border2}`, color: manualPause ? C.bg : C.textSub,
              fontFamily: SAIRA, fontSize: F.body, fontWeight: 700,
            }}
          >
            {manualPause ? '再生' : '一時停止'}
            {manualPause
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor"/></svg>}
          </button>
          <button
            onClick={skipLeg}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px',cursor: 'pointer',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `1px solid ${C.border2}`, color: C.textSub,
              fontFamily: SAIRA, fontSize: F.body, fontWeight: 700,
            }}
          >
            この区間をスキップ
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 4l9 8-9 8V4zM17 4h2v16h-2z" fill="currentColor"/>
            </svg>
          </button>
        </>)}
      </div>

      <RaceTrack
        race={race}
        raceTeams={raceTeams}
        players={players}
        playerTeamId={playerTeamId}
        timeline={timeline}
        t={t}
        runnerIdOf={runnerIdOf}
      />
    </div>
  )
}
