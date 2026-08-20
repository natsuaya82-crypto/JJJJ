import { createPortal } from 'react-dom'

/**
 * **画面いっぱい／画面の下端に貼るものを `<main>` の外へ出す入れもの。**
 *
 * ★ページの中に `position: fixed` を直接書かないこと。**実機（iOS）でだけ**壊れます。
 *
 *   `Layout` の `<main>` は `-webkit-overflow-scrolling: touch` のスクロール領域で、
 *   iOS の WebView はこれを `position: fixed` の基準（包含ブロック兼スタック文脈）に
 *   してしまいます。そのため main の中に書いた fixed は
 *     ・`inset: 0` にしても画面全体ではなく main の内側しか覆わない
 *     ・`z-index` をいくつにしても、外にいる下タブより上に来られない
 *   という状態になります。build 87 の走友会「反応する」シートは、これで見出しの
 *   一行しか見えず、絵文字が全部下タブの裏にありました。
 *   **ブラウザのプレビューでは再現しません。**
 *
 * ■通しても見た目は変わりません
 *   規格どおりのブラウザでは `fixed` はもともと viewport 基準（`<main>` の
 *   `position: fixed` は包含ブロックを作らず、ページの出現アニメ `page-in` も
 *   opacity だけで transform を使っていない）。**位置は1pxも動かず、iOS で
 *   崩れる場合だけ直る**、という形です。
 *
 * ■`BottomSheet` との違い
 *   あちらは「画面下から出るシート」という**見せ方**の部品（オーナーが許可した
 *   ときだけ使う）。こちらは中身を持たない**ただの管**で、ページの一部として
 *   下端に貼る行動ボタンや、画面いっぱいの演出をそのまま包みます。
 */
export default function ScreenPortal({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body)
}
