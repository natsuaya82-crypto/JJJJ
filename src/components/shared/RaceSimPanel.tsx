// レース中継（SimPhase）を、リーグ戦以外の大会からも同じ形で出すための薄い包み。
//
// 結果はもう決まっているので、全チームの区間タイムを中継の時計（`engine/raceTimeline`）へ
// そのまま渡して、タスキをつないで最後まで流すだけ。選択肢は無い。
import { useMemo } from 'react'
import { SimPhase } from '../race/SimPhase'
import { buildTimeline } from '../../engine/raceTimeline'
import type { Race, RaceResults, Team, Player } from '../../types'

export function RaceSimPanel({ race, results, raceTeams, players, playerTeamId, onDone }: {
  race: Race
  results: RaceResults
  raceTeams: Team[]
  players: Player[]
  playerTeamId: string
  onDone: () => void
}) {
  const bySeg = useMemo(
    () => new Map(results.segmentResults.map(r => [r.segmentIndex, new Map(r.runners.map(x => [x.teamId, x]))])),
    [results],
  )
  // 並びは最終順位のまま（同着の扱いを最終結果と揃える）
  const timeline = useMemo(() => buildTimeline(
    race.segments.map(s => s.distanceKm),
    results.teamRankings.map(({ teamId }) => ({
      teamId,
      legs: race.segments.map(s => {
        const time = bySeg.get(s.index)?.get(teamId)?.timeSec
        return time == null ? null : { time }
      }),
    })),
  ), [race, results, bySeg])

  return (
    <SimPhase
      race={race}
      raceTeams={raceTeams}
      players={players}
      playerTeamId={playerTeamId}
      timeline={timeline}
      runnerIdOf={(teamId, leg) => bySeg.get(race.segments[leg]?.index ?? -1)?.get(teamId)?.playerId}
      onFinish={onDone}
    />
  )
}
