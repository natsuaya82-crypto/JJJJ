/**
 * 海外クラブのお金が、国内クラブとまったく同じように「使えば減る／毎年精算される」かを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-foreign-money.ts --outfile=/tmp/cfm.cjs && node /tmp/cfm.cjs
 *
 * ■何が起きていたか
 *   海外クラブには資金の置き場所（finance）が無かった。そのため移籍の処理に入るたびに
 *   tierBudget(c) ＝ 格の年間予算に満タンで戻り、
 *     ・使っても減らない（同じオフに何人でも買える）
 *     ・繰越の上限（CARRYOVER_CAP_SHARE）が効かない
 *     ・総年俸も施設維持費も払わない
 *   という別のお金で動いていた。国内が節約して手が出せない場面で海外だけは必ず買えるので、
 *   日本の主力が一方的に抜けていく。
 *
 * ■確かめること
 *   1. 買えば減り、売れば増える（クロスボーダー移籍の前後で finance.budget が動く）
 *   2. 手元に無い額は出せない（残高より高い選手は買われない）
 *   3. 毎年の精算が国内CPUと同じ式（computeNextSeasonBudget）で、破産しない・貯め込まない
 */
import { simulateCrossBorderTransfers } from '../src/engine/foreignTransfers'
import { generateForeignLeaguePlayers, generateCpuRosters } from '../src/engine/playerGenerator'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { tierBudget } from '../src/utils/clubTier'
import { facilityUpkeepOf } from '../src/utils/facilities'
import { computeNextSeasonBudget, CARRYOVER_CAP_SHARE } from '../src/data/economy'
import { allForeignClubs } from '../src/utils/clubs'
import type { ForeignLeague, Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}
const oku = (n: number) => (n / 1e8).toFixed(2)

const YEAR = 2030
const gen = generateForeignLeaguePlayers(FOREIGN_LEAGUES as ForeignLeague[], YEAR)
// 国内52クラブの名簿も作る。**海外が日本から買う向き（dir=out）は
// 国内に選手が居ないと一度も起きない**ので、片側だけの盤面では試験にならない
const baseTeams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(baseTeams, YEAR)
const teams: Team[] = baseTeams.map(t => ({ ...t, roster: cpu.teamRosters[t.id] ?? { main: [] } }))
const allPlayers: Player[] = [...gen.players, ...cpu.cpuPlayers]

// 全クラブに「格の年間予算」を入れた状態から始める
const seeded: ForeignLeague[] = gen.updatedLeagues.map(l => ({
  ...l,
  clubs: l.clubs.map(c => ({ ...c, finance: { budget: tierBudget(c) } })),
}))
const budgetOf = (ls: ForeignLeague[]) =>
  new Map(allForeignClubs(ls).map(c => [c.id, c.finance?.budget ?? tierBudget(c)]))

console.log('[1] 買えば減り、売れば増える')
{
  // 買う側にも売る側にも回るまで何度か試す（1回のオフでは片方しか起きない年がある）
  const before = budgetOf(seeded)
  let moved = 0
  const down: [string, number][] = []
  const up: [string, number][] = []
  for (let i = 0; i < 40 && (down.length === 0 || up.length === 0); i++) {
    const r = simulateCrossBorderTransfers({
      teams, foreignLeagues: seeded, players: allPlayers, playerTeamId: teams[0].id, year: YEAR + 1,
    })
    if (r.records.length === 0) continue
    moved += r.records.length
    for (const [id, v] of budgetOf(r.foreignLeagues)) {
      if (v < before.get(id)! && down.length < 3) down.push([id, v])
      if (v > before.get(id)! && up.length < 3) up.push([id, v])
    }
  }
  console.log(`  移籍 ${moved}件`)
  check('移籍が起きている', moved > 0, `${moved}件`)
  for (const [id, v] of down) console.log(`    買った ${id}  ${oku(before.get(id)!)}億 → ${oku(v)}億`)
  for (const [id, v] of up) console.log(`    売った ${id}  ${oku(before.get(id)!)}億 → ${oku(v)}億`)
  check('買ったクラブは資金が減っている', down.length > 0,
    '減ったクラブが1件も無い＝払っても書き戻していない（＝使っても減らない）')
  check('売ったクラブは資金が増えている', up.length > 0,
    '増えたクラブが1件も無い＝移籍金を受け取っていない')
}

console.log('')
console.log('[2] 手元に無い額は出せない（残高を1000万まで削った盤面）')
{
  // 全海外クラブの残高を1000万にする。持っていない額は払えないので、
  // 「そのオフに売って得たぶん」を超えて買うクラブが1件でもあれば資金の縛りが効いていない。
  // （売ってから買うのは正しい。ger_1 が 3.2億で売ってから 1.8億で買う、はあり得る）
  const START = 10_000_000
  const broke: ForeignLeague[] = gen.updatedLeagues.map(l => ({
    ...l, clubs: l.clubs.map(c => ({ ...c, finance: { budget: START } })),
  }))
  const fSet = new Set(allForeignClubs(broke).map(c => c.id))
  let overspent = 0
  let negative = 0
  let bought = 0
  for (let i = 0; i < 20; i++) {
    const r = simulateCrossBorderTransfers({
      teams, foreignLeagues: broke, players: allPlayers, playerTeamId: teams[0].id, year: YEAR + 1,
    })
    const cash = new Map<string, number>(allForeignClubs(broke).map(c => [c.id, START]))
    for (const rec of r.records) {
      if (fSet.has(rec.fromTeamId)) cash.set(rec.fromTeamId, cash.get(rec.fromTeamId)! + (rec.fee ?? 0))   // 売った
      if (fSet.has(rec.toTeamId)) {
        cash.set(rec.toTeamId, cash.get(rec.toTeamId)! - (rec.fee ?? 0))                                   // 買った
        bought++
      }
    }
    overspent += [...cash.values()].filter(v => v < 0).length
    negative += allForeignClubs(r.foreignLeagues).filter(c => (c.finance?.budget ?? 0) < 0).length
  }
  console.log(`  20回で海外クラブが買ったのは ${bought}件`)
  check('売って得たぶんを超えて買うクラブが無い', overspent === 0, `${overspent}件が持ち出し超過`)
  check('残高がマイナスになるクラブが無い', negative === 0, `${negative}件`)
}

console.log('')
console.log('[3] 毎年の精算が国内CPUと同じ式で、破産も貯め込みもしない')
{
  const clubs = allForeignClubs(seeded)
  const salary = new Map<string, number>()
  for (const p of gen.players as Player[]) {
    salary.set(p.teamId, (salary.get(p.teamId) ?? 0) + p.contract.annualSalary)
  }
  const bal = new Map(clubs.map(c => [c.id, tierBudget(c)]))
  for (let y = 1; y <= 20; y++) {
    for (const c of clubs) {
      bal.set(c.id, computeNextSeasonBudget({
        baseGrant: tierBudget(c), prevBalance: bal.get(c.id)!,
        sponsorAnnual: 0, raceIncome: 0, objBudgetBonus: 0, bonusPayout: 0,
        salaryTotal: salary.get(c.id) ?? 0, facilityUpkeep: facilityUpkeepOf(c),
      }))
    }
  }
  const ratios = clubs.map(c => bal.get(c.id)! / tierBudget(c))
  const red = clubs.filter(c => bal.get(c.id)! < 0).length
  const max = Math.max(...ratios)
  console.log(`  20年後の残高／年間予算：最小 ${Math.min(...ratios).toFixed(2)}倍  最大 ${max.toFixed(2)}倍  赤字 ${red}件`)
  check('20年回しても赤字にならない', red === 0, `${red}件`)
  // 繰越の上限（予算の50%）が効いていれば、残高は「年間予算 + 上限」を超えられない
  check(`繰越の上限が効いている（${1 + CARRYOVER_CAP_SHARE}倍を超えない）`, max <= 1 + CARRYOVER_CAP_SHARE + 1e-9, `最大 ${max.toFixed(3)}倍`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 海外クラブのお金は国内と同じ。使えば減り、無ければ買えず、毎年同じ式で精算される')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
