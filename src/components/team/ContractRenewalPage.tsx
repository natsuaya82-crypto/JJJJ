import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr, careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR, calcTransferValue, buildScoutReport } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

export default function ContractRenewalPage() {
  const navigate = useNavigate()
  const { players, currentSeason, decideRenewal } = useGameStore()
  const pendingIds = currentSeason.pendingRenewalDecisions ?? []

  const pendingPlayers = pendingIds
    .map(id => players.find(p => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p)

  const allDone = pendingIds.length === 0

  function handleRenew(playerId: string, years: number) {
    decideRenewal(playerId, true, years)
  }

  function handleRelease(playerId: string) {
    decideRenewal(playerId, false)
  }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <BackButton onClick={() => navigate('/team')}/>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.red, letterSpacing: '3px', fontWeight: 900 }}>CONTRACT RENEWAL</div>
            <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900, color: C.text }}>契約更新</div>
          </div>
          {pendingIds.length > 0 && (
            <div style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 20, background: alpha(C.red, 0.12), border: `1px solid ${alpha(C.red, 0.3)}` }}>
              <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.red }}>{pendingIds.length}</span>
              <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}> 名待機中</span>
            </div>
          )}
        </div>

        {allDone ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            borderRadius: 14, background: C.surface2,
            border: `1px solid ${alpha(C.green, 0.3)}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.green, marginBottom: 8 }}>更新完了</div>
            <div style={{ fontSize: 13, color: C.textSub }}>全選手の契約更新を処理しました</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
              以下の選手は今シーズン終了で契約満了です。更新するか手放すか決定してください。
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingPlayers.map(player => {
                const o = ovr(player)
                const newSalary = Math.round(player.contract.annualSalary * 1.12 / 500000) * 500000
                const ovrCol = o >= 80 ? C.gold : o >= 70 ? C.green : C.textSub
                return (
                  <div key={player.id} style={{
                    borderRadius: 14, position: 'relative', overflow: 'hidden',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `2px solid ${alpha(C.red, 0.35)}`,
                    boxShadow: `0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
                    padding: '14px',
                  }}>
                    <div style={{ position: 'absolute', inset: 3, border: `1px solid ${alpha(C.red, 0.2)}`, borderRadius: 10, pointerEvents: 'none' }}/>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, position: 'relative', zIndex: 1 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                        background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)',
                        border: `2px solid ${C.bg}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.gold,
                      }}>{player.jerseyNumber}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.text }}>{player.name}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{player.age}歳</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: alpha(C.surface, 0.8), color: C.textSub, border: `1px solid ${C.border}` }}>{SPECIALTY_LABELS[player.specialty]}</span>
                          {(() => {
                            const stage = careerStage(player)
                            const stageCol = CAREER_STAGE_COLOR[stage]
                            return (
                              <span style={{ fontFamily: SAIRA, fontSize: 10, padding: '1px 5px', borderRadius: 4, background: alpha(stageCol, 0.15), color: stageCol, fontWeight: 700, border: `1px solid ${alpha(stageCol, 0.3)}` }}>
                                {CAREER_STAGE_LABEL[stage]}
                              </span>
                            )
                          })()}
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: 12, color: ovrCol, fontWeight: 800 }}>OVR {o}</div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10, position: 'relative', zIndex: 1 }}>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
                        <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '1px', marginBottom: 3 }}>現在の年俸</div>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.textSub }}>{fmt(player.contract.annualSalary)}</div>
                      </div>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: C.surface, border: `1px solid ${alpha(C.gold, 0.3)}` }}>
                        <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '1px', marginBottom: 3 }}>更新時の年俸</div>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.gold }}>{fmt(newSalary)} <span style={{ fontSize: 9, color: C.textDim }}>+12%</span></div>
                      </div>
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: C.surface, border: `1px solid ${alpha(C.green, 0.25)}` }}>
                        <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '1px', marginBottom: 3 }}>市場価値</div>
                        <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.green }}>{fmt(calcTransferValue(player))}</div>
                      </div>
                    </div>
                    {(() => {
                      const report = buildScoutReport(player)
                      const trendCol = report.valueTrend === 'up' ? C.green : report.valueTrend === 'flat' ? C.gold : '#9B97A8'
                      const trendArrow = report.valueTrend === 'up' ? '↑' : report.valueTrend === 'flat' ? '→' : '↓'
                      return (
                        <div style={{ padding: '7px 9px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, marginBottom: 10, position: 'relative', zIndex: 1 }}>
                          <div style={{ fontSize: 9, color: C.textGhost, marginBottom: 3, fontFamily: SAIRA }}>成長見通し</div>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 700, color: trendCol, fontFamily: SAIRA }}>{trendArrow} {report.valueTrend === 'up' ? '上昇中' : report.valueTrend === 'flat' ? '安定' : '下降中'}</span>
                            <span style={{ fontSize: 10, color: C.textSub, lineHeight: 1.4, flex: 1 }}>{report.growthOutlook.length > 40 ? report.growthOutlook.slice(0, 40) + '…' : report.growthOutlook}</span>
                          </div>
                        </div>
                      )
                    })()}

                    <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 1 }}>
                      <button
                        onClick={() => handleRenew(player.id, 2)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10,
                          border: `2px solid ${C.goldDark}`,
                          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                          boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.1)`,
                          color: C.gold, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        更新（2年）
                      </button>
                      <button
                        onClick={() => handleRenew(player.id, 3)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: 10,
                          border: `2px solid ${C.goldDark}`,
                          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                          boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.1)`,
                          color: C.gold, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        更新（3年）
                      </button>
                      <button
                        onClick={() => handleRelease(player.id)}
                        style={{
                          padding: '10px 14px', borderRadius: 10,
                          border: `1px solid ${alpha(C.red, 0.4)}`,
                          background: alpha(C.red, 0.08),
                          color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        手放す
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
