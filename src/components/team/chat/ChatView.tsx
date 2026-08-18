import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../../ui/BackButton'
import ActionSheet from '../../ui/ActionSheet'
import { useGameStore } from '../../../store/gameStore'
import { useClubIndex } from '../../../lib/useClubIndex'
import PlayerFace from '../../player/PlayerFace'
import { clubRoutePath, type Club } from '../../../utils/clubs'
import { usePlayerLongPress } from '../../player/usePlayerLongPress'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, freeContactConsent } from '../../../utils/playerUtils'
import { playRateOf, prevSeasonOf } from '../../../utils/playRate'
import { canSignPlayer, ROSTER_MAX } from '../../../data/rosterRules'
import { mergeChatMessages } from '../../../utils/chatLog'
import { overseasApprovedLine, retireApprovedLine, offerTermsLine, joinAcceptedLine, rosterFullLine, reconsiderLine, stillWantsRenewalLine, stayPleaLine, thanksLine, contractAcceptLine, contractCounterLine, agreeTermsLine, clubDeclinedAckLine } from '../../../utils/chatLines'
import { settledPath } from '../../../utils/talkSync'
import { dreamLabelOf } from '../../../utils/transferDecision'
import { rivalClubsFor } from '../../../utils/transferRivals'
import { isSaleAnswered } from '../../../utils/saleAnswer'
import { offerResultText } from '../../../utils/offerResult'
import { contractTalkCtx, contractMonthsLeft, effectiveDemandSalary, liveContractOf, hasContractTalk, canReNegotiate, canOfferRenewal, isSaleAnswerPending } from '../../../utils/contractTalk'
import type { TeamRole, IncomingOffer, ChatMessage } from '../../../types'
import { TeamLogoSVG } from '../../icons/Icons'
import NumberDial from '../../ui/NumberDial'
import { SALARY_DIAL_STEP, SALARY_DIAL_MIN, NEGOTIATION_SALARY_MAX } from '../../../data/economy'
import { C, alpha, SAIRA, F } from '../../../styles/tokens'
import { tierOfPlayerClub, allTieredClubs } from '../../../utils/clubTier'
import { fmtYen } from '../../../utils/money'
import { buildMessages, buildAcqMessages, buildTransferMessages, buildIncomingOfferMessages, buildIncomingLoanMessages, buildStayOrLeaveMessages } from '../../../utils/chatTalk'
import { fmtDuration } from '../../../utils/chatFormat'

// 選手のチャット雑談イベント（疲労・士気・出場機会など）は廃止済み。
// 判定が「常に対象なし」の空リストのまま各所に分岐だけ残っていたので、分岐ごと消した

export function ChatView({
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
    currentSeason, teams, players, playerTeamId, pastSeasons,
    initiateContractRenewal, submitContractRenewalOffer,
    acceptContractCounter, reNegotiateContract,
    acceptRetirement, dismissRetirementRequest,
    dismissTransferRequest, allowPlayerTransfer,
    approveOverseasChallenge, denyOverseasChallenge,
    generateContractRequests, refuseFreeContactRetention,
    submitAcquisitionOffer, acceptAcquisitionCounter, reNegotiateAcquisition, abandonAcquisitionOffer,
    openPlayerSheet, finalizeTransfer, rejectTransferBid, rankIncomingOffers,
    acceptIncomingOffer, counterAllIncomingOffers, declineIncomingOffer,
    acceptIncomingLoanOffer, declineIncomingLoanOffer, resolveStayOrLeave, destinationOf,
  } = useGameStore()
  // 海外クラブの格も毎年動くので、格を引くときは国内＋海外をまとめて渡す（allTieredClubs）
  const foreignLeagues = useGameStore(s => s.foreignLeagues)
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

  // 相手クラブから来た打診（買い取り・レンタル）。会話で返事をする用件のひとつとして扱う。
  // 移籍金0円のオファーは「フリー移籍の接触」で、返事をするのは本人なので別扱い（freeContactOffer）
  //
  // 良い選手には複数クラブが同時に来る（最大5件）。並べ方は本人の希望順（rankIncomingOffers）で、
  // 先頭が本命。GMはどれを受けてもいいが、本人が納得しない先は成立しない
  const rankedOffers = rankIncomingOffers(player.id)
  // 退団予定にしたのに行き先が決まらなかった選手（シーズン終了時に積まれる）
  const undecided = (currentSeason.stayOrLeave ?? []).some(x => x.playerId === player.id)
  const incomingOffer = rankedOffers[0]?.offer ?? null
  const incomingLoan = (currentSeason.incomingLoanOffers ?? []).find(o => o.playerId === player.id) ?? null
  const incomingLoanFrom = incomingLoan ? (clubIndex.byId(incomingLoan.fromTeamId)?.shortName ?? '他クラブ') : ''
  // 借り入れの枠（3人まで）。貸し出しには枠は要らない（カードでやっていたときと同じ条件）
  const loanBorrowedIn = players.filter(pl => pl.teamId === playerTeamId && pl.loan && pl.loan.ownerTeamId !== playerTeamId).length

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
  const incomingMsgs: ChatMessage[] = [
    ...(undecided ? buildStayOrLeaveMessages() : []),
    ...buildIncomingOfferMessages(
      player,
      rankedOffers.map(r => ({
        id: r.offer.id,
        name: clubIndex.byId(r.offer.fromTeamId)?.shortName ?? '他クラブ',
        price: r.offer.offeredPrice,
        // 一覧に1行ずつ並べるので短い形（選手名を繰り返さない）
        ok: r.appraisal.ok, reason: r.appraisal.shortReason,
      })),
      // 行ってもいい先が2つ以上あるときだけ本命を聞く（1つなら一覧で言い切っている）
      rankedOffers.filter(r => r.appraisal.ok).length > 1
        ? { name: clubIndex.byId(rankedOffers[0].offer.fromTeamId)?.shortName ?? '他クラブ', reason: rankedOffers[0].appraisal.shortReason }
        : undefined,
    ),
    ...(incomingLoan ? buildIncomingLoanMessages(player, incomingLoan, incomingLoanFrom) : []),
  ]

  // 取り合いの件数。数え方は utils/transferRivals の rivalClubsFor 1本（入札と同じ）。
  // 獲得オファーが立っているときだけ数える
  const acqRivalCount = isAcq && acqOffer
    ? rivalClubsFor(player, {
        teams, players, playerTeamId, foreignLeagues: foreignLeagues ?? [],
        destinationOf: (clubId, p) => destinationOf(clubId, p),
      }).length
    : 0

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const builtBase = isTransfer
      ? buildTransferMessages(player, transferBid!, clubIndex.byId(transferBid!.targetTeamId)?.name)
      : isAcq
      ? buildAcqMessages(player, acqOffer!, clubIndex.byId(player.teamId)?.name, acqRivalCount)
      : talksHere
      ? buildMessages(player, contractReq, remindMonths, !!retirementReq, !!transferReq, transferReq?.reason, overseasReq?.region)
      : loanNote
      ? [loanNote]
      : []  // 他チーム/FA選手で交渉モードでもない場合は保存ログのみ
    const withContact = (talksHere && !isTransfer && !isAcq && contactMsg) ? [...builtBase, contactMsg] : builtBase
    const built = [...withContact, ...incomingMsgs]
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
    const freshSourceWithContact = (talksHere && contactMsg) ? [...freshSourceBase, contactMsg] : freshSourceBase
    // 打診は後から届くので、開き直したときの差分にも必ず入れる（mergeChatMessages が重複を潰す）
    const freshSource = [...freshSourceWithContact, ...incomingMsgs]
    // 突き合わせは utils/chatLog.ts の1本だけ（同じ用件は増やさず文面を差し替える）
    return mergeChatMessages(initialMessages, freshSource)
  })

  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])
  const [composing, setComposing] = useState(false)
  const [composeMode, setComposeMode] = useState<'renewal' | 'acq' | 'transfer' | 'counterFee'>('renewal')
  const [offerFee, setOfferFee] = useState(1_000_000)   // 買い取り打診への逆提示額
  const [justAcquired, setJustAcquired] = useState(false)  // 獲得成立直後（契約更新フローへの誤遷移を防ぐ）
  const [negotiationFailed, setNegotiationFailed] = useState(false)  // 交渉決裂直後（別フローに落ちず締めの表示だけ出す）
  const [justRetired, setJustRetired] = useState(false)  // 引退承認直後（送別メッセージを見せてから閉じる）
  // 相手クラブへの打診に返事をした直後（結果を見せてから閉じる）。
  // 買い取りとレンタルは同時に来るので別々に持つ。1つにまとめていたときは、
  // レンタルに返事をした瞬間に買い取りの返事ボタンまで消えていた
  const [settledOfferLocal, setSettledOffer] = useState(false)
  // 「譲ります」と返事をしたあとは、行き先が決まるまで返事のボタンを出さない。
  // 返事の記録は utils/saleAnswer 1本（オファーの札は上乗せを受けるため残る）。
  // ここを画面の state だけで持っていたので、**一度閉じて開き直すと同じ返事ボタンが戻り**、
  // 何度でも返事ができるように見えていた。
  // 記録の側もシーズンに1件しか持てず、2人目に返事をすると1人目の返事が消えていた
  const settledOffer = settledOfferLocal || isSaleAnswered(currentSeason, player.id)
  const [settledLoan, setSettledLoan] = useState(false)
  const [offerSalary, setOfferSalary] = useState(SALARY_DIAL_MIN)
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
      ? Math.round(contractReq.demandSalary * 0.88 / SALARY_DIAL_STEP) * SALARY_DIAL_STEP
      : Math.round(player.contract.annualSalary * 1.05 / SALARY_DIAL_STEP) * SALARY_DIAL_STEP
    setOfferSalary(Math.max(SALARY_DIAL_MIN, Math.min(NEGOTIATION_SALARY_MAX, base)))
    setOfferYears(contractReq?.demandYears ?? 2)
    setOfferContractType(contractReq?.offerContractType ?? player.contract.contractType ?? 'standard')
    setOfferTeamRole(contractReq?.offerTeamRole ?? player.teamRole ?? null)
    setComposeMode('renewal')
    setComposing(true)
  }

  const openComposeAcq = () => {
    const base = Math.round(faMarketSalary(player) / SALARY_DIAL_STEP) * SALARY_DIAL_STEP
    setOfferSalary(Math.max(SALARY_DIAL_MIN, Math.min(NEGOTIATION_SALARY_MAX, base)))
    setOfferYears(2)
    setOfferContractType(acqOffer?.offerContractType ?? 'standard')
    setOfferTeamRole(null)
    setComposeMode('acq')
    setComposing(true)
  }

  const openComposeTransfer = () => {
    const base = Math.round(faMarketSalary(player) / SALARY_DIAL_STEP) * SALARY_DIAL_STEP
    setOfferSalary(Math.max(SALARY_DIAL_MIN, Math.min(NEGOTIATION_SALARY_MAX, base)))
    setOfferYears(2)
    setComposeMode('transfer')
    setComposing(true)
  }

  // 買い取り打診への逆提示（「この額なら出す」）。
  // 打診してきた全クラブに同じ額を一斉に出し、払えるクラブだけが残る。
  // 初期値は一番高い提示額の1.2倍（釣り上げの起点は最高額）
  const openComposeCounterFee = () => {
    if (rankedOffers.length === 0) return
    const highest = Math.max(...rankedOffers.map(r => r.offer.offeredPrice))
    setOfferFee(Math.max(1_000_000, Math.round(highest * 1.2 / 1_000_000) * 1_000_000))
    setComposeMode('counterFee')
    setComposing(true)
  }

  const handleSubmitCounterFee = () => {
    if (rankedOffers.length === 0) return
    const n = rankedOffers.length
    append({ from: 'gm', kind: 'counter_fee', text: n > 1
      ? `${fmtYen(offerFee)}であればお譲りします。各クラブのご判断をお聞かせください。`
      : `${fmtYen(offerFee)}であればお譲りします。いかがでしょうか。` })
    const res = counterAllIncomingOffers(player.id, offerFee)
    setComposing(false)
    if (res.blocked === 'roster_min') {
      append({ from: 'player', kind: 'roster_min_block', text: `（代理人）${offerResultText('roster_min', { playerName: player.name, teamName: '', price: offerFee }).text}` })
      return
    }
    if (res.blocked === 'invalid') {
      append({ from: 'player', kind: 'offer_withdrawn', text: `（代理人）${player.name}選手は移籍の対象外になったため、話は取り下げられました` })
      return
    }
    const names = (ids: string[]) => ids.map(nameOfClub).join('・')
    append({ from: 'player', kind: 'counter_fee_result', text: res.accepted.length === 0
      ? `（代理人）${n}クラブに${fmtYen(offerFee)}で打診しましたが、どこも支払えず辞退しました。`
      : res.declined.length === 0
      ? `（代理人）${n}クラブに${fmtYen(offerFee)}で打診しました。${names(res.accepted)}が応じています。`
      : `（代理人）${n}クラブに${fmtYen(offerFee)}で打診しました。${names(res.accepted)}が応じています。${names(res.declined)}は支払えず辞退しました。` })
  }

  // 移籍先の選択シートを開いているか（複数クラブが取り合いのとき）
  // 発言の頭に付けた「（◯◯GM）」「（代理人）」から差出人を割り出す。
  //   ・（◯◯GM） … 相手クラブ。名前とロゴをそのクラブのものにして、タップで詳細へ
  //   ・（代理人） … 名前の欄に「代理人」と出す（本文の括弧は消す）
  //   ・括弧なし   … 本人の発言。名前を出す
  // 本文からは括弧の部分を取り除く（名前は吹き出しの上に出すので二重になる）
  const navigateTo = useNavigate()
  const goClubPage = (c: Club | undefined) => { const path = clubRoutePath(c); if (path) navigateTo(path) }
  const speakerOf = (m: ChatMessage): { name: string | null; club: Club | undefined; text: string } => {
    if (m.from !== 'player') return { name: null, club: undefined, text: m.text }
    const hit = /^（([^）]+)）/.exec(m.text)
    if (!hit) return { name: player.name, club: undefined, text: m.text }
    const label = hit[1]
    const body = m.text.slice(hit[0].length)
    if (label === '代理人') return { name: '代理人', club: undefined, text: body }
    const short = label.endsWith('GM') ? label.slice(0, -2) : label
    // 前置きの括弧はクラブの表示名で書かれている。海外クラブの名前を都市名に直したので、
    // それより前に書かれたログは切れた名前（「ストックホ」）のまま残っている。
    // 前方一致でも拾って、古いログでもクラブ名とロゴが出るようにする
    const club = clubIndex.all.find(c => c.shortName === short)
      ?? clubIndex.all.find(c => c.shortName.startsWith(short))
    return { name: club ? club.shortName : short, club, text: body }
  }

  const [pickingDest, setPickingDest] = useState(false)
  const nameOfClub = (id: string) => clubIndex.byId(id)?.shortName ?? '他クラブ'
  const acceptOffer = (o: IncomingOffer) => {
    setPickingDest(false)
    append({ from: 'gm', kind: `sale_accepted:${o.fromTeamId}`, text: `${nameOfClub(o.fromTeamId)}に${fmtYen(o.offeredPrice)}でお譲りします。` })
    const outcome = acceptIncomingOffer(o.id)
    // 断られたときは、なぜ断ったのか（出場機会・地域・格）をそのまま会話に出す
    const appraisal = rankedOffers.find(x => x.offer.id === o.id)?.appraisal
    const r = offerResultText(outcome, {
      playerName: player.name, teamName: nameOfClub(o.fromTeamId), price: o.offeredPrice,
      reason: appraisal?.ok === false ? appraisal.reason : undefined,
    })
    append({ from: 'player', kind: 'sale_outcome', text: `（代理人）${r.text}` })
    // 売れた時点で本人がチームを離れるので、レンタルの話も同時に終わる。
    // 'pending'（1レース待って決着）は返事が済んだ扱い＝買い取りの返事だけ閉じる
    if (outcome === 'sold') { setSettledOffer(true); setSettledLoan(true) }
    else if (outcome === 'pending') setSettledOffer(true)
  }

  const handleSubmitTransferOffer = () => {
    if (!transferBid) return
    append(offerTermsLine(fmtYen(offerSalary), offerYears))
    const res = finalizeTransfer(transferBid.id, offerSalary, offerYears)
    if (res.ok) {
      append(joinAcceptedLine())
      setJustAcquired(true)
    } else {
      append({ from: 'player', kind: 'bid_failed', text: `（代理人）申し訳ありません。${res.reason ?? '今回は成立しませんでした。'}` })
      const currentBid = useGameStore.getState().currentSeason.transferBids?.find(b => b.id === transferBid.id)
      if (!currentBid || currentBid.status === 'failed') {
        append({ from: 'player', kind: 'negotiation_closed', text: '（代理人）今回はご縁がなかったということで。またの機会によろしくお願いいたします。' })
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
      append(rosterFullLine(ROSTER_MAX))
      return
    }
    append(offerTermsLine(fmtYen(offerSalary), offerYears))
    submitAcquisitionOffer(acqOffer.id, offerSalary, offerYears, offerContractType, offerTeamRole ?? undefined)
    const updated = (useGameStore.getState().currentSeason.acquisitionOffers ?? []).find(o => o.id === acqOffer.id)
    if (updated?.status === 'accepted') {
      append(joinAcceptedLine())
      setJustAcquired(true)
    } else if (updated?.status === 'countered') {
      append({ from: 'player', kind: 'agent_hesitates', text: `（代理人）即断は難しいです。年俸${fmtYen(updated.counterSalary ?? 0)}、${updated.counterYears}年であれば合意します。` })
    } else if (updated?.status === 'rejected') {
      append({ from: 'player', kind: 'bid_rejected', text:
        updated.rejectReason === 'team_refused' ? '（代理人）クラブが主力の放出に応じません。金額の問題ではないようです。'
        : updated.rejectReason === 'demotion' ? '（代理人）2way契約・育成契約では本人が納得しません。本契約を用意できますか？'
        // 条件は足りているが、行き先そのものを本人が選ばない（appraiseMove が通らない）。
        // 金額の問題ではないと伝えないと、上乗せを繰り返す押し損になる
        : updated.rejectReason === 'not_convinced' ? '（代理人）条件ではなく、移籍先としてご縁を感じないとのことです。金額の問題ではありません。'
        : '（代理人）申し訳ありませんが、その条件では合意できません。' })
    } else {
      // 判定は合意だが署名処理（枠上限）で成立しなかった場合。無言にならないようフォローする
      append({ from: 'player', kind: 'sign_no_slot', text: '（代理人）受け入れ枠の都合で契約手続きができなかったようです。ロスターを整理してから改めてお願いします。' })
    }
    setComposing(false)
  }

  const handleSubmitOffer = () => {
    append(offerTermsLine(fmtYen(offerSalary), offerYears))
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
        append(contractAcceptLine())
      } else if (updated?.status === 'countered') {
        append(contractCounterLine(fmtYen(updated.counterSalary ?? 0), updated.counterYears))
      } else if (updated?.status === 'rejected') {
        // フリー移籍の接触中で本人が移籍に傾いている場合は、条件の問題ではないことを伝える
        // （引き留め拒否が実際に起きた時だけ。残留寄りの選手が条件で断った時は通常の断り文句）
        const courted = (useGameStore.getState().currentSeason.incomingOffers ?? []).some(o => o.playerId === player.id && o.offeredPrice === 0 && o.retentionRefused)
        append({ from: 'player', kind: 'renewal_rejected', text: courted
          ? '申し訳ありません…実は他クラブから誘いを受けていて、移籍を前向きに考えています。条件の問題ではないんです。'
          : '申し訳ありませんが、その条件では受け入れられません。' })
      }
    } else {
      // 札が作れない状態（引退の話・海外挑戦を承認済み・退団予定・決裂後の更新ロック）。
      // 以前はここに何も無く、ボタンを押しても本人が黙ったままだった
      append({ from: 'player', kind: 'cannot_talk_now', text: 'すみません…今はその話をお受けできる状況ではないんです。' })
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
            append(rosterFullLine(ROSTER_MAX))
            return
          }
          append(
            agreeTermsLine(fmtYen(acqOffer.counterSalary ?? 0), acqOffer.counterYears),
            { from: 'player', kind: 'join_accepted', text: 'ありがとうございます。加入します。よろしくお願いします。' }
          )
          acceptAcquisitionCounter(acqOffer.id)
          setJustAcquired(true)
        }},
        ...(acqOffer.round < 3 ? [{ label: '再交渉する', color: C.gold, action: () => {
          append(reconsiderLine())
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

    type ReplyBtns = { label: string; color: string; action: () => void; disabled?: boolean }[]

    // 行き先が決まらなかった退団予定の選手の去就。残留を選んでもモラルは下げない
    const buildStayOrLeaveButtons = (): ReplyBtns | null => {
      if (!undecided) return null
      return [
        { label: '残ってくれ（移籍希望はそのまま）', color: C.blue, action: () => {
          append(
            { from: 'gm', kind: 'stay_asked', text: 'まだこのチームで走ってほしい。今季もよろしくお願いします。' },
            { from: 'player', kind: 'stay_reluctant', text: 'わかりました。ただ、移籍したい気持ちは変わりません。良い話があれば、また相談させてください。' },
          )
          resolveStayOrLeave(player.id, 'stay')
        }},
        { label: '契約を解除する（FA）', color: C.orange, action: () => {
          append(
            { from: 'gm', kind: 'release_granted', text: 'わかりました。契約を解除します。新しいクラブを探してください。' },
            { from: 'player', kind: 'release_thanks', text: 'ありがとうございました。お世話になりました。' },
          )
          resolveStayOrLeave(player.id, 'release')
          setSettledOffer(true); setSettledLoan(true)
        }},
      ]
    }

    // 相手クラブから来た買い取り打診への返事。
    // 複数クラブが来ているときに承諾ボタンを人数分ぶら下げると縦に伸びるので、
    // 「移籍先を選んで承諾」1つにまとめ、行き先の選択は下から出るシートで受ける。
    // 画面下から出るものは必ず BottomSheet（ActionSheet）を通す決まり（CLAUDE.md）
    const buildIncomingOfferButtons = (): ReplyBtns | null => {
      if (rankedOffers.length === 0 || settledOffer) return null
      const top = rankedOffers[0].offer
      const one = rankedOffers.length === 1
      return [
        one
          ? { label: `${nameOfClub(top.fromTeamId)}へ承諾（${fmtYen(top.offeredPrice)}）`, color: C.green, action: () => acceptOffer(top) }
          : { label: `移籍先を選んで承諾（${rankedOffers.length}クラブ）`, color: C.green, action: () => setPickingDest(true) },
        { label: one ? `${nameOfClub(top.fromTeamId)}に金額を提示する` : '全クラブに金額を提示する', color: C.gold, action: openComposeCounterFee },
        { label: one ? '断る' : 'すべて断る', color: C.red, action: () => {
          append(
            { from: 'gm', kind: 'sale_refused', text: `申し訳ありませんが、${player.name}を手放すつもりはありません。` },
            clubDeclinedAckLine(nameOfClub(top.fromTeamId)),
          )
          for (const r of rankedOffers) declineIncomingOffer(r.offer.id)
          setSettledOffer(true)
        }},
      ]
    }

    // レンタル打診への返事。貸す／借りるの両方向とも会話で答える
    const buildIncomingLoanButtons = (): ReplyBtns | null => {
      if (!incomingLoan) return null
      if (settledLoan) return null
      const isLend = incomingLoan.direction === 'lend_out'
      return [
        { label: isLend ? `${incomingLoan.years}年で貸し出す` : `${incomingLoan.years}年で借りる`, color: C.blue, action: () => {
          append({ from: 'gm', kind: 'loan_accepted', text: isLend ? `わかりました。${incomingLoan.years}年、お預けします。` : `わかりました。${incomingLoan.years}年、お借りします。` })
          const ok = acceptIncomingLoanOffer(incomingLoan.id)
          append({ from: 'player', kind: 'loan_result', text: ok
            ? (isLend ? `（代理人）${player.name}を${incomingLoanFrom}へ${incomingLoan.years}年のレンタルで貸し出しました` : `（代理人）${player.name}を${incomingLoan.years}年のレンタルで借り入れました`)
            : `（代理人）レンタルの枠（3人）が埋まっているため、この話は成立しませんでした` })
          if (ok) setSettledLoan(true)
        }, disabled: !isLend && loanBorrowedIn >= 3 },
        { label: '断る', color: C.red, action: () => {
          append(
            { from: 'gm', kind: 'loan_refused', text: '申し訳ありませんが、今回は見送らせてください。' },
            clubDeclinedAckLine(incomingLoanFrom),
          )
          declineIncomingLoanOffer(incomingLoan.id)
          setSettledLoan(true)
        }},
      ]
    }

    // 相手クラブからの打診は、自チーム外の選手（借り入れ）や退団予定にした選手にも来る。
    // 下の「自チーム以外は閉じるだけ」「退団予定には用件を出さない」より前に置かないと、
    // 打診が届いているのに会話に「閉じる」しか出ず、返事ができなくなる。
    //
    // 買い取りとレンタルは同じ選手に同時に来る。?? でつないでいたので先に見つかった方しか
    // 出ず、**もう片方には返事ができなかった**。両方あるときは並べて、どちらの話かを頭に付ける
    const offerBtns = buildIncomingOfferButtons()
    const loanBtns = buildIncomingLoanButtons()
    const incomingEarly = buildStayOrLeaveButtons()
      ?? (offerBtns && loanBtns
        ? [
            ...offerBtns.map(b => ({ ...b, label: `［移籍］${b.label}` })),
            ...loanBtns.map(b => ({ ...b, label: `［レンタル］${b.label}` })),
          ]
        : offerBtns ?? loanBtns)
    if (incomingEarly && (!talksHere || player.transferListed)) return incomingEarly

    // 進路が決まった選手（引退を承認した・海外挑戦を承認した）には**新しい用件**を出さない。
    // buildMessages と同じ settledPath 1本で判断する。ここが無かったころは、
    // 引退を承認した選手に「契約条件を提示する」が出て話が続いてしまっていた。
    //
    // ★ただし**もう届いている打診への返事だけは通す**。
    //   海外挑戦を認めた選手に海外クラブからオファーが来るのは本人が望んだ話で、
    //   札も残る側（utils/talkSync が海外からのぶんだけ残す）。それなのにここが
    //   無条件に「閉じる」を返していたので、**1.3億のオファーが会話に出ているのに
    //   閉じることしかできない**状態になっていた。残す札と返せるボタンを揃える
    if (settledPath(player)) return incomingEarly ?? [
      { label: '閉じる', color: C.textSub, action: onClose },
    ]

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
    const lastIdx = (pred: (m: ChatMessage) => boolean) => { for (let i = chatMessages.length - 1; i >= 0; i--) { if (pred(chatMessages[i])) return i } return -1 }

    const buildRetirementButtons = (): ReplyBtns | null => retirementReq ? [
      { label: '引退を承認する', color: C.textSub, action: () => {
        // 即引退ではなく「今季限りで引退」。シーズン終了時に正式に引退する
        append(
          { from: 'gm', kind: 'retire_granted', text: 'わかりました。今シーズン限り、ですね。最後まで頼みます。' },
          // 次に開いて作り直したときと同じ発言にする（kind が同じなので二重に並ばない）
          retireApprovedLine(),
        )
        acceptRetirement(player.id)
        setJustRetired(true)
      }},
      { label: '引き留める', color: C.blue, action: () => {
        append(
          { from: 'gm', kind: 'retire_persuade', text: 'まだチームにあなたの力が必要です。もう少し頑張ってもらえませんか。' },
          { from: 'player', kind: 'retire_stay', text: 'わかりました。もう少し頑張ってみます。' }
        )
        // 契約更新の要求も抱えている場合、引き留めの直後に出る「要求を飲む」の脈絡を作る
        if (contractReq?.status === 'pending_gm') {
          const effDemand = effectiveDemandSalary(contractReq)
          append(stillWantsRenewalLine(fmtYen(effDemand), contractReq.demandYears))
        }
        dismissRetirementRequest(player.id)
      }},
    ] : null

    const buildTransferButtons = (): ReplyBtns | null => transferReq ? [
      { label: '移籍を認める', color: C.orange, action: () => {
        // 選んだ返答を自分（GM）の吹き出しとして必ず残す（会話が一方通行に見える問題の修正）
        append(
          { from: 'gm', kind: 'transfer_granted', text: 'わかりました。あなたのキャリアを尊重します。移籍を認めましょう。' },
          { from: 'player', kind: 'transfer_thanks', text: 'ありがとうございます。移籍先を探します。' },
        )
        allowPlayerTransfer(player.id)
      }},
      { label: '残ってほしい', color: C.blue, action: () => {
        // 他クラブに心が傾いている選手は「わかりました」と言わず、最初から正直に断る（以後は本人の決断待ち）
        if (courtedAway) {
          append(
            stayPleaLine(),
            { from: 'player', kind: 'courted_no_promise', text: `すみません…実は${freeContactClub ?? '他クラブ'}から誘いを受けていて、移籍を前向きに考えています。お約束はできません。` }
          )
          dismissTransferRequest(player.id)
          refuseFreeContactRetention(player.id)
          return
        }
        append(
          stayPleaLine(),
          { from: 'player', kind: 'wait_and_see', text: 'わかりました。もう少し様子を見てみます。' }
        )
        // 同じ選手が契約更新の要求も抱えている場合、残留の返事だけだと
        // 次に出る「要求を飲む」ボタンの脈絡が無くなるため、ここで要求を言わせる
        if (contractReq?.status === 'pending_gm') {
          const effDemand = effectiveDemandSalary(contractReq)
          append(stillWantsRenewalLine(fmtYen(effDemand), contractReq.demandYears))
        }
        dismissTransferRequest(player.id)
      }},
    ] : null

    // 海外挑戦の直訴：認める（夢を応援）／引き留める（モラール低下・2回目は大）
    const buildOverseasButtons = (): ReplyBtns | null => overseasReq ? [
      { label: `海外挑戦を認める（${dreamLabelOf(overseasReq.region)}）`, color: C.purple ?? C.purple, action: () => {
        append(
          { from: 'gm', kind: 'overseas_granted', text: 'わかりました。あなたの走りはもう世界レベルです。夢を応援します。良いオファーを待ちましょう。' },
          // 次に開いて作り直したときと同じ発言にする（kind が同じなので二重に並ばない）
          overseasApprovedLine(overseasReq.region),
        )
        approveOverseasChallenge(player.id)
      }},
      { label: '今季は残ってくれ', color: C.blue, action: () => {
        const cnt = (player.overseasDeniedCount ?? 0) + 1
        append(
          { from: 'gm', kind: 'overseas_denied', text: 'まだチームにあなたの力が必要です。今季は残ってください。' },
          { from: 'player', kind: 'overseas_denied_reply', text: cnt >= 2
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
      // 出場率は「そのクラブが走っている日程」で数える1本（utils/playRate）。
      // 決断のときと同じ数字でないと、画面の予告と結果が食い違う
      const { teamRaces: fcRaces, fraction: fcFrac } = playRateOf(player.id, player.teamId, currentSeason, teams, foreignLeagues, prevSeasonOf(pastSeasons, currentSeason.year))
      // 行き先は store の destinationOf 1本（決断のときに使われるものと同じ）
      return freeContactConsent(player, destinationOf(freeContact.fromTeamId, player), tierOfPlayerClub(player.teamId, allTieredClubs(teams, foreignLeagues)), fcFrac, fcRaces)
    })()

    const buildContractButtons = (): ReplyBtns | null => {
      if (!contractReq) return null
      // 売ると返事をして行き先待ちの選手には、契約の話の返事を出さない。
      // 札を作る側（canOfferRenewal）は止めていたが、**先に出ていた札のボタン**が残っていた
      if (isSaleAnswerPending(player, talkCtx)) return null
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
            agreeTermsLine(fmtYen(contractReq.counterSalary ?? 0), contractReq.counterYears),
            thanksLine()
          )
          acceptContractCounter(contractReq.id)
        }},
        ...(canRedo ? [{ label: '再交渉する', color: C.gold, action: () => {
          append(reconsiderLine())
          reNegotiateContract(contractReq.id)
          openCompose()
        }}] : []),
      ]
      if (contractReq.status === 'pending_gm') {
        // 要求額はラウンドごとに3%ずつ上がる（エンジン側と同じ式）。古い額を出すと「飲んだのに拒否」される
        const effDemand = effectiveDemandSalary(contractReq)
        return [
          { label: `要求を飲む（${fmtYen(effDemand)}/${contractReq.demandYears}年）`, color: C.green, action: () => {
            append({ from: 'gm', kind: 'demand_accepted', text: `了解です。年俸${fmtYen(effDemand)}、${contractReq.demandYears}年で承諾します。` })
            submitContractRenewalOffer(contractReq.id, effDemand, contractReq.demandYears, contractReq.offerContractType ?? player.contract.contractType ?? 'standard', undefined)
            const updated = (useGameStore.getState().currentSeason.contractRequests ?? []).find(r => r.id === contractReq.id)
            if (updated?.status === 'accepted') {
              append(thanksLine())
            } else {
              // フリー移籍の接触中で本人が移籍に傾いている場合、要求どおりでも断られる。条件の問題ではないことを伝える
              const courted = (useGameStore.getState().currentSeason.incomingOffers ?? []).some(o => o.playerId === player.id && o.offeredPrice === 0 && o.retentionRefused)
              append({ from: 'player', kind: 'demand_rejected', text: courted
                ? 'すみません…実は他クラブから誘いを受けていて、移籍を前向きに考えています。条件の問題ではないんです。'
                : '申し訳ありませんが、その条件では受け入れられません。' })
            }
          }},
          { label: 'カウンターオファーを出す', color: C.blue, action: openCompose },
          { label: '移籍を認める', color: C.orange, action: () => {
            append(
              { from: 'gm', kind: 'renewal_declined', text: '今回は契約更新を見送り、移籍を認めます。' },
              { from: 'player', kind: 'renewal_declined_ok', text: 'わかりました。新しいクラブを探します。' }
            )
            allowPlayerTransfer(player.id)
          }},
        ]
      }
      return null
    }

    // ★用件が2つ以上たまっているときは、**古い方から順に**返事をする。
    //   以前は新しい方から出していたので、あとから来た話に先に答えることになり、
    //   会話の並び（上が古い）と、下に出るボタンの相手が食い違っていた。
    //   メッセージが見つからない用件（idx = -1）は最後に回す＝元の優先順のまま
    const topicOrder = [
      { present: undecided, idx: undecided ? lastIdx(m => m.kind === 'stay_or_leave') : -1, build: buildStayOrLeaveButtons },
      // 用件キーは相手ごとに分かれる（incoming_offer:xxx）ので前方一致で拾う
      { present: !!incomingOffer, idx: incomingOffer ? lastIdx(m => !!m.kind?.startsWith('incoming_offer')) : -1, build: buildIncomingOfferButtons },
      { present: !!incomingLoan, idx: incomingLoan ? lastIdx(m => !!m.kind?.startsWith('incoming_loan')) : -1, build: buildIncomingLoanButtons },
      { present: !!retirementReq, idx: retirementReq ? lastIdx(m => m.text.includes('引退を考えて')) : -1, build: buildRetirementButtons },
      { present: !!transferReq, idx: transferReq ? lastIdx(m => m.text.includes('移籍を考えて')) : -1, build: buildTransferButtons },
      { present: !!overseasReq, idx: overseasReq ? lastIdx(m => m.text.includes('海外挑戦を認めて')) : -1, build: buildOverseasButtons },
      { present: !!contractReq && contractReq.status !== 'accepted', idx: contractReq ? lastIdx(m => m.text.includes('契約について') || m.text.includes('契約の件')) : -1, build: buildContractButtons },
    ].filter(t => t.present).sort((a, b) => (a.idx < 0 ? 1 : 0) - (b.idx < 0 ? 1 : 0) || a.idx - b.idx)
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
      {/* 移籍先の選択。本人の希望順に並び、先頭が本命。乗り気でない先は印を出す */}
      <ActionSheet
        open={pickingDest}
        onClose={() => setPickingDest(false)}
        header={<div style={{ fontSize: F.bodyLg, fontWeight: 800, color: C.text }}>{player.name}の移籍先を選ぶ</div>}
        items={rankedOffers.map((r, i) => ({
          label: `${i === 0 ? '★ ' : ''}${nameOfClub(r.offer.fromTeamId)}  ${fmtYen(r.offer.offeredPrice)}  ${r.appraisal.reason}`,
          color: r.appraisal.ok ? C.green : C.textDim,
          onClick: () => acceptOffer(r.offer),
        }))}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton onClick={onClose} />
        <div {...longPress(player.id)} style={{ width: 36, height: 36,overflow: 'hidden', border: `2px solid ${alpha(specCol, 0.4)}`, flexShrink: 0, cursor: 'pointer' }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: F.sub, fontWeight: 800, color: C.text }}>{player.name}</div>
          {/* 無所属の選手に契約の残りを出さない。誰とも結んでいない契約の残り月数が
              「残1年2ヶ月」と出ていた（前のクラブとの契約が消えずに残っているだけ）。
              年俸は交渉の目安として要るので、前のクラブでの額だと分かる形で出す */}
          <div style={{ fontSize: F.caption, color: C.textDim }}>
            {player.teamId === ''
              ? `${player.age}歳 · 無所属 · 前年俸${fmtYen(player.contract.annualSalary)}`
              : `${player.age}歳 · ${fmtYen(player.contract.annualSalary)} · 残${fmtDuration(months)}`}
          </div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: ratingColor(playerOvr) }}>{playerOvr}</div>
      </div>

      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((msg, i) => {
          const sp = speakerOf(msg)
          return (
          <div key={i} style={{ display: 'flex', flexDirection: msg.from === 'player' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
            {msg.from === 'player' && (
              sp.club
                // 相手クラブからの話は、そのクラブのロゴ。タップでクラブの詳細へ
                ? <div onClick={() => goClubPage(sp.club)}
                    style={{ width: 32, height: 32,overflow: 'hidden', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, border: `1.5px solid ${alpha(C.blue, 0.4)}` }}>
                    <TeamLogoSVG primary={sp.club.colors.primary} secondary={sp.club.colors.secondary} shortName={sp.club.shortName} teamId={sp.club.id} logoId={sp.club.logoId} size={26} />
                  </div>
                : <div {...longPress(player.id)} style={{ width: 32, height: 32,overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${alpha(specCol, 0.35)}`, cursor: 'pointer' }}>
                    <PlayerFace playerId={player.id} nationality={player.nationality} size={32} />
                  </div>
            )}
            <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: msg.from === 'player' ? 'flex-start' : 'flex-end', gap: 3 }}>
              {/* 差出人の名前（LINEのように吹き出しの上）。代理人は名前を出さない */}
              {msg.from === 'player' && sp.name && (
                <span
                  onClick={sp.club ? () => goClubPage(sp.club) : undefined}
                  style={{ fontSize: F.caption, color: sp.club ? C.blue : C.textDim, fontWeight: 700, padding: '0 2px', cursor: sp.club ? 'pointer' : 'default' }}
                >
                  {sp.name}{sp.club ? ' ▸' : ''}
                </span>
              )}
              <div style={{
                padding: '10px 13px',
                background: msg.from === 'player'
                  ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})`
                  : `linear-gradient(135deg, ${alpha(C.blue, 0.25)}, ${alpha(C.blue, 0.15)})`,
                border: `1px solid ${msg.from === 'player' ? C.border : alpha(C.blue, 0.35)}`,
                fontSize: F.bodyLg,
                color: C.text,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
              }}>
                {sp.text}
              </div>
            </div>
          </div>
        )})}

        {chatMessages.length === 0 && (
          <div style={{ textAlign: 'center', color: C.textGhost, fontSize: F.body, marginTop: 40 }}>
            特に連絡はありません
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg, position: 'sticky', bottom: 0 }}>
        {composing && composeMode === 'counterFee' ? (
          // 買い取り打診への逆提示は「移籍金」だけを決める（年俸・年数は相手クラブが決めること）
          <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: F.caption, color: C.textDim }}>{rankedOffers.length > 1 ? `提示する移籍金（${rankedOffers.length}クラブ一斉）` : '提示する移籍金'}</div>
            <div style={{ padding: '4px 0 8px' }}>
              <NumberDial value={offerFee} onChange={v => setOfferFee(Math.max(1_000_000, v))} min={1_000_000} accent={C.gold} />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={handleSubmitCounterFee}
                style={{ flex: 2, padding: '10px',background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})`, backdropFilter: 'blur(10px) saturate(118%)', WebkitBackdropFilter: 'blur(10px) saturate(118%)', border: `1px solid ${alpha(C.gold, 0.65)}`, color: C.gold, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)', fontSize: F.bodyLg, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                この金額で提示
              </button>
              <button onClick={() => setComposing(false)}
                style={{ flex: 1, padding: '10px',border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: F.body, cursor: 'pointer', fontFamily: 'inherit' }}>
                キャンセル
              </button>
            </div>
          </div>
        ) : composing ? (
          <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: F.caption, color: C.textDim }}>提示年俸</div>
            <div style={{ padding: '4px 0 8px' }}>
              <NumberDial value={offerSalary} onChange={v => setOfferSalary(Math.max(SALARY_DIAL_MIN, Math.min(NEGOTIATION_SALARY_MAX, v)))} min={SALARY_DIAL_MIN} max={NEGOTIATION_SALARY_MAX} accent={C.blue} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: F.caption, color: C.textDim, flexShrink: 0 }}>年数</span>
              {[1, 2, 3, 4].map(y => (
                <button key={y} onClick={() => setOfferYears(y)}
                  style={{ flex: 1, padding: '5px',border: 'none', cursor: 'pointer', backgroundColor: offerYears === y ? C.blue : C.surface, color: offerYears === y ? '#fff' : C.textDim, fontSize: F.label, fontWeight: 800, fontFamily: 'inherit' }}>
                  {y}年
                </button>
              ))}
            </div>
            {/* 契約形態（本契約/2way/育成）の選択UIは廃止。枠は人数の上限1本だけ */}
            {/* 役割選択UIは非表示（役割は裏で自動保持）。offerTeamRole は未指定のまま提示される */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={composeMode === 'transfer' ? handleSubmitTransferOffer : composeMode === 'acq' ? handleSubmitAcqOffer : handleSubmitOffer}
                style={{ flex: 2, padding: '10px',border: 'none', backgroundColor: C.blue, color: '#fff', fontSize: F.bodyLg, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit' }}>
                提示する
              </button>
              <button onClick={() => setComposing(false)}
                style={{ flex: 1, padding: '10px',border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: F.body, cursor: 'pointer', fontFamily: 'inherit' }}>
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 16px 16px' }}>
            {replyButtons.map((btn, i) => (
              <button key={i} onClick={btn.action} disabled={btn.disabled}
                style={{ width: '100%', padding: '10px 12px',border: `1.5px solid ${alpha(btn.color, btn.disabled ? 0.2 : 0.5)}`, backgroundColor: alpha(btn.color, btn.disabled ? 0.04 : 0.1), color: btn.disabled ? C.textGhost : btn.color, fontSize: F.bodyLg, fontWeight: 700, cursor: btn.disabled ? 'default' : 'pointer', fontFamily: 'inherit', lineHeight: 1.4 }}>
                {btn.label}{btn.disabled ? '（枠が満杯）' : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
