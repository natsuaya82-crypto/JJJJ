import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, calcTransferValue, seasonAppearances, playerConsentToMove, freeContactConsent } from '../../utils/playerUtils'
// トレードの釣り合いの判断はストアと同じ1箇所（utils/tradeValue.ts）を通す
import { tradeValues, keyFactor, tradeBalance, TRADE_MIN_RATIO, TRADE_OK_RATIO, TRADE_HARD_NO_RATIO } from '../../utils/tradeValue'
import { canSignPlayer, ROSTER_MAX } from '../../data/rosterRules'
import { useOfferResults } from '../transfer/useOfferResults'
import { OfferResultList } from '../transfer/OfferResultList'
import { canBePoached, canTradeAway } from '../../utils/transferEligibility'
import { mergeChatMessages } from '../../utils/chatLog'
import { settledPath } from '../../utils/talkSync'
import { contractTalkCtx, contractMonthsLeft, liveContractOf, hasContractTalk, canReNegotiate, canOfferRenewal, needsRenewalAttention } from '../../utils/contractTalk'
import type { ContractTalkCtx } from '../../utils/contractTalk'
import { SPECIALTY_LABELS } from '../../types'
import type { TeamRole, AcquisitionOffer, Player, Team, IncomingOffer, IncomingLoanOffer, TransferBid, ChatMessage } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import NumberDial from '../ui/NumberDial'
import { pickKeyValue } from '../../data/economy'
import { C, alpha } from '../../styles/tokens'
import { rankedStandings } from '../../utils/league'
import { tierOf, tierOfPlayerClub } from '../../utils/clubTier'
import { fmtYen } from '../../utils/money'

const TEAM_ROLE_OPTS: { key: TeamRole; label: string }[] = [
  { key: 'ace', label: 'エース' },
  { key: 'key_player', label: '主力' },
  { key: 'sub_ace', label: 'サブエース' },
  { key: 'rotation', label: 'ローテ' },
  { key: 'development', label: '育成' },
]

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SALARY_STEP = 1000000
const SALARY_MIN = 3000000
const SALARY_MAX = 80000000

function fmtDuration(months: number): string {
  if (months <= 0) return '期限切れ'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m}ヶ月`
  if (m === 0) return `${y}年`
  return `${y}年${m}ヶ月`
}

// 選手のチャット雑談イベント（疲労・士気・出場機会など）は廃止済み。
// 判定が「常に対象なし」の空リストのまま各所に分岐だけ残っていたので、分岐ごと消した

// 海外挑戦の直訴メッセージ（夢の行き先はタイプで変わる）
const OVERSEAS_DREAM: Record<string, string> = {
  africa: 'ケニアやエチオピアの高地で、世界のトップと毎日走ってみたいんです。',
  europe: 'ヨーロッパのトラックで、自分のスピードがどこまで通用するか試したいんです。',
  america: '北米の大きな舞台で走ってみたいんです。',
}
const OVERSEAS_LABEL: Record<string, string> = { africa: 'アフリカ', europe: 'ヨーロッパ', america: '北米' }

function buildMessages(
  player: ReturnType<typeof useGameStore.getState>['players'][0],
  contractReq: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['contractRequests']>[0] | undefined,
  months: number,
  hasRetirement: boolean,
  hasTransfer: boolean,
  transferReason?: string,
  overseasRegion?: string,
): ChatMessage[] {
  const msgs: ChatMessage[] = []

  // 進路が決まった選手（引退を承認した・海外挑戦を承認した）は、ここで会話を閉じる。
  // 判定は talkSync の settledPath 1本。ここは分岐の書き足しになっていて海外挑戦のぶんしか無く、
  // **引退を承認した選手は次に開くと来季契約の話に戻っていた**（そこから移籍にも進めた）
  const settled = settledPath(player)
  if (settled === 'retiring') {
    msgs.push({ from: 'player', kind: 'retire_ok', text: `今季限りで引退します。最後のシーズン、悔いの残らないように走り切ります。` })
    return msgs
  }
  if (settled === 'overseas') {
    msgs.push({ from: 'player', kind: 'overseas_ok', text: `海外挑戦を認めていただき、ありがとうございます。${OVERSEAS_LABEL[player.overseasListed ?? ''] ?? '海外'}のクラブからの話を待ちます。` })
    return msgs
  }

  if (hasRetirement) {
    msgs.push({ from: 'player', kind: 'retire', text: `${player.age}歳になりました。正直、そろそろ引退を考えています。監督はどうお思いですか？` })
    return msgs
  }

  if (overseasRegion) {
    msgs.push({ from: 'player', kind: 'overseas_wish', text: `監督、真剣な話があります。${OVERSEAS_DREAM[overseasRegion] ?? '海外で走ってみたいんです。'}海外挑戦を認めてもらえませんか？` })
    return msgs
  }

  if (hasTransfer) {
    const reason = transferReason === 'playing_time'
      ? '最近、出場機会が思ったより少なくて...'
      : 'チームの成績のことを考えると、'
    msgs.push({ from: 'player', kind: 'transfer_wish', text: `${reason}他のクラブへの移籍を考えています。` })
    return msgs
  }

  if (!contractReq) {
    if (months < 12) {
      // 満了済み（yearsLeft=0）だと months が負になる。「残り-1ヶ月」と出るバグの修正
      // 残り月数はレースごとに変わる。kind を付けて「同じ催促」として扱い、増やさず書き換える
      msgs.push({ from: 'player', kind: 'contract_remind', text: months <= 0
        ? `契約が切れたままになっています。今後どうなるのか気になっています。`
        : `来シーズンの契約についてなのですが、まだ何も連絡がなくて。残り${months}ヶ月が気になっています。` })
    }
    return msgs
  }

  if (contractReq.initiatedBy === 'player' && contractReq.status === 'pending_gm') {
    msgs.push({ from: 'player', kind: 'contract_demand', text: `来シーズンの契約についてお話があります。年俸${fmtYen(contractReq.demandSalary)}、${contractReq.demandYears}年契約での更新を希望します。いかがでしょうか？` })
    return msgs
  }

  if (contractReq.initiatedBy === 'gm') {
    msgs.push({ from: 'gm', kind: 'contract_gm_open', text: `来シーズンの契約について話し合いたい。` })
    if (contractReq.status === 'pending_gm') {
      msgs.push({ from: 'player', kind: 'contract_ask_terms', text: `わかりました。どのような条件をお考えですか？` })
      return msgs
    }
  }

  if (contractReq.offerSalary > 0) {
    msgs.push({ from: 'gm', kind: 'contract_offer', text: `年俸${fmtYen(contractReq.offerSalary)}、${contractReq.offerYears}年契約でいかがでしょうか。` })
  }

  if (contractReq.status === 'accepted') {
    msgs.push({ from: 'player', kind: 'contract_accept', text: `ありがとうございます。その条件で合意します。よろしくお願いします。` })
    return msgs
  }

  if (contractReq.status === 'countered') {
    msgs.push({ from: 'player', kind: 'contract_counter', text: `考えましたが、年俸${fmtYen(contractReq.counterSalary ?? 0)}、${contractReq.counterYears}年であれば合意できます。これ以上は難しいです。` })
    return msgs
  }

  if (contractReq.status === 'rejected') {
    msgs.push({ from: 'player', kind: 'contract_reject', text: `申し訳ありませんが、その条件では受け入れられません。` })
    return msgs
  }

  return msgs
}

// 獲得オファー（FA・他チーム選手）のチャット初期メッセージ
function buildAcqMessages(player: Player, offer: AcquisitionOffer, teamName?: string): ChatMessage[] {
  const msgs: ChatMessage[] = []
  msgs.push({
    from: 'player',
    text: offer.source === 'fa'
      ? `（代理人）${player.name}への関心ありがとうございます。良い条件を提示いただければ前向きに検討します。`
      : `（代理人）${player.name}は現在${teamName ?? '他クラブ'}に在籍中ですが、話は伺います。条件次第です。`,
  })
  if (offer.offerSalary > 0 && offer.status === 'countered') {
    msgs.push({ from: 'gm', text: `年俸${fmtYen(offer.offerSalary)}、${offer.offerYears}年契約でいかがでしょうか。` })
    msgs.push({ from: 'player', text: `その条件では即断できません。年俸${fmtYen(offer.counterSalary ?? 0)}、${offer.counterYears}年であれば合意します。` })
  }
  return msgs
}

// 移籍金合意後の契約交渉（他チームとの移籍金合意が済んだ選手）
function buildTransferMessages(player: Player, bid: TransferBid, fromTeamName?: string): ChatMessage[] {
  return [{
    from: 'player',
    text: `（代理人）移籍金${fmtYen(bid.offeredFee)}で${fromTeamName ?? '所属クラブ'}との合意が取れました。あとは${player.name}本人との契約条件次第です。ご提示ください。`,
  }]
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
  const clubIndex = useClubIndex()
  const {
    currentSeason, teams, players, playerTeamId,
    initiateContractRenewal, submitContractRenewalOffer,
    acceptContractCounter, reNegotiateContract,
    acceptRetirement, dismissRetirementRequest,
    dismissTransferRequest, allowPlayerTransfer,
    approveOverseasChallenge, denyOverseasChallenge,
    generateContractRequests, refuseFreeContactRetention,
    submitAcquisitionOffer, acceptAcquisitionCounter, reNegotiateAcquisition, abandonAcquisitionOffer,
    openPlayerSheet, finalizeTransfer, rejectTransferBid,
  } = useGameStore()
  const longPress = usePlayerLongPress()
  void openPlayerSheet

  const totalRaces = currentSeason.races.length
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const contractRequests = currentSeason.contractRequests ?? []
  // フリー移籍で他クラブと接触中か（勧誘クラブ名）。接触中は契約更新の用件（要求・催促）をこの会話に出さず、
  // 「誘いを受けている」文脈に一本化する。引き留めは「契約条件を提示する」から（成立すれば接触打ち切り＝残留）
  const freeContactOffer = (currentSeason.incomingOffers ?? []).find(o => o.playerId === player.id && o.offeredPrice === 0) ?? null
  const freeContactClub = freeContactOffer ? (clubIndex.byId(freeContactOffer.fromTeamId)?.shortName ?? '他クラブ') : null
  // 契約更新の札の取り出しは utils/contractTalk.ts の判定だけを使う。
  //   contractReq     … 画面に出す札。進行中があればそれ、無ければ最後の決着（合意・拒否）を履歴として出す
  //   lastContractReq … 決着済みを見たいときだけ使う
  // 期限切れの札は消える（runRace）ようになったので、rejected は「本当に提示して断られた」だけになった。
  // 以前はここが status を見ていなかったので、一度も提示していない選手のチャットに
  // 「申し訳ありませんが、その条件では受け入れられません」だけが出ていた（提示額0円の自動拒否の札）。
  // フリー接触中でも札を隠さない。隠していたせいで「引き留めの条件を提示する」を押しても
  // GMの提示に対する本人の返事が一切出てこず、押し損になっていた
  const talkCtx = contractTalkCtx(currentSeason, playerTeamId)
  const lastContractReq = contractRequests.filter(r => r.playerId === player.id).at(-1)
  const contractReq = liveContractOf(contractRequests, player.id) ?? lastContractReq
  const retirementReq = (currentSeason.retirementRequests ?? []).find(r => r.playerId === player.id)
  const transferReq = (currentSeason.transferRequests ?? []).find(r => r.playerId === player.id)
  const overseasReq = (currentSeason.overseasRequests ?? []).find(r => r.playerId === player.id)
  const months = contractMonthsLeft(player.contract.yearsLeft, raceIndex, totalRaces)
  // 契約残の催促（「まだ何も連絡がなくて」）を出さない相手。
  // 初回に組み立てるときと、開き直したときの差分を作るときで、ここが別々の条件だったせいで、
  // すでに交渉している選手の会話の下に催促がもう1通ぶら下がっていた。
  // ＝「契約更新のチャットが二回出る」の正体
  const remindMonths = (freeContactClub || player.transferListed || hasContractTalk(contractRequests, player.id)) ? 99 : months

  // 獲得オファー交渉（FA・他チーム選手）。存在すれば契約更新ではなく獲得交渉モードで進める。
  const acqOffers = currentSeason.acquisitionOffers ?? []
  const acqOffer =
    acqOffers.find(o => o.playerId === player.id && (o.status === 'pending' || o.status === 'countered')) ??
    acqOffers.filter(o => o.playerId === player.id).at(-1)
  const isAcq = !!acqOffer && (acqOffer.status === 'pending' || acqOffer.status === 'countered')

  // 移籍金合意後の契約交渉（他チームから移籍金OKが出た選手）
  const transferBid = (currentSeason.transferBids ?? []).find(b => b.playerId === player.id && b.status === 'fee_accepted')
  const isTransfer = !!transferBid && !isAcq

  // 自チーム所属かどうか。契約更新・引退・移籍希望・不満・契約残の催促は自チーム選手専用の会話で、
  // 他チーム/FA選手（獲得・移籍交渉の相手）に出してはいけない。
  const isMine = player.teamId === playerTeamId
  // レンタルで借りている選手：契約・引退・移籍の用件は保有元クラブの管轄なので、この会話では扱わない
  const isLoanedIn = !!player.loan && player.loan.ownerTeamId !== playerTeamId
  const talksHere = isMine && !isLoanedIn

  // 接触中の文脈メッセージ（契約更新の話ではなく「誘いを受けている」ことを本人が伝える）
  const contactMsg: ChatMessage | null = freeContactClub
    ? { from: 'player', kind: 'free_contact', text: `実は${freeContactClub}から誘いを受けています。数戦のうちに答えを出すつもりです。` }
    : null

  // レンタルで借りている選手の説明。この会話では契約・引退・移籍を扱わない（保有元クラブの管轄）ので
  // buildMessages を通さない＝発言が0件になり、開いても真っ白な画面になっていた。
  // 「話せることが無い」ではなく「なぜ無いのか」をここ1本で出す
  const loanNote: ChatMessage | null = isMine && isLoanedIn
    ? { from: 'player', kind: 'loaned_in', text: `${clubIndex.byId(player.loan!.ownerTeamId)?.shortName ?? '保有元クラブ'}からレンタルで来ています。契約や進路の話は保有元クラブの管轄なので、こちらではお受けできません。レースでは全力を尽くします！` }
    : null
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const builtBase = isTransfer
      ? buildTransferMessages(player, transferBid!, clubIndex.byId(transferBid!.targetTeamId)?.name)
      : isAcq
      ? buildAcqMessages(player, acqOffer!, clubIndex.byId(player.teamId)?.name)
      : talksHere
      ? buildMessages(player, contractReq, remindMonths, !!retirementReq, !!transferReq, transferReq?.reason, overseasReq?.region)
      : loanNote
      ? [loanNote]
      : []  // 他チーム/FA選手で交渉モードでもない場合は保存ログのみ
    const built = (talksHere && !isTransfer && !isAcq && contactMsg) ? [...builtBase, contactMsg] : builtBase
    if (!initialMessages || initialMessages.length === 0) return built
    // 保存済みログを開いた後に発生した「新しい用件」だけをログに追記する。
    // 交渉への返答系（承諾・拒否・カウンター等）は会話の流れの一部であり、後から再構築すると
    // 「移籍を認めたのに『その条件では受け入れられません』が出る」ような文脈違いになるため対象外。
    const freshSourceBase = talksHere ? buildMessages(
      player,
      contractReq && contractReq.status === 'pending_gm' && contractReq.initiatedBy === 'player' ? contractReq : undefined,
      remindMonths,  // 初回の組み立てと同じ条件を使う（別々に書いて食い違わせない）
      !!retirementReq, !!transferReq, transferReq?.reason, overseasReq?.region,
    ) : loanNote ? [loanNote] : []
    const freshSource = (talksHere && contactMsg) ? [...freshSourceBase, contactMsg] : freshSourceBase
    // 突き合わせは utils/chatLog.ts の1本だけ（同じ用件は増やさず文面を差し替える）
    return mergeChatMessages(initialMessages, freshSource)
  })

  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])
  const [composing, setComposing] = useState(false)
  const [composeMode, setComposeMode] = useState<'renewal' | 'acq' | 'transfer'>('renewal')
  const [justAcquired, setJustAcquired] = useState(false)  // 獲得成立直後（契約更新フローへの誤遷移を防ぐ）
  const [negotiationFailed, setNegotiationFailed] = useState(false)  // 交渉決裂直後（別フローに落ちず締めの表示だけ出す）
  const [justRetired, setJustRetired] = useState(false)  // 引退承認直後（送別メッセージを見せてから閉じる）
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

  const openComposeTransfer = () => {
    const base = Math.round(faMarketSalary(player) / SALARY_STEP) * SALARY_STEP
    setOfferSalary(Math.max(SALARY_MIN, Math.min(SALARY_MAX, base)))
    setOfferYears(2)
    setComposeMode('transfer')
    setComposing(true)
  }

  const handleSubmitTransferOffer = () => {
    if (!transferBid) return
    append({ from: 'gm', text: `年俸${fmtYen(offerSalary)}、${offerYears}年契約でいかがでしょうか。` })
    const res = finalizeTransfer(transferBid.id, offerSalary, offerYears)
    if (res.ok) {
      append({ from: 'player', text: 'ありがとうございます。その条件で加入します！よろしくお願いします。' })
      setJustAcquired(true)
    } else {
      append({ from: 'player', text: `（代理人）申し訳ありません。${res.reason ?? '今回は成立しませんでした。'}` })
      const currentBid = useGameStore.getState().currentSeason.transferBids?.find(b => b.id === transferBid.id)
      if (!currentBid || currentBid.status === 'failed') {
        append({ from: 'player', text: '（代理人）今回はご縁がなかったということで。またの機会によろしくお願いいたします。' })
        setNegotiationFailed(true)
      }
    }
    setComposing(false)
  }

  const handleSubmitAcqOffer = () => {
    if (!acqOffer) return
    // ロスター枠の事前チェック。判定は rosterRules の canSignPlayer 1本。
    // すでに在籍している選手（トレードで来た直後の再契約など）は人数が増えないので枠は要らない。
    // 以前はここが canSignContract を直に呼んでいたため、30人ちょうどでトレード加入した選手と
    // 契約できず、しかも案内が、もう存在しない「契約形態の切り替え」を促す文章のままだった
    if (!canSignPlayer(players, playerTeamId, acqOffer.playerId)) {
      append({ from: 'gm', text: `（ロスターが上限${ROSTER_MAX}人です。誰かを放出してから改めて提示してください）` })
      return
    }
    append({ from: 'gm', text: `年俸${fmtYen(offerSalary)}、${offerYears}年契約でいかがでしょうか。` })
    submitAcquisitionOffer(acqOffer.id, offerSalary, offerYears, offerContractType, offerTeamRole ?? undefined)
    const updated = (useGameStore.getState().currentSeason.acquisitionOffers ?? []).find(o => o.id === acqOffer.id)
    if (updated?.status === 'accepted') {
      append({ from: 'player', text: 'ありがとうございます。その条件で加入します！よろしくお願いします。' })
      setJustAcquired(true)
    } else if (updated?.status === 'countered') {
      append({ from: 'player', text: `即断は難しいです。年俸${fmtYen(updated.counterSalary ?? 0)}、${updated.counterYears}年であれば合意します。` })
    } else if (updated?.status === 'rejected') {
      append({ from: 'player', text:
        updated.rejectReason === 'team_refused' ? '（代理人）クラブが主力の放出に応じません。金額の問題ではないようです。'
        : updated.rejectReason === 'demotion' ? '（代理人）2way契約・育成契約では本人が納得しません。本契約を用意できますか？'
        : '申し訳ありませんが、その条件では合意できません。' })
    } else {
      // 判定は合意だが署名処理（枠上限）で成立しなかった場合。無言にならないようフォローする
      append({ from: 'player', text: '（代理人）受け入れ枠の都合で契約手続きができなかったようです。ロスターを整理してから改めてお願いします。' })
    }
    setComposing(false)
  }

  const handleSubmitOffer = () => {
    append({ from: 'gm', text: `年俸${fmtYen(offerSalary)}、${offerYears}年契約でいかがでしょうか。` })
    // 進行中の札が無ければここで作る。作れるかどうかは contractTalk の canOfferRenewal（ストア側）で決まる
    if (!liveContractOf(useGameStore.getState().currentSeason.contractRequests, player.id)) {
      initiateContractRenewal(player.id)
      generateContractRequests()
    }
    const req = liveContractOf(useGameStore.getState().currentSeason.contractRequests, player.id)
    if (req) {
      submitContractRenewalOffer(req.id, offerSalary, offerYears, offerContractType, offerTeamRole ?? undefined)
      const updated = (useGameStore.getState().currentSeason.contractRequests ?? []).find(r => r.id === req.id)
      if (updated?.status === 'accepted') {
        append({ from: 'player', text: 'ありがとうございます。その条件で合意します。よろしくお願いします。' })
      } else if (updated?.status === 'countered') {
        append({ from: 'player', text: `考えましたが、年俸${fmtYen(updated.counterSalary ?? 0)}、${updated.counterYears}年であれば合意できます。これ以上は難しいです。` })
      } else if (updated?.status === 'rejected') {
        // フリー移籍の接触中で本人が移籍に傾いている場合は、条件の問題ではないことを伝える
        // （引き留め拒否が実際に起きた時だけ。残留寄りの選手が条件で断った時は通常の断り文句）
        const courted = (useGameStore.getState().currentSeason.incomingOffers ?? []).some(o => o.playerId === player.id && o.offeredPrice === 0 && o.retentionRefused)
        append({ from: 'player', text: courted
          ? '申し訳ありません…実は他クラブから誘いを受けていて、移籍を前向きに考えています。条件の問題ではないんです。'
          : '申し訳ありませんが、その条件では受け入れられません。' })
      }
    } else {
      // 札が作れない状態（引退の話・海外挑戦を承認済み・退団予定・決裂後の更新ロック）。
      // 以前はここに何も無く、ボタンを押しても本人が黙ったままだった
      append({ from: 'player', text: 'すみません…今はその話をお受けできる状況ではないんです。' })
    }
    setComposing(false)
  }

  const replyButtons = (() => {
    const base = (() => {
    // 獲得成立直後：契約更新フローに落ちないよう終了ボタンだけ出す
    if (justAcquired) return [
      { label: '閉じる', color: C.green, action: onClose },
    ]

    // 交渉決裂直後：締めのメッセージを見せたまま閉じるだけにする
    if (negotiationFailed) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // 引退承認直後：送別メッセージを見せてから閉じる（即アンマウントで一瞬も表示されない問題の対策）
    if (justRetired) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // 進路が決まった選手（引退を承認した・海外挑戦を承認した）は閉じるだけ。
    // buildMessages と同じ settledPath 1本で判断する。ここが無かったせいで、
    // 引退を承認した選手に「契約条件を提示する」が出て、話が続いてしまっていた
    if (settledPath(player)) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // 移籍金合意後の契約交渉モード（他チームから移籍金OKが出た選手）
    if (isTransfer) return [
      { label: '契約条件を提示する', color: C.blue, action: openComposeTransfer },
      { label: 'オファーを取り下げる', color: C.textSub, action: () => { rejectTransferBid(transferBid!.id); onClose() } },
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // 獲得オファー交渉モード
    if (isAcq && acqOffer) {
      if (acqOffer.status === 'countered') return [
        { label: `承諾する（${fmtYen(acqOffer.counterSalary ?? 0)}/${acqOffer.counterYears}年）`, color: C.green, action: () => {
          // 枠の事前チェック（承諾パスにも必要）。提示パスと同じ canSignPlayer 1本
          if (!canSignPlayer(players, playerTeamId, acqOffer.playerId)) {
            append({ from: 'gm', text: `（ロスターが上限${ROSTER_MAX}人です。誰かを放出してから改めて提示してください）` })
            return
          }
          append(
            { from: 'gm', text: `了解しました。年俸${fmtYen(acqOffer.counterSalary ?? 0)}、${acqOffer.counterYears}年で合意します。` },
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

    // 自チーム以外の選手（獲得・移籍交渉が終わった相手や海外選手など）と、
    // レンタルで借りている選手（契約は保有元の管轄）は、交渉モードでない限り閉じるだけ。
    if (!talksHere) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // 退団予定（移籍を容認した・売出に出した）の選手には新しい用件を出さない。
    // この分岐はフリー接触の分岐より後ろに置いてあったので、**移籍を認めた直後の選手に
    // 「引き留めの条件を提示する」が出ていた**。用件を止める判定は1箇所にまとめてここへ置く
    if (player.transferListed) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    // ── 自チーム選手の用件。複数溜まっている場合は「最後に来たメッセージの用件」から順に評価し、
    //    実際に押せるボタンがある用件を出す（新しい用件にボタンが無くても、古い用件が詰まないようフォールバック）
    type ReplyBtns = { label: string; color: string; action: () => void }[]
    const lastIdx = (pred: (m: ChatMessage) => boolean) => { for (let i = chatMessages.length - 1; i >= 0; i--) { if (pred(chatMessages[i])) return i } return -1 }

    const buildRetirementButtons = (): ReplyBtns | null => retirementReq ? [
      { label: '引退を承認する', color: C.textSub, action: () => {
        // 即引退ではなく「今季限りで引退」。シーズン終了時に正式に引退する
        append(
          { from: 'gm', text: 'わかりました。今シーズン限り、ですね。最後まで頼みます。' },
          { from: 'player', text: 'ありがとうございます。今シーズンを最後に引退します。残りのレース、最後まで走り切ります！' },
        )
        acceptRetirement(player.id)
        setJustRetired(true)
      }},
      { label: '引き留める', color: C.blue, action: () => {
        append(
          { from: 'gm', text: 'まだチームにあなたの力が必要です。もう少し頑張ってもらえませんか。' },
          { from: 'player', text: 'わかりました。もう少し頑張ってみます。' }
        )
        // 契約更新の要求も抱えている場合、引き留めの直後に出る「要求を飲む」の脈絡を作る
        if (contractReq?.status === 'pending_gm') {
          const effDemand = Math.round(contractReq.demandSalary * (1 + (contractReq.round - 1) * 0.03) / 500000) * 500000
          append({ from: 'player', text: `ただ、契約の件なのですが…年俸${fmtYen(effDemand)}・${contractReq.demandYears}年での更新を希望しています。ご検討ください。` })
        }
        dismissRetirementRequest(player.id)
      }},
    ] : null

    const buildTransferButtons = (): ReplyBtns | null => transferReq ? [
      { label: '移籍を認める', color: C.orange, action: () => {
        // 選んだ返答を自分（GM）の吹き出しとして必ず残す（会話が一方通行に見える問題の修正）
        append(
          { from: 'gm', text: 'わかりました。あなたのキャリアを尊重します。移籍を認めましょう。' },
          { from: 'player', text: 'ありがとうございます。移籍先を探します。' },
        )
        allowPlayerTransfer(player.id)
      }},
      { label: '残ってほしい', color: C.blue, action: () => {
        // 他クラブに心が傾いている選手は「わかりました」と言わず、最初から正直に断る（以後は本人の決断待ち）
        if (courtedAway) {
          append(
            { from: 'gm', text: 'まだあなたの力が必要です。残ってください。' },
            { from: 'player', text: `すみません…実は${freeContactClub ?? '他クラブ'}から誘いを受けていて、移籍を前向きに考えています。お約束はできません。` }
          )
          dismissTransferRequest(player.id)
          refuseFreeContactRetention(player.id)
          return
        }
        append(
          { from: 'gm', text: 'まだあなたの力が必要です。残ってください。' },
          { from: 'player', text: 'わかりました。もう少し様子を見てみます。' }
        )
        // 同じ選手が契約更新の要求も抱えている場合、残留の返事だけだと
        // 次に出る「要求を飲む」ボタンの脈絡が無くなるため、ここで要求を言わせる
        if (contractReq?.status === 'pending_gm') {
          const effDemand = Math.round(contractReq.demandSalary * (1 + (contractReq.round - 1) * 0.03) / 500000) * 500000
          append({ from: 'player', text: `ただ、契約の件なのですが…年俸${fmtYen(effDemand)}・${contractReq.demandYears}年での更新を希望しています。ご検討ください。` })
        }
        dismissTransferRequest(player.id)
      }},
    ] : null

    // 海外挑戦の直訴：認める（夢を応援）／引き留める（モラール低下・2回目は大）
    const buildOverseasButtons = (): ReplyBtns | null => overseasReq ? [
      { label: `海外挑戦を認める（${OVERSEAS_LABEL[overseasReq.region] ?? '海外'}）`, color: C.purple ?? '#A855F7', action: () => {
        append(
          { from: 'gm', text: 'わかった。お前の走りはもう世界レベルだ。夢を応援する。良いオファーを待とう。' },
          { from: 'player', text: 'ありがとうございます！絶対に結果を出します。オファーが来たらよろしくお願いします！' },
        )
        approveOverseasChallenge(player.id)
      }},
      { label: '今季は残ってくれ', color: C.blue, action: () => {
        const cnt = (player.overseasDeniedCount ?? 0) + 1
        append(
          { from: 'gm', text: 'まだチームにお前の力が必要だ。今季は残ってくれ。' },
          { from: 'player', text: cnt >= 2
            ? '…また、ですか。わかりました。でも、この気持ちはもう抑えられないかもしれません。'
            : 'わかりました…。でも、夢は諦めていません。また相談させてください。' },
        )
        denyOverseasChallenge(player.id)
      }},
    ] : null

    // フリー移籍で心が移籍に傾いているか（契約更新を条件に関わらず断る状態）。判定は決断時と同じ freeContactConsent
    const courtedAway = (() => {
      const freeContact = (currentSeason.incomingOffers ?? []).find(o => o.playerId === player.id && o.offeredPrice === 0)
      if (!freeContact) return false
      const fcRaces = Math.max(1, currentSeason.currentRaceIndex ?? 0)
      const fcFrac = seasonAppearances(player.id, currentSeason.races) / fcRaces
      return freeContactConsent(player, tierOf(teams.find(t => t.id === freeContact.fromTeamId)), tierOfPlayerClub(player.teamId, teams), fcFrac, fcRaces)
    })()

    const buildContractButtons = (): ReplyBtns | null => {
      if (!contractReq) return null
      // 海外挑戦を認めた選手からは、こちらから切り出さない限り年俸の話をさせない。
      // （承認した直後に同じ選手が「年俸○○で更新したい」と言い出すのを防ぐ。
      //   GM側から契約延長を持ちかける導線は後段に残してあるので、行き先が決まらなくても塩漬けにはならない）
      if (player.overseasListed) return null
      // もう一度条件を出していいかは contractTalk の canReNegotiate 1本で見る。
      // ラウンド上限(3)と、決裂後の更新ロックをここでまとめて見る。以前は rejected の枝にだけ
      // 手書きの除外があり、countered の枝には上限が無かったので、何度でも再交渉でき、
      // 「最終ラウンド」の扱いのまま勝手に移籍リスト入りしていた
      const canRedo = canReNegotiate(contractReq, player, talkCtx)
      if (contractReq.status === 'rejected') {
        // 心が移籍に傾いているなら再提示させない（後段の既定フローで閉じるだけになる）
        if (courtedAway || !canRedo) return null
        return [
          { label: '条件を変えて提示する', color: C.blue, action: () => { reNegotiateContract(contractReq.id); openCompose() } },
        ]
      }
      if (contractReq.status === 'countered') return [
        { label: `承諾する（${fmtYen(contractReq.counterSalary ?? 0)}/${contractReq.counterYears}年）`, color: C.green, action: () => {
          append(
            { from: 'gm', text: `了解しました。年俸${fmtYen(contractReq.counterSalary ?? 0)}、${contractReq.counterYears}年で合意します。` },
            { from: 'player', text: 'ありがとうございます。よろしくお願いします。' }
          )
          acceptContractCounter(contractReq.id)
        }},
        ...(canRedo ? [{ label: '再交渉する', color: C.gold, action: () => {
          append({ from: 'gm', text: '条件を再考させてください。' })
          reNegotiateContract(contractReq.id)
          openCompose()
        }}] : []),
      ]
      if (contractReq.status === 'pending_gm') {
        // 要求額はラウンドごとに3%ずつ上がる（エンジン側と同じ式）。古い額を出すと「飲んだのに拒否」される
        const effDemand = Math.round(contractReq.demandSalary * (1 + (contractReq.round - 1) * 0.03) / 500000) * 500000
        return [
          { label: `要求を飲む（${fmtYen(effDemand)}/${contractReq.demandYears}年）`, color: C.green, action: () => {
            append({ from: 'gm', text: `了解です。年俸${fmtYen(effDemand)}、${contractReq.demandYears}年で承諾します。` })
            submitContractRenewalOffer(contractReq.id, effDemand, contractReq.demandYears, contractReq.offerContractType ?? player.contract.contractType ?? 'standard', undefined)
            const updated = (useGameStore.getState().currentSeason.contractRequests ?? []).find(r => r.id === contractReq.id)
            if (updated?.status === 'accepted') {
              append({ from: 'player', text: 'ありがとうございます。よろしくお願いします。' })
            } else {
              // フリー移籍の接触中で本人が移籍に傾いている場合、要求どおりでも断られる。条件の問題ではないことを伝える
              const courted = (useGameStore.getState().currentSeason.incomingOffers ?? []).some(o => o.playerId === player.id && o.offeredPrice === 0 && o.retentionRefused)
              append({ from: 'player', text: courted
                ? 'すみません…実は他クラブから誘いを受けていて、移籍を前向きに考えています。条件の問題ではないんです。'
                : '申し訳ありませんが、その条件では受け入れられません。' })
            }
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
      }
      return null
    }

    // 新しいメッセージの用件から順に試す（メッセージが見つからない用件は後回し・元の優先順を維持）
    const topicOrder = [
      { present: !!retirementReq, idx: retirementReq ? lastIdx(m => m.text.includes('引退を考えて')) : -1, build: buildRetirementButtons },
      { present: !!transferReq, idx: transferReq ? lastIdx(m => m.text.includes('移籍を考えて')) : -1, build: buildTransferButtons },
      { present: !!overseasReq, idx: overseasReq ? lastIdx(m => m.text.includes('海外挑戦を認めて')) : -1, build: buildOverseasButtons },
      { present: !!contractReq && contractReq.status !== 'accepted', idx: contractReq ? lastIdx(m => m.text.includes('契約について') || m.text.includes('契約の件')) : -1, build: buildContractButtons },
    ].filter(t => t.present).sort((a, b) => b.idx - a.idx)
    for (const t of topicOrder) {
      const btns = t.build()
      if (btns && btns.length > 0) return btns
    }

    // 対応済みの契約合意は締めの状態（ボタンなし・見返し用）
    if (contractReq?.status === 'accepted') return []

    // フリー接触中：引き留めは契約提示に一本化（通常の契約更新ボタンは出さない）。
    // 一度断られたらこの件は終わり＝閉じるだけにして、本人の決断を待つ
    if (freeContactOffer) {
      if (freeContactOffer.retentionRefused || lastContractReq?.status === 'rejected') return [
        { label: '閉じる', color: C.textSub, action: onClose },
      ]
      return [
        { label: '引き留めの条件を提示する', color: C.blue, action: openCompose },
        { label: '閉じる', color: C.textSub, action: onClose },
      ]
    }

    // ここから下は「GMのほうから契約の話を持ちかける」ボタン。持ちかけていい相手かは
    // contractTalk の canOfferRenewal 1本で見る。この確認が無かったので、最終ラウンドで
    // 決裂して来年まで更新をロックされた選手にも「契約条件を提示する」が出ていて、
    // 押しても札が作られず**何も起きないボタン**になっていた
    if (!canOfferRenewal(player, talkCtx)) return [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

    if (months < 12 || contractReq?.initiatedBy === 'gm') return [
      { label: '契約条件を提示する', color: C.blue, action: openCompose },
    ]

    if (months < 24) return [
      { label: '契約更新の話をする', color: C.blue, action: openCompose },
    ]

    // 契約残が2年以上あっても前倒しで延長交渉できる（複数年契約が多い海外選手が更新に入れない問題の解消）
    return [
      { label: '契約延長の話をする（前倒し）', color: C.blue, action: openCompose },
      { label: '閉じる', color: C.textSub, action: onClose },
    ]
    })()
    // どの会話にも必ず「閉じる」を出す（出る画面と出ない画面が混在していたのを統一）。
    // イベントの選択肢だけの場面でも、選ばず閉じてOK（戻るボタンと同じ扱い）
    if (!base.some(b => b.label === '閉じる')) base.push({ label: '閉じる', color: C.textSub, action: onClose })
    return base
  })()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={onClose} />
        <div {...longPress(player.id)} style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', border: `2px solid ${alpha(specCol, 0.4)}`, flexShrink: 0, cursor: 'pointer' }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{player.name}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>
            {player.age}歳 · {fmtYen(player.contract.annualSalary)} · 残{fmtDuration(months)}
          </div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(playerOvr) }}>{playerOvr}</div>
      </div>

      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: msg.from === 'player' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
            {msg.from === 'player' && (
              <div {...longPress(player.id)} style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${alpha(specCol, 0.35)}`, cursor: 'pointer' }}>
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
            {/* 契約形態（本契約/2way/育成）の選択UIは廃止。枠は人数の上限1本だけ */}
            {/* 役割選択UIは非表示（役割は裏で自動保持）。offerTeamRole は未指定のまま提示される */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={composeMode === 'transfer' ? handleSubmitTransferOffer : composeMode === 'acq' ? handleSubmitAcqOffer : handleSubmitOffer}
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
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${alpha(btn.color, 0.5)}`, backgroundColor: alpha(btn.color, 0.1), color: btn.color, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4 }}>
                {btn.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// --- 他チーム（所属選手を表示し、選手を選ぶと契約オファー＝交渉を開始） ---

function TradeChatView({ team, onClose, initialGetId }: { team: Team; onClose: () => void; initialGetId?: string; initialMode?: 'fee' | 'trade'; onNegotiateContract?: (playerId: string) => void }) {
  const { players, teams, playerTeamId, currentSeason, pastSeasons, proposeTrade, acceptTradeCounter, dismissTradeNegotiation } = useGameStore()
  // 選べる＝動かせる、になるように候補は成立判定と同じものを使う（utils/transferEligibility.ts）。
  // 以前は相手側を素通しにしていたので、相手が他クラブから借りている選手が「もらう」候補に並び、
  // 選ぶと「いいだろう、その条件で成立だ」と言われるのに選手は動かなかった
  const tradeCtxT = {
    teamId: playerTeamId,
    currentYear: currentSeason.year,
    retiringIds: new Set((currentSeason.retirementRequests ?? []).map(r => r.playerId)),
  }
  const theirPlayers = players.filter(p => canBePoached(p, { teamId: team.id, currentYear: currentSeason.year })).sort((a, b) => ovr(b) - ovr(a))
  const myPlayersT = players.filter(p => canTradeAway(p, tradeCtxT)).sort((a, b) => ovr(b) - ovr(a))
  const myTeam = teams.find(t => t.id === playerTeamId)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [submitted, setSubmitted] = useState(false)
  const [getP, setGetP] = useState<Set<string>>(() => new Set(initialGetId ? [initialGetId] : []))
  const [getPk, setGetPk] = useState<Set<string>>(new Set())
  const [give, setGive] = useState<Set<string>>(new Set())
  const [givePk, setGivePk] = useState<Set<string>>(new Set())

  const neg = (currentSeason.tradeNegotiations ?? []).find(n => n.targetTeamId === team.id)

  // 成功率の見積もり（proposeTrade と同じ評価式＝utils/tradeValue.ts）。
  // 以前はここだけ主力の判定を自前で書き直していて（isDataKeyPlayer＋士気）、
  // ストア側の keyPlayerStatus と条件が違った。表示が100%でも出すと断られることがあった
  const tradeOutlook = (() => {
    const tvCtx = { races: currentSeason.races, teamRaces: currentSeason.currentRaceIndex, currentSeason, pastSeasons }
    const getPlayers = [...getP].map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p)
    const givePlayers = [...give].map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p)
    const tradeIn = { outPlayers: givePlayers, inPlayers: getPlayers,
      outExtra: [...givePk].reduce((s, k) => s + pickKeyValue(k), 0),
      inExtra: [...getPk].reduce((s, k) => s + pickKeyValue(k), 0) }
    const { cpuGain, cpuLoss, ratio } = tradeValues(tradeIn, tvCtx)
    const hasKey = getPlayers.some(p => keyFactor(p, tvCtx) > 1)
    const myTier = tierOf(teams.find(t => t.id === playerTeamId))
    const consentBonus = ratio >= 1.2 ? 0.15 : 0
    let blockMsg = ''
    for (const rp of getPlayers) {
      const consent = playerConsentToMove(rp, myTier, tierOfPlayerClub(rp.teamId, teams), 0.5, 0, consentBonus)
      if (!consent.ok) { blockMsg = consent.reason; break }
    }
    const nextRound = (neg?.round ?? 0) + 1
    // 出しすぎ（釣り合いの上限を超えている）はストア側で断られる。ここでも同じ文言で先に出す
    const balMsg = cpuLoss > 0 && cpuGain >= cpuLoss * TRADE_MIN_RATIO
      ? (tradeBalance(tradeIn, tvCtx).reason ?? '')
      : ''
    let rate: number
    if (blockMsg || balMsg || cpuLoss === 0) rate = 0
    else if (ratio >= TRADE_OK_RATIO) rate = 100
    else if (nextRound >= 3) rate = 0
    else rate = Math.max(0, Math.min(99, Math.round(((ratio - TRADE_HARD_NO_RATIO) / (TRADE_OK_RATIO - TRADE_HARD_NO_RATIO)) * 100)))
    const shortage = Math.max(0, cpuLoss * TRADE_OK_RATIO - cpuGain)
    // 直し方は理由ごとに違う。本人が嫌がっている＝対象を変える、持ち出しすぎ＝出す側を減らす。
    // 以前はどちらにも「。対象を変えてください」を足していて、句点が二重になるうえ助言が逆だった
    const blockNote = blockMsg ? `${blockMsg}。対象を変えてください` : balMsg
    return { rate, shortage, blockMsg: blockMsg || balMsg, blockNote, hasKey, isFinal: nextRound >= 3 }
  })()
  const pickKey = (pk: { year: number; round: number; pickNumber: number }) => `${pk.year}-R${pk.round}-${pk.pickNumber}`
  const pickLabel = (k: string) => { const [y, r, n] = k.split('-'); return r === 'R1' ? `${y} 1巡(全体${n}位)` : `${y} ${r.replace('R', '第')}巡` }
  const nameOf = (id: string) => players.find(p => p.id === id)?.name ?? '選手'
  const toggle = (setFn: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => setFn(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const getCount = getP.size + getPk.size
  const giveCount = give.size + givePk.size
  const submitTrade = () => { proposeTrade(team.id, [...give], [...givePk], [...getP], [...getPk]); setSubmitted(true) }
  const resetAll = () => { setGive(new Set()); setGetP(new Set()); setGivePk(new Set()); setGetPk(new Set()); setSubmitted(false); setStep(1) }

  // 下タブの上に固定するアクションバー（sticky）
  const stickyBar = (children: React.ReactNode) => (
    <div style={{ position: 'sticky', bottom: 0, marginTop: 8, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', background: `linear-gradient(to top, ${C.bg} 70%, ${alpha(C.bg, 0)})`, borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8 }}>
      {children}
    </div>
  )
  const primaryBtn = (label: string, onClick: () => void, enabled = true) => (
    <button onClick={() => enabled && onClick()} disabled={!enabled}
      style={{ flex: 1, padding: '14px', borderRadius: 12, border: 'none', cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.4, background: C.gold, color: '#1a0d00', fontSize: 15, fontWeight: 900, fontFamily: SAIRA }}>
      {label}
    </button>
  )
  // 上の戻るボタンに統一：1個前の画面（ステップ）へ。ステップ1で閉じる。
  const goBack = () => { if (step > 1) { setSubmitted(false); setStep((step - 1) as 1 | 2 | 3) } else onClose() }

  const stepTitle = step === 1 ? `貰う選手を選ぶ（${team.shortName}）` : step === 2 ? '出す選手を選ぶ（自チーム）' : 'トレード確認'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontFamily: "'Noto Sans JP', system-ui, sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={goBack} />
        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{team.name} とトレード</div>
          <div style={{ fontSize: 10, color: C.textDim }}>STEP {step}/3 · {stepTitle}</div>
        </div>
      </div>

      {/* STEP 1: 相手選手を選ぶ */}
      {step === 1 && (
        <div style={{ padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: C.textDim }}>{team.shortName}から<b style={{ color: C.green }}>貰う選手</b>を選択（複数可）</div>
          {theirPlayers.map(p => <TradeSelRow key={p.id} player={p} selected={getP.has(p.id)} color={C.green} onToggle={() => toggle(setGetP, p.id)} />)}
          {(team.draftPicks ?? []).length > 0 && (<>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>指名権</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(team.draftPicks ?? []).map(pk => { const k = pickKey(pk); return <PickChip key={k} label={pickLabel(k)} selected={getPk.has(k)} color={C.green} onToggle={() => toggle(setGetPk, k)} /> })}
            </div>
          </>)}
        </div>
      )}

      {/* STEP 2: 自チーム選手を選ぶ */}
      {step === 2 && (
        <div style={{ padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, color: C.textDim }}>自チームから<b style={{ color: C.red }}>出す選手</b>を選択（複数可）</div>
          {myPlayersT.map(p => <TradeSelRow key={p.id} player={p} selected={give.has(p.id)} color={C.red} onToggle={() => toggle(setGive, p.id)} />)}
          {(myTeam?.draftPicks ?? []).length > 0 && (<>
            <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>指名権</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(myTeam?.draftPicks ?? []).map(pk => { const k = pickKey(pk); return <PickChip key={k} label={pickLabel(k)} selected={givePk.has(k)} color={C.red} onToggle={() => toggle(setGivePk, k)} /> })}
            </div>
          </>)}
        </div>
      )}

      {/* STEP 3: 確認 */}
      {step === 3 && (
        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {submitted && !neg && (
            <div style={{ borderRadius: 12, padding: '14px', textAlign: 'center', background: alpha(C.green, 0.12), border: `1.5px solid ${alpha(C.green, 0.5)}` }}>
              <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.green, marginBottom: 4 }}>トレード成立！</div>
              <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.6 }}>加入選手は2軍へ。契約体系は「移籍・獲得」タブの契約交渉で確定してください。</div>
              <button onClick={onClose} style={{ marginTop: 10, padding: '10px 20px', borderRadius: 10, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>閉じる</button>
            </div>
          )}
          {submitted && neg && (
            <div style={{ borderRadius: 12, padding: '10px 12px', background: alpha(neg.status === 'rejected' ? C.red : C.gold, 0.1), border: `1.5px solid ${alpha(neg.status === 'rejected' ? C.red : C.gold, 0.5)}` }}>
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>{neg.message}</div>
              {neg.status === 'countered' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { acceptTradeCounter(neg.id) }} style={{ flex: 1, padding: 10, borderRadius: 9, border: 'none', background: C.green, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: SAIRA }}>条件を飲んで成立</button>
                  <button onClick={() => { dismissTradeNegotiation(neg.id); setSubmitted(false); setStep(1) }} style={{ padding: '10px 12px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>組み替え</button>
                </div>
              )}
              {neg.status === 'rejected' && (
                <>
                  {tradeOutlook.blockNote
                    ? <div style={{ fontSize: 10, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{tradeOutlook.blockNote}</div>
                    : tradeOutlook.shortage > 0 && <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>あと約{fmtYen(tradeOutlook.shortage)}相当が不足しています。出す選手か指名権を追加して再提案してください</div>}
                  <button onClick={() => { dismissTradeNegotiation(neg.id); setSubmitted(false); setStep(1) }} style={{ marginTop: 8, padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>組み替えて再提案</button>
                </>
              )}
              <div style={{ fontSize: 9, color: C.textGhost, marginTop: 6, fontFamily: SAIRA }}>交渉 {neg.round}/3 回目</div>
            </div>
          )}

          <div style={{ borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.red, marginBottom: 6 }}>出す（自チーム）</div>
            {giveCount === 0
              ? <div style={{ fontSize: 11, color: C.textGhost }}>なし</div>
              : <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>{[...[...give].map(nameOf), ...[...givePk].map(pickLabel)].join('・')}</div>}
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: C.green, marginBottom: 6 }}>貰う（{team.shortName}）</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>{[...[...getP].map(nameOf), ...[...getPk].map(pickLabel)].join('・')}</div>
          </div>

          {!submitted && giveCount > 0 && getCount > 0 && (() => {
            const { rate, shortage, blockMsg, hasKey, isFinal } = tradeOutlook
            const barColor = rate >= 70 ? C.green : rate >= 30 ? C.gold : C.red
            const filled = Math.round(rate / 10)
            return (
              <div style={{ borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, color: C.textDim, fontFamily: SAIRA, flexShrink: 0 }}>成功率</span>
                  <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: i < filled ? barColor : C.border2 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 900, color: barColor, fontFamily: SAIRA, flexShrink: 0, minWidth: 38, textAlign: 'right' }}>{rate}%</span>
                </div>
                {hasKey && <div style={{ fontSize: 10, color: C.gold, marginTop: 6, lineHeight: 1.5 }}>主力を含むため必要額1.5倍で計算されています</div>}
                {blockMsg && <div style={{ fontSize: 10, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{blockMsg}</div>}
                {!blockMsg && rate < 100 && shortage > 0 && (
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
                    あと約{fmtYen(shortage)}相当が不足。出す選手か指名権を追加してください
                    {isFinal && <span style={{ color: C.red }}>（最終交渉：合意圏内でないと決裂します）</span>}
                  </div>
                )}
                {!blockMsg && rate === 100 && <div style={{ fontSize: 10, color: C.green, marginTop: 6 }}>合意圏内です</div>}
              </div>
            )
          })()}
        </div>
      )}

      {/* 下タブの上に固定するアクションバー */}
      {step === 1 && stickyBar(primaryBtn('次へ', () => setStep(2), getCount > 0))}
      {step === 2 && stickyBar(primaryBtn('次へ', () => setStep(3), giveCount > 0))}
      {step === 3 && !submitted && stickyBar(primaryBtn('トレードを提案する', submitTrade, giveCount > 0 && getCount > 0))}
    </div>
  )
}

function TradeSelRow({ player, selected, color, onToggle }: { player: Player; selected: boolean; color: string; onToggle: () => void }) {
  const specCol = SPEC_COLOR[player.specialty]
  return (
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', background: selected ? alpha(color, 0.14) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${selected ? color : C.border}`, fontFamily: 'inherit' }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${selected ? color : C.border2}`, background: selected ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0912', fontSize: 12, fontWeight: 900 }}>{selected ? '✓' : ''}</div>
      <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}><PlayerFace playerId={player.id} nationality={player.nationality} size={40} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: alpha(specCol, 0.15), color: specCol, fontWeight: 700, flexShrink: 0 }}>{SPECIALTY_LABELS[player.specialty]}</span>
        </div>
        <div style={{ fontSize: 10, color: C.textDim }}>{player.age}歳 · {fmtYen(player.contract.annualSalary)} · 残{player.contract.yearsLeft}年</div>
      </div>
      <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)), flexShrink: 0 }}>{ovr(player)}</span>
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
        <div style={{ fontSize: 9, color: C.textDim }}>{player.age}歳 · {fmtYen(player.contract.annualSalary)} · 残{player.contract.yearsLeft}年</div>
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
  ctx: ContractTalkCtx,
  retirementRequests: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['retirementRequests']>,
  transferRequests: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['transferRequests']>,
  months: number,
  overseasRequests?: NonNullable<ReturnType<typeof useGameStore.getState>['currentSeason']['overseasRequests']>,
) {
  const hasRetirement = (retirementRequests ?? []).some(r => r.playerId === player.id)
  const hasTransfer = (transferRequests ?? []).some(r => r.playerId === player.id)
  const hasOverseas = (overseasRequests ?? []).some(r => r.playerId === player.id)
  const activeReq = liveContractOf(ctx.contractRequests, player.id)

  // 進路が決まった選手は、その旨だけ出して他の用件は出さない。
  // actionable = GMがまだ返事をしていない用件（＝「対応が必要」に数えるもの）。
  // 進路が決まった選手・退団予定の選手は、開いても「閉じる」しか出ない（replyButtons の settledPath /
  // transferListed の分岐）のに「対応が必要」に居座って人数を水増ししていた。
  // ベルの件数（collectNotifications）はこれらを数えていないので、数のズレの原因にもなっていた。
  // 札の表示は残したまま、数える対象からだけ外す
  const settled = settledPath(player)
  if (settled === 'retiring') return { label: '今季限りで引退', color: C.textSub, priority: 0, actionable: false }
  if (settled === 'overseas') return { label: '海外オファー待ち', color: C.purple, priority: 1, actionable: false }
  if (hasRetirement) return { label: '引退希望', color: C.textSub, priority: 0, actionable: true }
  if (hasOverseas) return { label: '海外挑戦の相談', color: C.purple, priority: 1, actionable: true }
  if (player.transferListed) return { label: '退団へ', color: C.orange, priority: 1, actionable: false }
  if (hasTransfer) {
    const tr = (transferRequests ?? []).find(r => r.playerId === player.id)
    const reasonLabel = tr?.reason === 'playing_time' ? '出場機会' : tr?.reason === 'team_performance' ? '強豪志向' : '待遇不満'
    return { label: `移籍希望・${reasonLabel}`, color: C.orange, priority: 1, actionable: true }
  }
  // フリー接触中の選手に契約残の「要対応」は出さない（接触の用件は移籍・獲得タブと通知側で扱う）
  if (ctx.freeContactIds.has(player.id)) return null
  if (activeReq?.status === 'countered') return { label: '対応中', color: C.gold, priority: 2, actionable: true }
  if (activeReq?.initiatedBy === 'gm' && activeReq.status === 'pending_gm') return { label: '対応中', color: C.gold, priority: 2, actionable: true }
  // 契約残による「要対応」は通知・ホーム・レース後と同じ needsRenewalAttention 1本で見る。
  // 別々の条件で数えていたので、チャットに出ない選手をホームが「契約未解決」と数えていた
  if (activeReq?.status === 'pending_gm' || needsRenewalAttention(player, months, ctx)) return { label: '要対応', color: C.red, priority: 3, actionable: true }
  return null
}

// 相手から来た移籍オファーのカード（承諾／カウンター＝ダイアル／拒否）
function IncomingTransferCard({ offer, player, teamName, onAccept, onCounter, onDecline }: {
  offer: IncomingOffer; player: Player; teamName: string
  onAccept: () => void; onCounter: (price: number) => void; onDecline: () => void
}) {
  const [mode, setMode] = useState<'idle' | 'counter'>('idle')
  // フリー移籍オファー（提示0円）へのカウンターは市場価値ベースで初期化（0を出さない）
  const feeBase = offer.offeredPrice > 0 ? offer.offeredPrice * 1.2 : calcTransferValue(player)
  const [fee, setFee] = useState(Math.max(1_000_000, Math.round(feeBase / 1_000_000) * 1_000_000))
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
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            {offer.offeredPrice > 0
              ? <>{teamName}が移籍金 <span style={{ color: C.gold, fontFamily: SAIRA }}>{fmtYen(offer.offeredPrice)}</span> で獲得を打診</>
              : <>{teamName}がフリー移籍（移籍金なし）で獲得を打診</>}
          </div>
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
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { players, playerTeamId, currentSeason, teams, generateContractRequests,
    acceptIncomingOffer, declineIncomingOffer, counterIncomingOffer, acceptIncomingLoanOffer, declineIncomingLoanOffer, openPlayerSheet,
    acceptFeeCounter, rejectTransferBid, setChatLog } = useGameStore()
  const clubIndex = useClubIndex()
  // 選手カードの長押しで選手詳細(PlayerSheet)を開く共通ハンドラ。顔タップは各カード側で個別に処理。
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const longPress = (pid: string) => ({
    onPointerDown: () => { lpFired.current = false; lpTimer.current = setTimeout(() => { lpFired.current = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
  })
  // 通知などから ?player=<id> で来た場合は直接その選手のチャットを開く
  const locState = location.state as { tradeTeamId?: string } | null
  const [chatPlayerId, setChatPlayerId] = useState<string | null>(() => searchParams.get('player'))
  const [tradeTeamId, setTradeTeamId] = useState<string | null>(() => searchParams.get('trade') ?? locState?.tradeTeamId ?? null)
  const cameFromParamRef = useRef<boolean>(!!(searchParams.get('player') || searchParams.get('trade') || locState?.tradeTeamId))
  const wantParam = searchParams.get('want')
  // チャット履歴は store（currentSeason.chatLogs）に保存。画面を離れても・解決後も年内は見返せる。
  const chatLogs = currentSeason.chatLogs ?? {}
  const [activeTab, setActiveTab] = useState<'own' | 'transfer'>((searchParams.get('trade') || locState?.tradeTeamId) ? 'transfer' : 'own')
  // 買い取り・レンタル打診に対応した結果（オファーはストアから消えるため、ここで結果を見せて確認で消す）。
  // 状態も見た目も transfer/OfferResultList の1本（移籍画面・オファー一覧と同じもの）
  const { results: offerResults, push: pushOfferResult, pushText: pushOfferText, dismiss: dismissOfferResult } = useOfferResults()

  useEffect(() => { generateContractRequests() }, [])

  // 既にチャットを開いた状態で ?player / ?trade 付きで来た場合も反応させる
  useEffect(() => {
    const pl = searchParams.get('player')
    const tr = searchParams.get('trade')
    if (pl) { setChatPlayerId(pl); setTradeTeamId(null); cameFromParamRef.current = true }
    else if (tr) { setTradeTeamId(tr); setChatPlayerId(null); setActiveTab('transfer'); cameFromParamRef.current = true }
    if (pl || tr) navigate('/team/chat', { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // location.state経由で来たtradeTeamId（通知などからstate付きnavigate）
  useEffect(() => {
    const ls = location.state as { tradeTeamId?: string } | null
    if (ls?.tradeTeamId) {
      setTradeTeamId(ls.tradeTeamId)
      setChatPlayerId(null)
      setActiveTab('transfer')
      cameFromParamRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const totalRaces = currentSeason.races.length
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const listCtx = contractTalkCtx(currentSeason, playerTeamId)
  const retirementRequests = currentSeason.retirementRequests ?? []
  const transferRequests = currentSeason.transferRequests ?? []

  // ケガ人も一覧に出す。以前は status === 'active' だけで数えていたので、ケガをした瞬間に
  // その選手の契約更新の用件がチャットから消え、放置されたまま期限切れになっていた
  const myPlayers = players.filter(p => p.teamId === playerTeamId && (p.status === 'active' || p.status === 'injured'))

  // 獲得交渉中（トレード成立後の再契約など）の自チーム選手は「移籍・獲得」タブに出すので、自チーム一覧からは除く
  const activeAcqPlayerIds = new Set((currentSeason.acquisitionOffers ?? []).filter(o => o.status === 'pending' || o.status === 'countered').map(o => o.playerId))

  const withStatus = myPlayers.filter(p => !activeAcqPlayerIds.has(p.id)).map(p => {
    const months = contractMonthsLeft(p.contract.yearsLeft, raceIndex, totalRaces)
    // レンタルで借りている選手の契約・引退・移籍の用件は保有元クラブの管轄なので出さない
    const isLoanedIn = !!p.loan && p.loan.ownerTeamId !== playerTeamId
    const status = isLoanedIn ? null : getPlayerStatus(p, listCtx, retirementRequests, transferRequests, months, currentSeason.overseasRequests)
    return { player: p, months, status }
  })

  // 「対応が必要」に数えるのは actionable の用件だけ。札が付いていても返事の要らないもの
  //（今季限りで引退・海外オファー待ち・退団へ）は札を出したまま「その他の選手」へ回す
  const needsAction = withStatus.filter(x => x.status?.actionable).sort((a, b) => {
    const pa = a.status!.priority
    const pb = b.status!.priority
    return pa !== pb ? pa - pb : ovr(b.player) - ovr(a.player)
  })
  // 「対応が必要」から回ってきた札付き（今季限りで引退・海外オファー待ち・退団へ）は、
  // OVR順に埋もれると消えたように見えるので、その他の中でも先頭に出す
  const others = withStatus.filter(x => !x.status?.actionable).sort((a, b) => {
    const sa = a.status ? 0 : 1
    const sb = b.status ? 0 : 1
    return sa !== sb ? sa - sb : ovr(b.player) - ovr(a.player)
  })

  // 獲得交渉中の選手（FA・他チーム選手）
  const activeAcqOffers = (currentSeason.acquisitionOffers ?? []).filter(o => o.status === 'pending' || o.status === 'countered')
  const acqPlayers = activeAcqOffers
    .map(o => ({ player: players.find(p => p.id === o.playerId), offer: o }))
    .filter((x): x is { player: Player; offer: AcquisitionOffer } => !!x.player)

  // 獲得オファーがある選手は status に関わらず開けるようにする（提示後に rejected/accepted になっても
  // チャットが閉じず、相手の返事＝拒否/カウンター/合意を確認できるようにする）。
  const offerPlayerIds = new Set((currentSeason.acquisitionOffers ?? []).map(o => o.playerId))
  const offerPlayers = players.filter(p => offerPlayerIds.has(p.id) && !myPlayers.some(m => m.id === p.id))
  // 移籍金合意済み（契約交渉待ち）の他チーム選手もチャットで開けるようにする
  const feeAcceptedBidIds = new Set((currentSeason.transferBids ?? []).filter(b => b.status === 'fee_accepted').map(b => b.playerId))
  // 除外するのは「いま獲得交渉が動いている選手」だけ（＝上の獲得交渉の欄に出ている選手）。
  // 以前は status を問わない offerPlayers で除外していたので、昔の断られた／取り下げた獲得オファーの札が
  // 1枚残っているだけでこの行がまるごと消えていた（ベルには1件出るのにチャットに行が無い、の原因）
  const contractPendingPlayers = players.filter(p => feeAcceptedBidIds.has(p.id) && !myPlayers.some(m => m.id === p.id) && !activeAcqPlayerIds.has(p.id))
  const openablePlayers = [...myPlayers, ...offerPlayers, ...contractPendingPlayers]
  // 開いている最中に選手の状態が変わっても（引退承認など）チャットが突然閉じないよう、全選手からフォールバック解決する
  const chatPlayer = chatPlayerId ? openablePlayers.find(p => p.id === chatPlayerId) ?? players.find(p => p.id === chatPlayerId) ?? null : null

  // 他チーム（トレード交渉の相手）
  const tradeTeam = tradeTeamId ? teams.find(t => t.id === tradeTeamId) ?? null : null

  // 無効なパラメータで来た場合（存在しない選手・海外クラブのID等）は一覧表示に落ちる。
  // その際「戻る」が呼び出し元へ飛ばないようフラグを下ろす
  useEffect(() => {
    if (!chatPlayer && !tradeTeam) cameFromParamRef.current = false
  })

  // 相手から来たオファー（移籍・レンタル）＝チャットで対応
  const teamName = (id: string) => clubIndex.byId(id)?.shortName ?? '他クラブ'
  // 引き留めを断られた接触（retentionRefused）は対応済み：一覧・件数に出さず、本人の決断を待つだけ
  const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o =>
    players.some(p => p.id === o.playerId && p.teamId === playerTeamId) && !(o.offeredPrice === 0 && o.retentionRefused))
  const incomingLoanOffers = currentSeason.incomingLoanOffers ?? []
  const inboundCount = incomingOffers.length + incomingLoanOffers.length
  const loanSlotsUsed = players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length

  const closeConversation = (clear: () => void) => {
    if (cameFromParamRef.current) { cameFromParamRef.current = false; navigate(-1) }
    else clear()
  }

  if (tradeTeam) return (
    <TradeChatView key={tradeTeam.id} team={tradeTeam} onClose={() => closeConversation(() => setTradeTeamId(null))}
      initialMode={wantParam ? 'trade' : 'fee'} initialGetId={wantParam ?? undefined}
      onNegotiateContract={(pid) => { setTradeTeamId(null); setChatPlayerId(pid) }} />
  )

  if (chatPlayer) return (
    <ChatView
      key={chatPlayer.id}
      player={chatPlayer}
      initialMessages={chatLogs[chatPlayer.id]}
      onMessagesChange={msgs => setChatLog(chatPlayer.id, msgs)}
      onClose={() => closeConversation(() => setChatPlayerId(null))}
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
        {...longPress(player.id)}
        onClick={() => { if (lpFired.current) { lpFired.current = false; return } setChatPlayerId(player.id) }}
        style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${borderColor}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          {/* 詳細は行の長押しに統一（顔タップの個別詳細は廃止） */}
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
              <span style={{ fontSize: 11, color: C.textDim }}>{fmtYen(player.contract.annualSalary)}</span>
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
        {...longPress(player.id)}
        onClick={() => { if (lpFired.current) { lpFired.current = false; return } setChatPlayerId(player.id) }}
        style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(statusCol, 0.4)}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
          {/* 詳細は行の長押しに統一（顔タップの個別詳細は廃止） */}
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
                const curTeam = clubIndex.byId(player.teamId)
                return curTeam ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                    <TeamLogoSVG primary={curTeam.colors.primary} secondary={curTeam.colors.secondary} shortName={curTeam.shortName} teamId={curTeam.id} size={14} />
                    <span style={{ fontSize: 10, color: C.textSub, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{curTeam.shortName}</span>
                  </span>
                ) : <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>未所属</span>
              })()}
              <span style={{ fontSize: 11, color: C.textDim }}>
                {offer.source === 'fa' ? `市場年俸 ${fmtYen(faMarketSalary(player))}` : `市場価値 ${fmtYen(calcTransferValue(player))}`}
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
          const badge = key === 'transfer' ? acqPlayers.length + inboundCount + contractPendingPlayers.length : 0
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

        {activeTab === 'transfer' && (inboundCount > 0 || offerResults.length > 0) && (
          <>
            {/* 返事の結果だけが残っている状態では見出しを出さない（「· 0件」と出ていた） */}
            {inboundCount > 0 && (
              <div style={{ fontSize: 10, fontWeight: 800, color: C.orange, letterSpacing: '0.1em', marginBottom: 2, marginTop: 4 }}>
                相手から来たオファー · {inboundCount}件
              </div>
            )}
            <OfferResultList results={offerResults} dismiss={dismissOfferResult} spacing={2} />
            {incomingOffers.filter(o => o.offeredPrice === 0).map(o => {
              // フリー移籍の接触：GMは対応できず、本人が数戦後に決断する（情報表示のみ）
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              const decidesIn = Math.max(1, o.expiresAtRace - (currentSeason.currentRaceIndex ?? 0))
              return (
                <button key={o.id} onClick={() => setChatPlayerId(p.id)} style={{ borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(C.orange, 0.4)}`, padding: '10px 12px', marginBottom: 2, width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(C.orange, 0.4)}` }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={40} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{teamName(o.fromTeamId)}が{p.name}と接触中</div>
                      <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, lineHeight: 1.5 }}>契約満了に伴うフリー移籍の勧誘。本人が約{decidesIn}戦後に決断します。タップして契約更新の交渉へ</div>
                    </div>
                  </div>
                </button>
              )
            })}
            {incomingOffers.filter(o => o.offeredPrice > 0).map(o => {
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              const tn = teamName(o.fromTeamId)
              return <IncomingTransferCard key={o.id} offer={o} player={p} teamName={tn}
                onAccept={() => pushOfferResult(o.id, acceptIncomingOffer(o.id), { playerName: p.name, teamName: tn, price: o.offeredPrice })}
                onCounter={(price) => pushOfferResult(o.id, counterIncomingOffer(o.id, price), { playerName: p.name, teamName: tn, price })}
                onDecline={() => declineIncomingOffer(o.id)} />
            })}
            {incomingLoanOffers.map(o => {
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              const tn = teamName(o.fromTeamId)
              return <IncomingLoanCard key={o.id} offer={o} player={p} teamName={tn} slotsFull={loanSlotsUsed >= 3}
                onAccept={() => {
                  const ok = acceptIncomingLoanOffer(o.id)
                  pushOfferText(o.id, ok
                    ? (o.direction === 'lend_out' ? `${p.name}を${tn}へ${o.years}年レンタルで貸し出しました` : `${p.name}を${o.years}年レンタルで借りました`)
                    : `レンタルは成立しませんでした（枠または条件を満たしていません）`, ok)
                }}
                onDecline={() => declineIncomingLoanOffer(o.id)} />
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

        {activeTab === 'transfer' && contractPendingPlayers.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: '0.1em', marginBottom: 2, marginTop: (inboundCount > 0 || acqPlayers.length > 0) ? 12 : 4 }}>
              契約交渉待ち · {contractPendingPlayers.length}名
            </div>
            {contractPendingPlayers.map(p => {
              const specCol = SPEC_COLOR[p.specialty]
              const curTeam = clubIndex.byId(p.teamId)
              return (
                <button key={p.id} {...longPress(p.id)}
                  onClick={() => { if (lpFired.current) { lpFired.current = false; return } setChatPlayerId(p.id) }}
                  style={{ width: '100%', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`, border: `1px solid ${alpha(C.green, 0.4)}`, overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                    <div onClick={(e) => { e.stopPropagation(); openPlayerSheet(p.id) }} style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}`, cursor: 'pointer' }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={44} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(C.green, 0.18), border: `1px solid ${alpha(C.green, 0.4)}`, color: C.green, fontWeight: 800, flexShrink: 0 }}>費用合意</span>
                      </div>
                      <div style={{ fontSize: 10, color: C.textDim }}>{curTeam?.shortName ?? '他クラブ'}と移籍金合意済み — 本人と契約交渉</div>
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: ratingColor(ovr(p)), lineHeight: 1, flexShrink: 0 }}>{ovr(p)}</div>
                  </div>
                </button>
              )
            })}
          </>
        )}

        {activeTab === 'transfer' && acqPlayers.length === 0 && inboundCount === 0 && contractPendingPlayers.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA, fontSize: 12, lineHeight: 1.7 }}>
            進行中の交渉・オファーはありません。<br/>移籍市場や他チームの選手から交渉を始めてください。
          </div>
        )}

      </div>
    </div>
  )
}
