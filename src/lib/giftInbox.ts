// 走友会でもらったカードの「取りこぼし防止箱」。
//
// もらったカードを受け取るとき、サーバー側は渡した瞬間に消える。
// そのあと手元に入れる前にアプリが落ちると、カードはどこにも無くなってしまう。
// なので受け取った中身をまずこの箱（localStorage）に書き、手元に入れ終わってから消す。
// 起動時に中身が残っていたら、まだ手元に無いものだけ入れ直す。
//
// localStorage を使うのは、セーブ本体（Filesystem）の書き込みが少し遅れて行われるため。
// こちらは書いた時点で確実に残る。
import type { TrainingCard } from '../types'
import { saveSlotSuffix } from '../store/saveSlot'

// 置き場所は store/appStorage.ts の登録表に載せてある（データ削除で消える側）。
// **スロットごとに分ける**。以前は全スロット共通で、しかもデータ削除でも残っていたので、
// 消したはずの前のゲームでもらったカードが、新しいゲームに入ってきていた。
// スロット1は接尾辞なし＝今までのキーのままなので、いま箱に入っているものは失われない。
const KEY = `jpel_gift_inbox${saveSlotSuffix()}`

/** 受け取った中身を箱に入れる（手元に足す前に必ず呼ぶ） */
export function stashGifts(cards: TrainingCard[]): void {
  if (cards.length === 0) return
  try { localStorage.setItem(KEY, JSON.stringify(cards)) } catch { /* 容量超過等。無視して先へ進む */ }
}

/** 箱の中身を読む。壊れていたら空扱い。 */
export function peekGifts(): TrainingCard[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const v = JSON.parse(raw)
    return Array.isArray(v) ? (v as TrainingCard[]).filter(c => c && typeof c.id === 'string') : []
  } catch { return [] }
}

/** 手元に入ったのを確認してから箱を空にする */
export function clearGifts(): void {
  try { localStorage.removeItem(KEY) } catch { /* 無視 */ }
}
