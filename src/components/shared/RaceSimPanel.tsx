// レース中継（SimPhase）を、リーグ戦以外の大会からも同じ形で出すための薄い包み。
//
// もとは ReserveLeaguePage.tsx の中にあり、ECL と世界選手権がそこから import していた。
// リザーブ（2軍リーグ）を廃止したので、ページと一緒に消えないようここへ移した。
// 中身は移動しただけで変えていない。
import { useMemo, useState } from 'react'
import { SimPhase } from '../race/SimPhase'
import type { Race, RaceResults, Team, Player } from '../../types'
import type { InteractiveSegResult } from '../../engine/interactiveRace'

export function RaceSimPanel({ race, results, teams, players, playerTeamId, onDone }: {
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
  // 観戦（自チームが走っていないレース＝ECLの観戦など）ではトラック描画の基準タイムが0になり
  // 棒グラフが一切出なくなるため、区間トップのタイムを基準にして全チームを描画する
  if (playerBaseTime === 0 && currentResult.runners.length > 0) {
    playerBaseTime = Math.min(...currentResult.runners.map(r => r.timeSec))
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
