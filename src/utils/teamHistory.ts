import type { SeasonStanding, Division } from '../types'
import { standingsByDivision } from './league'

// チームの成績（過去シーズンの順位・優勝回数・連続上位）を、保存してある順位表から毎回組み立てる。
//
// ■なぜ作り直すのか
//   以前はシーズンが終わるたびに Team.history へ順位・勝ち点・優勝回数・連続記録を書き足していた。
//   だが元になる順位表は過去シーズンに全部残っているので、成績は要るときに数え直せる。
//   同じ情報を二重に持たない方がセーブが軽く、集計のズレも起きない。
//
// ■順位の決め方
//   順位表は部ごとに分けて持っているので、部の中で合計ポイントの多い順に並べて
//   上から1位・2位…とする。取り出しは utils/league.ts の standingsByDivision 1本。
//   「1部で優勝」と「3部で優勝」はどちらもその部の優勝として1回に数える。
//
// ■連続上位
//   3位以内なら1つ増やし、外れたら0に戻す。いちばん長かった数が bestStreak。

/** 1チーム分の成績。セーブには持たず、過去シーズンの順位表から数え直す */
export type TeamHistory = {
  /** 古い年から順に並んだ、その年の順位と勝ち点 */
  seasonResults: { year: number; rank: number; points: number }[]
  /** 優勝（1位）した回数 */
  championships: number
  /** 今つながっている「3位以内」の連続数 */
  currentStreak: number
  /** これまででいちばん長かった「3位以内」の連続数 */
  bestStreak: number
}

/** 成績がまだ無いチーム用。毎回同じ物を返して、画面の作り直しが起きないようにする */
export const EMPTY_TEAM_HISTORY: TeamHistory = Object.freeze({
  seasonResults: [],
  championships: 0,
  currentStreak: 0,
  bestStreak: 0,
}) as TeamHistory

/** 過去シーズンから必要な物だけを受ける */
export type SeasonStandingsLike = {
  year: number
  standings?: Partial<Record<Division, SeasonStanding[]>>
}

/** teamId → そのチームの成績 */
export type TeamHistoryMap = Record<string, TeamHistory>

export function buildTeamHistories(seasons: SeasonStandingsLike[]): TeamHistoryMap {
  const out: TeamHistoryMap = {}
  // 連続記録を数えるので、古い年から順に見る
  const ordered = [...seasons].filter(Boolean).sort((a, b) => a.year - b.year)
  for (const s of ordered) {
    for (const { rows: sorted } of standingsByDivision(s)) {
      sorted.forEach((st, i) => {
        const rank = i + 1
        let h = out[st.teamId]
        if (!h) { h = { seasonResults: [], championships: 0, currentStreak: 0, bestStreak: 0 }; out[st.teamId] = h }
        h.seasonResults.push({ year: s.year, rank, points: st.totalPoints })
        if (rank === 1) h.championships += 1
        h.currentStreak = rank <= 3 ? h.currentStreak + 1 : 0
        if (h.currentStreak > h.bestStreak) h.bestStreak = h.currentStreak
      })
    }
  }
  return out
}

// 画面はチーム成績を何度も読むので、直前の結果を覚えておく。
// 過去シーズンが増えていなければ同じ物を返すので、画面の作り直しも起きない。
let cache: { deps: unknown; value: TeamHistoryMap } | null = null

/** チーム成績をまとめて作る（結果を覚えておく版）。今シーズンはまだ終わっていないので数えない */
export function teamHistoriesOf(pastSeasons: SeasonStandingsLike[]): TeamHistoryMap {
  if (cache && cache.deps === pastSeasons) return cache.value
  const value = buildTeamHistories(pastSeasons)
  cache = { deps: pastSeasons, value }
  return value
}

/** 1チーム分だけ取り出す。まだ成績が無ければ空の成績を返す */
export function teamHistoryOf(pastSeasons: SeasonStandingsLike[], teamId?: string): TeamHistory {
  if (!teamId) return EMPTY_TEAM_HISTORY
  return teamHistoriesOf(pastSeasons)[teamId] ?? EMPTY_TEAM_HISTORY
}
