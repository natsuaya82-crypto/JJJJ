import type { Division, ForeignStanding, SeasonStanding } from '../types'
import {
  DIVISIONS, DIVISION_SIZE, divisionInSeason, divisionStandings,
  domesticThroughRank, rankedStandings, rankOfTeam,
} from './league'

// ============================================================================
// 「そのクラブは今どこにいるか」を引く唯一の入口。国内も海外も同じ。
//
// ■なぜ要るのか
//   順位表の置き場所が2つある（国内 Season.standings は部ごと、海外 foreignStandings は
//   リーグごと）。**行の型はもう1つ**（SeasonStanding・キーは teamId）だが、
//   置き場所は分かれたままなので、読む側がそれを知らずに済むようにここでまとめる。
//
//   もとは行の型まで割れていた（国内 teamId ／ 海外 clubId）。形はまったく同じなのに
//   キー名が違うだけで、読む側は必ず if (isForeign) を書かされ、チーム詳細ページだけで
//   順位・勝ち点・直近フォーム・消化数・歴代順位・優勝回数の6か所が二重になっていた。
//
// ■順位の数え方は国内と海外で違う。それは仕様
//   国内は「通し順位」（1〜52。部 → 部内順位の順に数える）。
//   海外は「そのリーグの中での順位」。リーグ同士の入れ替えが無いので通し順位に意味がない。
//   違うのはそこだけなので、returns の {rank, total} でどちらも同じ形にして返す。
// ============================================================================

/** 順位表の1行のうち、どの画面でも読む部分だけ */
export type ClubStandingRow = {
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
}

/** 順位表を持つシーズン。今シーズンも過去シーズンも同じ形で渡せる */
export type StandingSeasonLike = {
  standings?: Partial<Record<Division, readonly SeasonStanding[]>>
  foreignStandings?: Record<string, ForeignStanding[]>
}

// ── 旧セーブの取り込み（v39より前は行のキーが clubId だった）────────────
//
// 順位表の行は国内も海外も teamId で持つ（SeasonStanding 1つ）。
// v39 より前のセーブは海外だけ clubId で書かれているので、読み込むときに均す。
// **均す場所はここ1本**。移行（migrate）も、別ファイルに出してある過去シーズンの
// 読み戻しも、同じこの関数を通す。片方だけ直すと、archivedYears に入っている年の
// 海外リーグの順位表だけが空になる（順位0・優勝回数0）。

/** 旧形式（clubId）の行を teamId に均す。すでに teamId ならそのまま返す */
export function normalizeStandingRows(rows: readonly unknown[] | undefined): SeasonStanding[] {
  return (rows ?? []).map(row => {
    const { clubId, ...rest } = (row ?? {}) as Record<string, unknown> & { clubId?: string; teamId?: string }
    return { ...rest, teamId: rest.teamId ?? clubId ?? '' } as unknown as SeasonStanding
  })
}

/** リーグID→順位表 をまとめて均す（Season.foreignStandings の形） */
export function normalizeForeignStandings(
  fs: Record<string, readonly unknown[]> | undefined,
): Record<string, SeasonStanding[]> | undefined {
  if (!fs) return undefined
  const out: Record<string, SeasonStanding[]> = {}
  for (const [leagueId, rows] of Object.entries(fs)) out[leagueId] = normalizeStandingRows(rows)
  return out
}

/** そのクラブが海外リーグの順位表に載っているか。載っていればそのリーグID */
export function foreignLeagueOfClub(season: StandingSeasonLike, clubId: string): string | undefined {
  for (const [leagueId, rows] of Object.entries(season.foreignStandings ?? {})) {
    if (rows.some(r => r.teamId === clubId)) return leagueId
  }
  return undefined
}

/**
 * そのクラブの行。国内なら部の順位表から、海外ならリーグの順位表から引く。
 * どちらにも載っていなければ undefined（＝その年は走っていない）。
 */
export function clubStandingRow(season: StandingSeasonLike, clubId: string): ClubStandingRow | undefined {
  for (const d of DIVISIONS) {
    const row = season.standings?.[d]?.find(r => r.teamId === clubId)
    if (row) return row
  }
  for (const rows of Object.values(season.foreignStandings ?? {})) {
    const row = rows.find(r => r.teamId === clubId)
    if (row) return row
  }
  return undefined
}

/**
 * そのクラブの順位と、比べる相手の数。**載っていなければ rank 0。**
 *   国内 … 通し順位（1〜52）。得点で52チームを直接並べてはいけないので domesticThroughRank を通す
 *   海外 … そのリーグの中での順位
 */
export function clubSeasonRank(season: StandingSeasonLike, clubId: string): { rank: number; total: number } {
  const div = divisionInSeason(season as { standings?: Partial<Record<Division, readonly SeasonStanding[]>> }, clubId)
  if (div != null) {
    const at = rankOfTeam(divisionStandings(season as { standings?: Partial<Record<Division, readonly SeasonStanding[]>> }, div), clubId)
    return {
      rank: at === 0 ? 0 : domesticThroughRank(div, at),
      total: DIVISIONS.reduce((n, d) => n + DIVISION_SIZE[d], 0),
    }
  }
  const leagueId = foreignLeagueOfClub(season, clubId)
  if (leagueId == null) return { rank: 0, total: 0 }
  const rows = rankedStandings(season.foreignStandings?.[leagueId] ?? [])
  return { rank: rows.findIndex(r => r.teamId === clubId) + 1, total: rows.length }
}

/** そのクラブが今季消化したレース数。順位表の行に積まれている結果の数で数える */
export function clubRacesDone(season: StandingSeasonLike, clubId: string): number {
  return clubStandingRow(season, clubId)?.raceResults.length ?? 0
}

/** そのクラブがそのリーグ（部）で優勝した年か */
export function clubWonLeague(season: StandingSeasonLike, clubId: string): boolean {
  const { rank } = clubSeasonRank(season, clubId)
  if (rank === 0) return false
  const div = divisionInSeason(season as { standings?: Partial<Record<Division, readonly SeasonStanding[]>> }, clubId)
  // 国内は通し順位なので「部内1位」に直して見る。海外はそのままリーグ1位
  if (div != null) return rank === domesticThroughRank(div, 1)
  return rank === 1
}
