// 海外リーグの年度処理。endSeason から切り出した（挙動不変）。
//
//   優勝クラブの選手に優勝+1 → リーグ順位から格を動かす → 来季予算の精算
//   → 海外クラブ間の移籍 → 日本↔海外の移籍
//
// ■触るときの注意
//   - **海外クラブの格も毎年動く。国内と扱いを分けないこと。** 違うのは「どの順位表で
//     決まるか」だけで、国内は国内通し順位、海外は所属リーグの順位。以前は順位表があるのに
//     格へ返しておらず、最下位を続けても格1のまま固定だった
//   - **海外クラブの資金も本物。置き場所は `finance.budget` 1本**（国内とまったく同じ項目）で、
//     来季予算も国内CPUと同じ `computeNextSeasonBudget` を通す。
//     **`tierBudget` から作り直さないこと**（使っても減らない別のお金になり、
//     国内が節約している場面でも海外だけは必ず買えるので日本の主力が一方的に抜ける）
//   - 移籍の処理が転んでもシーズンの更新自体は壊さない。失敗したら「移籍なし」で先へ進める
//   - **乱数を引く。** 中の順番を入れ替えると世界が丸ごと変わる
import { computeNextSeasonBudget } from '../data/economy'
import { applyForeignChampions } from './foreignLeague'
import { simulateCrossBorderTransfers, simulateForeignTransferMarket } from './foreignTransfers'
import { tierBudget, tierFromForeignRank } from '../utils/clubTier'
import { facilityUpkeepOf } from '../utils/facilities'
import { rankedStandings } from '../utils/league'
import type { NewsItem } from '../utils/newsItems'
import type { ForeignLeague, GameState, Player, Team, TransferRecord } from '../types'

type ForeignTx = { foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TransferRecord[] }
type CrossTx = { teams: Team[]; foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TransferRecord[] }

export type ForeignSeasonResult = {
  /** 海外クラブ同士の移籍まで済ませた段階 */
  foreignTx: ForeignTx
  /** 日本↔海外の移籍まで済ませた段階 */
  crossTx: CrossTx
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
    removedForeignPlayerIds, teams, playerTeamId, newYear } = args

  // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
  const playersWithForeignChamp = applyForeignChampions(
    foreignLeagues, players, foreignStandings,
  )

  // 海外クラブの格も今季のリーグ順位で動かす。国内（Team.tier）とまったく同じ扱いで、
  // 違うのは「どの順位表で決まるか」だけ。順位表はあるのに格へ返していなかったので、
  // 海外クラブの格は初期値のまま一生固定だった（最下位を続けても格1のまま）。
  const foreignStandingsFinal = foreignStandings
  const leaguesWithTier = refreshedLeagues.map(lg => {
    const rows = rankedStandings(foreignStandingsFinal[lg.id] ?? [])
    if (rows.length === 0) return lg   // 1戦もしていないリーグは触らない
    const rankOf = new Map(rows.map((r, i) => [r.teamId, i + 1]))
    return {
      ...lg,
      clubs: lg.clubs.map(c => {
        const rank = rankOf.get(c.id)
        return rank == null ? c : { ...c, tier: tierFromForeignRank(lg.id, rank, rows.length) }
      }) }
  })

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

  let foreignTx: { foreignLeagues: typeof refreshedLeagues; players: typeof foreignBasePlayers; news: NewsItem[]; records: TransferRecord[] }
  try {
    foreignTx = simulateForeignTransferMarket({
      foreignLeagues: leaguesWithFinance,
      players: foreignBasePlayers,
      year: newYear })
  } catch (e) {
    console.error('simulateForeignTransferMarket failed', e)
    foreignTx = { foreignLeagues: leaguesWithFinance, players: foreignBasePlayers, news: [], records: [] }
  }

  // シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。プレイヤーのチームは対象外。
  let crossTx: { teams: typeof teams; foreignLeagues: typeof foreignTx.foreignLeagues; players: typeof foreignTx.players; news: typeof foreignTx.news; records: TransferRecord[] }
  try {
    crossTx = simulateCrossBorderTransfers({
      teams: teams,
      foreignLeagues: foreignTx.foreignLeagues,
      players: foreignTx.players,
      playerTeamId: playerTeamId,
      year: newYear })
  } catch (e) {
    console.error('simulateCrossBorderTransfers failed', e)
    crossTx = { teams: teams, foreignLeagues: foreignTx.foreignLeagues, players: foreignTx.players, news: [], records: [] }
  }
  return { foreignTx, crossTx }
}
