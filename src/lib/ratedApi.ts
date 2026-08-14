// ============================================================================
// レート戦のサーバーとのやりとり。
//
// ★**判断はここに書きません。** 段位もグループ分けもレートも `engine/rating`、
//   コースは `engine/ratedCourse`。ここがやるのは「呼ぶ」「形をそろえる」だけです。
//
// ★**端末が送れるのは提出だけ**（`rated_submit`）。順位もタイムもレートも
//   サーバー（Edge Function `rated-tick`）が書きます。端末がタイムを申告する形だと、
//   書き換えれば1位になれるためです。
//
// ★通信できないときは**黙って落ちる**（`null` / joined:false）ようにしてあります。
//   画面はオフラインとして出せばよく、仮のデータで埋めないこと
//   （前は丸ごと作り話を返していて、動いているように見えてしまいました）。
// ============================================================================
import { supabase, ensureAuth } from './supabase'
import { ratedCourse, ratedMatchCourse, ratedCourseOf } from '../engine/ratedCourse'
import type { MatchRacePayload } from './matchSim'
import { rankOf, type RankName } from '../engine/rating'
import { HOF_MAX } from '../utils/hofRoster'
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
  /** サーバーが数えた殿堂入りの人数（参加資格の判定に使う） */
  hof: number
  /** 走った日数・グループ1位の回数 */
  played: number
  wins: number
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
  /** 自分のID。**名前で探さないこと**（同じチーム名の人がいる） */
  meUserId: string
  /** レートの増減（userId → 増減）。レート戦だけの追加ぶん */
  delta: Record<string, number>
}

// コースの引き方は engine（アプリもサーバーも同じ1本）。ここは通り道として残す
export { ratedMatchCourse, ratedCourseOf }

/** rpc を1回呼ぶ。ログインできない・通信できないときは null（例外は投げない） */
async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    if (!(await ensureAuth())) return null
    const { data, error } = await supabase.rpc(fn, args ?? {})
    if (error) { console.warn(`[rated] ${fn}`, error.message); return null }
    return (data ?? null) as T | null
  } catch (e) {
    console.warn(`[rated] ${fn}`, e)
    return null
  }
}

/** 区間番号のキーを数値に戻す（jsonb は文字列キーで返ってくる） */
function toLineup(o: unknown): Record<number, string> {
  const out: Record<number, string> = {}
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) out[Number(k)] = String(v)
  }
  return out
}

/**
 * その日のコースと締め切り。**まだ 10:00 前**（か大会をやっていない）なら null。
 * コースそのものは日付から端末で作る——サーバーと同じ `ratedCourse` なので必ず一致する。
 */
export async function fetchToday(): Promise<RatedToday | null> {
  const d = await call<{
    open: boolean; day?: number; totalDays?: number; dateISO?: string; minutesLeft?: number
  }>('rated_today')
  if (!d?.open || !d.dateISO) return null
  return {
    day: d.day ?? 0,
    totalDays: d.totalDays ?? 0,
    dateISO: d.dateISO,
    course: ratedCourse(d.dateISO),
    minutesLeft: d.minutesLeft ?? 0,
  }
}

export async function fetchMe(): Promise<RatedMe> {
  const d = await call<{
    joined: boolean; rating?: number; overall?: number; entrants?: number
    lineup?: unknown; hof?: number; played?: number; wins?: number
  }>('rated_me')
  const rating = d?.rating ?? 0
  return {
    joined: !!d?.joined,
    rating,
    rank: rankOf(rating),
    overall: d?.overall ?? 0,
    entrants: d?.entrants ?? 0,
    lineup: toLineup(d?.lineup),
    hof: d?.hof ?? 0,
    played: d?.played ?? 0,
    wins: d?.wins ?? 0,
  }
}

/** 参加する。'ok' / 'hof' 殿堂入りが足りない / 'closed' 大会をやっていない / 'auth' */
export async function joinRated(): Promise<'ok' | 'hof' | 'closed' | 'auth' | 'offline'> {
  const r = await call<string>('rated_join')
  return (r as 'ok' | 'hof' | 'closed' | 'auth') ?? 'offline'
}

/** いちばん新しい走り終わった日の、自分がいたグループの結果。無ければ null */
export async function fetchResult(): Promise<RatedResult | null> {
  const d = await call<{
    dateISO: string; group: number; groups: number
    race: MatchRacePayload | null; meUserId: string; delta: Record<string, number>
  }>('rated_result')
  if (!d?.dateISO || !d.race) return null
  return {
    dateISO: d.dateISO,
    course: ratedCourse(d.dateISO),
    group: d.group,
    groups: d.groups ?? 1,
    race: d.race,
    meUserId: d.meUserId,
    delta: d.delta ?? {},
  }
}

/**
 * 大会全体の順位表。**トップ100と自分だけ**（オーナー判断）。
 * 参加者が増えても全員ぶんを配らない。
 */
export const STANDINGS_TOP = 100

export type RatedStandings = {
  top: RatedRow[]
  /** 自分（トップ100に入っていれば top にも同じ人がいる） */
  me: RatedRow | null
  /** 自分の順位（1始まり）。未参加なら0 */
  meRank: number
  entrants: number
}

type RawRow = Omit<RatedRow, 'mine'>

export async function fetchStandings(): Promise<RatedStandings> {
  const d = await call<{ top: RawRow[]; me: RawRow | null; meRank: number; entrants: number }>('rated_standings')
  const meId = d?.me?.userId ?? ''
  const mark = (r: RawRow): RatedRow => ({ ...r, mine: !!meId && r.userId === meId })
  return {
    top: (d?.top ?? []).map(mark),
    me: d?.me ? mark(d.me) : null,
    meRank: d?.meRank ?? 0,
    entrants: d?.entrants ?? 0,
  }
}

/**
 * 提出する。**タイムにも順位にも触れない。渡すのは区間ごとの選手IDだけ**。
 *   'ok' / 'closed' 締め切り後 / 'bad' 区間数が合わない / 'join' 未参加
 */
export async function submitLineup(lineup: Record<number, string>): Promise<'ok' | 'closed' | 'bad' | 'join' | 'offline'> {
  const body: Record<string, string> = {}
  for (const [k, v] of Object.entries(lineup)) body[String(k)] = v
  const r = await call<string>('rated_submit', { l: body })
  return (r as 'ok' | 'closed' | 'bad' | 'join') ?? 'offline'
}

/** 参加資格。殿堂入りが埋まっていること（線は `utils/hofRoster` の HOF_MAX 1本） */
export function canJoin(hof: readonly HofPlayer[] | undefined): boolean {
  return (hof?.length ?? 0) >= HOF_MAX
}
