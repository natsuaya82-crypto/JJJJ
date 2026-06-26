import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function getCourseType(race: { segments: { uphillPct: number; downhillPct: number; distanceKm: number }[] }): string {
  const segs = race.segments
  const totalDist = segs.reduce((s, sg) => s + sg.distanceKm, 0)
  if (totalDist === 0) return 'バランス'
  const avgUp = segs.reduce((s, sg) => s + sg.uphillPct * sg.distanceKm, 0) / totalDist
  const avgDown = segs.reduce((s, sg) => s + sg.downhillPct * sg.distanceKm, 0) / totalDist
  if (avgUp > 30) return '山岳'
  if (avgUp + avgDown > 25) return '起伏'
  if (totalDist / segs.length < 10) return 'スプリント'
  if (totalDist / segs.length > 14) return '持久'
  return 'バランス'
}

function getCourseColor(type: string): string {
  if (type === '山岳') return C.red
  if (type === '起伏') return C.gold
  if (type === 'スプリント') return C.pink
  if (type === '持久') return C.green
  return C.blue
}

export default function SchedulePage() {
  const navigate = useNavigate()
  const { currentSeason, playerTeamId } = useGameStore()
  const isSeasonStart = currentSeason.currentRaceIndex === 0 && !currentSeason.races[0]?.results

  const stIdx = currentSeason.secondTeamRaceIndex ?? 0
  const hasReserve = currentSeason.reserveLeagueJoined === true

  const mainRaces = currentSeason.races.map((r, i) => ({
    race: r,
    kind: 'main' as const,
    roundNum: i + 1,
    isNext: i === currentSeason.currentRaceIndex && !r.results,
    isDone: !!r.results,
    myRank: r.results?.teamRankings.find(tr => tr.teamId === playerTeamId)?.rank ?? null,
  }))

  const stRaces = hasReserve
    ? (currentSeason.secondTeamRaces ?? []).map((r, i) => ({
        race: r,
        kind: 'reserve' as const,
        roundNum: i + 1,
        isNext: i === stIdx && !r.results,
        isDone: !!r.results,
        myRank: r.results?.teamRankings.find(tr => tr.teamId === playerTeamId)?.rank ?? null,
      }))
    : []

  const allRaces = [...mainRaces, ...stRaces].sort((a, b) =>
    a.race.date.localeCompare(b.race.date)
  )

  const totalDone = currentSeason.currentRaceIndex + (hasReserve ? stIdx : 0)
  const totalRaces = currentSeason.races.length + (hasReserve ? (currentSeason.secondTeamRaces ?? []).length : 0)

  function rankColor(rank: number | null) {
    if (rank === null) return C.textDim
    if (rank === 1) return C.gold
    if (rank <= 3) return C.green
    if (rank <= 6) return C.textSub
    return C.red
  }

  function rankLabel(rank: number | null) {
    if (rank === null) return null
    return `${rank}位`
  }

  return (
    <div style={{ minHeight: '100%', backgroundColor: C.bg }}>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        padding: '16px 20px 12px',
        borderBottom: `1px solid ${C.border}`,
        position: 'sticky', top: 0,
        backgroundColor: C.bg,
        zIndex: 10,
      }}>
        <BackButton/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: '900', color: C.text }}>年間予定表</div>
          <div style={{ fontSize: '11px', color: C.textDim, marginTop: '1px' }}>{currentSeason.year}シーズン</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '13px', fontWeight: '800', color: C.gold, fontFamily: SAIRA, textShadow: '0 0 10px rgba(245,200,66,0.5)' }}>
            {totalDone}<span style={{ color: C.textDim, fontWeight: '400' }}>/{totalRaces}</span>
          </div>
          <div style={{ fontSize: '10px', color: C.textDim }}>試合消化</div>
        </div>
      </div>

      {isSeasonStart && (
        <div style={{
          margin: '12px 16px',
          borderRadius: 14,
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark ?? '#b8860b'}`,
          padding: '14px 16px',
          position: 'relative', overflow: 'hidden',
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
          display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', color: C.gold, fontWeight: '800', letterSpacing: '2px', marginBottom: '2px' }}>
              {currentSeason.year} シーズン開幕
            </div>
            <div style={{ fontSize: '12px', color: C.textSub }}>
              全{currentSeason.races.length}戦のスケジュール。NEXTをタップして出走準備へ。
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', padding: '10px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: C.gold }}/>
          <span style={{ fontSize: '11px', color: C.textSub }}>リーグ戦</span>
        </div>
        {hasReserve && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: C.blue }}/>
            <span style={{ fontSize: '11px', color: C.textSub }}>リザーブ</span>
          </div>
        )}
      </div>

      <div style={{ paddingBottom: '24px' }}>
        {allRaces.map(({ race, kind, roundNum, isNext, isDone, myRank }, idx) => {
          const accentColor = kind === 'main' ? C.gold : C.blue
          const accentShadow = kind === 'main' ? '#5a3500' : '#1a2050'
          const labelText = `第${roundNum}戦`
          const rColor = rankColor(myRank)

          const canEnter = isNext && kind === 'main'
          const CardTag = canEnter ? 'button' : 'div'

          return (
            <div
              key={race.id}
              style={{
                display: 'flex', alignItems: 'stretch', gap: '0',
                padding: '0 20px',
                opacity: isDone ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '24px', flexShrink: 0, paddingTop: '16px' }}>
                <div style={{
                  width: isNext ? 10 : 8, height: isNext ? 10 : 8, borderRadius: '50%',
                  backgroundColor: isDone ? C.border2 : isNext ? accentColor : alpha(accentColor, 0.5),
                  flexShrink: 0,
                  boxShadow: isNext ? `0 0 10px ${accentColor}` : 'none',
                  zIndex: 1,
                }}/>
                {idx < allRaces.length - 1 && (
                  <div style={{ flex: 1, width: 1, backgroundColor: C.border, marginTop: '4px' }}/>
                )}
              </div>

              <CardTag
                {...(canEnter ? { onClick: () => navigate('/race') } : {})}
                style={{
                  flex: 1, marginLeft: '12px',
                  marginBottom: idx < allRaces.length - 1 ? '6px' : '0',
                  padding: '12px 14px',
                  borderRadius: '14px',
                  border: isNext
                    ? `2px solid ${alpha(accentColor, 0.45)}`
                    : isDone
                    ? `1px solid ${C.border}`
                    : `1px solid ${alpha(accentColor, 0.2)}`,
                  background: isNext
                    ? `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`
                    : isDone
                    ? 'transparent'
                    : C.surface,
                  boxShadow: isNext
                    ? `0 4px 0 ${accentShadow}, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`
                    : 'none',
                  cursor: canEnter ? 'pointer' : 'default',
                  textAlign: 'left', fontFamily: 'inherit',
                  position: 'relative', overflow: isNext ? 'hidden' : 'visible',
                } as React.CSSProperties}
              >
                {isNext && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(accentColor, 0.3)}, transparent)`, pointerEvents: 'none' }}/>}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: '800', letterSpacing: '1px',
                        color: accentColor, padding: '1px 7px', borderRadius: '6px',
                        backgroundColor: alpha(accentColor, 0.12),
                        border: `1px solid ${alpha(accentColor, 0.25)}`,
                        fontFamily: SAIRA,
                      }}>
                        {labelText}
                      </span>
                      {isNext && (
                        <span style={{
                          fontSize: '10px', fontWeight: '800', color: C.bg,
                          padding: '1px 7px', borderRadius: '6px',
                          backgroundColor: accentColor,
                          fontFamily: SAIRA,
                        }}>NEXT</span>
                      )}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: isDone ? C.textSub : C.text, lineHeight: 1.2, marginBottom: '3px' }}>
                      {race.name}
                    </div>
                    <div style={{ fontSize: '11px', color: C.textDim }}>
                      {race.date.replace(/-/g, '/')} · {race.location}
                    </div>
                    {!isDone && (() => {
                      const courseType = getCourseType(race)
                      const courseCol = getCourseColor(courseType)
                      return (
                        <div style={{ display: 'flex', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '5px', backgroundColor: alpha(courseCol, 0.12), color: courseCol, fontWeight: '700', border: `1px solid ${alpha(courseCol, 0.25)}`, fontFamily: SAIRA }}>
                            {courseType}
                          </span>
                          <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '5px', backgroundColor: alpha(C.textGhost, 0.08), color: C.textGhost, fontFamily: SAIRA }}>
                            {race.segments.length}区間 · {race.segments.reduce((s, sg) => s + sg.distanceKm, 0).toFixed(1)}km
                          </span>
                        </div>
                      )
                    })()}
                  </div>

                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {isDone && myRank !== null ? (
                      <>
                        <div style={{ fontSize: '20px', fontWeight: '900', color: rColor, lineHeight: 1, fontFamily: SAIRA }}>{rankLabel(myRank)}</div>
                        <div style={{ fontSize: '10px', color: C.textDim, marginTop: '2px' }}>結果</div>
                      </>
                    ) : canEnter ? (
                      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 11, marginBottom: 8 }}>
                        <button
                          onClick={() => navigate('/race')}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '11px 18px', borderRadius: 11,
                            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                            border: `2px solid ${C.goldDark}`,
                            color: C.gold,
                            boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                            cursor: 'pointer', fontFamily: 'inherit',
                            position: 'relative', overflow: 'hidden',
                          }}
                        >
                          <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 8, pointerEvents: 'none' }}/>
                          <span style={{ fontSize: '11px', fontWeight: '800', position: 'relative', zIndex: 1 }}>出走準備</span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 1 }}>
                            <path d="M9 18l6-6-6-6" stroke={C.gold} strokeWidth="2.5" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </CardTag>
            </div>
          )
        })}
      </div>
    </div>
  )
}
