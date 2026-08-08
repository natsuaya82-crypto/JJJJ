import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import type { StateStorage } from 'zustand/middleware'
import { getSaveHealth, setSaveHealth } from './saveHealth'
import { saveSlotSuffix, suffixOfSlot, type SaveSlot } from './saveSlot'

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
// 保存先はスロットごとに分かれる（store/saveSlot.ts）。スロット1は接尾辞なし＝
// 今までのファイル名そのままなので、既存のセーブはスロット1として読める。
// スロットは起動時に確定していて途中で変わらないので、ここで1回組み立てれば足りる。
const SUF = saveSlotSuffix()
const FILE = `jpel-manager-save${SUF}.json`
const TMP = `jpel-manager-save${SUF}.tmp.json`
/** 旧形式の1本だけのバックアップ。読み込みの候補としては今も見る（過去のセーブに残っている） */
const BAK = `jpel-manager-save${SUF}.bak.json`
const isNative = Capacitor.isNativePlatform()

// ── 世代バックアップ ──
//
// 以前は .bak が1本だけで、1分ごとに上書きしていた。つまり異変に気づいたときには
// 本体と .bak の両方が新しくなっていて、戻す先が無い。
// 5世代を順ぐりに使い、いちばん古いものから書き換える。10分に1回なので
// おおよそ50分ぶんの履歴が残る。1本7MB前後 × 5 = 35MB 程度。
const BAK_SLOTS = 5
const bakPath = (i: number) => `jpel-manager-save${SUF}.bak${i}.json`

/**
 * セーブ形式の版を上げる直前の退避。**版ごとに1つ、消さずに残す。**
 * 移行そのものが壊れていても、ここから前の版のセーブを取り出せる。
 * build 106 で30シーズンぶんが失われたとき、これがあれば戻せた。
 */
const versionSnapshotPath = (v: number) => `jpel-manager-save${SUF}.v${v}.json`

// 書き込みは末尾デバウンス（連続する set() のたびに数MBを書かない）。
let pending: string | null = null
let timer: ReturnType<typeof setTimeout> | null = null
// 世代バックアップの間隔。毎回コピーすると数MBのI/Oが重なるため。
let lastBackupAt = 0
const BACKUP_INTERVAL_MS = 10 * 60_000

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

// ── 中身が消し飛んだセーブを書かせないガード ──
//
// 【なぜ要るのか】
//   上の `isInit` だけでは「開始済みのまま、中身だけ空」を止められない。
//   読み込みの途中でおかしくなり、isInitialized:true・選手0人という状態になると、
//   そのまま保存が通って本物のセーブが物理的に消える。build 106 で
//   30シーズンぶんのセーブが失われたときの、いちばんありそうな筋がこれ。
//
// 【どう見るか】
//   選手1人につき1つだけ出る文字列を数えて、読み込んだときより極端に減っていたら拒否する。
//   数MBを毎回 JSON.parse すると重いので、文字列を数えるだけにする（数ミリ秒）。
//   引退で減るのは1シーズンで数%なので、半分を割るのは異常しかない。
const PLAYER_MARK = '"specialty":'
const COLLAPSE_RATIO = 0.5
const COLLAPSE_MIN = 100        // これ未満の小さなセーブでは判定しない（作りかけ・新規）
const countPlayers = (v: string): number => {
  let n = 0
  for (let i = v.indexOf(PLAYER_MARK); i !== -1; i = v.indexOf(PLAYER_MARK, i + PLAYER_MARK.length)) n++
  return n
}
let loadedPlayerCount = 0

// ── 「セーブがあったのに、開始前の状態で起動した」を検知する ──
//
// 読み込みが**成功したのに**中身が初期状態、という起動が最後の穴だった。
// saveHealth は 'ok' なので復旧画面へ回らず、そのまま新規ゲーム画面（Onboarding）が出る。
// そこで新チームを作られると、破壊ガードも「isInitialized:true を書いているだけ」に見えるので
// 素通りし、本物のセーブが物理的に消える。
// **セーブを1度でも読んだ**ことをここに残し、画面側（App.tsx）が新規ゲーム画面の代わりに
// 復旧画面を出せるようにする。
let sawSave = false

// セーブ形式の版。**gameStore の SAVE_VERSION が正**で、起動時にそこから教えてもらう。
// ここで数字を持つと2か所になるので持たない（npm run check が見張る）。
let SAVE_FORMAT_VERSION = 0
/** gameStore が起動時に一度だけ呼ぶ。版を上げる前の退避の判定に使う */
export function setSaveFormatVersion(v: number): void { SAVE_FORMAT_VERSION = v }
/** この起動でセーブ（本体・.tmp・.bak・旧localStorage）を読み込んだか */
export function sawSavedGame(): boolean { return sawSave }

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

/** いちばん古い世代を探して、そこへ本体をコピーする */
async function rotateBackup(): Promise<void> {
  let oldest = 1
  let oldestAt = Number.POSITIVE_INFINITY
  for (let i = 1; i <= BAK_SLOTS; i++) {
    try {
      const st = await Filesystem.stat({ path: bakPath(i), directory: Directory.Data })
      const at = typeof st.mtime === 'number' ? st.mtime : 0
      if (at < oldestAt) { oldestAt = at; oldest = i }
    } catch {
      // 無い世代があるなら、まずそこを埋める
      oldest = i
      break
    }
  }
  await removeIfExists(bakPath(oldest))
  await Filesystem.copy({ from: FILE, to: bakPath(oldest), directory: Directory.Data, toDirectory: Directory.Data })
}

/** JSON を丸ごと読まずに版だけ取り出す（数MBのパースを避ける） */
function versionOf(raw: string): number | null {
  const m = raw.match(/"version"\s*:\s*(\d+)\s*}\s*$/) ?? raw.match(/"version"\s*:\s*(\d+)/)
  return m ? Number(m[1]) : null
}

/**
 * セーブ形式の版を上げる前に、そのままの姿を1つ残す。**版ごとに1つ、消さない。**
 * すでにその版の退避があれば何もしない（同じ版で何度起動しても増えない）。
 */
async function snapshotBeforeMigrate(raw: string, current: number): Promise<void> {
  const v = versionOf(raw)
  if (v == null || v >= current) return
  const path = versionSnapshotPath(v)
  if (await exists(path)) return
  try {
    await Filesystem.writeFile({ path, data: raw, directory: Directory.Data, encoding: Encoding.UTF8 })
    console.log(`[save] 版を上げる前のセーブを ${path} に退避しました`)
  } catch (e) {
    console.error('[save] version snapshot failed', e)
  }
}

/** 復旧に使える候補（新しい順）。復旧画面が一覧で見せる */
export type Recoverable = { path: string; label: string; size: number; mtime: number }
export async function listRecoverables(): Promise<Recoverable[]> {
  if (!isNative) return []
  const out: Recoverable[] = []
  const add = async (path: string, label: string) => {
    try {
      const st = await Filesystem.stat({ path, directory: Directory.Data })
      out.push({ path, label, size: typeof st.size === 'number' ? st.size : 0, mtime: typeof st.mtime === 'number' ? st.mtime : 0 })
    } catch { /* 無ければ候補にしない */ }
  }
  await add(FILE, 'いまのセーブ')
  await add(TMP, '書きかけ（直前の操作）')
  await add(BAK, 'ひとつ前（旧形式）')
  for (let i = 1; i <= BAK_SLOTS; i++) await add(bakPath(i), `世代バックアップ ${i}`)
  for (let v = 1; v <= 200; v++) await add(versionSnapshotPath(v), `アップデート前（形式 v${v}）`)
  return out.sort((a, b) => b.mtime - a.mtime)
}

/** 選んだ候補を本体に戻す。**戻す前に、いまの本体も世代へ逃がす** */
export async function restoreFrom(path: string): Promise<void> {
  if (!isNative) return
  if (await exists(FILE)) { try { await rotateBackup() } catch { /* 逃がせなくても復元は進める */ } }
  await removeIfExists(FILE)
  await Filesystem.copy({ from: path, to: FILE, directory: Directory.Data, toDirectory: Directory.Data })
}

/** セーブファイルの中身を読み出す（書き出し・共有に使う） */
export async function readSaveText(path = FILE): Promise<string | null> {
  if (!isNative) return localStorage.getItem(`jpel-manager-save${SUF}`)
  try { return await readText(path) } catch { return null }
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

    // 3) 直前の正常セーブを世代バックアップへ退避（本体が壊れたときの復旧元）。
    //    **いちばん古い世代から書き換える。** 1本だけを上書きしていた頃は、
    //    異変に気づいたときには本体もバックアップも新しくなっていて戻す先が無かった。
    const now = Date.now()
    if (await exists(FILE)) {
      if (now - lastBackupAt >= BACKUP_INTERVAL_MS) {
        try {
          await rotateBackup()
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
  // 本体 → 書きかけ → 旧形式のバックアップ → 世代バックアップ（新しい順）。
  // 前は本体・書きかけ・.bak の3つだけで、そこが全部だめなら打つ手が無かった。
  const gens: { path: string; mtime: number }[] = []
  for (let i = 1; i <= BAK_SLOTS; i++) {
    try {
      const st = await Filesystem.stat({ path: bakPath(i), directory: Directory.Data })
      gens.push({ path: bakPath(i), mtime: typeof st.mtime === 'number' ? st.mtime : 0 })
    } catch { /* 無い世代は飛ばす */ }
  }
  gens.sort((a, b) => b.mtime - a.mtime)
  for (const path of [FILE, TMP, BAK, ...gens.map(g => g.path)]) {
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
      if (isInit(v)) { loadedInitialized = true; sawSave = true }
      if (v) loadedPlayerCount = countPlayers(v)
      return v
    }
    return (async () => {
      const { raw, sawFile } = await loadFromDisk()
      if (raw !== null) {
        if (isInit(raw)) { loadedInitialized = true; sawSave = true }
        loadedPlayerCount = countPlayers(raw)
        // ★セーブ形式の版を上げる前に、そのままの姿を1つ残す（版ごとに1つ・消さない）。
        //   移行そのものが壊れていても、ここから前の版のセーブを取り出せる。
        //   書き込みより先に済ませる（この時点ではまだ何も上書きしていない）。
        await snapshotBeforeMigrate(raw, SAVE_FORMAT_VERSION)
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
      if (isInit(legacy)) { loadedInitialized = true; sawSave = true }
      if (legacy) loadedPlayerCount = countPlayers(legacy)
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
    // 中身が消し飛んだセーブを書かせないガード。
    // isInitialized は true のまま選手だけ消えている、という壊れ方をここで止める。
    // 止めたあとは**この起動中いっさい書かない**（セーフモード）。復旧画面へ回して、
    // ファイル（本体・.tmp・.bak）が無事なうちに再起動してもらう。
    if (loadedPlayerCount >= COLLAPSE_MIN) {
      const now = countPlayers(value)
      if (now < loadedPlayerCount * COLLAPSE_RATIO) {
        safeMode = true
        setSaveHealth('failed', `セーブの中身が急に減ったため保存を止めました（選手 ${loadedPlayerCount} → ${now}）`)
        console.error(`[save] BLOCKED: player records collapsed ${loadedPlayerCount} -> ${now}; refusing to overwrite and entering safe mode`)
        return
      }
      // 正常に書けたぶんを新しい基準にする（増える方向はそのまま追随する）
      if (now > loadedPlayerCount) loadedPlayerCount = now
    }
    if (isInit(value)) loadedInitialized = true
    if (!isNative) { localStorage.setItem(name, value); return }
    pending = value
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { timer = null; void flushWrite() }, 400)
  },
  removeItem: (name) => {
    loadedInitialized = false   // データ削除＝ガード解除（新規ゲームを保存できるように）
    loadedPlayerCount = 0       // 中身の基準も外す（明示的な削除のあとは何を書いてもよい）
    sawSave = false             // 削除したので「セーブがあった」も外す（新規ゲーム画面へ進んでよい）
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
      // 世代バックアップと版ごとの退避も消す。ここを残すと「削除したのに前のデータが
      // 復旧画面から戻せる」状態になり、削除したことにならない
      for (let i = 1; i <= BAK_SLOTS; i++) await removeIfExists(bakPath(i))
      for (let v = 1; v <= 200; v++) await removeIfExists(versionSnapshotPath(v))
    })()
  },
}

// ── 過去シーズンの記録の置き場所 ─────────────────────────────
//
// ■なぜ普段のセーブと分けるのか
//   セーブは状態が変わるたびに**全部を書き直す**。走行記録を全大会ぶん残すと
//   1シーズン0.38MB、100シーズンで38MBになり、選手を1人タップするたびに
//   1.4秒（実機で3〜5秒）固まる。実測した数字（scripts/measure-save-size.ts）。
//   だから終わったシーズンの記録は本体から外し、**シーズン終了時に1回だけ**書く。
//   読むのは記録室や選手の履歴を開いたときだけ。
//
// ■本体と同じ約束を守る
//   セーフモード中は書かない（壊れたセーブの上に書くと本当に消える）。
//   保存先の分岐（ネイティブ＝ファイル／Web＝localStorage）も本体と同じ。
//   ここを別に書かないこと。

const archivePath = (key: string) => `${key}${SUF}.json`

/** 過去シーズンの記録を1年ぶん書く。シーズン終了時に1回だけ呼ぶ */
export async function writeArchive(key: string, json: string): Promise<void> {
  if (isSaveSafeMode()) {
    console.error('[archive] BLOCKED: セーフモード中のため書き込みを行いません')
    return
  }
  if (!isNative) { try { localStorage.setItem(key, json) } catch (e) { console.error('[archive] write failed', e) } ; return }
  try {
    await Filesystem.writeFile({ path: archivePath(key), data: json, directory: Directory.Data, encoding: Encoding.UTF8 })
  } catch (e) {
    console.error('[archive] write failed', e)
  }
}

/** 過去シーズンの記録を読む。無ければ null（古いセーブには存在しない） */
export async function readArchive(key: string): Promise<string | null> {
  if (!isNative) { try { return localStorage.getItem(key) } catch { return null } }
  return await readText(archivePath(key))
}

/** 過去シーズンの記録を消す。データ削除のときだけ */
export async function removeArchive(key: string): Promise<void> {
  if (!isNative) { try { localStorage.removeItem(key) } catch { /* 使えない環境では何もしない */ } ; return }
  await removeIfExists(archivePath(key))
}

// 復旧画面から「セーブを削除して新しく始める」を選んだときだけ呼ぶ。
// セーフモード中の書き込み禁止を解除できる唯一の経路（＝ユーザーの明示的な同意）。
export async function deleteSaveForRecovery(): Promise<void> {
  const name = `jpel-manager-save${SUF}`
  await Promise.resolve(saveStorage.removeItem(name))
  try { localStorage.removeItem(name) } catch { /* 使えない環境では何もしない */ }
}

/**
 * そのスロットにデータが入っているか（スロット選択の画面で「空き」を出すため）。
 * 今いるスロット以外も見るので、パスは slot から組み立てる。
 */
export async function slotHasSave(slot: SaveSlot): Promise<boolean> {
  const name = `jpel-manager-save${suffixOfSlot(slot)}`
  if (!isNative) {
    try { return isInit(localStorage.getItem(name)) } catch { return false }
  }
  // 本体が無くても .tmp / .bak が残っていれば復旧できるので「データあり」として扱う
  for (const path of [`${name}.json`, `${name}.tmp.json`, `${name}.bak.json`]) {
    if (await exists(path)) return true
  }
  return false
}
