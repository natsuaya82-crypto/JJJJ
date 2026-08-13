// セーブを1つのファイルに書き出して、iOSの共有シートへ渡す。
//
// ■なぜ要るのか
//   実機で起きていることを調べるには本物のセーブが要ります。これまで取り出す手段が
//   まったく無く、「Mac に繋いで Xcode の Download Container」しか道がありませんでした。
//   セーブが重い・パッチが出ない・履歴が空、といった**実機でしか出ない話**は
//   セーブを見ないと原因が特定できません。
//
// ■出すもの
//   `localStorage` にある**そのスロットのセーブ本体**（`jpel-manager-save[-N]`）と、
//   別ファイルへ書き出してある**シーズンごとの走行記録**（`store/seasonArchive.ts`）を
//   まとめて1つのJSONにします。走行記録は本体から落ちているので、
//   本体だけ渡されても「どの年が落ちているか」しか分かりません。
//
// ■読む側
//   `scripts/check-load-v39.ts` と同じ形（`{ state, version }`）を `save` に入れてあるので、
//   `V39_SAVE=<path> npm run check` にそのまま渡せます。
import { Share } from '@capacitor/share'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { saveSlotSuffix } from './saveSlot'
import { readArchive, saveStorage } from './saveStorage'
import { archiveKeyOf } from '../utils/raceRecord'

export type ExportedSave = {
  v: 1
  exportedAt: string
  slot: string
  /** セーブ本体（persist が書いた生の文字列を JSON に戻したもの） */
  save: unknown
  /** シーズンごとの走行記録。キーは localStorage のキーそのまま */
  archives: Record<string, unknown>
  /** 大きさの内訳（バイト）。開かなくても何が重いか分かるように */
  sizes: Record<string, number>
}

/**
 * 書き出す中身を組み立てる。
 *
 * ★**セーブは `localStorage` に無い。** persist は `store/saveStorage` の
 *   `saveStorage`（実機ではファイル、ブラウザでは localStorage）を通している。
 *   最初に書いた版は `window.localStorage` を直接読んでいて、
 *   **実機で中身が空のファイル（save: null）が出てきた**。
 *   走行記録も同じで、`readArchive` を通さないと読めない。
 *
 * @param years 走行記録を探す年（`archivedYears` を渡す。無い年は静かに飛ばす）
 */
export async function buildExport(years: readonly number[]): Promise<ExportedSave> {
  const key = `jpel-manager-save${saveSlotSuffix()}`
  const raw = await saveStorage.getItem(key)
  const sizes: Record<string, number> = {}
  const parse = (s: string | null) => { try { return s == null ? null : JSON.parse(s) } catch { return s } }

  const save = parse(raw)
  sizes[key] = raw?.length ?? 0
  // ★中身の内訳も出す。players が重いのか pastSeasons が重いのかを、
  //   開いて数え直さなくても分かるようにしておく
  const state = (save as { state?: Record<string, unknown> } | null)?.state
  if (state) for (const [k, v] of Object.entries(state)) sizes[`state.${k}`] = JSON.stringify(v)?.length ?? 0

  const archives: Record<string, unknown> = {}
  for (const y of years) {
    const k = archiveKeyOf(y, saveSlotSuffix())
    const v = await readArchive(k)
    if (v == null) continue
    archives[k] = parse(v)
    sizes[k] = v.length
  }
  return {
    v: 1,
    // ★時刻はここで1回だけ読む（呼ぶ側で作らせない。ファイル名と中身をズレさせないため）
    exportedAt: new Date().toISOString(),
    slot: saveSlotSuffix() || '-1',
    save, archives, sizes,
  }
}

/**
 * 書き出して共有シートを出す。返すのは「何が起きたか」だけ（画面がそれを見せる）。
 * ブラウザではダウンロードに落とす（実機が無くても試せるように）。
 */
export async function exportSaveToShare(years: readonly number[]): Promise<{ ok: boolean; detail: string }> {
  try {
    const data = await buildExport(years)
    const json = JSON.stringify(data)
    const kb = Math.round(json.length / 1024)
    const name = `jpel-save-${data.exportedAt.slice(0, 10)}${data.slot}.json`

    if (!Capacitor.isNativePlatform()) {
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = url; a.download = name; a.click()
      URL.revokeObjectURL(url)
      return { ok: true, detail: `${name}（${kb}KB）をダウンロードしました` }
    }

    // ★Cache に置いてから共有する。Documents に置くとファイルアプリに残り続ける
    const w = await Filesystem.writeFile({
      path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 })
    await Share.share({ title: 'JPEL セーブデータ', url: w.uri })
    return { ok: true, detail: `${name}（${kb}KB）を共有しました` }
  } catch (e) {
    return { ok: false, detail: `書き出せませんでした：${e instanceof Error ? e.message : String(e)}` }
  }
}
