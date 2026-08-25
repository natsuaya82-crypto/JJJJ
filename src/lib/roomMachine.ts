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

/**
 * 全区間そろっているか。**「埋まっているか」だけでなく「その選手が本当に居るか」も見る。**
 *
 * ★以前は `!!o.lineup[s.index]` だけを見ていたので、**もう名簿に居ない選手のIDが
 *   入った札**（提出後に相手がその選手を放出・引退させた／相手のロスターが読めていない）が
 *   「完成している」と判断され、おまかせ補完を素通りしていました。そのまま
 *   `matchSim` の `buildRacePayload` まで届き、あちらは走者が引けない区間を
 *   `if (!p) continue` で**黙って飛ばす**ので、
 *     ・その区間の走者の名前が出ない
 *     ・その区間ぶんのタイムが総合に足されず、**総合タイムが15〜25分短く出る**
 *   になっていました（オーナー・2026-08-23「名前でなかったりたまに20分差になったり」）。
 */
export function isOrderComplete(
  o: Order | undefined, course: MatchCourse, roster: readonly Player[],
): boolean {
  if (!o?.lineup) return false
  const alive = new Set(usableRoster([...roster]).map(p => p.id))
  return course.segments.every(s => {
    const pid = o.lineup[s.index]
    return !!pid && alive.has(pid)
  })
}

/**
 * 欠けている区間・居ない選手の区間だけを、おまかせで埋め直す。
 * **出した本人の選択は残す**（丸ごと差し替えると、1区間だけ古かった人の編成が全部消える）。
 */
function repairLineup(
  lineup: Record<number, string> | undefined, course: MatchCourse,
  roster: readonly Player[], raceNo: number,
): Record<number, string> {
  // そのまま使えるならそのまま（判定は isOrderComplete 1本。ここで条件を書き直さない）
  if (lineup && isOrderComplete({ lineup }, course, roster)) return { ...lineup }
  const alive = new Set(usableRoster([...roster]).map(p => p.id))
  const out: Record<number, string> = {}
  const used = new Set<string>()
  for (const s of course.segments) {
    const pid = lineup?.[s.index]
    // 同じ選手を2区間に置かない（古い札には重複が入っていることがある）
    if (pid && alive.has(pid) && !used.has(pid)) { out[s.index] = pid; used.add(pid) }
  }
  const holes = course.segments.filter(s => !out[s.index])
  if (holes.length === 0) return out
  // 残っている選手だけでおまかせを組み、空いている区間ぶんだけ貰う
  const rest = roster.filter(p => !used.has(p.id))
  const auto = autoOrder(rest, course, raceNo).lineup
  for (const s of holes) {
    const pid = auto[s.index]
    if (pid && !used.has(pid)) { out[s.index] = pid; used.add(pid) }
  }
  // ★**最後に必ず埋め切ること。** おまかせは残った人数ぶんしか置かないので、
  //   1区間だけ差し替えたようなときに**その区間が空のまま残る**（実際に残った）。
  //   空区間を先へ渡すとタイムが1区間ぶん足りなくなるので、余っている人から順に入れる。
  const spare = usableRoster([...roster]).filter(p => !used.has(p.id))
  for (const s of course.segments) {
    if (out[s.index]) continue
    const p = spare.shift()
    if (!p) break            // 人が足りない（走者0）。ここは埋めようがない
    out[s.index] = p.id; used.add(p.id)
  }
  return out
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
    const roster = rosters[id] ?? []
    // ★**必ず全区間そろった形にして返すこと。** 空区間のまま先へ渡すと、
    //   `matchSim` が黙って飛ばして総合タイムが1区間ぶん短くなります（上の isOrderComplete）。
    orders[id] = repairLineup(got?.lineup, course, roster, raceNo)
    // ★**何も出さなかった人だけ**が不戦敗。中身が欠けているのは「出す意思はあった」扱い
    if (!got) forfeits.push(id)
  }
  return { orders, forfeits }
}
