import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import PlayerFace from '../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import type { TeamRole, GameEvent } from '../../types'
import { C, alpha } from '../../styles/tokens'

const CONTRACT_TYPE_OPTS = [
  { key: 'standard' as const, label: '1軍契約', desc: 'CAP全額' },
  { key: 'dual' as const, label: '2way', desc: 'CAP50%' },
  { key: 'development' as const, label: '2軍契約', desc: 'CAP外' },
]

const TEAM_ROLE_OPTS: { key: TeamRole; label: string }[] = [
  { key: 'ace', label: 'エース' },
  { key: 'sub_ace', label: 'サブエース' },
  { key: 'key_player', label: '主力' },
  { key: 'rotation', label: 'ローテ' },
  { key: 'development', label: '育成' },
]

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SALARY_STEP = 1000000
const SALARY_MIN = 3000000
const SALARY_MAX = 80000000

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

function contractMonths(yearsLeft: number, raceIndex: number, totalRaces: number): number {
  const remaining = Math.max(0, totalRaces - raceIndex)
  return Math.round((yearsLeft - 1 + remaining / Math.max(1, totalRaces)) * 12)
}

function fmtDuration(months: number): string {
  if (months <= 0) return '期限切れ'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}ヶ月`
  if (m === 0) return `${y}年`
  return `${y}年${m}ヶ月`
}

type ChatMessage = { from: 'player' | 'gm'; text: string }

const COMPLAINT_EVENT_TYPES = ['player_morale_low', 'player_fatigue', 'playing_time_demand', 'ai_poaching'] as const

function buildMessages(
  player: ReturnType<typeof useGameStore.getState>['players'][0],
  contractReq: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['contractRequests']>[0] | undefined,
  months: number,
  hasRetirement: boolean,
  hasTransfer: boolean,
  transferReason?: string,
  events?: GameEvent[],
): ChatMessage[] {
  const msgs: ChatMessage[] = []

  if (events) {
    events
      .filter(e => e.playerId === player.id && !e.resolved && (COMPLAINT_EVENT_TYPES as readonly string[]).includes(e.type))
      .forEach(e => msgs.push({ from: 'player', text: e.body }))
  }

  if (hasRetirement) {
    msgs.push({ from: 'player', text: `${player.age}歳になりました。正直、そろそろ引退を考えています。監督はどうお思いですか？` })
    return msgs
  }

  if (hasTransfer) {
    const reason = transferReason === 'playing_time'
      ? '最近、出場機会が思ったより少なくて...'
      : 'チームの成績のことを考えると、'
    msgs.push({ from: 'player', text: `${reason}他のクラブへの移籍を考えています。` })
    return msgs
  }

  if (!contractReq) {
    if (months < 12) {
      msgs.push({ from: 'player', text: `来シーズンの契約についてなのですが、まだ何も連絡がなくて。残り${months}ヶ月が気になっています。` })
    }
    return msgs
  }

  if (contractReq.initiatedBy === 'player' && contractReq.status === 'pending_gm') {
    msgs.push({ from: 'player', text: `来シーズンの契約についてお話があります。年俸${fmt(contractReq.demandSalary)}、${contractReq.demandYears}年契約での更新を希望します。いかがでしょうか？` })
    return msgs
  }

  if (contractReq.initiatedBy === 'gm') {
    msgs.push({ from: 'gm', text: `来シーズンの契約について話し合いたい。` })
    if (contractReq.status === 'pending_gm') {
      msgs.push({ from: 'player', text: `わかりました。どのような条件をお考えですか？` })
      return msgs
    }
  }

  if (contractReq.offerSalary > 0) {
    msgs.push({ from: 'gm', text: `年俸${fmt(contractReq.offerSalary)}、${contractReq.offerYears}年契約でいかがでしょうか。` })
  }

  if (contractReq.status === 'accepted') {
    msgs.push({ from: 'player', text: `ありがとうございます。その条件で合意します。よろしくお願いします。` })
    return msgs
  }

  if (contractReq.status === 'countered') {
    msgs.push({ from: 'player', text: `考えましたが、年俸${fmt(contractReq.counterSalary ?? 0)}、${contractReq.counterYears}年であれば合意できます。これ以上は難しいです。` })
    return msgs
  }

  if (contractReq.status === 'rejected') {
    msgs.push({ from: 'player', text: `申し訳ありませんが、その条件では受け入れられません。` })
    return msgs
  }

  return msgs
}

// --- Chat View ---

function ChatView({
  player,
  onClose,
  initialMessages,
  onMessagesChange,
}: {
  player: ReturnType<typeof useGameStore.getState>['players'][0]
  onClose: () => void
  initialMessages?: ChatMessage[]
  onMessagesChange: (msgs: ChatMessage[]) => void
}) {
  const {
    currentSeason,
    initiateContractRenewal, submitContractRenewalOffer,
    acceptContractCounter, reNegotiateContract,
    acceptRetirement, dismissRetirementRequest,
    dismissTransferRequest,
    generateContractRequests,
  } = useGameStore()

  const totalRaces = currentSeason.races.length
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const contractRequests = currentSeason.contractRequests ?? []
  const contractReq =
    contractRequests.find(r => r.playerId === player.id && r.status !== 'accepted' && r.status !== 'rejected') ??
    contractRequests.filter(r => r.playerId === player.id).at(-1)
  const retirementReq = (currentSeason.retirementRequests ?? []).find(r => r.playerId === player.id)
  const transferReq = (currentSeason.transferRequests ?? []).find(r => r.playerId === player.id)
  const months = contractMonths(player.contract.yearsLeft, raceIndex, totalRaces)

  const events = currentSeason.events ?? []
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    initialMessages ?? buildMessages(player, contractReq, months, !!retirementReq, !!transferReq, transferReq?.reason, events)
  )

  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])
  const [composing, setComposing] = useState(false)
  const [offerSalary, setOfferSalary] = useState(SALARY_MIN)
  const [offerYears, setOfferYears] = useState(2)
  const [offerContractType, setOfferContractType] = useState<'standard' | 'development' | 'dual'>('standard')
  const [offerTeamRole, setOfferTeamRole] = useState<TeamRole | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  })

  const specCol = SPEC_COLOR[player.specialty]
  const playerOvr = ovr(player)

  const append = (...msgs: ChatMessage[]) => setChatMessages(prev => [...prev, ...msgs])

  const openCompose = () => {
    const base = contractReq?.demandSalary
      ? Math.round(contractReq.demandSalary * 0.88 / SALARY_STEP) * SALARY_STEP
      : Math.round(player.contract.annualSalary * 1.05 / SALARY_STEP) * SALARY_STEP
    setOfferSalary(Math.max(SALARY_MIN, Math.min(SALARY_MAX, base)))
    setOfferYears(contractReq?.demandYears ?? 2)
    setOfferContractType(contractReq?.offerContractType ?? player.contract.contractType ?? 'standard')
    setOfferTeamRole(contractReq?.offerTeamRole ?? player.teamRole ?? null)
    setComposing(true)
  }

  const handleSubmitOffer = () => {
    append({ from: 'gm', text: `年俸${fmt(offerSalary)}、${offerYears}年契約でいかがでしょうか。` })
    if (!contractReq) {
      initiateContractRenewal(player.id)
      generateContractRequests()
    }
    const req = (useGameStore.getState().currentSeason.contractRequests ?? []).find(r => r.playerId === player.id && r.status !== 'accepted' && r.status !== 'rejected')
    if (req) {
      submitContractRenewalOffer(req.id, offerSalary, offerYears, offerContractType, offerTeamRole ?? undefined)
      const updated = (useGameStore.getState().currentSeason.contractRequests ?? []).find(r => r.id === req.id)
      if (updated?.status === 'accepted') {
        append({ from: 'player', text: 'ありがとうございます。その条件で合意します。よろしくお願いします。' })
      } else if (updated?.status === 'countered') {
        append({ from: 'player', text: `考えましたが、年俸${fmt(updated.counterSalary ?? 0)}、${updated.counterYears}年であれば合意できます。これ以上は難しいです。` })
      } else if (updated?.status === 'rejected') {
        append({ from: 'player', text: '申し訳ありませんが、その条件では受け入れられません。' })
      }
    }
    setComposing(false)
  }

  const replyButtons = (() => {
    if (retirementReq) return [
      { label: '引退を承認する', color: C.textSub, action: () => {
        append({ from: 'player', text: 'ありがとうございます。長い間お世話になりました。' })
        acceptRetirement(player.id)
      }},
      { label: '引き留める', color: C.blue, action: () => {
        append(
          { from: 'gm', text: 'まだチームにあなたの力が必要です。もう少し頑張ってもらえませんか。' },
          { from: 'player', text: 'わかりました。もう少し頑張ってみます。' }
        )
        dismissRetirementRequest(player.id)
      }},
    ]

    if (transferReq) return [
      { label: '移籍を認める', color: C.orange, action: () => {
        append({ from: 'player', text: 'ありがとうございます。移籍先を探します。' })
        dismissTransferRequest(player.id)
      }},
      { label: '残ってほしい', color: C.blue, action: () => {
        append(
          { from: 'gm', text: 'まだあなたの力が必要です。残ってください。' },
          { from: 'player', text: 'わかりました。もう少し様子を見てみます。' }
        )
        dismissTransferRequest(player.id)
      }},
    ]

    if (contractReq?.status === 'accepted') return [
      { label: '閉じる', color: C.green, action: onClose },
    ]

    if (contractReq?.status === 'rejected') return [
      { label: '条件を変えて提示する', color: C.blue, action: openCompose },
    ]

    if (contractReq?.status === 'countered') return [
      { label: `承諾する（${fmt(contractReq.counterSalary ?? 0)}/${contractReq.counterYears}年）`, color: C.green, action: () => {
        append(
          { from: 'gm', text: `了解しました。年俸${fmt(contractReq.counterSalary ?? 0)}、${contractReq.counterYears}年で合意します。` },
          { from: 'player', text: 'ありがとうございます。よろしくお願いします。' }
        )
        acceptContractCounter(contractReq.id)
      }},
      ...(contractReq.round < 3 ? [{ label: '再交渉する', color: C.gold, action: () => {
        append({ from: 'gm', text: '条件を再考させてください。' })
        reNegotiateContract(contractReq.id)
        openCompose()
      }}] : []),
    ]

    if (contractReq?.status === 'pending_gm') return [
      { label: `要求通り承諾（${fmt(contractReq.demandSalary)}/${contractReq.demandYears}年）`, color: C.green, action: () => {
        append(
          { from: 'gm', text: `了解です。年俸${fmt(contractReq.demandSalary)}、${contractReq.demandYears}年で承諾します。` },
          { from: 'player', text: 'ありがとうございます。よろしくお願いします。' }
        )
        submitContractRenewalOffer(contractReq.id, contractReq.demandSalary, contractReq.demandYears, contractReq.offerContractType ?? 'standard', undefined)
      }},
      { label: '条件を変更して提示する', color: C.blue, action: openCompose },
    ]

    if (months < 12 || contractReq?.initiatedBy === 'gm') return [
      { label: '契約条件を提示する', color: C.blue, action: openCompose },
    ]

    return [
      { label: '契約更新の話をする', color: C.blue, action: openCompose },
    ]
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={onClose} />
        <div style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', border: `2px solid ${alpha(specCol, 0.4)}`, flexShrink: 0 }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{player.name}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>
            {player.age}歳 · {fmt(player.contract.annualSalary)} · 残{fmtDuration(months)}
          </div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(playerOvr) }}>{playerOvr}</div>
      </div>

      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: msg.from === 'player' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
            {msg.from === 'player' && (
              <div style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${alpha(specCol, 0.35)}` }}>
                <PlayerFace playerId={player.id} nationality={player.nationality} size={32} />
              </div>
            )}
            <div style={{
              maxWidth: '72%',
              padding: '10px 13px',
              borderRadius: msg.from === 'player' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
              background: msg.from === 'player'
                ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})`
                : `linear-gradient(135deg, ${alpha(C.blue, 0.25)}, ${alpha(C.blue, 0.15)})`,
              border: `1px solid ${msg.from === 'player' ? C.border : alpha(C.blue, 0.35)}`,
              fontSize: 13,
              color: C.text,
              lineHeight: 1.6,
            }}>
              {msg.text}
            </div>
          </div>
        ))}

        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: C.textGhost, fontSize: 12, marginTop: 40 }}>
            特に連絡はありません
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg, position: 'sticky', bottom: 0 }}>
        {composing ? (
          <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 10, color: C.textDim }}>提示年俸</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={() => setOfferSalary(Math.max(SALARY_MIN, offerSalary - SALARY_STEP * 5))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>-5</button>
              <button onClick={() => setOfferSalary(Math.max(SALARY_MIN, offerSalary - SALARY_STEP))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>-1</button>
              <div style={{ flex: 1, textAlign: 'center', padding: '6px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>{fmt(offerSalary)}</span>
                <span style={{ fontSize: 9, color: C.textDim, marginLeft: 4 }}>万単位</span>
              </div>
              <button onClick={() => setOfferSalary(Math.min(SALARY_MAX, offerSalary + SALARY_STEP))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>+1</button>
              <button onClick={() => setOfferSalary(Math.min(SALARY_MAX, offerSalary + SALARY_STEP * 5))}
                style={{ padding: '5px 9px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface, color: C.textSub, fontSize: 11, cursor: 'pointer' }}>+5</button>
            </div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' as const }}>
              {[3000000, 5000000, 8000000, 12000000, 20000000, 30000000].map(v => (
                <button key={v} onClick={() => setOfferSalary(v)}
                  style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${offerSalary === v ? C.blue : C.border2}`, background: offerSalary === v ? alpha(C.blue, 0.15) : 'transparent', color: offerSalary === v ? C.blue : C.textDim, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>
                  {fmt(v)}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: C.textDim, flexShrink: 0 }}>年数</span>
              {[1, 2, 3, 4].map(y => (
                <button key={y} onClick={() => setOfferYears(y)}
                  style={{ flex: 1, padding: '5px', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: offerYears === y ? C.blue : C.surface, color: offerYears === y ? '#fff' : C.textDim, fontSize: 11, fontWeight: 800, fontFamily: 'inherit' }}>
                  {y}年
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              {CONTRACT_TYPE_OPTS.map(({ key, label, desc }) => {
                const sel = offerContractType === key
                return (
                  <button key={key} onClick={() => setOfferContractType(key)}
                    style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: 'none', cursor: 'pointer', backgroundColor: sel ? C.blue : C.surface, color: sel ? '#fff' : C.textDim, fontSize: 9, fontFamily: 'inherit' }}>
                    <div style={{ fontWeight: 800 }}>{label}</div>
                    <div style={{ opacity: 0.7 }}>{desc}</div>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {TEAM_ROLE_OPTS.map(({ key, label }) => {
                const sel = offerTeamRole === key
                return (
                  <button key={key} onClick={() => setOfferTeamRole(sel ? null : key)}
                    style={{ flex: 1, padding: '5px 2px', borderRadius: 6, border: sel ? 'none' : `1px solid ${C.border2}`, cursor: 'pointer', backgroundColor: sel ? C.gold : 'transparent', color: sel ? '#0A0912' : C.textDim, fontSize: 9, fontWeight: sel ? 900 : 500, fontFamily: 'inherit' }}>
                    {label}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleSubmitOffer}
                style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', backgroundColor: C.blue, color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                提示する
              </button>
              <button onClick={() => setComposing(false)}
                style={{ flex: 1, padding: '10px', borderRadius: 10, border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 12px 12px' }}>
            {replyButtons.map((btn, i) => (
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

// --- Player status helper ---

function getPlayerStatus(
  player: ReturnType<typeof useGameStore.getState>['players'][0],
  contractRequests: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['contractRequests']>,
  retirementRequests: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['retirementRequests']>,
  transferRequests: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['transferRequests']>,
  events: ReturnType<typeof useGameStore.getState>['currentSeason']['events'],
  months: number,
) {
  const hasRetirement = (retirementRequests ?? []).some(r => r.playerId === player.id)
  const hasTransfer = (transferRequests ?? []).some(r => r.playerId === player.id)
  const hasComplaint = (events ?? []).some(e =>
    e.playerId === player.id && !e.resolved && (COMPLAINT_EVENT_TYPES as readonly string[]).includes(e.type)
  )
  const activeReq = (contractRequests ?? []).find(r => r.playerId === player.id && r.status !== 'accepted' && r.status !== 'rejected')

  if (hasRetirement) return { label: '引退希望', color: C.textSub, priority: 0 }
  if (hasTransfer) return { label: '移籍希望', color: C.orange, priority: 1 }
  if (activeReq?.status === 'countered') return { label: '対応中', color: C.gold, priority: 2 }
  if (activeReq?.initiatedBy === 'gm' && activeReq.status === 'pending_gm') return { label: '対応中', color: C.gold, priority: 2 }
  if (months < 12 || activeReq?.status === 'pending_gm') return { label: '要対応', color: C.red, priority: 3 }
  if (hasComplaint) return { label: '不満あり', color: C.orange, priority: 4 }
  return null
}

// --- Main Page ---

export default function ChatPage() {
  const navigate = useNavigate()
  const { players, playerTeamId, currentSeason, generateContractRequests } = useGameStore()
  const [chatPlayerId, setChatPlayerId] = useState<string | null>(null)
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({})

  useEffect(() => { generateContractRequests() }, [])

  const totalRaces = currentSeason.races.length
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const contractRequests = currentSeason.contractRequests ?? []
  const retirementRequests = currentSeason.retirementRequests ?? []
  const transferRequests = currentSeason.transferRequests ?? []
  const events = currentSeason.events ?? []

  const myPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'active')

  const withStatus = myPlayers.map(p => {
    const months = contractMonths(p.contract.yearsLeft, raceIndex, totalRaces)
    const status = getPlayerStatus(p, contractRequests, retirementRequests, transferRequests, events, months)
    return { player: p, months, status }
  })

  const needsAction = withStatus.filter(x => x.status !== null).sort((a, b) => {
    const pa = a.status!.priority
    const pb = b.status!.priority
    return pa !== pb ? pa - pb : ovr(b.player) - ovr(a.player)
  })
  const others = withStatus.filter(x => x.status === null).sort((a, b) => ovr(b.player) - ovr(a.player))

  const chatPlayer = chatPlayerId ? myPlayers.find(p => p.id === chatPlayerId) ?? null : null

  if (chatPlayer) return (
    <ChatView
      player={chatPlayer}
      initialMessages={messageCache[chatPlayer.id]}
      onMessagesChange={msgs => setMessageCache(prev => ({ ...prev, [chatPlayer.id]: msgs }))}
      onClose={() => setChatPlayerId(null)}
    />
  )

  const renderCard = ({ player, months, status }: typeof withStatus[0]) => {
    const specCol = SPEC_COLOR[player.specialty]
    const playerOvr = ovr(player)
    const borderColor = status ? alpha(status.color, 0.4) : C.border
    const durationColor = months < 6 ? C.red : months < 12 ? C.orange : C.textSub

    return (
      <button
        key={player.id}
        onClick={() => setChatPlayerId(player.id)}
        style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${borderColor}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={44} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(specCol, 0.15), color: specCol, fontWeight: 700, flexShrink: 0 }}>
                {SPECIALTY_LABELS[player.specialty]}
              </span>
              {status && (
                <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(status.color, 0.18), border: `1px solid ${alpha(status.color, 0.4)}`, color: status.color, fontWeight: 800, flexShrink: 0 }}>
                  {status.label}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: durationColor }}>
                残{fmtDuration(months)}
              </span>
              <span style={{ fontSize: 11, color: C.textDim }}>{fmt(player.contract.annualSalary)}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(playerOvr), lineHeight: 1 }}>
              {playerOvr}
            </div>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.border2 }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </button>
    )
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 80, background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <BackButton onClick={() => navigate('/team')} />
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>チャット</div>
        </div>
        <div style={{ fontSize: 11, color: C.textDim }}>選手とのやりとり・契約交渉・不満対応</div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {needsAction.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.textSub, letterSpacing: '0.1em', marginBottom: 2, marginTop: 4 }}>
              対応が必要 · {needsAction.length}名
            </div>
            {needsAction.map(x => renderCard(x))}
          </>
        )}

        {others.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: '0.1em', marginBottom: 2, marginTop: needsAction.length > 0 ? 12 : 4 }}>
              その他の選手 · {others.length}名
            </div>
            {others.map(x => renderCard(x))}
          </>
        )}
      </div>
    </div>
  )
}
