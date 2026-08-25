/**
 * 【オンライン対戦の進行判断】`lib/roomMachine.ts` を釘で留める。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-room-machine.ts \
 *     --outfile=node_modules/.cache/check-rm.cjs --log-level=error && node node_modules/.cache/check-rm.cjs
 *
 * ■なぜ要るのか
 *   `Order` / `autoOrder` / `isOrderComplete` は **画面（`components/online/PickPanel.tsx`）**
 *   の中にあり、`RoomLobbyPage` がそこから import していました。画面が画面から判断を借りる形で、
 *   どの点検からも見えていません（ゴールデン検査は store のアクションを叩くので届かない）。
 *
 *   しかも同じことを2か所で見ていました。
 *
 *     出そろったか … `activeIds.every(id => entries[id])`     ← **中身は見ていない**
 *     埋める・不戦 … `isOrderComplete(entries[id], course)`   ← **中身を見る**
 *
 *   矛盾はしていませんでしたが、片方だけ直すと「出そろったのに進まない」か
 *   「出していない人がいるのに進む」が起きます。[5] でその整合も見ます。
 *
 * ■不戦敗の線（実装と同じ。ここを変えるのは仕様変更）
 *   ・**何も出さなかった** … おまかせで埋めて、**不戦敗にする**
 *   ・**出したが区間が欠けている** … おまかせで埋めるが、**不戦敗にはしない**
 */
import { readFileSync } from 'node:fs'
import { MATCH_COURSES } from '../src/data/matchCourses'
import { allSubmitted, autoOrder, isOrderComplete, resolveOrders, usableRoster, type Order } from '../src/lib/roomMachine'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const course = MATCH_COURSES[0]
const SEGS = course.segments.map(s => s.index)

const P = (id: string, status: Player['status'] = 'active'): Player => ({
  id, name: id, teamId: 'me', age: 24, status, specialty: 'long',
  nationality: 'JPN', joinedYear: 2030, growthCurve: 'normal',
  contract: { annualSalary: 5_000_000, yearsLeft: 2 },
  career: { totalRaces: 10, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ratings: Object.fromEntries(['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    .map(k => [k, 60])),
  potential: 75,
} as unknown as Player)

const roster = (n: number, extra: Player[] = []) =>
  [...Array.from({ length: n }, (_, i) => P(`p${i}`)), ...extra]

const full = (): Order => ({ lineup: Object.fromEntries(SEGS.map((s, i) => [s, `p${i}`])) })
const partial = (): Order => ({ lineup: { [SEGS[0]]: 'p0' } })

console.log(`コース ${course.name} / ${SEGS.length}区間`)
console.log('')

console.log('[1] 「出そろったか」は出したかどうかだけを見る')
{
  const ids = ['a', 'b']
  check('全員が出していれば true', allSubmitted(ids, { a: full(), b: full() }))
  check('1人でも出していなければ false', !allSubmitted(ids, { a: full() }))
  // ★中身が欠けていても「出した」扱い。ここで中身まで求めると、1区だけ選んで固まった人が
  //   いるだけで時間切れまで全員が待たされる
  check('中身が欠けていても「出した」扱い', allSubmitted(ids, { a: full(), b: partial() }))
  check('参加していない人の提出は関係ない', !allSubmitted(ids, { a: full(), z: full() }))
}

console.log('')
console.log('[2] 誰をどう埋めるか・誰が不戦敗か')
{
  const ids = ['a', 'b', 'c']
  const r = resolveOrders({
    activeIds: ids,
    entries: { a: full(), b: partial() },   // c は未提出
    course, rosters: { a: roster(12), b: roster(12), c: roster(12) }, raceNo: 1,
  })
  check('そろっている人はそのまま', JSON.stringify(r.orders.a) === JSON.stringify(full().lineup))
  check('欠けている人はおまかせで埋まる', SEGS.every(s => !!r.orders.b[s]))
  check('出していない人もおまかせで埋まる', SEGS.every(s => !!r.orders.c[s]))
  // ★不戦敗になるのは「何も出さなかった人」だけ
  check('不戦敗は未提出の1人だけ', r.forfeits.length === 1 && r.forfeits[0] === 'c', r.forfeits.join(','))
  check('欠けていた人は不戦敗にしない', !r.forfeits.includes('b'), r.forfeits.join(','))

  // 名簿が空でも落ちない（回線落ちで相手のロスターが読めなかったとき）
  const empty = resolveOrders({ activeIds: ['x'], entries: {}, course, rosters: {}, raceNo: 1 })
  check('名簿が無くても例外にならない', empty.forfeits.includes('x'))
}

console.log('')
console.log('[3] おまかせ編成')
{
  check('全区間が埋まる', SEGS.every(s => !!autoOrder(roster(12), course, 1).lineup[s]))
  const withRetired = roster(12, [P('gone', 'retired')])
  const used = Object.values(autoOrder(withRetired, course, 1).lineup)
  check('引退した選手は使わない', !used.includes('gone'))

  // ★負傷者は**人数が足りているときだけ**外す。足りなければ走らせる（走者0では成立しない）
  const injuredSpare = roster(SEGS.length, [P('hurt', 'injured')])
  check('人数が足りていれば負傷者を外す',
    !Object.values(autoOrder(injuredSpare, course, 1).lineup).includes('hurt'))
  const injuredNeeded = [...Array.from({ length: SEGS.length - 1 }, (_, i) => P(`q${i}`)), P('hurt', 'injured')]
  check('足りなければ負傷者も走る',
    Object.values(autoOrder(injuredNeeded, course, 1).lineup).includes('hurt'))

  check('出走できるのは引退以外（usableRoster）',
    usableRoster([P('a'), P('b', 'injured'), P('c', 'retired')]).map(p => p.id).join(',') === 'a,b')
}

console.log('')
console.log('[4] そろっているかの判定（**その選手が本当に居るかまで見る**）')
{
  const R = roster(12)
  check('全区間あれば true', isOrderComplete(full(), course, R))
  check('1区間でも欠ければ false', !isOrderComplete(partial(), course, R))
  check('未提出は false', !isOrderComplete(undefined, course, R))

  // ★**居ない選手のIDが入った札**。提出後に相手がその選手を放出・引退させた、
  //   相手のロスターが読めていない、のどちらでも起きる。
  //   以前は「埋まっている」だけを見ていたので**完成扱いで素通り**し、
  //   matchSim が走者を引けずにその区間を飛ばして
  //   「名前が出ない」「総合タイムが15〜25分短い」になっていた
  //   （オーナー・2026-08-23）。
  const stale = { lineup: { ...full().lineup, [SEGS[0]]: 'gone-999' } }
  check('居ない選手が入っていたら false', !isOrderComplete(stale, course, R))
  const retired = [...R, P('zz', 'retired')]
  const withRetired = { lineup: { ...full().lineup, [SEGS[0]]: 'zz' } }
  check('引退した選手が入っていたら false', !isOrderComplete(withRetired, course, retired))

  // ★**直したあとは必ず全区間そろう**（空区間を先へ渡さない）
  const fixed = resolveOrders({
    activeIds: ['x'], entries: { x: stale }, course, rosters: { x: R }, raceNo: 1 })
  check('居ない選手の区間は埋め直される',
    course.segments.every(s => !!fixed.orders.x[s.index]),
    JSON.stringify(fixed.orders.x))
  check('埋め直しても本人の選んだ区間は残る',
    course.segments.slice(1).every(s => fixed.orders.x[s.index] === full().lineup[s.index]))
  check('同じ選手が2区間に入らない',
    new Set(Object.values(fixed.orders.x)).size === course.segments.length)
  check('出しているので不戦敗にはしない', fixed.forfeits.length === 0)
}

console.log('')
console.log('[5] 「進めてよい」と「不戦敗」が食い違わない')
{
  // ★ここが本題。allSubmitted が true になった世界で、不戦敗が出てはいけない
  //   （出していないのに進んだ、ということになる）
  const ids = ['a', 'b', 'c']
  const entries = { a: full(), b: partial(), c: full() }
  const go = allSubmitted(ids, entries)
  const r = resolveOrders({ activeIds: ids, entries, course, rosters: { a: roster(12), b: roster(12), c: roster(12) }, raceNo: 1 })
  check('出そろって進んだのに不戦敗が出る、が起きない', !(go && r.forfeits.length > 0),
    `進める=${go} / 不戦敗=${r.forfeits.join(',') || 'なし'}`)
}

console.log('')
console.log('[6] 画面に写しを作り直していないか')
{
  const lobby = readFileSync('src/components/online/RoomLobbyPage.tsx', 'utf-8')
  const pick = readFileSync('src/components/online/PickPanel.tsx', 'utf-8')
  check('RoomLobbyPage は lib/roomMachine を通す', /from '\.\.\/\.\.\/lib\/roomMachine'/.test(lobby))
  check('PickPanel も lib/roomMachine を通す', /from '\.\.\/\.\.\/lib\/roomMachine'/.test(pick))
  check('画面に「出そろったか」の手書きが無い',
    !/activeIdsRef\.current\.every\(id => entriesRef\.current\[id\]\)/.test(lobby))
  check('画面に不戦敗の組み立てが無い', !/forfeits\.push\(/.test(lobby))
  check('画面に isOrderComplete の分岐が無い', !/isOrderComplete\(/.test(lobby))
  check('画面に autoOrder / isOrderComplete の定義が無い',
    !/export function autoOrder|export function isOrderComplete/.test(pick))
}

console.log('')
console.log(failed === 0 ? '\n✓ オンライン対戦の進行判断は lib/roomMachine 1本\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
