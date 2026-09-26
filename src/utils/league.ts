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

import type { Division, LeagueId, LeagueSeason, Race, SeasonStanding, Team, WorldClub } from '../types'
import { clubById, clubsInLeague, clubsWhere, divisionLeagueId, divisionOfLeague, jpelClubs, leagueIdOfClub, mapClubs } from './world'
import { holdsDraftPicks, leagueRules } from '../data/leagueRules'
import { leagueById, WORLD_LEAGUES } from '../data/leagues'

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
 * **リーグの呼び名**（日本の部は「1部」、ほかはリーグ名）。見出し・表彰・クラブの呼び名に添える字は
 * どのリーグでもここ1本。部（`divisionOf`）で引かないこと——部に居ないクラブは1部と読まれる
 */
export function leagueLabelOf(leagueId: LeagueId | string | null | undefined): string {
  const d = divisionOfLeague(leagueId as LeagueId)
  if (d != null) return DIVISION_LABEL[d]
  return leagueById(leagueId as LeagueId)?.name ?? ''
}

/**
 * 昇格・降格の枠。各部の上位n が昇格、下位n が降格。
 * 1部に上は無く、3部に下は無い。
 */
export const PROMOTION_SLOTS = 2

/**
 * そのクラブの部。**所属は `club.leagueId` 1本**（`jpel-<部>`）で、部はそこから読む。
 * 日本のリーグでないクラブ（海外）と、見つからないクラブは1部として扱う（以前の既定値のまま）
 */
export function divisionOf(team: { leagueId?: string } | undefined): Division {
  return divisionOfLeague(team?.leagueId) ?? 1
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

// ── リーグID（国内の部）──────────────────────────────────────
//
// 日程・結果・順位表は `Season.leagues`（リーグID → そのリーグ）に入っている。
// 国内の部もリーグの1つで、IDは `jpel-<部>`。海外は `ForeignLeague.id` そのもの。
// **クラブの所属（`club.leagueId`）もこのIDそのもの**（国内の部も海外も同じ）。
// 部番号とリーグIDの対応は `utils/world` の `divisionLeagueId` / `divisionOfLeague` 1本（ここは写すだけ）。
export { divisionLeagueId, divisionOfLeague } from './world'

/** そのリーグの日程（結果つき）。無ければ空 */
export function leagueRaces(
  season: { leagues?: Readonly<Record<LeagueId, Pick<LeagueSeason, 'races'>>> } | null | undefined,
  leagueId: LeagueId | null | undefined,
): Race[] {
  return leagueId == null ? [] : season?.leagues?.[leagueId]?.races ?? []
}

/** そのリーグの順位表の行（登録順のまま。順位は `rankedStandings` で出す）。無ければ空 */
export function leagueStandingRows(
  season: { leagues?: Readonly<Record<LeagueId, Pick<LeagueSeason, 'standings'>>> } | null | undefined,
  leagueId: LeagueId | null | undefined,
): SeasonStanding[] {
  return leagueId == null ? [] : season?.leagues?.[leagueId]?.standings ?? []
}

/**
 * 部ごとの日程と順位表から、国内3部ぶんのリーグを作る。**作る場所はここ1本。**
 * 海外リーグは `engine/leagueDay` の `withCopiedSchedules` が足す。
 */
export function divisionLeagues(
  schedules: Partial<Record<Division, Race[]>>,
  standings: Record<Division, SeasonStanding[]>,
): Record<LeagueId, LeagueSeason> {
  const out: Record<LeagueId, LeagueSeason> = {}
  for (const d of DIVISIONS) out[divisionLeagueId(d)] = { races: schedules[d] ?? [], standings: standings[d] ?? [] }
  return out
}

/** 国内3部の日程を差し替えたリーグを返す（順位表と海外リーグはそのまま） */
export function withDivisionRaces(
  leagues: Record<LeagueId, LeagueSeason> | undefined,
  schedules: Partial<Record<Division, Race[]>>,
): Record<LeagueId, LeagueSeason> {
  const out = { ...(leagues ?? {}) }
  for (const d of DIVISIONS) {
    const id = divisionLeagueId(d)
    out[id] = { races: schedules[d] ?? [], standings: out[id]?.standings ?? [] }
  }
  return out
}

/** 国内3部の順位表を取り出す（部 → 行）。部を並べ直す（`reconcileStandingsDivisions`）ときだけ使う */
export function divisionStandingsRecord<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
): Record<Division, T[]> {
  return Object.fromEntries(DIVISIONS.map(d => [d, [...(season.leagues?.[divisionLeagueId(d)]?.standings ?? [])]])) as Record<Division, T[]>
}

/** 国内3部の順位表を差し替えたリーグを返す（日程と海外リーグはそのまま） */
export function withDivisionStandings(
  leagues: Record<LeagueId, LeagueSeason>,
  standings: Record<Division, SeasonStanding[]>,
): Record<LeagueId, LeagueSeason> {
  const out = { ...leagues }
  for (const d of DIVISIONS) {
    const id = divisionLeagueId(d)
    out[id] = { races: leagues[id]?.races ?? [], standings: standings[d] ?? [] }
  }
  return out
}

/**
 * そのクラブがドラフトに参加するか。**決めるのはリーグの決まり（`data/leagues` の `rules.draft`）1本**
 * （いまは日本1部だけ）。
 *
 * 指名されなかった候補はFAになるので、ほかのリーグはそこから拾う。
 * 「今年は指名できるか」を各所で書き分けないこと（指名順・画面の出し分けとも必ずここを見る）。
 */
export function joinsDraft(club: { leagueId?: string } | undefined): boolean {
  return leagueRules(club?.leagueId).draft
}

/**
 * 指名権を持てるクラブ（`data/leagueRules` の `draftPicks`）。並びの順のまま。
 * **指名権の発行・指名順・売り買いはこの並びだけを相手にする**（「日本のリーグなら」と書かないこと）
 */
export function draftPickHolders(clubs: readonly WorldClub[]): Team[] {
  return clubsWhere(clubs, holdsDraftPicks) as Team[]
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
 * 累計ポイント制の大会（ECLの5戦シリーズ・世界選手権の3戦）の順位。**ここ1本。**
 *
 * 順位表を行として持っている部のリーグ（`rankedStandings`）と違い、こちらは
 * 「出場者の一覧」と「id → 累計ポイント」が別々に置いてある。読む側が毎回
 * `participants.map(pt => ({ ...pt, points: points[pt.id] ?? 0 })).sort((a, b) => b.points - a.points)`
 * と書いていて、ECLだけで5か所（ECLページ・順位表・記録室・歴代優勝の判定・世界選手権）に
 * 同じ式が写っていた。タイブレークを足すときに全部を直すことになる。
 *
 * 同点の扱いは `rankedStandings` と同じで「元の並び順のまま」（Array#sort は安定ソート）。
 * 写しになっていた5か所も全部この挙動だったので、結果は変わらない。
 */
export function pointSeriesStandings<T extends { id: string }>(
  participants: readonly T[] | undefined,
  points: Readonly<Record<string, number>> | undefined,
): (T & { points: number })[] {
  const copy = (participants ?? []).map(pt => ({ ...pt, points: points?.[pt.id] ?? 0 }))
  copy.sort((a, b) => b.points - a.points)
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
  leagues?: Readonly<Record<LeagueId, { standings?: readonly T[] }>>
}

/**
 * その部の順位表（得点順）。**順位を出すのはここ1本。**
 *
 * 順位表はリーグごとに分けて持っている（`Season.leagues`）ので、ここは取り出して並べるだけ。
 * 部をまたいで並べる関数は用意しない。レース数が違う（10 / 8 / 7戦）ので、
 * 勝ち点を部をまたいで比べること自体に意味が無い。
 */
export function divisionStandings<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
  division: Division,
): T[] {
  return rankedStandings(season.leagues?.[divisionLeagueId(division)]?.standings)
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
    if (season.leagues?.[divisionLeagueId(d)]?.standings?.some(r => r.teamId === teamId)) return d
  }
  return undefined
}

/**
 * ★**過去の年の部を出すときは、必ずここを通すこと。**★
 *
 * 年をまたいで並ぶ表（選手の在籍履歴・チームの歴代成績）で「その年は何部だったか」を
 * 出すための1本。`divisionOf(team)`（＝`Team.division`）は**チームの現在値**なので、
 * 昇降格した瞬間に過去の年の行まで今の部に書き換わる。
 * 実際、選手詳細の在籍履歴が「2部で走った年が、降格した途端に3部と表示される」状態だった。
 *
 * 順位表はリーグごとに分けて持っている（`Season.leagues` の部のリーグ）ので、
 * その年の順位表に載っている場所がそのまま「その年の部」になる。
 *
 * @param fallback 順位表を持たない古いセーブの年に使う部（呼ぶ側で `divisionOf(いまのチーム)`）。
 *                 情報が無い年はこれ以上のことは言えないので、これまでどおりの見え方に倒す。
 */
export function divisionInYear(
  seasons: readonly (SeasonStandingsLike<RankableRow & { teamId: string }> & { year: number })[],
  year: number,
  teamId: string,
  fallback: Division,
): Division {
  const s = seasons.find(x => x.year === year)
  return (s && divisionInSeason(s, teamId)) ?? fallback
}

/**
 * そのチームがその年に走ったリーグの順位表（得点順）。載っていなければ空。
 * **日本の部も海外リーグも同じ**（載っている順位表がその年の所属・`utils/world` の `leagueIdOfClub`）。
 * 自チームの順位・「自分のリーグの順位表」はここを通す。部番号で引く2本目を作らないこと
 */
export function seasonLeagueStandings<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
  teamId: string,
): T[] {
  const id = leagueIdOfClub(season, teamId)
  return id == null ? [] : rankedStandings(season.leagues?.[id]?.standings)
}

/**
 * 2つのリーグが**昇降格でつながっているか**（同じピラミッド）。日本の1部〜3部はつながっていて、
 * 部の無いリーグ（海外9）はそれ1本。つながりはリーグの決まり（`promotion`）から読む
 */
export function samePyramid(a: LeagueId | string | null | undefined, b: LeagueId | string | null | undefined): boolean {
  if (a == null || b == null) return false
  if (a === b) return true
  return leagueRules(a as LeagueId).promotion && leagueRules(b as LeagueId).promotion
}

/** その年に順位表のある全リーグ（得点順）。並びは12リーグの並び。**優勝回数・成績を数え直すときはここ** */
export function standingsByLeague<T extends RankableRow & { teamId: string }>(
  season: SeasonStandingsLike<T>,
): { leagueId: LeagueId; rows: T[] }[] {
  const have = season.leagues ?? {}
  return WORLD_LEAGUES.filter(l => have[l.id]?.standings?.length)
    .map(l => ({ leagueId: l.id, rows: rankedStandings(have[l.id]?.standings) }))
}

// ── 優勝回数のキー ────────────────────────────────────────────
//
// 優勝回数は「どこで優勝したか」ごとに積む。日本の部は**部の番号（1/2/3）**のまま
// （セーブの外＝フレンドのプロフィールに `titles: {1: 2}` の形で載っていて、古いアプリがそれを読む）、
// 部の無いリーグ（海外9）はリーグIDで積む。★日本の部だけを数えないこと（以前は海外リーグの優勝が
// どこにも積まれず、海外クラブを指揮して優勝しても記録室・GMキャリアに何も残らなかった）

/** 優勝回数を積むキー（日本の部＝部の番号、ほか＝リーグID） */
export type TitleKey = Division | LeagueId

export function titleKeyOf(leagueId: LeagueId): TitleKey {
  return divisionOfLeague(leagueId) ?? leagueId
}

/** JSON を通ると部の番号が "1" になるので戻す */
export function normTitleKey(k: string | number): TitleKey {
  return typeof k === 'number' ? k as Division : /^\d+$/.test(k) ? Number(k) as Division : k as LeagueId
}

/** そのキーのリーグ */
export function titleKeyLeague(key: TitleKey): LeagueId {
  return typeof key === 'number' ? divisionLeagueId(key) : key
}

/**
 * **段**（1＝ピラミッドの頂点）。日本の部は部の番号、部の無いリーグ（海外）は頂点＝1。
 * 「数字1つで出す優勝」（`topTitleCount`）と★の色はこれで決める
 */
export function titleTier(key: TitleKey): Division {
  return typeof key === 'number' ? key : TOP_DIVISION
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
  clubs: readonly WorldClub[],
  makeRow: (teamId: string) => T,
): Record<Division, T[]> {
  const out = emptyStandings<T>()
  for (const t of jpelClubs(clubs)) out[divisionOf(t)].push(makeRow(t.id))
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
  clubs: readonly WorldClub[],
  makeRow: (teamId: string) => T,
): Record<Division, T[]> {
  const rows = new Map<string, T>()
  for (const d of DIVISIONS) for (const r of standings?.[d] ?? []) rows.set(r.teamId, r)
  const out = emptyStandings<T>()
  for (const t of jpelClubs(clubs)) out[divisionOf(t)].push(rows.get(t.id) ?? makeRow(t.id))
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
export function rebalanceDivisions<C extends WorldClub>(
  clubs: readonly C[],
  rankOf: (team: Team) => number,
  pin?: (team: Team) => boolean,
): C[] {
  const total = DIVISIONS.reduce((n, d) => n + DIVISION_SIZE[d], 0)
  const jpel = jpelClubs(clubs)
  // 人数が合っているか、そもそも52クラブ揃っていないセーブには手を出さない
  if (jpel.length !== total) return mapClubs(clubs, c => c)
  if (DIVISIONS.every(d => jpel.filter(t => divisionOf(t) === d).length === DIVISION_SIZE[d])) return mapClubs(clubs, c => c)

  const placed = new Map<string, Division>()
  const left: Record<Division, number> = { 1: DIVISION_SIZE[1], 2: DIVISION_SIZE[2], 3: DIVISION_SIZE[3] }
  // 動かさないクラブを先に席へ着かせる（枠を先に押さえる）
  for (const t of jpel) {
    if (!pin?.(t)) continue
    const d = divisionOf(t)
    if (left[d] <= 0) continue
    placed.set(t.id, d)
    left[d]--
  }
  const ordered = [...jpel]
    .filter(t => !placed.has(t.id))
    .sort((a, b) => divisionOf(a) - divisionOf(b) || rankOf(a) - rankOf(b))
  let i = 0
  for (const d of DIVISIONS) for (let n = 0; n < left[d]; n++) placed.set(ordered[i++].id, d)
  return mapClubs(clubs, c => placed.has(c.id) ? { ...c, leagueId: divisionLeagueId(placed.get(c.id)!) } : c)
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

/** そのレースの結果を順位表へ足す。**どのリーグも（自チームのリーグも）この1本** */
export function addRaceToStandings<R extends StandingRow>(rows: readonly R[], race: RanRace): R[] {
  const byTeam = new Map((race.results?.teamRankings ?? []).map(tr => [tr.teamId, tr]))
  return rows.map(s => {
    const tr = byTeam.get(s.teamId)
    if (!tr) return s
    const earned = tr.positionPoints + tr.segmentPoints
    return {
      ...s,
      leaguePoints: (s.leaguePoints ?? 0) + tr.positionPoints,
      segmentPoints: (s.segmentPoints ?? 0) + tr.segmentPoints,
      totalPoints: s.totalPoints + earned,
      raceResults: [...s.raceResults, { raceId: race.id, rank: tr.rank, points: earned }],
    }
  })
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
    // 0点の行から、走ったレースを1本ずつ足す（足し方は addRaceToStandings 1本）
    let r: StandingRow = { teamId: row.teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] }
    for (const race of races) r = addRaceToStandings([r], race)[0]
    // 1本も走っていない部（シーズン頭）は、いま持っている行のまま
    return r.raceResults.length > 0 ? r : row
  })
}

/**
 * 順位表をクラブの所属リーグに合わせる。**順位表を触る入口はここ1本。**
 *
 * 1. 日本の部の行を「いまの所属」の部のリーグへ並べ直す（部をまたいで動くのは日本の部だけ）
 * 2. 部の無いリーグ（海外）の行も、いま所属しているクラブの行にそろえる（無い行は0点で足す）
 * 3. **自分のリーグ**を、走り終わったレースの結果から数え直す（日本の部でも海外でも同じ）
 *
 * 起動時（persist の merge）とチーム選択（startSetup）の両方から呼ぶ。
 * 何度呼んでも同じ結果になるので、壊れたセーブは開き直すだけで直る。
 * 日程には触らない（海外リーグの日程と、まだ無いリーグは engine/leagueDay の withCopiedSchedules）。
 * ★以前は日本の部だけを見ていて、海外クラブを指揮していると自分のリーグが数え直されなかった
 */
export function syncSeasonLeagues(params: {
  leagues: Record<LeagueId, LeagueSeason> | undefined
  clubs: readonly WorldClub[]
  playerTeamId: string | undefined
}): Record<LeagueId, LeagueSeason> {
  const { clubs, playerTeamId } = params
  const leagues = params.leagues ?? {}
  const fixed = reconcileStandingsDivisions<SeasonStanding>(divisionStandingsRecord<SeasonStanding>({ leagues }), clubs, teamId => ({
    teamId, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
  }))
  const out = withDivisionStandings(leagues, fixed)
  for (const [id, lg] of Object.entries(out)) {
    if (divisionOfLeague(id as LeagueId) != null) continue
    const members = clubsInLeague(clubs, id as LeagueId)
    if (members.length === 0) continue
    const rows = new Map(lg.standings.map(r => [r.teamId, r]))
    const next = members.map(c => rows.get(c.id) ?? { teamId: c.id, totalPoints: 0, raceResults: [] } as SeasonStanding)
    if (next.length !== lg.standings.length || next.some((r, i) => r !== lg.standings[i])) out[id as LeagueId] = { ...lg, standings: next }
  }
  // ★自チームが見つからないときに既定の部（1部）へ落ちないこと。落ちると別のリーグを数え直し、
  //   自分のリーグの点はいつまでも0のまま＝直したつもりで直らない
  const myLeague = clubById(clubs, playerTeamId)?.leagueId as LeagueId | undefined
  const mine = myLeague != null ? out[myLeague] : undefined
  if (myLeague != null && mine) {
    out[myLeague] = { ...mine, standings: divisionStandingsFromRaces(mine.standings as StandingRow[], mine.races) as SeasonStanding[] }
  }
  return out
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

/**
 * 自分のリーグのクラブ数（日本の部も海外リーグも同じ）。「リーグの規模」を日本の52クラブの数で見ないための入口。
 * ★以前は `divisionOf(自チーム)` の部の大きさで、海外クラブを指揮していると日本1部の20が出ていた
 */
export const myLeagueSize = (st: { clubs: readonly WorldClub[]; playerTeamId: string }): number => {
  const leagueId = clubById(st.clubs, st.playerTeamId)?.leagueId as LeagueId | undefined
  const n = leagueId ? clubsInLeague(st.clubs, leagueId).length : 0
  return n > 0 ? n : DIVISION_SIZE[1]
}

/**
 * リーグ内順位 → **ピラミッドの通し順位**（上に部がいくつあるか）。日本の部は `domesticThroughRank`、
 * 部の無いリーグ（海外9）は上に部が無いのでリーグ内順位そのもの。カード報酬の順位の読み方はこれ1本
 */
export function leagueThroughRank(leagueId: LeagueId | string | null | undefined, rankInLeague: number): number {
  const d = divisionOfLeague(leagueId as LeagueId)
  return d != null ? domesticThroughRank(d, rankInLeague) : Math.max(1, rankInLeague)
}
