// 画面の中の「いまどれを見ているか」（タブ・部の切り替え）を、
// 別のページへ行って戻ってきても保つための入れもの。
//
// ■なぜ要るのか（オーナー・2026-08-15）
//   「こういうさ3つに分かれてる1部2部3部とかもそうだけど、ここから詳細とか見ると
//     別ページに飛ばされるの地味に嫌だ！」
//   「3部の詳細見てて戻ったら1部になってるとか」
//
//   `useState` に持たせていると、詳細ページへ行った時点で画面ごと作り直されるので、
//   戻ったときに**必ず先頭のタブに戻ります**。走友会でカードを見ていたのに戻ると
//   メンバー、3部の順位表を見ていたのに戻ると1部、というのがこれです。
//
// ■置き場所は**URL**（`?tab=cards`）
//   「戻る」は `navigate(-1)`（`BackButton` / `PageHeader`）なので、履歴に残った
//   URLがそのまま戻ってきます。**覚えておく変数を別に持つ必要がありません。**
//
//   ★書き換えは必ず `replace`。`push` にすると、タブを3回押してから戻るボタンを
//     押したときに**タブを1つずつ遡るだけ**で前のページへ帰れなくなります。
//
//   ★**パス（`/standings/2` のような形）にはしないこと。** 画面の出現アニメは
//     `location.pathname` で動いているので（`App.tsx`）、パスを書き換えると
//     タブを押すたびにページごと出直します。クエリなら動きません。
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * URLに覚えさせるタブ。
 *
 * @param key    クエリの名前（`?tab=cards` の `tab`）
 * @param values 取りうる値。ここに無い値がURLに入っていたら fallback に落とす
 *               （古いリンク・手で書き換えられたURLで画面が壊れないように）
 * @param fallback URLに何も無いときの既定
 */
export function useStickyTab<T extends string | number>(
  key: string,
  values: readonly T[],
  fallback: T,
): [T, (v: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(key)
  const current = values.find(v => String(v) === raw) ?? fallback

  const set = useCallback((v: T) => {
    const next = new URLSearchParams(params)
    // 既定と同じものはURLに残さない（`?tab=members` のような無駄な字を増やさない）
    if (String(v) === String(fallback)) next.delete(key)
    else next.set(key, String(v))
    setParams(next, { replace: true })
  }, [key, fallback, params, setParams])

  return [current, set]
}
