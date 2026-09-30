// 中継の再生の速さと一時停止。本編の中継（SimPhase）とオンライン対戦（online/RacePanel）が同じここを使う。
// ボタン1つで押すたびに次の段へ（×1 → ×10 → ×20 → ×1）。見せる字は `RACE_SPEEDS` の一番遅い段を×1とした倍率
// （オーナー・2026-09-30「×10も×1で変わらない」）。段階は useRaceClock の RACE_SPEEDS 1本
import GlassButton from '../ui/GlassButton'
import { C, F, SAIRA } from '../../styles/tokens'
import { RACE_SPEEDS, type RaceSpeed } from './useRaceClock'

export function SpeedPicker({ speed, onChange }: { speed: RaceSpeed; onChange: (s: RaceSpeed) => void }) {
  const i = RACE_SPEEDS.indexOf(speed)
  const next = RACE_SPEEDS[(i + 1) % RACE_SPEEDS.length]
  const fast = i > 0
  return (
    <GlassButton onClick={() => onChange(next)} color={fast ? C.gold : C.textSub} size="sm"
      ariaLabel="再生の速さ" style={{ minWidth: 52, padding: '0 11px', alignSelf: 'stretch', fontFamily: SAIRA, fontSize: F.sub }}>
      ×{speed / RACE_SPEEDS[0]}
    </GlassButton>
  )
}

/** 一時停止／再生（印だけ）。速さの隣に置く */
export function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <GlassButton onClick={onToggle} color={paused ? C.gold : C.textSub} size="sm"
      ariaLabel={paused ? '再生' : '一時停止'} ariaPressed={paused} style={{ minWidth: 40, alignSelf: 'stretch' }}>
      {paused
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 4l14 8-14 8V4z" fill="currentColor"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4h4v16H7zM13 4h4v16h-4z" fill="currentColor"/></svg>}
    </GlassButton>
  )
}
