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
import { rankOf, RATING_START, type RankName } from '../engine/rating'
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
  /** この大会に入ったときのレート（「第一回はここまで上がった」を出すため） */
  startRating: number
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
  /** レートの増減（前日の結果ぶん） */
  delta: number
  /** **前日からの順位の上下**（＋2＝2つ上がった／−1＝1つ下がった）。矢印はこれ1本 */
  move: number
  mine: boolean
}

export type RatedToday = {
  /** 大会の名前（第一回ベータ版ランクマッチ） */
  name: string
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
 * **大会そのものの情報。** 始まる前でも返る（イベント一覧に「9月1日から」と出すため）。
 * 大会をやっていない・通信できないときだけ null。
 */
export type RatedEventInfo = {
  name: string
  /** 開始日（`YYYY-MM-DD`） */
  startsOn: string
  totalDays: number
  /** その日ぶんの受付が始まっているか（10:00 を過ぎたか） */
  open: boolean
  /** 開催中のみ。何日目か */
  day: number
  /** 開催中のみ。締め切りまでの残り（分） */
  minutesLeft: number
  /** 開催中のみ。その日の日付 */
  dateISO: string
}

export async function fetchEvent(): Promise<RatedEventInfo | null> {
  const d = await call<{
    open: boolean; name?: string; startsOn?: string; day?: number; totalDays?: number
    dateISO?: string; minutesLeft?: number
  }>('rated_today')
  if (!d || !d.name) return null
  return {
    name: d.name,
    startsOn: d.startsOn ?? '',
    totalDays: d.totalDays ?? 0,
    open: !!d.open,
    day: d.day ?? 0,
    minutesLeft: d.minutesLeft ?? 0,
    dateISO: d.dateISO ?? '',
  }
}

/**
 * その日のコースと締め切り。**まだ 10:00 前**（か大会をやっていない）なら null。
 * コースそのものは日付から端末で作る——サーバーと同じ `ratedCourse` なので必ず一致する。
 *
 * ★`fetchEvent` と同じ rpc を1回呼ぶだけ。**大会の情報を2か所から引かないこと。**
 */
export async function fetchToday(): Promise<RatedToday | null> {
  const e = await fetchEvent()
  if (!e?.open || !e.dateISO) return null
  return {
    name: e.name,
    day: e.day,
    totalDays: e.totalDays,
    dateISO: e.dateISO,
    course: ratedCourse(e.dateISO),
    minutesLeft: e.minutesLeft,
  }
}

export async function fetchMe(): Promise<RatedMe> {
  const d = await call<{
    joined: boolean; rating?: number; overall?: number; entrants?: number
    lineup?: unknown; hof?: number; played?: number; wins?: number; startRating?: number
  }>('rated_me')
  // ★まだ一度も参加していない人は、サーバーに行が無い＝**開始レート**を出す
  //   （0を出すと「1000スタート」なのに画面だけ0になる）
  const rating = d?.rating ?? RATING_START
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
    startRating: d?.startRating ?? RATING_START,
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

/** その日の組（自分の部屋）。**組は受付が開いた10:00に決まる** */
export type RatedGroup = {
  groupNo: number
  /** その日の組の数 */
  groups: number
  /** レートの高い順。**行は順位表とまったく同じ部品で出す**（順位も増減もまだ無いので0） */
  members: RatedRow[]
}

/**
 * 自分の部屋。受付が開いていて、自分が組に入っていれば返る。
 * **null は「まだ組に入っていない」**＝10:00 より後に参加した（走るのは翌日から）。
 */
export async function fetchMyGroup(): Promise<RatedGroup | null> {
  const d = await call<{ groupNo: number; groups: number; meId: string
    members: { userId: string; rating: number; teamName: string; gmName: string
      primary: string; secondary: string; logoId: string }[] }>('rated_my_group')
  if (!d?.groupNo) return null
  // ★自分の行の印はサーバーが返した id で付ける（端末で auth を引き直さない）
  const meId = d.meId ?? ''
  return {
    groupNo: d.groupNo,
    groups: d.groups,
    members: (d.members ?? []).map(m => ({
      ...m, mine: !!meId && m.userId === meId,
      place: 0, timeSec: 0, delta: 0, move: 0,
    })),
  }
}

export type RatedStandings = {
  top: RatedRow[]
  /** 自分（トップ100に入っていれば top にも同じ人がいる） */
  me: RatedRow | null
  /** 自分の順位（1始まり）。未参加なら0 */
  meRank: number
  entrants: number
  /**
   * **もう始まっているか。** 開催前は参加者の一覧として出す（順位も増減もまだ無い）。
   * ★画面で日付から組み直さないこと（サーバーの `rated_today_jst` と物差しを揃える）
   */
  started: boolean
}

type RawRow = Omit<RatedRow, 'mine'>

export async function fetchStandings(): Promise<RatedStandings> {
  const d = await call<{ top: RawRow[]; me: RawRow | null; meRank: number; entrants: number; started?: boolean }>('rated_standings')
  const meId = d?.me?.userId ?? ''
  const mark = (r: RawRow): RatedRow => ({ ...r, mine: !!meId && r.userId === meId })
  return {
    top: (d?.top ?? []).map(mark),
    me: d?.me ? mark(d.me) : null,
    meRank: d?.meRank ?? 0,
    entrants: d?.entrants ?? 0,
    started: !!d?.started,
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

/**
 * **名前の横に出す段位のレートを、まとめて引く。**
 *
 * ★フレンド一覧のように何人も並ぶところがあるので、1人ずつ引かせない
 *   （プロフィールをまとめて引く `profilesByIds` と同じ考え方）。
 * ★**ランクマッチに一度も出ていない人は入っていません。** 呼ぶ側は
 *   「無ければ何も出さない」こと（オーナー判断・2026-08-14「何も出さない」）。
 * ★段位に直すのは `engine/rating` の `rankOf` 1本。ここはレートを渡すだけ。
 * ★取れなくても例外を投げない（段位が出ないだけで、一覧そのものは出したい）。
 */
export async function ratingsByIds(ids: readonly string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map()
  const rows = await call<{ user_id: string; rating: number }[]>('rated_ranks', { ids: [...ids] })
  return new Map((rows ?? []).map(r => [r.user_id, r.rating]))
}

/** 参加資格。殿堂入りが埋まっていること（線は `utils/hofRoster` の HOF_MAX 1本） */
export function canJoin(hof: readonly HofPlayer[] | undefined): boolean {
  return (hof?.length ?? 0) >= HOF_MAX
}
