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
import { myClub, teamById } from '../utils/world'
import { findClub } from '../utils/clubs'
import type { Player, Race, Season, Team, ForeignLeague } from '../types'
import { computeSeasonAwards } from '../utils/awards'
import { divisionOf } from '../utils/league'
import { type NewsItem, awardHeadline, retirementHeadline } from '../utils/newsItems'
import { comparePlayers } from '../utils/playerSort'
import { isRetiringAge, ovr } from '../utils/playerUtils'

export function buildSeasonFinaleNews(params: {
  players: Player[]
  teams: Team[]
  /** 海外リーグ。**渡すこと**——渡さないと海外所属の引退がクラブ名なしで出る */
  foreignLeagues?: ForeignLeague[] | null
  currentSeason: Season
  /** 今季の日程（結果入り） */
  races: Race[]
  playerTeamId: string
  raceDate: string
}): NewsItem[] {
  const { players, teams, foreignLeagues, currentSeason, races, playerTeamId, raceDate } = params
  const seasonEndNews: NewsItem[] = []
  {
    // ★MVPは部ごと（1部MVP・2部MVP・3部MVP）。ここは自分の部のぶん
    const award = computeSeasonAwards(races, players, currentSeason.year, divisionOf(myClub({ teams, playerTeamId })))
    const mvpP = award.mvpId ? players.find(p => p.id === award.mvpId) : undefined
    const rookieP = award.rookieId ? players.find(p => p.id === award.rookieId) : undefined
    if (mvpP) seasonEndNews.push({ date: raceDate, headline: awardHeadline({ kind: 'mvp', division: divisionOf(teamById(teams, mvpP.teamId)), clubShort: teamById(teams, mvpP.teamId)?.shortName ?? '', playerName: mvpP.name }), category: 'race' as const, relatedIds: [mvpP.id] })
    if (rookieP) seasonEndNews.push({ date: raceDate, headline: awardHeadline({ kind: 'rookie', division: divisionOf(teamById(teams, rookieP.teamId)), clubShort: teamById(teams, rookieP.teamId)?.shortName ?? '', playerName: rookieP.name }), category: 'race' as const, relatedIds: [rookieP.id] })
    // 引退表明。開幕時の引退判定とまったく同じ `isRetiringAge` を1歳先で評価する。
    // ★**国内だけに絞らないこと**（2026-09-15）。以前は `teams`（国内52クラブ）の
    //   IDで絞っていたので、**海外の選手の引退は一度もニュースにならなかった**。
    //   出す数は下で絞る（自チームは全員・他クラブは OVR72以上を6人まで）ので、
    //   ここで国で絞る理由は無い
    // ★**`p.teamId &&` を戻さないこと**（2026-09-15）。FA（`teamId` が空）を落とすと、
    //   契約満了で無所属になったベテランが**表明のニュース無しに翌開幕で消えます**。
    //   実際に引退させる `engine/retirement` は所属を見ないので、母集団を揃える
    const retiring = players.filter(p => p.status === 'active' && isRetiringAge(p, 1))
    const mineRet = retiring.filter(p => p.teamId === playerTeamId)
    const othersRet = retiring.filter(p => p.teamId !== playerTeamId && ovr(p) >= 72).sort(comparePlayers('ovr')).slice(0, 6)
    for (const p of [...mineRet, ...othersRet]) {
      // クラブ名は `utils/clubs` の `findClub` 1本（国内・海外を区別しない引き方）。
      // ★`teams.find(...)` で引くと**海外所属の選手だけクラブ名が空**になる
      const club = findClub(teams, foreignLeagues ?? [], p.teamId)
      seasonEndNews.push({ date: raceDate, headline: retirementHeadline({ division: divisionOf(teamById(teams, p.teamId)), clubShort: club?.shortName ?? '', playerName: p.name, age: p.age }), category: 'race' as const, relatedIds: [p.id] })
    }
  }
  return seasonEndNews
}
