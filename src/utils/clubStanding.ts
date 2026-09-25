import type { Division, LeagueId, SeasonStanding } from '../types'
import {
  DIVISIONS, DIVISION_SIZE, divisionOfLeague,
  domesticThroughRank, rankedStandings, rankOfTeam,
} from './league'
import { leagueIdOfClub } from './world'

// ============================================================================
// 「そのクラブは今どこにいるか」を引く唯一の入口。国内も海外も同じ。
//
// ■なぜ要るのか
//   順位表はリーグごとに持つ（`Season.leagues`・国内の部も海外リーグも同じ形）。
//   読む側が「どのリーグか」を知らずに済むようにここでまとめる。
//
//   もとは置き場所も行の型も割れていた（国内 Season.standings は部ごと・キー teamId ／
//   海外 foreignStandings・キー clubId）。読む側は必ず if (isForeign) を書かされ、
//   チーム詳細ページだけで順位・勝ち点・直近フォーム・消化数・歴代順位・優勝回数の
//   6か所が二重になっていた。
//
// ■順位は「その集団の中での順位」1本。国内も海外も同じ
//   国内は部の中での順位（1部1〜20／2部・3部1〜16）、海外はリーグの中での順位。
//   **通し順位（1〜52）は返さない。** あれは格を決めるためだけの内部の数で、
//   画面に出すと「47位」「52位」のような、遊ぶ側にとって意味の無い数になる。
//   部をまたいだ順位という考え方は無く、あるのは1部・2部・3部の中の順位だけ。
//   returns は {rank, total, division} で国内も海外も同じ形。
// ============================================================================

/** 順位表の1行のうち、どの画面でも読む部分だけ */
export type ClubStandingRow = {
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
}

/** 順位表を持つシーズン。今シーズンも過去シーズンも同じ形で渡せる */
export type StandingSeasonLike = {
  leagues?: Readonly<Record<LeagueId, { standings?: readonly SeasonStanding[] }>>
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

/** リーグID→順位表 をまとめて均す（旧セーブの海外リーグの順位表の形） */
export function normalizeForeignStandings(
  fs: Record<string, readonly unknown[]> | undefined,
): Record<string, SeasonStanding[]> | undefined {
  if (!fs) return undefined
  const out: Record<string, SeasonStanding[]> = {}
  for (const [leagueId, rows] of Object.entries(fs)) out[leagueId] = normalizeStandingRows(rows)
  return out
}

/**
 * そのクラブの行。そのクラブが載っているリーグ（国内の部でも海外でも同じ）の順位表から引く。
 * どこにも載っていなければ undefined（＝その年は走っていない）。
 */
export function clubStandingRow(season: StandingSeasonLike, clubId: string): ClubStandingRow | undefined {
  const id = leagueIdOfClub(season, clubId)
  return id == null ? undefined : season.leagues?.[id]?.standings?.find(r => r.teamId === clubId)
}

/**
 * そのクラブの順位と、比べる相手の数。**載っていなければ rank 0。**
 *
 * ★国内は**その部の中での順位**（1部なら1〜20、2部・3部なら1〜16）。
 *   通し順位（1〜52）は返さない。あれは格を決めるためだけの内部の数で、
 *   画面に出すものではない（`utils/league` の `domesticThroughRank` の注意書きを参照）。
 *   「47位」「52位」のような、遊ぶ側にとって意味の無い数が出ていた。
 *   部をまたいだ順位という考え方は無く、あるのは1部・2部・3部の中の順位だけ。
 *
 * 海外はそのリーグの中での順位。国内と同じ「所属する集団の中での順位」なので形は同じ。
 * `division` は国内のときだけ入る（画面で「3部 5位」と出せるように）。
 */
export function clubSeasonRank(
  season: StandingSeasonLike,
  clubId: string,
): { rank: number; total: number; division?: Division } {
  const id = leagueIdOfClub(season, clubId)
  if (id == null) return { rank: 0, total: 0 }
  const rows = rankedStandings(season.leagues?.[id]?.standings ?? [])
  const division = divisionOfLeague(id)
  if (division != null) return { rank: rankOfTeam(rows, clubId), total: rows.length || DIVISION_SIZE[division], division }
  return { rank: rows.findIndex(r => r.teamId === clubId) + 1, total: rows.length }
}

/** そのクラブが今季消化したレース数。順位表の行に積まれている結果の数で数える */
export function clubRacesDone(season: StandingSeasonLike, clubId: string): number {
  return clubStandingRow(season, clubId)?.raceResults.length ?? 0
}

/** そのクラブがそのリーグ（部）で優勝した年か。国内も海外も「その集団の1位」1本 */
export function clubWonLeague(season: StandingSeasonLike, clubId: string): boolean {
  return clubSeasonRank(season, clubId).rank === 1
}

// ============================================================================
// 歴代成績のグラフの縦軸（国内）
// ============================================================================
//
// **1本の物差しに全部載せる。上が1部1位、下が3部最下位。**
//
//   > 1番下が3部の最下位で1番上が1部の上になるようにして欲しいの（オーナー・2026-08-12）
//
// ■なぜ要るのか
//   以前は「その部の中での順位」をそのまま高さにしていたので、**1部5位と3部5位が
//   同じ高さ**に描かれていました。昇降格した年に線が繋がると、上がったのか下がったのか
//   まったく分かりません（部の変わり目に縦の点線を入れて誤魔化していた）。
//   1本の物差しに載せれば、昇格した年は線がそのまま上へ伸びます。
//
// ■画面に出すのは「部内順位」のままです
//   通し順位（1〜52）は格を決めるための内部の数なので**表示はしません**（CLAUDE.md）。
//   ここが返すのは**高さ（0〜1）だけ**で、数字ではありません。
//   `npm run check` が `src/components/` での `domesticThroughRank` を見張っているので、
//   高さの計算はこの1本を通してください（画面で通し順位を組み立てないこと）。

/** その部・その順位が縦軸のどこに来るか。**0 = 1部1位（上）／1 = 3部最下位（下）** */
export function divisionAxisPos(division: Division, rankInDivision: number): number {
  const total = DIVISIONS.reduce((n, d) => n + DIVISION_SIZE[d], 0)
  return (domesticThroughRank(division, rankInDivision) - 1) / (total - 1)
}

/**
 * 部の切れ目（横の点線を引く高さ）と、その帯がどの部か。
 * **帯の広さは部のクラブ数に比例**します（1部20／2部16／3部16）。
 */
export function divisionAxisBands(): { division: Division; top: number; bottom: number }[] {
  return DIVISIONS.map(d => ({
    division: d,
    top: divisionAxisPos(d, 1),
    bottom: divisionAxisPos(d, DIVISION_SIZE[d]),
  }))
}
