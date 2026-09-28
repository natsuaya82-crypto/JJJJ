// 中継の再生の速さ（×10 / ×100 / ×200）。本編の中継（SimPhase）とオンライン対戦（online/RacePanel）が同じここを使う。
// 見た目は横並びの切り替え（ui/PillTabs）1本。段階は useRaceClock の RACE_SPEEDS 1本
import PillTabs from '../ui/PillTabs'
import { RACE_SPEEDS, type RaceSpeed } from './useRaceClock'

export function SpeedPicker({ speed, onChange }: { speed: RaceSpeed; onChange: (s: RaceSpeed) => void }) {
  return (
    <PillTabs labels={RACE_SPEEDS.map(s => `×${s}`)} value={RACE_SPEEDS.indexOf(speed)}
      onChange={i => onChange(RACE_SPEEDS[i])} />
  )
}
