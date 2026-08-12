// オンライン対戦の区間選択。
// 画面は新しく作らず、本編のレース準備とまったく同じ LineupPhase をそのまま使う。
// ここがやるのは「コースをレースの形に変える」「残り時間を出す」「時間切れで自動提出」だけ。
import { useEffect, useMemo, useRef, useState } from 'react'
import { LineupPhase } from '../race/LineupPhase'
import { courseToRace, type MatchCourse } from '../../data/matchCourses'
import { autoOrder, usableRoster, type Order } from '../../lib/roomMachine'
import { serverNow } from '../../lib/serverTime'
import type { Player } from '../../types'
import { C, alpha, SAIRA } from '../../styles/tokens'


export default function PickPanel({
  course, raceNo, totalRaces, deadline, roster, submitted, onSubmit,
}: {
  course: MatchCourse
  raceNo: number          // 1始まり
  totalRaces: number
  deadline: number | null
  roster: Player[]        // 自分のチームの選手（全員）
  submitted: boolean
  onSubmit: (o: Order) => void
}) {
  const [lineup, setLineup] = useState<Record<number, string>>({})
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [left, setLeft] = useState(0)

  const race = useMemo(() => courseToRace(course, raceNo), [course, raceNo])
  const segCount = course.segments.length
  const mainPlayers = useMemo(() => usableRoster(roster), [roster])

  // 故障者は選べない（健常者だけで区間が埋まらないときは解禁）
  const unavailable = useMemo(() => {
    const healthy = mainPlayers.filter(p => p.status !== 'injured').length
    if (healthy < segCount) return {}
    const out: Record<string, string> = {}
    for (const p of mainPlayers) if (p.status === 'injured') out[p.id] = '故障中'
    return out
  }, [mainPlayers, segCount])

  // レースが変わったら、いったんおまかせで埋めた状態から始める（時間切れでもそのまま走れる）
  useEffect(() => {
    setLineup(autoOrder(roster, course, raceNo).lineup)
    setPickerSeg(null)
  }, [course.id, raceNo])   // eslint-disable-line react-hooks/exhaustive-deps

  // 残り時間
  useEffect(() => {
    if (!deadline) return
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - serverNow()) / 1000)))
    tick()
    const t = setInterval(tick, 500)
    return () => clearInterval(t)
  }, [deadline])

  // 時間切れ＝そのときの並びを自動で提出
  const lineupRef = useRef(lineup)
  useEffect(() => { lineupRef.current = lineup }, [lineup])
  const sentRef = useRef(false)
  useEffect(() => { sentRef.current = submitted }, [submitted])
  useEffect(() => {
    if (!deadline) return
    const t = setTimeout(() => {
      if (!sentRef.current) { sentRef.current = true; onSubmit({ lineup: lineupRef.current }) }
    }, Math.max(0, deadline - serverNow()))
    return () => clearTimeout(t)
  }, [deadline])   // eslint-disable-line react-hooks/exhaustive-deps

  const allSegsFilled = course.segments.every(s => !!lineup[s.index])

  return (
    <LineupPhase
      race={race}
      raceNumber={raceNo}
      totalRaces={totalRaces}
      mainPlayers={mainPlayers}
      raceLineup={lineup}
      allSegsFilled={allSegsFilled}
      pickerSeg={pickerSeg}
      setPickerSeg={setPickerSeg}
      setRaceLineup={(i, id) => setLineup(l => ({ ...l, [i]: id }))}
      clearRaceLineup={() => setLineup({})}
      onStart={() => { if (!submitted) onSubmit({ lineup }) }}
      unavailable={unavailable}
      competition="friend"
      hideBack
      bottomInset={64}
      startDisabled={submitted}
      startLabel={submitted ? '提出済み — 他のチームを待っています' : `このオーダーで提出（${left}）`}
      headerNote={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontFamily: SAIRA, fontSize: 12, fontWeight: 900,
            color: left <= 10 ? C.red : C.gold,
            padding: '2px 8px', borderRadius: 6,
            background: alpha(left <= 10 ? C.red : C.gold, 0.12),
          }}>
            残り {left} 秒
          </div>
          {submitted && <div style={{ fontSize: 10, color: C.textDim }}>他のチームの提出待ち</div>}
        </div>
      }
    />
  )
}
