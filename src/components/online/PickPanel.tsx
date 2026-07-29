// オンライン対戦の区間選択。
// 画面は新しく作らず、本編のレース準備とまったく同じ LineupPhase をそのまま使う。
// ここがやるのは「コースをレースの形に変える」「残り時間を出す」「時間切れで自動提出」だけ。
import { useEffect, useMemo, useRef, useState } from 'react'
import { LineupPhase } from '../race/LineupPhase'
import { courseToRace, type MatchCourse } from '../../data/matchCourses'
import { assignLineupByTerrain } from '../../engine/raceEngine'
import { serverNow } from '../../lib/serverTime'
import type { Player } from '../../types'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

/** 1レースぶんの提出内容（区間番号 → 選手ID） */
export type Order = { lineup: Record<number, string> }

/**
 * 出走できる選手だけに絞る。本編のレース準備と同じ考え方。
 * 引退は除外。1軍（+レンタル）が区間数に足りなければ全員に広げ、
 * それでも足りなければ故障者も出せるようにする（詰み防止）。
 */
export function usableRoster(roster: Player[], segCount: number): Player[] {
  const alive = roster.filter(p => p.status !== 'retired')
  let list = alive.filter(p => p.rosterTier === 'main' || !!p.loan)
  if (list.filter(p => p.status !== 'injured').length < segCount) list = alive
  return list
}

/** おまかせ編成。未提出・回線落ちの人はこれで埋める。 */
export function autoOrder(roster: Player[], course: MatchCourse, raceNo = 1): Order {
  const segCount = course.segments.length
  const list = usableRoster(roster, segCount)
  const healthy = list.filter(p => p.status !== 'injured')
  const pool = healthy.length >= segCount ? healthy : list
  return { lineup: assignLineupByTerrain(pool, courseToRace(course, raceNo)) }
}

/** 全区間そろっているか */
export function isOrderComplete(o: Order | undefined, course: MatchCourse): boolean {
  if (!o?.lineup) return false
  return course.segments.every(s => !!o.lineup[s.index])
}

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
  const mainPlayers = useMemo(() => usableRoster(roster, segCount), [roster, segCount])

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
