// シーズン最終戦の「発表」（store/slices/raceSlice の runRace から切り出し）。
//
// 年内に見えるよう、**表彰（MVP・新人王）と引退表明を最終戦のニュースとして先に流す**。
// 実際の引退・表彰の確定は次シーズンの開幕処理のままなので、ここは**お知らせだけ**。
// 状態は何も変えない（ニュースを作って返すだけ）。
//
// ★MVPは部ごと（1部MVP・2部MVP・3部MVP）。走る相手も本数も違うので混ぜない
//   （分け方は utils/awards の computeSeasonAwards 1本）。
// ★引退表明は開幕時の引退判定と同じ式（utils/playerUtils の retirementAgeOf 1本）を
//   1歳先で評価する。ここに別の年齢を書かないこと。
import type { Player, Race, Season, Team } from '../types'
import { computeSeasonAwards } from '../utils/awards'
import { divisionOf } from '../utils/league'
import { type NewsItem, awardHeadline, retirementHeadline } from '../utils/newsItems'
import { comparePlayers } from '../utils/playerSort'
import { ovr, retirementAgeOf } from '../utils/playerUtils'

export function buildSeasonFinaleNews(params: {
  players: Player[]
  teams: Team[]
  currentSeason: Season
  /** 今季の日程（結果入り） */
  races: Race[]
  playerTeamId: string
  raceDate: string
}): NewsItem[] {
  const { players, teams, currentSeason, races, playerTeamId, raceDate } = params
  const seasonEndNews: NewsItem[] = []
  {
    // ★MVPは部ごと（1部MVP・2部MVP・3部MVP）。ここは自分の部のぶん
    const award = computeSeasonAwards(races, players, currentSeason.year, divisionOf(teams.find(t => t.id === playerTeamId)))
    const mvpP = award.mvpId ? players.find(p => p.id === award.mvpId) : undefined
    const rookieP = award.rookieId ? players.find(p => p.id === award.rookieId) : undefined
    if (mvpP) seasonEndNews.push({ date: raceDate, headline: awardHeadline({ kind: 'mvp', division: divisionOf(teams.find(t => t.id === mvpP.teamId)), clubShort: teams.find(t => t.id === mvpP.teamId)?.shortName ?? '', playerName: mvpP.name }), category: 'race' as const, relatedIds: [mvpP.id] })
    if (rookieP) seasonEndNews.push({ date: raceDate, headline: awardHeadline({ kind: 'rookie', division: divisionOf(teams.find(t => t.id === rookieP.teamId)), clubShort: teams.find(t => t.id === rookieP.teamId)?.shortName ?? '', playerName: rookieP.name }), category: 'race' as const, relatedIds: [rookieP.id] })
    // 引退表明。開幕時の引退判定と同じ式（utils/playerUtils の retirementAgeOf 1本）を1歳先で評価する
    const domesticIdsRet = new Set(teams.map(t => t.id))
    const retiring = players.filter(p => p.status === 'active' && domesticIdsRet.has(p.teamId) && (p.age + 1) >= retirementAgeOf(p))
    const mineRet = retiring.filter(p => p.teamId === playerTeamId)
    const othersRet = retiring.filter(p => p.teamId !== playerTeamId && ovr(p) >= 72).sort(comparePlayers('ovr')).slice(0, 6)
    for (const p of [...mineRet, ...othersRet]) {
      const tn = teams.find(t => t.id === p.teamId)?.shortName ?? ''
      seasonEndNews.push({ date: raceDate, headline: retirementHeadline({ division: divisionOf(teams.find(t => t.id === p.teamId)), clubShort: tn, playerName: p.name, age: p.age }), category: 'race' as const, relatedIds: [p.id] })
    }
  }
  return seasonEndNews
}
