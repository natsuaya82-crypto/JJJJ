// Supabase クライアント（フレンド機能専用）
//
// ここに書いてあるのは Publishable key（旧 anon key）で、
// もともとクライアントアプリに埋め込む前提の「公開してよいキー」です。
// Vite のビルドでどのみち JS バンドルに焼き込まれるので、.env に置いても隠せません。
// 実際の保護は Supabase 側の RLS（行レベルセキュリティ）が担当しています。
// Secret key（sb_secret_...）は絶対にここへ書かないこと。
//
// 環境変数が設定されていればそちらを優先します。
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://yqwjmpbxkyunqjrjqtug.supabase.co'
export const SUPABASE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_3doufkn1HomBJ00Tke7qhg_sC5KUTbf'

import { createClient } from '@supabase/supabase-js'
import { ONLINE_ENABLED } from '../data/featureFlags'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // オンラインを公開していない間は、端末に残っているログイン情報を復元しない。
    // ここを true のままにすると、以前のバージョンを入れていた端末では
    // 起動時と復帰時にログインの更新通信が勝手に走ってしまう。
    persistSession: ONLINE_ENABLED,
    autoRefreshToken: ONLINE_ENABLED,
    detectSessionInUrl: false, // ネイティブアプリなのでURLからのセッション検出は不要
  },
})

import { loadIdentity, saveIdentity, newIdentity, IdentityUnavailable, type Identity } from './durableId'

/**
 * このアプリのアカウント（＝フレンドコードの正体）を保証する。
 *
 * 匿名サインインは端末のセッションが消えると復元できず、アプリを消したら別人になる。
 * そこで「自動生成したメール＋パスワード」を Keychain に保存し、毎回それでログインする。
 * Keychain はアプリを削除しても残り、iCloudキーチェーンで機種変更にも付いてくるので、
 * ユーザーが明示的にデータ削除するまで同じ ID が続く。
 *
 * 失敗しても絶対にやってはいけないのは「新しいアカウントを作ってしまう」こと。
 * フレンドが全部消えるので、少しでも怪しいときは null を返して何もしない。
 */
let signInPromise: Promise<string | null> | null = null

export function ensureAuth(): Promise<string | null> {
  if (!signInPromise) {
    signInPromise = run().catch(() => null).then(id => {
      if (id === null) signInPromise = null // 次回また試せるようにする
      return id
    })
  }
  return signInPromise
}

/** データ削除でアカウントを捨てたときに呼ぶ。次の ensureAuth() で作り直させる。 */
export function resetAuthCache(): void {
  signInPromise = null
}

async function run(): Promise<string | null> {
  // 1. 保存済みの証明書を読む。読めなかった＝「無い」とは言い切れないので、新規作成だけは絶対にしない。
  let stored: Identity | null = null
  let unreadable = false
  try {
    stored = await loadIdentity()
  } catch (e) {
    if (!(e instanceof IdentityUnavailable)) return null
    unreadable = true
    console.warn('[auth] identity unreadable', e)
  }

  const { data } = await supabase.auth.getSession()
  const session = data.session

  // 1-b. 証明書が読めなかったとき。
  //      すでにログイン状態が残っていれば、それをそのまま使う（アカウントは作らない）。
  //      残っていなければ何もしない＝次回また試す。
  if (unreadable) return session?.user?.id ?? null

  // 2. 証明書がある → それでログイン（既にそのアカウントでログイン中なら何もしない）
  if (stored) {
    if (session?.user?.id && session.user.email === stored.email) return session.user.id
    const { data: signed, error } = await supabase.auth.signInWithPassword({
      email: stored.email, password: stored.password,
    })
    if (!error) return signed.user?.id ?? null

    // 認証情報が通らない＝サーバ側にアカウントが無い（削除された等）。
    // 同じメール/パスワードで作り直す。通信エラーの場合はここに来ないので新規作成もしない。
    if (isInvalidCredentials(error)) {
      const { data: made, error: e2 } = await supabase.auth.signUp(stored)
      if (!e2 && made.user?.id) return made.user.id
    }
    console.warn('[auth] sign-in failed', error)
    return session?.user?.id ?? null   // 通信不良ならとりあえず今のセッションで動かす
  }

  // 3. 証明書が無い
  const fresh = newIdentity()

  //    3-a. 既存セッションがある＝これまでの匿名アカウント。ID を変えずに証明書を後付けする。
  //         （すでにフレンドコードを配っているテスターが別人にならないための移行処理）
  if (session?.user?.id) {
    const { error } = await supabase.auth.updateUser(fresh)
    if (!error) {
      await persist(fresh)
      return session.user.id
    }
    console.warn('[auth] could not attach credentials to existing account', error)
    return session.user.id // 失敗しても今のアカウントはそのまま使う。次回また試す。
  }

  //    3-b. 本当の初回。新しいアカウントを作る。
  const { data: made, error } = await supabase.auth.signUp(fresh)
  if (error || !made.user?.id) {
    console.warn('[auth] sign-up failed', error)
    return null
  }
  await persist(fresh)
  return made.user.id
}

async function persist(id: Identity): Promise<void> {
  try {
    await saveIdentity(id)
  } catch (e) {
    // Keychain に書けなかった。セッション自体は生きているので今回は動くが、
    // 次回起動時に証明書が見つからず 3-a の後付けルートで復旧を試みることになる。
    console.warn('[auth] failed to persist identity', e)
  }
}

function isInvalidCredentials(error: unknown): boolean {
  const e = error as { code?: string; status?: number } | null
  return e?.code === 'invalid_credentials' || e?.status === 400
}
