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
import { segmentAwardPoints, positionPointsFor } from '../utils/league'
import { courseToRace, type MatchCourse } from '../data/matchCourses'

/** 表示に必要なチーム情報だけ（プロフィールから作る） */
export type MatchTeamInfo = {
  id: string           // ユーザーID
  name: string
  shortName: string
  /** GM名。チーム名は自由に付けられて重複もするので、人を指すのはこちら。
   *  対戦履歴に残っている古い記録には無いので任意 */
  gmName?: string
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
  /** 不戦（未提出でおまかせ）になったレース数 */
  forfeits: number
  /**
   * 通算の不戦敗。1レースも自分でオーダーを出さなかった人だけが true。
   *
   * 以前は「1回でも不戦なら true」だったので、2戦目だけ落ちて3戦目以降は
   * ちゃんと走った人が、最終結果でも通算成績でも不戦敗のままだった
   * （オンライン参加者からの報告で判明）。回線が一瞬切れただけの人に
   * 不戦敗を付けるのは重すぎるので、全部落ちた場合だけにする。
   */
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
        teamId: s.teamId, points: 0, totalTimeSec: 0, segPts: 0, ranks: [], forfeits: 0, forfeit: false, rank: 0,
      }
      cur.points += s.points
      cur.totalTimeSec += s.totalTimeSec
      cur.segPts += s.segPts
      cur.ranks.push(s.rank)
      if (r.forfeits.includes(s.teamId)) cur.forfeits += 1
      map.set(s.teamId, cur)
    }
  }
  const out = [...map.values()].sort((a, b) =>
    b.points - a.points || a.totalTimeSec - b.totalTimeSec)
  out.forEach((s, i) => {
    s.rank = i + 1
    // 出たレースが全部不戦だった人だけを通算の不戦敗にする
    s.forfeit = s.ranks.length > 0 && s.forfeits >= s.ranks.length
  })
  return out
}

const NS = '#'
const nsId = (userId: string, playerId: string) => `${userId}${NS}${playerId}`
const srcOf = (id: string) => { const i = id.indexOf(NS); return i < 0 ? id : id.slice(i + 1) }

/**
 * 区間賞ポイント。参加チーム数で配点が変わる（開始時の数で固定する）。
 *   15〜20チーム → 3/2/1、9〜14チーム → 2/1、それ未満 → 1位に1点だけ
 */
// ※ 区間賞ポイントと順位ポイントの表はここにあったが消した。
//   本編とまったく同じルール（utils/league の segmentAwardPoints / positionPointsFor）を使う。
//   順位ポイントは本編と同じ式が2つ書かれていて、下限だけ 0 と 1 で食い違っていた。

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
    logoId: info.logoId,
    roster: { main: [] },
    finance: { budget: 0 },
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

  // 配点のルールは本編と同じ1本（utils/league）。ただし**人数は開始時のもので固定**する。
  // simulateRace が返す点はそのときの出走数で計算されるので、途中で誰かが抜けると
  // 配点が変わってしまう。シリーズの途中で得点表が動かないよう、ここで teamCount
  // （開始時の参加数）を渡して数え直す。ルールが1本なので値が食い違うことはない
  const segPts: Record<string, number> = {}
  const segments: MatchSegResult[] = results.segmentResults.map(sr => {
    for (const r of sr.runners) {
      const pt = segmentAwardPoints(teamCount, r.rank)
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
      points: positionPointsFor(teamCount, tr.rank) + sp,
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

// ── 対戦履歴の詳細（保存用） ──────────────────────────────
// 「誰が何区を何秒で走ったか」を残す。
//
// 表示は対戦直後と同じ FinishPanel をそのまま使う（履歴のためだけの画面は作らない）。
// そのため保存する形も MatchRacePayload の配列そのものにしておく。詰めた独自形式にすると
// 読むときに MatchRacePayload へ組み直す処理が必要になり、フィールドが増えるたびに
// 「保存する形」と「画面が欲しい形」の2つを合わせ続けることになるため。
//
// startAt だけ落とす。あれは走り出す時刻の待ち合わせに使う値で、後から見るときは意味がない。

export type MatchDetail = {
  v: 2
  races: MatchRacePayload[]
}

/** 全レースの結果から、保存する詳細を組み立てる。 */
export function buildMatchDetail(races: MatchRacePayload[]): MatchDetail {
  return { v: 2, races: races.map(r => ({ ...r, startAt: 0 })) }
}

/** 保存されている詳細を、画面が使える形（レース結果の配列）に戻す。 */
export function racesFromDetail(d: MatchDetail | undefined): MatchRacePayload[] {
  return Array.isArray(d?.races) ? d.races : []
}
