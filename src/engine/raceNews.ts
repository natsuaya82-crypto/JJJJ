// レース結果のニュース（store/slices/raceSlice の runRace から切り出し）。
//
// 出るのは4種類: 優勝チーム / 自チームの着順 / 自チームの区間賞 / 首脳陣の評価 / ライバルとの比較。
// **見出しの文面は utils/newsItems 1本**。ここは「何が起きたか」だけを渡す。
//
// ★乱数は引数で受ける（既定は Math.random）。呼ぶ順は切り出し前と同じ:
//   ① 3本の見出しが共有する pick を1回、② 首脳陣の評価が出るときだけもう1回。
import type { Division, Race, RaceResults, Player, Season, Team } from '../types'
import { DIVISION_SIZE, divisionStandings, rankOfTeam } from '../utils/league'
import { type NewsItem, boardEvalHeadline, myFinishHeadline, raceWinnerHeadline, rivalHeadline, segmentWinHeadline } from '../utils/newsItems'

export function buildRaceNews(params: {
  race: Race
  results: RaceResults
  teams: Team[]
  players: Player[]
  playerTeamId: string
  myDivision: Division
  currentSeason: Season
  rivalTeamId: string | null
  rng?: () => number
}): NewsItem[] {
  const { race, results, teams, players, playerTeamId, myDivision, currentSeason, rivalTeamId, rng = Math.random } = params

  const winnerTeam = teams.find(t => t.id === results.teamRankings[0]?.teamId)
  const playerResult = results.teamRankings.find(r => r.teamId === playerTeamId)
  const playerRank = playerResult?.rank ?? 0
  const rankSuffix = playerRank === 1 ? '優勝' : `第${playerRank}位`

  // 自チームの区間賞（走者の先頭が自チームだった区間）
  const mySegWins = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId)
  const mySegWinPlayer = mySegWins.length > 0
    ? players.find(p => p.id === mySegWins[0].runners[0]?.playerId)
    : null

  const rng01 = rng()

  const newsItems: NewsItem[] = [
    {
      date: race.date,
      headline: raceWinnerHeadline({
        division: myDivision, raceName: race.name,
        winnerName: winnerTeam?.name ?? '',
        points: results.teamRankings[0]?.positionPoints, pick: rng01 }),
      category: 'race' as const,
      relatedIds: [race.id] },
    ...(playerRank > 0 ? [{
      date: race.date,
      headline: myFinishHeadline({ division: myDivision, raceName: race.name, rank: playerRank, rankSuffix, pick: rng01 }),
      category: 'race' as const,
      relatedIds: [race.id] }] : []),
    ...(mySegWinPlayer ? [{
      date: race.date,
      headline: segmentWinHeadline({ playerName: mySegWinPlayer.name, segmentIndex: mySegWins[0].segmentIndex, pick: rng01 }),
      category: 'race' as const,
      relatedIds: [mySegWinPlayer.id] }] : []),
  ]

  // 首脳陣の評価（3戦目以降・3戦ごと）
  if (playerRank > 0) {
    const raceIndex = currentSeason.currentRaceIndex
    const totalRaces = currentSeason.races.length
    if (raceIndex >= 3 && raceIndex % 3 === 0) {
      const sortedStandingsNow = divisionStandings(currentSeason, myDivision)
      const myCurrentRank = rankOfTeam(sortedStandingsNow, playerTeamId)
      // 「うちは弱い」の基準は**自分の部の中で**見る。52で割ると3部(16)は
      // 最下位でも18位以内に入ってしまい、誰も不満を言わなくなる
      const expectedRank = Math.ceil(DIVISION_SIZE[myDivision] / 3)
      const remainingRaces = totalRaces - raceIndex
      const satisfied = myCurrentRank <= expectedRank
      if (satisfied || myCurrentRank > expectedRank + 4) {
        newsItems.push({
          date: race.date,
          headline: boardEvalHeadline({ rank: myCurrentRank, remainingRaces, satisfied, pick: rng() }),
          category: 'finance' as const, relatedIds: [] })
      }
    }
  }

  // ライバルとの比較
  if (rivalTeamId && playerRank > 0) {
    const rivalRank = results.teamRankings.find(r => r.teamId === rivalTeamId)?.rank
    const rivalShort = teams.find(t => t.id === rivalTeamId)?.shortName
    if (rivalRank != null && rivalShort && playerRank !== rivalRank) {
      newsItems.push({
        date: race.date,
        headline: rivalHeadline({ rivalShort, myRank: playerRank, rivalRank }),
        category: 'race' as const, relatedIds: [rivalTeamId] })
    }
  }

  return newsItems
}
