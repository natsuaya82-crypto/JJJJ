// シーズンの結果を選手の通算成績へ書き込む。endSeason から切り出した（挙動不変）。
//
//   MVP受賞 ／ 優勝 ／ レンタル中の在籍履歴
//
// ■触るときの注意
//   - **優勝は部ごとに1クラブ。** 1部の優勝も3部の優勝も、その部の優勝として1回数える。
//     52チームを1本に並べた先頭ではない（部ごとにレース数が違うので並べられない）
//   - MVPも部ごと（1部MVP・2部MVP・3部MVP）。選び方は `utils/awards` 1本
//   - レンタル中の選手は、その年の所属先を `loanTeamYears` に足す。
//     在籍履歴に「(L)」付きで出すためのもので、同じ年・同じクラブを二重に足さない
import { DIVISIONS, divisionStandings } from '../utils/league'
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

  // 優勝は部ごとに1クラブ（1部の優勝も3部の優勝も、その部の優勝として数える）
  const champTeamIds = new Set(DIVISIONS.map(d => divisionStandings(currentSeason, d)[0]?.teamId).filter(Boolean))
  const withChamp = champTeamIds.size > 0
    ? withMvp.map(p =>
        champTeamIds.has(p.teamId)
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
