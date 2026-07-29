// オンライン対戦のレース計算。
//
// 考え方
//   ・計算するのはホストだけ。結果をそのまま全員へ配って、各自は「再生するだけ」にする。
//     （各自の端末で走らせると乱数がずれて別々の結果になってしまうため）
//   ・計算そのものは本編と同じ simulateRace を使う。オンライン用の別計算は作らない。
//   ・選手IDはセーブごとに同じものが出てくる（例：ai-t01-5001）ので、
//     そのまま混ぜると別チームの選手を取り違える。計算のあいだだけ「ユーザーID#元のID」に付け替える。
//     自分のチームの表示だけは元のIDに戻すので、顔も長押しも手元のゲームと同じになる。
import type { Player, Team } from '../types'
import { simulateRace } from '../engine/raceEngine'
import { courseToRace, type MatchCourse } from '../data/matchCourses'

/** 表示に必要なチーム情報だけ（プロフィールから作る） */
export type MatchTeamInfo = {
  id: string           // ユーザーID
  name: string
  shortName: string
  primary: string
  secondary: string
  logoId: string
}

/** 表示に必要な選手情報だけ */
export type MatchRunnerInfo = {
  id: string           // 付け替え後のID（ユーザーID#元のID）
  srcId: string        // 元のID（自分のチームの表示に使う）
  teamId: string       // ユーザーID
  name: string
  nationality: string
}

export type MatchSegResult = {
  segmentIndex: number
  runners: { playerId: string; teamId: string; timeSec: number; rank: number }[]
}

export type MatchStanding = {
  teamId: string
  totalTimeSec: number
  rank: number
  /** このレースの区間賞ポイント */
  segPts: number
  /** このレースの合計得点（順位ポイント＋区間賞ポイント） */
  points: number
}

/** ホストが配るレース結果。これ1つで全員が同じ再生をする。 */
export type MatchRacePayload = {
  /** 何戦目か（0始まり） */
  race: number
  courseId: string
  /** サーバー時刻。ここでカウントダウンが終わって走り出す */
  startAt: number
  teams: MatchTeamInfo[]
  runners: MatchRunnerInfo[]
  segments: MatchSegResult[]
  standings: MatchStanding[]
  /** 提出できずおまかせで走ったユーザー（切断など） */
  forfeits: string[]
}

/** シリーズ（全レース）の通算成績。1チーム1行。 */
export type SeriesStanding = {
  teamId: string
  /** 通算得点（順位ポイント＋区間賞） */
  points: number
  /** 全レースの合計タイム */
  totalTimeSec: number
  /** 区間賞の合計 */
  segPts: number
  /** レースごとの順位 */
  ranks: number[]
  /** 1回でも不戦（未提出でおまかせ）になったか */
  forfeit: boolean
  /** 総合順位（1始まり） */
  rank: number
}

/**
 * 全レースの結果から通算成績を作る。
 * 並びは「通算得点が多い順、同点なら合計タイムが速い順」。
 * ホストも参加者も同じ結果を持っているので、各自がこれを呼べば必ず同じ表になる。
 */
export function seriesStandings(races: MatchRacePayload[]): SeriesStanding[] {
  const map = new Map<string, SeriesStanding>()
  for (const r of races) {
    for (const s of r.standings) {
      const cur = map.get(s.teamId) ?? {
        teamId: s.teamId, points: 0, totalTimeSec: 0, segPts: 0, ranks: [], forfeit: false, rank: 0,
      }
      cur.points += s.points
      cur.totalTimeSec += s.totalTimeSec
      cur.segPts += s.segPts
      cur.ranks.push(s.rank)
      if (r.forfeits.includes(s.teamId)) cur.forfeit = true
      map.set(s.teamId, cur)
    }
  }
  const out = [...map.values()].sort((a, b) =>
    b.points - a.points || a.totalTimeSec - b.totalTimeSec)
  out.forEach((s, i) => { s.rank = i + 1 })
  return out
}

const NS = '#'
const nsId = (userId: string, playerId: string) => `${userId}${NS}${playerId}`
const srcOf = (id: string) => { const i = id.indexOf(NS); return i < 0 ? id : id.slice(i + 1) }

/**
 * 区間賞ポイント。参加チーム数で配点が変わる（開始時の数で固定する）。
 *   15〜20チーム → 3/2/1、9〜14チーム → 2/1、それ未満 → 1位に1点だけ
 */
export function segAwardPoints(teamCount: number, rank: number): number {
  if (teamCount >= 15) return rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0
  if (teamCount >= 9) return rank === 1 ? 2 : rank === 2 ? 1 : 0
  return rank === 1 ? 1 : 0
}

/** 順位ポイント。1位＝参加チーム数、以下1点ずつ下がって最下位1点。 */
export function rankPoints(teamCount: number, rank: number): number {
  return Math.max(1, teamCount - rank + 1)
}

/** 表示用の Team。計算に効くのは所在地だけなので空にしてある（全チーム同条件）。 */
export function asTeam(info: MatchTeamInfo): Team {
  return {
    id: info.id,
    name: info.name,
    shortName: info.shortName,
    city: '',
    region: '',
    founded: 0,
    colors: { primary: info.primary, secondary: info.secondary },
    logoUrl: '',
    logoId: info.logoId,
    roster: { main: [], second: [] },
    finance: { salaryTotal: 0, budget: 0 },
    draftPicks: [],
    initialRank: 0,
    isPlayerControlled: false,
    gmName: '',
  } as unknown as Team
}

/** 表示用の Player（名前・顔・国籍だけ使う） */
export function asPlayer(r: MatchRunnerInfo, id?: string): Player {
  return { id: id ?? r.id, name: r.name, nationality: r.nationality, teamId: r.teamId } as unknown as Player
}

export { srcOf }

/**
 * ホストが1レースぶんの結果を作る。
 * orders は「ユーザーID → 区間番号 → 元の選手ID」。rosters も元のIDのまま渡す。
 */
export function buildRacePayload(args: {
  raceNo: number                                   // 0始まり
  course: MatchCourse
  startAt: number
  teams: MatchTeamInfo[]
  rosters: Record<string, Player[]>
  orders: Record<string, Record<number, string>>
  /** 得点表を決める参加チーム数（開始時の数で固定） */
  teamCount: number
  forfeits?: string[]
}): MatchRacePayload {
  const { raceNo, course, startAt, teams, rosters, orders, teamCount } = args
  const race = courseToRace(course, raceNo + 1)

  // 計算用に選手IDを付け替える
  const simPlayers: Player[] = []
  const runnerInfo = new Map<string, MatchRunnerInfo>()
  const lineups: Record<string, Record<number, string>> = {}
  for (const t of teams) {
    const roster = rosters[t.id] ?? []
    const byId = new Map(roster.map(p => [p.id, p]))
    const line: Record<number, string> = {}
    for (const seg of course.segments) {
      const pid = orders[t.id]?.[seg.index]
      const p = pid ? byId.get(pid) : undefined
      if (!p) continue
      const nid = nsId(t.id, p.id)
      line[seg.index] = nid
      if (!runnerInfo.has(nid)) {
        simPlayers.push({ ...p, id: nid, teamId: t.id })
        runnerInfo.set(nid, {
          id: nid, srcId: p.id, teamId: t.id,
          name: p.name, nationality: String(p.nationality ?? 'JPN'),
        })
      }
    }
    lineups[t.id] = line
  }

  const results = simulateRace(race, lineups, teams.map(asTeam), simPlayers, 0)

  // 区間賞ポイントは参加チーム数で配点が変わるのでここで数え直す
  const segPts: Record<string, number> = {}
  const segments: MatchSegResult[] = results.segmentResults.map(sr => {
    for (const r of sr.runners) {
      const pt = segAwardPoints(teamCount, r.rank)
      if (pt) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + pt
    }
    return { segmentIndex: sr.segmentIndex, runners: sr.runners }
  })

  const standings: MatchStanding[] = results.teamRankings.map(tr => {
    const sp = segPts[tr.teamId] ?? 0
    return {
      teamId: tr.teamId,
      totalTimeSec: tr.totalTimeSec,
      rank: tr.rank,
      segPts: sp,
      points: rankPoints(teamCount, tr.rank) + sp,
    }
  })

  return {
    race: raceNo,
    courseId: course.id,
    startAt,
    teams,
    runners: [...runnerInfo.values()],
    segments,
    standings,
    forfeits: args.forfeits ?? [],
  }
}
