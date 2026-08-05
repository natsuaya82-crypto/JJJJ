// 新しい格の設定で「そのクラブの選手がどれくらい強くなるか」を試算する。
// ゲーム側のコードは変えず、生成の部品だけ借りて計算する（確認用）。
//
//   npx esbuild --bundle --platform=node --format=cjs scripts/sim-new-tiers.ts --outfile=/tmp/s.cjs && node /tmp/s.cjs
import { rankForSalary, buildRatingsForRank } from '../src/engine/playerGenerator'

// 年俸の配り方。指数を振って比べたいのでここに置く（本体は distributeSalaries）。
// 指数が大きいほど上に厚い。1.6=今の値で1位と25位が約100倍、1.0で約9倍。
function distribute(total: number, count: number, minSalary: number, exp: number): number[] {
  const w = Array.from({ length: count }, (_, i) => Math.pow(count - i, exp))
  const ws = w.reduce((s, x) => s + x, 0)
  const raw = w.map(x => total * x / ws)
  const fixed = raw.map(v => Math.max(minSalary, v))
  const over = fixed.reduce((s, v) => s + Math.max(0, v - minSalary), 0)
  const deficit = fixed.reduce((s, v) => s + v, 0) - total
  const shrink = over > 0 ? Math.max(0, 1 - deficit / over) : 1
  return fixed.map(v => Math.round((minSalary + Math.max(0, v - minSalary) * shrink) / 500_000) * 500_000)
}
import type { Rank, Specialty, GrowthCurve } from '../src/types'

// ── 決まっているもの ──
const ROSTER = 25                    // 国内・海外とも25人
const SALARY_MULT = 1.5              // 年俸1.5倍（SALARY_ANCHORS と rankForSalary の閾値）
const SALARY_SHARE = 0.8             // 予算のうち年俸に回す割合
const MIN_SALARY = 4_000_000   // 一番下は400万（1.5倍を掛けない）

// 格 → 年間予算（億）。格1〜10は指定の2倍、格11〜20は案A（前段比 約1.15）
const TIER_BUDGET_OKU: number[] = [
  24.0, 20.0, 16.0, 14.0, 12.0, 10.4, 9.0, 7.8, 6.8, 6.0,
  5.2, 4.5, 3.9, 3.4, 3.0, 2.6, 2.3, 2.0, 1.7, 1.5,
]
// 格 → 成長の上限（総合OVRの上限）
const TIER_POT_CAP: number[] = [
  99, 98, 97, 95, 93, 90, 88, 87, 86, 85,
  85, 85, 85, 85, 85, 83, 83, 83, 83, 83,
]

const SPECS: Specialty[] = ['ace', 'mountain_up', 'mountain_down', 'sprinter', 'long', 'allrounder', 'kick', 'grinder']
const CURVES: GrowthCurve[] = ['early', 'normal', 'normal', 'late_bloomer']
const rng = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1))
const ovrOf = (r: Record<string, number>) =>
  Math.round((r.speed + r.stamina + r.mountainUp + r.mountainDown + r.pacing + r.mental + r.recovery) / 7)

// 年俸→ランクの閾値も年俸と同じ倍率で動かす（動かさないと予算を上げても全員SSSに飽和する）
function rankForSalaryScaled(s: number): Rank {
  return rankForSalary(s / SALARY_MULT)
}

function simulateClub(tier: number, exp: number): number[] {
  const budget = TIER_BUDGET_OKU[tier - 1] * 1e8
  const salaries = distribute(Math.round(budget * SALARY_SHARE), ROSTER, MIN_SALARY, exp)
  const cap = TIER_POT_CAP[tier - 1]
  const ovrs: number[] = []
  salaries.forEach((sal, i) => {
    const age = i < 4 ? rng(25, 31) : i < 15 ? rng(22, 31) : rng(19, 25)
    const { ratings } = buildRatingsForRank({
      id: `sim-${tier}-${i}-${Math.random()}`,
      rank: rankForSalaryScaled(sal),
      specialty: SPECS[rng(0, SPECS.length - 1)],
      growthCurve: CURVES[rng(0, CURVES.length - 1)],
      age,
      potentialCap: cap,
    })
    ovrs.push(ovrOf(ratings as unknown as Record<string, number>))
  })
  return ovrs.sort((a, b) => b - a)
}

const RUNS = 120
const TARGETS = [
  { tier: 1, label: '格1' }, { tier: 5, label: '格5(東京)' },
  { tier: 10, label: '格10' }, { tier: 20, label: '格20(とんぼ)' },
]
console.log(`■ 年俸の配り方（指数）を振ったときの全25人平均OVR  ※${RUNS}回平均・下限400万`)
console.log('指数   ' + TARGETS.map(t => t.label.padStart(12)).join(''))
for (const exp of [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6]) {
  const cells = TARGETS.map(t => {
    let all = 0
    for (let r = 0; r < RUNS; r++) {
      const o = simulateClub(t.tier, exp)
      all += o.reduce((s, x) => s + x, 0) / o.length
    }
    return (all / RUNS).toFixed(1).padStart(12)
  })
  console.log(`${exp.toFixed(1)}  ` + cells.join(''))
}
