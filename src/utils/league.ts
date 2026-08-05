// 順位の「唯一の決まり」。
//
// これまで「standings を totalPoints の降順に並べる」処理が、17ファイル・47箇所に
// 手書きされていた。全部が「リーグは1つ」を前提にしているので、部（ディビジョン）を
// 足すと、順位表は3部なのに目標判定は全チーム通し、といったズレが各所から湧く。
// 並べ方も順位の数え方もここ1本に集約する。
//
// ★ 順位を出したくなったら、必ずここの関数を使うこと。sort を新しく書かないこと。

// ── 部（ディビジョン）─────────────────────────────────────────
//
// JPELは1部・2部・3部の3階層。所属は Team.division が持つが、build 88 までのセーブには
// このフィールドが無い。読む側が team.division を直接見ると、古いセーブで undefined になって
// 「どの部にも属さないチーム」が生まれ、順位表からもレースからも消える。
// 必ず divisionOf() を通すこと。

import type { Division, Team } from '../types'

/** 上から順。表示の並びもこの順 */
export const DIVISIONS: readonly Division[] = [1, 2, 3]

/** 各部のチーム数。ここを変えるとレースの順位ポイントの上限も変わる */
export const DIVISION_SIZE: Record<Division, number> = { 1: 20, 2: 16, 3: 16 }

/** 各部の年間レース数 */
export const DIVISION_RACES: Record<Division, number> = { 1: 10, 2: 8, 3: 7 }

export const DIVISION_LABEL: Record<Division, string> = { 1: '1部', 2: '2部', 3: '3部' }

/**
 * 昇格・降格の枠。各部の上位n が昇格、下位n が降格。
 * 1部に上は無く、3部に下は無い。
 */
export const PROMOTION_SLOTS = 2

/** そのチームの部。未設定（古いセーブ・旧データ）は1部として扱う */
export function divisionOf(team: Pick<Team, 'division'> | undefined): Division {
  return team?.division ?? 1
}

/** 指定した部に所属するチームだけを返す */
export function teamsInDivision<T extends Pick<Team, 'division'>>(teams: readonly T[], division: Division): T[] {
  return teams.filter(t => divisionOf(t) === division)
}

/** 順位を出せる行。国内の SeasonStanding も海外の順位表も totalPoints を持つ */
export type RankableRow = { totalPoints: number }

/**
 * 得点の多い順に並べる。元の配列は変えない。
 *
 * 同点の扱いは「元の並び順のまま」。Array#sort は安定ソートなので、
 * standings の並び（＝チームの登録順）が同点時のタイブレークになる。
 * 置き換える前の手書き47箇所も全部これと同じ挙動だったので、結果は変わらない。
 */
export function rankedStandings<T extends RankableRow>(rows: readonly T[] | undefined): T[] {
  const copy = (rows ?? []).slice()
  copy.sort((a, b) => b.totalPoints - a.totalPoints)
  return copy
}

/**
 * そのチームの順位（1始まり）。順位表にいなければ 0。
 *
 * 呼び出し側で `.findIndex(...) + 1` と書くと、いなかったときに 0 になるのか
 * それとも -1 + 1 = 0 で偶然そうなっているのかが読めない。ここで意味を固定する。
 */
export function rankOfTeam(rows: readonly { teamId: string; totalPoints: number }[] | undefined, teamId: string): number {
  return rankedStandings(rows).findIndex(r => r.teamId === teamId) + 1
}

/** 年間王者の行。1戦もしていなければ全員0点なので、先頭のチームが返る */
export function championRow<T extends RankableRow>(rows: readonly T[] | undefined): T | undefined {
  return rankedStandings(rows)[0]
}

/** 上位n行。ECLの出場枠（各リーグ上位2）のように「上からいくつ」を取るとき用 */
export function topRows<T extends RankableRow>(rows: readonly T[] | undefined, n: number): T[] {
  return rankedStandings(rows).slice(0, n)
}

// ── 順位ポイント ─────────────────────────────────────────────
//
// 「1位=参加チーム数ぶん、以下1点ずつ減って最下位が1点」。
// これまで `Math.max(0, 21 - rank)` が raceEngine.ts と RacePage.tsx に2つコピーされていた。
// 21 は「20チーム＋1」の直書きで、参加チーム数が変わると点の付き方が壊れる。
/**
 * 順位ポイント。
 * @param teamCount そのレースに出たチーム数
 * @param rank 1始まりの着順
 */
export function positionPointsFor(teamCount: number, rank: number): number {
  return Math.max(0, teamCount + 1 - rank)
}

// ── ドラフトの巡目 ─────────────────────────────────────────────
//
// これまで `currentPick < 20 ? 1 : 2` と `(currentPick % 20) + 1` が
// gameStore と DraftRoom の計5箇所に直書きされていた。20 は「参加チーム数」の
// 決め打ちで、チーム数が変わると巡目も巡内順位も全部ずれる。
// 1巡の人数は指名順リスト（pickOrder）の長さから出す。

/** ドラフトの巡数。スネーク方式で pickOrder はこの倍数の長さになる */
export const DRAFT_ROUNDS = 2

/**
 * 何巡目の何番目の指名か。
 * @param pickIndex 0始まりの通し番号
 * @param pickOrderLength 指名順リストの長さ（＝参加チーム数 × DRAFT_ROUNDS）
 */
export function draftRoundOf(pickIndex: number, pickOrderLength: number): { round: number; pickInRound: number } {
  const perRound = Math.max(1, Math.round(pickOrderLength / DRAFT_ROUNDS))
  return {
    round: Math.floor(pickIndex / perRound) + 1,
    pickInRound: (pickIndex % perRound) + 1,
  }
}
