import GlassButton from '../ui/GlassButton'
import { C } from '../../styles/tokens'

// レースの再生を飛ばして結果だけ見るボタン。**見た目も文言もここ1本。**
//
// 自チームが出るレース（LineupPhase）にはもとからあったが、日本が予選落ちした年の
// 世界選手権には無く、**3戦とも最後まで再生を見せられていた**（自分は出ていないのに）。
// 同じ見た目のボタンを画面ごとに書き直すと、片方だけ文言や置き場所がずれる。
export function SkipRaceButton({ onClick, label = 'スキップ' }: { onClick: () => void; label?: string }) {
  return (
    <GlassButton onClick={onClick} color={C.textSub} style={{ flexShrink: 0, gap: 4 }}>
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 4l8 8-8 8M13 4l8 8-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </GlassButton>
  )
}
