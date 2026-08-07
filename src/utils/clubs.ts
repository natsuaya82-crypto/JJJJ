import type { ForeignClub, ForeignLeague, Nationality, Team } from '../types'

// ============================================================================
// 「クラブ」は1種類だけ。ここが唯一の引き場所。
//
// ■なぜ要るのか
//   JPEL(国内)も海外リーグも、やっていることは同じ駅伝リーグで、違うのは国だけ。
//   なのに Team(国内) と ForeignClub(海外) が別物として扱われていたせいで、
//   「まず国内から探して、無ければ海外リーグを全部なめる」という同じ処理が
//   画面と store に30ヶ所以上コピーされていた。
//   1ヶ所でも書き忘れると、そこだけ所属が「—」や「不明」になる。実際そうなっていた。
//
// ■方針
//   国内チームも海外クラブも Club という1つの形に揃える。引くのは clubById(id) だけ。
//   国内にしかない項目（予算・施設・ドラフト権・ロスターなど）は team に丸ごと入れて
//   任意項目にする。要るときだけ club.team から取り出す。
//
// ■国内か海外か
//   クラブの国を見るだけ。国内(JPEL)のクラブは必ず日本(JPN)なので isDomestic と同じこと。
//
// ■注意
//   セーブの中身（Team / ForeignClub）はこれまでどおり。ここは読むときの形を
//   揃えるだけなので、既存のセーブデータには一切さわらない。
// ============================================================================

// 国内リーグのID/名前。海外リーグの leagueId・name と同じ場所に入れて、扱いを揃えるために使う
export const JPEL_LEAGUE_ID = 'jpel'
export const JPEL_LEAGUE_NAME = 'JPEL'

export type Club = {
  id: string
  name: string
  shortName: string
  country: Nationality
  colors: { primary: string; secondary: string }
  // 所属リーグ。国内は 'jpel' / 'JPEL'
  leagueId: string
  leagueName: string
  // 国内(JPEL)のクラブかどうか。中身は country === 'JPN' と同じ意味
  isDomestic: boolean
  // ここから下は国内クラブにしかない任意項目
  logoId?: string
  team?: Team
}

export function clubOfTeam(t: Team): Club {
  return {
    id: t.id,
    name: t.name,
    shortName: t.shortName,
    country: 'JPN',
    colors: t.colors,
    leagueId: JPEL_LEAGUE_ID,
    leagueName: JPEL_LEAGUE_NAME,
    isDomestic: true,
    logoId: t.logoId,
    team: t,
  }
}

export function clubOfForeign(c: ForeignClub, leagueName?: string): Club {
  return {
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    country: c.country,
    colors: c.colors,
    leagueId: c.leagueId,
    leagueName: leagueName ?? '海外リーグ',
    isDomestic: false,
  }
}

// クラブ詳細ページの行き先。国内と海外でURLが違うのはここだけにまとめる
export function clubRoutePath(club: Club | null | undefined): string | null {
  if (!club) return null
  return club.isDomestic
    ? `/teams/detail/${club.id}`
    : `/teams/foreign/${club.leagueId}/${club.id}`
}

export type ClubIndex = {
  // IDからクラブを引く。国内・海外どちらでも同じように引ける
  byId: (id: string | null | undefined) => Club | undefined
  // 国内も海外も全部（国内が先）
  all: Club[]
  // そのIDが国内(JPEL)のクラブか。知らないIDは false
  isDomestic: (id: string | null | undefined) => boolean
}

// クラブ索引を1回だけ作って使い回す。毎回リーグを全部なめないための入り口。
export function makeClubIndex(
  teams: Team[] | null | undefined,
  foreignLeagues: ForeignLeague[] | null | undefined,
): ClubIndex {
  const byId = new Map<string, Club>()
  const all: Club[] = []
  for (const t of teams ?? []) {
    if (!t?.id) continue
    const c = clubOfTeam(t)
    // 同じIDが二度出てきたら先に入れたほうを残す（国内を優先）
    if (byId.has(c.id)) continue
    byId.set(c.id, c)
    all.push(c)
  }
  for (const l of foreignLeagues ?? []) {
    for (const fc of (l?.clubs ?? [])) {
      if (!fc?.id) continue
      const c = clubOfForeign(fc, l?.name)
      if (byId.has(c.id)) continue
      byId.set(c.id, c)
      all.push(c)
    }
  }
  return {
    byId: (id) => (id ? byId.get(id) : undefined),
    all,
    isDomestic: (id) => (id ? byId.get(id)?.isDomestic === true : false),
  }
}

// 国内リーグに所属するチームIDの集合。
//
// ■なぜ要るのか
//   「このIDは国内チームか」を new Set(teams.map(t => t.id)) とその場で書く箇所が
//   store に散らばっていた。海外クラブに予算や施設を持たせて国内チームと同じ形にすると、
//   型では国内と海外を区別できなくなる。判定を書き忘れた場所から
//   「海外クラブが国内の名簿処理やFA処理に混ざる」という以前あった壊れ方が再発する。
//   判定を必ずここ1ヶ所から引くようにして、直す場所を1つに固定する。
//
// ■注意
//   state.teams は国内リーグのチームだけを入れる配列であり続けること。
//   ここに海外クラブを混ぜると、この関数を含めて国内前提の処理が全部おかしくなる。
export function domesticTeamIdSet(teams: Team[] | null | undefined): Set<string> {
  const s = new Set<string>()
  for (const t of teams ?? []) if (t?.id) s.add(t.id)
  return s
}

// 索引を作るほどでもない1回きりの検索用。中身は同じルール。
export function findClub(
  teams: Team[] | null | undefined,
  foreignLeagues: ForeignLeague[] | null | undefined,
  id: string | null | undefined,
): Club | undefined {
  if (!id) return undefined
  for (const t of teams ?? []) if (t?.id === id) return clubOfTeam(t)
  for (const l of foreignLeagues ?? []) {
    for (const fc of (l?.clubs ?? [])) if (fc?.id === id) return clubOfForeign(fc, l?.name)
  }
  return undefined
}

// ── 海外リーグの引き場所 ─────────────────────────────────────
//
// 「海外クラブを全部並べる」「このIDは海外クラブか」「このクラブはどのリーグか」を
// その場で書く箇所が store と engine に散らばっていた（flatMap(l => l.clubs) が7か所、
// 同じ Set の作り直しが3か所）。どれも中身は同じなのでここへ集約する。

/** 全リーグのクラブを1本に並べる */
export function allForeignClubs(foreignLeagues: ForeignLeague[] | null | undefined): ForeignClub[] {
  return (foreignLeagues ?? []).flatMap(l => l?.clubs ?? [])
}

/** 海外クラブIDの集合。「このIDは海外クラブか」の判定に使う */
export function foreignClubIdSet(foreignLeagues: ForeignLeague[] | null | undefined): Set<string> {
  return new Set(allForeignClubs(foreignLeagues).map(c => c.id))
}

/** そのクラブが所属するリーグ。国内クラブ・不明なIDでは undefined */
export function leagueOfClub(
  foreignLeagues: ForeignLeague[] | null | undefined,
  clubId: string | null | undefined,
): ForeignLeague | undefined {
  if (!clubId) return undefined
  return (foreignLeagues ?? []).find(l => (l?.clubs ?? []).some(c => c.id === clubId))
}

/** クラブID → リーグID の索引。1件ずつ探すより速いので、まとめて引くときはこちら */
export function leagueIdByClub(foreignLeagues: ForeignLeague[] | null | undefined): Map<string, string> {
  return new Map((foreignLeagues ?? []).flatMap(l => (l?.clubs ?? []).map(c => [c.id, l.id] as [string, string])))
}

// ── 4大リーグ（世界最高峰）─────────────────────────────────
//
// 東アフリカ・北南アフリカ・欧州西南・北米。ここが世界のスターを引き抜き、
// 日本人がここへ渡れば「世界へ挑戦」の大ニュースになる。
// 同じ4件のIDが7か所（gameStore 3・foreignTransfers 3・foreignClubProfile 1）に
// コピーされていて、片方だけ増やすと引き抜きとニュースの基準がズレる状態だった。
// ★ 4大リーグを増減するときはここだけを変えること。
export const ELITE_LEAGUE_IDS: ReadonlySet<string> = new Set(['africa_east', 'africa_ns', 'europe_ws', 'north_america'])

export function isEliteLeague(leagueId: string | null | undefined): boolean {
  return ELITE_LEAGUE_IDS.has(leagueId ?? '')
}

/** 憧れの地域 → その地域の4大リーグ。海外挑戦の行き先を選ぶときに使う */
export const ELITE_LEAGUES_BY_REGION: Readonly<Record<string, readonly string[]>> = {
  africa: ['africa_east', 'africa_ns'],
  europe: ['europe_ws'],
  america: ['north_america'],
}
