import { useEffect, useRef } from 'react'

// 「長押し」の共通部品。押してから450msで発火、指が離れる・ずれると取り消し。
//
// もとは選手詳細用の usePlayerLongPress にだけタイマーが書いてあった。
// 走友会のメンバー行など選手以外にも長押しを付けるので、タイマーはここ1本に置いて、
// 「何をするか」だけ呼ぶ側から渡す形にする（同じ処理を2つ書かない）。
//
// 使い方: const longPress = useLongPress(); <div {...longPress(() => 何かする)}>...</div>
export const LONG_PRESS_MS = 450

export function useLongPress(ms: number = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  // 画面を離れた直後に発火しないよう、消えるときは必ず取り消す
  useEffect(() => clear, [])
  return (fire: () => void) => ({
    onPointerDown: () => { clear(); timer.current = setTimeout(fire, ms) },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove: clear,
    // スクロールに変わった指は pointerup ではなく pointercancel で終わる
    onPointerCancel: clear,
  })
}
