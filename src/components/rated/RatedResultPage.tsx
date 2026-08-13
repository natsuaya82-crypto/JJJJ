import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import FinishPanel from '../online/FinishPanel'
import RacePanel from '../online/RacePanel'
import { Card, RatedShell } from './ratedUi'
import { fetchResult, ratedCourseOf, ratedMatchCourse, type RatedResult } from '../../lib/ratedApi'
import { courseDistanceKm } from '../../engine/ratedCourse'
import { C, alpha, SAIRA } from '../../styles/tokens'
import type { Player } from '../../types'

// ============================================================================
// 前日の結果。**全画面の別ページ**。
//   見る → 本編と同じレース再生（`RacePanel` を solo で）
//   結果だけ → オンライン対戦と同じ `FinishPanel`
// 画面はどちらも新しく作らない。
// ============================================================================

export default function RatedResultPage() {
  const navigate = useNavigate()
  const hof = useGameStore(s => s.hofRoster)
  const [result, setResult] = useState<RatedResult | null>(null)
  const [view, setView] = useState<'choose' | 'watch' | 'result'>('choose')

  useEffect(() => { void fetchResult().then(setResult) }, [])

  // 再生で自分のチームだけ手元の選手を使う（殿堂入りは凍らせた姿のまま）
  const myPlayers: Player[] = useMemo(
    () => (hof ?? []).map(h => ({ ...h.player, fatigue: 0, form: 0, status: 'active' as const })),
    [hof])

  if (!result) return null

  // レース再生は箱に入れず、画面いっぱいで出す
  if (view === 'watch') {
    return (
      <RacePanel
        payload={result.race}
        course={ratedMatchCourse(result.dateISO)}
        raceNo={1}
        totalRaces={1}
        meId={result.meUserId}
        myPlayers={myPlayers}
        seriesPts={{}}
        waiting={false}
        onNext={() => setView('result')}
        solo
      />
    )
  }

  const delta = result.delta[result.meUserId] ?? 0
  const course = result.course

  return (
    <RatedShell title="前日の結果">
      {view === 'choose' && (
        <>
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{result.dateISO}</span>
              <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.cyan }}>
                {course.segments.length}区間 / {courseDistanceKm(result.course)}km
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
                グループ{result.group} / {result.groups}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {course.segments.map(s => (
                <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ width: 26, fontSize: 9, color: C.textDim, fontFamily: SAIRA, flexShrink: 0 }}>{s.index}区</span>
                  <span style={{ width: 44, fontSize: 10, color: C.textSub, fontFamily: SAIRA, flexShrink: 0 }}>{s.distanceKm}km</span>
                  <div style={{ flex: 1, height: 7, borderRadius: 4, overflow: 'hidden', display: 'flex', background: C.surface }}>
                    <div style={{ width: `${s.uphillPct}%`, background: alpha(C.red, 0.75) }} />
                    <div style={{ width: `${100 - s.uphillPct - s.downhillPct}%`, background: alpha(C.textDim, 0.35) }} />
                    <div style={{ width: `${s.downhillPct}%`, background: alpha(C.blue, 0.75) }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setView('watch')} className="btn-press" style={{
              flex: 1, padding: '15px 0', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: C.gold, color: '#1a0d00', fontSize: 15, fontWeight: 900, fontFamily: SAIRA,
            }}>レースを見る</button>
            <button onClick={() => setView('result')} className="btn-press" style={{
              flex: 1, padding: '15px 0', borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${C.border3}`, background: 'transparent',
              color: C.textSub, fontSize: 15, fontWeight: 900, fontFamily: SAIRA,
            }}>結果だけ見る</button>
          </div>
        </>
      )}

      {view === 'result' && (
        <>
          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textSub }}>レート</span>
              <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>
                {delta > 0 ? '+' : ''}{delta}
              </span>
              <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>
                グループ{result.group} / {result.groups}
              </span>
            </div>
          </Card>
          {/* ★順位も区間記録も、オンライン対戦の FinishPanel をそのまま使う */}
          <FinishPanel
            races={[result.race]}
            meId={result.meUserId}
            history
            leaveLabel="閉じる"
            onLeave={() => navigate(-1)}
            courseOf={ratedCourseOf}
          />
        </>
      )}
    </RatedShell>
  )
}
