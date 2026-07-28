import { Capacitor, registerPlugin } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'

/**
 * フレンド機能の「このアカウントは自分だ」という証明書（メールとパスワード）を、
 * アプリを消しても機種変更しても消えないように保存するところ。
 *
 * 保存先を3つ持つ（多い順に強い）:
 *  1. Keychain … アプリを削除しても残る。iCloudキーチェーン同期で機種変更にも付いてくる。iOSのみ。
 *  2. Filesystem(Documents) … アプリを消すと消えるが、localStorage より消えにくい。
 *  3. localStorage … 一番消えやすい。Web(開発時)用の保険。
 *
 * 読むときは 1→2→3 の順に探し、見つかったら他の層にも書き戻す（自己修復）。
 *
 * 【最重要】「まだ無い」と「読めなかった」を必ず区別する。
 *   読めなかっただけなのに新規アカウントを作ると、フレンドが全部消えて二度と戻らない。
 *   読み取り不能のときは IdentityUnavailable を投げ、呼び出し側は何もしない。
 */

interface KeychainPlugin {
  get(options: { key: string }): Promise<{ value?: string }>
  set(options: { key: string; value: string }): Promise<void>
  remove(options: { key: string }): Promise<void>
}

const Keychain = registerPlugin<KeychainPlugin>('Keychain')

const KEY = 'jpel_identity_v1'
const FILE = 'jpel-identity.json'

const isIOS = () => Capacitor.getPlatform() === 'ios'

export class IdentityUnavailable extends Error {
  constructor(cause: string) {
    super('identity storage unreadable: ' + cause)
    this.name = 'IdentityUnavailable'
  }
}

export type Identity = { email: string; password: string }

function parse(raw: string | null | undefined): Identity | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<Identity>
    if (typeof o?.email === 'string' && typeof o?.password === 'string' && o.email && o.password) {
      return { email: o.email, password: o.password }
    }
  } catch { /* 壊れていたら無いものとして扱う（下の層を探す） */ }
  return null
}

async function readKeychain(): Promise<Identity | null> {
  if (!isIOS()) return null
  try {
    const { value } = await Keychain.get({ key: KEY })
    return parse(value)
  } catch (e) {
    // Swift 側は「見つからない」なら空で resolve する。ここに来る＝本当に読めなかった。
    throw new IdentityUnavailable(e instanceof Error ? e.message : String(e))
  }
}

async function readFile(): Promise<Identity | null> {
  try {
    const r = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
    return parse(typeof r.data === 'string' ? r.data : null)
  } catch {
    return null // ファイルが無いだけ
  }
}

function readLocal(): Identity | null {
  try { return parse(localStorage.getItem(KEY)) } catch { return null }
}

/**
 * 保存済みの証明書を返す。無ければ null。
 * 「読めなかった」ときは IdentityUnavailable を投げる（null は返さない）。
 */
export async function loadIdentity(): Promise<Identity | null> {
  const fromKeychain = await readKeychain()   // 失敗したらここで throw
  if (fromKeychain) {
    void mirror(fromKeychain, { keychain: false })
    return fromKeychain
  }
  const fromFile = await readFile()
  if (fromFile) {
    void mirror(fromFile)  // Keychain に昇格（アプリ削除に耐えるようにする）
    return fromFile
  }
  const fromLocal = readLocal()
  if (fromLocal) {
    void mirror(fromLocal)
    return fromLocal
  }
  return null
}

/** 3層すべてに書く。Keychain だけは失敗を呼び出し側に伝える。 */
export async function saveIdentity(id: Identity): Promise<void> {
  const raw = JSON.stringify(id)
  try { localStorage.setItem(KEY, raw) } catch { /* 容量超過など。他の層があるので続行 */ }
  try {
    await Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: raw })
  } catch { /* 続行 */ }
  if (isIOS()) await Keychain.set({ key: KEY, value: raw })
}

async function mirror(id: Identity, opts: { keychain?: boolean } = {}): Promise<void> {
  const raw = JSON.stringify(id)
  try { localStorage.setItem(KEY, raw) } catch { /* noop */ }
  try {
    await Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data: raw })
  } catch { /* noop */ }
  if (opts.keychain !== false && isIOS()) {
    try { await Keychain.set({ key: KEY, value: raw }) } catch { /* noop */ }
  }
}

/** データ削除のときだけ呼ぶ。ここを消すとフレンドコードも別人になる。 */
export async function clearIdentity(): Promise<void> {
  try { localStorage.removeItem(KEY) } catch { /* noop */ }
  try { await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }) } catch { /* noop */ }
  if (isIOS()) { try { await Keychain.remove({ key: KEY }) } catch { /* noop */ } }
}

/** 新規アカウント用の、被らないメールと強いパスワードを作る。 */
export function newIdentity(): Identity {
  const uuid = crypto.randomUUID()
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const password = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return { email: `${uuid}@jpel-manager.app`, password }
}
