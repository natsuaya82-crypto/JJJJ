import type { CardStatKey, Player } from '../types'
import { STAT_CAP, STAT_CAP_MAX, statCapOf } from './playerUtils'

/**
 * **優勝トロフィーを注げるか、と、注げないときの理由。**
 *
 * ★**画面の「押せるか」と store の「受け付けるか」を同じ関数から出すこと。**
 *   別々に書くと、押せるのに何も起きない（または押せないのに store は通す）になる。
 *   入札の `bidGate` と同じ形。
 *
 * ■決まり（オーナー・2026-08-20）
 *   ・**自チームの選手だけ**（トロフィーは自チームを勝たせた対価）
 *   ・**99 に届いている能力だけ**。そこまではジュエルの上限解放の領分
 *     （「99以降って話してるよね？しかも優勝しないとトロフィーもらえないし」）
 *   ・天井は 110
 *   ・上がるのは**上限だけ**。値はカード合成で育てる（「あげた後もカード合成必要よ？」）
 */
export function trophyBlockReason(
  state: { trophies?: number; playerTeamId?: string },
  player: Player,
  stat: CardStatKey,
): string | null {
  if ((state.trophies ?? 0) <= 0) return '優勝トロフィーがありません'
  if (player.teamId !== state.playerTeamId) return '自チームの選手だけです'
  const cur = (player.ratings as Record<string, number> | undefined)?.[stat] ?? 0
  const cap = statCapOf(player, stat)
  if (cap >= STAT_CAP_MAX) return `上限に達しています（${STAT_CAP_MAX}）`
  if (cur < STAT_CAP) return `${STAT_CAP} まで育ててから使えます`
  return null
}

/** 注げるか（理由が要らないとき） */
export function canSpendTrophy(
  state: { trophies?: number; playerTeamId?: string },
  player: Player,
  stat: CardStatKey,
): boolean {
  return trophyBlockReason(state, player, stat) === null
}
