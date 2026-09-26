import type { SeasonStanding, Division, LeagueId } from '../types'
import { divisionOfLeague, leagueLabelOf, normTitleKey, rankOfTeam, seasonLeagueStandings, standingsByLeague, titleKeyLeague, titleKeyOf, titleTier, TOP_DIVISION, type TitleKey } from './league'
import { leagueIdOfClub } from './world'
import { WORLD_LEAGUES } from '../data/leagues'
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
//   順位表はリーグごとに分けて持っているので、リーグの中で合計ポイントの多い順に並べて
//   上から1位・2位…とする。取り出しは utils/league.ts の standingsByLeague 1本（12リーグ全部）。
//   「1部で優勝」と「3部で優勝」と海外リーグの優勝は、それぞれのリーグの優勝として1回に数える。
//
// ■連続上位
//   3位以内なら1つ増やし、外れたら0に戻す。いちばん長かった数が bestStreak。

/** 1チーム分の成績。セーブには持たず、過去シーズンの順位表から数え直す */
export type TeamHistory = {
  /**
   * 古い年から順に並んだ、その年の**部内順位**と勝ち点、そして**どの部にいたか**。
   *
   * ★`rank` は部内順位です。**部をまたいで比べるときは必ず `division` と一緒に使うこと**
   *   （`domesticThroughRank`）。ドラフト順がこれを取り違えていて、前年2部1位で
   *   昇格したクラブが「いちばん成績が良かったクラブ」として全体最後の指名になっていました
   *   （オーナー・2026-08-20）。
   */
  seasonResults: { year: number; rank: number; points: number; leagueId: LeagueId; division?: Division }[]
  /**
   * 優勝（1位）した回数の**合計**。
   * ★**画面に「優勝◯回」とだけ出さないこと**（オーナー・2026-08-12「部ごとです」）。
   *   3部優勝も1部優勝も同じ1回として積まれるので、合計だけ見せると
   *   「3部で4回優勝」が「1部で1回優勝」より上に並ぶ。見せるときは必ず `titles` を使う。
   *   合計は「優勝経験があるか」の判定など、部を問わない場面だけに使う。
   *
   *   ★**数字1つで出すところは、合計ではなく `topTitleCount`（1部だけ）を使う**
   *     （オーナー・2026-08-14「3部の優勝と1部の優勝が並ぶ意味がわからない。
   *     1部だけでいいって判断」）。ホームの「JPEL優勝」・フレンド詳細・GMカードの3か所。
   *     内訳（`titleRows`）を出すのは幅のある記録室・チーム詳細・歴代優勝・記録のハブ。
   */
  championships: number
  /** **リーグごとの優勝回数**（キーは `TitleKey`＝日本の部は部の番号・ほかはリーグID）。画面はこちらを出す */
  titles: Partial<Record<TitleKey, number>>
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
  leagues?: Readonly<Record<LeagueId, { standings?: readonly SeasonStanding[] }>>
}

/** teamId → そのチームの成績 */
export type TeamHistoryMap = Record<string, TeamHistory>

export function buildTeamHistories(seasons: SeasonStandingsLike[]): TeamHistoryMap {
  const out: TeamHistoryMap = {}
  // 連続記録を数えるので、古い年から順に見る
  const ordered = [...seasons].filter(Boolean).sort((a, b) => a.year - b.year)
  for (const s of ordered) {
    for (const { leagueId, rows: sorted } of standingsByLeague(s)) {
      const division = divisionOfLeague(leagueId)
      const key = titleKeyOf(leagueId)
      sorted.forEach((st, i) => {
        const rank = i + 1
        let h = out[st.teamId]
        if (!h) { h = { seasonResults: [], championships: 0, titles: {}, currentStreak: 0, bestStreak: 0 }; out[st.teamId] = h }
        h.seasonResults.push({ year: s.year, rank, points: st.totalPoints, leagueId, ...(division != null ? { division } : {}) })
        // ★優勝は**その年いたリーグ**に積む。合計だけだとリーグが混ざる
        if (rank === 1) { h.championships += 1; h.titles[key] = (h.titles[key] ?? 0) + 1 }
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
): {
  byClub: { teamId: string; wins: { year: number; key: TitleKey }[] }[]
  /** **リーグごとの合計。**画面はこちらを出す（合計だけだと3部優勝と1部優勝が混ざる） */
  titles: Partial<Record<TitleKey, number>>
  total: number
} {
  const at = makeTeamIdAt(tenures, playerTeamId)
  const map = new Map<string, { year: number; key: TitleKey }[]>()
  const titles: Partial<Record<TitleKey, number>> = {}
  for (const s of pastSeasons ?? []) {
    const tid = at(s.year)
    // その年の**自分のリーグ**の1位が自分か（日本の部も海外リーグも同じ）
    const leagueId = leagueIdOfClub(s, tid)
    if (leagueId == null) continue
    if (rankOfTeam(seasonLeagueStandings(s, tid), tid) !== 1) continue
    const key = titleKeyOf(leagueId)
    const cur = map.get(tid) ?? []
    cur.push({ year: s.year, key })
    map.set(tid, cur)
    // ★**リーグごとに積む**（オーナー・2026-08-12「全部部ごとに決まってるやろ」）
    titles[key] = (titles[key] ?? 0) + 1
  }
  const byClub = [...map.entries()].map(([teamId, wins]) => ({ teamId, wins: wins.sort((a, b) => b.year - a.year) }))
  byClub.sort((a, b) => (b.wins[0]?.year ?? 0) - (a.wins[0]?.year ?? 0))
  return { byClub, titles, total: byClub.reduce((n, c) => n + c.wins.length, 0) }
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
  // 頂点（日本1部＋部の無いリーグ）→ 2部 → 3部 の順に比べる
  const byTier = (t: TeamHistory['titles'], tier: Division) =>
    titleRows(t).filter(r => r.tier === tier).reduce((n, r) => n + r.count, 0)
  for (const tier of [TOP_DIVISION, 2, 3] as Division[]) {
    const diff = byTier(b, tier) - byTier(a, tier)
    if (diff !== 0) return diff
  }
  return 0
}

/** 優勝の1行（どこで・何回・段・呼び名） */
export type TitleRow = { key: TitleKey; count: number; tier: Division; label: string }

const LEAGUE_ORDER = new Map(WORLD_LEAGUES.map((l, i) => [l.id, i]))

/**
 * リーグごとの優勝を並べて返す（画面はこの順で出す）。並びは12リーグの並び（日本1部・2部・3部 → 海外）。
 * 呼び名は `leagueLabelOf`（日本の部は「1部」、ほかはリーグ名）
 */
export function titleRows(titles: TeamHistory['titles'] | undefined): TitleRow[] {
  return Object.entries(titles ?? {})
    .map(([k, count]) => ({ key: normTitleKey(k), count: count ?? 0 }))
    .filter(r => r.count > 0)
    .map(r => ({ ...r, tier: titleTier(r.key), label: leagueLabelOf(titleKeyLeague(r.key)) }))
    .sort((a, b) => (LEAGUE_ORDER.get(titleKeyLeague(a.key)) ?? 99) - (LEAGUE_ORDER.get(titleKeyLeague(b.key)) ?? 99))
}

/**
 * **「◯回」と1つの数で出すときの優勝回数＝頂点のリーグの優勝だけ**（日本1部と、部の無いリーグ＝海外）。
 *
 * ★オーナー判断（2026-08-14）「3部の優勝と1部の優勝が並ぶ意味がわからない。
 *   1部だけでいいって判断」。**全部の部を足さないこと**——3部優勝2回と
 *   1部優勝2回が同じ「2回」になるのが、そもそも部ごとに分けた理由だった。
 *   足すのをやめて、下の部を数えないことで解決している。海外リーグは下に部が無いので頂点。
 *
 * ★使うのは**ホームとフレンドから見えるところだけ**（ホームの優勝・
 *   フレンド詳細・GMカード）。記録室・チーム詳細・歴代優勝・記録のハブは
 *   リーグごとのまま（`titleRows`）＝自分の歴史としては3部優勝も残す。
 */
export function topTitleCount(titles: TeamHistory['titles'] | undefined): number {
  return titleRows(titles).filter(r => r.tier === TOP_DIVISION).reduce((n, r) => n + r.count, 0)
}
