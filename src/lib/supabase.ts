// Supabase クライアント（フレンド機能専用）
//
// ここに書いてあるのは Publishable key（旧 anon key）で、
// もともとクライアントアプリに埋め込む前提の「公開してよいキー」です。
// Vite のビルドでどのみち JS バンドルに焼き込まれるので、.env に置いても隠せません。
// 実際の保護は Supabase 側の RLS（行レベルセキュリティ）が担当しています。
// Secret key（sb_secret_...）は絶対にここへ書かないこと。
//
// 環境変数が設定されていればそちらを優先します。
const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://yqwjmpbxkyunqjrjqtug.supabase.co'
const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_3doufkn1HomBJ00Tke7qhg_sC5KUTbf'

import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,      // 端末に匿名アカウントを保存し続ける（＝実質ログイン不要）
    autoRefreshToken: true,
    detectSessionInUrl: false, // ネイティブアプリなのでURLからのセッション検出は不要
  },
})

/**
 * 匿名サインインを保証する。
 * 既にセッションがあれば何もしない。無ければ匿名アカウントを作る。
 * オフライン等で失敗したら null を返す（呼び出し側でフレンド機能を無効表示にする）。
 */
let signInPromise: Promise<string | null> | null = null
export function ensureAuth(): Promise<string | null> {
  if (!signInPromise) {
    signInPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session?.user?.id) return data.session.user.id
        const { data: signed, error } = await supabase.auth.signInAnonymously()
        if (error) throw error
        return signed.user?.id ?? null
      } catch {
        signInPromise = null // 次回また試せるようにする
        return null
      }
    })()
  }
  return signInPromise
}
