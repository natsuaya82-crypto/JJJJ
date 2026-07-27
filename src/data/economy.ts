// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。

// 昨年順位に応じた「翌シーズンの予算グラント」
// 賞金・観客・スポンサー収入は上位ほど大きいため、グラントは上位ほど強く圧縮（約-19%）し、
// 下位はほぼ据え置き（約-3%）にして総収入の格差を緩和する
// 2046調整: 優勝チームが毎年+4億積み上げて無双する構造だったため、
// 上位グラントを圧縮（1位5.70→5.20億）・下位を底上げ（3.68→3.90億）して格差を約1.3億に縮小
export const RANK_BUDGET: Record<number, number> = {
  1:  520_000_000,
  2:  506_000_000,
  3:  493_000_000,
  4:  481_000_000,
  5:  470_000_000,
  6:  460_000_000,
  7:  451_000_000,
  8:  443_000_000,
  9:  436_000_000,
  10: 429_000_000,
  11: 423_000_000,
  12: 417_000_000,
  13: 411_000_000,
  14: 405_000_000,
  15: 400_000_000,
  // 16位以下は下位救済のため一律底上げ
  16: 390_000_000,
  17: 390_000_000,
  18: 390_000_000,
  19: 390_000_000,
  20: 390_000_000,
}
export function rankBudgetGrant(finalRank: number): number {
  return RANK_BUDGET[finalRank] ?? 390_000_000
}

// レース賞金（プレイヤーのそのレース着順に応じた1戦あたり賞金・円）。
// 2046調整: 上位の賞金を圧縮（1位2000→1200万）して優勝チームの複利無双を抑える。下位はほぼ据え置き。
// 1位1200万 / 2〜3位1000万 / 4〜5位850万 / 6〜10位700万 / 11〜13位600万 / 14〜17位550万 / 18〜20位500万。
export function racePrizeByRank(rank: number): number {
  if (rank <= 0) return 0
  const man =
    rank <= 1 ? 1200 :
    rank <= 3 ? 1000 :
    rank <= 5 ? 850 :
    rank <= 10 ? 700 :
    rank <= 13 ? 600 :
    rank <= 17 ? 550 : 500
  return man * 10000
}

// CPUの不足分補填：確定予算（グラント）の10%を上乗せ。
export const CPU_INCOME_SUPPLEMENT_RATE = 0.10
export function cpuIncomeSupplement(finalRank: number): number {
  return Math.round(rankBudgetGrant(finalRank) * CPU_INCOME_SUPPLEMENT_RATE)
}

// 順位別の1戦あたり観客収入の目安（プレイヤーの計算式と同じ段階。乱数は除いた期待値）。
export function attendanceRevenueByRank(rank: number): number {
  const base = 2_750_000   // 全順位共通のベース（約275万・乱数の期待値）
  // 2046調整: 順位ボーナスを半減（1位800→400万）。上位の複利収入を抑える
  const rankBonus =
    rank === 1 ? 4_000_000 :
    rank <= 3 ? 2_500_000 :
    rank <= 6 ? 1_000_000 :
    rank <= 10 ? 400_000 : 0
  return base + rankBonus
}

// CPUのシーズン収入：プレイヤー同様に「レース賞金＋観客収入」を最終順位ベースで1シーズン分(racesCount戦)概算し、
// さらに足りない分としてグラントの10%を上乗せする。
export function cpuSeasonRaceIncome(finalRank: number, racesCount: number): number {
  const races = Math.max(1, racesCount)
  const perRace = racePrizeByRank(finalRank) + attendanceRevenueByRank(finalRank)
  return perRace * races + cpuIncomeSupplement(finalRank)
}

// ── リーグの育成義務ペナルティ ──
// 少人数の緊縮経営（年俸を絞って黒字を貯める）への対抗策。
// 在籍22人以下は翌季グラント-20%、リザーブリーグ不参加はさらに-10%（合計最大-30%）。
//
// banned=true（補強禁止中）は免除する。補強禁止からの脱出手段は「選手を売って年俸を削る」しか
// 無いのに、削って22人以下になると更にグラントが減って赤字が深まる二重の罠になっていたため。
export const DUTY_ROSTER_THRESHOLD = 22
export const DUTY_ROSTER_GRANT_CUT = 0.20
export const DUTY_RESERVE_GRANT_CUT = 0.10
export function leagueDutyGrantCut(rosterSize: number, reserveJoined: boolean, banned = false): number {
  if (banned) return 0
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

// ── 連続赤字のグラントペナルティ ──
// 2年連続赤字でグラント-20%、3年以上で-35%（万年赤字への締め付け）。
// 以前は computeNextSeasonBudget / seasonOperatingResult に同じ式が別々に書かれていた。
export function deficitGrantMult(deficitStreak: number): number {
  return deficitStreak >= 3 ? 0.65 : deficitStreak >= 2 ? 0.80 : 1.0
}
// 実際に受け取るグラント額（連続赤字ペナルティ・育成義務ペナルティ適用後）。
// 運営費(10%)もこの実額を基準にする。ペナルティで収入が減るのに運営費だけ満額のままだと、
// 赤字→減額→さらに赤字、が永久に抜け出せないデススパイラルになるため。
export function effectiveGrant(finalRank: number, deficitStreak: number, dutyGrantCut = 0): number {
  return Math.round(rankBudgetGrant(finalRank) * deficitGrantMult(deficitStreak) * (1 - dutyGrantCut))
}

// 赤字を許容する下限（借金の底）。これ以下は endSeason 側で指名権/選手の強制売却で補填する。
export const DEFICIT_LIMIT = -100_000_000  // 最大 -1億まで赤字を持ち越せる

// 旧仕様の判定バグで詰んだセーブの救済ライン（残高マイナスのチームをここまで戻す）。
export const DEFICIT_RESCUE_BUDGET = 50_000_000

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
  const grant = effectiveGrant(args.finalRank, args.deficitStreak, args.dutyGrantCut ?? 0)
  const income = grant + args.sponsorAnnual + args.seasonRaceIncome + args.objBudgetBonus
  const expenses = args.bonusPayout + args.salaryTotal + (args.runningCost ?? 0)
  const raw = args.prevBalance + income - expenses
  // 下限の大盤振る舞いは廃止。赤字は許容するが DEFICIT_LIMIT で底打ち（不足分は別途強制売却で補う）。
  return Math.max(DEFICIT_LIMIT, raw)
}

// 連続赤字の判定は computeNextSeasonBudget の結果（＝精算後の残高）がマイナスかどうかだけで行う。
// かつてここに seasonOperatingResult / deficitGapToBreakEven という「単年営業収支」の指標があったが、
// 残高はプラスなのに赤字扱いになる、財務画面で予測値と実績値が食い違う、といった混乱を生むだけだったため撤去した。

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
// 出品中(クラブ希望額あり)の受諾確率。クラブが提示した希望額(askingPrice)満額で必ず成立=100%、
// 下回るほど下がり 0.85倍で0%。主力割増は乗せない（クラブ自ら売りに出している額なので）。
// 本処理側の threshold = askingPrice×(0.85 + rand*0.15) と同じ分布。ズレると「100%表示なのに拒否」になる。
export function listedAcceptChance(fee: number, askingPrice: number): number {
  if (askingPrice <= 0) return 1
  return Math.max(0, Math.min(1, (fee / askingPrice - 0.85) / 0.15))
}
