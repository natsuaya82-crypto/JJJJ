/**
 * 【世界選手権を最後まで一気に消化する】
 *
 * ■どこから押すか（オーナー・2026-08-16）
 *   「世界選手権のここにスキップ作ったバカ誰？直して。
 *     3枚目の横に結果を見るでスキップするのよ。駅伝第一戦へじゃなくて観戦するな」
 *
 *   スキップの口は**大会に入る前（ホームのカード）の「結果だけ見る」1つだけ**。
 *   大会の中に「最後までスキップ」を並べない（入ってから飛ばす動線を作らない）。
 *
 * ★走らせるのは `advanceWorldRace` 1本（観戦するときとまったく同じ処理）。
 *   ここで結果を作らないこと。
 */
import { useGameStore } from '../store/gameStore'

export function skipWorldTournament() {
  const S = () => useGameStore.getState()
  // 上限は保険（実際は3戦）。無限ループにしない
  for (let i = 0; i < 20; i++) {
    const cur = S().worldTournament
    if (!cur || cur.finished || cur.raceIndex >= cur.races.length) break
    S().advanceWorldRace()
  }
  // 駅伝の合間に1つずつ出す個人種目も、まとめて消化する（最終結果に全部載る）
  S().markWorldIndividualsSeen()
  const inds = S().worldTournament?.individuals?.length ?? 0
  for (let i = S().worldTournament?.individualsRevealed ?? 0; i < inds; i++) S().markWorldIndividualRevealed()
}
