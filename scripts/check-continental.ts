/**
 * 大陸予選を実レースにしたら、強い国がちゃんと通過するようになったかを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-continental.ts --outfile=/tmp/cc.cjs && node /tmp/cc.cjs
 *
 * 前（国力＋当日ブレ）は通過が実質くじ引きだった（scripts/measure-continental.ts）。
 *   国力の幅 2.5% に対して当日ブレ ±8%。ケニアの通過率45%、アメリカ大陸はジャマイカが1位。
 * いまはアジア予選と同じ3戦を実際に走る。代表20人の強さ（幅6.5点）で決まるはずなので、
 *   ・代表の強さ順と通過率の順がだいたい合う
 *   ・毎年まったく同じ顔ぶれにはならない（レースなので番狂わせは起きる）
 * の2つを見る。あわせてセーブに増えるぶんの重さも測る。
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import {
  startContinentalQualifiers, advanceContinentalQualifiers, finishContinentalQualifiers,
  runContinentalQualifiers, ekidenCandidates, autoSelectEkiden, REGION_QUOTA,
} from '../src/engine/worldAthletics'
import { worldRacePlans } from '../src/utils/worldCourses'
import { ovr } from '../src/utils/playerUtils'
import { NATIONALITY_META } from '../src/data/nationalities'
import type { Nationality, Player, Team } from '../src/types'

const YEAR = 2028
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...domestic, ...foreign]
const plans = worldRacePlans(YEAR)
const label = (n: Nationality) => NATIONALITY_META[n as keyof typeof NATIONALITY_META]?.label ?? n
const pad = (s: string) => s.padEnd(10, '　')

const problems: string[] = []

// ── 1回ぶんを開幕→3戦→決着まで回す（本編と同じ順番）──
let conts = startContinentalQualifiers(players, YEAR, plans)
for (let i = 0; i < plans.length; i++) conts = advanceContinentalQualifiers(conts, i, players)
conts = finishContinentalQualifiers(conts)

console.log(`コース: ${plans.map(p => p.courseName).join(' / ')}`)
console.log('')
for (const c of conts) {
  const slots = REGION_QUOTA.find(q => q.region === c.region)?.slots ?? 0
  console.log(`【${c.region}】${c.standings.length}か国 / 通過${slots}`)
  for (const r of c.standings) {
    console.log(`  ${String(r.rank).padStart(2)}. ${pad(label(r.nat))} ${String(r.points ?? 0).padStart(4)}pt${r.rank === slots ? '   ← ここまで通過' : ''}`)
  }
  // 3戦すべてに結果が入っているか
  const done = (c.races ?? []).filter(r => r.results).length
  if (done !== plans.length) problems.push(`${c.region}: 走ったレースが${done}戦しかない`)
  // 誰が走ったかが残っているか（これが無いと「アメリカ代表が誰だったか」が分からない）
  const runners = new Set((c.races ?? []).flatMap(r => r.results?.segmentResults.flatMap(s => s.runners.map(x => x.playerId)) ?? []))
  console.log(`     走った選手 ${runners.size}人 / 3戦`)
  if (runners.size === 0) problems.push(`${c.region}: 走者の記録が残っていない`)
  console.log('')
}

// ── 強さ順と通過率が合うか（30回）──
const TRIES = 30
const adv = new Map<Nationality, number>()
for (let i = 0; i < TRIES; i++) {
  for (const c of runContinentalQualifiers(players, YEAR, plans)) {
    for (const n of c.advanced) adv.set(n, (adv.get(n) ?? 0) + 1)
  }
}
console.log(`${TRIES}回まわしたときの通過率（代表20人の平均OVR順に並べる）`)
for (const { region, slots } of REGION_QUOTA) {
  if (region === 'アジア+オセアニア') continue
  const c = conts.find(x => x.region === region)!
  const rows = Object.keys(c.squads).map(natId => {
    const n = natId.slice(4) as Nationality
    // ★候補の絞り方は engine と必ず同じにすること（startContinentalQualifiers は limit 20）。
    //   既定の100人から選ぶと autoSelectEkiden の「持ちタイム＋適性」の混ぜ方が変わり、
    //   **並べ替えに使うOVRが、実際に走った代表と別の名簿から出る**。
    //   そのせいで「最強3か国19% ≦ 最弱3か国20%」のような逆転が出ていた（並びが嘘だった）
    const squad = autoSelectEkiden(ekidenCandidates(players, n, YEAR, 20), new Set<string>(), 20)
    return { n, avg: squad.reduce((s, p) => s + ovr(p), 0) / Math.max(1, squad.length), rate: (adv.get(n) ?? 0) / TRIES }
  }).sort((a, b) => b.avg - a.avg)
  console.log(`  【${region}】通過${slots}`)
  for (const [i, r] of rows.entries()) {
    console.log(`     ${String(i + 1).padStart(2)}. ${pad(label(r.n))} OVR${r.avg.toFixed(1)}  通過${(r.rate * 100).toFixed(0)}%`)
  }
  // 強さ上位（枠ぶん）の通過率が、下位半分より高いこと
  const top = rows.slice(0, slots).reduce((s, r) => s + r.rate, 0) / slots
  const bottom = rows.slice(Math.ceil(rows.length / 2))
  const bot = bottom.reduce((s, r) => s + r.rate, 0) / bottom.length
  console.log(`     上位${slots}か国の通過率 ${(top * 100).toFixed(0)}% / 下位半分 ${(bot * 100).toFixed(0)}%`)
  if (top <= bot) problems.push(`${region}: 強い国のほうが通りにくい（上位${(top * 100).toFixed(0)}% ≦ 下位${(bot * 100).toFixed(0)}%）`)
  if (rows.every(r => r.rate === 1 || r.rate === 0)) problems.push(`${region}: 毎回まったく同じ顔ぶれ（番狂わせが起きない）`)
}

// ── セーブに増えるぶん ──
const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length
console.log('')
console.log('予選年1回ぶんの重さ（大陸予選の走行記録）')
console.log(`  ${(bytes(conts.map(c => c.races)) / 1024).toFixed(0)} KB`)

console.log('')
if (problems.length === 0) {
  console.log('✓ 大陸予選が実レースで決まり、強い国ほど通りやすく、番狂わせも起きる')
  process.exit(0)
}
console.log(`✗ ${problems.length}件の問題`)
for (const p of problems) console.log(`  ${p}`)
process.exit(1)
