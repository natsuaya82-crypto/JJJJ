// 今季の記録を「保存する形」に整える。endSeason から切り出した（挙動不変）。
//
//   海外の出場記録（0戦ぶんも埋める） ／ 海外リーグ順位表（1戦ごとの結果を落とす）
//   ／ 国内で1度も走らなかった選手の所属
//
// ■触るときの注意
//   - **出場0の選手も記録する。** 選手詳細の在籍履歴は出場記録から行を作るので、
//     埋めないと「その年どこに居たか」が丸ごと消える。国内・海外どちらも同じ
//   - 過去シーズンの海外リーグ順位表は**合計ポイントしか読まれない**（チーム詳細の
//     歴代成績・リーグ優勝回数）。1戦ごとの結果は今季ぶんだけ必要なので保存時に落とす
//     （1シーズンあたり約120KB）
import { domesticTeamIdSet, foreignClubIdSet } from '../utils/clubs'
import type { ForeignLeague, GameState, Player, Team } from '../types'

export function prepareSeasonArchive(args: {
  currentSeason: GameState['currentSeason']
  /** 今季の頭の選手一覧 */
  before: Player[]
  teams: Team[]
  /** 今季の海外リーグ（更新前） */
  prevForeignLeagues: ForeignLeague[]
}) {
  const { currentSeason, before, teams, prevForeignLeagues } = args

  // 海外クラブ在籍で今季出場ゼロの選手にも0戦のエントリを埋めて保存する。
  // 在籍履歴（選手詳細）は出場記録から行を作るため、これが無いと出なかった年の所属が消える
  const archivedForeignApps = { ...(currentSeason.foreignAppearances ?? {}) }
  {
    const foreignClubIds = foreignClubIdSet(prevForeignLeagues)
    for (const p of before) {
      if (!foreignClubIds.has(p.teamId)) continue
      if (!archivedForeignApps[p.id]) archivedForeignApps[p.id] = { clubId: p.teamId, races: 0, wins: 0 }
    }
  }
  // 過去シーズンの海外リーグ順位表は「合計ポイント」しか読まれない（チーム詳細の歴代成績・
  // リーグ優勝回数）。1戦ごとの結果は今季ぶんだけ（直近フォーム・消化数）なので保存時に落とす。
  // セーブ容量の節約：1シーズンあたり約120KB
  const archivedForeignStandings = Object.fromEntries(
    Object.entries(currentSeason.foreignStandings ?? {})
      .map(([lid, st]) => [lid, st.map(s2 => ({ teamId: s2.teamId, totalPoints: s2.totalPoints, raceResults: [] }))]),
  )
  // 国内も同様：今季1度も出走しなかった在籍選手の所属を記録して保存（在籍履歴の空白防止）
  const appearedIds = new Set<string>()
  for (const race of [...currentSeason.races, ...(currentSeason.secondTeamRaces ?? [])]) {
    if (!race.results) continue
    for (const sr of race.results.segmentResults) for (const r of sr.runners) appearedIds.add(r.playerId)
  }
  const domesticTeamIds = domesticTeamIdSet(teams)
  const zeroAppearances = before
    .filter(p => p.status === 'active' && domesticTeamIds.has(p.teamId) && !appearedIds.has(p.id))
    .map(p => ({ playerId: p.id, teamId: p.teamId }))

  return { archivedForeignApps, archivedForeignStandings, zeroAppearances }
}
