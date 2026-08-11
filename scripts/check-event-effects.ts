/**
 * シーズン中のイベントの効き目（`engine/eventEffects.ts` の表）の網。
 *
 * ■なぜ golden とは別に要るのか
 *   `race-event`（golden）は世界を1つ作って57件を続けて流すので、
 *   **自チーム全体の士気が合計+108積まれて全員が100に張り付く**。
 *   その状態だと個々の効き目の違いが最終状態に出ない。実際、
 *   「本人を除いてチームメイトに+8」を「全員に+8」へ書き換えても golden は緑のままだった。
 *   ＝**壊しても落ちない網**。
 *
 *   ここでは **1通りにつき世界を1つ作り直して**、その1件で何が動いたかだけを見る。
 *   19種 × 3肢 × 対象の有無 ＝ 114通り。
 *
 * ■記録の形
 *   `scripts/fixtures/event-effects.json` に「何がどれだけ動いたか」を**そのまま**置く。
 *   ハッシュではなく読める形にしてあるのは、変えたときに差分をレビューできるようにするため。
 *   意図して効き目を変えたときだけ UPDATE_GOLDEN=1 で引き直す。
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'

let seed = 12345
const reset = () => { seed = 12345 }
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

import { EVENT_EFFECTS, applyEventChoice } from '../src/engine/eventEffects'
import type { GameEvent, GameEventType, Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const MY = 'my', YEAR = 2030
const FILE = 'scripts/fixtures/event-effects.json'

// 士気55・疲労50から始める。**上下限に張り付かせないため**
// （疲労を30から始めると「-40の肢」が0で止まって「-15の肢」との差が縮む）。
// `potential` を入れておくのも同じ理由で、無いと能力の頭打ちが NaN になって
// 「+1 と +2 の違い」が両方 NaN に潰れる
const P = (id: string, teamId: string): Player => ({
  id, name: id, teamId, age: 27, status: 'active', specialty: 'balanced', joinedYear: YEAR - 3,
  nationality: 'JPN',
  ratings: { speed: 70, stamina: 70, mountainUp: 70, mountainDown: 70, pacing: 70, mental: 70, recovery: 70 },
  contract: { annualSalary: 10_000_000, yearsLeft: 2 }, morale: 55, fatigue: 50, form: 0,
  potential: 85,
} as unknown as Player)

const freshWorld = () => ({
  // a＝イベントの対象、b＝同じチームのもう1人（「本人だけ」と「チーム全員」を見分ける）、
  // c＝よそのクラブ（巻き込まれないこと）
  players: [P('a', MY), P('b', MY), P('c', 'other')],
  teams: [{ id: MY, finance: { budget: 100_000_000 } }, { id: 'other', finance: { budget: 100_000_000 } }] as unknown as Team[],
  gmRep: 50,
})

const TYPES: GameEventType[] = [
  'player_fatigue', 'player_morale_low', 'player_form_up', 'player_wants_renewal',
  'young_breakout', 'sponsor_offer', 'media_interview', 'press_conference',
  'playing_time_demand', 'transfer_request', 'board_warning', 'player_milestone',
  'budget_boost', 'player_retirement', 'veteran_ambition', 'rival_provocation',
  'ai_poaching', 'team_chemistry', 'budget_crisis',
]

/** その1件で動いたものだけを、読める形で書き出す */
function observe(type: GameEventType, choiceIndex: number, withPid: boolean): string {
  reset()
  const w0 = freshWorld()
  const ev: GameEvent = {
    id: 'e1', raceIndex: 1, type, playerId: withPid ? 'a' : undefined,
    title: 't', body: 'b', resolved: false,
    choices: [{ label: 'x', desc: '' }, { label: 'y', desc: '' }, { label: 'z', desc: '' }] }
  const season = { year: YEAR, currentRaceIndex: 3, events: [ev] } as unknown as Season
  const w = applyEventChoice({ players: w0.players, teams: w0.teams, gmRep: w0.gmRep, season }, ev, choiceIndex, MY)

  const parts: string[] = []
  for (const id of ['a', 'b', 'c']) {
    const before = w0.players.find(p => p.id === id)!
    const after = w.players.find(p => p.id === id)!
    const d: string[] = []
    const dm = (after.morale ?? 0) - (before.morale ?? 0)
    if (dm !== 0) d.push(`士気${dm > 0 ? '+' : ''}${dm}`)
    if ((after.fatigue ?? 0) !== (before.fatigue ?? 0)) d.push(`疲労${(after.fatigue ?? 0) - (before.fatigue ?? 0) > 0 ? '+' : ''}${(after.fatigue ?? 0) - (before.fatigue ?? 0)}`)
    if ((after.form ?? 0) !== (before.form ?? 0)) d.push(`調子${(after.form ?? 0) - (before.form ?? 0) > 0 ? '+' : ''}${(after.form ?? 0) - (before.form ?? 0)}`)
    if (after.missNextRace) d.push('次戦欠場')
    if (after.pendingRetirementYear) d.push(`引退予定${after.pendingRetirementYear}`)
    for (const k of Object.keys(before.ratings)) {
      const bv = (before.ratings as Record<string, number>)[k], av = (after.ratings as Record<string, number>)[k]
      if (av !== bv) d.push(`${k}${av - bv > 0 ? '+' : ''}${av - bv}`)
    }
    if (d.length > 0) parts.push(`${id}:${d.join(',')}`)
  }
  const bd = (w.teams.find(t => t.id === MY)!.finance.budget) - 100_000_000
  if (bd !== 0) parts.push(`資金${bd > 0 ? '+' : ''}${bd / 10_000}万`)
  if (w.gmRep !== 50) parts.push(`評判${w.gmRep - 50 > 0 ? '+' : ''}${w.gmRep - 50}`)
  const extra = (w.season.events ?? []).length - 1
  if (extra > 0) parts.push(`札+${extra}`)
  return parts.length > 0 ? parts.join(' / ') : '（何も起きない）'
}

console.log('[1] 19種 × 3肢 × 対象の有無 ＝ 114通りの効き目')
const observed: Record<string, string> = {}
for (const type of TYPES) {
  for (const c of [0, 1, 2]) {
    for (const withPid of [true, false]) {
      observed[`${type}/肢${c}/${withPid ? '対象あり' : '対象なし'}`] = observe(type, c, withPid)
    }
  }
}

if (process.env.UPDATE_GOLDEN === '1') {
  mkdirSync('scripts/fixtures', { recursive: true })
  writeFileSync(FILE, JSON.stringify(observed, null, 1))
  console.log(`  引き直した → ${FILE}（差分をレビューしてからコミット）`)
} else {
  let golden: Record<string, string> = {}
  try { golden = JSON.parse(readFileSync(FILE, 'utf8')) } catch {
    console.log(`✗ ${FILE} が無い。UPDATE_GOLDEN=1 で生成してコミットすること`)
    failed++
  }
  const keys = [...new Set([...Object.keys(golden), ...Object.keys(observed)])]
  const changed = keys.filter(k => golden[k] !== observed[k])
  check(`114通りの効き目が前回と同じ`, changed.length === 0,
    changed.slice(0, 6).map(k => `${k}: 前「${golden[k] ?? '(無し)'}」→ 今「${observed[k] ?? '(無し)'}」`).join(' ／ '))
}

console.log('')
console.log('[2] 表の決まりごと')
{
  // 対象の選手が要る種類は、対象が居なければ**何も起きない**
  const needPid = TYPES.filter(t => EVENT_EFFECTS[t]?.needsPlayer)
  const leaks = needPid.flatMap(t => [0, 1, 2]
    .filter(c => observed[`${t}/肢${c}/対象なし`] !== '（何も起きない）')
    .map(c => `${t}/肢${c}`))
  check(`対象が要る${needPid.length}種は、対象が居なければ何も起きない`, leaks.length === 0, leaks.join(','))

  // 逆に、対象が要らない種類は対象の有無で結果が変わらない
  const noPid = TYPES.filter(t => !EVENT_EFFECTS[t]?.needsPlayer)
  const odd = noPid.flatMap(t => [0, 1, 2]
    .filter(c => observed[`${t}/肢${c}/対象あり`] !== observed[`${t}/肢${c}/対象なし`])
    .map(c => `${t}/肢${c}`))
  check(`対象が要らない${noPid.length}種は、対象の有無で結果が変わらない`, odd.length === 0, odd.join(','))

  // 表に載っていない種類が無いこと（型に足したのに効き目を書き忘れる事故を止める）
  const missing = TYPES.filter(t => !EVENT_EFFECTS[t])
  check('19種すべてに効き目が定義されている', missing.length === 0, missing.join(','))

  // 「本人だけ」と「チーム全員」が混ざっていないこと。
  // b（同じチームのもう1人）が動くのは、チーム全体に効く肢だけ
  const squadWide = Object.entries(observed).filter(([, v]) => v.includes('b:')).length
  check('チーム全体に効く肢がある（本人だけの肢と区別できている）', squadWide > 0, `${squadWide}通り`)

  // よそのクラブの選手は絶対に巻き込まれない
  const outsiders = Object.entries(observed).filter(([, v]) => v.includes('c:')).map(([k]) => k)
  check('よそのクラブの選手は動かない', outsiders.length === 0, outsiders.join(','))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
