// このレースで区間記録が塗り替わったかの判定（store/slices/raceSlice の runRace から切り出し）。
//
// 歴代記録はセーブに貯めず、保存してあるレース結果から数え直す（utils/segmentRecords）。
// **このレースの結果はまだ currentSeason に入っていない**ので、引いた記録は
// 「今走ったレースより前の記録」になる。＝そのまま比べれば「新記録か」が出る。
//
// 1部・2部・3部は同じコースを分け合って走るので、記録はコース1本ぶん（部で分けない）。
// 乱数は使わない。
import type { Division, Player, Race, RaceResults, Team } from '../types'
import { segmentRecordsOf, type SeasonRacesLike } from '../utils/segmentRecords'
import { type NewsItem, segmentRecordHeadline } from '../utils/newsItems'

export function detectSegmentRecords(params: {
  race: Race
  results: RaceResults
  players: Player[]
  teams: Team[]
  playerTeamId: string
  myDivision: Division
  pastSeasons: SeasonRacesLike[]
  currentSeason: SeasonRacesLike
}): { news: NewsItem[]; marks: { segmentIndex: number; playerId: string }[] } {
  const { race, results, players, teams, playerTeamId, myDivision, pastSeasons, currentSeason } = params
  // 区間新記録の判定。
  // 歴代記録はセーブに貯めず、保存してあるレース結果から数え直す。
  // このレースの結果はまだ currentSeason に入っていないので、これは「今走ったレースの前の記録」になる。
  const prevSegRecords = segmentRecordsOf(pastSeasons, currentSeason)
  // 区間新記録が出たらニュースにする（過去記録がある区間で更新された場合のみ）
  const news: NewsItem[] = []
  // 結果画面の「区間新！」バッジ用（このレースで従来記録を破った区間×選手）
  const marks: { segmentIndex: number; playerId: string }[] = []
  for (const sr of results.segmentResults) {
    const prevBest = (prevSegRecords[`${race.name}-${sr.segmentIndex}`] ?? [])[0]?.timeSec ?? null
    const fastestRunner = sr.runners.length > 0
      ? sr.runners.reduce((min, r) => r.timeSec < min.timeSec ? r : min, sr.runners[0])
      : null
    if (prevBest != null && fastestRunner && fastestRunner.timeSec < prevBest) {
      const isMine = fastestRunner.teamId === playerTeamId
      const plName = players.find(x => x.id === fastestRunner.playerId)?.name ?? '不明'
      const tmShort = teams.find(x => x.id === fastestRunner.teamId)?.shortName ?? '?'
      marks.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
      news.push({
        date: race.date,
        headline: segmentRecordHeadline({
          division: myDivision, raceName: race.name, segmentIndex: sr.segmentIndex,
          playerName: plName, clubShort: tmShort,
          timeSec: fastestRunner.timeSec, prevTimeSec: prevBest, mine: isMine }),
        category: 'race' as const,
        relatedIds: [fastestRunner.playerId] })
    }
  }
  return { news, marks }
}
