import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { fmtYen } from '../../utils/money'
import type { SponsorTarget } from '../../types'

const MAX_SPONSORS = 3

const TIER_COLOR: Record<string, string> = {
  small:  C.textSub,
  medium: C.blue,
  large:  C.green,
  title:  C.gold,
}
const TIER_LABEL: Record<string, string> = {
  small:  'スモール',
  medium: 'ミディアム',
  large:  'ラージ',
  title:  'タイトル',
}

// 金額表示を他画面と統一（意図した変更）。以前はここだけ億に切り上げず「52,000万」の
// ように出ていて、同じ金額が画面によって表記が変わっていた。fmtYen に揃えて「5.2億」にする。

function targetText(t: SponsorTarget): string {
  if (t.type === 'rank') return `${t.value}位以内`
  if (t.type === 'segmentWins') return `区間賞${t.value}回以上`
  if (t.type === 'championship') return '優勝'
  return t.description
}

export default function SponsorPage() {
  const { sponsors, teams, playerTeamId, currentSeason, acceptSponsorOffer, terminateSponsor } = useGameStore()
  const [tab, setTab] = useState<'active' | 'offers'>('active')

  const myTeam = teams.find(t => t.id === playerTeamId)
  const teamSponsorIds = myTeam?.sponsors ?? []
  const activeSponsors = teamSponsorIds.map(id => sponsors.find(s => s.id === id)).filter(Boolean) as typeof sponsors

  const offers = currentSeason.sponsorOffers ?? []
  const totalAnnualIncome = activeSponsors.reduce((s, sp) => s + sp.annualPayment, 0)
  const slotsLeft = MAX_SPONSORS - activeSponsors.length

  const LogoBox = ({ color, size = 36 }: { color: string; size?: number }) => (
    <div style={{ width: size, height: size, borderRadius: size * 0.25, flexShrink: 0, background: alpha(color, 0.15), border: `1px solid ${alpha(color, 0.4)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    </div>
  )

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, padding: '12px 16px 10px', borderBottom: `1px solid ${C.border2}` }}>
        <BackButton/>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: '3px', fontWeight: 900, marginBottom: 4 }}>SPONSORS</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>スポンサー管理</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginBottom: 2 }}>年間収入</div>
            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.green }}>{fmtYen(totalAnnualIncome)}/年</div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, marginTop: 2 }}>{activeSponsors.length}/{MAX_SPONSORS}社</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', padding: '10px 12px 0', gap: 6 }}>
        {(['active', 'offers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '9px', borderRadius: 10, fontFamily: SAIRA,
            background: tab === t ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface}, ${C.bg})`,
            color: tab === t ? C.gold : C.textDim,
            fontSize: 12, fontWeight: tab === t ? 800 : 400,
            border: tab === t ? `2px solid ${C.goldDark}` : `1px solid ${C.border}`,
            boxShadow: tab === t ? `0 3px 0 #5a3500, 0 4px 10px rgba(0,0,0,0.4)` : 'none',
            cursor: 'pointer',
          }}>
            {t === 'active' ? `契約中 (${activeSponsors.length})` : `オファー (${offers.length})`}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeSponsors.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.textGhost, fontSize: 13 }}>
              契約中のスポンサーはありません
            </div>
          )}
          {activeSponsors.map(sp => {
            const col = TIER_COLOR[sp.tier]
            return (
              <div key={sp.id} style={{
                padding: '12px 14px', borderRadius: 14, position: 'relative', overflow: 'hidden',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${alpha(col, 0.45)}`,
                boxShadow: `0 4px 0 #1a1a2e, 0 6px 16px rgba(0,0,0,0.4)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <LogoBox color={sp.logoColor} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text }}>{sp.name}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 8, padding: '1px 5px', borderRadius: 5, background: alpha(col, 0.18), color: col, fontWeight: 800 }}>{TIER_LABEL[sp.tier]}</span>
                    </div>
                    {sp.target && (
                      <div style={{ fontSize: 10, color: C.textDim }}>
                        目標: <span style={{ color: C.textSub }}>{targetText(sp.target)}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.green }}>{fmtYen(sp.annualPayment)}/年</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 9, color: sp.yearsLeft <= 1 ? C.orange : C.textDim }}>残{sp.yearsLeft}年</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '8px 0 0', borderTop: `1px solid ${C.border}` }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>契約期間</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text }}>{sp.contractYears ?? sp.yearsLeft}年契約</div>
                  </div>
                  <div style={{ width: 1, background: C.border }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>残り</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: sp.yearsLeft <= 1 ? C.orange : C.text }}>{sp.yearsLeft}年</div>
                  </div>
                  <div style={{ width: 1, background: C.border }} />
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>期間終了時目標</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: col }}>{sp.target ? targetText(sp.target) : '—'}</div>
                  </div>
                </div>

                <button
                  onClick={() => terminateSponsor(sp.id, null)}
                  style={{ marginTop: 8, padding: '5px 10px', borderRadius: 7, border: `1px solid ${alpha(C.red, 0.28)}`, background: alpha(C.red, 0.08), color: C.red, fontSize: 9, cursor: 'pointer', fontFamily: SAIRA }}
                >
                  契約解除
                </button>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'offers' && (
        <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {slotsLeft === 0 && (
            <div style={{ padding: '8px 12px', borderRadius: 8, background: alpha(C.orange, 0.08), border: `1px solid ${alpha(C.orange, 0.3)}`, fontSize: 11, color: C.orange, textAlign: 'center' }}>
              契約数が上限（3社）です。既存契約を解除してから受諾できます。
            </div>
          )}
          {offers.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: C.textGhost, fontSize: 13 }}>
              オファーはありません（シーズン終了後に届きます）
            </div>
          )}
          {offers.map(offer => {
            const col = TIER_COLOR[offer.tier]
            const canAccept = slotsLeft > 0
            return (
              <div key={offer.id} style={{
                padding: '12px 14px', borderRadius: 14, position: 'relative', overflow: 'hidden',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${alpha(col, 0.4)}`,
                boxShadow: `0 4px 0 #1a1a2e, 0 6px 16px rgba(0,0,0,0.4)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <LogoBox color={offer.logoColor} size={40} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text }}>{offer.name}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 8, padding: '1px 5px', borderRadius: 5, background: alpha(col, 0.18), color: col, fontWeight: 800 }}>{TIER_LABEL[offer.tier]}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.textDim }}>
                      目標: <span style={{ color: C.textSub }}>{targetText(offer.target)}</span>
                      <span style={{ color: C.textGhost, marginLeft: 8 }}>{offer.contractYears}年契約</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.green }}>{fmtYen(offer.annualPayment)}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim }}>/年</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, padding: '8px 0 10px', borderTop: `1px solid ${C.border}`, marginBottom: 8 }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>契約年数</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text }}>{offer.contractYears}年</div>
                  </div>
                  <div style={{ width: 1, background: C.border }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>年間収入</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.green }}>{fmtYen(offer.annualPayment)}</div>
                  </div>
                  <div style={{ width: 1, background: C.border }} />
                  <div style={{ flex: 2, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>期間終了時目標</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: col }}>{targetText(offer.target)}</div>
                  </div>
                </div>

                <button
                  onClick={() => canAccept && acceptSponsorOffer(offer.id)}
                  disabled={!canAccept}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 10, fontFamily: SAIRA,
                    border: canAccept ? `2px solid ${alpha(C.green, 0.55)}` : `1px solid ${C.border}`,
                    background: canAccept
                      ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                      : C.surface,
                    boxShadow: canAccept ? `0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45)` : 'none',
                    color: canAccept ? C.green : C.textGhost,
                    fontSize: 12, fontWeight: 800, cursor: canAccept ? 'pointer' : 'not-allowed',
                  }}
                >
                  {canAccept ? '契約する' : '上限到達（3社）'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
