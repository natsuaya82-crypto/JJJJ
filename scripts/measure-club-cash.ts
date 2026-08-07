/**
 * クラブの資金に余裕がありすぎないかを測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-club-cash.ts --outfile=/tmp/mcc.cjs && node /tmp/mcc.cjs
 *
 * 収入 = 格の年間予算 + スポンサー + 区間賞 + 目標達成ボーナス
 * 支出 = 総年俸 + 運営費(年俸の1割) + 出来高ボーナス
 * （data/economy.ts の computeNextSeasonBudget）
 *
 * 見たいのは「1年でいくら余るか」。余りが年間予算に対して大きいと、
 * 毎年ためた資金で誰でも買えるようになり、格の差が効かなくなる。
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { tierOf, tierOfClubId, tierBudget, tierSponsorIncome, operatingCostOf, TIER_BUDGET } from '../src/utils/clubTier'
import { transferCapOf } from '../src/data/economy'
import { belongsToClub } from '../src/utils/rosterSync'
import { divisionOf } from '../src/utils/league'
import type { Player, Team } from '../src/types'

const YEAR = 2028
const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign, updatedLeagues } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)

const oku = (n: number) => (n / 1e8).toFixed(2)
const salaryOf = (roster: Player[]) => roster.reduce((s, p) => s + (p.contract?.annualSalary ?? 0), 0)

type Row = { name: string; tier: number; budget: number; salary: number; sponsor: number; surplus: number; cap: number }
const rows: Row[] = []

for (const t of teams) {
  const tier = tierOf(t)
  const budget = tierBudget(t)
  const salary = salaryOf(domestic.filter(p => p.teamId === t.id))
  const sponsor = tierSponsorIncome(tier)
  // スポンサーは3枠すべて埋めた場合の上限。埋まっていない年もあるので上振れ側の見積り
  const surplus = budget + sponsor - salary - operatingCostOf(salary)
  rows.push({ name: t.shortName, tier, budget, salary, sponsor, surplus, cap: transferCapOf(budget) })
}
for (const l of updatedLeagues) {
  for (const c of l.clubs) {
    const tier = tierOfClubId(c.id)
    const budget = TIER_BUDGET[tier]
    const salary = salaryOf(foreign.filter(p => belongsToClub(p, c.id)))
    const sponsor = tierSponsorIncome(tier)
    const surplus = budget + sponsor - salary - operatingCostOf(salary)
    rows.push({ name: c.shortName, tier, budget, salary, sponsor, surplus, cap: transferCapOf(budget) })
  }
}

console.log(`クラブ ${rows.length}（国内${teams.length} / 海外${rows.length - teams.length}）`)
console.log('')
console.log('■ 格ごとの1年の収支（スポンサー3枠を全部埋めた場合＝上振れ側）')
console.log('  格  クラブ数  年間予算   スポンサー  総年俸    運営費   1年の余り   移籍上限')
const byTier = new Map<number, Row[]>()
for (const r of rows) (byTier.get(r.tier) ?? byTier.set(r.tier, []).get(r.tier)!).push(r)
for (const tier of [...byTier.keys()].sort((a, b) => a - b)) {
  const rs = byTier.get(tier)!
  const avg = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length
  console.log(
    `  ${String(tier).padStart(2)}  ${String(rs.length).padStart(6)}  `
    + `${oku(avg(r => r.budget)).padStart(7)}億  ${oku(avg(r => r.sponsor)).padStart(7)}億  `
    + `${oku(avg(r => r.salary)).padStart(7)}億  ${oku(avg(r => operatingCostOf(r.salary))).padStart(6)}億  `
    + `${oku(avg(r => r.surplus)).padStart(8)}億  ${oku(avg(r => r.cap)).padStart(6)}億`,
  )
}

console.log('')
console.log('■ 1年の余り ÷ 年間予算（1.0 なら予算をまるごと残せる）')
const ratios = rows.map(r => r.surplus / r.budget).sort((a, b) => a - b)
const q = (p: number) => ratios[Math.floor(ratios.length * p)]
console.log(`  最小 ${q(0).toFixed(2)} / 下位25% ${q(0.25).toFixed(2)} / 中央 ${q(0.5).toFixed(2)} / 上位25% ${q(0.75).toFixed(2)} / 最大 ${q(0.999).toFixed(2)}`)
console.log(`  赤字になるクラブ ${rows.filter(r => r.surplus < 0).length} / ${rows.length}`)

console.log('')
console.log('■ 何年ためれば「移籍金の上限（年間予算の20%）」に届くか')
const years = rows.map(r => (r.surplus > 0 ? r.cap / r.surplus : Infinity)).sort((a, b) => a - b)
const qy = (p: number) => years[Math.floor(years.length * p)]
console.log(`  中央 ${qy(0.5).toFixed(2)}年 / 上位25% ${qy(0.25).toFixed(2)}年`)
console.log('  （1年未満なら「毎年、上限いっぱいまで積める」ということ）')

console.log('')
console.log('■ 国内の部ごと')
for (const d of [1, 2, 3]) {
  const rs = teams.filter(t => divisionOf(t) === d).map(t => rows.find(r => r.name === t.shortName)!).filter(Boolean)
  const avg = (f: (r: Row) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length
  console.log(`  ${d}部  ${rs.length}クラブ  予算${oku(avg(r => r.budget))}億  年俸${oku(avg(r => r.salary))}億  余り${oku(avg(r => r.surplus))}億`)
}

console.log('')
console.log('■ 年俸が年間予算の何割か（低いほど余る）')
const share = rows.map(r => r.salary / r.budget).sort((a, b) => a - b)
const qs = (p: number) => share[Math.floor(share.length * p)]
console.log(`  最小 ${(qs(0) * 100).toFixed(0)}% / 中央 ${(qs(0.5) * 100).toFixed(0)}% / 最大 ${(qs(0.999) * 100).toFixed(0)}%`)
