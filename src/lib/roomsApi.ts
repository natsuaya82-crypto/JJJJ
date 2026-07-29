// オンライン対戦（部屋番号式）のサーバー窓口。
// テーブルとRPCの定義は supabase/rooms.sql にある。
//
// 役割分担
//   ・このファイル … 部屋を作る／入る／出る／キック／開始／結果確定（＝DBに残るもの）
//   ・roomChannel.ts … 試合中のリアルタイムのやりとり（＝DBに残さないもの）
import { supabase, ensureAuth } from './supabase'
import { profilesByIds, toFriend, type Friend } from './friendsApi'

/** 通信エラーをUIで扱いやすい日本語にする（friendsApi と同じ考え方） */
export class RoomsOffline extends Error {
  constructor() { super('通信できませんでした') }
}

async function uid(): Promise<string> {
  const id = await ensureAuth()
  if (!id) throw new RoomsOffline()
  return id
}

// ── ルール ──────────────────────────────────────────────
/** ホストが決める対戦ルール。rooms.rules に jsonb でそのまま入る。 */
export type MatchRules = {
  races: 1 | 3 | 5 | 10
  /** 全ロースターから選ぶ / 先に20人選抜してその中から選ぶ */
  pool: 'all' | 'select20'
  /** コースID配列（レース数ぶん）。'random' ならホストが開始時に抽選する */
  courses: 'random' | string[]
  /** CPUを足すか。0なら人間だけ */
  cpu: number
}

export const DEFAULT_RULES: MatchRules = { races: 3, pool: 'all', courses: 'random', cpu: 0 }

export type RoomStatus = 'lobby' | 'playing' | 'closed'

export type Room = {
  id: string
  code: string
  host: string
  status: RoomStatus
  rules: MatchRules
  maxPlayers: number
  expiresAt: string
}

export type RoomMember = {
  userId: string
  seat: number
  ready: boolean
  /** 離脱済み（＝不戦敗）。行は残しているので結果表示には出す */
  left: boolean
  /** プロフィール。同じ部屋にいる間だけRLSで見える */
  profile?: Friend
}

type RoomRow = {
  id: string; code: string; host: string; status: RoomStatus
  rules: MatchRules | null; max_players: number; expires_at: string
}

function toRoom(r: RoomRow): Room {
  return {
    id: r.id,
    code: r.code,
    host: r.host,
    status: r.status,
    rules: { ...DEFAULT_RULES, ...(r.rules ?? {}) },
    maxPlayers: r.max_players,
    expiresAt: r.expires_at,
  }
}

const ROOM_COLS = 'id, code, host, status, rules, max_players, expires_at'

/** 「123456」→「123 456」（表示用） */
export function formatRoomCode(code: string): string {
  const d = (code || '').replace(/\D/g, '').padStart(6, '0')
  return `${d.slice(0, 3)} ${d.slice(3)}`
}

// ── 部屋を作る／入る ────────────────────────────────────
/** 部屋を立てる。自分がホストになり、席1に入る。古い自分の部屋は自動で閉じる。 */
export async function createRoom(rules: MatchRules, maxPlayers: number): Promise<Room> {
  await uid()
  const { data, error } = await supabase.rpc('create_room', {
    p_rules: rules as unknown as object,
    p_max: Math.min(20, Math.max(3, maxPlayers)),
  })
  if (error) throw new RoomsOffline()
  const row = (Array.isArray(data) ? data[0] : data) as { room_id: string; code: string } | undefined
  if (!row?.room_id) throw new RoomsOffline()
  const room = await getRoom(row.room_id)
  if (!room) throw new RoomsOffline()
  return room
}

export type JoinResult =
  | { status: 'joined'; roomId: string; seat: number }
  | { status: 'not_found' | 'full' | 'started' | 'closed' }

/** 6桁の番号で入室する。すでに入っている部屋なら席をそのまま返す。 */
export async function joinRoom(code: string): Promise<JoinResult> {
  await uid()
  const { data, error } = await supabase.rpc('join_room', { p_code: code.replace(/\D/g, '') })
  if (error) throw new RoomsOffline()
  const row = (Array.isArray(data) ? data[0] : data) as
    { status: string; room_id: string | null; seat: number | null } | undefined
  if (row?.status === 'joined' && row.room_id) {
    return { status: 'joined', roomId: row.room_id, seat: row.seat ?? 1 }
  }
  const s = row?.status
  if (s === 'full' || s === 'started' || s === 'closed') return { status: s }
  return { status: 'not_found' }
}

/** 退室する。ホストが抜けると部屋ごと解散する（戻り値 'closed'）。 */
export async function leaveRoom(roomId: string): Promise<'left' | 'closed' | 'not_found'> {
  await uid()
  const { data, error } = await supabase.rpc('leave_room', { p_room: roomId })
  if (error) throw new RoomsOffline()
  return (data as 'left' | 'closed' | 'not_found') ?? 'not_found'
}

/** ホストが参加者を追い出す。 */
export async function kickMember(roomId: string, userId: string): Promise<'kicked' | 'not_host' | 'self' | 'not_found'> {
  await uid()
  const { data, error } = await supabase.rpc('kick_member', { p_room: roomId, p_user: userId })
  if (error) throw new RoomsOffline()
  return (data as 'kicked' | 'not_host' | 'self' | 'not_found') ?? 'not_found'
}

/** ホストが試合を開始する。以後この部屋には新規入室できない。 */
export async function startRoom(roomId: string, rules: MatchRules): Promise<'started' | 'not_host' | 'empty' | 'not_found'> {
  await uid()
  const { data, error } = await supabase.rpc('start_room', {
    p_room: roomId, p_rules: rules as unknown as object,
  })
  if (error) throw new RoomsOffline()
  return (data as 'started' | 'not_host' | 'empty' | 'not_found') ?? 'not_found'
}

// ── 部屋の中身を読む ────────────────────────────────────
export async function getRoom(roomId: string): Promise<Room | undefined> {
  await uid()
  const { data, error } = await supabase.from('rooms').select(ROOM_COLS).eq('id', roomId).maybeSingle()
  if (error) throw new RoomsOffline()
  return data ? toRoom(data as RoomRow) : undefined
}

/** 参加者一覧（席順）。プロフィールも一緒に引く。 */
export async function listMembers(roomId: string): Promise<RoomMember[]> {
  await uid()
  const { data, error } = await supabase
    .from('room_members').select('user_id, seat, ready, left_at').eq('room_id', roomId)
  if (error) throw new RoomsOffline()
  const rows = (data ?? []) as { user_id: string; seat: number; ready: boolean; left_at: string | null }[]

  const profiles = await profilesByIds(rows.map(r => r.user_id))
  const byId = new Map(profiles.map(p => [p.user_id, toFriend(p)]))

  return rows
    .map(r => ({ userId: r.user_id, seat: r.seat, ready: r.ready, left: !!r.left_at, profile: byId.get(r.user_id) }))
    .sort((a, b) => a.seat - b.seat)
}

/** 相手のロスター（同じ部屋にいる間だけ見える）。実体は friendsApi と同じ rosters テーブル。 */
export { getFriendRoster as getMemberRoster } from './friendsApi'

/** 準備完了ボタン。自分の行だけ更新できる。 */
export async function setReady(roomId: string, ready: boolean): Promise<void> {
  const me = await uid()
  const { error } = await supabase
    .from('room_members').update({ ready }).eq('room_id', roomId).eq('user_id', me)
  if (error) throw new RoomsOffline()
}

// ── 結果を確定する（ホストのみ） ────────────────────────
export type MatchResultEntry = {
  user_id: string
  rank: number
  points: number
  /** 切断による不戦敗 */
  forfeit: boolean
}

/**
 * シリーズ終了時にホストが1回だけ呼ぶ。
 * 部屋にいなかったIDを混ぜても無視されるし、二重に呼ぶと例外になる（サーバー側で防いでいる）。
 */
export async function finishMatch(
  roomId: string, summary: unknown, results: MatchResultEntry[],
): Promise<string> {
  await uid()
  const { data, error } = await supabase.rpc('finish_match', {
    p_room: roomId,
    p_summary: (summary ?? {}) as object,
    p_results: results as unknown as object,
  })
  if (error) throw new RoomsOffline()
  return data as string
}

/** 自分の通算対戦成績 */
export type MatchStats = { played: number; wins: number; forfeits: number }

export async function myMatchStats(): Promise<MatchStats> {
  const me = await uid()
  const { data, error } = await supabase
    .from('profiles').select('mp_played, mp_wins, mp_forfeits').eq('user_id', me).maybeSingle()
  if (error) throw new RoomsOffline()
  const r = data as { mp_played?: number; mp_wins?: number; mp_forfeits?: number } | null
  return { played: r?.mp_played ?? 0, wins: r?.mp_wins ?? 0, forfeits: r?.mp_forfeits ?? 0 }
}
