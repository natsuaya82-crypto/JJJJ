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

/** 最上位の部。ECLの出場枠や「JPELの王者」はここから出す */
export const TOP_DIVISION: Division = 1

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

/**
 * 部内順位 → 国内通し順位（1〜52）。1部1位＝1位、2部1位＝21位、3部最下位＝52位。
 *
 * ★これは**格を決めるためだけの内部の数**。**画面には絶対に出さないこと。**
 *   遊ぶ側にあるのは1部・2部・3部それぞれの中での順位だけで、「47位」「52位」には
 *   意味が無い（部をまたいだ順位という考え方自体が無い）。画面に出す順位は
 *   `utils/clubStanding` の `clubSeasonRank`（部内順位＋どの部か）1本。
 *   `scripts/check-single-source.ts` が src/components/ での使用を見張る。
 *
 * クラブの格はこの通し順位で決まる（utils/clubTier.ts の tierFromDomesticRank）。
 * 順位表の得点で全52チームを並べてはいけない。部ごとにレース数が違う（10/8/7戦）ので、
 * 得点で通すと3部の上位が2部を追い抜く。
 */
export function domesticThroughRank(division: Division, rankInDivision: number): number {
  let offset = 0
  for (const d of DIVISIONS) {
    if (d === division) break
    offset += DIVISION_SIZE[d]
  }
  return offset + Math.max(1, rankInDivision)
}

/** 指定した部に所属するチームだけを返す */
export function teamsInDivision<T extends Pick<Team, 'division'>>(teams: readonly T[], division: Division): T[] {
  return teams.filter(t => divisionOf(t) === division)
}

/**
 * ドラフトに参加できるのは1部のクラブだけ。ここが唯一の決まり。
 *
 * 指名されなかった候補はFAになるので、2部・3部はそこから拾う。
 * 「今年は指名できるか」を各所で書き分けないこと（指名順・画面の出し分けとも必ずここを見る）。
 */
export const DRAFT_DIVISION: Division = 1
export function joinsDraft(team: Pick<Team, 'division'> | undefined): boolean {
  return divisionOf(team) === DRAFT_DIVISION
}

// ── 区間賞の賞金 ──────────────────────────────────────────────
//
// 各区間の上位3人にクラブへ賞金が入る。**自チームもCPUも同じ額**。
// 以前は自チームぶんだけ gameStore の中で数えていて、CPUには1円も入らなかった
// （年に数千万の非対称）。誰の分でも同じ関数で数える。
export const SEGMENT_PRIZE = [5_000_000, 3_000_000, 1_500_000]

/** 1レースの結果から、クラブID→区間賞賞金 を数える */
export function segmentPrizeByTeam(
  segmentResults: readonly { runners: readonly { teamId: string; rank: number }[] }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const sr of segmentResults) {
    for (const r of sr.runners) {
      const prize = r.rank >= 1 && r.rank <= SEGMENT_PRIZE.length ? SEGMENT_PRIZE[r.rank - 1] : 0
      if (prize > 0) out[r.teamId] = (out[r.teamId] ?? 0) + prize
    }
  }
  return out
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

/** 順位を出すのに要るものだけ。今シーズンも過去シーズンも同じ形で渡せる */
export type SeasonStandingsLike<T extends RankableRow & { teamId: string }> = {
  standings?: Partial<Record<Division, readonly T[]>>
}

/**
 * その部の順位表（得点順）。**順位を出すのはここ1本。**
 *
 * 順位表は部ごとに分けて持っている（`Season.standings`）ので、ここは取り出して並べるだけ。
 * 部をまたいで並べる関数は用意しない。レース数が違う（10 / 8 / 7戦）ので、
 * 勝ち点を部をまたいで比べること自体に意味が無い。
 */
export function divisionStandings<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
  division: Division,
): T[] {
  return rankedStandings(season.standings?.[division])
}

/**
 * その年、そのチームがどの部で走ったか。順位表に載っていなければ undefined。
 *
 * 部が順位表のキーそのものなので、昇降格しても過去の年が狂わない
 * （いまの `Team.division` を過去の年に当てはめる必要がない）。
 */
export function divisionInSeason(
  season: SeasonStandingsLike<RankableRow & { teamId: string }>,
  teamId: string,
): Division | undefined {
  for (const d of DIVISIONS) {
    if (season.standings?.[d]?.some(r => r.teamId === teamId)) return d
  }
  return undefined
}

/** そのチームが走った部の順位表（得点順）。載っていなければ空 */
export function seasonDivisionStandings<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
  teamId: string,
): T[] {
  const d = divisionInSeason(season, teamId)
  return d == null ? [] : divisionStandings(season, d)
}

/** その年のそのチームの行（どの部にいたかを気にせず引く）。無ければ undefined */
export function standingRowOf<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
  teamId: string,
): T | undefined {
  for (const d of DIVISIONS) {
    const row = season.standings?.[d]?.find(r => r.teamId === teamId)
    if (row) return row
  }
  return undefined
}

/** 部ごとの順位表をまとめて（得点順）。全チームぶんの成績を数え直すときに使う */
export function standingsByDivision<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
): { division: Division; rows: T[] }[] {
  return DIVISIONS.map(d => ({ division: d, rows: divisionStandings(season, d) }))
}

/** 空の順位表（部ごとの箱だけ作る）。作る側はここを通す */
export function emptyStandings<T>(): Record<Division, T[]> {
  return Object.fromEntries(DIVISIONS.map(d => [d, [] as T[]])) as Record<Division, T[]>
}

/**
 * シーズン開始時の順位表を、チーム一覧から部ごとに作る。**作る場所はここ1本。**
 * 部の割り振りをここでやってしまうので、あとから「どの部だったか」を推測する必要がない。
 */
export function newSeasonStandings<T>(
  teams: readonly Pick<Team, 'id' | 'division'>[],
  makeRow: (teamId: string) => T,
): Record<Division, T[]> {
  const out = emptyStandings<T>()
  for (const t of teams) out[divisionOf(t)].push(makeRow(t.id))
  return out
}

/**
 * 順位表の行を「いまの Team.division」の側へ並べ直す。**部を動かしたら必ずここを通すこと。**
 *
 * 順位表は部ごとに分けて持つ（`Record<Division, 行[]>`）ので、**部そのものがキー**になっている。
 * チームの部を動かしておいて順位表を作り直さないと、
 *   ・走る部（`divisionOf` ＝ Team.division）と、順位表に載っている部（`divisionInSeason`
 *     ＝ 順位表のキー）が食い違う
 *   ・走った結果の書き込み先に自分の行が無いので、**点がどこにも入らない**
 *   ・自分の部は裏レースの対象外なのに、順位表の側の部は裏で走り続ける
 * という状態になる。build 110 まで、チーム選択（`startSetup`）がまさにこれだった。
 * 選んだクラブを列の最後尾へ回して部を動かしているのに順位表は元の部のままで、
 * 2部のクラブを選ぶと自分だけ0ptのまま・元の2部が裏で走り続けていた。
 *
 * 行が無いチームには `makeRow` で作る。居なくなったチームの行は落とす。
 */
export function reconcileStandingsDivisions<T extends { teamId: string }>(
  standings: Record<Division, T[]> | undefined,
  teams: readonly Pick<Team, 'id' | 'division'>[],
  makeRow: (teamId: string) => T,
): Record<Division, T[]> {
  const rows = new Map<string, T>()
  for (const d of DIVISIONS) for (const r of standings?.[d] ?? []) rows.set(r.teamId, r)
  const out = emptyStandings<T>()
  for (const t of teams) out[divisionOf(t)].push(rows.get(t.id) ?? makeRow(t.id))
  return out
}

/**
 * 各部の人数を 20 / 16 / 16 に戻す。**部の人数を直す入口はここ1本。**
 *
 * 部そのものが順位表のキーなので、人数が狂うと
 *   ・`divisionOf` は部を持たないチームを全部1部に入れる（既定値が1）
 *   ・`domesticThroughRank` に上限は無いので、膨らんだ1部では21位・22位…が出る
 * となり、3部のクラブが「通し順位23位」のように別の部の順位で表示される。
 * 昇降格も上下2ずつなので、一度狂うと二度と戻らない。
 *
 * 並びは「いまの部 → その部での順位」を保つので、正しいセーブでは何も動かない。
 *
 * `pin` を渡したクラブは**いまの部から動かさない**。人数を詰め直すと、空いている部へ
 * 上から順に吸い上げられる。自チームはどのクラブを選んでも3部から始まり、部が動くのは
 * 昇降格だけなので、つじつま合わせで勝手に昇格させてはいけない。
 *
 * @param rankOf 小さいほど上。順位表があればその順位、無ければ initialRank を渡す
 * @param pin その部から動かさないクラブ（自チーム）
 */
export function rebalanceDivisions<T extends Pick<Team, 'id' | 'division'>>(
  teams: readonly T[],
  rankOf: (team: T) => number,
  pin?: (team: T) => boolean,
): T[] {
  const total = DIVISIONS.reduce((n, d) => n + DIVISION_SIZE[d], 0)
  // 人数が合っているか、そもそも52クラブ揃っていないセーブには手を出さない
  if (teams.length !== total) return [...teams]
  if (DIVISIONS.every(d => teams.filter(t => divisionOf(t) === d).length === DIVISION_SIZE[d])) return [...teams]

  const placed = new Map<string, Division>()
  const left: Record<Division, number> = { 1: DIVISION_SIZE[1], 2: DIVISION_SIZE[2], 3: DIVISION_SIZE[3] }
  // 動かさないクラブを先に席へ着かせる（枠を先に押さえる）
  for (const t of teams) {
    if (!pin?.(t)) continue
    const d = divisionOf(t)
    if (left[d] <= 0) continue
    placed.set(t.id, d)
    left[d]--
  }
  const ordered = [...teams]
    .filter(t => !placed.has(t.id))
    .sort((a, b) => divisionOf(a) - divisionOf(b) || rankOf(a) - rankOf(b))
  let i = 0
  for (const d of DIVISIONS) for (let n = 0; n < left[d]; n++) placed.set(ordered[i++].id, d)
  return teams.map(t => ({ ...t, division: placed.get(t.id) ?? divisionOf(t) }))
}

/** 順位表の1行。得点は positionPoints + segmentPoints（utils/league の配点1本） */
type StandingRow = {
  teamId: string
  leaguePoints?: number
  segmentPoints?: number
  totalPoints: number
  raceResults: { raceId: string; rank: number; points: number }[]
}
/** 走り終わったレース。結果はセーブに残っているので、点はここから数え直せる */
type RanRace = {
  id: string
  results?: { teamRankings?: { teamId: string; rank: number; positionPoints: number; segmentPoints: number }[] }
}

/**
 * 自分の部の順位表を、**保存してあるレース結果から数え直す**。
 *
 * 通算成績（出走数・区間賞）を貯めるのをやめて保存済みのレース結果から出す形にしたのと同じ理由。
 * 貯める形だと、書き込み先を1回でも取り違えた瞬間に点が永久に消え、あとから直しようがない。
 * 結果さえ残っていれば何度でも同じ数字が出る。
 */
export function divisionStandingsFromRaces(
  rows: readonly StandingRow[],
  races: readonly RanRace[],
): StandingRow[] {
  return rows.map(row => {
    let r: StandingRow = { teamId: row.teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] }
    for (const race of races) {
      const tr = race.results?.teamRankings?.find(x => x.teamId === row.teamId)
      if (!tr) continue
      const earned = tr.positionPoints + tr.segmentPoints
      r = {
        teamId: row.teamId,
        leaguePoints: (r.leaguePoints ?? 0) + tr.positionPoints,
        segmentPoints: (r.segmentPoints ?? 0) + tr.segmentPoints,
        totalPoints: r.totalPoints + earned,
        raceResults: [...r.raceResults, { raceId: race.id, rank: tr.rank, points: earned }],
      }
    }
    // 1本も走っていない部（シーズン頭）は、いま持っている行のまま
    return r.raceResults.length > 0 ? r : row
  })
}

/**
 * 順位表をチームの部に合わせる。**順位表を触る入口はここ1本。**
 *
 * 1. 行を「いまの Team.division」の側へ並べ直す
 * 2. 自分の部だけ、走り終わったレースの結果から点を数え直す
 *
 * 起動時（persist の merge）とチーム選択（startSetup）の両方から呼ぶ。
 * 何度呼んでも同じ結果になるので、壊れたセーブは開き直すだけで直る。
 */
export function syncSeasonStandings(params: {
  standings: Record<Division, StandingRow[]> | undefined
  races: readonly RanRace[] | undefined
  teams: readonly Pick<Team, 'id' | 'division'>[]
  playerTeamId: string | undefined
}): Record<Division, StandingRow[]> {
  const { standings, races, teams, playerTeamId } = params
  const fixed = reconcileStandingsDivisions(standings, teams, teamId => ({
    teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
  }))
  // ★自チームが見つからないときに `divisionOf(undefined)` の既定値（1部）へ落ちないこと。
  //   落ちると1部だけ数え直し、自分の部の点はいつまでも0のまま＝直したつもりで直らない。
  const me = teams.find(t => t.id === playerTeamId)
  if (!me) return fixed
  const myDiv = divisionOf(me)
  return { ...fixed, [myDiv]: divisionStandingsFromRaces(fixed[myDiv], races ?? []) }
}

/**
 * 国内クラブの「通し順位」（1〜52）。部内順位を出してから domesticThroughRank へ通す。
 * **順位表の得点で52チームを直接並べてはいけない**（部ごとにレース数が10/8/7と違うので
 * 3部が2部を追い抜く）。チーム詳細の順位・歴代成績もここを通すこと。
 */
export function domesticThroughRankOfTeam(
  season: SeasonStandingsLike<RankableRow & { teamId: string }>,
  teamId: string,
): number {
  const div = divisionInSeason(season, teamId)
  if (div == null) return 0
  const at = rankOfTeam(divisionStandings(season, div), teamId)
  return at === 0 ? 0 : domesticThroughRank(div, at)
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
  // 1位＝出走クラブ数、2位＝それ-1、…、最下位＝1点。0点は出さない
  return Math.max(1, teamCount + 1 - rank)
}

/**
 * 区間賞のポイント。**本編もオンラインもここ1本。**
 *
 * ■人数で変える
 *   2チームしか出ていないレースで1位に3点は多すぎる（相手1人に勝っただけ）。
 *   出走数が少ないほど配る点も減らす。
 *     15チーム以上 … 3 / 2 / 1
 *      9〜14チーム … 2 / 1
 *      それ未満    … 1位に1点だけ
 *
 * ■本編の点は変わらない
 *   本編で1レースに出るのは 1部20 / 2部16 / 3部16 / 海外リーグ20 / ECL16 /
 *   世界選手権16 / アジア予選21 / 大陸予選16 で、**全部15以上**。
 *   よってどのレースでも 3/2/1 になり、これまで raceEngine に直書きしてあった値と一致する。
 *   人数で減るのが効くのはオンライン対戦（2〜8人）だけ。
 *
 * ★以前は raceEngine が「常に3/2/1」を直書きし、lib/matchSim がこの表を別に持っていた。
 *   さらに matchSim は simulateRace が返した点を捨てて自分で計算し直していた。
 */
export function segmentAwardPoints(teamCount: number, rank: number): number {
  if (teamCount >= 15) return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0
  if (teamCount >= 9) return rank === 1 ? 2 : rank === 2 ? 1 : 0
  return rank === 1 ? 1 : 0
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
