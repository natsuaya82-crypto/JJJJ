import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

const BID_STATUS: Record<string, { label: string; color: string }> = {
  pending: { label: '回答待ち', color: C.textSub },
  fee_accepted: { label: '費用合意', color: C.green },
  countered: { label: '対抗提示', color: C.gold },
  rejected: { label: '拒否', color: C.red },
  player_neg: { label: '選手交渉中', color: C.blue },
  complete: { label: '完了', color: C.green },
  failed: { label: '破談', color: C.red },
}

export default function OfferListPage() {
  const navigate = useNavigate()
  const { players, teams, playerTeamId, currentSeason, acceptIncomingOffer, declineIncomingOffer, acceptFeeCounter, rejectTransferBid, cancelLoanRequest } = useGameStore()
  const [tab, setTab] = useState<'incoming' | 'outgoing'>('incoming')

  // フリー移籍の接触（offeredPrice=0）はGMが対応できないため除外（通知ページで情報表示）
  const incoming = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice > 0)
  const myBids = (currentSeason.transferBids ?? []).filter(b => ['pending', 'fee_accepted', 'countered', 'player_neg'].includes(b.status))
  const acqOffers = (currentSeason.acquisitionOffers ?? []).filter(o => o.status === 'pending' || o.status === 'countered')
  const loanReqs = currentSeason.loanRequests ?? []
  const outgoingCount = myBids.length + acqOffers.length + loanReqs.length

  const findP = (id: string) => players.find(p => p.id === id)
  const findT = (id: string) => teams.find(t => t.id === id)

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', border: 'none',
    background: active ? C.blue : C.surface2, color: active ? '#fff' : C.textDim,
    fontFamily: SAIRA, fontSize: 13, fontWeight: 900,
  })

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <BackButton />
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.gold }}>オファー一覧</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setTab('incoming')} style={tabBtn(tab === 'incoming')}>受けたオファー{incoming.length > 0 ? `（${incoming.length}）` : ''}</button>
          <button onClick={() => setTab('outgoing')} style={tabBtn(tab === 'outgoing')}>出したオファー{outgoingCount > 0 ? `（${outgoingCount}）` : ''}</button>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tab === 'incoming' && (
          incoming.length === 0
            ? <Empty text="他チームからのオファーはありません" />
            : incoming.map(o => {
                const p = findP(o.playerId); const t = findT(o.fromTeamId)
                if (!p) return null
                return (
                  <div key={o.id} style={cardStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                      <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(SPEC_COLOR[p.specialty], 0.4)}` }}>
                        <PlayerFace playerId={p.id} nationality={p.nationality} size={40} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{p.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: C.textDim }}>
                          {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={14} />}
                          <span>{t?.shortName ?? ''} から</span>
                          <span style={{ color: C.orange, fontWeight: 800, fontFamily: SAIRA }}>{o.offeredPrice > 0 ? `移籍金 ${fmt(o.offeredPrice)}` : 'フリー移籍（移籍金なし）'}</span>
                        </div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: ratingColor(ovr(p)) }}>{ovr(p)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
                      <button onClick={() => acceptIncomingOffer(o.id)} style={actBtn(C.green)}>{o.offeredPrice > 0 ? `売却する（+${fmt(o.offeredPrice)}）` : '移籍を認める'}</button>
                      <button onClick={() => declineIncomingOffer(o.id)} style={actBtn(C.textSub, true)}>断る</button>
                    </div>
                  </div>
                )
              })
        )}

        {tab === 'outgoing' && (
          outgoingCount === 0
            ? <Empty text="出しているオファーはありません" />
            : <>
                {loanReqs.map(r => {
                  const p = findP(r.playerId); const t = findT(r.targetTeamId); if (!p) return null
                  return (
                    <div key={r.id} style={{ ...cardStyle, border: `1px solid ${alpha(C.blue, 0.4)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={40} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: C.textDim }}>{t?.shortName ?? ''} へレンタル要請 {r.years}年</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: alpha(C.blue, 0.18), color: C.blue }}>回答待ち</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 12px' }}>
                        <span style={{ flex: 1, fontSize: 10, color: C.textDim }}>相手クラブの回答を待っています</span>
                        <button onClick={() => cancelLoanRequest(r.playerId)} style={{ ...actBtn(C.textSub, true), flex: 'none', padding: '8px 14px' }}>取り下げ</button>
                      </div>
                    </div>
                  )
                })}
                {acqOffers.map(o => {
                  const p = findP(o.playerId); if (!p) return null
                  const st = o.status === 'countered' ? { label: '回答あり', color: C.gold } : { label: '交渉中', color: C.blue }
                  return (
                    <button key={o.id} onClick={() => navigate(`/team/chat?player=${p.id}`)} style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', padding: 0, border: `1px solid ${alpha(st.color, 0.4)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={40} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: C.textDim }}>{o.source === 'fa' ? 'FA契約交渉' : '引き抜き交渉'}・チャットで交渉</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: alpha(st.color, 0.18), color: st.color }}>{st.label}</span>
                      </div>
                    </button>
                  )
                })}
                {myBids.map(b => {
                  const p = findP(b.playerId); const t = findT(b.targetTeamId); if (!p) return null
                  const s = BID_STATUS[b.status] ?? { label: b.status, color: C.textSub }
                  return (
                    <div key={b.id} style={{ ...cardStyle, border: `1px solid ${alpha(s.color, 0.4)}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={40} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{p.name}</div>
                          <div style={{ fontSize: 10, color: C.textDim }}>{t?.shortName ?? ''} へ入札 {fmt(b.offeredFee)}{b.status === 'countered' && b.counterFee != null ? ` → 要求 ${fmt(b.counterFee)}` : ''}</div>
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, background: alpha(s.color, 0.18), color: s.color }}>{s.label}</span>
                      </div>
                      {b.status === 'countered' && b.counterFee != null && (
                        <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
                          <button onClick={() => acceptFeeCounter(b.id)} style={actBtn(C.green)}>要求額で合意（{fmt(b.counterFee)}）</button>
                          <button onClick={() => rejectTransferBid(b.id)} style={actBtn(C.textSub, true)}>取り下げ</button>
                        </div>
                      )}
                      {b.status === 'fee_accepted' && (
                        <div style={{ padding: '0 12px 12px' }}>
                          <button onClick={() => navigate(`/team/chat?player=${b.playerId}`)} style={actBtn(C.green)}>選手と契約交渉へ →</button>
                        </div>
                      )}
                      {b.status === 'pending' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px 12px' }}>
                          <span style={{ flex: 1, fontSize: 10, color: C.textDim }}>相手クラブの回答を待っています</span>
                          <button onClick={() => rejectTransferBid(b.id)} style={{ ...actBtn(C.textSub, true), flex: 'none', padding: '8px 14px' }}>取り下げ</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
        )}
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
  border: `1px solid ${C.border}`, overflow: 'hidden',
}
function actBtn(color: string, ghost = false): React.CSSProperties {
  return {
    flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer',
    border: ghost ? `1px solid ${C.border2}` : 'none',
    background: ghost ? 'transparent' : alpha(color, 0.15),
    color, fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
  }
}
function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: 'center', color: C.textGhost, fontSize: 12, padding: '48px 0' }}>{text}</div>
}
