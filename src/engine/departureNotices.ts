// 自チームから居なくなった選手のお知らせ。endSeason から切り出した（挙動不変）。
//
// ■なぜ要るのか
//   契約満了のFA流出や他クラブへの移籍で、選手がロスターから**黙って消える**のを防ぐ。
//   引退は別にセレモニーとニュースがあるので、ここでは扱わない。
//
// ■触るときの注意
//   - 「今季の頭に自チームに居た選手」と「整理まで終わったあとの選手」を突き合わせる。
//     整理後の一覧（`after`）で数えると、消えた選手そのものが見つからない
//   - 行き先の名前は `findClub` 1本。国内と海外を分けないこと（海外へ移った選手も「出」に出る）
import { findClub } from '../utils/clubs'
import type { ForeignLeague, Player, Team, TransferRecord } from '../types'

export type DepartureNotice = { id: string; playerId: string; playerName: string; toTeamName: string; reason: 'transfer' | 'fa' }

export function collectDepartures(args: {
  /** 今季の頭の選手一覧 */
  before: Player[]
  /** 整理まで終わったあとの選手一覧 */
  cleanedPlayers: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  playerTeamId: string
  /** 今季の年 */
  year: number
  /** 来季の年 */
  newYear: number
}): { notices: DepartureNotice[]; records: TransferRecord[] } {
  const { before, cleanedPlayers, teams, foreignLeagues, playerTeamId, year, newYear } = args

  // 自チームから居なくなった選手の退団通知（契約満了のFA流出・他クラブへの移籍）。
  // ロスターから黙って消えるのを防ぐ。引退は別途セレモニー・ニュースがあるため除外
  const departureClubName = (teamId: string) =>
    findClub(teams, foreignLeagues, teamId)?.shortName
    ?? null
  const departureNotices = before
    .filter(p => p.teamId === playerTeamId && p.status !== 'retired')
    .flatMap((oldP): { id: string; playerId: string; playerName: string; toTeamName: string; reason: 'transfer' | 'fa' }[] => {
      const now = cleanedPlayers.find(p => p.id === oldP.id)
      if (!now || now.status === 'retired' || now.teamId === playerTeamId) return []
      const to = now.teamId === '' ? null : departureClubName(now.teamId)
      return [{ id: `dep-${oldP.id}-${newYear}`, playerId: oldP.id, playerName: oldP.name, toTeamName: to ?? '', reason: to ? 'transfer' : 'fa' }]
    })
  // 退団（FA流出・移籍）を移籍履歴にも記録する（移籍ページの「出」に日付付きで出るように）
  const departureRecords: TransferRecord[] = departureNotices.map(n => {
    const now = cleanedPlayers.find(p => p.id === n.playerId)
    return { year: newYear, date: `${year}-11-05`, playerId: n.playerId, fromTeamId: playerTeamId, toTeamId: now?.teamId ?? '', fee: 0, kind: 'free' as const }
  })

  return { notices: departureNotices, records: departureRecords }
}
