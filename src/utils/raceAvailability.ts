import type { Player } from '../types'

/**
 * **駅伝に出せない選手（故障）の判定。ここ1本。**
 *
 * ■決まりは1行
 *   **故障者は選べない。ただし健常者だけで区間が埋まらないときは解禁する。**
 *
 *   解禁が要るのは、全区間を埋められないと「開始」も「スキップ」も押せず
 *   **完全に詰む**ためです（`allSegsFilled` が永久に false）。
 *
 * ■★4か所に手書きされていて、2か所は解禁が無く詰んでいました（2026-09-15）
 *   | どこ | 解禁 |
 *   |---|---|
 *   | 本編の駅伝（`components/race/RacePage`） | あり |
 *   | オンライン対戦（`components/online/PickPanel` / `lib/roomMachine` の `autoOrder`） | あり |
 *   | **ECL**（`components/ecl/EclPage`） | **無し** |
 *   | **世界選手権**（`components/international/WorldTournamentPage`） | **無し** |
 *
 *   後ろの2つは故障者を無条件で閉じるので、健常者が区間数を下回ると
 *   その大会だけ二度と進められなくなります。本編には
 *   「【進行不可の安全弁2】…完全に詰むため」とコメントまであるのに、
 *   同じ詰みが別の画面に残っていました。
 *
 * ■使い方
 *   返すのは**出せない選手のID**だけです。画面に出す文言（「故障中」「復帰まで約3戦」）は
 *   呼ぶ側で作ってください——**判定は共通・見せ方は画面ごと**、という分け方です。
 *
 * @param roster   そのクラブの選手（引退は先に除いておくこと）
 * @param segCount そのレースの区間数
 */
export function injuryBlockedIds(roster: readonly Player[], segCount: number): Set<string> {
  const healthy = roster.reduce((n, p) => n + (p.status !== 'injured' ? 1 : 0), 0)
  // 健常者だけで埋まらないなら、誰も止めない（＝故障者も走らせる）
  if (healthy < segCount) return new Set()
  const out = new Set<string>()
  for (const p of roster) if (p.status === 'injured') out.add(p.id)
  return out
}

/**
 * おまかせ編成に渡す選手の並び。**故障者を外すかどうかは `injuryBlockedIds` と同じ決まり。**
 * （人数が足りなければ故障者も入れる。走者0では成立しないため）
 */
export function runnablePool(roster: readonly Player[], segCount: number): Player[] {
  const blocked = injuryBlockedIds(roster, segCount)
  return roster.filter(p => !blocked.has(p.id))
}
