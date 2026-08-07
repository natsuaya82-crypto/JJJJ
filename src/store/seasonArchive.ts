import type { ArchivedSeason, Race } from '../types'
import {
  packRaceResults, unpackRace, archiveKeyOf, archiveMatches,
  type PackedRace, type SeasonArchive,
} from '../utils/raceRecord'
import { writeArchive, readArchive, removeArchive } from './saveStorage'

// 過去シーズンの走行記録を、普段のセーブの外に置くための唯一の場所。
//
// ■なぜ外に出すのか
//   セーブは状態が変わるたびに**全部を書き直す**。選手を1人動かしただけでも、
//   過去100シーズンぶんの区間タイムまで丸ごと書き直される。
//   実測で40MB／書き込み1.4秒（実機はさらに2〜4倍）。1回の操作で数秒固まる。
//   過去の記録は終わったあと二度と変わらないので、1年に1回書いて、起動時に1回読めば足りる。
//
// ■どう出すか
//   1. シーズンが終わったら、その年ぶんを別ファイルへ書く
//   2. 書いたものを**読み戻して一致を確かめる**
//   3. 一致したときだけ、その年を archivedYears に足す
//   セーブするときは archivedYears に載っている年の結果だけを落とす（stripArchivedResults）。
//   載っていない年はそのままセーブに残る。**確かめられていない年は絶対に外さない。**
//
// ■読むとき
//   起動時に1回だけ全部読んで、pastSeasons へ結果を戻す（hydratePastSeasons）。
//   戻したあとの形は今までとまったく同じなので、読む側の画面は1行も変わらない。

// 大会ごとの取り出し口。**大会で残す／捨てるを分けない**（utils/raceRecord.ts）。
//   固定キー  jpel / college / reserve / ecl
//   動的キー  div-<部>（裏の部）、lg-<リーグID>（海外リーグ）、wa-<地域>（大陸予選）
const DIV_PREFIX = 'div-'
const LEAGUE_PREFIX = 'lg-'
const WA_PREFIX = 'wa-'

/** その年のシーズンから、大会ごとのレース一覧を取り出す。**取り出し方はここ1本** */
function racesByCompetition(s: ArchivedSeason): Record<string, Race[]> {
  const out: Record<string, Race[]> = {
    jpel: s.races ?? [],
    college: s.collegeRaces ?? [],
    reserve: s.secondTeamRaces ?? [],
    ecl: [...(s.eclSeries?.races ?? []), ...(s.eclRace ? [s.eclRace] : [])],
  }
  for (const [d, rs] of Object.entries(s.divisionRaces ?? {})) out[`${DIV_PREFIX}${d}`] = rs
  for (const [lid, rs] of Object.entries(s.foreignRaces ?? {})) out[`${LEAGUE_PREFIX}${lid}`] = rs
  for (const [rg, rs] of Object.entries(s.waRaces ?? {})) out[`${WA_PREFIX}${rg}`] = rs
  return out
}

/** その年ぶんを詰める */
function packSeason(s: ArchivedSeason): SeasonArchive {
  const races: Record<string, PackedRace[]> = {}
  for (const [c, rs] of Object.entries(racesByCompetition(s))) {
    const packed = rs.map(packRaceResults).filter((p): p is PackedRace => !!p)
    if (packed.length > 0) races[c] = packed
  }
  return { year: s.year, races }
}

/**
 * 終わったシーズンを別ファイルへ書き出す。
 * **書いて、読み戻して、一致したときだけ true。** false のときは呼ぶ側は何も外さないこと。
 */
export async function writeSeasonArchive(s: ArchivedSeason): Promise<boolean> {
  try {
    const json = JSON.stringify(packSeason(s))
    const key = archiveKeyOf(s.year)
    await writeArchive(key, json)
    const back = await readArchive(key)
    return archiveMatches(json, back)
  } catch (e) {
    console.warn('[archive] failed to write season archive', s.year, e)
    return false
  }
}

/**
 * セーブに書く直前に、別ファイルへ出し終わった年の結果だけを落とす。
 * archivedYears に載っていない年は**触らない**（確かめられていないので）。
 */
export function stripArchivedResults(
  pastSeasons: ArchivedSeason[],
  archivedYears: readonly number[] | undefined,
): ArchivedSeason[] {
  const done = new Set(archivedYears ?? [])
  if (done.size === 0) return pastSeasons
  const strip = <T extends Race[] | undefined>(rs: T): T =>
    (rs?.map(r => (r.results ? { ...r, results: undefined } : r)) as T)
  const stripMap = <K extends string | number>(m: Record<K, Race[]> | undefined) =>
    (m ? Object.fromEntries(Object.entries(m).map(([k, rs]) => [k, strip(rs as Race[])])) as Record<K, Race[]> : m)
  return pastSeasons.map(s => {
    if (!done.has(s.year)) return s
    return {
      ...s,
      races: strip(s.races),
      divisionRaces: stripMap(s.divisionRaces),
      foreignRaces: stripMap(s.foreignRaces),
      waRaces: stripMap(s.waRaces),
      collegeRaces: strip(s.collegeRaces),
      secondTeamRaces: strip(s.secondTeamRaces),
      eclRace: s.eclRace?.results ? { ...s.eclRace, results: undefined } : s.eclRace,
      eclSeries: s.eclSeries ? { ...s.eclSeries, races: strip(s.eclSeries.races) ?? s.eclSeries.races } : s.eclSeries,
    }
  })
}

/** 別ファイルから読み戻して、レースに結果を詰め直す */
function applyArchive(s: ArchivedSeason, a: SeasonArchive): ArchivedSeason {
  const put = <T extends Race[] | undefined>(rs: T, packed: PackedRace[] | undefined): T => {
    if (!rs || !packed) return rs
    const byId = new Map(packed.map(p => [p.id, p]))
    return rs.map(r => {
      if (r.results) return r          // すでに入っている（外していない年）
      const p = byId.get(r.id)
      return p ? { ...r, results: unpackRace(p) } : r
    }) as T
  }
  const putMap = <K extends string | number>(m: Record<K, Race[]> | undefined, prefix: string, arc: SeasonArchive) =>
    (m ? Object.fromEntries(Object.entries(m).map(([k, rs]) =>
      [k, put(rs as Race[], arc.races[`${prefix}${k}`])])) as Record<K, Race[]> : m)
  const eclRaces = put(s.eclSeries?.races, a.races.ecl)
  return {
    ...s,
    races: put(s.races, a.races.jpel),
    divisionRaces: putMap(s.divisionRaces, DIV_PREFIX, a),
    foreignRaces: putMap(s.foreignRaces, LEAGUE_PREFIX, a),
    waRaces: putMap(s.waRaces, WA_PREFIX, a),
    collegeRaces: put(s.collegeRaces, a.races.college),
    secondTeamRaces: put(s.secondTeamRaces, a.races.reserve),
    eclRace: s.eclRace && !s.eclRace.results
      ? (a.races.ecl?.find(p => p.id === s.eclRace!.id)
          ? { ...s.eclRace, results: unpackRace(a.races.ecl.find(p => p.id === s.eclRace!.id)!) }
          : s.eclRace)
      : s.eclRace,
    eclSeries: s.eclSeries && eclRaces ? { ...s.eclSeries, races: eclRaces } : s.eclSeries,
  }
}

/**
 * 起動時に1回だけ。別ファイルに出してある年の結果を読み戻す。
 * 読めなかった年はそのまま（結果なし）で返す。画面が落ちるよりは記録が出ないほうがまし。
 */
export async function hydratePastSeasons(
  pastSeasons: ArchivedSeason[],
  archivedYears: readonly number[] | undefined,
): Promise<ArchivedSeason[]> {
  const done = new Set(archivedYears ?? [])
  if (done.size === 0) return pastSeasons
  const out: ArchivedSeason[] = []
  for (const s of pastSeasons) {
    if (!done.has(s.year)) { out.push(s); continue }
    try {
      const raw = await readArchive(archiveKeyOf(s.year))
      if (!raw) { out.push(s); continue }
      out.push(applyArchive(s, JSON.parse(raw) as SeasonArchive))
    } catch (e) {
      console.warn('[archive] failed to read season archive', s.year, e)
      out.push(s)
    }
  }
  return out
}

/**
 * データ削除のときに、別ファイルに出してある走行記録も消す。
 * ここを消さないと、新しく始めたゲームが同じ年に達したときに
 * 前のデータの記録を読み戻してしまう。
 */
export async function clearSeasonArchives(archivedYears: readonly number[] | undefined): Promise<void> {
  for (const y of archivedYears ?? []) {
    try { await removeArchive(archiveKeyOf(y)) } catch (e) { console.warn('[archive] failed to remove', y, e) }
  }
}
