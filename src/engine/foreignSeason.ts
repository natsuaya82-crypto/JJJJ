// 海外リーグの年度処理。endSeason から切り出した。
//
//   優勝クラブの選手に優勝+1 → 旧セーブの大再編で退場する選手を外し、新しい選手を足す
//
// **移籍はここでは起きません。** 経路は `engine/transferMarket.ts` の1本だけで、
// 回すのは `beginSeasonDraft`（CPUの解雇が終わって枠が空いたあと）。
// **来季予算の精算もここでは行いません。** 232クラブ全部を `engine/seasonBudget` の
// 1か所で精算する（以前は海外クラブだけここで別に精算していた）。
// **海外クラブの格は動きません**（格が動くかは data/leagueRules の tierMoves）。
import { applyForeignChampions } from './foreignLeague'
import type { GameState, Player, WorldClub } from '../types'
import { FOREIGN_LEAGUE_DEFS } from '../data/leagues'

/** 来季の世界の選手。移籍はまだ1件も起きていない */
export type ForeignSeasonResult = {
  players: Player[]
  clubs: WorldClub[]
}

export function processForeignSeason(args: {
  /** 通算成績まで書き終えた選手一覧 */
  players: Player[]
  /** 今季のリーグ（順位表はここから引く） */
  leagues: GameState['currentSeason']['leagues']
  /** 年次入れ替えで新しく入った選手 */
  newForeignPlayers: Player[]
  /** 旧セーブの大再編で退場させる選手 */
  removedForeignPlayerIds: Set<string>
  /** 指名権の処理まで終わったクラブ（世界の並び） */
  clubs: WorldClub[]
  playerTeamId: string
  /** 来季の年 */
  newYear: number
}): ForeignSeasonResult {
  const { players, leagues, newForeignPlayers, removedForeignPlayerIds, clubs } = args

  // 海外リーグの優勝クラブ所属選手に championships +1（今季の順位表を確定してから）
  const playersWithForeignChamp = applyForeignChampions(
    FOREIGN_LEAGUE_DEFS.map(l => l.id), players, leagues,
  )

  // ★**海外クラブの格は動かさない**（オーナー・2026-08-18「格はもう動かさない。国内だけ動かす」）。
  //   格は `data/clubTiers.ts` の初期値のまま一生固定で、リーグ順位は格に返さない。
  //   毎年の順位で動かしていたころは、格1の帯の上端を `Math.max(2, t)` で潰していたせいで
  //   **順位で格1に上がれず**、オーナー指定の格1の5クラブが1位を落とすたびに減り、
  //   数年で世界から格1が消えていた。動かすのは国内（`Team.tier`）だけ。

  // シーズンオフの海外クラブ間移籍（引き抜き）。選手がクラブ・国境を越えて移動する。
  // 万一エラーが出てもシーズン更新自体は壊さないよう、失敗時は移籍なしにフォールバック。
  const foreignBasePlayers = [
    ...(removedForeignPlayerIds.size > 0 ? playersWithForeignChamp.filter(p => !removedForeignPlayerIds.has(p.id)) : playersWithForeignChamp),
    ...newForeignPlayers,
  ]
  // ★移籍市場はここでは回しません。**経路は `engine/transferMarket.ts` の1本だけ**で、
  //   回すのは `beginSeasonDraft`（＝CPUの解雇が終わって枠が空いたあと）です。
  //   ここには「海外↔海外」と「日本↔海外」の2本があり、国内CPU間の1本と合わせて
  //   同じ問いに3つの実装が並んでいました。
  //   在籍25人のまま市場を回すと買う枠が無いので、順番も解雇のあとで正しい。
  return { players: foreignBasePlayers, clubs }
}
