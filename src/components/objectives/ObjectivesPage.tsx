import { useGameStore } from '../../store/gameStore'
import { C, alpha, SAIRA } from '../../styles/tokens'
import BackButton from '../ui/BackButton'


const PROGRESS_IDS = new Set(['segWins', 'winRace', 'rivalBeat'])

export default function ObjectivesPage() {
  const { currentSeason } = useGameStore()
  const objectives = currentSeason.objectives ?? []
  const done = objectives.filter(o => o.done).length
  const earnedJ = objectives.filter(o => o.done).reduce((s, o) => s + (o.rewardJewels ?? 0), 0)
  const totalJ = objectives.reduce((s, o) => s + (o.rewardJewels ?? 0), 0)
  const allDone = objectives.length > 0 && done === objectives.length

  return (
    <div style={{ minHeight: '100%', background: C.bg }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <BackButton />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.gold, letterSpacing: '3px', fontWeight: 900 }}>{currentSeason.year} SEASON</div>
            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>シーズン目標</div>
          </div>
          <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: allDone ? C.green : C.gold }}>
            {done}/{objectives.length}
          </div>
        </div>

        {objectives.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: alpha('#a78bfa', 0.07), border: `1px solid ${alpha('#a78bfa', 0.2)}`, borderRadius: 10 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 11, color: alpha('#a78bfa', 0.7) }}>
              全達成で最大
            </span>
            <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: '#a78bfa', textShadow: '0 0 10px rgba(167,139,250,0.5)' }}>
              +{totalJ}J
            </span>
            {earnedJ > 0 && (
              <span style={{ fontFamily: SAIRA, fontSize: 11, color: alpha('#a78bfa', 0.6) }}>
                獲得済 +{earnedJ}J
              </span>
            )}
          </div>
        )}
      </div>

      {objectives.length === 0 ? (
        <div style={{ padding: '80px 20px', textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: 14 }}>
          シーズン開幕後に目標が設定されます
        </div>
      ) : (
        <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {objectives.map(obj => {
            const hasProgress = PROGRESS_IDS.has(obj.id) && !obj.done && obj.target > 0
            const progress = hasProgress ? Math.min(1, obj.current / obj.target) : 0
            return (
              <div key={obj.id} style={{
                background: obj.done
                  ? `linear-gradient(135deg, ${alpha(C.green, 0.12)} 0%, ${alpha(C.green, 0.04)} 100%)`
                  : `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${obj.done ? alpha(C.green, 0.55) : alpha(C.gold, 0.4)}`,
                borderRadius: 14, padding: '14px 16px',
                boxShadow: obj.done
                  ? `0 3px 0 #0d3d22, 0 5px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`
                  : `0 3px 0 #5a3500, 0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    background: obj.done ? C.green : alpha(C.gold, 0.12),
                    border: `2px solid ${obj.done ? C.green : alpha(C.gold, 0.45)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: obj.done ? `0 0 8px ${alpha(C.green, 0.5)}` : 'none',
                  }}>
                    {obj.done && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="2.8" strokeLinecap="round"/></svg>
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: obj.done ? 400 : 700, color: obj.done ? C.textDim : C.text, marginBottom: 6 }}>{obj.desc}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(obj.rewardJewels ?? 0) > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: alpha('#6dd5fa', obj.done ? 0.05 : 0.08), border: `1px solid ${alpha('#6dd5fa', obj.done ? 0.15 : 0.3)}`, borderRadius: 8, padding: '3px 8px' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill={obj.done ? 'rgba(59,159,212,0.4)' : 'url(#jg-obj)'} stroke={obj.done ? 'rgba(74,184,234,0.4)' : '#4ab8ea'} strokeWidth="1.2" strokeLinejoin="round"/>
                            <defs>
                              <linearGradient id="jg-obj" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="#a8e4ff"/>
                                <stop offset="100%" stopColor="#3b9fd4"/>
                              </linearGradient>
                            </defs>
                          </svg>
                          <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: obj.done ? 'rgba(109,213,250,0.4)' : '#6dd5fa' }}>+{obj.rewardJewels}</span>
                        </div>
                      )}
                      {hasProgress && (
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.gold, fontWeight: 700 }}>{obj.current}/{obj.target}</span>
                      )}
                    </div>
                    {hasProgress && (
                      <div style={{ height: 4, background: C.border, borderRadius: 2, marginTop: 6 }}>
                        <div style={{ height: '100%', width: `${progress * 100}%`, background: `linear-gradient(90deg, ${C.gold}, #FFD54F)`, borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
