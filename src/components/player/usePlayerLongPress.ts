import { useGameStore } from '../../store/gameStore'
import { useLongPress } from '../../lib/useLongPress'

// 選手詳細シートを「長押し(450ms)」で開く共有フック。
// 選手詳細への入り口は原則これに統一する（タップはメニュー・選択など画面固有の操作に使う）。
// 長押しの判定そのものは lib/useLongPress.ts に置いてある（選手以外の長押しと共通）。
// 使い方: const longPress = usePlayerLongPress(); <div {...longPress(p.id)}>...</div>
export function usePlayerLongPress() {
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const longPress = useLongPress()
  return (pid: string) => longPress(() => openPlayerSheet(pid))
}
