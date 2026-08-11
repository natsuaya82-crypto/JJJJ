import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import PlayerFace from '../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, calcTransferValue, racesConsumed } from '../../utils/playerUtils'
import { useOfferResults } from '../transfer/useOfferResults'
import { OfferResultList } from '../transfer/OfferResultList'
import { offersByPlayer, offersAwaitingReply } from '../../utils/notifItems'
import { settledPath } from '../../utils/talkSync'
import { contractTalkCtx, contractMonthsLeft, liveContractOf, needsRenewalAttention } from '../../utils/contractTalk'
import type { ContractTalkCtx } from '../../utils/contractTalk'
import type { AcquisitionOffer, Player } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { fmtYen } from '../../utils/money'
import { SpecChip } from '../player/PlayerChips'
import { ChatView } from './chat/ChatView'
import { TradeChatView } from './chat/TradeChatView'
import { OfferChatRow } from './chat/Cards'
import { fmtDuration } from '../../utils/chatFormat'





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


// --- Main Page ---

export default function ChatPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  // 買い取り・レンタルの打診への返事は ChatView（会話）が持つ。一覧はタップして開くだけ
  const { players, playerTeamId, currentSeason, teams, generateContractRequests,
    openPlayerSheet, setChatLog } = useGameStore()
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
  // 状態も見た目も transfer/OfferResultList の1本（移籍画面・オファー一覧と同じもの）。
  // ここに残るのはオファー一覧など他画面から飛んできた結果だけで、チャットでの返事の結果は会話に出る
  const { results: offerResults, dismiss: dismissOfferResult } = useOfferResults()

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
  const mineHere = (pid: string) => players.some(p => p.id === pid && p.teamId === playerTeamId)
  // 返事が要る買い取り打診は offersAwaitingReply 1本（ベル・移籍ページと同じ判定）。
  // 「譲ります」と返事済みの選手はここに出ない
  const buyOffers = offersAwaitingReply(currentSeason).filter(o => mineHere(o.playerId))
  // フリー移籍の接触はGMが返事をする話ではない情報通知。引き留めを断られたぶんは対応済み
  const freeContactOffers = (currentSeason.incomingOffers ?? []).filter(o =>
    o.offeredPrice === 0 && mineHere(o.playerId) && !o.retentionRefused)
  const incomingLoanOffers = currentSeason.incomingLoanOffers ?? []
  // 数えるのは用件の数＝選手の数。5クラブが1人を取り合っても返事は1回（ベルと同じ数え方）
  const inboundCount = offersByPlayer(buyOffers).length
    + offersByPlayer(freeContactOffers).length
    + incomingLoanOffers.length

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
              <SpecChip specialty={player.specialty} size="sm" />
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
            {freeContactOffers.map(o => {
              // フリー移籍の接触：GMは対応できず、本人が数戦後に決断する（情報表示のみ）
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              const decidesIn = Math.max(1, o.expiresAtRace - racesConsumed(currentSeason))
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
            {/* 買い取り・レンタルの打診も会話で返事をする（承諾・逆提示・拒否はチャットの返信ボタン）。
                以前はここに 承諾／カウンター／拒否 のボタンを直接置いていて、この画面の中だけ
                「会話で答える用件」と「ボタンで答える用件」が混ざっていた */}
            {/* 取り合いになっていても行は選手ごとに1つ。返事をするのは1回で、会話も1本。
                数え方は utils/notifItems.ts の offersByPlayer 1本（ベルの数字と揃える） */}
            {offersByPlayer(buyOffers).map(g => {
              const p = players.find(pl => pl.id === g.playerId)
              if (!p) return null
              const n = g.offers.length
              const top = [...g.offers].sort((a, b) => b.offeredPrice - a.offeredPrice)[0]
              return <OfferChatRow key={g.playerId} player={p} accent={C.gold}
                badge={g.offers.some(o => o.fromForeign) ? '海外' : undefined}
                title={n > 1 ? `${n}クラブが${p.name}の獲得を打診` : `${teamName(top.fromTeamId)}が${p.name}の獲得を打診`}
                sub={n > 1
                  ? `最高 ${fmtYen(top.offeredPrice)} — タップして返事をする`
                  : `移籍金 ${fmtYen(top.offeredPrice)} — タップして返事をする`}
                onOpen={() => setChatPlayerId(p.id)} />
            })}
            {incomingLoanOffers.map(o => {
              const p = players.find(pl => pl.id === o.playerId)
              if (!p) return null
              return <OfferChatRow key={o.id} player={p} accent={C.purple ?? '#A855F7'} badge="レンタル"
                title={`${teamName(o.fromTeamId)}が${p.name}のレンタルを打診`}
                sub={`${o.years}年${o.direction === 'lend_out' ? '貸し出し' : '借り入れ'} — タップして返事をする`}
                onOpen={() => setChatPlayerId(p.id)} />
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
