import type { ForeignLeague, Player, Team } from '../types'
import type { ClubTier } from './clubTier'
import { needsPlayer } from './squadNeeds'
import { appraiseMove, RUNNING_SLOTS, type Destination } from './transferDecision'
import { allTieredClubs, tierOfPlayerClub } from './clubTier'
import { transferCapOf } from '../data/economy'
import { ROSTER_MAX } from '../data/rosterRules'

// 「いま同じ選手を狙っているクラブ」を数える唯一の場所。
//
// ■なぜ1本にするのか
//   ここは2つの用途がある。
//     ・競り（誰がいくらまで出すか）… レースを進めたときの決着（utils/transferBid の resolveBid）
//     ・件数の表示（◯クラブが動いています）… 移籍の入札とFAの獲得オファー
//   別々に数えると「3クラブと出ているのに競りは5クラブで起きる」ような食い違いになる。
//
// ■誰が参加するか
//   クラブは「強いから」ではなく「必要だから」動く。
//     ・そのタイプが必要（squadNeeds。頭数が足りない or 今いる同タイプより強い）
//     ・そのクラブで走れる7区間に入る（弱い専門家を穴埋めで買わない）
//     ・ロスターに空きがある（ROSTER_MAX）
//     ・本人がそのクラブへ行く気になる（transferDecision）
//   絞る前は「強い選手は全クラブが欲しがる」状態で、1人に43クラブが群がっていた。
//
// ■いくら出せるか
//   そのクラブの年間予算の TRANSFER_BUDGET_SHARE まで。手元の資金がそれより少なければそちら。
//   **誰が参加するかは需要、誰が勝つかは規模。**

export type RivalClub = { clubId: string; name: string; willing: number }

export function rivalClubsFor(
  target: Player,
  ctx: {
    teams: readonly Team[]
    players: readonly Player[]
    /** 自チームは競争相手に数えない（自分と競っても意味がない） */
    playerTeamId: string
    foreignLeagues: readonly ForeignLeague[]
    destinationOf: (clubId: string, player: Player) => Destination
    /** その選手の今季の出場（utils/playRate の playRateOf で引いて渡すこと） */
    playFraction: number
    teamRaces: number
    /** 選手の格（utils/playerTier） */
    playerTier: ClubTier
  },
): RivalClub[] {
  const activeRosterByTeam = new Map<string, Player[]>()
  const rosterCount = new Map<string, number>()
  for (const p of ctx.players) {
    if (p.status === 'retired') continue
    rosterCount.set(p.teamId, (rosterCount.get(p.teamId) ?? 0) + 1)
    if (p.status !== 'active') continue
    const list = activeRosterByTeam.get(p.teamId)
    if (list) list.push(p); else activeRosterByTeam.set(p.teamId, [p])
  }
  // ★国内クラブと海外クラブを分けない。獲りにくる理由は同じ（必要か・走れるか・本人が行くか）で、
  //   海外クラブの資金も本物（finance.budget 1本）。国内だけを見ていたので、
  //   「◯クラブが動いています」が実際に動くクラブより少なく、海外は競りに参加していなかった
  const allClubs = allTieredClubs(ctx.teams as Team[], ctx.foreignLeagues as ForeignLeague[]) as unknown as readonly Team[]
  const srcTier = tierOfPlayerClub(target.teamId, allClubs)
  return allClubs
    .filter(t => t.id !== ctx.playerTeamId && t.id !== target.teamId && (rosterCount.get(t.id) ?? 0) < ROSTER_MAX)
    .filter(t => needsPlayer(activeRosterByTeam.get(t.id) ?? [], target))
    .map(t => ({ t, dest: ctx.destinationOf(t.id, target) }))
    .filter(x => x.dest.squadRank <= RUNNING_SLOTS)
    .filter(x => appraiseMove(target, x.dest, { srcTier, playFraction: ctx.playFraction, teamRaces: ctx.teamRaces,
      playerTier: ctx.playerTier }).ok)
    .map(x => ({
      clubId: x.t.id,
      name: x.t.shortName,
      willing: transferCapOf(x.t.finance?.budget ?? 0),
    }))
    .filter(r => r.willing > 0)
}
