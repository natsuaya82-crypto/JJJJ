import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { ovr, faMarketSalary, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import type { Player, TransferBid, Team } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SALARY_STEP = 500000

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

const PERSONALITY_LABEL: Record<string, string> = {
  salary: '高年俸志向',
  winning: '勝利志向',
  loyalty: 'チーム愛着型',
}
const PERSONALITY_COLOR: Record<string, string> = {
  salary: C.gold,
  winning: C.green,
  loyalty: C.blue,
}

type Phase = 'opening' | 'round2' | 'accepted' | 'rejected'

type Choice = {
  label: string
  sub?: string
  tone: 'aggressive' | 'neutral' | 'generous'
  nextPhase: Phase
  salary: number
  years: number
  contractType: 'standard' | 'development' | 'dual'
  agentReaction: string
}

type PhaseConfig = {
  agentText: string
  choices: Choice[]
}

type NegState = {
  phase: Phase
  showReaction: boolean
  lastChoice: Choice | null
  finalSalary: number
  finalYears: number
  finalContractType: 'standard' | 'development' | 'dual'
  lastReaction: string
}

function sRound(n: number) {
  return Math.round(n / SALARY_STEP) * SALARY_STEP
}

function buildPhaseConfigs(
  player: Player,
  mode: 'fa' | 'transfer',
  bid: TransferBid | undefined,
  teams: Team[],
): Record<'opening' | 'round2', PhaseConfig> {
  const market = faMarketSalary(player)
  const personality = player.personality ?? 'salary'
  const pName = player.name
  const fromTeam = bid ? teams.find(t => t.id === bid.targetTeamId) : undefined

  const low    = sRound(market * 0.78)
  const mid    = sRound(market * 0.95)
  const high   = sRound(market * 1.12)
  const demand = sRound(market * (personality === 'salary' ? 1.02 : personality === 'loyalty' ? 0.92 : 0.96))

  const transferPrefix = mode === 'transfer' && bid && fromTeam
    ? `移籍金${fmt(bid.offeredFee)}で${fromTeam.shortName}との合意が取れました。次は本人との契約交渉です。\n\n`
    : ''

  if (personality === 'salary') {
    return {
      opening: {
        agentText: `${transferPrefix}${pName}本人は御クラブに強い関心を持っています。ただ、複数のクラブから声がかかっています。年俸${fmt(demand)}、契約2年をお示しできれば交渉を進められます。`,
        choices: [
          {
            label: `${fmt(low)}でスタートしたい`,
            sub: '段階的な引き上げを提案',
            tone: 'aggressive',
            nextPhase: 'round2',
            salary: low, years: 2, contractType: 'standard',
            agentReaction: `……正直、その額では他クラブとの比較になりません。もう一度ご検討をお願いします。`,
          },
          {
            label: `市場相場の${fmt(mid)}で`,
            sub: '2年契約・標準条件',
            tone: 'neutral',
            nextPhase: 'round2',
            salary: mid, years: 2, contractType: 'standard',
            agentReaction: `前向きに受け取っています。もう一押しあれば、すぐに動けます。`,
          },
          {
            label: `${fmt(high)}の好待遇でお迎えします`,
            sub: '3年長期契約も可能',
            tone: 'generous',
            nextPhase: 'accepted',
            salary: high, years: 3, contractType: 'standard',
            agentReaction: `素晴らしいご提案です！本人もすぐに合意します。手続きを進めましょう。`,
          },
        ],
      },
      round2: {
        agentText: `本人も御クラブへの移籍を真剣に考えています。最終的な条件として、もう少し上積みできませんか？年俸${fmt(demand)}まで引き上げていただけると即決します。`,
        choices: [
          {
            label: 'これ以上は難しい',
            sub: '現状のオファーが上限',
            tone: 'aggressive',
            nextPhase: 'rejected',
            salary: low, years: 2, contractType: 'standard',
            agentReaction: `残念ながら……本人は他のクラブを選ぶことになりそうです。`,
          },
          {
            label: `${fmt(mid)}・2年契約で最終提案`,
            sub: '誠意を示して合意を狙う',
            tone: 'neutral',
            nextPhase: 'accepted',
            salary: mid, years: 2, contractType: 'standard',
            agentReaction: `……わかりました。御クラブの誠意を受け取ります。合意します。`,
          },
          {
            label: `要求通り${fmt(demand)}・3年で`,
            sub: '長期契約で決断を引き出す',
            tone: 'generous',
            nextPhase: 'accepted',
            salary: demand, years: 3, contractType: 'standard',
            agentReaction: `完璧な条件です。喜んで合意します！`,
          },
        ],
      },
    }
  }

  if (personality === 'winning') {
    return {
      opening: {
        agentText: `${transferPrefix}${pName}は勝てるチームを探しています。年俸は${fmt(demand)}が目安ですが、それよりもチームの展望と自分の役割が重要です。来季の目標と起用プランを教えてください。`,
        choices: [
          {
            label: `${fmt(high)}の最高待遇でお迎えします`,
            sub: '経済的な好条件を提示',
            tone: 'aggressive',
            nextPhase: 'round2',
            salary: high, years: 2, contractType: 'standard',
            agentReaction: `ありがとうございます。ただ、本人はお金だけでは動きません。チームとしての熱意も見せてください。`,
          },
          {
            label: '来季は優勝を狙います',
            sub: 'チームの柱として迎えたい',
            tone: 'neutral',
            nextPhase: 'round2',
            salary: mid, years: 2, contractType: 'standard',
            agentReaction: `本人の目が輝きました。もう少し具体的な役割をお聞かせいただけますか？`,
          },
          {
            label: 'チームの中心として全力でサポートします',
            sub: '先発固定・全レース起用を約束',
            tone: 'generous',
            nextPhase: 'accepted',
            salary: mid, years: 3, contractType: 'standard',
            agentReaction: `それが聞きたかった！本人は今すぐにでも合意すると言っています。`,
          },
        ],
      },
      round2: {
        agentText: `本人は御クラブに強く惹かれています。最後に一つ確認させてください。来季の主要レース、どのように起用するつもりですか？`,
        choices: [
          {
            label: '2軍からのスタートをお願いしたい',
            sub: '実力を見せてもらってから',
            tone: 'aggressive',
            nextPhase: 'rejected',
            salary: low, years: 2, contractType: 'development',
            agentReaction: `……それは本人のプライドが許しません。申し訳ありませんが、お断りします。`,
          },
          {
            label: '競争の中でチャンスを与えます',
            sub: '状況次第で柔軟に起用',
            tone: 'neutral',
            nextPhase: 'accepted',
            salary: mid, years: 2, contractType: 'standard',
            agentReaction: `……少し不安はあるようですが、御クラブを信じると言っています。合意します。`,
          },
          {
            label: '主要レースは全て先発で起用します',
            sub: 'エース格での起用を確約',
            tone: 'generous',
            nextPhase: 'accepted',
            salary: mid, years: 3, contractType: 'standard',
            agentReaction: `完璧です！本人は迷わず合意します。`,
          },
        ],
      },
    }
  }

  // loyalty
  return {
    opening: {
      agentText: `${transferPrefix}${pName}は長期的な安定を求めています。可能であれば3年以上の長期契約を。年俸は${fmt(demand)}で十分だと言っています。長く一緒に戦いたいとのことです。`,
      choices: [
        {
          label: 'まずは1年様子見で',
          sub: '成績次第で更新を検討',
          tone: 'aggressive',
          nextPhase: 'round2',
          salary: mid, years: 1, contractType: 'standard',
          agentReaction: `……本人は長期的なビジョンを求めています。1年では踏み切れないようです。`,
        },
        {
          label: '2年契約でスタートしましょう',
          sub: '信頼関係を築きながら',
          tone: 'neutral',
          nextPhase: 'round2',
          salary: mid, years: 2, contractType: 'standard',
          agentReaction: `2年は最低限ですね。もう少し長期を検討していただける可能性はありますか？`,
        },
        {
          label: '3年以上の長期契約をお約束します',
          sub: 'チームの柱として長期契約',
          tone: 'generous',
          nextPhase: 'accepted',
          salary: demand, years: 3, contractType: 'standard',
          agentReaction: `まさにそれです！本人は迷わず合意すると言っています。`,
        },
      ],
    },
    round2: {
      agentText: `本人は御クラブへの気持ちがあります。3年契約は難しいでしょうか？それが叶うなら、年俸は多少下回っても構いません。`,
      choices: [
        {
          label: '1〜2年以上は約束できない',
          sub: 'チームの状況が見通せない',
          tone: 'aggressive',
          nextPhase: 'rejected',
          salary: low, years: 1, contractType: 'standard',
          agentReaction: `残念ながら……本人が求めるものとは違うようです。今回はご縁がなかったようです。`,
        },
        {
          label: `${fmt(high)}・2年、これが最大限`,
          sub: '年俸で誠意を示す',
          tone: 'neutral',
          nextPhase: 'accepted',
          salary: high, years: 2, contractType: 'standard',
          agentReaction: `本人も御クラブの誠意を感じています。了解します。`,
        },
        {
          label: '3年契約を受け入れます',
          sub: '長期パートナーとして',
          tone: 'generous',
          nextPhase: 'accepted',
          salary: demand, years: 3, contractType: 'standard',
          agentReaction: `ありがとうございます。本人は喜んで合意します！`,
        },
      ],
    },
  }
}

const TONE_COLORS = {
  aggressive: { border: alpha(C.red, 0.3),   bg: alpha(C.red, 0.06),   label: C.red },
  neutral:    { border: alpha(C.blue, 0.3),  bg: alpha(C.blue, 0.06),  label: C.blue },
  generous:   { border: alpha(C.green, 0.35), bg: alpha(C.green, 0.07), label: C.green },
} as const

export default function NegotiationPage() {
  const { mode, id } = useParams<{ mode: string; id: string }>()
  const navigate = useNavigate()

  const players        = useGameStore(s => s.players)
  const teams          = useGameStore(s => s.teams)
  const currentSeason  = useGameStore(s => s.currentSeason)
  const signFAPlayer   = useGameStore(s => s.signFAPlayer)
  const finalizeTransfer = useGameStore(s => s.finalizeTransfer)

  const typedMode = mode === 'transfer' ? 'transfer' : 'fa'

  const bid = typedMode === 'transfer'
    ? (currentSeason.transferBids ?? []).find(b => b.id === id)
    : undefined

  const player: Player | undefined = typedMode === 'fa'
    ? players.find(p => p.id === id)
    : bid ? players.find(p => p.id === bid.playerId) : undefined

  const [signFailed, setSignFailed] = useState(false)
  const [negState, setNegState] = useState<NegState>(() => {
    const market = player ? faMarketSalary(player) : 0
    return {
      phase: 'opening',
      showReaction: false,
      lastChoice: null,
      finalSalary: market,
      finalYears: 2,
      finalContractType: 'standard',
      lastReaction: '',
    }
  })

  if (!player) {
    return (
      <div style={{ padding: '24px 16px', color: C.text, fontFamily: SAIRA }}>
        選手が見つかりません
      </div>
    )
  }

  const phaseConfigs  = buildPhaseConfigs(player, typedMode, bid, teams)
  const personality   = player.personality ?? 'salary'
  const pColor        = PERSONALITY_COLOR[personality]
  const playerOvr     = ovr(player)
  const specCol       = SPEC_COLOR[player.specialty]
  const market        = faMarketSalary(player)
  const isTerminal    = negState.phase === 'accepted' || negState.phase === 'rejected'
  const currentConfig = (negState.phase === 'opening' || negState.phase === 'round2')
    ? phaseConfigs[negState.phase]
    : null
  const roundNum = negState.phase === 'round2' ? 2 : 1

  function handleChoice(choice: Choice) {
    setNegState(prev => ({
      ...prev,
      showReaction: true,
      lastChoice: choice,
      finalSalary: choice.salary,
      finalYears: choice.years,
      finalContractType: choice.contractType,
    }))
  }

  function handleContinue() {
    if (!negState.lastChoice) return
    setNegState(prev => ({
      ...prev,
      phase: prev.lastChoice!.nextPhase,
      showReaction: false,
      lastChoice: null,
      lastReaction: prev.lastChoice?.agentReaction ?? '',
    }))
  }

  function handleConfirm() {
    if (typedMode === 'fa') {
      const ok = signFAPlayer(player!.id, negState.finalSalary, negState.finalYears, negState.finalContractType)
      if (!ok) { setSignFailed(true); return }
    } else if (bid) {
      const ok = finalizeTransfer(bid.id, negState.finalSalary, negState.finalYears)
      if (!ok) { setSignFailed(true); return }
    }
    navigate(-1)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px',
        borderBottom: `1px solid ${C.border}`, backgroundColor: C.surface,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: C.textSub, fontSize: '13px', padding: '4px 0', fontFamily: SAIRA,
        }}>
          &larr; 戻る
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', fontFamily: SAIRA }}>
            {typedMode === 'fa' ? 'FA 交渉' : '移籍 契約交渉'}
          </span>
        </div>
        {!isTerminal && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
            {[1, 2].map(r => (
              <div key={r} style={{
                width: '7px', height: '7px', borderRadius: '50%',
                backgroundColor: r <= roundNum ? pColor : C.border2,
              }} />
            ))}
          </div>
        )}
        {isTerminal && (
          <span style={{
            fontSize: '10px', fontWeight: '700', fontFamily: SAIRA,
            color: negState.phase === 'accepted' ? C.green : C.red,
          }}>
            {negState.phase === 'accepted' ? '合意' : '決裂'}
          </span>
        )}
      </div>

      {/* Player info */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: `1px solid ${C.border}`, backgroundColor: C.surface,
      }}>
        <div style={{ width: 50, flexShrink: 0, overflow: 'hidden', borderRadius: 8 }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={50} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '16px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{player.name}</span>
            <span style={{
              fontSize: '9px', padding: '2px 6px', borderRadius: '5px', fontWeight: '700', fontFamily: SAIRA,
              backgroundColor: alpha(pColor, 0.1), color: pColor, border: `1px solid ${alpha(pColor, 0.2)}`,
            }}>
              {PERSONALITY_LABEL[personality]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '10px', color: specCol, fontWeight: '700', fontFamily: SAIRA }}>
              {SPECIALTY_LABELS[player.specialty]}
            </span>
            <span style={{ fontSize: '11px', color: C.textSub, fontFamily: SAIRA }}>OVR {playerOvr}</span>
            <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>
              市場年俸: <span style={{ color: C.gold, fontWeight: '700' }}>{fmt(market)}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Accepted */}
        {negState.phase === 'accepted' && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: C.green, fontFamily: SAIRA, letterSpacing: '3px', marginBottom: '4px' }}>
                契約成立
              </div>
              <div style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>交渉がまとまりました</div>
            </div>
            <div style={{
              backgroundColor: C.surface2, border: `1px solid ${alpha(C.green, 0.25)}`,
              borderRadius: '14px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
            }}>
              {typedMode === 'transfer' && bid && (
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>移籍金</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: C.orange, fontFamily: SAIRA }}>{fmt(bid.offeredFee)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>年俸{typedMode === 'transfer' ? '（契約継承）' : ''}</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: C.gold, fontFamily: SAIRA }}>{fmt(typedMode === 'transfer' ? player.contract.annualSalary : negState.finalSalary)} / 年</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>契約年数</span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{typedMode === 'transfer' ? player.contract.yearsLeft : negState.finalYears} 年</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>契約種別</span>
                <span style={{ fontSize: '12px', color: C.textSub, fontFamily: SAIRA }}>
                  {negState.finalContractType === 'standard' ? '本契約' : negState.finalContractType === 'development' ? '育成契約' : '2way契約'}
                </span>
              </div>
            </div>
            {signFailed && (
              <div style={{
                padding: '12px 14px', borderRadius: '10px', textAlign: 'center',
                background: alpha(C.red, 0.1), border: `1px solid ${alpha(C.red, 0.4)}`,
                color: C.red, fontSize: '12px', fontWeight: '700', fontFamily: SAIRA, lineHeight: 1.5,
              }}>
                {negState.finalContractType === 'standard' ? '1軍' : '2軍'}のロスターが上限です。<br/>
                枠を空けてから再度お試しください。
              </div>
            )}
            <button onClick={handleConfirm} style={{
              width: '100%', padding: '16px', borderRadius: '12px',
              border: `2px solid ${C.green}`,
              background: `linear-gradient(180deg, ${alpha(C.green, 0.12)}, ${alpha(C.green, 0.06)})`,
              color: C.green, fontSize: '15px', fontWeight: '900', cursor: 'pointer', fontFamily: SAIRA,
              boxShadow: `0 4px 0 ${alpha(C.green, 0.28)}, 0 6px 16px rgba(0,0,0,0.4)`,
            }}>
              契約を確定する
            </button>
          </>
        )}

        {/* Rejected */}
        {negState.phase === 'rejected' && (
          <>
            <div style={{ textAlign: 'center', padding: '20px 0 8px' }}>
              <div style={{ fontSize: '26px', fontWeight: '900', color: C.red, fontFamily: SAIRA, letterSpacing: '3px', marginBottom: '4px' }}>
                交渉決裂
              </div>
              <div style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>合意には至りませんでした</div>
            </div>
            {negState.lastReaction && (
              <div style={{
                backgroundColor: C.surface2, border: `1px solid ${alpha(C.red, 0.2)}`,
                borderRadius: '14px', padding: '16px',
              }}>
                <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px', fontFamily: SAIRA }}>
                  エージェント
                </div>
                <div style={{ fontSize: '13px', color: C.textSub, lineHeight: '1.65', fontFamily: SAIRA }}>
                  {negState.lastReaction}
                </div>
              </div>
            )}
            <button onClick={() => navigate(-1)} style={{
              width: '100%', padding: '14px', borderRadius: '12px',
              border: `1px solid ${C.border2}`, background: 'transparent',
              color: C.textSub, fontSize: '13px', cursor: 'pointer', fontFamily: SAIRA,
            }}>
              戻る
            </button>
          </>
        )}

        {/* Active negotiation */}
        {!isTerminal && currentConfig && (
          <>
            {/* Round label */}
            <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '3px', fontFamily: SAIRA, textAlign: 'center' }}>
              ROUND {roundNum} / 2
            </div>

            {/* Agent dialogue */}
            <div style={{
              backgroundColor: C.surface2,
              border: `1px solid ${negState.showReaction ? alpha(C.orange, 0.35) : alpha(pColor, 0.25)}`,
              borderRadius: '14px', padding: '16px 18px',
            }}>
              <div style={{
                fontSize: '9px', letterSpacing: '2px', marginBottom: '9px', fontFamily: SAIRA,
                color: negState.showReaction ? C.orange : C.textDim,
              }}>
                {negState.showReaction ? 'エージェントの反応' : 'エージェント'}
              </div>
              <div style={{ fontSize: '13px', color: C.text, lineHeight: '1.7', fontFamily: SAIRA, whiteSpace: 'pre-wrap' }}>
                {negState.showReaction && negState.lastChoice
                  ? negState.lastChoice.agentReaction
                  : currentConfig.agentText}
              </div>
            </div>

            {/* Continue or choices */}
            {negState.showReaction ? (
              <button onClick={handleContinue} style={{
                width: '100%', padding: '14px', borderRadius: '12px',
                border: `1px solid ${C.border2}`, background: C.surface2,
                color: C.textSub, fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: SAIRA,
              }}>
                続ける →
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentConfig.choices.map((choice, i) => {
                  const tc = TONE_COLORS[choice.tone]
                  return (
                    <button key={i} onClick={() => handleChoice(choice)} style={{
                      width: '100%', padding: '14px 16px', borderRadius: '12px',
                      border: `1px solid ${tc.border}`, background: tc.bg,
                      cursor: 'pointer', fontFamily: SAIRA, textAlign: 'left',
                    }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: choice.sub ? '3px' : 0 }}>
                        {choice.label}
                      </div>
                      {choice.sub && (
                        <div style={{ fontSize: '10px', color: C.textDim }}>{choice.sub}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
