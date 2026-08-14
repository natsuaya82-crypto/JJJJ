// ルールが決まったあと、今回走るコースを全員に見せる画面。
// ここは「読むだけ」の数秒。ホストはボタンで早送りできる。
import { useEffect, useState } from 'react'
import { serverNow } from '../../lib/serverTime'
import { CATEGORY_LABEL, type MatchCourse } from '../../data/matchCourses'
import { C, alpha, SAIRA } from '../../styles/tokens'


export default function CoursePanel({
  courses, deadline, isHost, onNext,
}: {
  courses: (MatchCourse | undefined)[]
  deadline: number | null
  isHost: boolean
  onNext: () => void
}) {
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (!deadline) return
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - serverNow()) / 1000)))
    tick()
    const t = setInterval(tick, 300)
    return () => clearInterval(t)
  }, [deadline])

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: 3, fontWeight: 900 }}>COURSE</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.text, marginTop: 4 }}>今回のコース</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          全{courses.length}レース／このコースを順番に走ります
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {courses.map((c, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: 40, textAlign: 'center', flexShrink: 0,
              fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.gold,
            }}>R{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c?.name ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
                {c ? `${c.location}・${c.distanceKm.toFixed(1)}km・${c.segments.length}区間` : ''}
              </div>
            </div>
            {c && (
              <div style={{
                flexShrink: 0, padding: '3px 8px',
                background: alpha(C.cyan, 0.12), color: C.cyan,
                fontSize: 9, fontWeight: 900, fontFamily: SAIRA, letterSpacing: 1,
              }}>{CATEGORY_LABEL[c.category]}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: '18px 0 0', textAlign: 'center' }}>
        {isHost ? (
          <button className="btn-game btn-game--gold" onClick={onNext} style={{ width: '100%' }}>
            <span className="btn-game__inner">オーダーを組む（{left}）</span>
          </button>
        ) : (
          <div style={{ fontSize: 12, color: C.textDim }}>まもなくオーダー選びが始まります（{left}）</div>
        )}
      </div>
    </div>
  )
}
