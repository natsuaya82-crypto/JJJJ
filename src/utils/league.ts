// 順位の「唯一の決まり」。
//
// これまで「standings を totalPoints の降順に並べる」処理が、17ファイル・47箇所に
// 手書きされていた。全部が「リーグは1つ」を前提にしているので、部（ディビジョン）を
// 足すと、順位表は3部なのに目標判定は全チーム通し、といったズレが各所から湧く。
// 並べ方も順位の数え方もここ1本に集約する。
//
// ★ 順位を出したくなったら、必ずここの関数を使うこと。sort を新しく書かないこと。

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
