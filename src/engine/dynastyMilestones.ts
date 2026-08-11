// 監督の通算成績と、その節目のニュース。endSeason から切り出した（挙動不変）。
//
// ■触るときの注意
//   - **通算は「監督個人」で数える。クラブの通算（球団史）で数えないこと。**
//     クラブで数えると、優勝の多いクラブへ移った瞬間に前任者の優勝で連覇や王朝の称号が
//     成立したり解除されたりする。どのクラブで何位だったかは `utils/gmTenure` が持っている
//   - **今季を足したあとで数える。** 今季の順位表はまだ過去シーズンに入っていないので、
//     ここで足してから数え直す。足さないと「優勝した年に優勝が反映されない」
//   - 節目の条件も文面も `utils/newsItems` の `dynastyHeadlines` 1本。ここに書かないこと
import { dynastyHeadlines, type NewsItem } from '../utils/newsItems'
import { gmCareerTotals, gmSeasonRanks } from '../utils/gmTenure'
import { divisionOf } from '../utils/league'
import type { GameState, Player, Team } from '../types'

export type DynastyResult = {
  /** 監督の通算優勝回数 */
  totalChamps: number
  /** 監督の通算シーズン数 */
  totalSeasons: number
  /** 現在の連続上位 */
  curStreak: number
  news: NewsItem[]
}

export function computeDynastyMilestones(args: {
  pastSeasons: GameState['pastSeasons']
  currentSeason: GameState['currentSeason']
  gmTenures: GameState['gmTenures']
  teams: Team[]
  playerTeamId: string
  /** 今季の自チームの最終順位（部内） */
  finalRank: number
  /** 今季ぶんを足したあとの選手一覧 */
  playersAfter: Player[]
  /** 今季ぶんを足す前の選手一覧 */
  playersBefore: Player[]
}): DynastyResult {
  const { pastSeasons, currentSeason, gmTenures, teams, playerTeamId, finalRank, playersAfter, playersBefore } = args

  // 通算成績は「今季を足したあと」で見たいので、過去シーズンに今季の順位表を足して数え直す
  const gmRanksAfter = gmSeasonRanks([
    ...pastSeasons,
    { year: currentSeason.year, standings: currentSeason.standings },
  ], gmTenures, playerTeamId)
  const gmTotalsAfter = gmCareerTotals(gmRanksAfter)
  const totalChamps = gmTotalsAfter.championships
  const totalSeasons = gmTotalsAfter.seasons
  const curStreak = gmTotalsAfter.currentStreak

  const segWinsAfter = playersAfter.filter(p => p.teamId === playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)
  const segWinsBefore = playersBefore.filter(p => p.teamId === playerTeamId).reduce((s, p) => s + p.career.segmentWins, 0)

  const news: NewsItem[] = dynastyHeadlines({
    finalRank, championships: totalChamps, seasons: totalSeasons, currentStreak: curStreak,
    division: divisionOf(teams.find(t => t.id === playerTeamId)),
    segWinsAfter, segWinsBefore }).map(headline => ({ date: `${currentSeason.year}-10-26`, headline, category: 'race' as const, relatedIds: [] }))

  return { totalChamps, totalSeasons, curStreak, news }
}
