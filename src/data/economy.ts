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

// ランニングコスト：施設Lv合計 × 単価 ＋ 一律の運営費（毎シーズンの固定支出）。
// 強い＝施設が充実→維持費が高い＝勝ってもカツカツになる。
export const FACILITY_UPKEEP_PER_LEVEL = 5_000_000   // 施設Lv1つあたり500万/年
export const BASE_OPERATING_COST = 50_000_000        // 運営費 5000万/年（一律）
export function runningCost(facilityLevelSum: number): number {
  return facilityLevelSum * FACILITY_UPKEEP_PER_LEVEL + BASE_OPERATING_COST
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
