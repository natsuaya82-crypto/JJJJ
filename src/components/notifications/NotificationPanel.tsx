import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { loginTodayKey } from '../../utils/loginDate'
import { audio } from '../../utils/audio'
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
    acceptIncomingOffer, declineIncomingOffer,
    acceptRetirement, dismissRetirementRequest,
  } = useGameStore()
  const pendingGifts = useGameStore(s => s.pendingGifts ?? [])
  const claimGift = useGameStore(s => s.claimGift)
  const foreignLeaguesP = useGameStore(s => s.foreignLeagues ?? [])
  const [claimedGift, setClaimedGift] = useState<(typeof pendingGifts)[number] | null>(null)

  // フリー移籍の接触（offeredPrice=0）はGMが対応できないためパネルには出さない（通知ページで情報表示）
  const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice > 0)
  const retirementRequests = currentSeason.retirementRequests ?? []
  const playerTeamIdP = useGameStore(s => s.playerTeamId)
  // 移籍希望を出した後に退団・売却された選手の「幽霊リクエスト」は数えない（NotificationsPageと同じ）
  const transferReqs = (currentSeason.transferRequests ?? []).filter(r => players.some(p => p.id === r.playerId && p.teamId === playerTeamIdP && p.status === 'active'))
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered')
  const contactedIdsP = new Set((currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0).map(o => o.playerId))
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm' && !contactedIdsP.has(r.playerId))
  const total = incomingOffers.length
    + retirementRequests.length + transferReqs.length + counteredBids.length + pendingContracts.length
    + pendingGifts.length

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
              {/* アップデート記念プレゼント */}
              {pendingGifts.length > 0 && (
                <section style={{ marginBottom: '14px' }}>
                  <SectionLabel label="プレゼント" color={C.gold} />
                  {pendingGifts.map(gift => (
                    <div key={gift.id} style={card(alpha(C.gold, 0.6), '#5a3500')}>
                      <div style={inset}/>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0, background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                              <path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: C.gold, marginBottom: '2px' }}>{gift.title}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold }}>{gift.jewels ? `ジュエル${gift.jewels}個` : `カード${gift.cards.length}枚`}</div>
                          </div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textSub, lineHeight: 1.5, marginBottom: '10px' }}>{gift.message}</div>
                        <button onClick={() => { audio.playSe('reward'); setClaimedGift(gift); claimGift(gift.id) }} style={{ width: '100%', padding: '9px', borderRadius: '10px', cursor: 'pointer', border: `2px solid ${alpha(C.gold, 0.55)}`, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, boxShadow: `0 4px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)`, color: C.gold, fontFamily: SAIRA, fontSize: '12px', fontWeight: '800', marginBottom: '4px' }}>
                          受け取る
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

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
                    // 海外クラブへの入札は通知ページ（移籍金交渉カード）で対応する
                    const targetName = targetTeam?.shortName ?? foreignLeaguesP.flatMap(l => l.clubs).find(c => c.id === bid.targetTeamId)?.shortName ?? '海外クラブ'
                    if (!p) return null
                    const pOvr = ovr(p)
                    return (
                      <div key={bid.id} style={card(alpha(C.green, 0.45), '#0d3d22')}>
                        <div style={inset}/>
                        <button onClick={() => { navigate(targetTeam ? `/team/chat?trade=${bid.targetTeamId}` : '/notifications'); onClose() }} style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.green} />
                          <div style={{ flex: 1, textAlign: 'left' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '2px' }}>{p.name} → {targetName}</div>
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

            </>
          )}
        </div>
      </div>

      {/* 受け取りました ポップ */}
      {claimedGift && (
        <div onClick={() => setClaimedGift(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.gold}`, borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: `0 6px 0 ${alpha(C.gold, 0.35)}, 0 10px 40px ${alpha(C.gold, 0.25)}` }}>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>GIFT</div>
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: C.gold, marginBottom: 12, textShadow: `0 0 20px ${alpha(C.gold, 0.6)}` }}>受け取りました！</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 6 }}>{claimedGift.title}</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18 }}>{claimedGift.jewels ? `ジュエル${claimedGift.jewels}個を手に入れた` : `カード${claimedGift.cards.length}枚を手に入れた`}</div>
            <button onClick={() => setClaimedGift(null)} style={{ width: '100%', padding: 13, borderRadius: 12, background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, border: 'none', color: '#111', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </>
  )
}

// ベルの数字は通知ページ(NotificationsPage)の「N件」＝ total と完全一致させる。
// NotificationsPage.tsx の total 計算をそのまま同じ集合・同じ数え方で複製している。
// 片方だけ変えるとズレるので、通知ページの total を変えたらここも合わせること。
export function useNotifCount() {
  const { currentSeason, players, playerTeamId, lastLoginDate } = useGameStore()
  const pendingGifts = useGameStore(s => s.pendingGifts ?? [])
  const seenJoinIds = useGameStore(s => s.seenJoinIds ?? [])

  // フリー移籍の接触（offeredPrice=0）は情報通知として別カウント（NotificationsPageと同じ分け方・対応済みは除外）
  const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice > 0).length
  const seenFreeContactIds = currentSeason.seenFreeContactIds ?? []
  const freeContacts = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0 && !seenFreeContactIds.includes(o.id) && players.some(p => p.id === o.playerId && p.teamId === playerTeamId)).length
  const freeTransferNotices = (currentSeason.freeTransferNotices ?? []).length
  const departureNotices = (currentSeason.departureNotices ?? []).length
  const retirementRequests = (currentSeason.retirementRequests ?? []).length
  // 移籍希望を出した後に退団・売却された選手の「幽霊リクエスト」は数えない（NotificationsPageと同じ基準）
  const transferReqs = (currentSeason.transferRequests ?? []).filter(r => players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active')).length
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered').length
  const feeAcceptedBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'fee_accepted').length
  const contactedIdsC = new Set((currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0).map(o => o.playerId))
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm' && !contactedIdsC.has(r.playerId)).length
  const sponsorOffers = (currentSeason.sponsorOffers ?? []).length
  const expiredNegotiations = (currentSeason.expiredNegotiations ?? []).length
  const loanResponses = (currentSeason.loanResponses ?? []).length

  const joinNotices = players
    .filter(p => p.teamId === playerTeamId && p.joinedYear === currentSeason.year)
    .filter(p => !seenJoinIds.includes(`${p.id}-${p.joinedYear}`))
    .length

  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const totalRaces = currentSeason.races?.length ?? 1
  const renewalNeeded = players.filter(p => {
    if (p.teamId !== playerTeamId || p.status !== 'active') return false
    const remaining = Math.max(0, totalRaces - raceIndex)
    const months = Math.round((p.contract.yearsLeft - 1 + remaining / totalRaces) * 12)
    return months < 6 && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id) && !contactedIdsC.has(p.id)
  }).length

  const loginUnclaimed = lastLoginDate !== loginTodayKey()

  return incomingOffers + retirementRequests + transferReqs + counteredBids + feeAcceptedBids + pendingContracts
    + (renewalNeeded > 0 ? 1 : 0)
    + (loginUnclaimed ? 1 : 0)
    + (sponsorOffers > 0 ? 1 : 0)
    + pendingGifts.length
    + joinNotices
    + expiredNegotiations
    + loanResponses
    + freeContacts
    + freeTransferNotices
    + departureNotices
}
