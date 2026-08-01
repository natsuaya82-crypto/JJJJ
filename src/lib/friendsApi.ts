// フレンド機能のサーバー窓口。mockFriends.ts の置き換え。
// UI側の型（Friend / FriendRequest）はモック時代と同じ形のまま維持して、
// 画面側の書き換えを最小限にしている。
import type { Player, Team } from '../types'
import { supabase, ensureAuth } from './supabase'

export type Friend = {
  id: string
  code: string            // 数字10桁（表示は5桁ずつ区切り）
  teamName: string
  shortName: string
  gmName: string
  logoId: string
  primary: string
  secondary: string
  champs: number
  lastLogin: string       // updated_at から算出した表示用の文字列
}

export type FriendRequest = {
  id: string; code: string; teamName: string; shortName: string; gmName: string
  logoId: string; primary: string; secondary: string
}

export type ProfileRow = {
  user_id: string
  code: string
  team_name: string
  short_name: string
  gm_name: string
  logo_id: string
  color_primary: string
  color_secondary: string
  champs: number
  avg_ovr: number
  updated_at?: string
}

// ── 表示用ヘルパー ──────────────────────────────────────
/** 「4820379165」→「48203 79165」 */
export function formatCode(code: string): string {
  const d = (code || '').replace(/\D/g, '').padStart(10, '0')
  return `${d.slice(0, 5)} ${d.slice(5)}`
}

/** updated_at から「3時間前」「昨日」などの表示を作る */
function relativeTime(iso?: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return '—'
  const min = Math.floor((Date.now() - t) / 60000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}時間前`
  const day = Math.floor(hour / 24)
  if (day === 1) return '昨日'
  if (day < 30) return `${day}日前`
  const mon = Math.floor(day / 30)
  if (mon < 12) return `${mon}ヶ月前`
  return `${Math.floor(mon / 12)}年前`
}

export function toFriend(r: ProfileRow): Friend {
  return {
    id: r.user_id,
    code: r.code,
    teamName: r.team_name || '無名チーム',
    shortName: r.short_name || '—',
    gmName: r.gm_name || '—',
    logoId: r.logo_id || 'logo_01',
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
    champs: r.champs ?? 0,
    lastLogin: relativeTime(r.updated_at),
  }
}

function toRequest(r: ProfileRow): FriendRequest {
  return {
    id: r.user_id,
    code: r.code,
    teamName: r.team_name || '無名チーム',
    shortName: r.short_name || '—',
    gmName: r.gm_name || '—',
    logoId: r.logo_id || 'logo_01',
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
  }
}

const PROFILE_COLS =
  'user_id, code, team_name, short_name, gm_name, logo_id, color_primary, color_secondary, champs, avg_ovr, updated_at'

/** 通信エラーをUIで扱いやすい日本語にする */
export class FriendsOffline extends Error {
  constructor() { super('通信できませんでした') }
}

async function uid(): Promise<string> {
  const id = await ensureAuth()
  if (!id) throw new FriendsOffline()
  return id
}

// ── 自分のプロフィール ────────────────────────────────
/**
 * 自分の profiles 行を用意する（無ければ作る）。フレンドコードはサーバー側で採番。
 */
export async function ensureMyProfile(): Promise<ProfileRow> {
  const me = await uid()
  const { data, error } = await supabase
    .from('profiles').select(PROFILE_COLS).eq('user_id', me).maybeSingle()
  if (error) throw new FriendsOffline()
  if (data) return data as ProfileRow

  const { data: created, error: insErr } = await supabase
    .from('profiles').insert({ user_id: me }).select(PROFILE_COLS).single()
  if (insErr) throw new FriendsOffline()
  return created as ProfileRow
}

/** 自分のフレンドコード（表示整形済み） */
export async function myCode(): Promise<string> {
  return formatCode((await ensureMyProfile()).code)
}

/** 自チーム情報をサーバーへ反映（フレンド一覧・詳細のヘッダーに出る） */
export async function pushMyProfile(team: Team | undefined, avgOvr: number, champs: number): Promise<void> {
  if (!team) return
  const me = await uid()
  await ensureMyProfile()
  const { error } = await supabase.from('profiles').update({
    team_name: team.name,
    short_name: team.shortName,
    gm_name: team.gmName,
    logo_id: team.logoId ?? 'logo_01',
    color_primary: team.colors.primary,
    color_secondary: team.colors.secondary,
    champs,
    avg_ovr: avgOvr,
  }).eq('user_id', me)
  if (error) throw new FriendsOffline()
}

/** 自分のロスター（スナップショット）をサーバーへ反映 */
export async function pushMyRoster(players: Player[]): Promise<void> {
  const me = await uid()
  const { error } = await supabase
    .from('rosters')
    .upsert({ user_id: me, players: players as unknown as object }, { onConflict: 'user_id' })
  if (error) throw new FriendsOffline()
}

// ── フレンド一覧 ──────────────────────────────────────
/** まとめてプロフィールを引く。オンライン対戦のロビー表示でも使うので export している。 */
export async function profilesByIds(ids: string[]): Promise<ProfileRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).in('user_id', ids)
  if (error) throw new FriendsOffline()
  return (data ?? []) as ProfileRow[]
}

export async function listFriends(): Promise<Friend[]> {
  const me = await uid()
  const { data, error } = await supabase
    .from('friendships').select('friend_id').eq('user_id', me)
  if (error) throw new FriendsOffline()
  const rows = await profilesByIds((data ?? []).map(r => r.friend_id as string))
  return rows.map(toFriend).sort((a, b) => a.teamName.localeCompare(b.teamName, 'ja'))
}

export async function getFriend(id: string | undefined): Promise<Friend | undefined> {
  if (!id) return undefined
  const rows = await profilesByIds([id])
  return rows[0] ? toFriend(rows[0]) : undefined
}

/** フレンドのロスター。フレンド成立済みでないとRLSで弾かれて空になる。 */
export async function getFriendRoster(id: string): Promise<Player[]> {
  await uid()
  const { data, error } = await supabase
    .from('rosters').select('players').eq('user_id', id).maybeSingle()
  if (error) throw new FriendsOffline()
  const players = (data?.players ?? []) as Player[]
  return Array.isArray(players) ? players : []
}

// ── 申請 ────────────────────────────────────────────
export async function listReceived(): Promise<FriendRequest[]> {
  const me = await uid()
  const { data, error } = await supabase
    .from('friend_requests').select('from_user').eq('to_user', me)
  if (error) throw new FriendsOffline()
  const rows = await profilesByIds((data ?? []).map(r => r.from_user as string))
  return rows.map(toRequest)
}

export async function listSent(): Promise<FriendRequest[]> {
  const me = await uid()
  const { data, error } = await supabase
    .from('friend_requests').select('to_user').eq('from_user', me)
  if (error) throw new FriendsOffline()
  const rows = await profilesByIds((data ?? []).map(r => r.to_user as string))
  return rows.map(toRequest)
}

/** コードから相手を探すだけ（申請はしない）。申請前の確認画面に出す用。 */
export async function findByCode(code: string): Promise<FriendRequest | undefined> {
  await uid()
  const { data, error } = await supabase.rpc('find_by_code', { p_code: code.replace(/\D/g, '') })
  if (error) throw new FriendsOffline()
  const row = (Array.isArray(data) ? data[0] : data) as ProfileRow | undefined
  return row ? toRequest(row) : undefined
}

export type SendResult = 'sent' | 'accepted' | 'already_friends' | 'self' | 'not_found'

/** コードで申請を送る。相手からも申請が来ていた場合はその場で成立する。 */
export async function sendRequest(code: string): Promise<SendResult> {
  await uid()
  await ensureMyProfile()   // 相手が自分を見られるよう、先に自分の行を作っておく
  const { data, error } = await supabase.rpc('send_friend_request', { p_code: code.replace(/\D/g, '') })
  if (error) throw new FriendsOffline()
  return (data as SendResult) ?? 'not_found'
}

export async function acceptRequest(fromId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('accept_friend_request', { p_from: fromId })
  if (error) throw new FriendsOffline()
}

/** 受け取った申請を拒否する */
export async function rejectRequest(fromId: string): Promise<void> {
  const me = await uid()
  const { error } = await supabase
    .from('friend_requests').delete().eq('from_user', fromId).eq('to_user', me)
  if (error) throw new FriendsOffline()
}

/** 送った申請を取り消す */
export async function cancelRequest(toId: string): Promise<void> {
  const me = await uid()
  const { error } = await supabase
    .from('friend_requests').delete().eq('from_user', me).eq('to_user', toId)
  if (error) throw new FriendsOffline()
}

export async function removeFriend(friendId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('remove_friend', { p_friend: friendId })
  if (error) throw new FriendsOffline()
}
