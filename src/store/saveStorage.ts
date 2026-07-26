import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { StateStorage } from 'zustand/middleware'
import { getSaveHealth, setSaveHealth } from './saveHealth'

// セーブの保存先。
// ネイティブ(iOS): アプリ専用領域のファイル（容量制限なし・非同期・iCloudバックアップ対象）。
//   localStorage は5MB前後で書き込みが無言で失敗し「進めたはずが戻る」事故を起こすため使わない。
// Web(開発): 従来どおり localStorage。
//
// 【書き込みは必ず 一時ファイル → 検証 → 本体へ差し替え（rename）の順で行う】
//   本体へ直接上書きすると、数MBの書き込み中にアプリがキル/クラッシュした場合に
//   「途中まで書かれた壊れたJSON」が残り、次回起動で読み込みに失敗して
//   セーブが初期状態に見える（＝データが消えたように見える）事故が起きるため。
//   直前の正常なセーブは .bak に退避しておき、本体が壊れていたらそこから復旧する。
const FILE = 'jpel-manager-save.json'
const TMP = 'jpel-manager-save.tmp.json'
const BAK = 'jpel-manager-save.bak.json'
const isNative = Capacitor.isNativePlatform()

// 書き込みは末尾デバウンス（連続する set() のたびに数MBを書かない）。
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
// .bak の更新は最大1分に1回（毎回コピーすると数MBのI/Oが重なるため）。
let lastBackupAt = 0
const BACKUP_INTERVAL_MS = 60_000

// ── セーフモード ──
// 次のどちらかで立つ。
//  (a) 起動時に「セーブファイルは存在するのに読み込めなかった」（このモジュール内で検知）
//  (b) 読み込み（hydration）が正常に完了しなかった（saveHealth === 'failed'）
//      ※ファイル自体は読めても migrate / merge の途中で例外が出た場合がこれに当たる
// どちらの場合もストアの中身は初期状態（＝本物のセーブとは無関係）になっている。
// そこで書き込むと本物のセーブを上書きして本当に消してしまうため、この起動中は一切書き込まない。
// 【重要】isInitialized:true の書き込み（＝新規ゲーム作成）も必ず止める。
//   ここを通すと「消えたと思ったユーザーが新チームを作る」→本物のセーブが物理的に消えて復元不能になる。
//   既存セーブの上書きが許されるのは、明示的なデータ削除（removeItem）を通ったときだけ。
let safeMode = false
export function isSaveSafeMode(): boolean { return safeMode || getSaveHealth() === 'failed' }

// ── セーブ破壊ガード ──
// 「進行中のセーブ（isInitialized:true）」の上に「新規状態（isInitialized:false）」を書き込もうと
// したら拒否する。起動時の一瞬（復元完了前）に初期状態が保存されてセーブが1年目に戻る事故を防ぐ。
// リセット（データ削除）は removeItem がファイル/localStorage を消してガードも解除するので通る。
let loadedInitialized = false
const isInit = (v: string | null) => !!v && v.includes('"isInitialized":true')

async function exists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data })
    return true
  } catch {
    return false
  }
}

async function readText(path: string): Promise<string | null> {
  const res = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 })
  return typeof res.data === 'string' ? res.data : null
}

async function removeIfExists(path: string): Promise<void> {
  try { await Filesystem.deleteFile({ path, directory: Directory.Data }) } catch { /* 無ければ何もしない */ }
}

// 書き切れているかの軽量チェック。UTF-8のバイト数は JS 文字列長以上になるので、
// size < length なら途中で切れている。数MBを毎回 JSON.parse するとカクつくためこの判定にする。
async function writtenFully(path: string, expectLen: number): Promise<boolean> {
  try {
    const st = await Filesystem.stat({ path, directory: Directory.Data })
    return typeof st.size === 'number' && st.size >= expectLen
  } catch {
    return false
  }
}

const parses = (s: string): boolean => {
  try { JSON.parse(s); return true } catch { return false }
}

async function flushWrite() {
  if (pending == null) return
  const data = pending
  pending = null
  if (isSaveSafeMode()) {
    console.error('[save] SAFE MODE: 読み込みに失敗した起動のため書き込みを停止しています')
    return
  }
  try {
    // セーブ破壊ガード（ファイル直前）：新規状態を書く前に、既存ファイルが進行中セーブなら中止する。
    // 「ファイルが無い」と「読めなかった」は必ず区別する（読めないだけなら上書きしてはいけない）。
    if (!isInit(data) && await exists(FILE)) {
      let cur: string | null = null
      try { cur = await readText(FILE) } catch { cur = null }
      if (cur === null || isInit(cur)) {
        console.error('[save] BLOCKED: file has an initialized save; refusing to overwrite with fresh state')
        return
      }
    }

    // 1) まず一時ファイルへ書く（ここでキルされても本体は無傷のまま残る）
    await Filesystem.writeFile({ path: TMP, data, directory: Directory.Data, encoding: Encoding.UTF8 })

    // 2) 書き切れているか検証。欠けていたら本体には触らず捨てる
    if (!await writtenFully(TMP, data.length)) {
      console.error('[save] tmp write incomplete; keeping the previous save')
      await removeIfExists(TMP)
      return
    }

    // 3) 直前の正常セーブを .bak へ退避（本体が壊れたときの復旧元）。最大1分に1回。
    const now = Date.now()
    if (await exists(FILE)) {
      if (now - lastBackupAt >= BACKUP_INTERVAL_MS) {
        try {
          await removeIfExists(BAK)
          await Filesystem.copy({ from: FILE, to: BAK, directory: Directory.Data, toDirectory: Directory.Data })
          lastBackupAt = now
        } catch (e) {
          console.error('[save] backup failed', e)
        }
      }
      // rename は宛先が存在すると失敗するので本体を先に消す。
      // この一瞬でキルされても .tmp（検証済み）と .bak が残り、次回起動で復旧できる。
      await removeIfExists(FILE)
    } else if (lastBackupAt === 0) {
      lastBackupAt = now
    }

    // 4) 検証済みの一時ファイルを本体へ差し替え
    await Filesystem.rename({ from: TMP, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
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

// 本体 → 一時ファイル → バックアップ の順に、実際に JSON として読めるものを探す。
// （本体の差し替え中にキルされた場合は .tmp が最新の正常データになっている可能性がある）
async function loadFromDisk(): Promise<{ raw: string | null; sawFile: boolean }> {
  let sawFile = false
  for (const path of [FILE, TMP, BAK]) {
    if (!await exists(path)) continue
    sawFile = true
    let raw: string | null
    try {
      raw = await readText(path)
    } catch (e) {
      console.error('[save] read failed', path, e)
      continue
    }
    if (!raw || !parses(raw)) {
      console.error('[save] broken save file', path)
      continue
    }
    if (path !== FILE) {
      console.error(`[save] recovered save from ${path}`)
      try {
        await removeIfExists(FILE)
        await Filesystem.copy({ from: path, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
      } catch (e) {
        console.error('[save] restore failed', e)
      }
    }
    return { raw, sawFile }
  }
  return { raw: null, sawFile }
}

export const saveStorage: StateStorage = {
  getItem: (name) => {
    if (!isNative) {
      const v = localStorage.getItem(name)
      if (isInit(v)) loadedInitialized = true
      return v
    }
    return (async () => {
      const { raw, sawFile } = await loadFromDisk()
      if (raw !== null) {
        if (isInit(raw)) loadedInitialized = true
        return raw
      }
      if (sawFile) {
        // ファイルはあるのに1つも読めない／壊れている。ここで上書きすると本当に消えるので、
        // この起動中は保存を完全に停止する（再起動すればもう一度読み込みを試す）。
        safeMode = true
        // 新規ゲーム画面ではなく復旧画面へ回す（新規作成させると本物のセーブが消える）
        setSaveHealth('failed', 'セーブファイルを読み込めませんでした')
        console.error('[save] SAFE MODE: セーブファイルは存在するが読み込めませんでした。書き込みを停止します')
        return null
      }
      // 旧セーブ(localStorage)からの移行：ファイルへコピーし、読み戻して一致を確認できた時だけ採用。
      // 旧データは消さない（切り替え後は書き込まれなくなるだけ）。失敗時も旧セーブをそのまま返すので消失しない。
      const legacy = localStorage.getItem(name)
      if (legacy) {
        try {
          await Filesystem.writeFile({ path: FILE, data: legacy, directory: Directory.Data, encoding: Encoding.UTF8 })
          const verify = await readText(FILE)
          if (typeof verify !== 'string' || verify.length !== legacy.length) {
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
    // セーフモード中は isInitialized:true（新規ゲーム）も含めて全ての書き込みを拒否する
    if (isSaveSafeMode()) {
      console.error('[save] BLOCKED: セーフモード中のため書き込みを行いません')
      return
    }
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
    safeMode = false
    setSaveHealth('ok', '')
    lastBackupAt = 0
    if (!isNative) { localStorage.removeItem(name); return }
    return (async () => {
      pending = null
      if (timer) { clearTimeout(timer); timer = null }
      await removeIfExists(FILE)
      await removeIfExists(TMP)
      await removeIfExists(BAK)
    })()
  },
}

// 復旧画面から「セーブを削除して新しく始める」を選んだときだけ呼ぶ。
// セーフモード中の書き込み禁止を解除できる唯一の経路（＝ユーザーの明示的な同意）。
export async function deleteSaveForRecovery(): Promise<void> {
  await Promise.resolve(saveStorage.removeItem('jpel-manager-save'))
  try { localStorage.removeItem('jpel-manager-save') } catch { /* 使えない環境では何もしない */ }
}
