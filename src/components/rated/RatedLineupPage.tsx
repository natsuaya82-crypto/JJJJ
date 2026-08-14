import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineupPhase } from '../race/LineupPhase'
import { useGameStore } from '../../store/gameStore'
import { fetchMe, fetchToday, submitLineup, SUBMIT_DEADLINE_HHMM, type RatedToday } from '../../lib/ratedApi'
import { C, SAIRA, F } from '../../styles/tokens'
import type { Player } from '../../types'

// ============================================================================
// レート戦のメンバーを組む画面。
//
// ★**画面は新しく作らない。** 本編のレース準備とまったく同じ `LineupPhase` を使う
//   （オンライン対戦の `PickPanel` と同じやり方。あちらの1行目にも
//   「画面は新しく作らず、本編のレース準備とまったく同じ LineupPhase をそのまま使う」
//   と書いてある）。ここがやるのは「殿堂入りを走れる選手として渡す」「提出する」だけ。
//
// ★端末が出すのは「区間 → 選手ID」だけ。タイムにも順位にも触れない。
// ============================================================================

export default function RatedLineupPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster) ?? []
  const [today, setToday] = useState<RatedToday | null>(null)
  const [lineup, setLineup] = useState<Record<number, string>>({})
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [sent, setSent] = useState(false)

  // 提出できなかった理由。**黙って何も起きない、にしない**
  const [notice, setNotice] = useState('')

  useEffect(() => {
    void fetchToday().then(setToday)
    // ★もう出してあるなら**その編成を出しておく**（「組み直す」で入り直したとき、
    //   空から組み直させない）。1人ずつ替えられる
    void fetchMe().then(m => {
      if (Object.keys(m.lineup).length > 0) setLineup(m.lineup)
    })
  }, [])

  // 殿堂入りは登録した時点で凍らせてあるので、そのまま走れる選手として渡す。
  // 疲労と調子は持ち込まない（凍らせた姿で走る）
  const mainPlayers: Player[] = useMemo(
    () => hof.map(h => ({ ...h.player, fatigue: 0, form: 0, status: 'active' as const })),
    [hof])

  if (!today) return null
  const segs = today.course.segments
  const allSegsFilled = segs.every(s => !!lineup[s.index])

  const onSubmit = () => {
    if (!allSegsFilled || sent) return
    void submitLineup(lineup).then(r => {
      if (r === 'ok') { setSent(true); setTimeout(() => navigate(-1), 800); return }
      setNotice(
        r === 'closed' ? `締め切り（${SUBMIT_DEADLINE_HHMM}）を過ぎています`
        : r === 'join' ? '参加の申し込みが通っていません'
        : r === 'bad' ? '区間の数が合っていません'
        : 'サーバーにつながりませんでした')
    })
  }

  return (
    <LineupPhase
      race={today.course}
      raceNumber={today.day}
      totalRaces={today.totalDays}
      mainPlayers={mainPlayers}
      raceLineup={lineup}
      allSegsFilled={allSegsFilled}
      pickerSeg={pickerSeg}
      setPickerSeg={setPickerSeg}
      setRaceLineup={(i, id) => setLineup(l => ({ ...l, [i]: id }))}
      clearRaceLineup={() => setLineup({})}
      onStart={onSubmit}
      competition="friend"
      bottomInset={64}
      startDisabled={sent}
      startLabel={sent ? '提出しました' : notice || 'このオーダーで提出'}
      headerNote={
        <span style={{
          fontFamily: SAIRA, fontSize: F.label, fontWeight: 900, color: C.gold,
          padding: '2px 8px',background: 'rgba(245,200,66,0.12)',
        }}>締め切り {SUBMIT_DEADLINE_HHMM}</span>
      }
    />
  )
}
