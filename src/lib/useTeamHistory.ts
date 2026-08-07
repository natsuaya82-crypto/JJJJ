import { useGameStore } from '../store/gameStore'
import { teamHistoriesOf, teamHistoryOf, type TeamHistory, type TeamHistoryMap } from '../utils/teamHistory'

// チームの成績（順位・優勝回数・連続上位）を画面から読むためのフック。
// 成績はセーブに持たず、保存してある過去シーズンの順位表から数え直す（utils/teamHistory.ts）。
// 中身が変わらない限り同じ物を返すので、これで再描画が増えることはない。

/** 全チーム分をまとめて */
export function useTeamHistories(): TeamHistoryMap {
  return useGameStore(s => teamHistoriesOf(s.pastSeasons, s.teams))
}

/** 1チーム分だけ */
export function useTeamHistory(teamId?: string): TeamHistory {
  return useGameStore(s => teamHistoryOf(s.pastSeasons, s.teams, teamId))
}
