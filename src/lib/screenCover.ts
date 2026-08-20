import { useEffect, useSyncExternalStore } from 'react'

/**
 * **「いま画面を覆っているものがあるか」の唯一の置き場所。**
 *
 * ■なぜ要るか（オーナー・2026-08-20「下タブ全然出てくる。いらない画面でもローディングとか」
 *   「ホームボタン押してるのに飛ばなかったりする選手詳細とか」）
 *
 *   下タブをネイティブにした（iOS 26 のガラス）ことで、下タブは WebView の**外**に
 *   出ました。そのため **Web 側のどんな覆いも下タブには被せられません**。
 *
 *     ・ローディング（z-index 9999）でも下タブだけが上に残る
 *     ・選手詳細を開いたまま「ホーム」を押すと、下タブは**押せてしまう**ので
 *       裏で `/` へ移動するが、シートは載ったままなので「飛ばない」ように見える
 *
 *   Web の下タブ（z-index 50）だったころは、シートもローディングも z-index が上なので
 *   **黙って隠れていました**。ネイティブにした瞬間だけ、この「黙って隠れる」が消えます。
 *
 * ■決まり
 *   **画面を覆うものは `useCoversScreen()` を呼ぶこと。** 隠すかどうかを決めるのは
 *   `Layout` 1本で、こちらは数を数えるだけ（`raceInProgress` と同じ扱い）。
 *   ★覆う側に「下タブを隠す」と書かないこと——Webの下タブとネイティブで答えが割れます。
 *
 * ■早期リターンより上で呼ぶこと
 *   `if (!open) return null` の**後ろ**で呼ぶとフックの数が変わって落ちます
 *   （`check-hook-order`）。開いているかどうかは**引数で渡します**。
 */
let count = 0
const subs = new Set<() => void>()
const emit = () => subs.forEach(f => f())

/** 画面を覆っているあいだ数える。`active` が false のあいだは数えない */
export function useCoversScreen(active = true): void {
  useEffect(() => {
    if (!active) return
    count++
    emit()
    return () => { count--; emit() }
  }, [active])
}

/** 覆っているものが1つでもあるか（読むのは `Layout` だけ） */
export function useScreenCovered(): boolean {
  return useSyncExternalStore(
    cb => { subs.add(cb); return () => { subs.delete(cb) } },
    () => count > 0,
    () => false,
  )
}
