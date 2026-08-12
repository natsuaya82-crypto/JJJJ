// オンライン対戦の「進めてよいか」「誰をどう埋めるか」の判断。
//
// ■なぜ画面から出したのか
//   `Order` / `autoOrder` / `isOrderComplete` は **画面（`components/online/PickPanel.tsx`）**
//   の中にあり、`RoomLobbyPage` がそこから import していました。画面が画面から判断を借りる形で、
//   どの点検からも見えていません（ゴールデン検査は store のアクションを叩くので届かない）。
//
// ■同じことを2か所で見ていた
//   「出そろったか」と「誰を埋めるか・誰が不戦敗か」が別々に書かれていました。
//
//     出そろったか … `activeIds.every(id => entries[id])`     ← **中身は見ていない**
//     埋める・不戦 … `isOrderComplete(entries[id], course)`   ← **中身を見る**
//
//   いまは矛盾していませんが、片方だけ直すと「出そろったのに進まない」か
//   「出していない人がいるのに進む」が起きます。**同じ関数の中に置いて、ズレようがなくします。**
//
// ■不戦敗の線（変えていません）
//   ・**何も出さなかった** … おまかせで埋めて、**不戦敗にする**
//   ・**出したが区間が欠けている** … おまかせで埋めるが、**不戦敗にはしない**
//   出す意思はあった、という扱いです。この2つを混ぜないこと。
//
// ■ここに通信を持ち込まないこと
//   このファイルは**入力から答えを出すだけ**です。Supabase も React も import しません
//   （そうでないと点検から呼べなくなり、また画面の中と同じ状態に戻ります）。
import { assignLineupByTerrain } from '../engine/raceEngine'
import { courseToRace, type MatchCourse } from '../data/matchCourses'
import type { Player } from '../types'

/** 1レースぶんの提出内容（区間番号 → 選手ID） */
export type Order = { lineup: Record<number, string> }

/**
 * 出走できる選手だけに絞る。本編のレース準備と同じ考え方。
 * 引退だけ除外し、所属選手は全員出走できる。
 */
export function usableRoster(roster: Player[]): Player[] {
  return roster.filter(p => p.status !== 'retired')
}

/**
 * おまかせ編成。未提出・回線落ちの人はこれで埋める。
 * **負傷者は人数が足りているときだけ外す**（足りなければ負傷者も走らせる。走者0では成立しないため）。
 */
export function autoOrder(roster: Player[], course: MatchCourse, raceNo = 1): Order {
  const segCount = course.segments.length
  const list = usableRoster(roster)
  const healthy = list.filter(p => p.status !== 'injured')
  const pool = healthy.length >= segCount ? healthy : list
  return { lineup: assignLineupByTerrain(pool, courseToRace(course, raceNo)) }
}

/** 全区間そろっているか */
export function isOrderComplete(o: Order | undefined, course: MatchCourse): boolean {
  if (!o?.lineup) return false
  return course.segments.every(s => !!o.lineup[s.index])
}

/**
 * **全員が出したか**（ホストが「もう進めてよい」と判断する条件）。
 *
 * ★見るのは「出したかどうか」だけで、中身が揃っているかは見ません。
 *   欠けたぶんは下の `resolveOrders` がおまかせで埋めます。ここで中身まで求めると、
 *   1区だけ選んで固まった人がいるだけで時間切れまで全員が待たされます。
 */
export function allSubmitted(activeIds: readonly string[], entries: Record<string, Order | undefined>): boolean {
  return activeIds.every(id => !!entries[id])
}

/**
 * 各人のオーダーを確定させ、**不戦敗になる人**を返す。
 * ホストが結果を計算する直前に1回だけ呼びます。
 *
 * ★`activeIds` の順に見ます。おまかせは乱数を引かない（`assignLineupByTerrain` は決定的）ので
 *   順番で結果は変わりませんが、`forfeits` の並びは入力順になります。
 */
export function resolveOrders(args: {
  activeIds: readonly string[]
  entries: Record<string, Order | undefined>
  course: MatchCourse
  rosters: Record<string, Player[]>
  /** おまかせに渡す通し番号（1始まり） */
  raceNo: number
}): { orders: Record<string, Record<number, string>>; forfeits: string[] } {
  const { activeIds, entries, course, rosters, raceNo } = args
  const orders: Record<string, Record<number, string>> = {}
  const forfeits: string[] = []
  for (const id of activeIds) {
    const got = entries[id]
    if (isOrderComplete(got, course)) {
      orders[id] = got!.lineup
      continue
    }
    orders[id] = autoOrder(rosters[id] ?? [], course, raceNo).lineup
    // ★**何も出さなかった人だけ**が不戦敗。中身が欠けているのは「出す意思はあった」扱い
    if (!got) forfeits.push(id)
  }
  return { orders, forfeits }
}
