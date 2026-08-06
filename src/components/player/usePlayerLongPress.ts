import { useGameStore } from '../../store/gameStore'
import { useLongPress } from '../../lib/useLongPress'

// 選手詳細シートを「長押し(450ms)」で開く共有フック。
// 選手詳細への入り口は原則これに統一する（タップはメニュー・選択など画面固有の操作に使う）。
// 長押しの判定そのものは lib/useLongPress.ts に置いてある（選手以外の長押しと共通）。
// タップにも動作を付けたい画面は第2引数を渡す。長押しのあとのタップは捨てられる。
// 使い方: const longPress = usePlayerLongPress(); <div {...longPress(p.id, () => タップ時)}>...</div>
export function usePlayerLongPress() {
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const longPress = useLongPress()
  return (pid: string, onTap?: () => void) => longPress(() => openPlayerSheet(pid), onTap)
}
