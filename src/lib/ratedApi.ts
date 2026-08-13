// ============================================================================
// レート戦のサーバーとのやりとり。
//
// ★★ いまは**仮のデータを返しています**。Supabase の表と Edge Function は
//    まだ作っていません（`docs/ONLINE_RATED_DESIGN.md` の作る順番の2段目）。
//    画面を先に作って見てもらうための足場です。
//
//    **差し替えるのはこのファイルだけ**になるように、画面からは
//    ここで定義した型と関数しか触らせないこと。
// ============================================================================
import { ratedCourse, courseDistanceKm } from '../engine/ratedCourse'
import type { MatchCourse } from '../data/matchCourses'
import type { MatchRacePayload } from './matchSim'
import { rankOf, type RankName } from '../engine/rating'
import type { HofPlayer, Race } from '../types'

/** 提出の締め切り（日本時間）。**端末の時計で判定しないこと**——本判定はサーバー側 */
export const SUBMIT_DEADLINE_HHMM = '23:59'
/** 結果と次のコースが出る時刻（日本時間） */
export const RESULT_HHMM = '10:00'

export type RatedMe = {
  /** 参加しているか */
  joined: boolean
  rating: number
  rank: RankName
  /** 大会の中での通し順位 */
  overall: number
  entrants: number
  /** その日の提出（区間 → 殿堂入りの選手ID）。空なら未提出 */
  lineup: Record<number, string>
}

export type RatedRow = {
  userId: string
  teamName: string
  gmName: string
  primary: string
  secondary: string
  logoId: string
  rating: number
  /** 前日のレースの順位（1が最速）。未走なら 0 */
  place: number
  timeSec: number
  delta: number
  mine: boolean
}

export type RatedToday = {
  /** 大会の何日目か */
  day: number
  totalDays: number
  dateISO: string
  course: Race
  /** 締め切りまでの残り（分）。サーバー時刻から出す */
  minutesLeft: number
}

export type RatedResult = {
  dateISO: string
  course: Race
  /** グループの通し番号（1が最上位グループ） */
  group: number
  groups: number
  /**
   * **オンライン対戦とまったく同じ形**（`MatchRacePayload`）。
   * こうしておくと、結果も再生も既存の `FinishPanel` / `MatchReplayPage` が
   * そのまま使える。**似た画面を2つ作らないため。**
   */
  race: MatchRacePayload
  /** レートの増減（userId → 増減）。レート戦だけの追加ぶん */
  delta: Record<string, number>
}

/**
 * レート戦のコースを、オンライン対戦の画面が読める形にする。
 * `courseById` の一覧には無い（日付から作るので）ので、`FinishPanel` などへ渡す。
 */
export function ratedMatchCourse(dateISO: string): MatchCourse {
  const r = ratedCourse(dateISO)
  return {
    id: r.id, name: `レート戦 ${dateISO}`, category: 'main', location: r.location,
    segments: r.segments, conditions: r.conditions, distanceKm: courseDistanceKm(r),
  }
}

/** `FinishPanel` / 再生に渡す引き方。日付から作るので一覧では引けない */
export function ratedCourseOf(id: string): MatchCourse | undefined {
  const m = /^rated-(\d{4}-\d{2}-\d{2})$/.exec(id)
  return m ? ratedMatchCourse(m[1]) : undefined
}

// ── ここから下は仮のデータ ──────────────────────────────────────────
// ★本物に差し替えるときは、この節をまるごと Supabase の呼び出しに置き換える。

const MOCK_NAMES = [
  '陽和ランナーズ', '北嶺アスリート', '海風エキデン', '碧空クラブ', '流星ハリアーズ',
  '暁光レーシング', '銀嶺スピリッツ', '疾風アスレチック', '朝霧ストライダーズ', '天翔クラブ',
  '紅蓮ランナーズ', '白鷺エキデン', '雷鳴アスリート', '常磐ハリアーズ', '黎明クラブ',
  '烈風スピリッツ', '蒼穹レーシング', '静流エキデン', '飛鳥アスレチック', '極光クラブ',
]
const MOCK_GM = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水']
const MOCK_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e']

/** 大会の初日。仮 */
const MOCK_START = '2026-09-01'
const MOCK_DAY = 12

function mockDate(day: number): string {
  return new Date(Date.UTC(2026, 8, day)).toISOString().slice(0, 10)
}

export async function fetchToday(): Promise<RatedToday> {
  const dateISO = mockDate(MOCK_DAY)
  return {
    day: MOCK_DAY, totalDays: 30, dateISO,
    course: ratedCourse(dateISO),
    minutesLeft: 6 * 60 + 42,
  }
}

export async function fetchMe(): Promise<RatedMe> {
  return { joined: true, rating: 168, rank: rankOf(168), overall: 7, entrants: 43, lineup: {} }
}

function mockRows(seedBase: number, myRating: number): RatedRow[] {
  const rows: RatedRow[] = []
  for (let i = 0; i < 14; i++) {
    const mine = i === 4
    const rating = mine ? myRating : 260 - i * 14 + ((seedBase + i * 7) % 11)
    rows.push({
      userId: `u${i}`,
      teamName: mine ? '千葉タイガー' : MOCK_NAMES[i % MOCK_NAMES.length],
      gmName: mine ? '運営' : MOCK_GM[(i + seedBase) % MOCK_GM.length],
      primary: MOCK_COLORS[i % MOCK_COLORS.length],
      secondary: MOCK_COLORS[(i + 3) % MOCK_COLORS.length],
      logoId: '',
      rating,
      place: i + 1,
      timeSec: 8400 + i * 37 + ((seedBase + i * 13) % 25),
      delta: Math.round((7 - i) * 5.5),
      mine,
    })
  }
  return rows
}

export async function fetchResult(): Promise<RatedResult | null> {
  const dateISO = mockDate(MOCK_DAY - 1)
  const course = ratedCourse(dateISO)
  const rows = mockRows(3, 168)
  const race: MatchRacePayload = {
    race: 0,
    courseId: course.id,
    startAt: 0,
    teams: rows.map(r => ({
      id: r.userId, name: r.teamName, shortName: r.teamName.slice(0, 4), gmName: r.gmName,
      primary: r.primary, secondary: r.secondary, logoId: r.logoId,
    })),
    runners: rows.flatMap(r => course.segments.map(s => ({
      id: `${r.userId}#p${s.index}`, srcId: `p${s.index}`, teamId: r.userId,
      name: `${r.gmName}${s.index + 1}`, nationality: 'JPN',
    }))),
    segments: course.segments.map(s => ({
      segmentIndex: s.index,
      runners: rows.map((r, i) => ({
        playerId: `${r.userId}#p${s.index}`, teamId: r.userId,
        timeSec: Math.round(r.timeSec / course.segments.length) + i, rank: i + 1,
      })),
    })),
    standings: rows.map(r => ({
      teamId: r.userId, totalTimeSec: r.timeSec, rank: r.place,
      segPts: 0, points: rows.length - r.place + 1,
    })),
    forfeits: [],
  }
  return {
    dateISO, course, group: 1, groups: 3,
    race,
    delta: Object.fromEntries(rows.map(r => [r.userId, r.delta])),
  }
}

/** 大会全体の順位表（レート順） */
export async function fetchStandings(): Promise<RatedRow[]> {
  return mockRows(11, 168).sort((a, b) => b.rating - a.rating)
}

/** 提出する。**タイムにも順位にも触れない。渡すのは区間ごとの選手IDだけ** */
export async function submitLineup(_lineup: Record<number, string>): Promise<'ok' | 'closed' | 'bad'> {
  return 'ok'
}

/** 参加資格。殿堂入りが30人埋まっていること */
export function canJoin(hof: readonly HofPlayer[] | undefined): boolean {
  return (hof?.length ?? 0) >= 30
}
