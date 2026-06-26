import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore, fmtTime } from '../../store/gameStore'
import { SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function IndividualEventsPage() {
  const navigate = useNavigate()
  const currentSeason = useGameStore(s => s.currentSeason)
  const players = useGameStore(s => s.players)
  const teams = useGameStore(s => s.teams)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const simulateIndividualEvent = useGameStore(s => s.simulateIndividualEvent)

  const events = currentSeason.individualEvents ?? []

  const distLabel = (d: number) => d === 5000 ? '5000m' : d === 10000 ? '10000m' : 'ハーフ'

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <BackButton onClick={() => navigate('/more')}/>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.blue, letterSpacing: '3px', fontWeight: 900 }}>INDIVIDUAL EVENTS</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>個人種目</div>
          </div>
          <div style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 12, color: C.textDim }}>全日本 {currentSeason.year}</div>
        </div>

        {events.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', fontFamily: SAIRA, color: C.textGhost, fontSize: 13 }}>
            今シーズンの個人種目データなし
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(ev => {
            const done = !!ev.results
            const myResults = done ? ev.results!.filter(r => r.teamId === playerTeamId) : []
            const myBest = myResults.sort((a, b) => a.rank - b.rank)[0]
            const myBestPlayer = myBest ? players.find(p => p.id === myBest.playerId) : null
            const topResults = done ? ev.results!.slice(0, 10) : []

            return (
              <div key={ev.id} style={{
                borderRadius: 14, position: 'relative', overflow: 'hidden',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: done ? `1px solid ${C.border}` : `2px solid ${C.goldDark}`,
                boxShadow: done ? 'none' : `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
                opacity: done ? 0.85 : 1,
              }}>
                {!done && <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />}

                {/* Event header */}
                <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 13, flexShrink: 0,
                    background: done ? alpha(C.gold, 0.08) : C.surface,
                    border: `1px solid ${done ? alpha(C.gold, 0.2) : C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: done ? C.gold : C.textDim }}>{distLabel(ev.distance)}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 800, color: done ? C.textSub : C.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{ev.date}</div>
                  </div>
                  {done ? (
                    <div style={{ padding: '4px 10px', borderRadius: 10, background: alpha(C.green, 0.12), border: `1px solid ${alpha(C.green, 0.3)}`, fontFamily: SAIRA, fontSize: 10, color: C.green, fontWeight: 700, flexShrink: 0 }}>完了</div>
                  ) : (
                    <button
                      onClick={() => simulateIndividualEvent(ev.id)}
                      style={{
                        padding: '9px 16px', borderRadius: 10,
                        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                        border: `2px solid ${C.goldDark}`,
                        boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.1)`,
                        color: C.gold, fontFamily: SAIRA, fontSize: 12, fontWeight: 900,
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      開催
                    </button>
                  )}
                </div>

                {/* My team result summary */}
                {done && myBestPlayer && (
                  <div style={{ margin: '0 14px 10px', padding: '8px 12px', borderRadius: 10, background: alpha(SPEC_COLOR[myBestPlayer.specialty], 0.08), border: `1px solid ${alpha(SPEC_COLOR[myBestPlayer.specialty], 0.2)}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 7, background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.3)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.gold, flexShrink: 0 }}>
                      {myBest.rank}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 700, color: C.text }}>{myBestPlayer.name}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim }}>チーム最高位</div>
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.gold, flexShrink: 0 }}>{fmtTime(myBest.timeSec)}</div>
                  </div>
                )}

                {/* Results table */}
                {done && topResults.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 60px 56px', gap: 4, padding: '6px 14px', borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textGhost }}>#</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textGhost }}>選手</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textGhost }}>所属</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textGhost, textAlign: 'right' }}>タイム</div>
                    </div>
                    {topResults.map(r => {
                      const p = players.find(x => x.id === r.playerId)
                      if (!p) return null
                      const team = teams.find(t => t.id === r.teamId)
                      const isMyTeam = r.teamId === playerTeamId
                      const rankColor = r.rank === 1 ? C.gold : r.rank === 2 ? '#9B97A8' : r.rank === 3 ? '#CD7F32' : C.textGhost
                      const specCol = SPEC_COLOR[p.specialty]
                      return (
                        <div key={r.playerId} style={{
                          display: 'grid', gridTemplateColumns: '28px 1fr 60px 56px', gap: 4,
                          padding: '6px 14px',
                          background: isMyTeam ? alpha(C.gold, 0.03) : 'transparent',
                          borderBottom: `1px solid ${alpha(C.border, 0.5)}`,
                          alignItems: 'center',
                        }}>
                          <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: rankColor, textAlign: 'center' }}>{r.rank}</div>
                          <div>
                            <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: isMyTeam ? 700 : 400, color: isMyTeam ? C.text : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </div>
                            <div style={{ fontFamily: SAIRA, fontSize: 8, padding: '1px 4px', borderRadius: 4, background: alpha(specCol, 0.12), color: specCol, display: 'inline-block', marginTop: 1 }}>
                              {SPECIALTY_LABELS[p.specialty]}
                            </div>
                          </div>
                          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.shortName ?? '—'}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: r.rank <= 3 ? C.gold : C.textSub, textAlign: 'right' }}>{fmtTime(r.timeSec)}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
