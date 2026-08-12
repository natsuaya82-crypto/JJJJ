// 今季の目標の達成判定と、来季の目標・GM評判。endSeason から切り出した（挙動不変）。
//
// ■触るときの注意
//   - **判定するのは「まだ done でないもの」だけ。** 一度達成した目標を取り消さない
//   - ごほうびは「今季新しく達成したぶん」だけ数える（`newlyCompletedObjs`）。
//     去年から done のものを毎年数えると、同じ目標で何度でもポイントが入る
//   - 来季の目標は今季の最終順位を基準にスケールする（順位が上がるほど厳しくなる）。
//     選び方は `engine/achievements` の `selectSeasonObjectives` 1本
//   - **`selectSeasonObjectives` は乱数を引く。** 呼ぶ位置を動かすと世界が変わる
//   - GM評判は達成率で ±5 以内。1〜100 に収める
import { selectSeasonObjectives } from './achievements'
import { withGmRep } from '../utils/condition'
import type { GameState } from '../types'

export function settleSeasonObjectives(args: {
  currentSeason: GameState['currentSeason']
  playerTeamId: string
  /** 今季の自チームの最終順位（部内） */
  finalRank: number
  /** 今季終了時点の自チームの資金 */
  playerBudgetAtSeasonEnd: number
  /** ライバルを設定しているか */
  hasRival: boolean
  /** 自分の部のクラブ数 */
  divSize: number
  gmRep: number | undefined
}) {
  const { currentSeason, finalRank, playerBudgetAtSeasonEnd, hasRival, divSize, gmRep } = args

  const completedObjs = (currentSeason.objectives ?? []).map(obj => {
    if (obj.done) return obj
    if (obj.id === 'topN' && finalRank > 0 && finalRank <= obj.target) return { ...obj, current: finalRank, done: true }
    if (obj.id === 'noInjury' && obj.current === 0) return { ...obj, done: true }
    if (obj.id === 'budgetMaintain' && playerBudgetAtSeasonEnd >= obj.target) return { ...obj, current: playerBudgetAtSeasonEnd, done: true }
    return obj
  })
  const newlyCompletedObjs = completedObjs.filter(o => o.done && !currentSeason.objectives.find(x => x.id === o.id)?.done)
  const objBonus = newlyCompletedObjs.reduce((s, o) => s + o.rewardPts, 0)
  const objBudgetBonus = newlyCompletedObjs.reduce((s, o) => s + (o.rewardBudget ?? 0), 0)

  // 来季の目標：今季の最終順位を基準にスケール（順位が上がるほど翌年の目標も厳しく）
  const newObjectives = selectSeasonObjectives(hasRival, divSize, finalRank)

  // GM評判＝今季の目標達成率で少しずつ変動（±5以内）
  const objAchieved = completedObjs.filter(o => o.done).length
  const objTotalCount = completedObjs.length || 1
  const objAchieveRate = objAchieved / objTotalCount
  const repDelta = objAchieveRate >= 1 ? 5 : objAchieveRate >= 0.6 ? 3 : objAchieveRate >= 0.4 ? 1 : objAchieveRate >= 0.2 ? -1 : -3
  // 上下限は utils/condition の withGmRep 1本（0〜100）。
  // ★以前ここだけ下限が 1 で、イベントの決着（resolveEvent）は 0 まで落ちていた。
  //   底は 0 に揃えた（2026-08-12・オーナー判断）
  const newGmRep = withGmRep(gmRep, repDelta)

  return { newlyCompletedObjs, objBonus, objBudgetBonus, newObjectives, newGmRep }
}
