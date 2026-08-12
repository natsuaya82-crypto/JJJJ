import type { SeasonStanding, Division } from '../types'
import { DIVISIONS, rankedStandings, seasonDivisionStandings, rankOfTeam, standingsByDivision } from './league'
import { makeTeamIdAt } from './gmTenure'
import type { GmTenure } from '../types'

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
  /**
   * 優勝（1位）した回数の**合計**。
   * ★**画面に「優勝◯回」とだけ出さないこと**（オーナー・2026-08-12「部ごとです」）。
   *   3部優勝も1部優勝も同じ1回として積まれるので、合計だけ見せると
   *   「3部で4回優勝」が「1部で1回優勝」より上に並ぶ。見せるときは必ず `titles` を使う。
   *   合計は「優勝経験があるか」の判定など、部を問わない場面だけに使う
   */
  championships: number
  /** **部ごとの優勝回数。**画面はこちらを出す（1部★2 2部★1 のように） */
  titles: Partial<Record<Division, number>>
  /** 今つながっている「3位以内」の連続数 */
  currentStreak: number
  /** これまででいちばん長かった「3位以内」の連続数 */
  bestStreak: number
}

/** 成績がまだ無いチーム用。毎回同じ物を返して、画面の作り直しが起きないようにする */
export const EMPTY_TEAM_HISTORY: TeamHistory = Object.freeze({
  seasonResults: [],
  championships: 0,
  titles: {},
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
    for (const { division, rows: sorted } of standingsByDivision(s)) {
      sorted.forEach((st, i) => {
        const rank = i + 1
        let h = out[st.teamId]
        if (!h) { h = { seasonResults: [], championships: 0, titles: {}, currentStreak: 0, bestStreak: 0 }; out[st.teamId] = h }
        h.seasonResults.push({ year: s.year, rank, points: st.totalPoints })
        // ★優勝は**その年いた部**に積む。合計だけだと部が混ざる
        if (rank === 1) { h.championships += 1; h.titles[division] = (h.titles[division] ?? 0) + 1 }
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

/**
 * **監督のキャリアとしての優勝**（どのクラブで何年に優勝したか）。
 *
 *   > クラブの詳細ならクラブ。記録室のGMのページならどのチームで優勝したかを書く
 *   >                                             （オーナー・2026-08-12）
 *
 * ■なぜ要るのか
 *   記録室は**監督の記録**なので、`teamHistoryOf(pastSeasons, playerTeamId)` で
 *   数えてはいけない。いまのクラブのIDで全過去年を数えることになるので、
 *   別のクラブへ移った瞬間に
 *     ・前のクラブで挙げた優勝が消える
 *     ・**自分が指揮していない年の、いまのクラブの優勝が自分のものになる**
 *   という入れ替わりが起きる。その年に指揮していたクラブ（`makeTeamIdAt`）で数える。
 *
 * ★クラブの詳細ページは今までどおり `teamHistoryOf(pastSeasons, そのクラブのid)`。
 *   あちらは**クラブの記録**なので監督は関係ない。**この2つを混ぜないこと。**
 */
export function gmCareerTitles(
  pastSeasons: readonly SeasonStandingsLike[] | undefined,
  tenures: GmTenure[] | undefined,
  playerTeamId: string,
): { byClub: { teamId: string; years: number[] }[]; total: number } {
  const at = makeTeamIdAt(tenures, playerTeamId)
  const map = new Map<string, number[]>()
  for (const s of pastSeasons ?? []) {
    const tid = at(s.year)
    // その年の**自分の部**の1位が自分か。全52チームで並べると部ごとのレース数の差でずれる
    if (rankOfTeam(seasonDivisionStandings(s, tid), tid) !== 1) continue
    const cur = map.get(tid) ?? []
    cur.push(s.year)
    map.set(tid, cur)
  }
  const byClub = [...map.entries()].map(([teamId, years]) => ({ teamId, years: years.sort((a, b) => b - a) }))
  byClub.sort((a, b) => (b.years[0] ?? 0) - (a.years[0] ?? 0))
  return { byClub, total: byClub.reduce((n, c) => n + c.years.length, 0) }
}

/**
 * **優勝の多い順に並べるときの物差し。**1部の優勝が多い順 → 2部 → 3部。
 *
 *   > 3部で4回優勝が1部で1回優勝より上に来るのはおかしい（オーナー・2026-08-12）
 *
 * 合計で並べると部が混ざるので、**上の部から順に比べる**。
 * 並べ替えを画面で書かないこと（同じ並びを何通りも書くと必ず食い違う）。
 */
export function compareTitles(a: TeamHistory['titles'], b: TeamHistory['titles']): number {
  for (const d of DIVISIONS) {
    const diff = (b[d] ?? 0) - (a[d] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 部ごとの優勝を「上の部から」並べて返す（画面はこの順で出す） */
export function titleRows(titles: TeamHistory['titles']): { division: Division; count: number }[] {
  return DIVISIONS.map(d => ({ division: d, count: titles[d] ?? 0 })).filter(r => r.count > 0)
}
