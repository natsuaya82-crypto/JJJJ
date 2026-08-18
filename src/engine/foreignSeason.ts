// 海外リーグの年度処理。endSeason から切り出した（挙動不変）。
//
//   優勝クラブの選手に優勝+1 → リーグ順位から格を動かす → 来季予算の精算
//
// **移籍はここでは起きません。** 経路は `engine/transferMarket.ts` の1本だけで、
// 回すのは `beginSeasonDraft`（CPUの解雇が終わって枠が空いたあと）。
// 以前はここに「海外↔海外」と「日本↔海外」の2本があり、国内CPU間の1本と合わせて
// 同じ問いに3つの実装が並んでいました。
//
// ■触るときの注意
//   - **海外クラブの格も毎年動く。国内と扱いを分けないこと。** 違うのは「どの順位表で
//     決まるか」だけで、国内は国内通し順位、海外は所属リーグの順位。以前は順位表があるのに
//     格へ返しておらず、最下位を続けても格1のまま固定だった
//   - **海外クラブの資金も本物。置き場所は `finance.budget` 1本**（国内とまったく同じ項目）で、
//     来季予算も国内CPUと同じ `computeNextSeasonBudget` を通す。
//     **`tierBudget` から作り直さないこと**（使っても減らない別のお金になり、
//     国内が節約している場面でも海外だけは必ず買えるので日本の主力が一方的に抜ける）
//   - **乱数を引く。** 中の順番を入れ替えると世界が丸ごと変わる
import { computeNextSeasonBudget } from '../data/economy'
import { applyForeignChampions } from './foreignLeague'
import { tierBudget } from '../utils/clubTier'
import { facilityUpkeepOf } from '../utils/facilities'
import type { ForeignLeague, GameState, Player, Team } from '../types'

/** 格と予算を来季ぶんに更新し終えた世界。移籍はまだ1件も起きていない */
export type ForeignSeasonResult = {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
}

export function processForeignSeason(args: {
  /** 通算成績まで書き終えた選手一覧 */
  players: Player[]
  /** 今季の海外リーグ（優勝クラブを見るため、更新前のもの） */
  foreignLeagues: ForeignLeague[]
  /** 今季の海外リーグ順位表 */
  foreignStandings: NonNullable<GameState['currentSeason']['foreignStandings']>
  /** 年次入れ替え後の海外リーグ */
  refreshedLeagues: ForeignLeague[]
  /** 年次入れ替えで新しく入った選手 */
  newForeignPlayers: Player[]
  /** 旧セーブの大再編で退場させる選手 */
  removedForeignPlayerIds: Set<string>
  /** 指名権の処理まで終わった国内クラブ */
  teams: Team[]
  playerTeamId: string
  /** 来季の年 */
  newYear: number
}): ForeignSeasonResult {
  const { players, foreignLeagues, foreignStandings, refreshedLeagues, newForeignPlayers,
    removedForeignPlayerIds, teams } = args

  // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
  const playersWithForeignChamp = applyForeignChampions(
    foreignLeagues, players, foreignStandings,
  )

  // ★**海外クラブの格は動かさない**（オーナー・2026-08-18「格はもう動かさない。国内だけ動かす」）。
  //   格は `data/clubTiers.ts` の初期値のまま一生固定で、リーグ順位は格に返さない。
  //   毎年の順位で動かしていたころは、格1の帯の上端を `Math.max(2, t)` で潰していたせいで
  //   **順位で格1に上がれず**、オーナー指定の格1の5クラブが1位を落とすたびに減り、
  //   数年で世界から格1が消えていた。動かすのは国内（`Team.tier`）だけ。
  const leaguesWithTier = refreshedLeagues

  // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
  // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
  const foreignBasePlayers = [
    ...(removedForeignPlayerIds.size > 0 ? playersWithForeignChamp.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithForeignChamp),
    ...newForeignPlayers,
  ]
  // 海外クラブの来季予算。**国内CPUとまったく同じ computeNextSeasonBudget 1本**を通す。
  //   収入 = 格の年間予算   支出 = 総年俸 + 運営費(年俸の1割) + 施設維持費
  // これまで海外クラブには資金の置き場所（finance）が無く、移籍の処理に入るたびに
  // tierBudget へ満タンに戻っていた。使っても減らないので、
  //   ・繰越の上限（CARRYOVER_CAP_SHARE）が効かない
  //   ・施設維持費も年俸も払わない
  //   ・格を上げても下げても手元の額が変わらない
  // という状態で、国内だけが資金のやりくりをしていた。
  // 総年俸は補充・引退を反映した後の名簿（foreignBasePlayers）から数える。
  const foreignSalaryTotal = new Map<string, number>()
  for (const p of foreignBasePlayers) {
    if (p.status === 'retired') continue
    foreignSalaryTotal.set(p.teamId, (foreignSalaryTotal.get(p.teamId) ?? 0) + p.contract.annualSalary)
  }
  const leaguesWithFinance = leaguesWithTier.map(lg => ({
    ...lg,
    clubs: lg.clubs.map(c => {
      const sal = foreignSalaryTotal.get(c.id) ?? 0
      return {
        ...c,
        finance: {
          ...c.finance,
          budget: computeNextSeasonBudget({
            baseGrant: tierBudget(c),
            // 古いセーブには finance が無い。その年は「格の年間予算ちょうど」から始める
            prevBalance: c.finance?.budget ?? tierBudget(c),
            sponsorAnnual: 0,   // 海外クラブはスポンサー契約を結ばない（国内CPUも同じ）
            raceIncome: 0,      // 区間賞は国内のレースだけ
            objBudgetBonus: 0,
            bonusPayout: 0,
            salaryTotal: sal,
            facilityUpkeep: facilityUpkeepOf(c) }) } }
    }) }))

  // ★移籍市場はここでは回しません。**経路は `engine/transferMarket.ts` の1本だけ**で、
  //   回すのは `beginSeasonDraft`（＝CPUの解雇が終わって枠が空いたあと）です。
  //   ここには「海外↔海外」と「日本↔海外」の2本があり、国内CPU間の1本と合わせて
  //   同じ問いに3つの実装が並んでいました（`docs/AUDIT_TRANSFERS.md`）。
  //   在籍25人のまま市場を回すと買う枠が無いので、順番も解雇のあとで正しい。
  return { players: foreignBasePlayers, teams, foreignLeagues: leaguesWithFinance }
}
