import { useRef } from 'react'
import { useGameStore } from '../../store/gameStore'

// 選手詳細シートを「長押し(450ms)」で開く共有フック。
// 選手詳細への入り口は原則これに統一する（タップはメニュー・選択など画面固有の操作に使う）。
// 使い方: const longPress = usePlayerLongPress(); <div {...longPress(p.id)}>...</div>
export function usePlayerLongPress() {
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  return (pid: string) => ({
    onPointerDown: () => { timer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerLeave: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerMove: () => { if (timer.current) clearTimeout(timer.current) },
  })
}
