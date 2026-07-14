import type { Player, Team } from '../../types'
import { useNavigate } from 'react-router-dom'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { ovr, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, FORM_LABELS, FORM_COLORS, ratingColor, isStatMaxed } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

interface Props {
  players: Player[]
  team: Team
}

export default function KeyPlayersSection({ players, team }: Props) {
  const navigate = useNavigate()
  const longPress = usePlayerLongPress()
  const top = [...players].sort((a, b) => ovr(b) - ovr(a)).slice(0, 3)

  return (
    <div style={{ padding: '0 12px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h2 className="section-h2">注目選手</h2>
        <button
          onClick={() => navigate('/team/roster')}
          className="btn-press"
          style={{ background: 'none', border: 'none', color: C.gold, fontSize: 11, cursor: 'pointer', padding: '4px 0', fontFamily: SAIRA, fontWeight: 700, letterSpacing: '0.1em' }}
        >
          FULL →
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {top.map((p, i) => {
          const avg = ovr(p)
          const isTop = i === 0
          const condColor = (p.fatigue ?? 0) >= 70 ? C.red : (p.morale ?? 70) < 50 ? C.orange : C.green
          return (
            <div
              key={p.id}
              {...longPress(p.id)}
              className="btn-press"
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
                background: isTop
                  ? `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`
                  : `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
                border: isTop
                  ? `2px solid ${C.goldDark}`
                  : `1px solid ${C.border2}`,
                boxShadow: isTop
                  ? `0 4px 0 #5a3500, 0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)`
                  : `0 2px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)`,
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* 1位 accent line */}
              {isTop && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${C.goldHi}, ${C.goldDark})`, boxShadow: `0 0 8px ${alpha(C.gold, 0.6)}` }}/>}

              {/* Player face */}
              <div style={{
                width: 42, borderRadius: 11, flexShrink: 0, overflow: 'hidden',
                background: `linear-gradient(135deg, ${alpha(team.colors.primary, 0.45)}, ${alpha(team.colors.primary, 0.18)})`,
                border: `2px solid ${alpha(team.colors.primary, 0.5)}`,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.2), 0 2px 6px rgba(0,0,0,0.4)`,
              }}>
                <PlayerFace playerId={p.id} nationality={p.nationality} size={42} />
              </div>

              {/* Name + meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: isTop ? C.text : C.textSub }}>{p.name}</span>
                  {p.nationality === 'FOREIGN' && (
                    <span style={{ fontSize: 9, color: '#6B7BE8', fontWeight: 600,
                      padding: '1px 5px', borderRadius: 4, backgroundColor: '#6B7BE815', border: '1px solid #6B7BE830' }}>
                      海外
                    </span>
                  )}
                </div>
                {(() => {
                  const stage = careerStage(p)
                  const stageCol = CAREER_STAGE_COLOR[stage]
                  const frm = Math.round(p.form ?? 0) as -2 | -1 | 0 | 1 | 2
                  const frmCol = FORM_COLORS[frm]
                  const frmLabel = FORM_LABELS[frm]
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, letterSpacing: '0.06em' }}>{p.age}歳</span>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(stageCol, 0.15), color: stageCol, fontWeight: 700, border: `1px solid ${alpha(stageCol, 0.25)}` }}>
                        {CAREER_STAGE_LABEL[stage]}
                      </span>
                      {frm !== 0 && (
                        <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(frmCol, 0.12), color: frmCol, fontWeight: 700 }}>
                          {frmLabel}
                        </span>
                      )}
                    </div>
                  )
                })()}
              </div>

              {/* Condition dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: condColor, boxShadow: `0 0 7px ${alpha(condColor, 0.7)}` }}/>
              </div>

              {/* Ratings */}
              <div style={{ display: 'flex', gap: 8 }}>
                {([['速', 'speed'], ['持', 'stamina'], ['精', 'mental']] as ['速' | '持' | '精', 'speed' | 'stamina' | 'mental'][]).map(([l, key]) => {
                  const v = p.ratings[key]
                  const maxed = isStatMaxed(p, key)
                  const col = ratingColor(v, maxed)
                  return (
                    <div key={l} style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, marginBottom: 1, letterSpacing: '0.08em' }}>{l}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: col,
                        textShadow: (maxed || v >= 90) ? `0 0 8px ${alpha(col, 0.5)}` : 'none' }}>
                        {v}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* OVR */}
              <div style={{ textAlign: 'center', minWidth: 42, paddingLeft: 10, borderLeft: `1px solid ${alpha(C.gold, 0.2)}` }}>
                <div style={{
                  fontFamily: SAIRA, fontSize: 24, fontWeight: 900, lineHeight: 1,
                  background: avg >= 80
                    ? `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`
                    : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  filter: avg >= 80 ? `drop-shadow(0 0 6px ${alpha(C.gold, 0.4)})` : 'none',
                }}>
                  {avg}
                </div>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '1px' }}>OVR</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
