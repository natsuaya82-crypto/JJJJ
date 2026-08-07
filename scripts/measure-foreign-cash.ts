/**
 * 海外クラブに「本物の予算」を持たせたとき、資金が回るかどうかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-foreign-cash.ts --outfile=/tmp/mfc.cjs && node /tmp/mfc.cjs
 *
 * 海外クラブの資金は、いままで置き場所が無いので処理のたびに tierBudget へ戻っていた。
 * 国内CPUと同じ computeNextSeasonBudget を通すには、
 *   収入 = 格の年間予算    支出 = 総年俸 + 運営費(1割) + 施設維持費
 * が釣り合っている必要がある。国内は釣り合っていたが、海外はロスターの作り方が
 * 違う（格からランク構成 → 相場年俸）ので、そのままでは全180クラブが赤字になりうる。
 * 実際に生成して数える。
 */
import { generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import { facilityUpkeepOf } from '../src/utils/facilities'
import { operatingCostOf, computeNextSeasonBudget } from '../src/data/economy'
import { allForeignClubs } from '../src/utils/clubs'
import type { ForeignClub, Player } from '../src/types'

const YEAR = 2030
const { players, updatedLeagues } = generateForeignLeaguePlayers(FOREIGN_LEAGUES as never, YEAR) as unknown as
  { players: Player[]; updatedLeagues: typeof FOREIGN_LEAGUES }

const clubs = allForeignClubs(updatedLeagues as never) as ForeignClub[]
const salaryByClub = new Map<string, number>()
const sizeByClub = new Map<string, number>()
for (const p of players) {
  salaryByClub.set(p.teamId, (salaryByClub.get(p.teamId) ?? 0) + p.contract.annualSalary)
  sizeByClub.set(p.teamId, (sizeByClub.get(p.teamId) ?? 0) + 1)
}

const oku = (n: number) => (n / 1e8).toFixed(2)

console.log(`海外クラブ ${clubs.length}件 / 選手 ${players.length}人`)
console.log('')
console.log('格ごとの収支（1年目：残高＝年間予算からスタート）')
console.log('  格  クラブ   予算    総年俸   運営費  維持費   収支')

const byTier = new Map<number, ForeignClub[]>()
for (const c of clubs) {
  const t = tierOf(c)
  if (!byTier.has(t)) byTier.set(t, [])
  byTier.get(t)!.push(c)
}
let redFirstYear = 0
for (const t of [...byTier.keys()].sort((a, b) => a - b)) {
  const cs = byTier.get(t)!
  const avg = (f: (c: ForeignClub) => number) => cs.reduce((s, c) => s + f(c), 0) / cs.length
  const budget = avg(c => tierBudget(c))
  const sal = avg(c => salaryByClub.get(c.id) ?? 0)
  const op = avg(c => operatingCostOf(salaryByClub.get(c.id) ?? 0))
  const up = avg(c => facilityUpkeepOf(c))
  const bal = budget - sal - op - up
  for (const c of cs) {
    const s = salaryByClub.get(c.id) ?? 0
    if (tierBudget(c) - s - operatingCostOf(s) - facilityUpkeepOf(c) < 0) redFirstYear++
  }
  console.log(`  ${String(t).padStart(2)}  ${String(cs.length).padStart(3)}件  ${oku(budget).padStart(6)}億 ${oku(sal).padStart(6)}億 ${oku(op).padStart(6)}億 ${oku(up).padStart(5)}億 ${bal < 0 ? '' : '+'}${oku(bal).padStart(6)}億`)
}
console.log('')
console.log(`1年目に赤字になるクラブ: ${redFirstYear} / ${clubs.length}`)

// 10年回してどこへ落ち着くか（移籍でお金が動かない前提＝上限がどこかだけを見る）
console.log('')
console.log('10シーズン回したときの残高（総年俸は据え置き）')
const balance = new Map<string, number>(clubs.map(c => [c.id, tierBudget(c)]))
for (let y = 1; y <= 10; y++) {
  for (const c of clubs) {
    const sal = salaryByClub.get(c.id) ?? 0
    balance.set(c.id, computeNextSeasonBudget({
      baseGrant: tierBudget(c),
      prevBalance: balance.get(c.id)!,
      sponsorAnnual: 0,
      raceIncome: 0,
      objBudgetBonus: 0,
      bonusPayout: 0,
      salaryTotal: sal,
      facilityUpkeep: facilityUpkeepOf(c),
    }))
  }
  if (y === 1 || y === 3 || y === 5 || y === 10) {
    const vals = [...balance.values()].sort((a, b) => a - b)
    const ratio = clubs.map(c => balance.get(c.id)! / tierBudget(c)).sort((a, b) => a - b)
    const red = vals.filter(v => v < 0).length
    console.log(`  ${String(y).padStart(2)}年目  中央値 ${oku(vals[Math.floor(vals.length / 2)])}億  最小 ${oku(vals[0])}億  最大 ${oku(vals[vals.length - 1])}億  予算比 中央値${ratio[Math.floor(ratio.length / 2)].toFixed(2)}倍  赤字${red}件`)
  }
}
