// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。

// 昨年順位に応じた「翌シーズンの予算グラント」
export const RANK_BUDGET: Record<number, number> = {
  1: 500_000_000, 2: 400_000_000, 3: 350_000_000,
  4: 300_000_000, 5: 250_000_000,
}
export function rankBudgetGrant(finalRank: number): number {
  return RANK_BUDGET[finalRank] ?? (finalRank <= 10 ? 220_000_000 : 200_000_000)
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
  salaryTotal: number  // 1軍+2軍
}): number {
  // 2年連続赤字でグラント-20%、3年以上で-35%（万年赤字への締め付け）
  const grantMult = args.deficitStreak >= 3 ? 0.65 : args.deficitStreak >= 2 ? 0.80 : 1.0
  const grant = Math.round(rankBudgetGrant(args.finalRank) * grantMult)
  const income = grant + args.sponsorAnnual + args.seasonRaceIncome + args.objBudgetBonus
  const expenses = args.bonusPayout + args.salaryTotal
  const raw = args.prevBalance + income - expenses
  // 下限の大盤振る舞いは廃止。赤字は許容するが DEFICIT_LIMIT で底打ち（不足分は別途強制売却で補う）。
  return Math.max(DEFICIT_LIMIT, raw)
}
