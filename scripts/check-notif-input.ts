/**
 * 【ホームとチャットの「用件の数」が落ちないこと】
 *
 * ■なにが起きたか（オーナー・2026-08-19。実機の v2.0.4）
 *     TypeError: undefined is not an object (evaluating 'o.includes')
 *
 *   ホームの「チャット」の数字（`chatUnseenCount`）とチャット画面（`chatTopicIds`）が、
 *   `collectNotifications` へ渡す入力を **`as never` で型ごと黙らせて**渡していました。
 *
 *       chatTopicIds({ currentSeason, players, teams, playerTeamId } as never)
 *
 *   `NotifInput` には他に5つ（`seenJoinIds` ほか）あるので、それらは undefined のまま
 *   中へ入ります。そのうち `seenJoinIds` は
 *
 *       .filter(x => !seenJoinIds.includes(x.key))
 *
 *   で使われますが、**その年に加入した選手が1人もいない間は `filter` の中身が一度も
 *   走らない**ので落ちません。移籍やドラフトで誰かが加入した瞬間に、ホームとチャットが
 *   丸ごと落ちます。型を黙らせたぶん、コンパイラも気づけませんでした。
 *
 * ■この点検の作り
 *   字面（`as never` が無いか）だけでなく、**実際にその年に加入した選手を1人置いて呼びます。**
 *   字面だけだと、別の書き方で型を黙らせたときに素通りします。
 */
import { chatTopicIds, chatUnseenCount, collectNotifications } from '../src/utils/notifItems'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const player = (id: string, joinedYear?: number) => ({
  id, name: id, teamId: 'me', status: 'active', age: 24, joinedYear,
  ratings: { speed: 70, stamina: 70, mountainUp: 70, mountainDown: 70, pacing: 70, mental: 70, recovery: 70 },
  career: { totalRaces: 0, segmentWins: 0 },
  contract: { yearsLeft: 3, annualSalary: 1000, faEligibleYear: YEAR + 3 },
  morale: 70, fatigue: 0, form: 0,
}) as never

const season = { year: YEAR, currentRaceIndex: 0, races: [], standings: {} } as never
const base = { currentSeason: season, teams: [{ id: 'me', name: 'me' }] as never, playerTeamId: 'me' }

// ★本番で落ちた形：その年に加入した選手が1人いる
const withJoiner = { ...base, players: [player('p1', YEAR), player('p2')] }
let threw: string | null = null
try { chatTopicIds(withJoiner) } catch (e) { threw = (e as Error).message }
check('その年に加入した選手がいてもチャットの用件を数えられる', threw === null, threw ?? '')

threw = null
try { chatUnseenCount(withJoiner, []) } catch (e) { threw = (e as Error).message }
check('ホームの「チャット」の数字も数えられる', threw === null, threw ?? '')

// ベル側（全部そろえて渡す道）も落ちないこと
threw = null
try {
  collectNotifications({
    ...withJoiner, seenJoinIds: [], seenInjuryIds: [],
    pendingGiftsCount: 0, clubGiftsCount: 0, friendRequestsCount: 0 })
} catch (e) { threw = (e as Error).message }
check('ベルの数え方も落ちない', threw === null, threw ?? '')

// 字面のほうも見る（型を黙らせて渡す道を作らない）
const files: string[] = []
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
}
walk('src/components')
const bad = files.filter(f => {
  const t = readFileSync(f, 'utf8')
  return /(chatTopicIds|chatUnseenCount|collectNotifications)\([^)]*as never/s.test(t)
})
check('通知の入力を `as never` で渡していない', bad.length === 0, bad.join(' '))

console.log(failed === 0 ? '✓ 通知の入力: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
