// 来季予算の精算（store/slices/seasonSlice の endSeason から切り出し）。
//
// **自チームもCPUも海外も、式は data/economy.ts の computeNextSeasonBudget 1本。**
//   収入 = 来季の格の年間予算 ＋ スポンサー ＋ 区間賞 ＋ 目標達成ボーナス
//   支出 = 総年俸 ＋ 運営費(年俸の1割) ＋ 出来高ボーナス ＋ 施設の維持費
//
// ★次のものは廃止済み。**復活させないこと。**
//   順位別グラント（RANK_BUDGET）／順位別のレース賞金・観客収入／CPUへのグラント10%補填／
//   連続赤字のグラント減額／育成義務ペナルティ。
//   順位は「翌年の格」を通してのみ収入に効く。
//
// ★繰越には上限がある（economy.ts の CARRYOVER_CAP_SHARE）。無いと毎年積み上がって
//   格の差が消える。
//
// 乱数は使わない。
import type { Division, Player, Season, Sponsor, Team } from '../types'
import { computeNextSeasonBudget } from '../data/economy'
import { operatingCostOf, tierBudget, type ClubTier } from '../utils/clubTier'
import { facilityUpkeepOf } from '../utils/facilities'

export function computeSeasonBudgets(params: {
  players: Player[]
  teams: Team[]
  sponsors: Sponsor[]
  /** 契約満了・引退を反映したあとのチーム（スポンサーの持ち主を見る） */
  teamsWithFA: Team[]
  currentSeason: Season
  playerTeamId: string
  /** 来季の格（engine/promotion） */
  myNextTier: ClubTier
  nextTierOf: (t: { id: string; division?: Division }) => ClubTier
  nextDivisionOf: (t: { id: string; division?: Division }) => Division
  /** 自チームの今季の総年俸・期末残高・区間賞収入・スポンサー年額・目標ボーナス・出来高 */
  playerSalaryTotal: number
  playerBudgetAtSeasonEnd: number
  prevRaceIncome: number
  sponsorAnnual: number
  objBudgetBonus: number
  bonusTotalPayout: number
  prevStreakMe: number
}) {
  const { teams, sponsors, teamsWithFA, currentSeason, playerTeamId, myNextTier, nextTierOf, nextDivisionOf,
    playerSalaryTotal, playerBudgetAtSeasonEnd, prevRaceIncome, sponsorAnnual,
    objBudgetBonus, bonusTotalPayout, prevStreakMe } = params
  const players = params.players
  // ── 来季予算 ────────────────────────────────────────────────
  // 収入は「来季の格の年間予算」＋スポンサー＋目標ボーナス。支出は年俸＋運営費(年俸の1割)。
  // 順位グラント・レース賞金・観客収入・CPU補填・連続赤字ペナルティ・育成義務ペナルティは
  // 全部この1本に畳んだ（data/economy.ts の computeNextSeasonBudget）。
  const myBaseGrant = tierBudget({ tier: myNextTier })
  const myOpCost = operatingCostOf(playerSalaryTotal)
  const newBudget = computeNextSeasonBudget({
    baseGrant: myBaseGrant,
    prevBalance: playerBudgetAtSeasonEnd,
    sponsorAnnual,
    raceIncome: prevRaceIncome,
    objBudgetBonus,
    bonusPayout: bonusTotalPayout,
    salaryTotal: playerSalaryTotal,
    facilityUpkeep: facilityUpkeepOf(teams.find(t => t.id === playerTeamId)) })
  // 初期予算の内訳（財務ページで「何が合わさって初期予算か」を表示）。
  // 繰越は「前季の最終収支」＝期末残高から年俸・運営費・ボーナスを精算した後の額。
  const newBudgetBreakdown = {
    carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + myOpCost),
    grant: myBaseGrant,
    raceIncome: prevRaceIncome,
    sponsor: sponsorAnnual,
    objBonus: objBudgetBonus,
    expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
  }
  // シーズンを終えた時点の残高がマイナスなら連続赤字+1、プラスなら0にリセット。
  // 連続赤字でグラントを削る仕掛けは廃止したので、これは補強禁止の判定にだけ使う。
  const newStreakMe = newBudget < 0 ? prevStreakMe + 1 : 0

  // 全チームの来季予算（自チームと同じ computeNextSeasonBudget）。
  const teamSalaryTotal = (teamId: string) => players
    .filter(p => p.teamId === teamId)
    .reduce((s, p) => s + p.contract.annualSalary, 0)
  const teamSponsorAnnual = (t: typeof teamsWithFA[0]) => (t.sponsors ?? [])
    .map(id => sponsors.find(s => s.id === id))
    .filter(Boolean)
    .reduce((s, sp) => s + sp!.annualPayment, 0)
  // 監督オファーを受けたときに移籍先の予算へ丸ごと入れ替えるので、
  // 他チームの来季予算の内訳もここで控えておく（あとからは計算し直せない）
  const cpuNextBudgets: Record<string, typeof newBudgetBreakdown & { budget: number }> = {}
  const teamsWithSeasonRewards = teamsWithFA.map(t => {
    if (t.id === playerTeamId) {
      return { ...t, tier: myNextTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: newBudget, deficitStreak: newStreakMe } }
    }
    const cpuTier = nextTierOf(t)
    const sal = teamSalaryTotal(t.id)
    const prevStreak = t.finance.deficitStreak ?? 0
    const cpuBaseGrant = tierBudget({ tier: cpuTier })
    const cpuSponsor = teamSponsorAnnual(t)
    // 区間賞は自チームと同じ数え方で積んである（currentSeason.seasonSegPrize）
    const cpuSegPrize = (currentSeason.seasonSegPrize ?? {})[t.id] ?? 0
    const b = computeNextSeasonBudget({
      baseGrant: cpuBaseGrant,
      prevBalance: t.finance.budget,
      sponsorAnnual: cpuSponsor,
      raceIncome: cpuSegPrize,
      objBudgetBonus: 0,
      bonusPayout: 0,
      salaryTotal: sal,
      // 施設の維持費は全クラブが払う（自チームと同じ1本。レベルは格から出る）
      facilityUpkeep: facilityUpkeepOf({ ...t, tier: cpuTier }) })
    // 自チームと同じ判定：精算後の残高がマイナスなら連続赤字+1、プラスなら0
    const cpuStreak = b < 0 ? prevStreak + 1 : 0
    cpuNextBudgets[t.id] = {
      budget: b,
      carryover: t.finance.budget - (sal + operatingCostOf(sal)),
      grant: cpuBaseGrant,
      raceIncome: cpuSegPrize,
      sponsor: cpuSponsor,
      objBonus: 0,
      expenses: 0 }
    return { ...t, tier: cpuTier, division: nextDivisionOf(t), finance: { ...t.finance, budget: b, deficitStreak: cpuStreak } }
  })

  // Generate future draft picks (next 2 seasons) for each team based on final rank
  return { newBudget, newBudgetBreakdown, newStreakMe, cpuNextBudgets, teamsWithSeasonRewards }
}
