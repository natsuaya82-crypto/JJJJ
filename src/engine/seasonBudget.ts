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
// ★**精算するのはここ1か所。232クラブ全部を、どのリーグにいても同じ式で通す**（W7）。
//   自チームかどうかは id だけで見る（国内か海外かで分けない）。以前は日本のリーグの
//   クラブをここで、海外クラブを engine/foreignSeason で別々に精算していて、
//   自チームが海外クラブだと自チーム用の精算（スポンサー・目標ボーナス・出来高）を通らなかった。
//   区間賞も海外リーグのクラブへ払う（オーナー・2026-09-25。集計は utils/league の
//   segmentPrizeByTeam 1本で、以前から海外の行も積んであった）。
//
// 乱数は使わない。
import { clubSalaryTotal } from '../utils/clubMoney'
import type { Player, Season, Sponsor, WorldClub } from '../types'
import { computeNextSeasonBudget } from '../data/economy'
import { operatingCostOf, tierBudget, type ClubTier } from '../utils/clubTier'
import { facilityUpkeepOf } from '../utils/facilities'
import { mapClubs } from '../utils/world'

export function computeSeasonBudgets(params: {
  players: Player[]
  sponsors: Sponsor[]
  /** 契約満了・引退を反映したあとのクラブ（スポンサーの持ち主を見る） */
  clubsWithFA: WorldClub[]
  currentSeason: Season
  playerTeamId: string
  /** 来季の格と置き場所（engine/promotion。動くかどうかはリーグの決まりで決まる） */
  nextTierOf: (t: WorldClub) => ClubTier
  nextPlaceOf: (t: WorldClub) => { tier?: ClubTier; leagueId?: string }
  /** 自チームの今季の総年俸・期末残高・スポンサー年額・目標ボーナス・出来高 */
  playerSalaryTotal: number
  playerBudgetAtSeasonEnd: number
  sponsorAnnual: number
  objBudgetBonus: number
  bonusTotalPayout: number
  prevStreakMe: number
}) {
  const { sponsors, clubsWithFA, currentSeason, playerTeamId, nextTierOf, nextPlaceOf,
    playerSalaryTotal, playerBudgetAtSeasonEnd, sponsorAnnual,
    objBudgetBonus, bonusTotalPayout, prevStreakMe } = params
  const players = params.players
  // 区間賞は全クラブぶんを同じ数え方で積んである（currentSeason.seasonSegPrize。
  // 国内の本編・他の部・海外リーグのどれで取ったものも入る）。自チームだけの
  // seasonRaceIncome は同じ額の旧い置き場所（予算の見出しに出す）
  const segPrizeOf = (id: string) => (currentSeason.seasonSegPrize ?? {})[id] ?? 0
  const prevRaceIncome = currentSeason.seasonRaceIncome ?? 0
  // 総年俸は `utils/clubMoney` の `clubSalaryTotal` 1本（レンタルで借りている選手は
  // 借りた側が払う・オーナー2026-09-15）。人数を数える `teamRosterSize` と同じ population
  const teamSponsorAnnual = (c: WorldClub) => (c.sponsors ?? [])
    .map(id => sponsors.find(s => s.id === id))
    .filter(Boolean)
    .reduce((s, sp) => s + sp!.annualPayment, 0)

  let newBudget = 0
  let newStreakMe = 0
  let newBudgetBreakdown = { carryover: 0, grant: 0, raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }
  // 監督オファーを受けたときに移籍先の予算へ丸ごと入れ替えるので、
  // 他チームの来季予算の内訳もここで控えておく（あとからは計算し直せない）
  const cpuNextBudgets: Record<string, typeof newBudgetBreakdown & { budget: number }> = {}

  const clubsWithSeasonRewards = mapClubs(clubsWithFA, (c): WorldClub => {
    const place = nextPlaceOf(c)
    const grant = tierBudget({ tier: nextTierOf(c) })
    // 古いセーブの海外クラブには finance が無い。その年は「格の年間予算ちょうど」から始める
    const prevBalance = c.finance?.budget ?? tierBudget(c)
    // 施設の維持費は、今季その施設で過ごした分（精算するのは走り終えたシーズン）
    const facilityUpkeep = facilityUpkeepOf(c)
    if (c.id === playerTeamId) {
      // ── 自チーム ──
      // 在籍選手の年俸は、契約満了・引退を処理する前の名簿で数えたもの（呼ぶ側が渡す）。
      // スポンサー・目標ボーナス・出来高は自チームにしか無い
      newBudget = computeNextSeasonBudget({
        baseGrant: grant,
        prevBalance: playerBudgetAtSeasonEnd,
        sponsorAnnual,
        raceIncome: prevRaceIncome,
        objBudgetBonus,
        bonusPayout: bonusTotalPayout,
        salaryTotal: playerSalaryTotal,
        facilityUpkeep })
      // 初期予算の内訳（財務ページで「何が合わさって初期予算か」を表示）。
      // 繰越は「前季の最終収支」＝期末残高から年俸・運営費・ボーナスを精算した後の額。
      newBudgetBreakdown = {
        carryover: playerBudgetAtSeasonEnd - (bonusTotalPayout + playerSalaryTotal + operatingCostOf(playerSalaryTotal)),
        grant,
        raceIncome: prevRaceIncome,
        sponsor: sponsorAnnual,
        objBonus: objBudgetBonus,
        expenses: 0,  // 精算済みのためcarryoverに織り込み（旧セーブの表示互換のためフィールドは残す）
      }
      // シーズンを終えた時点の残高がマイナスなら連続赤字+1、プラスなら0にリセット。
      // 連続赤字でグラントを削る仕掛けは廃止したので、これは補強禁止の判定にだけ使う。
      newStreakMe = newBudget < 0 ? prevStreakMe + 1 : 0
      return { ...c, ...place, finance: { ...c.finance, budget: newBudget, deficitStreak: newStreakMe } }
    }
    // ── 自チーム以外（どのリーグでも同じ） ──
    const sal = clubSalaryTotal(players, c.id)
    const sponsor = teamSponsorAnnual(c)
    const raceIncome = segPrizeOf(c.id)
    const b = computeNextSeasonBudget({
      baseGrant: grant,
      prevBalance,
      sponsorAnnual: sponsor,
      raceIncome,
      objBudgetBonus: 0,
      bonusPayout: 0,
      salaryTotal: sal,
      facilityUpkeep })
    cpuNextBudgets[c.id] = {
      budget: b,
      carryover: prevBalance - (sal + operatingCostOf(sal)),
      grant,
      raceIncome,
      sponsor,
      objBonus: 0,
      expenses: 0 }
    // 自チームと同じ判定：精算後の残高がマイナスなら連続赤字+1、プラスなら0
    const streak = b < 0 ? (c.finance?.deficitStreak ?? 0) + 1 : 0
    return { ...c, ...place, finance: { ...c.finance, budget: b, deficitStreak: streak } }
  })

  return { newBudget, newBudgetBreakdown, newStreakMe, cpuNextBudgets, clubsWithSeasonRewards }
}
