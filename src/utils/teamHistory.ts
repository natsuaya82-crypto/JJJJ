import type { SeasonStanding, Team } from '../types'
import { seasonStandingsByDivision } from './league'

// チームの成績（過去シーズンの順位・優勝回数・連続上位）を、保存してある順位表から毎回組み立てる。
//
// ■なぜ作り直すのか
//   以前はシーズンが終わるたびに Team.history へ順位・勝ち点・優勝回数・連続記録を書き足していた。
//   だが元になる順位表は過去シーズンに全部残っているので、成績は要るときに数え直せる。
//   同じ情報を二重に持たない方がセーブが軽く、集計のズレも起きない。
//
// ■順位の決め方
//   その年の順位表を**部ごとに分けてから**、合計ポイントの多い順に並べ替えて上から1位・2位…とする。
//   部で分けるのは utils/league.ts の seasonStandingsByDivision 1本に任せる。
//   部ごとにレース数が違う（10 / 8 / 7戦）ので、52チームをまとめて並べると
//   走った数の多い部がそのまま上に来て、優勝回数まで狂う。
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
  standings?: SeasonStanding[]
}

/** 部で分けるのに要るチーム情報（焼き込みの無い古い年の代用に使う） */
export type TeamDivisionLike = Pick<Team, 'id' | 'division'>

/** teamId → そのチームの成績 */
export type TeamHistoryMap = Record<string, TeamHistory>

export function buildTeamHistories(seasons: SeasonStandingsLike[], teams: readonly TeamDivisionLike[]): TeamHistoryMap {
  const out: TeamHistoryMap = {}
  // 連続記録を数えるので、古い年から順に見る
  const ordered = [...seasons].filter(Boolean).sort((a, b) => a.year - b.year)
  for (const s of ordered) {
    for (const sorted of seasonStandingsByDivision(s, teams).values()) {
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
let cache: { deps: unknown; teams: unknown; value: TeamHistoryMap } | null = null

/** チーム成績をまとめて作る（結果を覚えておく版）。今シーズンはまだ終わっていないので数えない */
export function teamHistoriesOf(pastSeasons: SeasonStandingsLike[], teams: readonly TeamDivisionLike[]): TeamHistoryMap {
  if (cache && cache.deps === pastSeasons && cache.teams === teams) return cache.value
  const value = buildTeamHistories(pastSeasons, teams)
  cache = { deps: pastSeasons, teams, value }
  return value
}

/** 1チーム分だけ取り出す。まだ成績が無ければ空の成績を返す */
export function teamHistoryOf(pastSeasons: SeasonStandingsLike[], teams: readonly TeamDivisionLike[], teamId?: string): TeamHistory {
  if (!teamId) return EMPTY_TEAM_HISTORY
  return teamHistoriesOf(pastSeasons, teams)[teamId] ?? EMPTY_TEAM_HISTORY
}
