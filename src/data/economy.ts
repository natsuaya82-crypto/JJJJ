// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。

// 昨年順位に応じた「翌シーズンの予算グラント」
// 賞金・観客・スポンサー収入は上位ほど大きいため、グラントは上位ほど強く圧縮（約-19%）し、
// 下位はほぼ据え置き（約-3%）にして総収入の格差を緩和する
export const RANK_BUDGET: Record<number, number> = {
  1:  570_000_000,
  2:  545_000_000,
  3:  525_000_000,
  4:  505_000_000,
  5:  485_000_000,
  6:  468_000_000,
  7:  452_000_000,
  8:  438_000_000,
  9:  425_000_000,
  10: 413_000_000,
  11: 402_000_000,
  12: 392_000_000,
  13: 383_000_000,
  14: 375_000_000,
  15: 368_000_000,
  // 16位以下は下位救済のため一律15位と同額に底上げ（上位1〜14位は据え置き）
  16: 368_000_000,
  17: 368_000_000,
  18: 368_000_000,
  19: 368_000_000,
  20: 368_000_000,
}
export function rankBudgetGrant(finalRank: number): number {
  return RANK_BUDGET[finalRank] ?? 368_000_000
}

// ── リーグの育成義務ペナルティ ──
// 少人数の緊縮経営（年俸を絞って黒字を貯める）への対抗策。
// 在籍22人以下は翌季グラント-20%、リザーブリーグ不参加はさらに-10%（合計最大-30%）。
export const DUTY_ROSTER_THRESHOLD = 22
export const DUTY_ROSTER_GRANT_CUT = 0.20
export const DUTY_RESERVE_GRANT_CUT = 0.10
export function leagueDutyGrantCut(rosterSize: number, reserveJoined: boolean): number {
  let cut = 0
  if (rosterSize <= DUTY_ROSTER_THRESHOLD) cut += DUTY_ROSTER_GRANT_CUT
  if (!reserveJoined) cut += DUTY_RESERVE_GRANT_CUT
  return cut
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
  dutyGrantCut?: number     // 育成義務ペナルティ（leagueDutyGrantCut の結果。0〜0.3）
}): number {
  // 2年連続赤字でグラント-20%、3年以上で-35%（万年赤字への締め付け）
  const grantMult = args.deficitStreak >= 3 ? 0.65 : args.deficitStreak >= 2 ? 0.80 : 1.0
  const grant = Math.round(rankBudgetGrant(args.finalRank) * grantMult * (1 - (args.dutyGrantCut ?? 0)))
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
