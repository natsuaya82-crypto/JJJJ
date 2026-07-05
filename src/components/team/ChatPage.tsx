import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import PlayerFace from '../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, calcTransferValue } from '../../utils/playerUtils'
import { canSignContract, isSecondMember } from '../../data/rosterRules'
import { SPECIALTY_LABELS } from '../../types'
import type { TeamRole, GameEvent, AcquisitionOffer, Player, Team, IncomingOffer, IncomingLoanOffer } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import NumberDial from '../ui/NumberDial'
import { C, alpha } from '../../styles/tokens'

const CONTRACT_TYPE_OPTS = [
  { key: 'standard' as const, label: '本契約', desc: 'CAP全額' },
  { key: 'dual' as const, label: '2way契約', desc: 'CAP50%' },
  { key: 'development' as const, label: '育成契約', desc: 'CAP外' },
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

// 獲得オファー（FA・他チーム視察）のチャット初期メッセージ
function buildAcqMessages(player: Player, offer: AcquisitionOffer, teamName?: string): ChatMessage[] {
  const msgs: ChatMessage[] = []
  msgs.push({
    from: 'player',
    text: offer.source === 'fa'
      ? `（代理人）${player.name}への関心ありがとうございます。良い条件を提示いただければ前向きに検討します。`
      : `（代理人）${player.name}は現在${teamName ?? '他クラブ'}に在籍中ですが、話は伺います。条件次第です。`,
  })
  if (offer.offerSalary > 0 && offer.status === 'countered') {
    msgs.push({ from: 'gm', text: `年俸${fmt(offer.offerSalary)}、${offer.offerYears}年契約でいかがでしょうか。` })
    msgs.push({ from: 'player', text: `その条件では即断できません。年俸${fmt(offer.counterSalary ?? 0)}、${offer.counterYears}年であれば合意します。` })
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
    currentSeason, teams, players, playerTeamId,
    initiateContractRenewal, submitContractRenewalOffer,
    acceptContractCounter, reNegotiateContract,
    acceptRetirement, dismissRetirementRequest,
    dismissTransferRequest, allowPlayerTransfer,
    generateContractRequests,
    submitAcquisitionOffer, acceptAcquisitionCounter, reNegotiateAcquisition, abandonAcquisitionOffer,
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

  // 獲得オファー交渉（FA・他チーム視察）。存在すれば契約更新ではなく獲得交渉モードで進める。
  const acqOffers = currentSeason.acquisitionOffers ?? []
  const acqOffer =
    acqOffers.find(o => o.playerId === player.id && (o.status === 'pending' || o.status === 'countered')) ??
    acqOffers.filter(o => o.playerId === player.id).at(-1)
  const isAcq = !!acqOffer && (acqOffer.status === 'pending' || acqOffer.status === 'countered')

  const events = currentSeason.events ?? []
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    initialMessages ?? (isAcq
      ? buildAcqMessages(player, acqOffer!, teams.find(t => t.id === player.teamId)?.name)
      : buildMessages(player, contractReq, months, !!retirementReq, !!transferReq, transferReq?.reason, events))
  )

  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])
  const [composing, setComposing] = useState(false)
  const [composeMode, setComposeMode] = useState<'renewal' | 'acq'>('renewal')
  const [justAcquired, setJustAcquired] = useState(false)  // 獲得成立直後（契約更新フローへの誤遷移を防ぐ）
  const [offerSalary, setOfferSalary] = useState(SALARY_MIN)
  const [offerYears, setOfferYears] = useState(2)
  const [offerContractType, setOfferContractType] = useState<'standard' | 'development' | 'dual'>('standard')
  const [offerTeamRole, setOfferTeamRole] = useState<TeamRole | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [chatMessages])

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
    setComposeMode('renewal')
    setComposing(true)
  }

  const openComposeAcq = () => {
    const base = Math.round(faMarketSalary(player) / SALARY_STEP) * SALARY_STEP
    setOfferSalary(Math.max(SALARY_MIN, Math.min(SALARY_MAX, base)))
    setOfferYears(2)
    setOfferContractType(acqOffer?.offerContractType ?? 'standard')
    setOfferTeamRole(null)
    setComposeMode('acq')
    setComposing(true)
  }

  const handleSubmitAcqOffer = () => {
    if (!acqOffer) return
    // ロスター枠の事前チェック（契約形態ごとの空き）
    if (!canSignContract(players, playerTeamId, offerContractType)) {
      append({ from: 'gm', text: `（この契約形態の枠が上限です。放出するか契約形態を変えてください）` })
      return
    }
    append({ from: 'gm', text: `年俸${fmt(offerSalary)}、${offerYears}年契約でいかがでしょうか。` })
    submitAcquisitionOffer(acqOffer.id, offerSalary, offerYears, offerContractType, offerTeamRole ?? undefined)
    const updated = (useGameStore.getState().currentSeason.acquisitionOffers ?? []).find(o => o.id === acqOffer.id)
    if (updated?.status === 'accepted') {
      append({ from: 'player', text: 'ありがとうございます。その条件で加入します！よろしくお願いします。' })
      setJustAcquired(true)
    } else if (updated?.status === 'countered') {
      append({ from: 'player', text: `即断は難しいです。年俸${fmt(updated.counterSalary ?? 0)}、${updated.counterYears}年であれば合意します。` })
    } else if (updated?.status === 'rejected') {
      append({ from: 'player', text:
        updated.rejectReason === 'team_refused' ? '（代理人）クラブが主力の放出に応じません。金額の問題ではないようです。'
        : updated.rejectReason === 'demotion' ? '（代理人）2way契約・育成契約では本人が納得しません。本契約を用意できますか？'
        : '申し訳ありませんが、その条件では合意できません。' })
    }
    setComposing(false)
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
    // 獲得成立直後：契約更新フローに落ちないよう終了ボタンだけ出す
    if (justAcquired) return [
      { label: '閉じる', color: C.green, action: onClose },
    ]

    // 獲得オファー交渉モード
    if (isAcq && acqOffer) {
      if (acqOffer.status === 'countered') return [
        { label: `承諾する（${fmt(acqOffer.counterSalary ?? 0)}/${acqOffer.counterYears}年）`, color: C.green, action: () => {
          // 枠の事前チェック（承諾パスにも必要）
          if (!canSignContract(players, playerTeamId, acqOffer.offerContractType)) {
            append({ from: 'gm', text: `（この契約形態の枠が上限です。放出するか契約形態を変えてください）` })
            return
          }
          append(
            { from: 'gm', text: `了解しました。年俸${fmt(acqOffer.counterSalary ?? 0)}、${acqOffer.counterYears}年で合意します。` },
            { from: 'player', text: 'ありがとうございます。加入します。よろしくお願いします。' }
          )
          acceptAcquisitionCounter(acqOffer.id)
          setJustAcquired(true)
        }},
        ...(acqOffer.round < 3 ? [{ label: '再交渉する', color: C.gold, action: () => {
          append({ from: 'gm', text: '条件を再考させてください。' })
          reNegotiateAcquisition(acqOffer.id)
          openComposeAcq()
        }}] : []),
        { label: 'オファーを取り下げる', color: C.textSub, action: () => { abandonAcquisitionOffer(acqOffer.id); onClose() } },
      ]
      // pending
      return [
        { label: '契約条件を提示する', color: C.blue, action: openComposeAcq },
        { label: 'オファーを取り下げる', color: C.textSub, action: () => { abandonAcquisitionOffer(acqOffer.id); onClose() } },
      ]
    }

    // 獲得オファーが決裂した相手選手：契約更新フローに落とさず、終了ボタンだけ出す
    if (acqOffer && acqOffer.status === 'rejected' && player.teamId !== playerTeamId) {
      return [
        { label: '閉じる', color: C.textSub, action: onClose },
      ]
    }

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
        allowPlayerTransfer(player.id)
      }},
      { label: '残ってほしい', color: C.blue, action: () => {
        append(
          { from: 'gm', text: 'まだあなたの力が必要です。残ってください。' },
          { from: 'player', text: 'わかりました。もう少し様子を見てみます。' }
        )
        dismissTransferRequest(player.id)
      }},
    ]

    if (contractReq?.status === 'accepted') return []

    if (contractReq?.status === 'rejected') {
      // 最終拒否＝退団（移籍リスト入り）でFAへ。もう提示できない。まだ途中なら再交渉して再提示可。
      return player.transferListed ? [] : [
        { label: '条件を変えて提示する', color: C.blue, action: () => { reNegotiateContract(contractReq.id); openCompose() } },
      ]
    }

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
      { label: `要求を飲む（${fmt(contractReq.demandSalary)}/${contractReq.demandYears}年）`, color: C.green, action: () => {
        append(
          { from: 'gm', text: `了解です。年俸${fmt(contractReq.demandSalary)}、${contractReq.demandYears}年で承諾します。` },
          { from: 'player', text: 'ありがとうございます。よろしくお願いします。' }
        )
        submitContractRenewalOffer(contractReq.id, contractReq.demandSalary, contractReq.demandYears, contractReq.offerContractType ?? player.contract.contractType ?? 'standard', undefined)
      }},
      { label: 'カウンターオファーを出す', color: C.blue, action: openCompose },
      { label: '移籍を認める', color: C.orange, action: () => {
        append(
          { from: 'gm', text: '今回は契約更新を見送り、移籍を認めます。' },
          { from: 'player', text: 'わかりました。新しいクラブを探します。' }
        )
        allowPlayerTransfer(player.id)
      }},
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
            <div style={{ padding: '4px 0 8px' }}>
              <NumberDial value={offerSalary} onChange={v => setOfferSalary(Math.max(SALARY_MIN, Math.min(SALARY_MAX, v)))} min={SALARY_MIN} max={SALARY_MAX} accent={C.blue} />
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
                // 獲得時：契約形態ごとの空き（1軍契約18・2軍契約15・2way5・登録上限）が無ければ選べない
                const full = composeMode === 'acq' && !canSignContract(players, playerTeamId, key)
                return (
                  <button key={key} disabled={full} onClick={() => !full && setOfferContractType(key)}
                    style={{ flex: 1, padding: '5px 4px', borderRadius: 6, border: 'none', cursor: full ? 'not-allowed' : 'pointer', backgroundColor: sel && !full ? C.blue : C.surface, color: full ? C.textGhost : sel ? '#fff' : C.textDim, fontSize: 9, fontFamily: 'inherit', opacity: full ? 0.55 : 1 }}>
                    <div style={{ fontWeight: 800 }}>{label}</div>
                    <div style={{ opacity: 0.7 }}>{full ? '空きなし' : desc}</div>
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
              <button onClick={composeMode === 'acq' ? handleSubmitAcqOffer : handleSubmitOffer}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px 16px' }}>
            {replyButtons.map((btn, i) => (
              <button key={i} onClick={btn.action}
                style={{ width: '100%', padding: '15px 14px', borderRadius: 12, border: `1.5px solid ${alpha(btn.color, 0.5)}`, backgroundColor: alpha(btn.color, 0.1), color: btn.color, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4 }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- 他チーム（1軍/2軍を表示し、選手を選ぶと契約オファー＝交渉を開始） ---

function TradeChatView({ team, onClose, initialMode, initialGetId }: { team: Team; onClose: () => void; initialMode?: 'fee' | 'trade'; initialGetId?: string }) {
  const navigate = useNavigate()
  const { players, teams, playerTeamId, currentSeason, submitTransferBid, proposeTrade, acceptTradeCounter, dismissTradeNegotiation } = useGameStore()
  const mainP = players.filter(p => p.teamId === team.id && p.rosterTier === 'main' && p.status !== 'retired').sort((a, b) => ovr(b) - ovr(a))
  const secondP = players.filter(p => p.teamId === team.id && isSecondMember(p) && p.status !== 'retired').sort((a, b) => ovr(b) - ovr(a))
  const bids = currentSeason.transferBids ?? []
  const bidOf = (pid: string) => bids.find(b => b.playerId === pid && ['pending', 'fee_accepted', 'countered', 'player_neg'].includes(b.status))

  const [selId, setSelId] = useState<string | null>(null)
  const [fee, setFee] = useState(0)
  const sel = selId ? players.find(p => p.id === selId) : null

  const [mode, setMode] = useState<'fee' | 'trade'>(initialMode ?? 'fee')
  const [give, setGive] = useState<Set<string>>(new Set())
  const [getP, setGetP] = useState<Set<string>>(() => new Set(initialGetId ? [initialGetId] : []))
  const [givePk, setGivePk] = useState<Set<string>>(new Set())
  const [getPk, setGetPk] = useState<Set<string>>(new Set())
  const neg = (currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === team.id)
  const myTeam = teams.find(t => t.id === playerTeamId)
  const myPlayersT = players.filter(p => p.teamId === playerTeamId && p.status === 'active' && !p.loan).sort((a, b) => ovr(b) - ovr(a))
  const pickKey = (pk: { year: number; round: number; pickNumber: number }) => `${pk.year}-R${pk.round}-${pk.pickNumber}`
  const pickLabel = (k: string) => { const [y, r] = k.split('-'); return `${y} ${r.replace('R', '第')}巡` }
  const toggle = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setFn(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const submitTrade = () => {
    proposeTrade(team.id, [...give], [...givePk], [...getP], [...getPk])
  }

  const openFee = (p: Player) => {
    setSelId(p.id)
    setFee(Math.max(1_000_000, Math.round(calcTransferValue(p) / 1_000_000) * 1_000_000))
  }
  const submit = () => { if (sel) { submitTransferBid(sel.id, fee); setSelId(null) } }

  // 移籍金オファー画面
  if (sel) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
          <BackButton onClick={() => setSelId(null)} />
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{team.name} へ移籍金オファー</div>
        </div>
        <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PlayerFace playerId={sel.id} nationality={sel.nationality} size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{sel.name}</div>
              <div style={{ fontSize: 10, color: C.textDim }}>市場価値 {fmt(calcTransferValue(sel))} · 残{sel.contract.yearsLeft}年</div>
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(ovr(sel)) }}>{ovr(sel)}</div>
          </div>
          <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>
            まず相手クラブに移籍金を提示して<b>チーム間の合意</b>を得ます。合意（費用合意）後に、選手本人と年俸・役割・契約形態・契約年数を交渉します。主力はクラブが手放しません。
          </div>
          {(() => {
            const lst = (currentSeason.transferListings ?? []).find(l => l.playerId === sel.id)
            if (!lst) return null
            return (
              <div style={{ fontSize: 10, color: C.orange, fontWeight: 700 }}>
                この選手は移籍市場に出品中{lst.competingTeams.length > 0 ? ` — 他に${lst.competingTeams.length}クラブが関心（競合入札）` : ''}
              </div>
            )
          })()}
          <div style={{ fontSize: 10, color: C.textDim }}>提示移籍金</div>
          <div style={{ padding: '2px 0 6px' }}>
            <NumberDial value={fee} onChange={v => setFee(Math.max(1_000_000, v))} min={1_000_000} accent={C.orange} />
          </div>
          <button onClick={submit} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.orange, color: '#1a0d00', fontSize: 15, fontWeight: 900, cursor: 'pointer', fontFamily: SAIRA }}>
            移籍金をオファー（チームに打診）
          </button>
        </div>
      </div>
    )
  }

  const renderRow = (p: Player) => {
    const b = bidOf(p.id)
    const feeAccepted = b?.status === 'fee_accepted'
    return (
      <OppRow key={p.id} player={p} bidLabel={b ? (feeAccepted ? '費用合意→契約交渉へ' : b.status === 'countered' ? '相手が対抗提示' : '打診中') : null}
        bidColor={feeAccepted ? C.green : b ? C.gold : C.textDim}
        onClick={() => {
          if (feeAccepted && b) { navigate(`/transfer/negotiate/transfer/${b.id}`); return }  // チーム合意済み→選手と契約交渉
          if (b) { navigate('/transfer/offers'); return }  // 打診中/対抗提示→オファー一覧で確認
          openFee(p)  // まだ→移籍金オファー
        }} />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 40 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={onClose} />
        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{team.name}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>まず移籍金でチーム合意 → その後に選手と契約交渉</div>
        </div>
      </div>

      {/* モード切替：移籍金で獲得 / トレード提案 */}
      <div style={{ padding: '10px 12px 6px', display: 'flex', gap: 8 }}>
        {([['fee', '移籍金で獲得'], ['trade', 'トレード提案']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setMode(k)} style={{
            flex: 1, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
            background: mode === k ? alpha(C.gold, 0.15) : C.surface2, border: `1.5px solid ${mode === k ? C.gold : C.border2}`, color: mode === k ? C.gold : C.textDim,
          }}>{label}</button>
        ))}
      </div>

      {mode === 'fee' && (
        <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.gold, marginBottom: 6 }}>1軍 · {mainP.length}名</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{mainP.map(renderRow)}</div>
          </div>
          {secondP.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, marginBottom: 6 }}>2軍（リザーブ） · {secondP.length}名</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{secondP.map(renderRow)}</div>
            </div>
          )}
        </div>
      )}

      {mode === 'trade' && (
        <div style={{ padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 相手の応答 */}
          {neg && (
            <div style={{ borderRadius: 12, padding: '10px 12px', background: alpha(neg.status === 'rejected' ? C.red : C.gold, 0.1), border: `1.5px solid ${alpha(neg.status === 'rejected' ? C.red : C.gold, 0.5)}` }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{neg.message}</div>
              {neg.status === 'countered' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { if (acceptTradeCounter(neg.id)) { setGive(new Set()); setGetP(new Set()); setGivePk(new Set()); setGetPk(new Set()) } }} style={{ flex: 1, padding: 10, borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SAIRA }}>条件を飲んで成立</button>
                  <button onClick={() => dismissTradeNegotiation(neg.id)} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>決裂</button>
                </div>
              )}
              {neg.status === 'rejected' && (
                <button onClick={() => dismissTradeNegotiation(neg.id)} style={{ marginTop: 8, padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>閉じる（組み替えて再提示可）</button>
              )}
              <div style={{ fontSize: 9, color: C.textGhost, marginTop: 6, fontFamily: SAIRA }}>交渉 {neg.round}/3 回目</div>
            </div>
          )}

          {/* もらう */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 6 }}>もらう（{team.shortName}から）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...mainP, ...secondP].map(p => <TradeSelRow key={p.id} player={p} selected={getP.has(p.id)} color={C.green} onToggle={() => toggle(setGetP, p.id)} />)}
            </div>
            {(team.draftPicks ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {(team.draftPicks ?? []).map(pk => { const k = pickKey(pk); return <PickChip key={k} label={pickLabel(k)} selected={getPk.has(k)} color={C.green} onToggle={() => toggle(setGetPk, k)} /> })}
              </div>
            )}
          </div>

          {/* 出す */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 6 }}>出す（自チーム）</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {myPlayersT.map(p => <TradeSelRow key={p.id} player={p} selected={give.has(p.id)} color={C.red} onToggle={() => toggle(setGive, p.id)} />)}
            </div>
            {(myTeam?.draftPicks ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {(myTeam?.draftPicks ?? []).map(pk => { const k = pickKey(pk); return <PickChip key={k} label={pickLabel(k)} selected={givePk.has(k)} color={C.red} onToggle={() => toggle(setGivePk, k)} /> })}
              </div>
            )}
          </div>

          <button onClick={submitTrade} disabled={getP.size + getPk.size === 0}
            style={{ padding: 14, borderRadius: 12, border: 'none', cursor: getP.size + getPk.size === 0 ? 'not-allowed' : 'pointer', opacity: getP.size + getPk.size === 0 ? 0.4 : 1, background: C.gold, color: '#1a0d00', fontSize: 15, fontWeight: 900, fontFamily: SAIRA }}>
            トレードを提案する
          </button>
        </div>
      )}
    </div>
  )
}

function TradeSelRow({ player, selected, color, onToggle }: { player: Player; selected: boolean; color: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%', background: selected ? alpha(color, 0.14) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${selected ? color : C.border}`, fontFamily: 'inherit' }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `2px solid ${selected ? color : C.border2}`, background: selected ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#111', fontSize: 11, fontWeight: 900 }}>{selected ? '✓' : ''}</div>
      <div style={{ flexShrink: 0, borderRadius: 7, overflow: 'hidden' }}><PlayerFace playerId={player.id} nationality={player.nationality} size={32} /></div>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{player.name}</div>
      <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</span>
    </button>
  )
}

function PickChip({ label, selected, color, onToggle }: { label: string; selected: boolean; color: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: SAIRA, fontSize: 11, fontWeight: 800, background: selected ? alpha(color, 0.18) : C.surface2, border: `1.5px solid ${selected ? color : C.border2}`, color: selected ? color : C.textDim }}>
      {label}指名権
    </button>
  )
}

function OppRow({ player, onClick, bidLabel, bidColor }: { player: Player; onClick: () => void; bidLabel?: string | null; bidColor?: string }) {
  const specCol = SPEC_COLOR[player.specialty]
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%',
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${bidLabel ? alpha(bidColor ?? C.gold, 0.4) : C.border}`, fontFamily: 'inherit',
    }}>
      <div style={{ flexShrink: 0, borderRadius: 7, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}>
        <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: alpha(specCol, 0.15), color: specCol, fontWeight: 700, flexShrink: 0 }}>{SPECIALTY_LABELS[player.specialty]}</span>
          {bidLabel && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: alpha(bidColor ?? C.gold, 0.18), color: bidColor ?? C.gold, fontWeight: 800, flexShrink: 0 }}>{bidLabel}</span>}
        </div>
        <div style={{ fontSize: 9, color: C.textDim }}>{player.age}歳 · {fmt(player.contract.annualSalary)} · 残{player.contract.yearsLeft}年</div>
      </div>
      <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)), flexShrink: 0 }}>{ovr(player)}</div>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: C.border2, flexShrink: 0 }}>
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
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
  if (player.transferListed) return { label: '退団へ', color: C.orange, priority: 1 }
  if (hasTransfer) return { label: '移籍希望', color: C.orange, priority: 1 }
  if (activeReq?.status === 'countered') return { label: '対応中', color: C.gold, priority: 2 }
  if (activeReq?.initiatedBy === 'gm' && activeReq.status === 'pending_gm') return { label: '対応中', color: C.gold, priority: 2 }
  if (months < 12 || activeReq?.status === 'pending_gm') return { label: '要対応', color: C.red, priority: 3 }
  if (hasComplaint) return { label: '不満あり', color: C.orange, priority: 4 }
  return null
}

// 相手から来た移籍オファーのカード（承諾／カウンター＝ダイアル／拒否）
function IncomingTransferCard({ offer, player, teamName, onAccept, onCounter, onDecline }: {
  offer: IncomingOffer; player: Player; teamName: string
  onAccept: () => void; onCounter: (price: number) => void; onDecline: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'counter'>('idle')
  const [fee, setFee] = useState(Math.round(offer.offeredPrice * 1.2 / 1_000_000) * 1_000_000)
  const specCol = SPEC_COLOR[player.specialty]
  return (
    <div style={{ borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(C.gold, 0.4)}`, padding: '10px 12px', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.4)}` }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{player.name}</span>
            {offer.fromForeign && <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: alpha(C.blue, 0.18), color: C.blue }}>海外</span>}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{teamName}が移籍金 <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmt(offer.offeredPrice)}</span> で獲得を打診</div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</span>
      </div>
      {mode === 'counter' ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ padding: '4px 0 8px' }}><NumberDial value={fee} onChange={v => setFee(Math.max(1_000_000, v))} min={1_000_000} accent={C.gold} /></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onCounter(fee)} style={btnStyle(C.gold, true)}>この金額で提示</button>
            <button onClick={() => setMode('idle')} style={btnStyle(C.textDim, false)}>戻る</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button onClick={onAccept} style={btnStyle(C.green, true)}>承諾（放出）</button>
          <button onClick={() => setMode('counter')} style={btnStyle(C.gold, false)}>カウンター</button>
          <button onClick={onDecline} style={btnStyle(C.red, false)}>拒否</button>
        </div>
      )}
    </div>
  )
}

// 相手から来たレンタル打診のカード（貸す／借りる・断る）
function IncomingLoanCard({ offer, player, teamName, slotsFull, onAccept, onDecline }: {
  offer: IncomingLoanOffer; player: Player; teamName: string; slotsFull: boolean
  onAccept: () => void; onDecline: () => void
}) {
  const specCol = SPEC_COLOR[player.specialty]
  const isLendOut = offer.direction === 'lend_out'
  const disabled = !isLendOut && slotsFull
  return (
    <div style={{ borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(C.blue, 0.4)}`, padding: '10px 12px', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.4)}` }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{player.name}</span>
            <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: alpha(C.blue, 0.18), color: C.blue }}>レンタル</span>
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            {isLendOut ? `${teamName}が${player.name}を${offer.years}年レンタルで借りたいと打診` : `${teamName}が${player.name}を${offer.years}年レンタルで貸したいと打診`}
          </div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button onClick={() => { if (!disabled) onAccept() }} disabled={disabled} style={{ ...btnStyle(C.blue, true), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}>
          {isLendOut ? '貸す' : disabled ? 'レンタル枠が満杯' : '借りる'}
        </button>
        <button onClick={onDecline} style={btnStyle(C.textDim, false)}>断る</button>
      </div>
    </div>
  )
}

function btnStyle(color: string, filled: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '9px 6px', borderRadius: 9, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer',
    background: filled ? alpha(color, 0.18) : 'transparent',
    border: `1.5px solid ${alpha(color, filled ? 0.6 : 0.4)}`, color,
  }
}

// --- Main Page ---

export default function ChatPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { players, playerTeamId, currentSeason, teams, foreignLeagues, generateContractRequests,
    acceptIncomingOffer, declineIncomingOffer, counterIncomingOffer, acceptIncomingLoanOffer, declineIncomingLoanOffer } = useGameStore()
  // 通知などから ?player=<id> で来た場合は直接その選手のチャットを開く
  const [chatPlayerId, setChatPlayerId] = useState<string | null>(() => searchParams.get('player'))
  const [tradeTeamId, setTradeTeamId] = useState<string | null>(() => searchParams.get('trade'))
  const wantParam = searchParams.get('want')  // トレード提案で「もらう」に初期選択する選手
  const [messageCache, setMessageCache] = useState<Record<string, ChatMessage[]>>({})
  const [activeTab, setActiveTab] = useState<'own' | 'transfer'>(searchParams.get('trade') ? 'transfer' : 'own')

  useEffect(() => { generateContractRequests() }, [])

  // 既にチャットを開いた状態で ?player / ?trade 付きで来た場合も反応させる
  useEffect(() => {
    const pl = searchParams.get('player')
    const tr = searchParams.get('trade')
    if (pl) { setChatPlayerId(pl); setTradeTeamId(null) }
    else if (tr) { setTradeTeamId(tr); setChatPlayerId(null); setActiveTab('transfer') }
  }, [searchParams])

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

  // 獲得交渉中の選手（FA・他チーム視察）
  const activeAcqOffers = (currentSeason.acquisitionOffers ?? []).filter(o => o.status === 'pending' || o.status === 'countered')
  const acqPlayers = activeAcqOffers
    .map(o => ({ player: players.find(p => p.id === o.playerId), offer: o }))
    .filter((x): x is { player: Player; offer: AcquisitionOffer } => !!x.player)

  // 獲得オファーがある選手は status に関わらず開けるようにする（提示後に rejected/accepted になっても
  // チャットが閉じず、相手の返事＝拒否/カウンター/合意を確認できるようにする）。
  const offerPlayerIds = new Set((currentSeason.acquisitionOffers ?? []).map(o => o.playerId))
  const offerPlayers = players.filter(p => offerPlayerIds.has(p.id) && !myPlayers.some(m => m.id === p.id))
  const openablePlayers = [...myPlayers, ...offerPlayers]
  const chatPlayer = chatPlayerId ? openablePlayers.find(p => p.id === chatPlayerId) ?? null : null

  // 他チーム（トレード交渉の相手）
  const opponentTeams = teams.filter(t => t.id !== playerTeamId)
  const tradeTeam = tradeTeamId ? opponentTeams.find(t => t.id === tradeTeamId) ?? null : null

  // 相手から来たオファー（移籍・レンタル）＝チャットで対応
  const foreignClubMap = new Map((foreignLeagues ?? []).flatMap(l => l.clubs).map(c => [c.id, c.shortName]))
  const teamName = (id: string) => teams.find(t => t.id === id)?.shortName ?? foreignClubMap.get(id) ?? '他クラブ'
  const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o => players.some(p => p.id === o.playerId && p.teamId === playerTeamId))
  const incomingLoanOffers = currentSeason.incomingLoanOffers ?? []
  const inboundCount = incomingOffers.length + incomingLoanOffers.length
  const loanSlotsUsed = players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length

  if (tradeTeam) return (
    <TradeChatView team={tradeTeam} onClose={() => setTradeTeamId(null)}
      initialMode={wantParam ? 'trade' : undefined} initialGetId={wantParam ?? undefined} />
  )

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

  const renderAcqCard = ({ player, offer }: { player: Player; offer: AcquisitionOffer }) => {
    const specCol = SPEC_COLOR[player.specialty]
    const playerOvr = ovr(player)
    const statusLabel = offer.status === 'countered' ? '回答あり' : '交渉中'
    const statusCol = offer.status === 'countered' ? C.gold : C.blue
    const sourceLabel = offer.source === 'fa' ? 'FA' : '引き抜き'
    return (
      <button
        key={player.id}
        onClick={() => setChatPlayerId(player.id)}
        style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(statusCol, 0.4)}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}>
            <PlayerFace playerId={player.id} nationality={player.nationality} size={44} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
              <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(C.orange, 0.15), color: C.orange, fontWeight: 700, flexShrink: 0 }}>{sourceLabel}</span>
              <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(statusCol, 0.18), border: `1px solid ${alpha(statusCol, 0.4)}`, color: statusCol, fontWeight: 800, flexShrink: 0 }}>{statusLabel}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {(() => {
                const curTeam = teams.find(t => t.id === player.teamId)
                return curTeam ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <TeamLogoSVG primary={curTeam.colors.primary} secondary={curTeam.colors.secondary} shortName={curTeam.shortName} teamId={curTeam.id} size={14} />
                    <span style={{ fontSize: 10, color: C.textSub, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curTeam.shortName}</span>
                  </span>
                ) : <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>FA</span>
              })()}
              <span style={{ fontSize: 11, color: C.textDim }}>
                {offer.source === 'fa' ? `市場年俸 ${fmt(faMarketSalary(player))}` : `市場価値 ${fmt(calcTransferValue(player))}`}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(playerOvr), lineHeight: 1 }}>{playerOvr}</div>
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
          <BackButton />
          <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>チャット</div>
        </div>
        <div style={{ fontSize: 11, color: C.textDim }}>契約更新・獲得交渉・相手からのオファー・トレードをここで対応</div>
      </div>

      {/* タブ切り替え：自チーム ⇄ 移籍・獲得 */}
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 8 }}>
        {([['own', '自チーム'], ['transfer', '移籍・獲得']] as const).map(([key, label]) => {
          const active = activeTab === key
          const badge = key === 'transfer' ? acqPlayers.length + inboundCount : 0
          return (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{
                flex: 1, padding: '9px 4px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 800,
                background: active ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : 'transparent',
                border: `1.5px solid ${active ? C.gold : C.border2}`,
                color: active ? C.gold : C.textDim,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
              {label}
              {badge > 0 && <span style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 900, padding: '1px 6px', borderRadius: 8, background: C.orange, color: '#111' }}>{badge}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {activeTab === 'own' && needsAction.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.textSub, letterSpacing: '0.1em', marginBottom: 2, marginTop: 4 }}>
              対応が必要 · {needsAction.length}名
            </div>
            {needsAction.map(x => renderCard(x))}
          </>
        )}

        {activeTab === 'own' && others.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.textDim, letterSpacing: '0.1em', marginBottom: 2, marginTop: needsAction.length > 0 ? 12 : 4 }}>
              その他の選手 · {others.length}名
            </div>
            {others.map(x => renderCard(x))}
          </>
        )}

        {activeTab === 'own' && needsAction.length === 0 && others.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA, fontSize: 12 }}>選手がいません</div>
        )}

        {activeTab === 'transfer' && inboundCount > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: '0.1em', marginBottom: 2, marginTop: 4 }}>
              相手から来たオファー · {inboundCount}件
            </div>
            {incomingOffers.map(o => {
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              return <IncomingTransferCard key={o.id} offer={o} player={p} teamName={teamName(o.fromTeamId)}
                onAccept={() => acceptIncomingOffer(o.id)} onCounter={(price) => counterIncomingOffer(o.id, price)} onDecline={() => declineIncomingOffer(o.id)} />
            })}
            {incomingLoanOffers.map(o => {
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              return <IncomingLoanCard key={o.id} offer={o} player={p} teamName={teamName(o.fromTeamId)} slotsFull={loanSlotsUsed >= 3}
                onAccept={() => acceptIncomingLoanOffer(o.id)} onDecline={() => declineIncomingLoanOffer(o.id)} />
            })}
          </>
        )}

        {activeTab === 'transfer' && acqPlayers.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: '0.1em', marginBottom: 2, marginTop: inboundCount > 0 ? 12 : 4 }}>
              獲得交渉 · {acqPlayers.length}名
            </div>
            {acqPlayers.map(x => renderAcqCard(x))}
          </>
        )}

        {activeTab === 'transfer' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.textSub, letterSpacing: '0.1em', marginBottom: 4, marginTop: (acqPlayers.length > 0 || inboundCount > 0) ? 14 : 4 }}>
              他チームと交渉（移籍金・トレード）
            </div>
            {opponentTeams.map(t => {
              const hasNeg = (currentSeason.tradeNegotiations ?? []).some(n => n.targetTeamId === t.id)
              return (
                <button key={t.id} onClick={() => setTradeTeamId(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, cursor: 'pointer', width: '100%', marginBottom: 4,
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${hasNeg ? alpha(C.gold, 0.5) : C.border2}`, fontFamily: 'inherit',
                }}>
                  <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={30} />
                  <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 700, color: C.text }}>{t.name}</span>
                  {hasNeg && <span style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 8, background: C.gold, color: '#111' }}>交渉中</span>}
                  <span style={{ color: C.textGhost }}>›</span>
                </button>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
