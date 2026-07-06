import { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { runWithLoading } from '../../store/loadingStore'
import type { RaceResults } from '../../types'
import { LineupPhase } from './LineupPhase'
import { SimPhase } from './SimPhase'
import { ResultsPhase } from './ResultsPhase'
import { buildAILineup } from '../../engine/raceEngine'
import { audio } from '../../utils/audio'
import {
  calcCpuTimesForSeg, calcSegOvr, calcNaturalDrain, calcFinalSegTime,
  generateSegmentEvents, resolveChoice, finalizeSegment,
} from '../../engine/interactiveRace'
import type { ISim, InteractiveSegResult } from '../../engine/interactiveRace'

type Phase = 'lineup' | 'simulating' | 'results'

const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

// 最終順位を構築：全区間を走り切ったチームを上位（タイム昇順）、未完走チーム（人員不足で欠員）を下位に。
// simulateRace と同じ方針で、累積タイム0の欠員チームが不当に1位になるのを防ぐ。
function buildTeamRankings(
  cumTime: Record<string, number>,
  completedSegs: InteractiveSegResult[],
  segPts: Record<string, number>,
  totalSegs: number,
): RaceResults['teamRankings'] {
  const segCount: Record<string, number> = {}
  for (const sr of completedSegs) for (const r of sr.runners) segCount[r.teamId] = (segCount[r.teamId] ?? 0) + 1
  const ids = Object.keys(cumTime)
  const complete = ids.filter(id => (segCount[id] ?? 0) >= totalSegs).sort((a, b) => cumTime[a] - cumTime[b])
  const incomplete = ids.filter(id => (segCount[id] ?? 0) < totalSegs)
    .sort((a, b) => (segCount[b] ?? 0) - (segCount[a] ?? 0) || cumTime[a] - cumTime[b])
  return [...complete, ...incomplete].map((teamId, i) => ({
    teamId,
    totalTimeSec: cumTime[teamId],
    rank: i + 1,
    positionPoints: Math.max(0, 21 - (i + 1)),
    segmentPoints: segPts[teamId] ?? 0,
  }))
}

export default function RacePage() {
  const {
    currentSeason, teams, players, playerTeamId,
    raceLineup, lastRaceLineup, setRaceLineup, clearRaceLineup, runRace,
    raceStrategy, setRaceStrategy,
    raceTeamTalk, setRaceTeamTalk,
    setActiveRacePhase, setActiveRaceLocked,
  } = useGameStore()

  const [phase, setPhaseLocal] = useState<Phase>('lineup')
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [results, setResults] = useState<RaceResults | null>(null)
  const [lockedRace, setLockedRace] = useState<import('../../types').Race | null>(null)
  const [lockedRaceIndex, setLockedRaceIndex] = useState<number>(0)
  const [iSim, setISim] = useState<ISim | null>(null)

  const setPhase = (p: Phase) => {
    setPhaseLocal(p)
    setActiveRacePhase(p)
    audio.playBgm(p === 'simulating' ? 'race' : 'home')
  }

  useEffect(() => {
    // マウント時は編成画面（lineup）。下ナビを隠してボトムバー(クリア/自動配置)と被らないようにする。
    setActiveRacePhase('lineup')
    audio.playBgm('home')
    return () => { setActiveRacePhase(null) }
  }, [])

  const raceIndex = currentSeason.currentRaceIndex
  const currentRace = currentSeason.races[raceIndex]

  const race = (phase !== 'lineup' && lockedRace) ? lockedRace : currentRace
  const activeRaceIndex = (phase !== 'lineup' && lockedRace) ? lockedRaceIndex : raceIndex

  const mainPlayers = players.filter(
    p => p.teamId === playerTeamId && p.status !== 'retired'
      // 1軍契約(main) or レンタル枠（1軍・2軍どちらのレースにも出場制限なし）
      && (p.rosterTier === 'main' || !!p.loan)
      // レンタル選手は加入後2戦の出走制限を受けない
      && (!!p.loan || p.acquiredRaceIndex == null || raceIndex - p.acquiredRaceIndex >= 2)
  )
  const assignedIds = new Set(Object.values(raceLineup))
  const allSegsFilled = (race?.segments ?? []).every(s => !!raceLineup[s.index])

  if (!currentRace && phase === 'lineup') {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        fontFamily: "'Noto Sans JP', system-ui, sans-serif",
        color: '#5C5870', fontSize: '14px',
      }}>
        {raceIndex >= currentSeason.races.length
          ? 'シーズン終了。すべてのレースが完了しました。'
          : 'レーススケジュールが未設定です。'}
      </div>
    )
  }
  if (!race) return null

  function buildSegmentState(
    sim: ISim,
    segIdx: number,
    activeRace: import('../../types').Race,
  ): ISim {
    const seg = activeRace.segments.find(s => s.index === segIdx)
    if (!seg) return sim

    const playerPlayerId = raceLineup[segIdx]
    const playerObj = players.find(p => p.id === playerPlayerId)
    const playerTeam = teams.find(t => t.id === playerTeamId)
    const seasonProgress = raceIndex / currentSeason.races.length
    const totalSegs = activeRace.segments.length

    const cpuTimesForSeg = calcCpuTimesForSeg(
      seg, teams, sim.cpuLineups, players, playerTeamId,
      activeRace, seasonProgress, totalSegs,
    )

    const segOvr = playerObj ? calcSegOvr(playerObj, seg) : 50
    const naturalDrain = calcNaturalDrain(segOvr, seg.distanceKm)
    const segStamina = Math.max(1, segOvr - naturalDrain)

    // プレイヤーの区間タイムも CPU と同じ計算方式（消耗込み calcFinalSegTime）で見積もる。
    // イベント予測順位・ライブ表示・確定フォールバックの基準を CPU と揃える。
    const playerBaseTime = playerObj
      ? calcFinalSegTime(segStamina, segOvr, 0, playerObj, seg, playerTeam, activeRace, seasonProgress, raceStrategy, totalSegs)
      : 9999

    // Build cumulative times for event context (keyed by teamId, player as '__player__')
    const cumulativeTimes: Record<string, number> = { '__player__': sim.cumulativeTime[playerTeamId] ?? 0 }
    for (const [tid, t] of Object.entries(sim.cumulativeTime)) {
      if (tid !== playerTeamId) cumulativeTimes[tid] = t
    }

    const events = playerObj
      ? generateSegmentEvents({
          seg,
          playerBaseTime,
          cpuTimesForSeg,
          cumulativeTimes,
          isFirstSeg: segIdx === activeRace.segments[0].index,
          player: playerObj,
          totalSegs,
          players,
          cpuLineups: sim.cpuLineups,
          teams,
        })
      : []

    return {
      ...sim,
      currentSegIdx: segIdx,
      cpuTimesForSeg,
      playerBaseTime,
      initialSegStamina: segOvr,
      segStamina,
      playerTimeMod: 0,
      pendingEvents: events,
      showingSegResult: false,
      lastSegResult: null,
    }
  }

  function startInteractiveSim(_tactics: Record<number, string>) {
    if (!allSegsFilled || !currentRace) return

    setLockedRace(currentRace)
    setLockedRaceIndex(raceIndex)
    setActiveRaceLocked(currentRace, raceIndex)

    // Build CPU lineups
    const cpuLineups: Record<string, Record<number, string>> = {}
    for (const team of teams) {
      if (team.id === playerTeamId) continue
      cpuLineups[team.id] = buildAILineup(team.id, players, currentRace)
    }

    const initialSim: ISim = {
      cpuLineups,
      currentSegIdx: 0,
      cpuTimesForSeg: {},
      playerBaseTime: 0,
      initialSegStamina: 0,
      segStamina: 0,
      playerTimeMod: 0,
      pendingEvents: [],
      completedSegs: [],
      cumulativeTime: {},
      segPts: {},
      showingSegResult: false,
      lastSegResult: null,
    }

    const firstSegIdx = currentRace.segments[0].index
    const readySim = buildSegmentState(initialSim, firstSegIdx, currentRace)
    setISim(readySim)
    setPhase('simulating')
  }

  function handleChoice(choiceIdx: number) {
    if (!iSim || !race) return
    const event = iSim.pendingEvents[0]
    if (!event) return

    const playerPlayerId = raceLineup[iSim.currentSegIdx]
    const playerObj = players.find(p => p.id === playerPlayerId)
    if (!playerObj) return

    const { staminaDelta: _sd, timeDelta, newStamina } = resolveChoice(event, choiceIdx, iSim.segStamina, iSim.playerBaseTime)
    void _sd

    const remainingEvents = iSim.pendingEvents.slice(1)
    const newPlayerTimeMod = iSim.playerTimeMod + timeDelta

    if (remainingEvents.length === 0) {
      finalizeCurrentSeg({ ...iSim, pendingEvents: [], playerTimeMod: newPlayerTimeMod, segStamina: newStamina })
    } else {
      setISim(prev => prev ? {
        ...prev,
        pendingEvents: remainingEvents,
        playerTimeMod: newPlayerTimeMod,
        segStamina: newStamina,
      } : null)
    }
  }

  // 現区間を即確定（残りイベント・アニメをスキップして区間結果へ）
  function handleSkipSegment() {
    if (!iSim || !race) return
    if (iSim.showingSegResult) return
    finalizeCurrentSeg({ ...iSim, pendingEvents: [] })
  }

  function finalizeCurrentSeg(sim: ISim) {
    if (!race) return
    // 冪等化：同一区間を二重確定しない（選択とスキップの競合でのポイント二重加算を防止）
    if (sim.showingSegResult || sim.completedSegs.some(s => s.segmentIndex === sim.currentSegIdx)) return

    const playerPlayerId = raceLineup[sim.currentSegIdx]
    const playerObj2 = players.find(p => p.id === playerPlayerId)
    const playerTeam2 = teams.find(t => t.id === playerTeamId)
    const seg2 = race.segments.find(s => s.index === sim.currentSegIdx)
    const seasonProgress2 = raceIndex / currentSeason.races.length
    const totalSegs2 = race.segments.length
    const playerFinalTime = playerObj2 && seg2
      ? calcFinalSegTime(sim.segStamina, sim.initialSegStamina, sim.playerTimeMod, playerObj2, seg2, playerTeam2, race, seasonProgress2, raceStrategy, totalSegs2)
      : Math.max(30, sim.playerBaseTime)

    const segResult = finalizeSegment({
      segmentIndex: sim.currentSegIdx,
      playerTeamId,
      playerPlayerId: playerPlayerId ?? '',
      playerFinalTime,
      cpuTimesForSeg: sim.cpuTimesForSeg,
      cpuLineups: sim.cpuLineups,
    })

    // Update cumulative times
    const newCumTime = { ...sim.cumulativeTime }
    newCumTime[playerTeamId] = (newCumTime[playerTeamId] ?? 0) + playerFinalTime
    for (const [tid, t] of Object.entries(sim.cpuTimesForSeg)) {
      newCumTime[tid] = (newCumTime[tid] ?? 0) + t
    }

    // Update segment points (top 3)
    const newSegPts = { ...sim.segPts }
    segResult.runners.slice(0, 3).forEach((r, i) => {
      newSegPts[r.teamId] = (newSegPts[r.teamId] ?? 0) + [3, 2, 1][i]
    })

    const newCompletedSegs = [...sim.completedSegs, segResult]

    setISim({
      ...sim,
      completedSegs: newCompletedSegs,
      cumulativeTime: newCumTime,
      segPts: newSegPts,
      showingSegResult: true,
      lastSegResult: segResult,
      pendingEvents: [],
    })
  }

  function handleAdvance() {
    if (!iSim || !race) return

    // 完了区間数で判定（index の付き方に依存しない堅牢な完了検出）
    const doneIdx = new Set(iSim.completedSegs.map(s => s.segmentIndex))
    const nextSeg = race.segments.find(s => !doneIdx.has(s.index))
    const allDone = iSim.completedSegs.length >= race.segments.length || !nextSeg

    if (allDone) {
      // Race complete — build RaceResults and hand off to store
      const segmentResults = iSim.completedSegs.map(s => ({
        segmentIndex: s.segmentIndex,
        runners: s.runners,
      }))

      const teamRankings = buildTeamRankings(iSim.cumulativeTime, iSim.completedSegs, iSim.segPts, race.segments.length)

      const preComputedResults: RaceResults = { teamRankings, segmentResults }
      // runRace を先に実行してシーズン順位を更新してから結果画面へ（失敗しても結果は見られるように）
      let finalResults: RaceResults = preComputedResults
      try {
        const r = runRace(raceLineup, {}, preComputedResults)
        if (r) finalResults = r
      } catch (e) {
        console.error('runRace failed:', e)
      }
      setResults(finalResults)
      setPhase('results')
      return
    }

    // Advance to next segment
    const nextSim = buildSegmentState(iSim, nextSeg.index, race)
    setISim(nextSim)
  }

  function handleSkip() {
    if (!iSim || !race) return

    // Simulate remaining segments instantly (without events)
    const sim = { ...iSim }

    // If currently mid-segment, finalize it first
    const playerPlayerId = raceLineup[sim.currentSegIdx]
    const playerFinalTime = Math.max(30, sim.playerBaseTime)
    const currentSegResult = finalizeSegment({
      segmentIndex: sim.currentSegIdx,
      playerTeamId,
      playerPlayerId: playerPlayerId ?? '',
      playerFinalTime,
      cpuTimesForSeg: sim.cpuTimesForSeg,
      cpuLineups: sim.cpuLineups,
    })

    let completedSegs = sim.showingSegResult && sim.lastSegResult
      ? sim.completedSegs
      : [...sim.completedSegs, currentSegResult]

    const cumTime = { ...sim.cumulativeTime }
    if (!sim.showingSegResult) {
      cumTime[playerTeamId] = (cumTime[playerTeamId] ?? 0) + playerFinalTime
      for (const [tid, t] of Object.entries(sim.cpuTimesForSeg)) {
        cumTime[tid] = (cumTime[tid] ?? 0) + t
      }
    }

    const segPts = { ...sim.segPts }
    if (!sim.showingSegResult) {
      currentSegResult.runners.slice(0, 3).forEach((r, i) => {
        segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][i]
      })
    }

    // Simulate all remaining segments
    const segs = race.segments
    const doneSeg = new Set(completedSegs.map(s => s.segmentIndex))
    const seasonProgress = raceIndex / currentSeason.races.length
    const totalSegs = segs.length

    for (const seg of segs) {
      if (doneSeg.has(seg.index)) continue
      const pid = raceLineup[seg.index]
      const playerObj = players.find(p => p.id === pid)
      const playerTeam = teams.find(t => t.id === playerTeamId)

      const cpuTimes = calcCpuTimesForSeg(seg, teams, sim.cpuLineups, players, playerTeamId, race, seasonProgress, totalSegs)
      // スキップ区間もCPUと同じ消耗込み計算で見積もる
      const skSegOvr = playerObj ? calcSegOvr(playerObj, seg) : 50
      const skSegStamina = Math.max(1, skSegOvr - calcNaturalDrain(skSegOvr, seg.distanceKm))
      const pBase = playerObj
        ? calcFinalSegTime(skSegStamina, skSegOvr, 0, playerObj, seg, playerTeam, race, seasonProgress, raceStrategy, totalSegs)
        : 9999

      const skippedResult = finalizeSegment({
        segmentIndex: seg.index,
        playerTeamId,
        playerPlayerId: pid ?? '',
        playerFinalTime: pBase,
        cpuTimesForSeg: cpuTimes,
        cpuLineups: sim.cpuLineups,
      })

      completedSegs = [...completedSegs, skippedResult]
      cumTime[playerTeamId] = (cumTime[playerTeamId] ?? 0) + pBase
      for (const [tid, t] of Object.entries(cpuTimes)) {
        cumTime[tid] = (cumTime[tid] ?? 0) + t
      }
      skippedResult.runners.slice(0, 3).forEach((r, i) => {
        segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][i]
      })
    }

    const teamRankings = buildTeamRankings(cumTime, completedSegs, segPts, race.segments.length)
    const preComputedResults: RaceResults = { teamRankings, segmentResults: completedSegs }
    const finalResults = runRace(raceLineup, {}, preComputedResults)
    setResults(finalResults)
    setPhase('results')
  }

  // Derive lowStaminaHint from internal state (not passed directly)
  const lowStaminaHint = iSim && iSim.initialSegStamina > 0
    ? iSim.segStamina / iSim.initialSegStamina < 0.6
    : false

  if (phase === 'lineup') return (
    <LineupPhase
      race={race}
      raceNumber={raceIndex + 1}
      totalRaces={currentSeason.races.length}
      mainPlayers={mainPlayers}
      raceLineup={raceLineup}
      assignedIds={assignedIds}
      allSegsFilled={allSegsFilled}
      pickerSeg={pickerSeg}
      setPickerSeg={setPickerSeg}
      setRaceLineup={setRaceLineup}
      clearRaceLineup={clearRaceLineup}
      onStart={(tactics) => runWithLoading('レース準備中…', () => startInteractiveSim(tactics), 500)}
      weatherLabel={weatherLabel}
      raceStrategy={raceStrategy}
      setRaceStrategy={setRaceStrategy}
      teamTalk={raceTeamTalk}
      setTeamTalk={setRaceTeamTalk}
      lastLineup={lastRaceLineup}
    />
  )

  if (phase === 'simulating' && iSim) {
    const segRunnerIds: Record<string, string> = {}
    const segIdx = iSim.currentSegIdx
    if (raceLineup[segIdx]) segRunnerIds[playerTeamId] = raceLineup[segIdx]
    for (const [tid, lineup] of Object.entries(iSim.cpuLineups)) {
      if (lineup[segIdx]) segRunnerIds[tid] = lineup[segIdx]
    }

    // ライブ表示用：現在のスタミナ・イベント補正を反映した投影最終タイム（実結果と一致させる）
    const livePlayerObj = players.find(p => p.id === raceLineup[segIdx])
    const livePlayerTeam = teams.find(t => t.id === playerTeamId)
    const liveSeg = race.segments.find(s => s.index === segIdx)
    const liveSeasonProgress = raceIndex / currentSeason.races.length
    const livePlayerTime = livePlayerObj && liveSeg
      ? calcFinalSegTime(iSim.segStamina, iSim.initialSegStamina, iSim.playerTimeMod, livePlayerObj, liveSeg, livePlayerTeam, race, liveSeasonProgress, raceStrategy, race.segments.length)
      : iSim.playerBaseTime

    return (
      <SimPhase
        race={race}
        teams={teams}
        players={players}
        playerTeamId={playerTeamId}
        pendingEvent={iSim.pendingEvents[0] ?? null}
        pendingEventsCount={iSim.pendingEvents.length}
        lowStaminaHint={lowStaminaHint}
        currentSegIdx={iSim.currentSegIdx}
        completedSegResults={iSim.completedSegs}
        cumulativeTime={iSim.cumulativeTime}
        cpuTimesForSeg={iSim.cpuTimesForSeg}
        playerBaseTime={livePlayerTime}
        segPts={iSim.segPts}
        showingSegResult={iSim.showingSegResult}
        lastSegResult={iSim.lastSegResult}
        segRunnerIds={segRunnerIds}
        onChoiceMade={handleChoice}
        onAdvance={handleAdvance}
        onSkip={handleSkip}
        onSkipSegment={handleSkipSegment}
      />
    )
  }

  if (phase === 'results' && results) return (
    <ResultsPhase
      race={race}
      results={results}
      teams={teams}
      players={players}
      playerTeamId={playerTeamId}
      currentSeason={currentSeason}
      isLastRace={activeRaceIndex >= currentSeason.races.length - 1}
    />
  )

  return null
}
