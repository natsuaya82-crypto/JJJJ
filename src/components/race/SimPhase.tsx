import { useState, useEffect, useRef } from 'react'
import type { Race, Team, Player } from '../../types'
import type { RaceSegmentEvent, InteractiveSegResult, EventTriggerCondition } from '../../engine/interactiveRace'
import { choiceSuccessProb } from '../../engine/interactiveRace'
import { formatDiff } from '../../engine/raceEngine'
import { formatRaceTime } from '../../utils/eventTime'
import { terrainColor, terrainLabel } from './raceUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { audio } from '../../utils/audio'
import { useAdHeight } from '../layout/Layout'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { useSegmentRecords } from '../../lib/useSegmentRecords'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const rankColors: Record<number, string> = { 1: C.gold, 2: '#9B97A8', 3: '#CD7F32' }

function computeAnimGaps(
  ratio: number,
  cpuTimesForSeg: Record<string, number>,
  playerBaseTime: number,
  cumulativeTime: Record<string, number>,
  playerTeamId: string,
): { gapAheadSec: number | null; gapBehindSec: number | null; nearbyCount: number } {
  const playerTotal = (cumulativeTime[playerTeamId] ?? 0) + playerBaseTime * ratio
  let minAhead = Infinity
  let minBehind = Infinity
  let nearbyCount = 0
  for (const [tid, cpuTime] of Object.entries(cpuTimesForSeg)) {
    if (tid === playerTeamId) continue
    const cpuTotal = (cumulativeTime[tid] ?? 0) + cpuTime * ratio
    const diff = playerTotal - cpuTotal
    if (diff > 0) minAhead = Math.min(minAhead, diff)
    else minBehind = Math.min(minBehind, -diff)
    if (Math.abs(diff) <= 15) nearbyCount++
  }
  return {
    gapAheadSec: isFinite(minAhead) ? minAhead : null,
    gapBehindSec: isFinite(minBehind) ? minBehind : null,
    nearbyCount,
  }
}

function checkEventTrigger(
  trigger: EventTriggerCondition,
  ratio: number,
  segDistKm: number,
  lowStamina: boolean,
  cpuTimesForSeg: Record<string, number>,
  playerBaseTime: number,
  cumulativeTime: Record<string, number>,
  playerTeamId: string,
): boolean {
  switch (trigger.type) {
    case 'ratio':
      return ratio >= trigger.min
    case 'kmRemaining':
      return (1 - ratio) * segDistKm <= trigger.km
    case 'stamina':
      return lowStamina || ratio >= 0.45
    case 'gapAheadBelow': {
      const { gapAheadSec } = computeAnimGaps(ratio, cpuTimesForSeg, playerBaseTime, cumulativeTime, playerTeamId)
      return (gapAheadSec !== null && gapAheadSec <= trigger.sec) || ratio >= 0.5
    }
    case 'gapBehindBelow': {
      const { gapBehindSec } = computeAnimGaps(ratio, cpuTimesForSeg, playerBaseTime, cumulativeTime, playerTeamId)
      return (gapBehindSec !== null && gapBehindSec <= trigger.sec) || ratio >= 0.35
    }
    case 'packSize': {
      const { nearbyCount } = computeAnimGaps(ratio, cpuTimesForSeg, playerBaseTime, cumulativeTime, playerTeamId)
      return nearbyCount >= trigger.minCount || ratio >= 0.4
    }
  }
}

type Props = {
  race: Race
  teams: Team[]
  players: Player[]
  playerTeamId: string
  pendingEvent: RaceSegmentEvent | null
  pendingEventsCount: number
  lowStaminaHint: boolean
  currentSegIdx: number
  completedSegResults: InteractiveSegResult[]
  cumulativeTime: Record<string, number>
  cpuTimesForSeg: Record<string, number>
  playerBaseTime: number
  segStamina: number
  segPts: Record<string, number>
  showingSegResult: boolean
  lastSegResult: InteractiveSegResult | null
  segRunnerIds?: Record<string, string>
  onChoiceMade: (choiceIdx: number) => void
  onAdvance: () => void
  onSkip: () => void
  onSkipSegment?: () => void
}

function FaceOrDot({ playerId, nationality, size = 32 }: { playerId?: string; nationality?: string; size?: number }) {
  if (playerId && nationality) {
    return <PlayerFace playerId={playerId} nationality={nationality as import('../../types').Nationality} size={size} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${C.surface3}, ${C.border2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, color: C.textGhost,
    }}>?</div>
  )
}

// ランナー位置計算（総合順位ベース）
function calcRunnerPositions(
  teams: Team[],
  playerTeamId: string,
  playerBaseTime: number,
  cpuTimesForSeg: Record<string, number>,
  baselineCumulative: Record<string, number>,
  kmRatio: number,
  distanceKm: number,
): { teamId: string; km: number; segTime: number; overallTotal: number }[] {
  const segTimeOf = (id: string) => id === playerTeamId ? playerBaseTime : (cpuTimesForSeg[id] ?? playerBaseTime)
  // 区間内の見た目位置用：区間先頭走者（最速）を基準
  const validTimes = teams.map(t => segTimeOf(t.id)).filter(s => s > 0)
  const segLeaderTime = validTimes.length > 0 ? Math.min(...validTimes) : 1
  return teams.map(t => {
    const segTime = segTimeOf(t.id)
    // 区間内の到達距離（バー用）
    const distRatio = segTime > 0 ? segLeaderTime / segTime : 1
    const km = Math.min(distanceKm, Math.max(0, kmRatio * distRatio * distanceKm))
    // 総合タイム = この区間より前の累積 + 現区間の進行分（kmRatio=1で実累積に一致）
    const overallTotal = (baselineCumulative[t.id] ?? 0) + kmRatio * segTime
    return { teamId: t.id, km, segTime, overallTotal }
  }).sort((a, b) => a.overallTotal - b.overallTotal || a.teamId.localeCompare(b.teamId))
}

// レーストラック表示
export function RaceTrack({
  teams, players, segRunnerIds, playerTeamId, playerBaseTime, cpuTimesForSeg, baselineCumulative,
  kmRatio, distanceKm, segCol, currentSegIdx, race,
}: {
  teams: Team[]
  players?: Player[]
  segRunnerIds?: Record<string, string>
  playerTeamId: string
  playerBaseTime: number
  cpuTimesForSeg: Record<string, number>
  baselineCumulative: Record<string, number>
  kmRatio: number
  distanceKm: number
  segCol: string
  currentSegIdx: number
  race: Race
}) {
  const longPress = usePlayerLongPress()
  const positions = calcRunnerPositions(teams, playerTeamId, playerBaseTime, cpuTimesForSeg, baselineCumulative, kmRatio, distanceKm)
  // positions[0] が総合首位
  const leaderTotal = positions[0]?.overallTotal ?? 0
  const hasData = playerBaseTime > 0 && Object.keys(cpuTimesForSeg).length > 0
  const currentSeg = race.segments.find(s => s.index === currentSegIdx)

  const myRank = positions.findIndex(p => p.teamId === playerTeamId) + 1
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

  return (
    <div>
      <style>{`
        @keyframes overtake-glow { 0%{opacity:1} 100%{opacity:0} }
        @keyframes overtake-arrow { 0%{opacity:0;transform:translateY(5px) translateX(-50%)} 20%{opacity:1;transform:translateY(-1px) translateX(-50%)} 75%{opacity:1;transform:translateY(-1px) translateX(-50%)} 100%{opacity:0;transform:translateY(-1px) translateX(-50%)} }
      `}</style>
      {/* 区間情報ヘッダー */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px 10px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.45)})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 17, fontWeight: 900, color: C.bg, flexShrink: 0,
          }}>{currentSegIdx}</div>
          {currentSeg && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: segCol }}>{currentSeg.distanceKm.toFixed(1)} km</div>
              <div style={{ fontSize: 10, color: C.textDim }}>{terrainLabel(currentSeg.uphillPct, currentSeg.downhillPct, currentSeg.distanceKm)}</div>
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.text, fontFamily: SAIRA, lineHeight: 1 }}>
            {(kmRatio * distanceKm).toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: C.textDim }}>/ {distanceKm.toFixed(1)} km</div>
        </div>
      </div>

      {/* 順位リスト（総合順位） */}
      {hasData && (
        <div style={{ padding: '4px 0' }}>
          <div style={{ padding: '4px 12px 2px', fontSize: 9, color: C.textDim, letterSpacing: 2, fontWeight: 700 }}>総合順位</div>
          {positions.map((pos, rank) => {
            const t = teams.find(t => t.id === pos.teamId)
            if (!t) return null
            const isMe = pos.teamId === playerTeamId
            const pct = distanceKm > 0 ? (pos.km / distanceKm) * 100 : 0
            // 総合首位との累積タイム差
            const gapSec = pos.overallTotal - leaderTotal
            const rankCol = rankColors[rank + 1] ?? C.textGhost
            const playerId = segRunnerIds?.[pos.teamId]
            const player = players?.find(p => p.id === playerId)

            return (
              <div key={pos.teamId} {...(playerId ? longPress(playerId) : {})} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                background: isMe ? alpha(segCol, 0.07) : 'transparent',
                borderLeft: isMe ? `3px solid ${segCol}` : '3px solid transparent',
                borderBottom: `1px solid ${C.border}`,
                position: 'relative', overflow: 'hidden',
                cursor: playerId ? 'pointer' : 'default',
              }}>
                {/* オーバーテイクフラッシュ */}
                {isMe && showOvertake && (
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
                  color: isMe && showOvertake ? C.green : rankCol, fontFamily: SAIRA,
                }}>
                  {rank + 1}
                  {isMe && showOvertake && (
                    <div key={`arrow-${overtakeKey}`} style={{
                      position: 'absolute', bottom: '100%', left: '50%',
                      fontSize: 11, fontWeight: 900, color: C.green, fontFamily: SAIRA,
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
                    <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} logoId={t.logoId} size={16} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isMe ? segCol : t.colors.primary, flexShrink: 0 }}>{t.shortName}</span>
                    {player && (
                      <span style={{ fontSize: 11, fontWeight: isMe ? 800 : 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.name}
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative', height: 5, borderRadius: 3, background: C.border2 }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 3,
                      width: `${pct}%`,
                      background: isMe
                        ? `linear-gradient(90deg, ${segCol}, ${alpha(segCol, 0.5)})`
                        : `linear-gradient(90deg, ${alpha(t.colors.primary, 0.8)}, ${alpha(t.colors.primary, 0.3)})`,
                    }} />
                  </div>
                </div>

                {/* 総合タイム差（折り返し禁止：折り返すと行高が変わり下位がガタつくため） */}
                <div style={{ minWidth: 52, textAlign: 'right', flexShrink: 0, fontFamily: SAIRA, position: 'relative', zIndex: 1, whiteSpace: 'nowrap' }}>
                  {rank === 0 ? (
                    <span style={{ fontSize: 11, color: C.gold, fontWeight: 900, whiteSpace: 'nowrap' }}>TOP</span>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 700, color: isMe ? C.red : C.textDim, whiteSpace: 'nowrap' }}>
                      {formatDiff(gapSec)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SimPhase({
  race, teams, players, playerTeamId,
  pendingEvent, pendingEventsCount: _pendingEventsCount, lowStaminaHint,
  currentSegIdx, completedSegResults, cumulativeTime, cpuTimesForSeg, playerBaseTime, segStamina, segPts,
  showingSegResult, lastSegResult, segRunnerIds,
  onChoiceMade, onAdvance, onSkip: _onSkip, onSkipSegment,
}: Props) {
  const adH = useAdHeight()
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const playerMap = new Map(players.map(p => [p.id, p]))

  const [selectedChoice, setSelectedChoice] = useState<number | null>(null)
  const [eventIntro, setEventIntro] = useState(false)
  const [peekRace, setPeekRace] = useState(false)
  const [animKmRatio, setAnimKmRatio] = useState(0)
  const [animDone, setAnimDone] = useState(false)
  // 区間結果を出す前に必ず最終ストレートを見せるための最小表示時間。
  // ラスト勝負イベントが終盤で発火すると選択直後に区間結果へ飛んでしまう（押した瞬間終了）ため、
  // 選択後は最低でも少しの間トラックを見せてから結果を表示する。
  const [resultDwellDone, setResultDwellDone] = useState(false)
  const [skipped, setSkipped] = useState(false)  // 「この区間をスキップ」押下：待ち時間なしで即結果へ
  const [manualPause, setManualPause] = useState(false)  // 手動の一時停止
  const rafRef = useRef<number>(0)
  const segDurationRef = useRef(25000)
  const animSegRef = useRef(-1)
  const pausedRef = useRef(false)

  const prevSegIdxRef = useRef(-1)
  if (currentSegIdx !== prevSegIdxRef.current) {
    prevSegIdxRef.current = currentSegIdx
    const seg = race.segments.find(s => s.index === currentSegIdx)
    // 距離比例の表示時間（短い区間でも見応えを確保）
    segDurationRef.current = Math.max(12000, Math.min(30000, (seg?.distanceKm ?? 10) * 1400))
  }

  // アニメ進行度。区間切替直後（animSegRef未更新）は0として扱い、前区間の値が漏れないように
  const effectiveRatio = animSegRef.current === currentSegIdx ? animKmRatio : 0

  // レースシミュレーション状態でトリガー条件を評価
  const currentSeg0 = race.segments.find(s => s.index === currentSegIdx)
  const segDistKm = currentSeg0?.distanceKm ?? 10
  const atEvent = !!pendingEvent && !showingSegResult && checkEventTrigger(
    pendingEvent.trigger,
    effectiveRatio,
    segDistKm,
    lowStaminaHint,
    cpuTimesForSeg,
    playerBaseTime,
    cumulativeTime,
    playerTeamId,
  )
  pausedRef.current = atEvent || manualPause

  // 区間ごとの距離に比例したアニメーション（イベント地点で一時停止）。最後まで再生してから区間結果を表示
  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    animSegRef.current = currentSegIdx
    setAnimKmRatio(0)
    setAnimDone(false)
    setSkipped(false)
    setManualPause(false)
    const duration = segDurationRef.current
    let elapsed = 0
    let lastTs = performance.now()
    function tick(now: number) {
      const dt = now - lastTs
      lastTs = now
      if (!pausedRef.current) elapsed += dt
      const t = Math.min(elapsed / duration, 1)
      setAnimKmRatio(t)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else setAnimDone(true)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [currentSegIdx])

  // イベントが発火（atEvent）したら選択状態をリセット＋「イベント発生」演出
  const activeEventId = atEvent && pendingEvent ? pendingEvent.id : null
  useEffect(() => {
    setSelectedChoice(null)
    setPeekRace(false)
    if (!activeEventId) { setEventIntro(false); return }
    setEventIntro(true)
    audio.playSe('event')
    const t = setTimeout(() => setEventIntro(false), 900)
    return () => clearTimeout(t)
  }, [activeEventId])


  function handleChoice(i: number) {
    if (selectedChoice !== null) return
    setSelectedChoice(i)
    setTimeout(() => onChoiceMade(i), 380)
  }

  const totalSegs = race.segments.length
  const progressPct = totalSegs > 0 ? (currentSegIdx / totalSegs) * 100 : 0
  const currentSeg = race.segments.find(s => s.index === currentSegIdx)
  const segCol = currentSeg ? terrainColor(currentSeg.uphillPct, currentSeg.downhillPct) : C.blue

  // 表示用kmRatio（区間切替直後の漏れ防止）
  const kmRatio = effectiveRatio

  // 区間結果表示に入ったら、最終ストレートを見せる最小時間を確保する
  useEffect(() => {
    if (!showingSegResult) { setResultDwellDone(false); return }
    setResultDwellDone(false)
    const t = setTimeout(() => setResultDwellDone(true), 850)
    return () => clearTimeout(t)
  }, [showingSegResult, currentSegIdx])

  // アニメーション完了 かつ 最小表示時間経過後に区間結果を表示。スキップ押下時は待たずに即表示。
  const showResult = showingSegResult && (skipped || (animDone && resultDwellDone))
  const showTrack = !showResult

  const sortedStandings = Object.entries(cumulativeTime)
    .filter(([, t]) => t > 0)
    .sort(([, a], [, b]) => a - b)
  const leaderCumTime = sortedStandings[0]?.[1] ?? 0

  // 現区間より前の累積タイム（cumulativeTime は区間確定時に現区間分が加算されるため、確定後は差し引く）
  const baselineCumulative: Record<string, number> = { ...cumulativeTime }
  if (showingSegResult && lastSegResult) {
    for (const r of lastSegResult.runners) {
      baselineCumulative[r.teamId] = (baselineCumulative[r.teamId] ?? 0) - r.timeSec
    }
  }

  // ── イベント発生：ヘッダーと広告の間に固定（スクロールなし）──
  if (atEvent && pendingEvent && !peekRace) {
    return (
      <div style={{
        fontFamily: SAIRA,
        position: 'fixed', top: 52, bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
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
            <div style={{ fontSize: 12, fontWeight: 800, color: segCol, letterSpacing: 3, animation: 'ev-in 0.5s ease 0.2s both' }}>
              {pendingEvent.type}
            </div>
          </div>
        ) : (
          /* 選択画面 */
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '18px 18px 16px', animation: 'ev-in 0.3s ease' }}>
            {/* 状況 */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 3, color: segCol, textShadow: `0 0 8px ${alpha(segCol, 0.5)}` }}>{pendingEvent.type}</span>
                <span style={{ fontSize: 10, color: C.textDim }}>{currentSegIdx}区</span>
                {lowStaminaHint && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: C.red }}>スタミナ低下</span>
                )}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text, lineHeight: 1.6, marginBottom: 10 }}>
                {pendingEvent.situation}
              </div>
              {pendingEvent.battleContext && (
                <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>{pendingEvent.battleContext}</div>
              )}
              {/* レース状況を別画面で確認 */}
              <button onClick={() => setPeekRace(true)} style={{
                alignSelf: 'flex-start', marginTop: 16,
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${alpha(segCol, 0.5)}`,
                color: segCol, fontFamily: SAIRA, fontSize: 12, fontWeight: 700,
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
                      width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 12,
                      cursor: selectedChoice !== null ? 'default' : 'pointer',
                      border: `2px solid ${sel ? segCol : C.border2}`,
                      background: sel ? alpha(segCol, 0.2) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                      boxShadow: sel ? `0 0 18px ${alpha(segCol, 0.4)}` : `0 4px 0 rgba(0,0,0,0.4)`,
                      color: sel ? C.text : C.textSub,
                      fontFamily: SAIRA, fontSize: 15, fontWeight: 800,
                      opacity: selectedChoice !== null && !sel ? 0.4 : 1,
                      transition: 'all 0.15s ease',
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ flex: 1 }}>{label}</span>
                    <span style={{
                      flexShrink: 0, fontSize: 11, fontWeight: 900, color: probCol,
                      background: alpha(probCol, 0.13), border: `1px solid ${alpha(probCol, 0.4)}`,
                      borderRadius: 8, padding: '3px 8px', textAlign: 'center', minWidth: 52,
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
    )
  }

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100svh', backgroundColor: C.bg, paddingBottom: 80 }}>

      {/* レース状況の覗き見中：イベントに戻る（広告枠の上に配置。買い切り版は0） */}
      {atEvent && peekRace && (
        <div style={{
          position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, zIndex: 55,
          padding: '14px 12px', background: `linear-gradient(0deg, ${C.bg} 70%, transparent)`,
        }}>
          <button onClick={() => setPeekRace(false)} className="btn-game btn-game--gold" style={{ width: '100%' }}>
            <span className="btn-game__inner">イベントに戻る</span>
          </button>
        </div>
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
          <span style={{ fontSize: 9, color: C.red, fontWeight: 800, letterSpacing: 2 }}>LIVE</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{race.name}</span>
          <span style={{ fontSize: 10, color: C.textDim }}>{currentSegIdx}/{totalSegs}区</span>
        </div>
        <div style={{ height: 3, backgroundColor: C.border2, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: `linear-gradient(90deg, ${C.red}, ${C.gold})`, borderRadius: 2 }}/>
        </div>
      </div>

      {/* 区間スキップ（最上部・トラック表示中は常時） */}
      {currentSeg && showTrack && (
        <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button
            onClick={() => setManualPause(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
              background: manualPause ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `1px solid ${manualPause ? C.gold : C.border2}`, color: manualPause ? C.bg : C.textSub,
              fontFamily: SAIRA, fontSize: 12, fontWeight: 700,
            }}
          >
            {manualPause ? '再生' : '一時停止'}
            {manualPause
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor"/></svg>}
          </button>
          <button
            onClick={() => { cancelAnimationFrame(rafRef.current); setAnimKmRatio(1); setAnimDone(true); setSkipped(true); onSkipSegment?.() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `1px solid ${C.border2}`, color: C.textSub,
              fontFamily: SAIRA, fontSize: 12, fontWeight: 700,
            }}
          >
            この区間をスキップ
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 4l9 8-9 8V4zM17 4h2v16h-2z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      )}

      {/* レーストラック（アニメーション完了まで表示） */}
      {currentSeg && showTrack && (
        <RaceTrack
          teams={teams}
          players={players}
          segRunnerIds={segRunnerIds}
          playerTeamId={playerTeamId}
          playerBaseTime={playerBaseTime}
          cpuTimesForSeg={cpuTimesForSeg}
          baselineCumulative={baselineCumulative}
          kmRatio={kmRatio}
          distanceKm={currentSeg.distanceKm}
          segCol={segCol}
          currentSegIdx={currentSegIdx}
          race={race}
        />
      )}

      {/* 区間結果（アニメーション完了後に表示） */}
      {showResult && lastSegResult && (
        <SegmentResultCard
          seg={lastSegResult}
          race={race}
          teamMap={teamMap}
          playerMap={playerMap}
          playerTeamId={playerTeamId}
          isLastSeg={completedSegResults.length >= totalSegs}
          onAdvance={onAdvance}
        />
      )}


      {/* 暫定順位（区間結果後） */}
      {showResult && sortedStandings.length > 0 && (
        <div style={{ margin: '12px 12px 0', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ padding: '7px 12px', backgroundColor: C.surface2, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 9, color: C.textDim, letterSpacing: 2 }}>暫定順位</span>
          </div>
          {sortedStandings.map(([teamId, cumTime], i) => {
            const t = teamMap.get(teamId)
            const isMe = teamId === playerTeamId
            const gap = cumTime - leaderCumTime
            const rankCol = rankColors[i + 1] ?? C.textGhost
            const pts = segPts[teamId] ?? 0
            return (
              <div key={teamId} style={{
                padding: '8px 12px', borderBottom: `1px solid ${C.surface2}`,
                backgroundColor: isMe ? alpha(C.gold, 0.05) : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 20, textAlign: 'center', fontSize: 14, fontWeight: 900, color: rankCol, fontFamily: SAIRA, flexShrink: 0 }}>{i + 1}</div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={24}/>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isMe ? 800 : 500, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? teamId}</div>
                  {pts > 0 && <div style={{ fontSize: 9, color: C.gold }}>区間賞 {pts}pt</div>}
                </div>
                <div style={{ fontFamily: SAIRA, textAlign: 'right', flexShrink: 0 }}>
                  {gap === 0
                    ? <span style={{ fontSize: 13, fontWeight: 900, color: C.gold }}>{formatRaceTime(cumTime)}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? C.red : C.textDim }}>+{formatDiff(gap).replace('+', '')}</span>
                  }
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}

export function SegmentResultCard({
  seg, race, teamMap, playerMap, playerTeamId, isLastSeg, onAdvance, showRecordBadge = true, advanceLabel,
  nextLabel, advanceDisabled = false,
}: {
  seg: InteractiveSegResult
  race: Race
  teamMap: Map<string, Team>
  playerMap: Map<string, Player>
  playerTeamId: string
  isLastSeg: boolean
  onAdvance: () => void
  /** 区間新の表示。オンライン対戦は手元の記録と関係ないので出さない */
  showRecordBadge?: boolean
  /** 最終区のボタン文字を差し替える */
  advanceLabel?: string
  /** 最終区以外のボタン文字を差し替える（オンライン対戦の待ち合わせ表示に使う） */
  nextLabel?: string
  /** 押せなくする（他のチームを待っているあいだ） */
  advanceDisabled?: boolean
}) {
  const longPress = usePlayerLongPress()
  const raceSegData = race.segments.find(s => s.index === seg.segmentIndex)
  const segCol = raceSegData ? terrainColor(raceSegData.uphillPct, raceSegData.downhillPct) : C.blue
  const winner = seg.runners[0]
  const isMyWin = winner?.teamId === playerTeamId
  // 区間新の判定：この時点の歴代記録（レース確定前なので従来記録のまま）を1位が上回っていれば区間新
  const segRecords = useSegmentRecords()
  const prevBestSec = (segRecords[`${race.name}-${seg.segmentIndex}`] ?? [])[0]?.timeSec ?? null
  const isNewRecord = showRecordBadge && prevBestSec != null && winner != null && winner.timeSec < prevBestSec
  const myRunner = seg.runners.find(r => r.teamId === playerTeamId)
  const myRankCol = !myRunner ? C.textGhost : myRunner.rank === 1 ? C.gold : myRunner.rank <= 3 ? C.green : myRunner.rank <= 6 ? C.textSub : C.textGhost

  return (
    <div style={{ margin: '0 12px' }}>
      <div style={{
        borderRadius: 14, overflow: 'hidden',
        border: `2px solid ${isMyWin ? alpha(C.gold, 0.6) : alpha(segCol, 0.35)}`,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        boxShadow: `0 4px 0 ${alpha(isMyWin ? C.gold : segCol, 0.15)}, 0 6px 16px rgba(0,0,0,0.35)`,
      }}>
        <div style={{
          padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${alpha(segCol, 0.2)}`,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9, flexShrink: 0,
            background: `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.5)})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 900, color: C.bg,
          }}>{seg.segmentIndex}</div>
          <div>
            {raceSegData && <div style={{ fontSize: 13, fontWeight: 800, color: segCol }}>{raceSegData.distanceKm.toFixed(1)} km</div>}
            <div style={{ fontSize: 9, color: isMyWin ? C.gold : C.textDim, letterSpacing: 2 }}>{isMyWin ? '★ 区間賞！' : '区間結果'}</div>
          </div>
        </div>
        {/* 必ず5行：自チームが4位以内なら1〜5位、それ以外は1〜4位＋自チーム */}
        {(() => {
          const top4 = seg.runners.slice(0, 4)
          const mine = seg.runners.find(r => r.teamId === playerTeamId)
          return (!mine || top4.some(r => r.teamId === playerTeamId)) ? seg.runners.slice(0, 5) : [...top4, mine]
        })().map((r) => {
          const t = teamMap.get(r.teamId)
          const p = playerMap.get(r.playerId)
          const isMe = r.teamId === playerTeamId
          const rCol = rankColors[r.rank] ?? C.textGhost
          return (
            <div key={r.teamId} {...(p ? longPress(p.id) : {})} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderBottom: `1px solid ${C.border}`,
              background: isMe ? alpha(C.gold, 0.06) : 'transparent',
              cursor: p ? 'pointer' : 'default',
            }}>
              <div style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: r.rank <= 3 ? 18 : 14, fontWeight: 900, color: rCol, fontFamily: SAIRA, lineHeight: 1 }}>{r.rank}</div>
              <FaceOrDot playerId={p?.id} nationality={p?.nationality} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  {/* 国別対抗（nat_）は国旗＋国名で表示 */}
                  {r.teamId.startsWith('nat_') && (
                    <img src={`/flags/${r.teamId.slice(4)}.svg`} alt="" width={18} height={13} draggable={false}
                      style={{ width: 18, height: 13, borderRadius: 2, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(0,0,0,0.35)' }} />
                  )}
                  <span style={{ fontSize: 12, fontWeight: isMe ? 800 : 500, color: isMe ? C.gold : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? r.teamId}</span>
                  {isNewRecord && r.rank === 1 && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(C.red, 0.15), border: `1px solid ${alpha(C.red, 0.5)}`, color: C.red, fontWeight: 900, flexShrink: 0 }}>区間新！</span>
                  )}
                </div>
                {p && <div style={{ fontSize: 9, color: C.textSub }}>{p.name}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: r.rank === 1 ? C.gold : isMe ? myRankCol : C.textDim, fontFamily: SAIRA }}>{formatRaceTime(r.timeSec)}</div>
                {winner && r.rank > 1 && <div style={{ fontSize: 9, color: C.textGhost, fontFamily: 'monospace' }}>{formatDiff(r.timeSec - winner.timeSec)}</div>}
              </div>
            </div>
          )
        })}
        <div style={{ padding: '10px 12px' }}>
          {isLastSeg ? (
            <button className="btn-game btn-game--gold" onClick={() => { if (!advanceDisabled) onAdvance() }}
              style={{ width: '100%', opacity: advanceDisabled ? 0.5 : 1 }}>
              <span className="btn-game__inner">{advanceLabel ?? '最終結果を見る'}</span>
            </button>
          ) : (
            <button className="btn-game btn-game--blue" onClick={() => { if (!advanceDisabled) onAdvance() }}
              style={{ width: '100%', opacity: advanceDisabled ? 0.5 : 1 }}>
              <span className="btn-game__inner">{nextLabel ?? '次の区間へ →'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
