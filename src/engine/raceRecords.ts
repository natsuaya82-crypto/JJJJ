// このレースで区間記録が塗り替わったかの判定（store/slices/raceSlice の runRace から切り出し）。
//
// 歴代記録はセーブに貯めず、保存してあるレース結果から数え直す（utils/segmentRecords）。
// **このレースの結果はまだ currentSeason に入っていない**ので、引いた記録は
// 「今走ったレースより前の記録」になる。＝そのまま比べれば「新記録か」が出る。
//
// 同じ呼び名のコースは同じ記録（リーグで分けない。utils/segmentRecords）。
// ★本編の1戦（store/slices/raceSlice）も、裏で走るほかの11リーグ（engine/leagueDay）も
//   ここ1本で判定する（オーナー・2026-09-28「直します」。以前は自分のリーグだけニュースになった）。
// 乱数は使わない。
import type { LeagueId, Player, Race, RaceResults, WorldClub } from '../types'
import type { SegmentRecordMap } from '../utils/segmentRecords'
import { type NewsItem, segmentRecordHeadline } from '../utils/newsItems'
import { clubById } from '../utils/world'

export function detectSegmentRecords(params: {
  race: Race
  results: RaceResults
  players: Player[]
  clubs: WorldClub[]
  playerTeamId: string
  /** そのレースのリーグ（見出しに添える呼び名） */
  leagueId: LeagueId | undefined
  /** このレースを走る前の区間記録（utils/segmentRecords の segmentRecordsOf） */
  prevSegRecords: SegmentRecordMap
}): { news: NewsItem[]; marks: { segmentIndex: number; playerId: string }[] } {
  const { race, results, players, clubs, playerTeamId, leagueId, prevSegRecords } = params
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
      const tmShort = clubById(clubs, fastestRunner.teamId)?.shortName ?? '?'
      marks.push({ segmentIndex: sr.segmentIndex, playerId: fastestRunner.playerId })
      news.push({
        date: race.date,
        headline: segmentRecordHeadline({
          leagueId, raceName: race.name, segmentIndex: sr.segmentIndex,
          playerName: plName, clubShort: tmShort,
          timeSec: fastestRunner.timeSec, prevTimeSec: prevBest, mine: isMine }),
        category: 'race' as const,
        relatedIds: [fastestRunner.playerId] })
    }
  }
  return { news, marks }
}
