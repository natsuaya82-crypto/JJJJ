// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。

// 昨年順位に応じた「翌シーズンの予算グラント」
export const RANK_BUDGET: Record<number, number> = {
  1:  700_000_000,
  2:  660_000_000,
  3:  630_000_000,
  4:  600_000_000,
  5:  570_000_000,
  6:  545_000_000,
  7:  520_000_000,
  8:  500_000_000,
  9:  480_000_000,
  10: 465_000_000,
  11: 450_000_000,
  12: 435_000_000,
  13: 420_000_000,
  14: 410_000_000,
  15: 400_000_000,
  16: 390_000_000,
  17: 380_000_000,
  18: 370_000_000,
  19: 360_000_000,
  20: 350_000_000,
}
export function rankBudgetGrant(finalRank: number): number {
  return RANK_BUDGET[finalRank] ?? 350_000_000
}

// 指名権の市場価値：ドラ1級選手の実価値(約1.2億)×0.9^指名位置。
// 全体1位≈1.08億、5位≈7100万、10位≈4200万、20位≈1450万。2巡は500〜1000万。
// pickNumber は 1巡=1〜20。旧データの2巡(21〜40)でも2巡側はほぼ一律なので誤差は出ない。
export function draftPickValue(round: number, pickNumber: number): number {
  if (round === 1) {
    const v = 120_000_000 * Math.pow(0.90, Math.max(1, pickNumber))
    return Math.max(14_000_000, Math.round(v / 500_000) * 500_000)
  }
  const v = 10_000_000 - (Math.max(1, pickNumber) - 1) * 250_000
  return Math.max(5_000_000, Math.round(v / 500_000) * 500_000)
}

// ランニングコスト：施設Lv合計 × 単価 ＋ 運営費（＝グラントの10%）。
// 強い＝グラントが大きい→運営費も高い＝勝ってもカツカツになる。
export const FACILITY_UPKEEP_PER_LEVEL = 5_000_000   // 施設Lv1つあたり500万/年
export const OPERATING_COST_RATE = 0.10              // 運営費＝グラント額の10%
export function operatingCost(grant: number): number {
  return Math.round(grant * OPERATING_COST_RATE)
}
export function runningCost(facilityLevelSum: number, grant: number): number {
  return facilityLevelSum * FACILITY_UPKEEP_PER_LEVEL + operatingCost(grant)
}

// 赤字を許容する下限（借金の底）。これ以下は endSeason 側で指名権/選手の強制売却で補填する。
export const DEFICIT_LIMIT = -100_000_000  // 最大 -1億まで赤字を持ち越せる

// 来季予算 = 前季残高の繰り越し + 収入 - 支出（下限は救済せず、赤字は DEFICIT_LIMIT まで許容）。
// 連続赤字が2年以上ならグラントを段階的にカット（ペナルティ）。
export function computeNextSeasonBudget(args: {
  finalRank: number
  prevBalance: number      // 今季終了時点の残高（繰り越し）
  deficitStreak: number    // 連続赤字シーズン数（今季を含む前まで）
  sponsorAnnual: number
  seasonRaceIncome: number
  objBudgetBonus: number
  bonusPayout: number
  salaryTotal: number       // ロスター総年俸
  runningCost?: number      // 施設維持費＋運営費（ランニングコスト）
}): number {
  // 2年連続赤字でグラント-20%、3年以上で-35%（万年赤字への締め付け）
  const grantMult = args.deficitStreak >= 3 ? 0.65 : args.deficitStreak >= 2 ? 0.80 : 1.0
  const grant = Math.round(rankBudgetGrant(args.finalRank) * grantMult)
  const income = grant + args.sponsorAnnual + args.seasonRaceIncome + args.objBudgetBonus
  const expenses = args.bonusPayout + args.salaryTotal + (args.runningCost ?? 0)
  const raw = args.prevBalance + income - expenses
  // 下限の大盤振る舞いは廃止。赤字は許容するが DEFICIT_LIMIT で底打ち（不足分は別途強制売却で補う）。
  return Math.max(DEFICIT_LIMIT, raw)
}

// ── 移籍入札：相手が受けるかの判定基準（UI の成立確率表示と store の合否判定で共有）──
// 「受諾ライン」のベース額。実際の判定では threshold = base × (0.9〜1.1 の揺れ) となる。
export function transferBidBase(marketValue: number, isListed: boolean, isExpiring: boolean): number {
  return marketValue * (isListed ? 0.85 : isExpiring ? 0.92 : 1.05)
}
// 入札額 fee に対する受諾確率(0..1)。threshold = base×(0.9 + rand*0.2) の一様分布から算出。
export function transferAcceptChance(fee: number, base: number): number {
  if (base <= 0) return 1
  return Math.max(0, Math.min(1, (fee / base - 0.9) / 0.2))
}
