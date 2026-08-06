import { useEffect, useRef } from 'react'

// 「長押し」の共通部品。押してから450msで発火、指が離れる・ずれると取り消し。
//
// もとは選手詳細用の usePlayerLongPress にだけタイマーが書いてあった。
// 走友会のメンバー行など選手以外にも長押しを付けるので、タイマーはここ1本に置いて、
// 「何をするか」だけ呼ぶ側から渡す形にする（同じ処理を2つ書かない）。
//
// タップに別の動作を持たせたい画面は第2引数を渡す。長押しが発火したあとに続けて来る
// click は捨てる（長押しで詳細を開いたのに、指を離した瞬間にタップの処理まで走るのを防ぐ）。
// この「長押し＋タップ」の組み合わせは移籍方針・相手チーム・殿堂入りで同じものを手書きしていた。
//
// 使い方: const longPress = useLongPress(); <div {...longPress(() => 何かする, () => タップ時)}>...</div>
export const LONG_PRESS_MS = 450

export function useLongPress(ms: number = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fired = useRef(false)
  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }
  // 画面を離れた直後に発火しないよう、消えるときは必ず取り消す
  useEffect(() => clear, [])
  return (fire: () => void, onTap?: () => void) => ({
    onPointerDown: () => { clear(); fired.current = false; timer.current = setTimeout(() => { fired.current = true; fire() }, ms) },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerMove: clear,
    // スクロールに変わった指は pointerup ではなく pointercancel で終わる
    onPointerCancel: clear,
    onClick: () => { if (fired.current) { fired.current = false; return } onTap?.() },
  })
}
