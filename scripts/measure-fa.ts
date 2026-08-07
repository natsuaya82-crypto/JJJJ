/**
 * 「良いFAが誰にも取られずに残る」が起きていないかを測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-fa.ts --outfile=/tmp/mfa.cjs && node /tmp/mfa.cjs
 *
 * 見たいこと：
 *   ・OVR75以上のFAが市場に残らないこと（移籍金がかからないので取らない理由がない）
 *   ・全員が一瞬で消える＝FA市場が無意味、にもなっていないこと
 *
 * gameStore の signOneFA と同じ条件を並べて、
 *   旧：needsPlayer だけ
 *   新：needsPlayer または wouldMakeLineup（スタメンに入る）
 * の2通りで、残るFAの数を比べる。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { needsPlayer, wouldMakeLineup } from '../src/utils/squadNeeds'
import { ROSTER_MAX, ROSTER_MIN } from '../src/data/rosterRules'
import { divisionOf, DIVISION_LABEL } from '../src/utils/league'
import type { Division, Player, Team } from '../src/types'

const FA_FREE_FILL = ROSTER_MIN + 9

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const all = generateCpuRosters(teams, 2027).cpuPlayers as Player[]

// ロスターを作り、そこから一部をFAに出す（契約満了で毎年出てくるぶんの想定）
let seed = 20270115
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

// 実際に起きているのは「ロスターが既に24人前後まで埋まっている状態で、良いFAが余る」。
// ロスターはそのまま（1クラブ25人）にして、FAは別に用意する。
const roster = new Map<string, Player[]>()
for (const t of teams) roster.set(t.id, [])
for (const p of all) {
  if (p.status !== 'active') continue
  roster.get(p.teamId)?.push(p)
}
// 契約満了・指名漏れで毎年出てくるFA（別に生成した選手から抜き出す）
const fas: Player[] = generateCpuRosters(teams, 2028).cpuPlayers
  .filter((p: Player) => p.status === 'active' && rnd() < 0.10)
  .map((p: Player) => ({ ...p, teamId: '' })) as Player[]

// 実際の門を全部入れる（gameStore の signOneFA と同じ材料）
import { faMarketSalary } from '../src/utils/playerUtils'
import { tierBudget } from '../src/utils/clubTier'

const ageAdjOvr = (p: Player) => ovr(p) - Math.max(0, p.age - 32) * 3
const estCost = (p: Player) => faMarketSalary(p, undefined)

/** どの門で落ちたかを数える */
const blocked = { age: 0, salary: 0, need: 0, slots: 0 }

function run(useLineup: boolean): { left: Player[]; signed: number } {
  const pool = [...fas].sort((a, b) => ovr(b) - ovr(a))
  const taken = new Set<string>()
  const spentBy = new Map<string, number>()
  const rs = new Map([...roster].map(([k, v]) => [k, [...v]]))
  // 1周に1人ずつ、取れるチームが無くなるまで
  let moved = true
  while (moved) {
    moved = false
    for (const t of teams) {
      const r = rs.get(t.id)!
      if (r.length >= ROSTER_MAX) continue
      const committed = r.reduce((s2, x) => s2 + (x.contract?.annualSalary ?? 0), 0)
      const spendable = Math.max(0, tierBudget(t) - committed) * 0.7
      const spent = spentBy.get(t.id) ?? 0
      const ageCap = 33
      const fa = pool.find(f => {
        if (taken.has(f.id)) return false
        if (f.age >= ageCap) { if (useLineup) blocked.age++; return false }
        if (r.length < FA_FREE_FILL) return true                    // 人数が足りない＝無条件
        if (spent + estCost(f) > spendable) { if (useLineup) blocked.salary++; return false }
        if (!(needsPlayer(r, f) || (useLineup && wouldMakeLineup(r, f)))) { if (useLineup) blocked.need++; return false }
        return true
      })
      if (fa) spentBy.set(t.id, spent + estCost(fa))
      if (!fa) continue
      taken.add(fa.id); r.push(fa); moved = true
    }
  }
  return { left: pool.filter(f => !taken.has(f.id)), signed: taken.size }
}

const before = run(false)
const after = run(true)

const band = (list: Player[], lo: number) => list.filter(p => ovr(p) >= lo).length
console.log(`FA総数 ${fas.length}人`)
console.log('')
console.log('残ったFA        旧(穴だけ)   新(穴＋スタメン入り)')
for (const lo of [85, 80, 77, 75, 70]) {
  console.log(`  OVR${lo}以上      ${String(band(before.left, lo)).padStart(4)}人      ${String(band(after.left, lo)).padStart(4)}人`)
}
console.log(`  合計          ${String(before.left.length).padStart(4)}人      ${String(after.left.length).padStart(4)}人`)
console.log('')
console.log(`契約したFA      ${String(before.signed).padStart(4)}人      ${String(after.signed).padStart(4)}人`)
console.log('')
console.log('どの門で落ちたか（新・のべ回数）', blocked)
console.log('')
console.log('残ったOVR75以上の顔ぶれ（新）')
for (const f of after.left.filter(x => ovr(x) >= 75).slice(0, 10)) {
  console.log(`  OVR${ovr(f)} ${f.age}歳 ${f.specialty} 想定年俸${Math.round(estCost(f)/10000)}万 (年齢調整${ageAdjOvr(f)})`)
}
console.log('')

// 部ごとの在籍人数（24で頭打ちになっていないか）
function sizes(useLineup: boolean) {
  const pool = [...fas].sort((a, b) => ovr(b) - ovr(a))
  const taken = new Set<string>()
  const rs = new Map([...roster].map(([k, v]) => [k, [...v]]))
  let moved = true
  while (moved) {
    moved = false
    for (const t of teams) {
      const r = rs.get(t.id)!
      if (r.length >= ROSTER_MAX) continue
      const fa = pool.find(f => !taken.has(f.id) && (r.length < FA_FREE_FILL || needsPlayer(r, f) || (useLineup && wouldMakeLineup(r, f))))
      if (!fa) continue
      taken.add(fa.id); r.push(fa); moved = true
    }
  }
  return rs
}
const sb = sizes(false), sa = sizes(true)
console.log('部ごとの平均在籍  旧      新')
for (const d of [1, 2, 3] as Division[]) {
  const ts = teams.filter(t => divisionOf(t) === d)
  const avg = (m: Map<string, Player[]>) => (ts.reduce((s, t) => s + m.get(t.id)!.length, 0) / ts.length).toFixed(1)
  console.log(`  ${DIVISION_LABEL[d]}            ${avg(sb)}    ${avg(sa)}`)
}
