// シーズンの結果を選手の通算成績へ書き込む。endSeason から切り出した（挙動不変）。
//
//   MVP受賞 ／ 優勝 ／ レンタル中の在籍履歴
//
// ■触るときの注意
//   - **優勝はリーグごとに1クラブ。** 日本の1部・2部・3部も海外9リーグも、そのリーグの優勝として
//     1回数える（12リーグ同じ扱い）。52チームを1本に並べた先頭ではない（部ごとにレース数が違う）
//   - MVPもリーグごと（12リーグ。1部MVP・2部MVP・3部MVP・海外9）。選び方は `utils/awards` 1本で、
//     通算のMVP回数へ足すのは**全リーグの受賞者**（`seasonMvpIds`）。読み込み時の数え直し
//     （utils/careerStats の careerCountsOf）と同じ数え方にするため。自分のリーグだけを足さないこと
//   - レンタル中の選手は、その年の所属先を `loanTeamYears` に足す。
//     在籍履歴に「(L)」付きで出すためのもので、同じ年・同じクラブを二重に足さない
import { leagueStandingRows, rankedStandings } from '../utils/league'
import { belongsToClub } from '../utils/rosterSync'
import { WORLD_LEAGUES } from '../data/leagues'
import type { GameState, Player } from '../types'

export function applySeasonCareerRecords(args: {
  players: Player[]
  /** その年のMVP（リーグごとに選ばれた受賞者の全部。utils/awards の seasonMvpIds） */
  mvpIds: readonly string[]
  currentSeason: GameState['currentSeason']
}): Player[] {
  const { players, mvpIds, currentSeason } = args

  // 同じ選手が2つのリーグで選ばれたら2回（読み込み時の数え直しと同じ）
  const mvpCount = new Map<string, number>()
  for (const id of mvpIds) mvpCount.set(id, (mvpCount.get(id) ?? 0) + 1)
  const withMvp = mvpCount.size > 0
    ? players.map(p => {
        const n = mvpCount.get(p.id)
        return n ? { ...p, career: { ...p.career, mvpAwards: p.career.mvpAwards + n } } : p
      })
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
