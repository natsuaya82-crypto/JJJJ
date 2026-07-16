import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { StateStorage } from 'zustand/middleware'

// セーブの保存先。
// ネイティブ(iOS): アプリ専用領域のファイル（容量制限なし・非同期・iCloudバックアップ対象）。
//   localStorage は5MB前後で書き込みが無言で失敗し「進めたはずが戻る」事故を起こすため使わない。
// Web(開発): 従来どおり localStorage。
const FILE = 'jpel-manager-save.json'
const isNative = Capacitor.isNativePlatform()

// 書き込みは末尾デバウンス（連続する set() のたびに数MBを書かない）。
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
// 最後にセーブが実際にディスク/localStorageへ書けた時刻（診断表示用）。

async function flushWrite() {
  if (pending == null) return
  const data = pending
  pending = null
  try {
    // セーブ破壊ガード（ファイル直前）：新規状態を書く前に、既存ファイルが進行中セーブなら中止する。
    // 起動時の読み込みが一時的に失敗すると「新規状態で起動→そのまま上書き」でセーブが1年目に戻るため。
    if (!data.includes('"isInitialized":true')) {
      try {
        const cur = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
        if (typeof cur.data === 'string' && cur.data.includes('"isInitialized":true')) {
          console.error('[save] BLOCKED: file has an initialized save; refusing to overwrite with fresh state')
          return
        }
      } catch { /* ファイルなし＝新規でOK */ }
    }
    await Filesystem.writeFile({ path: FILE, data, directory: Directory.Data, encoding: Encoding.UTF8 })

  } catch (e) {
    console.error('[save] write failed', e)
  }
}

// バックグラウンド移行・タブ非表示・ページ破棄の瞬間に即時フラッシュ（アプリキルで直前の操作が消えるのを防ぐ）
function flushImmediate() {
  if (timer) { clearTimeout(timer); timer = null }
  void flushWrite()
}
if (isNative && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushImmediate()
  })
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flushImmediate)
}

// 重要操作（レース確定・シーズン更新・購入・リセット等）の直後に呼び、デバウンスを待たず即書き込む。
// Webでは何もしない（同期localStorageのため不要）。
export async function flushSaveNow(): Promise<void> {
  if (!isNative) return
  if (timer) { clearTimeout(timer); timer = null }
  await flushWrite()
}

// ── セーブ破壊ガード ──
// 「進行中のセーブ（isInitialized:true）」の上に「新規状態（isInitialized:false）」を書き込もうと
// したら拒否する。起動時の一瞬（復元完了前）に初期状態が保存されてセーブが1年目に戻る事故を防ぐ。
// リセット（データ削除）は removeItem がファイル/localStorage を消してガードも解除するので通る。
let loadedInitialized = false
const isInit = (v: string | null) => !!v && v.includes('"isInitialized":true')

export const saveStorage: StateStorage = {
  getItem: (name) => {
    if (!isNative) {
      const v = localStorage.getItem(name)
      if (isInit(v)) loadedInitialized = true
      return v
    }
    return (async () => {
      try {
        const res = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
        if (typeof res.data === 'string' && res.data.length > 0) {
          if (isInit(res.data)) loadedInitialized = true
          return res.data
        }
      } catch { /* ファイル未作成＝初回起動 or 旧セーブからの移行前 */ }
      // 旧セーブ(localStorage)からの移行：ファイルへコピーし、読み戻して一致を確認できた時だけ採用。
      // 旧データは消さない（切り替え後は書き込まれなくなるだけ）。失敗時も旧セーブをそのまま返すので消失しない。
      const legacy = localStorage.getItem(name)
      if (legacy) {
        try {
          await Filesystem.writeFile({ path: FILE, data: legacy, directory: Directory.Data, encoding: Encoding.UTF8 })
          const verify = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
          if (typeof verify.data !== 'string' || verify.data.length !== legacy.length) {
            console.error('[save] migration verify failed')
          }
        } catch (e) {
          console.error('[save] migration failed, keep using localStorage data', e)
        }
      }
      if (isInit(legacy)) loadedInitialized = true
      return legacy
    })()
  },
  setItem: (name, value) => {
    // セーブ破壊ガード：進行中セーブがあるのに新規状態を書こうとしたら拒否
    if (loadedInitialized && !isInit(value)) {
      console.error('[save] BLOCKED: attempted to overwrite an initialized save with a fresh (uninitialized) state')
      return
    }
    if (isInit(value)) loadedInitialized = true
    if (!isNative) { localStorage.setItem(name, value); return }
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void flushWrite() }, 400)
  },
  removeItem: (name) => {
    loadedInitialized = false   // データ削除＝ガード解除（新規ゲームを保存できるように）
    if (!isNative) { localStorage.removeItem(name); return }
    return (async () => {
      pending = null
      if (timer) { clearTimeout(timer); timer = null }
      try { await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }) } catch { /* 無ければ何もしない */ }
    })()
  },
}

