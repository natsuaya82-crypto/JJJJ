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

export const saveStorage: StateStorage = {
  getItem: (name) => {
    if (!isNative) return localStorage.getItem(name)
    return (async () => {
      try {
        const res = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 })
        if (typeof res.data === 'string' && res.data.length > 0) return res.data
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
      return legacy
    })()
  },
  setItem: (name, value) => {
    if (!isNative) { localStorage.setItem(name, value); return }
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void flushWrite() }, 400)
  },
  removeItem: (name) => {
    if (!isNative) { localStorage.removeItem(name); return }
    return (async () => {
      pending = null
      if (timer) { clearTimeout(timer); timer = null }
      try { await Filesystem.deleteFile({ path: FILE, directory: Directory.Data }) } catch { /* 無ければ何もしない */ }
    })()
  },
}

