import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr, calcTransferValue, ratingColor } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import { loginTodayKey } from '../../utils/loginDate'
import { audio } from '../../utils/audio'
import { Btn } from '../ui'
import PlayerFace from '../player/PlayerFace'
import type { IncomingOffer } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const fmtYen = (v: number) => v >= 100000000 ? `${(v / 100000000).toFixed(1)}億` : `${Math.round(v / 10000)}万`

function SectionHead({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px 8px' }}>
      <div style={{ width: '3px', height: '16px', borderRadius: '2px', background: color, flexShrink: 0 }}/>
      <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '800', color, letterSpacing: '3px' }}>{label}</span>
      <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '800', padding: '1px 7px', borderRadius: '10px', background: alpha(color, 0.2), color }}>{count}</span>
    </div>
  )
}

function FaceOvr({ playerId, nationality, pOvr, accentColor }: {
  playerId: string; nationality: string; pOvr: number; accentColor: string
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: '42px', height: '42px', borderRadius: '10px', overflow: 'hidden', border: `1px solid ${alpha(accentColor, 0.35)}` }}>
        <PlayerFace playerId={playerId} nationality={nationality as import('../../types').Nationality} size={42} />
      </div>
      <div style={{ position: 'absolute', bottom: -1, right: -1, background: 'rgba(0,0,0,0.88)', padding: '0 3px', borderRadius: '5px 0 5px 0', fontFamily: SAIRA, fontSize: '10px', fontWeight: '900', color: ratingColor(pOvr), lineHeight: '14px' }}>
        {pOvr}
      </div>
    </div>
  )
}

// --- Offer Chat ---

type OfferChatMsg = { from: 'team' | 'gm'; text: string }
const TRANSFER_STEP = 5_000_000

function OfferChatView({
  offer,
  onClose,
  initialMessages,
  onMessagesChange,
}: {
  offer: IncomingOffer
  onClose: () => void
  initialMessages?: OfferChatMsg[]
  onMessagesChange: (msgs: OfferChatMsg[]) => void
}) {
  const { teams, players, acceptIncomingOffer, declineIncomingOffer, counterIncomingOffer } = useGameStore()
  const fromTeam = teams.find(t => t.id === offer.fromTeamId)
  const player = players.find(p => p.id === offer.playerId)
  const pOvr = player ? ovr(player) : 0

  const defaultMsgs: OfferChatMsg[] = player && fromTeam ? [
    { from: 'team', text: `${player.name}選手の獲得に興味があります。移籍金${fmtYen(offer.offeredPrice)}でいかがでしょうか。` }
  ] : []

  const [chatMessages, setChatMessages] = useState<OfferChatMsg[]>(initialMessages ?? defaultMsgs)
  const [composing, setComposing] = useState(false)
  const [counterPrice, setCounterPrice] = useState(() => Math.round(offer.offeredPrice * 1.2 / TRANSFER_STEP) * TRANSFER_STEP)
  const [done, setDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'instant' }) }, [chatMessages])
  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])

  const append = (...msgs: OfferChatMsg[]) => setChatMessages(prev => [...prev, ...msgs])

  const handleAccept = () => {
    append(
      { from: 'gm', text: `了解です。${fmtYen(offer.offeredPrice)}で売却します。` },
      { from: 'team', text: '契約成立です。ありがとうございます。' }
    )
    setDone(true)
    acceptIncomingOffer(offer.id)
  }

  const handleDecline = () => {
    append(
      { from: 'gm', text: '今回はお断りします。' },
      { from: 'team', text: 'わかりました。また機会があればよろしくお願いします。' }
    )
    setDone(true)
    declineIncomingOffer(offer.id)
  }

  const handleCounter = () => {
    const fromTeamState = useGameStore.getState().teams.find(t => t.id === offer.fromTeamId)
    const canAfford = counterPrice <= (fromTeamState?.finance?.budget ?? 0)
    append({ from: 'gm', text: `${fmtYen(counterPrice)}であれば売却可能です。いかがでしょうか。` })
    counterIncomingOffer(offer.id, counterPrice)
    if (canAfford) {
      append({ from: 'team', text: `合意しました。${fmtYen(counterPrice)}での移籍を進めましょう。` })
    } else {
      append({ from: 'team', text: `申し訳ありませんが、${fmtYen(counterPrice)}は当クラブの予算を超えています。今回の交渉は終了とします。` })
    }
    setDone(true)
    setComposing(false)
  }

  const specCol = player ? C.gold : C.textDim

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: SAIRA }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={onClose} />
        {player && (
          <div style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', border: `2px solid ${alpha(specCol, 0.4)}`, flexShrink: 0 }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{player?.name ?? '—'}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>{fromTeam?.shortName ?? '?'} からのオファー · {fmtYen(offer.offeredPrice)}</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(pOvr) }}>{pOvr}</div>
      </div>

      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: msg.from === 'team' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
            {msg.from === 'team' && fromTeam && (
              <div style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: C.surface3, border: `1.5px solid ${alpha(C.red, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 900, color: C.red }}>{fromTeam.shortName.slice(0, 3)}</span>
              </div>
            )}
            <div style={{
              maxWidth: '72%', padding: '10px 13px',
              borderRadius: msg.from === 'team' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
              background: msg.from === 'team'
                ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})`
                : `linear-gradient(135deg, ${alpha(C.blue, 0.25)}, ${alpha(C.blue, 0.15)})`,
              border: `1px solid ${msg.from === 'team' ? C.border : alpha(C.blue, 0.35)}`,
              fontSize: 13, color: C.text, lineHeight: 1.6,
            }}>{msg.text}</div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg, position: 'sticky', bottom: 0 }}>
        {!done && composing ? (
          <div style={{ padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, color: C.textDim }}>希望移籍金</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setCounterPrice(p => Math.max(0, p - TRANSFER_STEP * 5))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>−5</button>
              <button onClick={() => setCounterPrice(p => Math.max(0, p - TRANSFER_STEP))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>−1</button>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>{fmtYen(counterPrice)}</span>
                <span style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>500万単位</span>
              </div>
              <button onClick={() => setCounterPrice(p => p + TRANSFER_STEP)}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>+1</button>
              <button onClick={() => setCounterPrice(p => p + TRANSFER_STEP * 5)}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>+5</button>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
              {[1.1, 1.25, 1.5, 2.0].map(r => {
                const v = Math.round(offer.offeredPrice * r / TRANSFER_STEP) * TRANSFER_STEP
                return (
                  <button key={r} onClick={() => setCounterPrice(v)}
                    style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${counterPrice === v ? C.red : C.border2}`, background: counterPrice === v ? alpha(C.red, 0.15) : 'transparent', color: counterPrice === v ? C.red : C.textDim, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>
                    {fmtYen(v)}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleCounter}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: C.red, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                この金額を提示する
              </button>
              <button onClick={() => setComposing(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                戻る
              </button>
            </div>
          </div>
        ) : done ? (
          <div style={{ padding: '10px 12px' }}>
            <button onClick={onClose}
              style={{ width: '100%', padding: '11px', borderRadius: 10, border: `1.5px solid ${alpha(C.textSub, 0.35)}`, backgroundColor: alpha(C.textSub, 0.08), color: C.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              閉じる
            </button>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { label: `売却する（${fmtYen(offer.offeredPrice)}）`, color: C.green, action: handleAccept },
              { label: '価格を交渉する', color: C.gold, action: () => setComposing(true) },
              { label: '断る', color: C.textSub, action: handleDecline },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action}
                style={{ width: '100%', padding: '11px', borderRadius: 10, border: `1.5px solid ${alpha(btn.color, 0.45)}`, backgroundColor: alpha(btn.color, 0.08), color: btn.color, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- Main Page ---

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { teams, players, currentSeason, playerTeamId, resolveEvent, lastLoginDate } = useGameStore()
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const pendingGifts = useGameStore(s => s.pendingGifts ?? [])
  const claimGift = useGameStore(s => s.claimGift)

  const [chatOfferId, setChatOfferId] = useState<string | null>(null)
  const [offerMessageCache, setOfferMessageCache] = useState<Record<string, OfferChatMsg[]>>({})
  const [claimedGift, setClaimedGift] = useState<(typeof pendingGifts)[number] | null>(null)

  const SKIP_EVENT_TYPES = [
    'player_form_up', 'young_breakout', 'team_chemistry', 'player_milestone', 'budget_boost',
    'transfer_request', 'player_wants_renewal',
  ]
  const pendingEvents = (currentSeason.events ?? []).filter(e => !e.resolved && !SKIP_EVENT_TYPES.includes(e.type))
  const incomingOffers = currentSeason.incomingOffers ?? []
  const retirementRequests = currentSeason.retirementRequests ?? []
  const transferReqs = currentSeason.transferRequests ?? []
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered')
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm')
  const sponsorOffers = currentSeason.sponsorOffers ?? []

  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const totalRaces = currentSeason.races?.length ?? 1
  // 契約満了までの残り月数を推定（最終年 yearsLeft=1 でシーズン開始時=12ヶ月、消化で減少）。
  // 6ヶ月を切った選手を個別に通知する。
  const renewalPlayers = players
    .filter(p => p.teamId === playerTeamId && p.status === 'active')
    .map(p => {
      const remaining = Math.max(0, totalRaces - raceIndex)
      const months = Math.round((p.contract.yearsLeft - 1 + remaining / totalRaces) * 12)
      return { p, months }
    })
    .filter(({ p, months }) => months < 6 && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id))
    .sort((a, b) => a.months - b.months)
  const renewalNeeded = renewalPlayers.length

  const loginUnclaimed = lastLoginDate !== loginTodayKey()

  const total = pendingEvents.length + incomingOffers.length
    + retirementRequests.length + transferReqs.length + counteredBids.length + pendingContracts.length
    + (renewalNeeded > 0 ? 1 : 0)
    + (loginUnclaimed ? 1 : 0)
    + (sponsorOffers.length > 0 ? 1 : 0)
    + pendingGifts.length

  const cardStyle = (borderColor: string, shadowColor: string): React.CSSProperties => ({
    borderRadius: '16px', overflow: 'hidden', position: 'relative',
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    border: `2px solid ${borderColor}`,
    boxShadow: `0 4px 0 ${shadowColor}, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
    marginBottom: '8px',
  })

  const inset: React.CSSProperties = {
    position: 'absolute', inset: 4, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, pointerEvents: 'none',
  }

  const chatOffer = chatOfferId ? incomingOffers.find(o => o.id === chatOfferId) : null

  if (chatOffer) return (
    <OfferChatView
      offer={chatOffer}
      onClose={() => setChatOfferId(null)}
      initialMessages={offerMessageCache[chatOffer.id]}
      onMessagesChange={msgs => setOfferMessageCache(prev => ({ ...prev, [chatOffer.id]: msgs }))}
    />
  )

  return (
    <div style={{ minHeight: '100%', background: C.bg, fontFamily: SAIRA }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <BackButton/>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: C.text }}>通知</div>
        </div>
        {total > 0 && (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '800', padding: '3px 10px', borderRadius: '12px', background: C.red, color: '#fff' }}>{total}件</div>
        )}
      </div>

      {total === 0 ? (
        <div style={{ padding: '80px 20px', textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: '14px' }}>通知なし</div>
      ) : (
        <div style={{ paddingBottom: '24px' }}>

          {/* アップデート記念プレゼント */}
          {pendingGifts.length > 0 && (
            <section>
              <SectionHead label="プレゼント" color={C.gold} count={pendingGifts.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendingGifts.map(gift => (
                  <div key={gift.id} style={cardStyle(alpha(C.gold, 0.6), '#5a3500')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M20 12v9H4v-9M2 7h20v5H2V7zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" stroke={C.gold} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: C.gold }}>{gift.title}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, lineHeight: 1.6, marginBottom: '10px' }}>{gift.message}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: C.gold, marginBottom: '12px', padding: '6px 10px', borderRadius: '8px', background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.25)}` }}>カード{gift.cards.length}枚</div>
                      <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, color: '#111' }} onClick={() => { audio.playSe('reward'); setClaimedGift(gift); claimGift(gift.id) }}>受け取る</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ログインボーナス */}
          {loginUnclaimed && (
            <section>
              <SectionHead label="ログインボーナス" color="#6dd5fa" count={1}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha('#6dd5fa', 0.45), '#0a2a3a')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '14px', fontWeight: '800', color: C.text, marginBottom: 6 }}>
                      本日のログインボーナスが未受取です
                    </div>
                    <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, #4ab8ea, #1a8bbf)`, color: '#fff' }} onClick={() => navigate('/login-bonus')}>受け取る</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 契約更新リマインダー（6ヶ月を切った選手を個別通知） */}
          {renewalNeeded > 0 && (
            <section>
              <SectionHead label="契約満了間近" color={C.orange} count={renewalNeeded}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {renewalPlayers.map(({ p, months }) => {
                  const pOvr = ovr(p)
                  const urgent = months < 3
                  const accent = urgent ? C.red : C.orange
                  const shadow = urgent ? '#660e10' : '#5a2800'
                  return (
                    <div key={p.id} style={cardStyle(alpha(accent, 0.45), shadow)}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={accent} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>#{p.jerseyNumber} · {p.age}歳</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: accent }}>残り{Math.max(0, months)}ヶ月</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: urgent ? C.red : C.textDim }}>{urgent ? '早急に対応を' : '契約満了が近い'}</div>
                          </div>
                        </div>
                        <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${accent}, ${urgent ? '#FF6B6B' : '#FFA726'})`, color: C.bg }} onClick={() => navigate(`/team/chat?player=${p.id}`)}>契約を交渉する</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 引退申請 */}
          {retirementRequests.length > 0 && (
            <section>
              <SectionHead label="引退申請" color={C.textSub} count={retirementRequests.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {retirementRequests.map(req => {
                  const p = players.find(pl => pl.id === req.playerId)
                  if (!p) return null
                  const pOvr = ovr(p)
                  return (
                    <div key={req.playerId} style={cardStyle(alpha(C.textSub, 0.4), '#111')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.textSub} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{p.age}歳 · 通算{p.career.totalRaces}レース</div>
                          </div>
                        </div>
                        <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.blue}, #42A5F5)`, color: C.bg }} onClick={() => openPlayerSheet(req.playerId)}>選手ページで対応する</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 移籍要望 */}
          {transferReqs.length > 0 && (
            <section style={{ marginTop: retirementRequests.length > 0 ? '20px' : 0 }}>
              <SectionHead label="移籍要望" color={C.orange} count={transferReqs.length}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.orange, 0.45), '#5a2800')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>{transferReqs.length}人が移籍を希望</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.orange, marginBottom: '14px' }}>チャットで対応してください</div>
                    <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.orange}, #FFA726)`, color: C.bg }} onClick={() => navigate('/team/chat')}>チャットへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 移籍金交渉 */}
          {counteredBids.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length > 0 || transferReqs.length > 0) ? '20px' : 0 }}>
              <SectionHead label="移籍金交渉" color={C.green} count={counteredBids.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {counteredBids.map(bid => {
                  const p = players.find(pl => pl.id === bid.playerId)
                  const targetTeam = teams.find(t => t.id === bid.targetTeamId)
                  if (!p) return null
                  const pOvr = ovr(p)
                  const mv = calcTransferValue(p)
                  const counterRatio = bid.counterFee ? bid.counterFee / mv : 0
                  const counterRating = counterRatio >= 0.95 ? { label: '適正', color: C.green } : counterRatio >= 0.75 ? { label: 'やや高', color: C.orange } : { label: '高値', color: C.red }
                  return (
                    <div key={bid.id} style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.green} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{targetTeam?.name ?? '?'} へ移籍打診中</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px', borderRadius: '10px', background: alpha(counterRating.color, 0.07), border: `1px solid ${alpha(counterRating.color, 0.2)}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>提示額</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: C.text }}>{fmtYen(bid.offeredFee)}</div>
                          </div>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke={C.textGhost} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>先方希望</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: counterRating.color }}>{fmtYen(bid.counterFee ?? 0)}</div>
                          </div>
                          <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: counterRating.color, padding: '2px 7px', borderRadius: '6px', background: alpha(counterRating.color, 0.15), marginLeft: 4 }}>{counterRating.label}</span>
                        </div>
                        <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: C.bg }} onClick={() => navigate(`/team/chat?trade=${bid.targetTeamId}&want=${bid.playerId}&feeMode=1`)}>チャットで対応する</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 契約交渉 */}
          {pendingContracts.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length + transferReqs.length + counteredBids.length) > 0 ? '20px' : 0 }}>
              <SectionHead label="契約交渉" color={C.gold} count={pendingContracts.length}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.gold, 0.45), '#5a3500')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>{pendingContracts.length}人が契約更新を要求</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, marginBottom: '14px' }}>チャットで対応してください</div>
                    <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, color: '#111' }} onClick={() => navigate('/team/chat')}>チャットへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* スポンサーオファー */}
          {sponsorOffers.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="スポンサーオファー" color={C.green} count={sponsorOffers.length}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>{sponsorOffers.length}社からスポンサーオファー</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.green, marginBottom: '14px' }}>契約内容を確認してください</div>
                    <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: C.bg }} onClick={() => navigate('/sponsors')}>スポンサーページへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 移籍オファー */}
          {incomingOffers.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length + transferReqs.length + counteredBids.length + pendingContracts.length) > 0 ? '20px' : 0 }}>
              <SectionHead label="移籍オファー" color={C.red} count={incomingOffers.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {incomingOffers.map(offer => {
                  const fromTeam = teams.find(t => t.id === offer.fromTeamId)
                  const target = players.find(p => p.id === offer.playerId)
                  if (!target) return null
                  const pOvr = ovr(target)
                  const expiresIn = Math.max(0, offer.expiresAtRace - currentSeason.currentRaceIndex)
                  const mv = calcTransferValue(target)
                  const ratio = mv > 0 ? offer.offeredPrice / mv : 0
                  const mvRating = ratio >= 0.95 ? { label: '適正', color: C.green } : ratio >= 0.75 ? { label: 'やや安', color: C.orange } : { label: '安値', color: C.red }
                  return (
                    <div key={offer.id} style={cardStyle(alpha(C.red, 0.45), '#660e10')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <FaceOvr playerId={target.id} nationality={target.nationality} pOvr={pOvr} accentColor={C.red} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{target.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{fromTeam?.shortName ?? '?'} が買取を希望</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.green, textShadow: `0 0 8px ${alpha(C.green, 0.4)}` }}>{fmtYen(offer.offeredPrice)}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '1px' }}>期限 {expiresIn}戦</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '7px 10px', borderRadius: '10px', background: alpha(mvRating.color, 0.08), border: `1px solid ${alpha(mvRating.color, 0.2)}` }}>
                          <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '700', color: mvRating.color, padding: '2px 6px', borderRadius: '6px', background: alpha(mvRating.color, 0.15) }}>{mvRating.label}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textSub }}>市場価値 <span style={{ color: C.text, fontWeight: '700' }}>{fmtYen(mv)}</span></span>
                          <span style={{ fontFamily: SAIRA, fontSize: '11px', color: mvRating.color, marginLeft: 'auto', fontWeight: '700' }}>{Math.round(ratio * 100)}%</span>
                        </div>
                        <Btn variant="primary" style={{ width: '100%' }} onClick={() => setChatOfferId(offer.id)}>対応する</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 選手イベント */}
          {pendingEvents.length > 0 && (
            <section style={{ marginTop: (incomingOffers.length + retirementRequests.length + transferReqs.length + counteredBids.length + pendingContracts.length) > 0 ? '20px' : 0 }}>
              <SectionHead label="選手イベント" color={C.blue} count={pendingEvents.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {pendingEvents.map(event => {
                  const eventPlayer = event.playerId ? players.find(p => p.id === event.playerId) : null
                  const pOvr = eventPlayer ? ovr(eventPlayer) : null

                  const isDanger = ['player_fatigue','transfer_request','budget_crisis','board_warning','player_morale_low'].includes(event.type)
                  const isGood   = ['player_form_up','young_breakout','team_chemistry','player_milestone','veteran_ambition','sponsor_offer','budget_boost'].includes(event.type)
                  const borderCol = isDanger ? C.red : isGood ? C.green : C.gold
                  const shadowCol = isDanger ? '#660e10' : isGood ? '#0d3d22' : '#5a3500'

                  const showFatigue  = event.type === 'player_fatigue' && eventPlayer
                  const showMorale   = ['player_morale_low','transfer_request','playing_time_demand','ai_poaching'].includes(event.type) && eventPlayer
                  const showContract = ['player_wants_renewal','transfer_request'].includes(event.type) && eventPlayer

                  const fatigue   = eventPlayer?.fatigue ?? 0
                  const morale    = eventPlayer?.morale ?? 0
                  const fatigueCol = fatigue >= 80 ? C.red : fatigue >= 60 ? C.orange : C.green
                  const moraleCol  = morale <= 30 ? C.red : morale <= 50 ? C.orange : C.green

                  return (
                    <div key={event.id} style={cardStyle(alpha(borderCol, 0.5), shadowCol)}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          {eventPlayer && pOvr !== null ? (
                            <FaceOvr playerId={eventPlayer.id} nationality={eventPlayer.nationality} pOvr={pOvr} accentColor={borderCol} />
                          ) : null}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '800', color: C.text, marginBottom: '1px' }}>{event.title}</div>
                            {eventPlayer && (
                              <div style={{ fontFamily: SAIRA, fontSize: '11px', color: borderCol, fontWeight: '700' }}>#{eventPlayer.jerseyNumber} {eventPlayer.name} · {eventPlayer.age}歳</div>
                            )}
                          </div>
                        </div>

                        <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, lineHeight: 1.65, marginBottom: '10px' }}>{event.body}</div>

                        {(showFatigue || showMorale || showContract) && (
                          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {showFatigue && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                  <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>疲労</span>
                                  <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '800', color: fatigueCol }}>{fatigue}/100{fatigue >= 80 ? ' — 危険域' : fatigue >= 60 ? ' — 要注意' : ''}</span>
                                </div>
                                <div style={{ height: '5px', backgroundColor: C.border, borderRadius: '3px' }}>
                                  <div style={{ height: '100%', width: `${fatigue}%`, backgroundColor: fatigueCol, borderRadius: '3px', transition: 'width 0.3s' }}/>
                                </div>
                              </div>
                            )}
                            {showMorale && (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                                  <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>モラール</span>
                                  <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '800', color: moraleCol }}>{morale}/100{morale <= 30 ? ' — 限界' : morale <= 50 ? ' — 不満' : ''}</span>
                                </div>
                                <div style={{ height: '5px', backgroundColor: C.border, borderRadius: '3px' }}>
                                  <div style={{ height: '100%', width: `${morale}%`, backgroundColor: moraleCol, borderRadius: '3px', transition: 'width 0.3s' }}/>
                                </div>
                              </div>
                            )}
                            {showContract && eventPlayer && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>契約残</span>
                                <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '800', color: (eventPlayer.contract.yearsLeft ?? 1) <= 1 ? C.red : C.gold }}>{eventPlayer.contract.yearsLeft}年</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {event.choices.map((choice, idx) => {
                            const isRisky = choice.desc.includes('リスク') || choice.desc.includes('故障') || choice.label.includes('無視')
                            const isNeg   = !isRisky && (choice.desc.includes('-') && !choice.desc.includes('+'))
                            const isPos   = !isRisky && !isNeg && choice.desc.includes('+')
                            const btnCol  = isRisky ? C.red : isNeg ? C.orange : isPos ? C.green : borderCol
                            const btnBg   = isRisky ? alpha(C.red, 0.08) : isNeg ? alpha(C.orange, 0.06) : isPos ? alpha(C.green, 0.07) : alpha(borderCol, 0.07)
                            const btnBorder = isRisky ? alpha(C.red, 0.35) : isNeg ? alpha(C.orange, 0.3) : isPos ? alpha(C.green, 0.3) : alpha(borderCol, 0.35)
                            return (
                              <button key={idx} onClick={() => resolveEvent(event.id, idx)} className="btn-press" style={{ width: '100%', padding: '10px 12px', borderRadius: '11px', cursor: 'pointer', background: btnBg, border: `1.5px solid ${btnBorder}`, textAlign: 'left', fontFamily: SAIRA, marginBottom: idx === event.choices.length - 1 ? 4 : 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '800', color: btnCol, marginBottom: '2px' }}>{choice.label}</div>
                                <div style={{ fontSize: '10px', color: C.textSub, lineHeight: 1.4 }}>{choice.desc}</div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* 受け取りました ポップ */}
      {claimedGift && (
        <div onClick={() => setClaimedGift(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.gold}`, borderRadius: 20, padding: 28, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: `0 6px 0 ${alpha(C.gold, 0.35)}, 0 10px 40px ${alpha(C.gold, 0.25)}` }}>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>GIFT</div>
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: C.gold, marginBottom: 12, textShadow: `0 0 20px ${alpha(C.gold, 0.6)}` }}>受け取りました！</div>
            <div style={{ fontSize: 13, color: C.textSub, marginBottom: 6 }}>{claimedGift.title}</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18 }}>カード{claimedGift.cards.length}枚を手に入れた</div>
            <button onClick={() => setClaimedGift(null)} style={{ width: '100%', padding: 13, borderRadius: 12, background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, border: 'none', color: '#111', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}
