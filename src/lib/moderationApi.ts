// 通報とブロックのサーバー窓口。supabase/moderation.sql と対になっている。
//
// 走友会の掲示板は定型文しか書けないが、チーム名・監督名・走友会名・選手名は
// 自由入力で他の人に見える。App Store の審査基準 1.2 が求める
// 「通報できること」「相手をブロックできること」をここで受け持つ。
//
// friendsApi / clubsApi からこのファイルを読み込むので、
// ここから friendsApi を読み込まないこと（読み込みが輪になる）。
import { supabase, ensureAuth } from './supabase'
// 相手のロゴをどれにするかは data/logoPresets の remoteLogoId 1本
import { remoteLogoId } from '../data/logoPresets'

/** 通報の理由。値は moderation.sql の check とそろえること */
export type ReportReason = 'harass' | 'sexual' | 'impersonate' | 'spam' | 'other'

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'harass', label: '誹謗中傷・いやがらせ' },
  { key: 'sexual', label: 'わいせつ・不快な表現' },
  { key: 'impersonate', label: 'なりすまし・個人情報' },
  { key: 'spam', label: '宣伝・スパム' },
  { key: 'other', label: 'その他' },
]

export const REPORT_DETAIL_MAX = 200

export type ReportResult = 'ok' | 'self' | 'bad' | 'too_many' | 'offline'

/** ブロックした相手の表示に必要なぶんだけ */
export type BlockedUser = {
  id: string
  teamName: string
  shortName: string
  gmName: string
  logoId: string
  primary: string
  secondary: string
}

type BlockedRow = {
  user_id: string
  team_name: string | null
  short_name: string | null
  gm_name: string | null
  logo_id: string | null
  color_primary: string | null
  color_secondary: string | null
}

function toBlocked(r: BlockedRow): BlockedUser {
  return {
    id: r.user_id,
    teamName: r.team_name || '無名チーム',
    shortName: r.short_name || '—',
    gmName: r.gm_name || '—',
    // 相手のロゴは data/logoPresets の remoteLogoId 1本
    logoId: remoteLogoId(r.logo_id, r.user_id),
    primary: r.color_primary || '#122440',
    secondary: r.color_secondary || '#f5c842',
  }
}

// ── 通報 ──────────────────────────────────────────────
/**
 * 通報を出す。相手（userId）か走友会（clubId）のどちらか、または両方を指定する。
 * 中身は Supabase の reports に入るだけで、他の利用者には一切見えない。
 */
export async function sendReport(
  target: { userId?: string; clubId?: string },
  reason: ReportReason,
  detail = '',
): Promise<ReportResult> {
  const me = await ensureAuth()
  if (!me) return 'offline'
  const { data, error } = await supabase.rpc('send_report', {
    p_user: target.userId ?? null,
    p_club: target.clubId ?? null,
    p_reason: reason,
    p_detail: detail.slice(0, REPORT_DETAIL_MAX),
  })
  if (error) return 'offline'
  return (data as ReportResult) ?? 'bad'
}

// ── ブロック ──────────────────────────────────────────
// 一覧のたびに問い合わせると重いので、いちど読んだら覚えておく。
// ブロックの増減とログイン直後だけ捨てる。
let cache: Set<string> | null = null
let inflight: Promise<Set<string>> | null = null

/** ブロック中の相手のid。読めなかったときは空（＝隠さない）を返す */
export async function blockedIds(): Promise<Set<string>> {
  if (cache) return cache
  if (!inflight) {
    inflight = (async () => {
      try {
        const me = await ensureAuth()
        if (!me) return new Set<string>()
        const { data, error } = await supabase.from('blocks').select('blocked_id').eq('user_id', me)
        if (error) return new Set<string>()
        const set = new Set((data ?? []).map(r => r.blocked_id as string))
        cache = set
        return set
      } finally {
        inflight = null
      }
    })()
  }
  return inflight
}

/** 覚えていたぶんを捨てる（ブロックした・外したあとに呼ぶ） */
export function invalidateBlocked(): void {
  cache = null
}

/** 配列からブロック中の相手を取り除く */
export async function withoutBlocked<T>(rows: T[], idOf: (r: T) => string): Promise<T[]> {
  if (rows.length === 0) return rows
  const set = await blockedIds()
  if (set.size === 0) return rows
  return rows.filter(r => !set.has(idOf(r)))
}

/** ブロックする。フレンド関係と申請はサーバー側で一緒に消える */
export async function blockUser(userId: string): Promise<boolean> {
  const me = await ensureAuth()
  if (!me) return false
  const { data, error } = await supabase.rpc('block_user', { p_user: userId })
  if (error) return false
  invalidateBlocked()
  return data === 'ok'
}

/** ブロックを外す。フレンドには戻らない（もう一度申請から） */
export async function unblockUser(userId: string): Promise<boolean> {
  const me = await ensureAuth()
  if (!me) return false
  const { error } = await supabase.rpc('unblock_user', { p_user: userId })
  if (error) return false
  invalidateBlocked()
  return true
}

/** ブロックした相手の一覧（設定の「ブロックした利用者」に出す） */
export async function listBlocked(): Promise<BlockedUser[]> {
  const me = await ensureAuth()
  if (!me) return []
  const { data, error } = await supabase.rpc('my_blocks')
  if (error) throw new Error('通信できませんでした')
  return ((data ?? []) as BlockedRow[]).map(toBlocked)
}
