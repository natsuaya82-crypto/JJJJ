import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { loginTodayKey } from '../../utils/loginDate'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const fmtYen = (v: number) => v >= 100000000 ? `${(v / 100000000).toFixed(1)}億` : `${Math.round(v / 10000)}万`

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ fontFamily: SAIRA, fontSize: '9px', color, letterSpacing: '3px', marginBottom: '8px', fontWeight: '900' }}>
      {label}
    </div>
  )
}

function FaceOvr({ playerId, nationality, pOvr, accentColor }: {
  playerId: string; nationality: string; pOvr: number; accentColor: string
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '9px', overflow: 'hidden', border: `1px solid ${alpha(accentColor, 0.35)}` }}>
        <PlayerFace playerId={playerId} nationality={nationality as import('../../types').Nationality} size={36} />
      </div>
      <div style={{ position: 'absolute', bottom: -1, right: -1, background: 'rgba(0,0,0,0.88)', padding: '0 3px', borderRadius: '5px 0 5px 0', fontFamily: SAIRA, fontSize: '9px', fontWeight: '900', color: ratingColor(pOvr), lineHeight: '13px' }}>
        {pOvr}
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M9 18l6-6-6-6" stroke={C.textDim} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const {
    teams, players, currentSeason,
    resolveEvent,
    acceptIncomingOffer, declineIncomingOffer,
    acceptRetirement, dismissRetirementRequest,
  } = useGameStore()

  const pendingEvents = (currentSeason.events ?? []).filter(e => !e.resolved)
  const incomingOffers = currentSeason.incomingOffers ?? []
  const retirementRequests = currentSeason.retirementRequests ?? []
  const transferReqs = currentSeason.transferRequests ?? []
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered')
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm')
  const total = pendingEvents.length + incomingOffers.length
    + retirementRequests.length + transferReqs.length + counteredBids.length + pendingContracts.length

  const card = (border: string, shadow: string): React.CSSProperties => ({
    borderRadius: '14px', overflow: 'hidden', marginBottom: '8px', position: 'relative',
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    border: `2px solid ${border}`,
    boxShadow: `0 4px 0 ${shadow}, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
  })

  const inset: React.CSSProperties = {
    position: 'absolute', inset: 4, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, pointerEvents: 'none',
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }} />

      <div style={{
        position: 'fixed', bottom: 114, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', maxHeight: '68svh',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.border2}`,
        boxShadow: `0 -8px 40px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.06)`,
        borderRadius: '20px 20px 0 0', zIndex: 71, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 4, borderBottom: 'none', border: '1px solid rgba(245,200,66,0.15)', borderRadius: '16px 16px 0 0', pointerEvents: 'none', bottom: 0 }}/>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: C.text }}>通知</span>
            {total > 0 && (
              <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '800', padding: '2px 7px', borderRadius: '10px', background: C.red, color: '#fff' }}>{total}</span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, padding: '4px', display: 'flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '10px 12px 16px' }}>
          {total === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA, fontSize: '13px' }}>通知なし</div>
          ) : (
            <>
              {/* 引退申請 */}
              {retirementRequests.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="引退申請" color={C.textDim} />
                  {retirementRequests.map(req => {
                    const p = players.find(pl => pl.id === req.playerId)
                    if (!p) return null
                    const pOvr = ovr(p)
                    return (
                      <div key={req.playerId} style={card(alpha(C.textSub, 0.4), '#111')}>
                        <div style={inset}/>
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.textSub} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{p.name}</div>
                              <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textSub }}>{p.age}歳 · 引退を申し出</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => acceptRetirement(p.id)} style={{ flex: 1, padding: '9px', borderRadius: '10px', cursor: 'pointer', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>
                              引退承認
                            </button>
                            <button onClick={() => dismissRetirementRequest(p.id)} style={{ flex: 1, padding: '9px', borderRadius: '10px', cursor: 'pointer', border: `2px solid ${alpha(C.blue, 0.45)}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, boxShadow: `0 4px 0 #2a3580, inset 0 1px 0 rgba(255,255,255,0.08)`, color: C.blue, fontFamily: SAIRA, fontSize: '12px', fontWeight: '800', marginBottom: '4px' }}>
                              引き留める
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* 移籍要望 */}
              {transferReqs.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="移籍要望" color={C.orange} />
                  <div style={card(alpha(C.orange, 0.45), '#5a2800')}>
                    <div style={inset}/>
                    <button onClick={() => { navigate('/team/chat'); onClose() }} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0, background: alpha(C.orange, 0.12), border: `1px solid ${alpha(C.orange, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: C.orange }}>{transferReqs.length}</span>
                      </div>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{transferReqs.length}人が移籍を希望</div>
                        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.orange }}>チャットで対応</div>
                      </div>
                      <Chevron />
                    </button>
                  </div>
                </section>
              )}

              {/* 移籍金カウンター */}
              {counteredBids.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="移籍金交渉" color={C.green} />
                  {counteredBids.map(bid => {
                    const p = players.find(pl => pl.id === bid.playerId)
                    const targetTeam = teams.find(t => t.id === bid.targetTeamId)
                    if (!p) return null
                    const pOvr = ovr(p)
                    return (
                      <div key={bid.id} style={card(alpha(C.green, 0.45), '#0d3d22')}>
                        <div style={inset}/>
                        <button onClick={() => { navigate('/transfer'); onClose() }} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.green} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{p.name} → {targetTeam?.shortName ?? '?'}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.green }}>先方希望 {fmtYen(bid.counterFee ?? 0)}</div>
                          </div>
                          <Chevron />
                        </button>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* 契約交渉待ち */}
              {pendingContracts.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="契約交渉" color={C.gold} />
                  {pendingContracts.map(req => {
                    const p = players.find(pl => pl.id === req.playerId)
                    if (!p) return null
                    const pOvr = ovr(p)
                    return (
                      <div key={req.id} style={card(alpha(C.gold, 0.4), '#5a3500')}>
                        <div style={inset}/>
                        <button onClick={() => { navigate('/team/chat'); onClose() }} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.gold} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold }}>{fmtYen(req.demandSalary)} · 更新{req.demandYears}年を要求</div>
                          </div>
                          <Chevron />
                        </button>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* 移籍オファー */}
              {incomingOffers.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="移籍オファー" color={C.red} />
                  {incomingOffers.map(offer => {
                    const fromTeam = teams.find(t => t.id === offer.fromTeamId)
                    const target = players.find(p => p.id === offer.playerId)
                    if (!target) return null
                    const pOvr = ovr(target)
                    const expiresIn = Math.max(0, offer.expiresAtRace - currentSeason.currentRaceIndex)
                    return (
                      <div key={offer.id} style={card(alpha(C.red, 0.45), '#660e10')}>
                        <div style={inset}/>
                        <div style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                            <FaceOvr playerId={target.id} nationality={target.nationality} pOvr={pOvr} accentColor={C.red} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{target.name}</div>
                              <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textSub }}>{fromTeam?.shortName ?? '?'} が買取を希望</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: C.green }}>{fmtYen(offer.offeredPrice)}</div>
                              <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textGhost }}>期限 {expiresIn}戦</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button onClick={() => acceptIncomingOffer(offer.id)} style={{ flex: 1, padding: '9px', borderRadius: '10px', cursor: 'pointer', border: `2px solid ${alpha(C.green, 0.55)}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, boxShadow: `0 4px 0 #0d3d22, inset 0 1px 0 rgba(255,255,255,0.08)`, color: C.green, fontFamily: SAIRA, fontSize: '12px', fontWeight: '800', position: 'relative' as const, overflow: 'hidden' as const, marginBottom: '4px' }}>
                              <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }}/>
                              売却する
                            </button>
                            <button onClick={() => declineIncomingOffer(offer.id)} style={{ flex: 1, padding: '9px', borderRadius: '10px', border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}>断る</button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}

              {/* 選手コメント */}
              {pendingEvents.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="選手コメント" color={C.blue} />
                  {pendingEvents.map(event => {
                    const eventPlayer = event.playerId ? players.find(p => p.id === event.playerId) : null
                    const pOvr = eventPlayer ? ovr(eventPlayer) : null
                    return (
                      <div key={event.id} style={card(alpha(C.blue, 0.45), '#2a3580')}>
                        <div style={inset}/>
                        <div style={{ padding: '12px 14px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                            {pOvr !== null && eventPlayer ? (
                              <FaceOvr playerId={eventPlayer.id} nationality={eventPlayer.nationality} pOvr={pOvr} accentColor={C.blue} />
                            ) : (
                              <div style={{ width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0, background: alpha(C.blue, 0.12), border: `1px solid ${alpha(C.blue, 0.28)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                  <path d="M12 2L2 20h20L12 2z" stroke={C.blue} strokeWidth="2" strokeLinejoin="round"/>
                                  <path d="M12 9v5M12 17v.5" stroke={C.blue} strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                              </div>
                            )}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{event.title}</div>
                              {eventPlayer && <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.blue, marginBottom: '3px' }}>#{eventPlayer.jerseyNumber} {eventPlayer.name}</div>}
                              <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textSub, lineHeight: 1.5 }}>{event.body}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' as const }}>
                            {event.choices.map((choice, idx) => (
                              <button key={idx} onClick={() => resolveEvent(event.id, idx)} style={{ flex: 1, minWidth: '80px', padding: '8px', borderRadius: '10px', cursor: 'pointer', background: idx === 0 ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : C.surface, border: `${idx === 0 ? 2 : 1}px solid ${idx === 0 ? alpha(C.blue, 0.45) : C.border2}`, boxShadow: idx === 0 ? `0 3px 0 #2a3580, inset 0 1px 0 rgba(255,255,255,0.06)` : 'none', color: idx === 0 ? C.blue : C.textSub, fontFamily: SAIRA, fontSize: '9px', fontWeight: '700', lineHeight: 1.3, marginBottom: '4px' }}>
                                <div>{choice.label}</div>
                                <div style={{ color: idx === 0 ? alpha(C.blue, 0.65) : C.textGhost, marginTop: '1px', fontWeight: '400' }}>{choice.desc}</div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}

const SKIP_EVENT_TYPES = [
  'player_form_up', 'young_breakout', 'team_chemistry', 'player_milestone', 'budget_boost',
  'transfer_request', 'player_wants_renewal',
]

export function useNotifCount() {
  const { currentSeason, players, playerTeamId, lastLoginDate } = useGameStore()
  const events = (currentSeason.events ?? []).filter(e => !e.resolved && !SKIP_EVENT_TYPES.includes(e.type)).length
  const offers = (currentSeason.incomingOffers ?? []).length
  const retirements = (currentSeason.retirementRequests ?? []).length
  const transferReqs = (currentSeason.transferRequests ?? []).length > 0 ? 1 : 0
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered').length
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm').length > 0 ? 1 : 0
  const sponsorOffers = (currentSeason.sponsorOffers ?? []).length > 0 ? 1 : 0
  const loginUnclaimed = lastLoginDate !== loginTodayKey() ? 1 : 0
  // 契約満了6ヶ月以内の選手（NotificationsPage と同じ基準）
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const totalRaces = currentSeason.races?.length ?? 1
  const renewals = players.filter(p => {
    if (p.teamId !== playerTeamId || p.status !== 'active') return false
    const remaining = Math.max(0, totalRaces - raceIndex)
    const months = Math.round((p.contract.yearsLeft - 1 + remaining / totalRaces) * 12)
    return months < 6 && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id)
  }).length
  return events + offers + retirements + transferReqs + counteredBids + pendingContracts + sponsorOffers + loginUnclaimed + renewals
}
