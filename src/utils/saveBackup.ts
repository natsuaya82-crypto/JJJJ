// セーブの手動バックアップ／復元。
//
// 「アップデートしたらデータが消えた」対策そのもの（自動保存の壊れ対策）は
// saveStorage.ts 側のセーフモード・書き込みガードで既に対応済み。
// このファイルはその上に乗る「ユーザーが自分の意思で退避・復元する」手段で、
// 書き込みは必ず saveStorage の公開関数（saveStorage.setItem / flushSaveNow）を経由する。
// ここで直接ファイルシステムに書いてガードを迂回する、といったことはしないこと。
import { Capacitor } from '@capacitor/core'
import { Share } from '@capacitor/share'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { saveStorage, isSaveSafeMode, flushSaveNow } from '../store/saveStorage'

const SAVE_KEY = 'jpel-manager-save'

function safeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_')
}

async function readCurrentSaveText(): Promise<string | null> {
  return Promise.resolve(saveStorage.getItem(SAVE_KEY))
}

export type BackupResult = { ok: true } | { ok: false; reason: string }

/** 現在のセーブJSONを共有シート（ネイティブ）／ダウンロード（Web）で書き出す */
export async function exportSaveBackup(): Promise<BackupResult> {
  const text = await readCurrentSaveText()
  if (!text) return { ok: false, reason: 'セーブデータが見つかりませんでした' }

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = safeFilename(`jpel-backup-${stamp}.json`)

  try {
    if (Capacitor.isNativePlatform()) {
      const written = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 })
      await Share.share({ title: 'JPELマネージャー セーブデータ', files: [written.uri] })
      return { ok: true }
    }
    // ── ブラウザ ──
    const blob = new Blob([text], { type: 'application/json' })
    const file = new File([blob], filename, { type: 'application/json' })
    const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      await nav.share({ title: 'JPELマネージャー セーブデータ', files: [file] })
      return { ok: true }
    }
    // 共有APIが無ければダウンロード
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch (e) {
    console.error('[saveBackup] export failed', e)
    return { ok: false, reason: '書き出しに失敗しました' }
  }
}

/** 選ばれたJSONが「セーブとして最低限成立しているか」を確認する。
 *  セーブの形はバージョンごとに変わるので厳密なスキーマ検証はしない。
 *  壊れたJSON・別アプリのファイル・空ファイルなどを弾く最低限のチェックだけ行う。 */
export function validateSaveJson(text: string): BackupResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'JSONとして読み込めませんでした（ファイルが壊れています）' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: '不正なファイルです' }
  }
  const obj = parsed as Record<string, unknown>
  const state = obj.state as Record<string, unknown> | undefined
  if (typeof obj.version !== 'number' || typeof state !== 'object' || state === null) {
    return { ok: false, reason: 'JPELマネージャーのセーブデータではないようです' }
  }
  if (!Array.isArray(state.teams) || !Array.isArray(state.players)) {
    return { ok: false, reason: 'JPELマネージャーのセーブデータではないようです' }
  }
  return { ok: true }
}

/** 読み込んだJSONで現在のセーブを差し替える。
 *
 * - 検証に落ちたら一切書き込まない（saveStorageには触れない）。
 * - 書き込みは saveStorage.setItem（+ flushSaveNow で即時反映）を通すので、
 *   セーフモード中の書き込み停止・進行中セーブへの初期状態上書き拒否といった
 *   既存のガードがそのまま効く。ガードに弾かれた場合は読み戻しで検知し、失敗として返す。
 * - バージョンが古い可能性があるバックアップをそのまま state にマージすると
 *   移行処理（migrate）を素通りしてしまうため、生JSON文字列のまま書き込み、
 *   呼び出し元でアプリを再読み込みさせて通常の起動経路（migrate込み）に乗せる。
 * - 呼び出し元で必ず確認ダイアログを挟むこと（このAPI自体には確認は無い）。
 */
export async function importSaveBackup(text: string): Promise<BackupResult> {
  if (isSaveSafeMode()) {
    return { ok: false, reason: 'いまはセーブを読み込めない状態のため復元できません。アプリを再起動してからお試しください' }
  }
  const check = validateSaveJson(text)
  if (!check.ok) return check

  try {
    await Promise.resolve(saveStorage.setItem(SAVE_KEY, text))
    await flushSaveNow()
    const after = await readCurrentSaveText()
    if (after !== text) {
      return { ok: false, reason: '反映を確認できませんでした（保護のため書き込みが中断された可能性があります。セーブは変更されていません）' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[saveBackup] import failed', e)
    return { ok: false, reason: '読み込みに失敗しました' }
  }
}
