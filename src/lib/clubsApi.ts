// 走友会（所属のみ）のサーバー窓口。supabase/clubs.sql と対になっている。
// 探して入る形。対抗戦などの競技要素はここには無い。
import { supabase, ensureAuth } from './supabase'
import {
  FriendsOffline, ensureMyProfile, profilesByIds, toFriend,
  type Friend, type ProfileRow,
} from './friendsApi'
import { blockedIds, withoutBlocked } from './moderationApi'
import { normalizeClubLogoId } from '../data/clubLogos'
import type { CardStatKey, TrainingCard } from '../types'

/** 走友会の人数上限。clubs.sql の 30 とそろえること（DB側の関数も30に更新が必要） */
export const CLUB_MAX = 30

/** 参加タイプ。誰でも歓迎 / 承認制 / 募集停止 */
export type JoinType = 'open' | 'approval' | 'closed'

export const JOIN_TYPE_LABEL: Record<JoinType, string> = {
  open: '誰でも歓迎',
  approval: '承認制',
  closed: '募集停止',
}

/** 検索結果1件ぶん（＝走友会の見た目の情報） */
export type ClubBrief = {
  id: string
  code: string
  name: string
  note: string
  logoId: string
  joinType: JoinType
  minOvr: number
  members: number
  avgOvr: number
}

export type Club = ClubBrief & { ownerId: string }

/** 走友会での役割。owner＝会長 / admin＝副会長 / member＝一般 */
export type ClubRole = 'owner' | 'admin' | 'member'

export const CLUB_ROLE_LABEL: Record<ClubRole, string> = {
  owner: '会長',
  admin: '副会長',
  member: '',
}

/** 副会長の人数の上限。clubs_roles.sql の 3 とそろえること */
export const CLUB_ADMIN_MAX = 3

/** メンバー1人ぶん。表示に必要なものはフレンドと同じなので Friend を土台にする */
export type ClubMember = Friend & {
  role: ClubRole
  joinedAt: string
  /** 自分がブロックした相手。名前を伏せて出す（人数は変えたくないので一覧からは消さない） */
  blocked: boolean
}

export type MyClub = {
  club: Club
  members: ClubMember[]
  isOwner: boolean
  /** 自分の役割 */
  myRole: ClubRole
  /** 設定・加入申請・メンバーを外す ができる人（＝会長か副会長） */
  canEdit: boolean
  /** いまの副会長の人数 */
  adminCount: number
  /** 自分の利用者id。メンバー一覧で自分の行にだけメニューを出さないために使う */
  meId: string
}

/** 走友会の設定（作るときも直すときも同じ形） */
export type ClubForm = {
  name: string
  note: string
  logoId: string
  joinType: JoinType
  minOvr: number
}

type BriefRow = {
  id: string; code: string; name: string; note: string; logo_id: string
  join_type: JoinType; min_ovr: number; members: number; avg_ovr: number
}

async function uid(): Promise<string> {
  const id = await ensureAuth()
  if (!id) throw new FriendsOffline()
  return id
}

function toBrief(r: BriefRow): ClubBrief {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    note: r.note ?? '',
    logoId: normalizeClubLogoId(r.logo_id),
    joinType: r.join_type ?? 'open',
    minOvr: r.min_ovr ?? 0,
    members: r.members ?? 0,
    avgOvr: r.avg_ovr ?? 0,
  }
}

// ── 探す ──────────────────────────────────────────────
/**
 * 走友会を探す。空文字なら「おすすめ」（募集中で人数の多い順）。
 * 数字10桁を渡せばコード検索になる。
 */
export async function searchClubs(q = ''): Promise<ClubBrief[]> {
  await uid()
  const { data, error } = await supabase.rpc('search_clubs', { p_q: q.trim(), p_limit: 30 })
  if (error) throw new FriendsOffline()
  return ((data ?? []) as BriefRow[]).map(toBrief)
}

/** コードちょうど1件 */
export async function findClubByCode(code: string): Promise<ClubBrief | undefined> {
  await uid()
  const { data, error } = await supabase.rpc('find_club_by_code', { p_code: code.replace(/\D/g, '') })
  if (error) throw new FriendsOffline()
  const row = (Array.isArray(data) ? data[0] : data) as BriefRow | undefined
  return row ? toBrief(row) : undefined
}

/** 自分がいま申請を出している走友会のid一覧（ボタンを「申請中」に変えるため） */
export async function myClubRequests(): Promise<string[]> {
  await uid()
  const { data, error } = await supabase.rpc('my_club_requests')
  if (error) throw new FriendsOffline()
  return ((data ?? []) as { club_id: string }[]).map(r => r.club_id)
}

// ── 自分の走友会 ───────────────────────────────────────
/** 自分が入っている走友会とメンバー一覧。どこにも入っていなければ null。 */
export async function myClub(): Promise<MyClub | null> {
  const me = await uid()
  const { data: mine, error: mErr } = await supabase
    .from('club_members').select('club_id').eq('user_id', me).maybeSingle()
  if (mErr) throw new FriendsOffline()
  if (!mine) return null

  const clubId = mine.club_id as string
  const [{ data: clubRow, error: cErr }, { data: memberRows, error: lErr }] = await Promise.all([
    supabase.from('clubs')
      .select('id, code, name, note, logo_id, join_type, min_ovr, members, owner')
      .eq('id', clubId).maybeSingle(),
    supabase.from('club_members').select('user_id, role, joined_at').eq('club_id', clubId),
  ])
  if (cErr || lErr) throw new FriendsOffline()
  if (!clubRow) return null

  const rows = (memberRows ?? []) as { user_id: string; role: ClubRole; joined_at: string }[]
  const profiles = await profilesByIds(rows.map(r => r.user_id))
  const byId = new Map(profiles.map(p => [p.user_id, p]))

  const avg = profiles.length
    ? Math.round(profiles.reduce((s, p) => s + (p.avg_ovr ?? 0), 0) / profiles.length)
    : 0
  const club: Club = {
    ...toBrief({ ...(clubRow as unknown as BriefRow), avg_ovr: avg }),
    ownerId: (clubRow as unknown as { owner: string }).owner,
  }

  const blocked = await blockedIds()
  const members: ClubMember[] = rows.map(r => {
    const p = byId.get(r.user_id)
    const base = p
      ? toFriend(p)
      : {
          id: r.user_id, code: '', teamName: '（読み込めません）', shortName: '—', gmName: '—',
          logoId: 'logo_01', primary: '#122440', secondary: '#f5c842', champs: 0, titles: {}, lastLogin: '—',
        }
    return { ...base, role: r.role, joinedAt: r.joined_at, blocked: blocked.has(r.user_id) }
  })
  // 会長・副会長・一般の順。同じ役割のなかは加入が早い順
  const rank = (r: ClubRole) => (r === 'owner' ? 0 : r === 'admin' ? 1 : 2)
  members.sort((a, b) => rank(a.role) - rank(b.role) || a.joinedAt.localeCompare(b.joinedAt))

  const myRole: ClubRole = members.find(m => m.id === me)?.role ?? 'member'
  return {
    club,
    members,
    isOwner: club.ownerId === me,
    myRole,
    canEdit: myRole === 'owner' || myRole === 'admin',
    adminCount: members.filter(m => m.role === 'admin').length,
    meId: me,
  }
}

// ── 入る前に中身を見る（長押しのプレビュー） ─────────────
/**
 * **入っていない走友会のメンバーを覗く。**
 * オーナー・2026-08-15「入るしかないせいで中身が見れない。誰がいてどういう
 * 自己紹介か長押しで見れるようにしてほしい」。
 *
 * ★**フレンドコードは返ってきません**（サーバー側で外してある）。
 *   一覧を舐めるだけで誰にでも申請が送れてしまうため。`code` は空文字になるので、
 *   `MemberRow` の「＋フレンド」は自然に出ません（`m.code !== ''` の条件）。
 * ★見えるのはメンバーだけ。掲示板・カードは入ってから。
 */
export async function clubPreview(clubId: string): Promise<ClubMember[]> {
  await uid()
  const { data, error } = await supabase.rpc('club_preview', { p_club: clubId })
  if (error) throw new FriendsOffline()
  const rows = (data ?? []) as (Omit<ProfileRow, 'code'> & { role: ClubRole; joined_at: string })[]
  const blocked = await blockedIds()
  return rows.map(r => ({
    ...toFriend({ ...r, code: '' } as ProfileRow),
    role: r.role,
    joinedAt: r.joined_at,
    blocked: blocked.has(r.user_id),
  }))
}

// ── 作る・入る ────────────────────────────────────────
/** 走友会を作る。作った人が会長になる */
export async function createClub(f: ClubForm): Promise<void> {
  await uid()
  await ensureMyProfile()   // メンバー一覧に自分が出るよう、先に profiles を作っておく
  const { error } = await supabase.rpc('create_club', {
    p_name: f.name.trim(), p_note: f.note, p_logo: f.logoId,
    p_join_type: f.joinType, p_min_ovr: f.minOvr,
  })
  if (error) throw new FriendsOffline()
}

export type JoinResult = 'joined' | 'requested' | 'already' | 'full' | 'closed' | 'low_ovr' | 'not_found'

/** 入る。承認制なら申請だけ出して 'requested' が返る */
export async function joinClub(clubId: string): Promise<JoinResult> {
  await uid()
  await ensureMyProfile()
  const { data, error } = await supabase.rpc('join_club', { p_club: clubId })
  if (error) throw new FriendsOffline()
  return (data as JoinResult) ?? 'not_found'
}

/** 出した申請を取り消す */
export async function cancelClubRequest(clubId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('cancel_club_request', { p_club: clubId })
  if (error) throw new FriendsOffline()
}

// ── 承認（会長だけ） ───────────────────────────────────
export type ClubApplicant = Friend & { avgOvr: number }

/** 自分の走友会に来ている加入申請 */
export async function listClubRequests(): Promise<ClubApplicant[]> {
  await uid()
  const { data, error } = await supabase.rpc('list_club_requests')
  if (error) throw new FriendsOffline()
  return ((data ?? []) as ProfileRow[]).map(p => ({ ...toFriend(p), avgOvr: p.avg_ovr ?? 0 }))
}

export async function approveClubRequest(userId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('approve_club_request', { p_user: userId })
  if (error) throw new FriendsOffline()
}

export async function rejectClubRequest(userId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('reject_club_request', { p_user: userId })
  if (error) throw new FriendsOffline()
}

// ── 抜ける・外す・設定 ─────────────────────────────────
export type LeaveResult = 'left' | 'disbanded' | 'not_in_club'

/** 抜ける。会長が抜けたら次の人に引き継ぎ、最後の1人なら解散 */
export async function leaveClub(): Promise<LeaveResult> {
  await uid()
  const { data, error } = await supabase.rpc('leave_club')
  if (error) throw new FriendsOffline()
  return (data as LeaveResult) ?? 'not_in_club'
}

/** メンバーを外す（会長と副会長。副会長は一般しか外せない） */
export async function kickClubMember(userId: string): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('kick_club_member', { p_user: userId })
  if (error) throw new FriendsOffline()
}

export type SetRoleResult = 'ok' | 'not_owner' | 'not_member' | 'too_many' | 'bad_role'

/** 副会長にする / 副会長をやめる（会長だけ）。副会長は3人まで */
export async function setClubRole(userId: string, role: 'admin' | 'member'): Promise<SetRoleResult> {
  await uid()
  const { data, error } = await supabase.rpc('set_club_role', { p_user: userId, p_role: role })
  if (error) throw new FriendsOffline(error.message)
  return (data as SetRoleResult) ?? 'not_owner'
}

/** 走友会の設定を変える（会長と副会長） */
export async function updateClub(f: ClubForm): Promise<void> {
  await uid()
  const { error } = await supabase.rpc('update_club', {
    p_name: f.name.trim(), p_note: f.note, p_logo: f.logoId,
    p_join_type: f.joinType, p_min_ovr: f.minOvr,
  })
  if (error) throw new FriendsOffline()
}

// ── 掲示板 ────────────────────────────────────────────
/** 掲示板に書ける定型文。番号（配列の位置）がそのままサーバーに入るので、順番は変えないこと */
export const CLUB_PHRASES = [
  'よろしく！',
  'ありがとう！',
  'カードください',
  '助かりました',
  'おめでとう！',
  '応援してます',
  'お疲れさま',
  'がんばろう',
  'すみません',
  '優勝しました！',
  'いい走りでした',
  'また明日',
] as const

// ── 掲示板の反応 ──────────────────────────────────────
/** 押せる反応。番号（配列の位置）がそのままサーバーに入るので、順番は変えないこと */
export const CLUB_REACTIONS = ['👏', '🔥', '💪', '😂', '😭', '🙏'] as const

/** 投稿1件ぶんの反応のまとめ。番号 → 人数 と、自分が押した番号 */
export type PostReactions = { counts: Record<number, number>; mine: number | null }

/** 掲示板ぜんぶの反応。投稿IDで引く */
export async function clubReactions(): Promise<Record<string, PostReactions>> {
  await uid()
  const { data, error } = await supabase.rpc('list_club_reactions')
  if (error) throw new FriendsOffline(error.message)
  const rows = (data ?? []) as { post_id: string; emoji: number; count: number; mine: boolean }[]
  const out: Record<string, PostReactions> = {}
  for (const r of rows) {
    const e = (out[r.post_id] ??= { counts: {}, mine: null })
    e.counts[r.emoji] = r.count
    if (r.mine) e.mine = r.emoji
  }
  return out
}

/**
 * 反応を付ける・付け替える・取り消す。
 * 同じものをもう一度押すと取り消し（戻り値 null）、違うものなら付け替え。
 */
export async function reactClubPost(postId: string, emoji: number): Promise<number | null> {
  await uid()
  const { data, error } = await supabase.rpc('react_club_post', { p_post: postId, p_emoji: emoji })
  if (error) throw new FriendsOffline(error.message)
  return (data as number | null) ?? null
}

/** 寄付でやりとりできるレアリティ。レジェンドは対象外 */
export type ClubReqRarity = 'normal' | 'rare' | 'epic'

export const CLUB_REQ_CAP: Record<ClubReqRarity, number> = { normal: 5, rare: 3, epic: 1 }

/** お願いするカードの種類。'' は「種類はおまかせ」 */
export type ClubReqStat = CardStatKey | ''

export const CLUB_REQ_STATS: CardStatKey[] =
  ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

export type ClubPost = {
  id: string
  userId: string
  kind: 'msg' | 'req' | 'room'
  /** 定型文の番号。**もう書けない**（build 126 までの古い投稿だけが持つ） */
  phrase: number
  /** 本文（kind='msg'）。**画面に出すときは必ず utils/wordFilter の maskText を通すこと** */
  body: string
  /** 対戦の募集の部屋番号6桁（kind='room'） */
  roomCode: string
  rarity: ClubReqRarity | ''
  /** 欲しいカードの種類。'' なら何でもよい（古い投稿だけが使う） */
  stat: ClubReqStat
  /** 1枚ずつの希望。長さは枚数ぶん。'' はその枠だけおまかせ */
  stats: ClubReqStat[]
  /** まだ埋まっていない枠の希望だけを並べたもの。渡す側はこれを見る */
  openStats: ClubReqStat[]
  filled: number
  cap: number
  mine: boolean
  donated: boolean          // この要求に自分はもう渡したか
  createdAt: string
  teamName: string
  shortName: string
  gmName: string
  logoId: string
  primary: string
  secondary: string
}

type FeedRow = {
  id: string; user_id: string; kind: 'msg' | 'req' | 'room'; phrase: number; rarity: string; stat: string | null
  stats: string[] | null; open_stats: string[] | null
  body: string | null; room_code: string | null
  filled: number; cap: number; mine: boolean; donated: boolean; created_at: string
  team_name: string | null; short_name: string | null; gm_name: string | null
  logo_id: string | null; color_primary: string | null; color_secondary: string | null
}

/** 掲示板の新しい50件。3日より古い投稿はこの呼び出しの中で消える */
export async function clubFeed(): Promise<ClubPost[]> {
  await uid()
  const { data, error } = await supabase.rpc('club_feed')
  if (error) throw new FriendsOffline(error.message)
  const rows = await withoutBlocked((data ?? []) as FeedRow[], r => r.user_id)
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    phrase: r.phrase ?? 0,
    // 古いサーバー（club_text.sql 未適用）だと列が無い。そのときは定型文へ落とす
    body: r.body ?? '',
    roomCode: r.room_code ?? '',
    rarity: (r.rarity || '') as ClubReqRarity | '',
    stat: (r.stat || '') as ClubReqStat,
    stats: ((r.stats ?? []) as string[]) as ClubReqStat[],
    openStats: ((r.open_stats ?? []) as string[]) as ClubReqStat[],
    filled: r.filled ?? 0,
    cap: r.cap ?? 0,
    mine: !!r.mine,
    donated: !!r.donated,
    createdAt: r.created_at,
    teamName: r.team_name || '無名チーム',
    shortName: r.short_name || '—',
    gmName: r.gm_name || '—',
    logoId: r.logo_id || 'logo_01',
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
  }))
}

export type PostMsgResult = 'ok' | 'not_in_club' | 'too_fast'

/**
 * 定型文を書く。**もう画面からは呼ばない**（build 126 までのアプリが使っている関数を
 * サーバーに残してあるだけ）。消すとそのアプリの掲示板が動かなくなる。
 */
export async function postClubMessage(phrase: number): Promise<PostMsgResult> {
  await uid()
  const { data, error } = await supabase.rpc('post_club_message', { p_phrase: phrase })
  if (error) throw new FriendsOffline()
  return (data as PostMsgResult) ?? 'not_in_club'
}

/** 掲示板に書ける文字数 */
export const CLUB_TEXT_MAX = 100

/**
 * 自由入力で書く。連投は1分に1回まで。
 * ★**伏せ字にしないで送ること。** 保存するのは書かれたそのままで、
 *   伏せるのは表示のときだけ（通報が来たときに中身が分からないと処理できない）。
 */
export async function postClubText(body: string): Promise<PostMsgResult | 'empty'> {
  await uid()
  const { data, error } = await supabase.rpc('post_club_text', { p_body: body.slice(0, CLUB_TEXT_MAX) })
  if (error) throw new FriendsOffline()
  return (data as PostMsgResult) ?? 'not_in_club'
}

/** 対戦の募集を掲示板に貼る。部屋は先に roomsApi の createRoom で作る。5分に1回まで */
export async function postClubRoom(code: string): Promise<PostMsgResult | 'bad_code'> {
  await uid()
  const { data, error } = await supabase.rpc('post_club_room', { p_code: code })
  if (error) throw new FriendsOffline()
  return (data as PostMsgResult | 'bad_code') ?? 'not_in_club'
}

export type PostReqResult = 'ok' | 'not_in_club' | 'today_done' | 'bad_rarity'

/**
 * カードをお願いする。1日1回まで。
 * stats は1枚ぶんずつの希望。長さが足りないところは「おまかせ」になる。
 */
export async function postClubRequest(
  rarity: ClubReqRarity, stats: ClubReqStat[] = [],
): Promise<PostReqResult> {
  await uid()
  const ss: string[] = []
  for (let i = 0; i < CLUB_REQ_CAP[rarity]; i++) ss.push(stats[i] ?? '')
  const { data, error } = await supabase.rpc('post_club_request', {
    p_rarity: rarity, p_stat: '', p_stats: ss,
  })
  if (error) throw new FriendsOffline(error.message)
  return (data as PostReqResult) ?? 'not_in_club'
}

export type DonateResult = 'ok' | 'not_found' | 'full' | 'already' | 'mine' | 'bad_card'

/** まとめて渡した結果。ids は実際に渡せたカードのid（そのぶんだけ手元から減らす） */
export type DonateManyResult = { status: DonateResult; given: number; ids: string[] }

/**
 * カードをまとめて渡す。1人1枚の縛りは無い。
 * 空いている枠に合うものだけが渡り、合わなかったカードは手元に残る。
 */
export async function donateClubCards(
  postId: string, cards: TrainingCard[],
): Promise<DonateManyResult> {
  await uid()
  const { data, error } = await supabase.rpc('donate_club_cards', { p_post: postId, p_cards: cards })
  if (error) throw new FriendsOffline(error.message)
  const r = (data ?? {}) as { status?: string; given?: number; ids?: unknown }
  return {
    status: (r.status as DonateResult) ?? 'not_found',
    given: r.given ?? 0,
    ids: Array.isArray(r.ids) ? (r.ids as string[]).filter(x => typeof x === 'string') : [],
  }
}

/** 受け取っていないカードの枚数 */
export async function clubGiftCount(): Promise<number> {
  await uid()
  const { data, error } = await supabase.rpc('club_gift_count')
  if (error) throw new FriendsOffline()
  return (data as number) ?? 0
}

/** 届いているカード1枚ぶん。通知に「誰から何が届いたか」を出すために使う */
export type ClubGift = {
  id: string
  card: TrainingCard
  /** 送ってくれた人のチーム名 */
  fromName: string
  createdAt: string
}

/** 届いているカードの一覧。受け取りはしない（見るだけ） */
export async function clubGiftList(): Promise<ClubGift[]> {
  await uid()
  const { data, error } = await supabase.rpc('club_gift_list')
  if (error) throw new FriendsOffline(error.message)
  type Row = { id: string; card: TrainingCard; from_name: string | null; created_at: string }
  return ((data ?? []) as Row[])
    .filter(r => r && r.card && typeof r.card.id === 'string')
    .map(r => ({
      id: r.id,
      card: r.card,
      fromName: r.from_name || '走友会のなかま',
      createdAt: r.created_at,
    }))
}

/** 1枚だけ受け取る。受け取れなければ null */
export async function claimClubGift(giftId: string): Promise<TrainingCard | null> {
  await uid()
  const { data, error } = await supabase.rpc('claim_club_gift', { p_id: giftId })
  if (error) throw new FriendsOffline(error.message)
  const c = data as TrainingCard | null
  return c && typeof c.id === 'string' ? c : null
}

/** もらったカードを全部受け取る。サーバー側からは同時に消える */
export async function claimClubGifts(): Promise<TrainingCard[]> {
  await uid()
  const { data, error } = await supabase.rpc('claim_club_gifts')
  if (error) throw new FriendsOffline(error.message)
  return ((data ?? []) as TrainingCard[]).filter(c => c && typeof c.id === 'string')
}

// ── フレンドの所属走友会 ───────────────────────────────
/** 走友会の名前とロゴだけ。フレンド一覧・フレンド詳細に出すために使う */
export type UserClub = { clubId: string; name: string; logoId: string; code: string }

/** まとめて引く。人数ぶん呼ばずに1回で済ませること */
export async function clubsOfUsers(ids: string[]): Promise<Map<string, UserClub>> {
  const out = new Map<string, UserClub>()
  if (ids.length === 0) return out
  await uid()
  const { data, error } = await supabase.rpc('clubs_of_users', { p_ids: ids })
  if (error) throw new FriendsOffline(error.message)
  type Row = { user_id: string; club_id: string; club_name: string; club_logo: string; club_code?: string }
  for (const r of (data ?? []) as Row[]) {
    out.set(r.user_id, {
      clubId: r.club_id,
      name: r.club_name,
      logoId: normalizeClubLogoId(r.club_logo),
      code: r.club_code ?? '',
    })
  }
  return out
}
