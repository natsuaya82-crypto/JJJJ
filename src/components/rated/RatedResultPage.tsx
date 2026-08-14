import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import FinishPanel from '../online/FinishPanel'
import RacePanel from '../online/RacePanel'
import { Card, RatedShell } from './ratedUi'
import { fetchMe, fetchResult, ratedCourseOf, ratedMatchCourse, type RatedMe, type RatedResult } from '../../lib/ratedApi'
import { courseDistanceKm } from '../../engine/ratedCourse'
import RankUpOverlay from './RankUpOverlay'
import { rankChangeOf } from './rankArt'
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
  const [me, setMe] = useState<RatedMe | null>(null)
  const [view, setView] = useState<'choose' | 'watch' | 'result'>('choose')
  // 段位が変わった知らせは**結果を見終わってから1回だけ**
  const [rankSeen, setRankSeen] = useState(false)

  useEffect(() => {
    void fetchResult().then(setResult)
    void fetchMe().then(setMe)
  }, [])

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
  const after = me?.rating ?? 0
  const before = after - delta
  const showRank = view === 'result' && !rankSeen && !!rankChangeOf(before, after)

  return (
    <RatedShell title="前日の結果">
      {showRank && <RankUpOverlay before={before} after={after} onClose={() => setRankSeen(true)} />}
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
                  <div style={{ flex: 1, height: 7,overflow: 'hidden', display: 'flex', background: C.surface }}>
                    <div style={{ width: `${s.uphillPct}%`, background: alpha(C.red, 0.75) }} />
                    <div style={{ width: `${100 - s.uphillPct - s.downhillPct}%`, background: alpha(C.textDim, 0.35) }} />
                    <div style={{ width: `${s.downhillPct}%`, background: alpha(C.blue, 0.75) }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
          {/* ★単色で塗らない。本編と同じ立体ボタン（btn-game） */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setView('watch')} className="btn-game btn-game--gold" style={{ flex: 1 }}>
              <span className="btn-game__inner">レースを見る</span>
            </button>
            <button onClick={() => setView('result')} className="btn-game btn-game--blue" style={{ flex: 1 }}>
              <span className="btn-game__inner">結果だけ見る</span>
            </button>
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
