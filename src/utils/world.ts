import type { Division, LeagueId, LeagueSeason, Race, Team, WorldClub } from '../types'

// ============================================================================
// 世界の層（入れ物の核）
//
// **クラブは232の1つの並び（`GameState.clubs`）。探すのも書くのもこのファイルと utils/clubs.ts だけ。**
// 日本の3部（52）も海外9リーグ（180）も同じ並びに入っていて、どのリーグのクラブかは
// `club.leagueId`（`Season.leagues` のキーと同じID）だけが持つ。
// 外からは下の関数（と utils/clubs.ts の findClub / makeClubIndex …）を呼ぶ。
// `scripts/check-world-layer.ts` が層の外の直読み・直書きを数える（0件でなければ落ちる）。
//
// ★**自チームは `myClub` 1本。** 国内か海外かを見ずに引ける。自チームへの書き込みも `withMyClub` 1本。
//   自チームかどうかを見るだけなら id の比較でよい（`c.id === playerTeamId`）。
//
// ★以前は国内の `teams`（52）と海外の `foreignLeagues[].clubs`（180）の2つの入れ物に割れていて、
//   「まず国内から探して、無ければ海外リーグを全部なめる」が画面と store に何十か所も写っていた。
//   自チームを引く手書きは国内しか探さないので、海外クラブを指揮すると全部が undefined になった。
//
// ★**このファイルは実行時の import を持たないこと。** league.ts や clubTier.ts からも
//   呼ばれるので、何かを import すると循環して最上位の定数が未初期化のまま読まれる
//   （utils/clubs.ts に置いたとき、clubTier の DIVISIONS が undefined で落ちた）。
// ============================================================================

type Clubs<C> = readonly C[] | null | undefined

type MyWorld<C extends { id: string }> = {
  clubs: Clubs<C>
  playerTeamId: string | null | undefined
}

/** id でクラブの実体（保存されている形そのもの）を引く。国内も海外も同じ。見つからなければ undefined */
export function clubById<C extends { id: string }>(clubs: Clubs<C>, id: string | null | undefined): C | undefined {
  if (!id) return undefined
  return (clubs ?? []).find(c => c.id === id)
}

/** 自チーム。国内か海外かを見ない。見つからなければ undefined */
export function myClub<C extends { id: string }>(w: MyWorld<C>): C | undefined {
  return clubById(w.clubs, w.playerTeamId)
}

/** そのクラブだけを fn で書き換えた並びを返す（ほかのクラブは同じ実体のまま） */
export function updateClub<C extends { id: string }>(clubs: readonly C[], id: string | null | undefined, fn: (c: C) => C): C[] {
  return clubs.map(c => c.id === id ? fn(c) : c)
}

/** 自チームだけを fn で書き換えた並びを返す（ほかのクラブは同じ実体のまま） */
export function withMyClub<C extends { id: string }>(
  w: { clubs: readonly C[]; playerTeamId: string },
  fn: (c: C) => C,
): C[] {
  return updateClub(w.clubs, w.playerTeamId, fn)
}

/** 全クラブを fn で書き換えた並びを返す（並びの順は変えない） */
export function mapClubs<C, R>(clubs: readonly C[], fn: (c: C) => R): R[] {
  return clubs.map(fn)
}

/** 条件に合うクラブ（並びの順のまま） */
export function clubsWhere<C>(clubs: Clubs<C>, pred: (c: C) => boolean): C[] {
  return (clubs ?? []).filter(pred)
}

/** クラブのIDを並びの順に */
export function clubIds(clubs: Clubs<{ id: string }>): string[] {
  return (clubs ?? []).map(c => c.id)
}

/** id → そのクラブから出した値、の索引（並びの順に入れる。同じ id は先のものを残す） */
export function clubMap<C extends { id: string }, R>(clubs: Clubs<C>, fn: (c: C) => R): Map<string, R> {
  const out = new Map<string, R>()
  for (const c of clubs ?? []) if (!out.has(c.id)) out.set(c.id, fn(c))
  return out
}

/** クラブIDの集合 */
export function clubIdSet(clubs: Clubs<{ id: string }>): Set<string> {
  return new Set(clubIds(clubs))
}

/** 自チーム以外（CPUクラブ）。並びの順のまま */
export function otherClubs<C extends { id: string }>(clubs: Clubs<C>, playerTeamId: string | null | undefined): C[] {
  return clubsWhere(clubs, c => c.id !== playerTeamId)
}

/** そのリーグのクラブ（並びの順のまま） */
export function clubsInLeague<C extends { leagueId?: string }>(clubs: Clubs<C>, leagueId: LeagueId | null | undefined): C[] {
  return clubsWhere(clubs, c => c.leagueId === leagueId)
}

/**
 * 並びにクラブを足す。**リーグのまとまりの末尾に入れる**（日本の3部 → 海外9リーグの順を崩さない）。
 * 並びの順は「誰が先に市場を回すか」「格の同点の並び」に効くので、末尾へ雑に足さないこと。
 */
export function withAddedClubs<C extends { leagueId?: string }>(clubs: readonly C[], added: readonly C[]): C[] {
  if (added.length === 0) return [...clubs]
  const groupOf = (c: C) => isJpelLeague(c.leagueId) ? JPEL_GROUP : c.leagueId ?? ''
  const out = [...clubs]
  for (const a of added) {
    const g = groupOf(a)
    let at = -1
    for (let i = 0; i < out.length; i++) if (groupOf(out[i]) === g) at = i
    if (at < 0) {
      // まだ無いまとまり：日本は先頭、海外は末尾
      if (g === JPEL_GROUP) out.unshift(a)
      else out.push(a)
    } else out.splice(at + 1, 0, a)
  }
  return out
}

// ============================================================================
// 日本のリーグ（JPEL 1部・2部・3部）
//
// リーグのIDは `jpel-<部>`（`Season.leagues` のキーと同じ）。**部番号とリーグIDの対応はここ1本。**
// ほかの決まり（昇降格・格が動くか・ドラフト）は data/leagues.ts の `leagueRules`。
// ============================================================================

const JPEL_GROUP = 'jpel'
const JPEL_LEAGUE_PREFIX = 'jpel-'

/** その部のリーグID */
export function divisionLeagueId(division: Division): LeagueId {
  return `${JPEL_LEAGUE_PREFIX}${division}`
}

/** 日本のリーグ（1部・2部・3部）のIDか */
export function isJpelLeague(leagueId: LeagueId | null | undefined): boolean {
  return divisionOfLeague(leagueId) != null
}

/** 日本のリーグなら、その部。海外リーグなら undefined */
export function divisionOfLeague(leagueId: LeagueId | null | undefined): Division | undefined {
  if (!leagueId?.startsWith(JPEL_LEAGUE_PREFIX)) return undefined
  const d = Number(leagueId.slice(JPEL_LEAGUE_PREFIX.length))
  return d === 1 || d === 2 || d === 3 ? d : undefined
}

/**
 * 日本のリーグ（1部・2部・3部）のクラブ52。並びの順のまま。
 * 日本の3部の中だけの決まり（部・通し順位・昇降格）はこれを渡す。
 */
export function jpelClubs(clubs: Clubs<WorldClub>): Team[] {
  return clubsWhere(clubs, c => isJpelLeague(c.leagueId)) as Team[]
}

/** id で日本のリーグのクラブを引く（海外クラブの id なら undefined） */
export function jpelClubById(clubs: Clubs<WorldClub>, id: string | null | undefined): Team | undefined {
  const c = clubById(clubs, id)
  return c && isJpelLeague(c.leagueId) ? c as Team : undefined
}

/** 日本のリーグのクラブIDの集合 */
export function jpelClubIdSet(clubs: Clubs<WorldClub>): Set<string> {
  return clubIdSet(jpelClubs(clubs))
}

// ============================================================================
// リーグ（日程・結果・順位表）
//
// ★**日程・結果・順位表はリーグIDで引く**（`Season.leagues`）。部番号や「自分の部」で
//   引く2本目を作らないこと。自チームのいるリーグを引くのは下の `myLeagueId` 1本。
// ============================================================================

/** リーグを持つシーズン。今シーズンも過去シーズンも同じ形で渡せる */
type LeaguesLike = {
  leagues?: Readonly<Record<LeagueId, { races?: readonly Race[]; standings?: readonly { teamId: string }[] }>>
}

/**
 * そのシーズン、そのクラブがどのリーグで走ったか。順位表に載っていなければ undefined。
 * **順位表に載っている場所がその年の所属**（昇降格しても過去の年が狂わない）
 */
export function leagueIdOfClub(season: LeaguesLike | null | undefined, clubId: string | null | undefined): LeagueId | undefined {
  if (!clubId) return undefined
  for (const [id, lg] of Object.entries(season?.leagues ?? {})) {
    if (lg.standings?.some(r => r.teamId === clubId)) return id
  }
  return undefined
}

/** 自チームのいるリーグのID。**自チームのリーグを引くのはここ1本** */
export function myLeagueId(season: LeaguesLike | null | undefined, playerTeamId: string | null | undefined): LeagueId | undefined {
  return leagueIdOfClub(season, playerTeamId)
}

/** 自チームのリーグの日程（結果つき）。見つからなければ空 */
export function myLeagueRaces(season: LeaguesLike | null | undefined, playerTeamId: string | null | undefined): Race[] {
  const id = myLeagueId(season, playerTeamId)
  return (id == null ? [] : season?.leagues?.[id]?.races ?? []) as Race[]
}

/** そのリーグの日程だけを差し替えたシーズンを返す（順位表とほかのリーグはそのまま） */
export function withLeagueRaces<S extends { leagues: Record<LeagueId, LeagueSeason> }>(
  season: S, leagueId: LeagueId | undefined, races: Race[],
): S {
  if (leagueId == null) return season
  const cur = season.leagues[leagueId] ?? { races: [], standings: [] }
  return { ...season, leagues: { ...season.leagues, [leagueId]: { ...cur, races } } }
}
