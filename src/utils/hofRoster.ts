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

/**
 * 殿堂入りチームに登録できる人数の上限。**「参加に必要な人数」とは別の数**（下）。
 *
 * ★**この2つを1つの数で兼ねないこと。** 以前は「満員なら参加できる」という作りで、
 *   `canRegisterHof` が `< HOF_MAX`、`canJoin` が `>= HOF_MAX` と**同じ数の裏表**を
 *   見ていました。参加の門だけ下げるつもりで 30 → 15 にしたら、**殿堂入りに
 *   16人目を入れられなくなりました**（オーナー・2026-08-22）。門と器は別の話です。
 */
export const HOF_MAX = 30

/**
 * ランクマッチに参加するのに必要な殿堂入りの人数。**この数は2か所にあります**——
 * TS のここ（ボタンが押せるか）と `supabase/all.sql` の `rated_join`（サーバーが
 * 受けるか）。SQL は関数の中の即値で TS を import できないので、**片方だけ動かすと
 * 「押せるのに弾かれる」**になります（`check-rated-server` の①が突き合わせる）。
 *
 * ★**下限は `engine/ratedCourse` の `SEG_MAX`(15)**——ランクマッチのコースは日付から
 *   作られ**区間数が8〜15**で、同じ選手を2区間に置けないので、これを割ると
 *   **区間数の多い日に提出できません**（`allSegsFilled` が永久に false。その日が
 *   来るまで誰も気づけない）。`SEG_MAX` を増やすときは必ず一緒に増やすこと。
 * ★**30 から下げました**（オーナー・2026-08-21）。実際に遊んでいる人を見ると初期
 *   ロスターを殿堂入りに入れる人はいないので、30は事実上そろわない門でした。
 *   15人ぴったりでも編成は残ります（決まるのは「誰が出るか」だけで、**どの区間に
 *   誰を置くか**は残る）。
 */
export const HOF_ENTRY_MIN = 15

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
