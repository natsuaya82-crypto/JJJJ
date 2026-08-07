import type { HofPlayer, Player } from '../types'
import { ovr } from './playerUtils'
// 所属の判定は rosterSync 1本（レンタル中の選手を除くのも向こうの決まり）
import { isSquadMember } from './rosterSync'

// 殿堂入りチームの決まりを1本にまとめる場所。
//
// ■ 何をするものか
//   「登録」を押した瞬間の選手を丸ごと凍らせて貯めていく。最大30人。
//   本人がそのあと衰えても・引退しても・他クラブへ移っても、ここは変わらない。
//   監督が別のクラブへ移っても持ち越すので、**いろんな年代・いろんなクラブの選手が
//   1つのチームに並ぶ**（2030年の福岡のエースと2055年の札幌のエースが同じ区間を走る）。
//
// ■ 上書き
//   同じ選手をもう一度登録すると、そのときの数値で置き換わる。
//   「全盛期で入れておいたが、やっぱり今の姿で残したい」ができる。

/** 殿堂入りチームの人数上限 */
export const HOF_MAX = 30

/**
 * 殿堂入りに登録していい選手か。**自分のクラブの選手だけ。**
 *
 * レンタルで借りている選手は teamId が自クラブになるので、「自チームの選手か」を
 * `p.teamId === myTeamId` で見ていると登録できてしまっていた。借り物を自分の歴史に
 * 加えることになるので除く。判定は所属の唯一の決まり（rosterSync の isSquadMember）に任せる。
 */
export function isHofEligible(p: Player | undefined, myTeamId: string): boolean {
  return !!p && isSquadMember(p, myTeamId)
}

/** その選手はもう殿堂入りしているか（IDで見る） */
export function isInHof(hof: readonly HofPlayer[] | undefined, playerId: string): boolean {
  return (hof ?? []).some(h => h.player.id === playerId)
}

/** 登録できるか。満員でも「入れ替え（上書き）」ならできる */
export function canRegisterHof(hof: readonly HofPlayer[] | undefined, playerId: string): boolean {
  const list = hof ?? []
  return isInHof(list, playerId) || list.length < HOF_MAX
}

/**
 * 登録する（既にいれば上書き）。元の配列は変えない。
 * 凍らせるのは丸ごとのコピーなので、あとで本人の ratings が変わっても影響しない。
 */
export function registerHof(
  hof: readonly HofPlayer[] | undefined, player: Player, year: number, teamName: string,
): HofPlayer[] {
  const list = [...(hof ?? [])]
  // 構造化コピー。参照を残すと、あとで本人が成長したときに殿堂入りの数値まで動く
  const frozen: HofPlayer = {
    player: JSON.parse(JSON.stringify(player)) as Player,
    year,
    teamName,
    ovr: ovr(player),
  }
  const at = list.findIndex(h => h.player.id === player.id)
  if (at >= 0) { list[at] = frozen; return list }
  if (list.length >= HOF_MAX) return list   // 満員。呼ぶ側が canRegisterHof で弾く
  list.push(frozen)
  return list
}

/** 外す */
export function removeHof(hof: readonly HofPlayer[] | undefined, playerId: string): HofPlayer[] {
  return (hof ?? []).filter(h => h.player.id !== playerId)
}
