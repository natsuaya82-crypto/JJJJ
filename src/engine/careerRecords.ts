// シーズンの結果を選手の通算成績へ書き込む。endSeason から切り出した（挙動不変）。
//
//   MVP受賞 ／ 優勝 ／ レンタル中の在籍履歴
//
// ■触るときの注意
//   - **優勝はリーグごとに1クラブ。** 日本の1部・2部・3部も海外9リーグも、そのリーグの優勝として
//     1回数える（12リーグ同じ扱い）。52チームを1本に並べた先頭ではない（部ごとにレース数が違う）
//   - MVPも部ごと（1部MVP・2部MVP・3部MVP）。選び方は `utils/awards` 1本
//   - レンタル中の選手は、その年の所属先を `loanTeamYears` に足す。
//     在籍履歴に「(L)」付きで出すためのもので、同じ年・同じクラブを二重に足さない
import { leagueStandingRows, rankedStandings } from '../utils/league'
import { belongsToClub } from '../utils/rosterSync'
import { WORLD_LEAGUES } from '../data/leagues'
import type { GameState, Player } from '../types'

export function applySeasonCareerRecords(args: {
  players: Player[]
  /** その年のMVP（部ごとに選ばれた受賞者） */
  leagueMvpId: string | undefined
  currentSeason: GameState['currentSeason']
}): Player[] {
  const { players, leagueMvpId, currentSeason } = args

  const withMvp = leagueMvpId
    ? players.map(p =>
        p.id === leagueMvpId ? { ...p, career: { ...p.career, mvpAwards: p.career.mvpAwards + 1 } } : p
      )
    : players

  // 優勝はリーグごとに1クラブ（日本の部も海外リーグも、そのリーグの優勝として数える）
  const champTeamIds = new Set(WORLD_LEAGUES
    .map(l => rankedStandings(leagueStandingRows(currentSeason, l.id))[0]?.teamId)
    .filter((id): id is string => !!id))
  const withChamp = champTeamIds.size > 0
    ? withMvp.map(p =>
        champTeamIds.has(p.teamId) && belongsToClub(p, p.teamId)
          ? { ...p, career: { ...p.career, championships: p.career.championships + 1 } }
          : p
      )
    : withMvp

  // 在籍履歴（(L)レンタル）用：現在レンタル中の選手について、この年その所属チームでの出場記録を追記
  const seasonYear = currentSeason.year
  return withChamp.map(p => {
    if (!p.loan) return p
    const existing = p.loanTeamYears ?? []
    if (existing.some(l => l.year === seasonYear && l.teamId === p.teamId)) return p
    return { ...p, loanTeamYears: [...existing, { year: seasonYear, teamId: p.teamId }] }
  })
}
