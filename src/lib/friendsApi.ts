// フレンド機能のサーバー窓口。mockFriends.ts の置き換え。
// UI側の型（Friend / FriendRequest）はモック時代と同じ形のまま維持して、
// 画面側の書き換えを最小限にしている。
import type { Division, HofPlayer, Player, Team } from '../types'
import { supabase, ensureAuth } from './supabase'
import { withoutBlocked } from './moderationApi'
import { defaultLogoIdFor, hashedLogoIdFor } from '../data/logoPresets'

export type Friend = {
  id: string
  code: string            // 数字10桁（表示は5桁ずつ区切り）
  teamName: string
  shortName: string
  gmName: string
  logoId: string
  primary: string
  secondary: string
  /**
   * 通算優勝の**合計**（全部の部を足したもの）。
   * ★**画面に出さないこと。** 3部優勝と1部優勝が同じ1回として混ざる。
   *   古いアプリが読んでいるので送るのは止めないが、見せる先はもう無い。
   */
  champs: number
  /**
   * **部ごとの通算優勝。**古いセーブ／古い版から来た相手は空。
   * ★フレンドに見せるところは**1部の回数だけ**を「◯回」で出す
   *   （`utils/teamHistory` の `topTitleCount`。オーナー判断・2026-08-14
   *   「3部の優勝と1部の優勝が並ぶ意味がわからない。1部だけでいいって判断」）。
   *   部ごとに並べるのは記録室・チーム詳細・歴代優勝・記録のハブだけ（`titleRows`）。
   */
  titles: Partial<Record<Division, number>>
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
  /** 部ごとの通算優勝。列を足す前に作られた行は null で返る */
  titles?: Partial<Record<Division, number>> | null
  avg_ovr: number
  updated_at?: string
}

// ── 表示用ヘルパー ──────────────────────────────────────
/** 「4820379165」→「48203 79165」 */
export function formatCode(code: string): string {
  const d = (code || '').replace(/\D/g, '').padStart(10, '0')
  return `${d.slice(0, 5)} ${d.slice(5)}`
}

/** ISO時刻から「3時間前」「昨日」などの相対表示を作る（時刻の相対表示はこの1本） */
export function relativeTime(iso?: string): string {
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
    // 既にサーバーへ logo_01 で保存されてしまっている人の救済も兼ねる。
    // ここではチームIDが手に入らないので、user_id からプリセットを散らす
    // （次にそのユーザーがログインすれば pushMyProfile が 'team:<id>' で上書きする）
    logoId: r.logo_id && r.logo_id !== 'logo_01' ? r.logo_id : hashedLogoIdFor(r.user_id),
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
    champs: r.champs ?? 0,
    // 内訳が無い相手（古い版）は空。画面が合計へ落とす
    titles: r.titles ?? {},
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
    // 既にサーバーへ logo_01 で保存されてしまっている人の救済も兼ねる。
    // ここではチームIDが手に入らないので、user_id からプリセットを散らす
    // （次にそのユーザーがログインすれば pushMyProfile が 'team:<id>' で上書きする）
    logoId: r.logo_id && r.logo_id !== 'logo_01' ? r.logo_id : hashedLogoIdFor(r.user_id),
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
  }
}

const PROFILE_COLS =
  'user_id, code, team_name, short_name, gm_name, logo_id, color_primary, color_secondary, champs, titles, avg_ovr, updated_at'

/** 通信エラーをUIで扱いやすい日本語にする */
export class FriendsOffline extends Error {
  /** サーバーが返した本当の文言。原因を追うときだけ画面に小さく出す */
  detail?: string
  constructor(detail?: string) {
    super('通信できませんでした')
    this.detail = detail || undefined
  }
}

/** 例外から、サーバーが返した本当の文言だけを取り出す（無ければ空） */
export function offlineDetail(e: unknown): string {
  return e instanceof FriendsOffline ? (e.detail ?? '') : ''
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
/**
 * 自分のチーム情報をサーバーへ反映。
 *
 * ★**優勝は合計と部ごとの両方を送る。** `champs`（合計）は古いアプリが読んでいるので
 *   止めない。`titles`（部ごと）が新しい版の見るほう。片方だけにすると、
 *   古い版の画面から数字が消えるか、新しい版で部が混ざるかのどちらかになる。
 */
export async function pushMyProfile(
  team: Team | undefined, avgOvr: number, champs: number,
  titles: Partial<Record<Division, number>> = {},
): Promise<void> {
  if (!team) return
  const me = await uid()
  await ensureMyProfile()
  const { error } = await supabase.from('profiles').update({
    team_name: team.name,
    short_name: team.shortName,
    gm_name: team.gmName,
    // ロゴ未選択のとき logo_01 固定にしていたため、オンライン上で全員同じ絵になっていた。
    // チームIDから決める（ローカルの未選択表示も同じ考え方でハッシュから散らしている）
    logo_id: team.logoId ?? defaultLogoIdFor(team.id),
    color_primary: team.colors.primary,
    color_secondary: team.colors.secondary,
    champs,
    titles,
    avg_ovr: avgOvr,
  }).eq('user_id', me)
  if (error) throw new FriendsOffline()
}

/**
 * 自分のロスターと殿堂入りチーム（スナップショット）をサーバーへ反映。
 *
 * 殿堂入りを同じ行に相乗りさせているのは、見せたい相手（フレンドと同じ走友会の人）が
 * ロスターとまったく同じで、その決まりが rosters のポリシー3つにもう書いてあるため。
 * 別のテーブルにすると同じ決まりを2か所に書くことになる（supabase/hof_share.sql）。
 */
export async function pushMyRoster(players: Player[], hof: readonly HofPlayer[] = []): Promise<void> {
  const me = await uid()
  const { error } = await supabase
    .from('rosters')
    .upsert({
      user_id: me,
      players: players as unknown as object,
      hof: hof as unknown as object,
    }, { onConflict: 'user_id' })
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
  const list = rows.map(toFriend).sort((a, b) => a.teamName.localeCompare(b.teamName, 'ja'))
  return withoutBlocked(list, f => f.id)
}

export async function getFriend(id: string | undefined): Promise<Friend | undefined> {
  if (!id) return undefined
  const rows = await profilesByIds([id])
  return rows[0] ? toFriend(rows[0]) : undefined
}

/** 相手が見せているもの。ロスターと殿堂入りチームは同じ行に入っている */
export type SharedRoster = { players: Player[]; hof: HofPlayer[] }

/**
 * 相手のロスターと殿堂入りチーム。**読み取りはここ1本**。
 * フレンドか、同じ走友会の人でないとRLSで弾かれて空になる
 * （rosters_select_friend / rosters_select_clubmate）。
 *
 * 相手が古いバージョンだと hof の列が空のままなので、その場合は殿堂入りが0人になる。
 */
export async function getFriendShare(id: string): Promise<SharedRoster> {
  await uid()
  const { data, error } = await supabase
    .from('rosters').select('players, hof').eq('user_id', id).maybeSingle()
  if (error) throw new FriendsOffline()
  const players = (data?.players ?? []) as Player[]
  const hof = (data?.hof ?? []) as HofPlayer[]
  return {
    players: Array.isArray(players) ? players : [],
    // 中身の形が違う古い行を掴んでも画面が落ちないようにする（選手が入っていない要素は捨てる）
    hof: Array.isArray(hof) ? hof.filter(h => h && typeof h === 'object' && h.player?.id) : [],
  }
}

/** フレンドのロスターだけ要るとき（オンライン対戦のロビーなど） */
export async function getFriendRoster(id: string): Promise<Player[]> {
  return (await getFriendShare(id)).players
}

// ── 申請 ────────────────────────────────────────────
export async function listReceived(): Promise<FriendRequest[]> {
  const me = await uid()
  const { data, error } = await supabase
    .from('friend_requests').select('from_user').eq('to_user', me)
  if (error) throw new FriendsOffline()
  const rows = await profilesByIds((data ?? []).map(r => r.from_user as string))
  return withoutBlocked(rows.map(toRequest), r => r.id)
}

export async function listSent(): Promise<FriendRequest[]> {
  const me = await uid()
  const { data, error } = await supabase
    .from('friend_requests').select('to_user').eq('from_user', me)
  if (error) throw new FriendsOffline()
  const rows = await profilesByIds((data ?? []).map(r => r.to_user as string))
  return withoutBlocked(rows.map(toRequest), r => r.id)
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

// 申請の結果をどう伝えるか。コード入力・走友会のメンバー一覧・フレンド詳細と
// 送る場所が増えたので、言い方はここ1本に置く（画面ごとに書き分けるとズレる）
export const SEND_RESULT_TEXT: Record<SendResult, { title: string; message?: string }> = {
  sent: { title: '申請を送りました', message: '相手が承認するとフレンドになります' },
  accepted: { title: 'フレンドになりました', message: '相手からも申請が届いていたので、その場で成立しました' },
  already_friends: { title: 'すでにフレンドです' },
  self: { title: '自分のコードです' },
  not_found: { title: 'そのコードのGMは見つかりませんでした' },
}

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
