// セーブのスロット（運営用に2〜3本のデータを持ち替えるための仕組み）。
//
// 【なぜ起動時に1回だけ決めるのか】
// zustand の persist は起動時に1回だけ読み込み、以後は同じ保存先へ書き続ける。
// 途中でスロットを変えると「画面の中身はスロット1、書き込み先はスロット2」になり、
// 別のスロットのデータを本物のセーブに上書きしてしまう。
// そのため、切り替えは必ず **再読み込みを挟む**（switchSaveSlot が location.reload する）。
// プロセスが作り直されるので、saveStorage 側のセーフモード・破壊ガード・
// バックアップ間隔といったモジュール変数も一緒にまっさらになる。
//
// 【どこに置くか】
// スロットの選択そのものはセーブの中に置けない（セーブを読む前に必要なため）。
// localStorage は同期で読めるので、ここだけは localStorage を使う。
// ネイティブでも localStorage は使える（容量の問題があるのはセーブ本体の数MBの方）。

export const SAVE_SLOTS = [1, 2, 3] as const
export type SaveSlot = (typeof SAVE_SLOTS)[number]

const SLOT_KEY = 'jpel-manager-slot'

function readSlot(): SaveSlot {
  try {
    const v = Number(localStorage.getItem(SLOT_KEY))
    return (SAVE_SLOTS as readonly number[]).includes(v) ? (v as SaveSlot) : 1
  } catch {
    return 1   // localStorage が使えない環境では常にスロット1
  }
}

// 起動時に1回だけ確定させる。この値はアプリが動いているあいだ変わらない
const CURRENT: SaveSlot = readSlot()

export function currentSaveSlot(): SaveSlot { return CURRENT }

/**
 * 保存先の名前に付ける接尾辞。
 * **スロット1は接尾辞なし**＝今までのファイル名のままなので、
 * 既存のセーブはこれまでどおりスロット1として読める（移行の作業は要らない）。
 */
export function saveSlotSuffix(): string { return CURRENT === 1 ? '' : `-${CURRENT}` }

/** 任意のスロットの接尾辞（他のスロットにデータがあるか調べるときに使う） */
export function suffixOfSlot(slot: SaveSlot): string { return slot === 1 ? '' : `-${slot}` }

/**
 * スロットを切り替える。**必ず再読み込みが走る**。
 * 呼ぶ前に flushSaveNow() で書きかけを吐き出しておくこと
 * （デバウンス中の書き込みが捨てられ、直前の操作が消える）。
 */
export function switchSaveSlot(slot: SaveSlot): void {
  try { localStorage.setItem(SLOT_KEY, String(slot)) } catch { /* 使えない環境では切り替えない */ }
  location.reload()
}
