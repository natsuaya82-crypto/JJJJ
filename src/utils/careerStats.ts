import type { Race, Player, Nationality } from '../types'
import { foreignAppsOf } from './playerUtils'
import { seasonAwardsOf, type SeasonRacesLike } from './awards'

// 選手の通算成績（通算出走数・通算区間賞・MVP回数）を、保存してあるレース結果から組み立てる。
//
// ■なぜ作り直すのか
//   以前は1レース走るたびに Player.career の数字を足していて、その数字をセーブに書いていた。
//   だが元になるレースは過去シーズンに全部残っているので、要るときに数え直せる。
//   選手は数千人いるので、4つの数字を全員ぶん持たないだけでセーブがかなり軽くなる。
//
// ■数え方（当時の足し方をそのまま使う）
//   ・通算出走数: JPELの駅伝1本につき+1（区間を何本走っても1レースは1）。ECLも同じ。海外リーグは出場数ぶん。
//   ・通算区間賞: その区間で一番速かった選手に+1。
//   ・MVP回数  : 年度MVPに選ばれた回数（utils/awards.ts で選び直したものを数える）。
//   ・二軍の記録会・大学駅伝・世界選手権は当時から通算に入れていないので、ここでも数えない。
//
// ■優勝回数（championships）だけは別
//   優勝はシーズン終了時点の在籍で決まるので、レース結果からは正確に復元できない
//   （途中で優勝チームを出ていった選手が混ざる）。数字がずれると移籍金と年俸まで動くので、
//   優勝回数だけは今まで通り選手に持たせたままにしてある。

export type CareerCounts = { totalRaces: number; segmentWins: number; mvpAwards: number }

/** 通算成績に必要な物だけを過去シーズン/今シーズンから受ける */
export type CareerSeasonLike = SeasonRacesLike & {
  eclRace?: Race
  eclSeries?: { races: Race[] }
  /** 裏の部（自分以外の部）の走行記録。ある年はここから数える */
  divisionRaces?: Record<number, Race[]>
  /** 海外リーグの走行記録。ある年はここから数える */
  foreignRaces?: Record<string, Race[]>
  // ↓ 走行記録を残していなかった年ぶんの古い集計。**新しい年では使わない**
  foreignAppearances?: Record<string, { clubId: string; races: number; wins: number; rankSum?: number; rankedRaces?: number }>
  foreignAppsC?: Record<string, Record<string, [number, number, number, number]>>
  awayAppearances?: Record<string, { races: number; wins: number }>
}

type Counts = { totalRaces: number; segmentWins: number }

function bump(out: Map<string, Counts>, id: string, races: number, wins: number) {
  const c = out.get(id)
  if (c) { c.totalRaces += races; c.segmentWins += wins }
  else out.set(id, { totalRaces: races, segmentWins: wins })
}

/** 駅伝1本ぶんを足す。走った選手に出走+1、区間で一番速かった選手に区間賞+1 */
function addRace(out: Map<string, Counts>, race: Race | undefined) {
  const segs = race?.results?.segmentResults
  if (!segs) return
  const ran = new Set<string>()
  for (const sr of segs) {
    let best: { playerId: string; timeSec: number } | undefined
    for (const r of sr.runners ?? []) {
      ran.add(r.playerId)
      if (!best || r.timeSec < best.timeSec) best = r
    }
    if (best) bump(out, best.playerId, 0, 1)
  }
  for (const id of ran) bump(out, id, 1, 0)
}

/** 海外リーグの1年ぶん。誰がどのクラブで何戦走ったか */
export type ForeignSeasonApp = { clubId: string; races: number; wins: number; rankSum: number; rankedRaces: number }

/**
 * その年の海外リーグの出場記録。**海外の数え方はここ1本。**
 *
 * 走行記録が残っている年（Season.foreignRaces）はそこから数え直し、
 * 残っていない古い年だけ昔の集計を使う。通算成績も在籍履歴もここを通すので、
 * 「通算では5戦なのに在籍履歴は3戦」のような食い違いが起きない。
 */
export function foreignSeasonApps(s: CareerSeasonLike | undefined): Record<string, ForeignSeasonApp> {
  if (!s) return {}
  const races = Object.values(s.foreignRaces ?? {}).flat()
  if (races.length === 0) {
    // 走行記録を残していなかった年
    const out: Record<string, ForeignSeasonApp> = {}
    for (const [pid, a] of Object.entries(foreignAppsOf(s))) {
      out[pid] = { clubId: a.clubId, races: a.races, wins: a.wins, rankSum: a.rankSum ?? 0, rankedRaces: a.rankedRaces ?? 0 }
    }
    return out
  }
  const out: Record<string, ForeignSeasonApp> = {}
  for (const race of races) {
    for (const sr of race.results?.segmentResults ?? []) {
      for (const r of sr.runners ?? []) {
        const cur = out[r.playerId] ?? { clubId: r.teamId, races: 0, wins: 0, rankSum: 0, rankedRaces: 0 }
        out[r.playerId] = {
          clubId: r.teamId || cur.clubId,
          races: cur.races + 1,
          wins: cur.wins + (r.rank === 1 ? 1 : 0),
          rankSum: cur.rankSum + r.rank,
          rankedRaces: cur.rankedRaces + 1,
        }
      }
    }
  }
  return out
}

/** 1シーズンぶん（JPEL・ECL・海外リーグ）を足す */
function addSeason(out: Map<string, Counts>, s: CareerSeasonLike | undefined) {
  if (!s) return
  for (const r of s.races ?? []) addRace(out, r)
  // ECL。今の5戦シリーズと、古いセーブに残っている一発勝負のどちらも当時から通算に入れていた
  for (const r of s.eclSeries?.races ?? []) addRace(out, r)
  if (!s.eclSeries?.races?.length) addRace(out, s.eclRace)
  // 裏の部（自分以外の部）と海外リーグ。
  // **走行記録が残っている年はそこから数え、残っていない古い年だけ集計を使う。**
  // 数え方の分岐はここだけ。呼ぶ側で年を見て振り分けないこと（経路ごとに食い違う）。
  const awayRaces = Object.values(s.divisionRaces ?? {}).flat()
  if (awayRaces.length > 0) {
    for (const r of awayRaces) addRace(out, r)
  } else {
    // 走行記録を残していなかった年。ここを足さないと1部・2部の選手が全員0回出走になり、
    // 実績倍率が上がらないので年俸も移籍金も安いままになる
    for (const [pid, a] of Object.entries(s.awayAppearances ?? {})) bump(out, pid, a.races, a.wins)
  }
  for (const [pid, a] of Object.entries(foreignSeasonApps(s))) bump(out, pid, a.races, a.wins)
}

export function buildCareerCounts(seasons: (CareerSeasonLike | undefined)[]): Map<string, Counts> {
  const out = new Map<string, Counts>()
  for (const s of seasons) addSeason(out, s)
  return out
}

// 過去シーズンぶんは年が変わるまで動かないので、別々に覚えておく。
// 今シーズンぶんだけ毎レース数え直せばよく、何年遊んでも重くならない。
let pastCache: { key: unknown; value: Map<string, Counts> } | null = null
let curCache: { key: unknown[]; value: Map<string, Counts> } | null = null

function pastCounts(pastSeasons: CareerSeasonLike[]): Map<string, Counts> {
  if (pastCache && pastCache.key === pastSeasons) return pastCache.value
  const value = buildCareerCounts(pastSeasons)
  pastCache = { key: pastSeasons, value }
  return value
}

function currentCounts(currentSeason: CareerSeasonLike | undefined): Map<string, Counts> {
  const key: unknown[] = [
    currentSeason?.races, currentSeason?.eclSeries, currentSeason?.eclRace,
    currentSeason?.foreignAppearances, currentSeason?.foreignAppsC, currentSeason?.awayAppearances,
  ]
  if (curCache && curCache.key.length === key.length && curCache.key.every((k, i) => k === key[i])) return curCache.value
  const value = buildCareerCounts([currentSeason])
  curCache = { key, value }
  return value
}

/**
 * 選手IDごとの通算成績を作る。
 * 優勝回数（championships）はここでは扱わない（選手が持っているものをそのまま使う）。
 */
export function careerCountsOf(
  pastSeasons: CareerSeasonLike[],
  currentSeason: CareerSeasonLike | undefined,
  players: Player[],
  removedPlayers?: Record<string, [string, Nationality]>,
): Map<string, CareerCounts> {
  const past = pastCounts(pastSeasons)
  const cur = currentCounts(currentSeason)
  const out = new Map<string, CareerCounts>()
  const add = (src: Map<string, Counts>) => {
    for (const [id, c] of src) {
      const o = out.get(id)
      if (o) { o.totalRaces += c.totalRaces; o.segmentWins += c.segmentWins }
      else out.set(id, { totalRaces: c.totalRaces, segmentWins: c.segmentWins, mvpAwards: 0 })
    }
  }
  add(past)
  add(cur)
  // 年度MVPも保存に持たず選び直しているので、そこから回数を数える
  for (const a of seasonAwardsOf(pastSeasons, players, removedPlayers)) {
    if (!a.mvpId) continue
    const o = out.get(a.mvpId)
    if (o) o.mvpAwards += 1
    else out.set(a.mvpId, { totalRaces: 0, segmentWins: 0, mvpAwards: 1 })
  }
  return out
}

/**
 * 選手一覧の career を数え直したもので埋め直す（優勝回数はそのまま残す）。
 * 中身が変わらない選手は同じ物を返すので、これで再描画が増えることはない。
 */
export function withCareerCounts(
  players: Player[],
  pastSeasons: CareerSeasonLike[],
  currentSeason: CareerSeasonLike | undefined,
  removedPlayers?: Record<string, [string, Nationality]>,
): Player[] {
  const counts = careerCountsOf(pastSeasons, currentSeason, players, removedPlayers)
  let changed = false
  const out = players.map(p => {
    const c = counts.get(p.id)
    const totalRaces = c?.totalRaces ?? 0
    const segmentWins = c?.segmentWins ?? 0
    const mvpAwards = c?.mvpAwards ?? 0
    const championships = p.career?.championships ?? 0
    const cur = p.career
    if (cur && cur.totalRaces === totalRaces && cur.segmentWins === segmentWins
      && cur.mvpAwards === mvpAwards && cur.championships === championships) return p
    changed = true
    return { ...p, career: { totalRaces, segmentWins, championships, mvpAwards } }
  })
  return changed ? out : players
}

/**
 * セーブに書く直前、数え直せる3つ（通算出走数・通算区間賞・MVP回数）を落とす。
 * 優勝回数だけは残す（0回の選手は career ごと消えるので、ほとんどの選手で丸ごと消える）。
 * 読み込み時に withCareerCounts で組み立て直すので、遊んでいる最中の見え方は今まで通り。
 */
export function stripCareerForSave<T extends Player>(players: T[]): T[] {
  return players.map(p => {
    const ch = p.career?.championships ?? 0
    const slim = ch > 0 ? { championships: ch } : undefined
    return { ...p, career: slim as unknown as Player['career'] }
  })
}
