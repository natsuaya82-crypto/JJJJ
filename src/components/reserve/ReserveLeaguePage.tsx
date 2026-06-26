import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { RaceResults, Race, Team, Player } from '../../types'
import { LineupPhase } from '../race/LineupPhase'
import { ResultsPhase } from '../race/ResultsPhase'
import { RaceTrack } from '../race/SimPhase'
import { terrainColor } from '../race/raceUtils'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Phase = 'lineup' | 'simulating' | 'results' | 'done'

const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

export default function ReserveLeaguePage() {
  const navigate = useNavigate()
  const { teams, players, playerTeamId, currentSeason, runSecondTeamRace } = useGameStore()

  const [phase, setPhase] = useState<Phase>('lineup')
  const [lineup, setLineupState] = useState<Record<number, string>>({})
  const [results, setResults] = useState<RaceResults | null>(null)
  const [lockedRace, setLockedRace] = useState<Race | null>(null)
  const [lockedRaceIndex, setLockedRaceIndex] = useState(0)
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [raceStrategy, setRaceStrategy] = useState<'aggressive' | 'balanced' | 'conservative'>('balanced')

  const stRaces = currentSeason.secondTeamRaces ?? []
  const stRaceIndex = currentSeason.secondTeamRaceIndex ?? 0
  const stStandings = currentSeason.secondTeamStandings ?? []
  const sortedStandings = [...stStandings].sort((a, b) => b.totalPoints - a.totalPoints)
  const allDone = stRaceIndex >= stRaces.length && stRaces.length > 0

  const nextRace = stRaces[stRaceIndex] ?? null
  const activeRace = (phase !== 'lineup' && lockedRace) ? lockedRace : nextRace

  // 2軍選手（セカンドチーム）
  const secondPlayers = players.filter(
    p => p.teamId === playerTeamId && p.rosterTier === 'second' && p.status !== 'retired'
  )

  // Lineup helpers
  const assignedIds = new Set(Object.values(lineup).filter(Boolean))
  const allSegsFilled = (nextRace?.segments ?? []).every(s => !!lineup[s.index])

  function setRaceLineup(i: number, id: string) {
    setLineupState(prev => ({ ...prev, [i]: id }))
  }
  function clearRaceLineup() { setLineupState({}) }

  function startSimulation(_tactics: Record<number, string>) {
    if (!nextRace) return
    const raceToRun = nextRace
    const idxToRun = stRaceIndex
    setLockedRace(raceToRun)
    setLockedRaceIndex(idxToRun)
    runSecondTeamRace(lineup, raceStrategy)
    const ran = useGameStore.getState().currentSeason.secondTeamRaces?.[idxToRun]
    if (!ran?.results) return
    setResults(ran.results)
    // 自動再生でレースを流してから結果へ
    setPhase('simulating')
  }

  // ── 全試合完了 ──
  if (allDone || phase === 'done') {
    const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
    const myPts = stStandings.find(s => s.teamId === playerTeamId)?.totalPoints ?? 0
    return (
      <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 40, background: C.bg, minHeight: '100dvh' }}>
        <div style={{ padding: '12px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
          <BackButton onClick={() => navigate('/')}/>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '2px', marginBottom: 2 }}>2軍リーグ 全試合完了</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>リザーブシーズン終了</div>
        </div>
        <div style={{ padding: '24px 16px', textAlign: 'center' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginBottom: 8 }}>最終順位</div>
          <div style={{ fontFamily: SAIRA, fontSize: 56, fontWeight: 900, color: myRank === 1 ? C.gold : myRank <= 3 ? C.green : C.textSub, lineHeight: 1 }}>{myRank}</div>
          <div style={{ fontFamily: SAIRA, fontSize: 14, color: C.textDim, marginTop: 4 }}>位　{myPts}pt</div>
        </div>
        <div style={{ margin: '0 16px', borderRadius: 14, overflow: 'hidden', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}` }}>
          {sortedStandings.map((s, i) => {
            const t = teams.find(tm => tm.id === s.teamId)
            const isMe = s.teamId === playerTeamId
            const rankCol = i === 0 ? C.gold : i < 3 ? C.textSub : C.textGhost
            return (
              <div key={s.teamId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: i < sortedStandings.length - 1 ? `1px solid ${C.border}` : 'none', background: isMe ? alpha(C.gold, 0.07) : 'transparent' }}>
                <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 800, color: rankCol, width: 22, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ flex: 1, fontFamily: SAIRA, fontSize: 13, color: isMe ? C.text : C.textSub, fontWeight: isMe ? 700 : 400 }}>{t?.shortName ?? s.teamId}</span>
                <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 800, color: isMe ? C.gold : C.textDim }}>{s.totalPoints}</span>
                <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>pt</span>
              </div>
            )
          })}
        </div>
        <div style={{ padding: '24px 16px 8px' }}>
          <button onClick={() => navigate('/')} style={{ width: '100%', padding: 14, borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border}`, color: C.textSub, fontFamily: SAIRA, fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
            ホームへ戻る
          </button>
        </div>
      </div>
    )
  }

  // ── 未開始 ──
  if (!nextRace && phase === 'lineup') {
    return (
      <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", background: C.bg, minHeight: '100dvh' }}>
        <div style={{ padding: '12px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
          <BackButton onClick={() => navigate('/')}/>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>２軍リーグ</div>
        </div>
        <div style={{ padding: '60px 20px', textAlign: 'center', fontFamily: SAIRA, color: C.textDim, fontSize: 13 }}>
          リザーブリーグは未開始です
        </div>
      </div>
    )
  }

  // ── ラインナップ → 1軍と全く同じ LineupPhase ──
  if (phase === 'lineup' && nextRace) return (
    <LineupPhase
      race={nextRace}
      raceNumber={stRaceIndex + 1}
      totalRaces={stRaces.length}
      mainPlayers={secondPlayers}
      raceLineup={lineup}
      assignedIds={assignedIds}
      allSegsFilled={allSegsFilled}
      pickerSeg={pickerSeg}
      setPickerSeg={setPickerSeg}
      setRaceLineup={setRaceLineup}
      clearRaceLineup={clearRaceLineup}
      onStart={startSimulation}
      weatherLabel={weatherLabel}
      raceStrategy={raceStrategy}
      setRaceStrategy={setRaceStrategy}
      teamTalk=""
      setTeamTalk={() => {}}
    />
  )

  // ── 自動再生シミュレーション ──
  if (phase === 'simulating' && results && activeRace) return (
    <ReserveSimPhase
      race={activeRace}
      results={results}
      teams={teams}
      players={players}
      playerTeamId={playerTeamId}
      onDone={() => setPhase('results')}
    />
  )

  // ── 結果 → 1軍と同じ ResultsPhase（reserveStandings渡す、ホームへ戻る）──
  if (phase === 'results' && results && activeRace) return (
    <ResultsPhase
      race={activeRace}
      results={results}
      teams={teams}
      players={players}
      playerTeamId={playerTeamId}
      currentSeason={currentSeason}
      isLastRace={lockedRaceIndex >= stRaces.length - 1}
      reserveStandings={stStandings}
    />
  )

  return null
}

// リザーブ用 自動再生（区間アニメを順に流して結果へ。プレイヤー操作なし）
function ReserveSimPhase({ race, results, teams, players, playerTeamId, onDone }: {
  race: Race
  results: RaceResults
  teams: Team[]
  players: Player[]
  playerTeamId: string
  onDone: () => void
}) {
  const segs = [...race.segments].sort((a, b) => a.index - b.index)
  const [segPos, setSegPos] = useState(0)
  const [kmRatio, setKmRatio] = useState(0)
  const rafRef = useRef<number>(0)
  const seg = segs[segPos]

  useEffect(() => {
    if (!seg) return
    setKmRatio(0)
    const duration = Math.max(5000, Math.min(12000, seg.distanceKm * 600))
    const start = performance.now()
    let advTimer: ReturnType<typeof setTimeout> | null = null
    function tick(now: number) {
      const t = Math.min((now - start) / duration, 1)
      setKmRatio(t)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        advTimer = setTimeout(() => {
          if (segPos < segs.length - 1) setSegPos(p => p + 1)
          else onDone()
        }, 500)
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafRef.current); if (advTimer) clearTimeout(advTimer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segPos])

  if (!seg) return null
  const sr = results.segmentResults.find(s => s.segmentIndex === seg.index)
  const segRunnerIds: Record<string, string> = {}
  const cpuTimesForSeg: Record<string, number> = {}
  const baselineCumulative: Record<string, number> = {}
  let playerBaseTime = 0
  for (let i = 0; i < segPos; i++) {
    const psr = results.segmentResults.find(s => s.segmentIndex === segs[i].index)
    if (psr) for (const r of psr.runners) baselineCumulative[r.teamId] = (baselineCumulative[r.teamId] ?? 0) + r.timeSec
  }
  if (sr) for (const r of sr.runners) {
    segRunnerIds[r.teamId] = r.playerId
    if (r.teamId === playerTeamId) playerBaseTime = r.timeSec
    else cpuTimesForSeg[r.teamId] = r.timeSec
  }
  const segCol = terrainColor(seg.uphillPct, seg.downhillPct)
  const totalSegs = segs.length

  return (
    <div style={{ fontFamily: SAIRA, minHeight: '100svh', background: C.bg, paddingBottom: 40 }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: '8px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.red, boxShadow: `0 0 5px ${C.red}` }}/>
          <span style={{ fontSize: 9, color: C.red, fontWeight: 800, letterSpacing: 2 }}>LIVE</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{race.name}</span>
          <span style={{ fontSize: 10, color: C.textDim }}>2軍 · {seg.index}/{totalSegs}区</span>
        </div>
        <div style={{ height: 3, background: C.border2, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(segPos / totalSegs) * 100}%`, background: `linear-gradient(90deg, ${C.red}, ${C.gold})`, borderRadius: 2 }}/>
        </div>
      </div>

      <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onDone} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, cursor: 'pointer', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, color: C.textSub, fontFamily: SAIRA, fontSize: 12, fontWeight: 700 }}>
          結果へスキップ
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 4l9 8-9 8V4zM17 4h2v16h-2z" fill="currentColor"/></svg>
        </button>
      </div>

      <RaceTrack
        teams={teams}
        players={players}
        segRunnerIds={segRunnerIds}
        playerTeamId={playerTeamId}
        playerBaseTime={playerBaseTime}
        cpuTimesForSeg={cpuTimesForSeg}
        baselineCumulative={baselineCumulative}
        kmRatio={kmRatio}
        distanceKm={seg.distanceKm}
        segCol={segCol}
        currentSegIdx={seg.index}
        race={race}
      />
    </div>
  )
}
