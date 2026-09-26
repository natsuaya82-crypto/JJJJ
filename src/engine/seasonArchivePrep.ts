// 今季の記録を「保存する形」に整える。endSeason から切り出した（挙動不変）。
//
//   12リーグの順位表（どのリーグも同じ形のまま）／ 1度も走らなかった在籍選手の所属
//
// ■触るときの注意
//   - **出場0の選手も記録する。** 選手詳細の在籍履歴は出場記録から行を作るので、
//     埋めないと「その年どこに居たか」が丸ごと消える。**どのリーグのクラブも同じ**
//   - ★日本のリーグか海外かで保存の形を分けないこと（オーナー・2026-09-26「セーブも日本とか関係ない」）
import type { GameState, Player, Season, WorldClub } from '../types'
import { clubIdSet } from '../utils/world'

export function prepareSeasonArchive(args: {
  currentSeason: GameState['currentSeason']
  /** 今季の頭の選手一覧 */
  before: Player[]
  /** 今季のクラブ（更新前） */
  clubs: WorldClub[]
}) {
  const { currentSeason, before, clubs } = args

  // 旧い海外の出場記録（走行記録を残す前の年のもの）。新しい年はもう積まないので、あればそのまま渡すだけ
  const archivedForeignApps = { ...(currentSeason.foreignAppearances ?? {}) }
  // 順位表は**どのリーグも同じ形のまま**残す（以前は海外リーグだけ1戦ごとの結果を落としていて、
  // 海外クラブを指揮した年は記録室の勝利数などが0になっていた）
  const archivedLeagues: Season['leagues'] = { ...(currentSeason.leagues ?? {}) }
  // 今季1度も出走しなかった在籍選手の所属を記録して保存（在籍履歴の空白防止）。
  // ★**どのリーグのクラブも同じ**（走った選手は12リーグの走行記録から分かる＝utils/careerStats の seasonMemberships）
  const appearedIds = new Set<string>()
  for (const race of [...Object.values(currentSeason.leagues ?? {}).flatMap(l => l.races), ...(currentSeason.secondTeamRaces ?? [])]) {
    if (!race.results) continue
    for (const sr of race.results.segmentResults) for (const r of sr.runners) appearedIds.add(r.playerId)
  }
  const clubIds = clubIdSet(clubs)
  const zeroAppearances = before
    .filter(p => p.status !== 'retired' && clubIds.has(p.teamId) && !appearedIds.has(p.id))
    .map(p => ({ playerId: p.id, teamId: p.teamId }))

  return { archivedForeignApps, archivedLeagues, zeroAppearances }
}
