import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { RaceResults, Race, Team, Player } from '../../types'
import type { InteractiveSegResult } from '../../engine/interactiveRace'
import { LineupPhase } from '../race/LineupPhase'
import { ResultsPhase } from '../race/ResultsPhase'
import { SimPhase } from '../race/SimPhase'
import { isSecondMember } from '../../data/rosterRules'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Phase = 'lineup' | 'simulating' | 'results' | 'done'

const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

export default function ReserveLeaguePage() {
  const navigate = useNavigate()
  const { teams, players, playerTeamId, currentSeason, runSecondTeamRace, setActiveRacePhase } = useGameStore()

  const [phase, setPhaseLocal] = useState<Phase>('lineup')
  // 1軍レースと同様に、編成〜進行中は下ナビを隠す
  const setPhase = (p: Phase) => { setPhaseLocal(p); setActiveRacePhase(p === 'done' ? null : p) }
  useEffect(() => {
    setActiveRacePhase('lineup')
    return () => { setActiveRacePhase(null) }
  }, [])
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

  // 2軍選手（2軍契約 ＋ 2way ＋ レンタル枠）。レンタルは1軍/2軍どちらのレースにも出場可。
  const secondPlayers = players.filter(
    p => p.teamId === playerTeamId && (isSecondMember(p) || !!p.loan) && p.status !== 'retired'
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
          <BackButton/>
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
          <button style={{ width: '100%', padding: 14, borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border}`, color: C.textSub, fontFamily: SAIRA, fontSize: 15, fontWeight: 900, cursor: 'pointer' }}>
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
          <BackButton/>
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

// リザーブ用シミュ：1軍と同じ SimPhase を「選択肢なし」で駆動する。
// 区間アニメ→区間結果カード→暫定順位→「次の区間へ」まで通常リーグと同構成。イベント選択のみ無し。
function ReserveSimPhase({ race, results, teams, players, playerTeamId, onDone }: {
  race: Race
  results: RaceResults
  teams: Team[]
  players: Player[]
  playerTeamId: string
  onDone: () => void
}) {
  const segs = [...race.segments].sort((a, b) => a.index - b.index)
  const orderedResults = segs
    .map(s => results.segmentResults.find(r => r.segmentIndex === s.index))
    .filter((r): r is InteractiveSegResult => !!r)
  const totalSegs = orderedResults.length

  const [segStep, setSegStep] = useState(0)
  const step = Math.min(Math.max(0, segStep), Math.max(0, totalSegs - 1))
  const currentSeg = segs[step]
  const currentResult = orderedResults[step] ?? null

  if (!currentSeg || !currentResult) return null

  // 現区間までの累積タイム・区間ポイント（現区間を含む＝SimPhase 側で現区間分を差し引いて基準線を作る）
  const cumulativeTime: Record<string, number> = {}
  const segPts: Record<string, number> = {}
  for (let i = 0; i <= step; i++) {
    const sr = orderedResults[i]
    if (!sr) continue
    for (const r of sr.runners) {
      cumulativeTime[r.teamId] = (cumulativeTime[r.teamId] ?? 0) + r.timeSec
      if (r.rank >= 1 && r.rank <= 3) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][r.rank - 1]
    }
  }

  // 現区間の走者・タイム（トラックアニメのタイム差計算用）
  const cpuTimesForSeg: Record<string, number> = {}
  const segRunnerIds: Record<string, string> = {}
  let playerBaseTime = 0
  for (const r of currentResult.runners) {
    segRunnerIds[r.teamId] = r.playerId
    if (r.teamId === playerTeamId) playerBaseTime = r.timeSec
    else cpuTimesForSeg[r.teamId] = r.timeSec
  }

  const completedSegs = orderedResults.slice(0, step + 1)

  function advance() {
    if (step < totalSegs - 1) setSegStep(step + 1)
    else onDone()
  }

  return (
    <SimPhase
      race={race}
      teams={teams}
      players={players}
      playerTeamId={playerTeamId}
      pendingEvent={null}
      pendingEventsCount={0}
      lowStaminaHint={false}
      currentSegIdx={currentSeg.index}
      completedSegResults={completedSegs}
      cumulativeTime={cumulativeTime}
      cpuTimesForSeg={cpuTimesForSeg}
      playerBaseTime={playerBaseTime}
      segStamina={0}
      segPts={segPts}
      showingSegResult={true}
      lastSegResult={currentResult}
      segRunnerIds={segRunnerIds}
      onChoiceMade={() => {}}
      onAdvance={advance}
      onSkip={onDone}
      onSkipSegment={() => {}}
    />
  )
}
