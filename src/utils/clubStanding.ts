import type { Division, ForeignStanding, SeasonStanding } from '../types'
import {
  DIVISIONS, DIVISION_SIZE, divisionInSeason, divisionStandings,
  domesticThroughRank, rankedStandings, rankOfTeam,
} from './league'

// ============================================================================
// 「そのクラブは今どこにいるか」を引く唯一の入口。国内も海外も同じ。
//
// ■なぜ要るのか
//   順位表の置き場所が2つある。
//     ・国内 … Season.standings      : Record<部, SeasonStanding[]>   （行のキーは teamId）
//     ・海外 … Season.foreignStandings: Record<リーグID, ForeignStanding[]>（行のキーは clubId）
//   形はまったく同じ（リーグ単位で分けた表）なのに、行のキー名が違うだけで
//   読む側は必ず if (isForeign) を書くことになっていた。チーム詳細ページだけで
//   順位・勝ち点・直近フォーム・消化数・歴代順位・優勝回数の6か所が二重になり、
//   片方だけ直したときのズレ（2部の首位が9位と出る類）が繰り返し出た。
//
//   置き場所そのものを1つに畳むのはセーブの移行が要る。**読み方だけ先に1本にする。**
//   ここを通していれば、あとで置き場所を畳んでも呼ぶ側は書き換えずに済む。
//
// ■順位の数え方は国内と海外で違う。それは仕様
//   国内は「通し順位」（1〜52。部 → 部内順位の順に数える）。
//   海外は「そのリーグの中での順位」。リーグ同士の入れ替えが無いので通し順位に意味がない。
//   違うのはそこだけなので、returns の {rank, total} でどちらも同じ形にして返す。
// ============================================================================

/** 順位表の1行。国内(SeasonStanding)・海外(ForeignStanding)のどちらでも共通に読める部分だけ */
export type ClubStandingRow = {
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
}

/** 順位表を持つシーズン。今シーズンも過去シーズンも同じ形で渡せる */
export type StandingSeasonLike = {
  standings?: Partial<Record<Division, readonly SeasonStanding[]>>
  foreignStandings?: Record<string, ForeignStanding[]>
}

/** そのクラブが海外リーグの順位表に載っているか。載っていればそのリーグID */
export function foreignLeagueOfClub(season: StandingSeasonLike, clubId: string): string | undefined {
  for (const [leagueId, rows] of Object.entries(season.foreignStandings ?? {})) {
    if (rows.some(r => r.clubId === clubId)) return leagueId
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
    const row = rows.find(r => r.clubId === clubId)
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
  return { rank: rows.findIndex(r => r.clubId === clubId) + 1, total: rows.length }
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
