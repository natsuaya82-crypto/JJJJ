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
import NumberDial from '../ui/NumberDial'
import type { IncomingOffer, TransferBid, Player } from '../../types'
import { ROSTER_MAX } from '../../data/rosterRules'

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

// 移籍金交渉カード：クラブとの移籍金のやり取りを通知内で完結させる。
// ①提示額で合意 ②こちらの金額をダイアルで再提示 ③あきらめる
function FeeCounterCard({ bid, player, targetTeamName, cardStyle, inset, onAccept, onReoffer, onGiveUp }: {
  bid: TransferBid
  player: Player
  targetTeamName: string
  cardStyle: (borderColor: string, shadowColor: string) => React.CSSProperties
  inset: React.CSSProperties
  onAccept: () => void
  onReoffer: (fee: number) => void
  onGiveUp: () => void
}) {
  const pOvr = ovr(player)
  const mv = calcTransferValue(player)
  const counterFee = bid.counterFee ?? 0
  const counterRatio = counterFee ? counterFee / mv : 0
  const counterRating = counterRatio >= 0.95 ? { label: '適正', color: C.green } : counterRatio >= 0.75 ? { label: 'やや高', color: C.orange } : { label: '高値', color: C.red }
  const [dialOpen, setDialOpen] = useState(false)
  const [dialFee, setDialFee] = useState(counterFee || bid.offeredFee)

  return (
    <div style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
      <div style={inset}/>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <FaceOvr playerId={player.id} nationality={player.nationality} pOvr={pOvr} accentColor={C.green} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{player.name}</div>
            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{targetTeamName} へ移籍打診中</div>
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
            <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: counterRating.color }}>{fmtYen(counterFee)}</div>
          </div>
          <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: counterRating.color, padding: '2px 7px', borderRadius: '6px', background: alpha(counterRating.color, 0.15), marginLeft: 4 }}>{counterRating.label}</span>
        </div>

        {!dialOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: C.bg }} onClick={onAccept}>{fmtYen(counterFee)}で合意する</Btn>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDialFee(counterFee || bid.offeredFee); setDialOpen(true) }}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1.5px solid ${alpha(C.gold, 0.45)}`, backgroundColor: alpha(C.gold, 0.08), color: C.gold, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>金額を提示する</button>
              <button onClick={onGiveUp}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>あきらめる</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>提示する移籍金</div>
            <NumberDial value={dialFee} onChange={v => setDialFee(Math.max(1_000_000, v))} min={1_000_000} accent={C.green} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" style={{ flex: 1, background: `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: C.bg }} onClick={() => onReoffer(dialFee)}>この額で再提示</Btn>
              <button onClick={() => setDialOpen(false)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>戻る</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

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
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  // 海外クラブからのオファーもあるため、国内チーム→海外クラブの順で名前を解決する
  const fromTeam = teams.find(t => t.id === offer.fromTeamId)
  const fromForeignClub = fromTeam ? null : foreignLeagues.flatMap(l => l.clubs).find(c => c.id === offer.fromTeamId)
  const fromName = fromTeam?.shortName ?? fromForeignClub?.shortName ?? '他クラブ'
  const player = players.find(p => p.id === offer.playerId)
  const pOvr = player ? ovr(player) : 0
  // 移籍金0＝契約満了間近の選手へのフリー移籍オファー
  const isFree = offer.offeredPrice === 0
  const priceLabel = isFree ? 'フリー移籍（移籍金なし）' : fmtYen(offer.offeredPrice)

  const defaultMsgs: OfferChatMsg[] = player ? [
    { from: 'team', text: isFree
      ? `${player.name}選手の獲得に興味があります。契約満了が近いとのことですので、移籍金なしのフリー移籍でお願いできませんか。`
      : `${player.name}選手の獲得に興味があります。移籍金${fmtYen(offer.offeredPrice)}でいかがでしょうか。` }
  ] : []

  const [chatMessages, setChatMessages] = useState<OfferChatMsg[]>(initialMessages ?? defaultMsgs)
  const [composing, setComposing] = useState(false)
  // フリー移籍オファーへのカウンターは市場価値ベースで初期化（0×1.2=0を出さない）
  const counterBase = offer.offeredPrice > 0 ? offer.offeredPrice : (player ? calcTransferValue(player) : 10_000_000)
  const [counterPrice, setCounterPrice] = useState(() => Math.max(TRANSFER_STEP, Math.round(counterBase * 1.2 / TRANSFER_STEP) * TRANSFER_STEP))
  const [done, setDone] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'instant' }) }, [chatMessages])
  useEffect(() => { onMessagesChange(chatMessages) }, [chatMessages])

  const append = (...msgs: OfferChatMsg[]) => setChatMessages(prev => [...prev, ...msgs])

  const handleAccept = () => {
    const ok = acceptIncomingOffer(offer.id)
    if (ok) {
      append(
        { from: 'gm', text: isFree ? '了解です。フリー移籍を承諾します。' : `了解です。${fmtYen(offer.offeredPrice)}で売却します。` },
        { from: 'team', text: '契約成立です。ありがとうございます。' }
      )
    } else {
      append({ from: 'team', text: '申し訳ありません、状況が変わったためこの交渉は無効になりました。' })
    }
    setDone(true)
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
    append({ from: 'gm', text: `${fmtYen(counterPrice)}であれば売却可能です。いかがでしょうか。` })
    const result = counterIncomingOffer(offer.id, counterPrice)
    if (result === 'sold') {
      append({ from: 'team', text: `合意しました。${fmtYen(counterPrice)}での移籍を進めましょう。` })
    } else if (result === 'refused') {
      append({ from: 'team', text: `申し訳ありませんが、${fmtYen(counterPrice)}は当クラブには支払えません。今回の交渉は終了とします。` })
    } else {
      append({ from: 'team', text: '申し訳ありません、状況が変わったためこの交渉は無効になりました。' })
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
          <div style={{ fontSize: 10, color: C.textDim }}>{fromName} からのオファー · {priceLabel}</div>
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(pOvr) }}>{pOvr}</div>
      </div>

      <div style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {chatMessages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: msg.from === 'team' ? 'row' : 'row-reverse', alignItems: 'flex-end', gap: 8 }}>
            {msg.from === 'team' && (
              <div style={{ width: 32, height: 32, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: C.surface3, border: `1.5px solid ${alpha(C.red, 0.35)}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 900, color: C.red }}>{fromName.slice(0, 3)}</span>
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
            <NumberDial value={counterPrice} onChange={v => setCounterPrice(Math.max(1_000_000, v))} min={1_000_000} accent={C.red} />
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
              { label: isFree ? 'フリー移籍を承諾する（移籍金なし）' : `売却する（${fmtYen(offer.offeredPrice)}）`, color: C.green, action: handleAccept },
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
  const { teams, players, currentSeason, playerTeamId, lastLoginDate } = useGameStore()
  const foreignLeaguesAll = useGameStore(s => s.foreignLeagues ?? [])
  const acceptFeeCounter = useGameStore(s => s.acceptFeeCounter)
  const rejectTransferBid = useGameStore(s => s.rejectTransferBid)
  const submitTransferBid = useGameStore(s => s.submitTransferBid)
  const seenJoinIds = useGameStore(s => s.seenJoinIds ?? [])
  const dismissJoinNotice = useGameStore(s => s.dismissJoinNotice)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const pendingGifts = useGameStore(s => s.pendingGifts ?? [])
  const claimGift = useGameStore(s => s.claimGift)

  const [chatOfferId, setChatOfferId] = useState<string | null>(null)
  const [offerMessageCache, setOfferMessageCache] = useState<Record<string, OfferChatMsg[]>>({})
  const [claimedGift, setClaimedGift] = useState<(typeof pendingGifts)[number] | null>(null)

  // フリー移籍の接触（offeredPrice=0）はGMが対応できない情報通知。金額付きオファーとは別扱い。
  // タップして対応済み（seenFreeContactIds）のものは通知から消える（接触自体は裏で進行）
  // ※件数と表示のズレ防止：選手が退団・引退した「幽霊通知」はここで除外する（表示側でnullにしても数だけ残るため）
  const incomingOffers = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice > 0 && players.some(p => p.id === o.playerId && p.teamId === playerTeamId && p.status === 'active'))
  const seenFreeContactIds = currentSeason.seenFreeContactIds ?? []
  const freeContacts = (currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0 && !seenFreeContactIds.includes(o.id) && players.some(p => p.id === o.playerId && p.teamId === playerTeamId && p.status === 'active'))
  const freeTransferNotices = currentSeason.freeTransferNotices ?? []
  const dismissFreeTransferNotice = useGameStore(s => s.dismissFreeTransferNotice)
  const markFreeContactSeen = useGameStore(s => s.markFreeContactSeen)
  // シーズン切替時の退団通知（契約満了のFA流出・他クラブへの移籍）
  const departureNotices = currentSeason.departureNotices ?? []
  const dismissDepartureNotice = useGameStore(s => s.dismissDepartureNotice)
  const retirementRequests = (currentSeason.retirementRequests ?? []).filter(r => players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active'))
  // 移籍希望を出した後に退団・売却された選手の「幽霊リクエスト」は数えない
  const transferReqs = (currentSeason.transferRequests ?? []).filter(r => players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active'))
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered' && players.some(p => p.id === b.playerId))
  const feeAcceptedBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'fee_accepted' && players.some(p => p.id === b.playerId))
  // フリー移籍で接触中の選手の契約要求は出さない（接触カードに一本化。用件の二重表示を防ぐ）
  const contactedPlayerIds = new Set((currentSeason.incomingOffers ?? []).filter(o => o.offeredPrice === 0).map(o => o.playerId))
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r => r.status === 'pending_gm' && !contactedPlayerIds.has(r.playerId) && players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active'))
  const sponsorOffers = currentSeason.sponsorOffers ?? []

  // 加入通知（全経路：FA/移籍/レンタル/トレード/ドラフト）。今季加入(joinedYear===今季)かつ未確認の選手。
  const joinNotices = players
    .filter(p => p.teamId === playerTeamId && p.joinedYear === currentSeason.year)
    .map(p => ({ p, key: `${p.id}-${p.joinedYear}` }))
    .filter(x => !seenJoinIds.includes(x.key))

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
    .filter(({ p, months }) => months < 6 && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id) && !contactedPlayerIds.has(p.id))
    .sort((a, b) => a.months - b.months)
  const renewalNeeded = renewalPlayers.length

  // ロスター超過警告：自チームがロスター上限を超えている場合（旧セーブ救済）。強制解雇はせず整理を促すだけ
  const myRosterCount = players.filter(p => p.teamId === playerTeamId && p.status === 'active').length
  const rosterOver = Math.max(0, myRosterCount - ROSTER_MAX)

  const loginUnclaimed = lastLoginDate !== loginTodayKey()

  const expiredNegotiations = currentSeason.expiredNegotiations ?? []
  const dismissExpiredNegotiation = useGameStore(s => s.dismissExpiredNegotiation)

  const loanResponses = currentSeason.loanResponses ?? []
  const dismissLoanResponse = useGameStore(s => s.dismissLoanResponse)

  const total = incomingOffers.length
    + retirementRequests.length + transferReqs.length + counteredBids.length + feeAcceptedBids.length + pendingContracts.length
    + (renewalNeeded > 0 ? 1 : 0)
    + (rosterOver > 0 ? 1 : 0)
    + (loginUnclaimed ? 1 : 0)
    + (sponsorOffers.length > 0 ? 1 : 0)
    + pendingGifts.length
    + joinNotices.length
    + expiredNegotiations.length
    + loanResponses.length
    + freeContacts.length
    + freeTransferNotices.length
    + departureNotices.length

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

  // 対応（承諾・拒否・カウンター）するとオファーはストアから即消えるため、
  // 消えた後も返事メッセージを見せられるようスナップショットで保持する
  const liveOffer = chatOfferId ? incomingOffers.find(o => o.id === chatOfferId) : null
  const offerSnapshotRef = useRef<IncomingOffer | null>(null)
  if (liveOffer) offerSnapshotRef.current = liveOffer
  const chatOffer = chatOfferId ? (liveOffer ?? offerSnapshotRef.current) : null

  if (chatOffer) return (
    <OfferChatView
      offer={chatOffer}
      onClose={() => { setChatOfferId(null); offerSnapshotRef.current = null }}
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
                      <div style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '700', color: C.gold, marginBottom: '12px', padding: '6px 10px', borderRadius: '8px', background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.25)}` }}>{gift.jewels ? `ジュエル${gift.jewels}個` : `カード${gift.cards.length}枚`}</div>
                      <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, color: '#111' }} onClick={() => { audio.playSe('reward'); setClaimedGift(gift); claimGift(gift.id) }}>受け取る</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 加入（全経路：FA/移籍/レンタル/トレード/ドラフト） */}
          {joinNotices.length > 0 && (
            <section style={{ marginTop: pendingGifts.length > 0 ? '20px' : 0 }}>
              <SectionHead label="新加入" color={C.cyan} count={joinNotices.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {joinNotices.map(({ p, key }) => {
                  const isLoan = !!p.loan
                  const yrs = p.loan ? Math.max(1, p.loan.untilYear - currentSeason.year) : 0
                  return (
                    <div key={key} style={cardStyle(alpha(C.cyan, 0.45), '#0a2a3a')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={ovr(p)} accentColor={C.cyan} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '800', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.cyan, fontWeight: '700', marginTop: '2px' }}>
                              {isLoan ? `レンタルで${yrs}シーズン加入しました` : 'チームに加入しました'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginBottom: '12px' }}>ロスター画面で確認できます。</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Btn variant="primary" style={{ flex: 1, background: `linear-gradient(135deg, ${C.cyan}, #4fc3f7)`, color: C.bg }} onClick={() => { dismissJoinNotice(key); navigate('/team/roster') }}>ロスターで確認</Btn>
                          <button onClick={() => dismissJoinNotice(key)} style={{ flex: 'none', padding: '11px 16px', borderRadius: 10, border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>確認</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
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
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{p.age}歳</div>
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

          {/* ロスター超過警告（旧セーブ救済・強制解雇なし。整理を促すだけ） */}
          {rosterOver > 0 && (
            <section>
              <SectionHead label="ロスター超過" color={C.red} count={rosterOver}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.red, 0.45), '#5a1010')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text, marginBottom: '4px' }}>ロスターが上限を超えています（{myRosterCount}/{ROSTER_MAX}）</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.red, marginBottom: '14px' }}>{rosterOver}名分オーバーしています。放出して{ROSTER_MAX}人以下に整理してください（超過中は新規補強ができません）</div>
                    <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.red}, #FF6B6B)`, color: C.bg }} onClick={() => navigate('/team/roster')}>ロスターを整理する</Btn>
                  </div>
                </div>
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
                  // 海外クラブへの入札もあるため、国内チーム→海外クラブの順で名前を解決する
                  const targetTeamName = teams.find(t => t.id === bid.targetTeamId)?.name
                    ?? foreignLeaguesAll.flatMap(l => l.clubs).find(c => c.id === bid.targetTeamId)?.name ?? '海外クラブ'
                  if (!p) return null
                  return (
                    <FeeCounterCard
                      key={bid.id}
                      bid={bid}
                      player={p}
                      targetTeamName={targetTeamName}
                      cardStyle={cardStyle}
                      inset={inset}
                      onAccept={() => acceptFeeCounter(bid.id)}
                      onGiveUp={() => rejectTransferBid(bid.id)}
                      onReoffer={(fee) => { rejectTransferBid(bid.id); submitTransferBid(bid.playerId, fee) }}
                    />
                  )
                })}
              </div>
            </section>
          )}

          {/* 費用合意（移籍金OK→選手と契約交渉へ） */}
          {feeAcceptedBids.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length > 0 || transferReqs.length > 0 || counteredBids.length > 0) ? '20px' : 0 }}>
              <SectionHead label="費用合意" color={C.green} count={feeAcceptedBids.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {feeAcceptedBids.map(bid => {
                  const p = players.find(pl => pl.id === bid.playerId)
                  // 海外クラブへの入札もあるため、国内チーム→海外クラブの順で名前を解決する
                  const targetTeamName = teams.find(t => t.id === bid.targetTeamId)?.name
                    ?? foreignLeaguesAll.flatMap(l => l.clubs).find(c => c.id === bid.targetTeamId)?.name ?? '海外クラブ'
                  if (!p) return null
                  return (
                    <div key={bid.id} style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={ovr(p)} accentColor={C.green} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.green, fontWeight: '700', marginTop: '2px' }}>{targetTeamName} が移籍金 {fmtYen(bid.offeredFee)} に合意</div>
                          </div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginBottom: '12px' }}>次は選手本人と年俸・役割を交渉します。</div>
                        <Btn variant="primary" style={{ width: '100%', background: `linear-gradient(135deg, ${C.green}, #66BB6A)`, color: C.bg }} onClick={() => navigate(`/team/chat?player=${bid.playerId}`)}>選手と契約交渉へ</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 期限切れ交渉（移籍拒否） */}
          {/* フリー移籍：接触中（情報のみ・本人が数戦後に決断） */}
          {freeContacts.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="接触中" color={C.orange} count={freeContacts.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {freeContacts.map(o => {
                  const target = players.find(p => p.id === o.playerId)
                  if (!target) return null
                  const clubName = teams.find(t => t.id === o.fromTeamId)?.shortName ?? foreignLeaguesAll.flatMap(l => l.clubs).find(c => c.id === o.fromTeamId)?.shortName ?? '他クラブ'
                  const decidesIn = Math.max(1, o.expiresAtRace - (currentSeason.currentRaceIndex ?? 0))
                  return (
                    <button key={o.id} onClick={() => { navigate(`/team/chat?player=${target.id}`); markFreeContactSeen(o.id) }} style={{ ...cardStyle(alpha(C.orange, 0.4), '#5a2800'), width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaceOvr playerId={target.id} nationality={target.nationality} pOvr={ovr(target)} accentColor={C.orange} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '700', color: C.text }}>{clubName}が{target.name}と接触中</div>
                          <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '2px', lineHeight: 1.6 }}>
                            契約満了に伴うフリー移籍の勧誘です。本人が約{decidesIn}戦後に決断します。タップして契約更新の交渉へ（本人が移籍に傾いていると断られます）
                          </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: C.orange, flexShrink: 0 }}>
                          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                        </svg>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {/* 退団通知（シーズン切替時の契約満了・移籍） */}
          {departureNotices.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="退団" color={C.red} count={departureNotices.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {departureNotices.map(n => (
                  <div key={n.id} style={cardStyle(alpha(C.red, 0.45), '#3d0000')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                        <FaceOvr playerId={n.playerId} nationality={(players.find(p => p.id === n.playerId)?.nationality ?? 'JPN')} pOvr={(() => { const p = players.find(x => x.id === n.playerId); return p ? ovr(p) : 0 })()} accentColor={C.red} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '700', color: C.text }}>
                            {n.reason === 'loan'
                              ? `${n.playerName}が${n.toTeamName}へレンタルされました`
                              : n.reason === 'transfer'
                              ? `${n.playerName}が${n.toTeamName}へ移籍しました`
                              : `${n.playerName}が契約満了で退団しました`}
                          </div>
                          <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '2px' }}>
                            {n.reason === 'loan'
                              ? `${n.years ?? 1}シーズンのレンタルで貸出`
                              : n.reason === 'transfer'
                              ? (n.fee != null ? `移籍金${fmtYen(n.fee)}での移籍` : '移籍が成立しました')
                              : 'FAとなり移籍先を探しています'}
                          </div>
                        </div>
                      </div>
                      <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: '12px' }} onClick={() => dismissDepartureNotice(n.id)}>確認</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* フリー移籍：本人の決断結果 */}
          {freeTransferNotices.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="フリー移籍の決断" color={C.orange} count={freeTransferNotices.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {freeTransferNotices.map(n => (
                  <div key={n.id} style={cardStyle(alpha(n.left ? C.red : C.green, 0.45), n.left ? '#3d0000' : '#0d3d22')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '700', color: C.text }}>
                          {n.left ? `${n.playerName}が${n.toTeamName}へのフリー移籍を決めました` : `${n.playerName}は残留を選びました`}
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '2px' }}>
                          {n.left ? '契約満了に伴う本人の決断です（移籍金なし）' : `${n.toTeamName}の勧誘を断りました`}
                        </div>
                      </div>
                      <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: '12px' }} onClick={() => dismissFreeTransferNotice(n.id)}>確認</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {expiredNegotiations.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="交渉期限切れ" color={C.red} count={expiredNegotiations.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {expiredNegotiations.map(neg => (
                  <div key={neg.id} style={cardStyle(alpha(C.red, 0.45), '#3d0000')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '700', color: C.text }}>{neg.playerName}選手が移籍を拒否しました</div>
                        <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '2px' }}>来季まで交渉できません</div>
                      </div>
                      <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: '12px' }} onClick={() => dismissExpiredNegotiation(neg.id)}>確認</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* レンタル回答（承諾/却下） */}
          {loanResponses.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="レンタル回答" color={C.blue} count={loanResponses.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {loanResponses.map(resp => {
                  const accent = resp.accepted ? C.green : C.red
                  const shadow = resp.accepted ? '#0d3d22' : '#3d0000'
                  return (
                    <div key={resp.id} style={cardStyle(alpha(accent, 0.45), shadow)}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '700', color: C.text }}>
                            {resp.accepted
                              ? `${resp.ownerShort}が${resp.playerName}のレンタルを承諾`
                              : `${resp.ownerShort}が${resp.playerName}のレンタルを却下`}
                          </div>
                          <div style={{ fontFamily: SAIRA, fontSize: '11px', color: accent, marginTop: '2px' }}>
                            {resp.accepted ? `${resp.years}年で加入しました` : '要請は受け入れられませんでした'}
                          </div>
                        </div>
                        <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: '12px' }} onClick={() => dismissLoanResponse(resp.id)}>確認</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 契約交渉 */}
          {pendingContracts.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length + transferReqs.length + counteredBids.length + feeAcceptedBids.length) > 0 ? '20px' : 0 }}>
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
                  // 海外クラブからのオファーもあるため、国内チーム→海外クラブの順で名前を解決する
                  const fromTeam = teams.find(t => t.id === offer.fromTeamId)
                  const fromClubName = fromTeam?.shortName ?? foreignLeaguesAll.flatMap(l => l.clubs).find(c => c.id === offer.fromTeamId)?.shortName ?? '他クラブ'
                  const target = players.find(p => p.id === offer.playerId)
                  if (!target) return null
                  const pOvr = ovr(target)
                  const isFreeOffer = offer.offeredPrice === 0
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
                            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, marginTop: '2px' }}>{fromClubName} が{isFreeOffer ? 'フリー移籍での獲得' : '買取'}を希望</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontFamily: SAIRA, fontSize: isFreeOffer ? '13px' : '20px', fontWeight: '900', color: isFreeOffer ? C.textSub : C.green, textShadow: isFreeOffer ? 'none' : `0 0 8px ${alpha(C.green, 0.4)}` }}>{isFreeOffer ? '移籍金なし' : fmtYen(offer.offeredPrice)}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, marginTop: '1px' }}>期限 {expiresIn}戦</div>
                          </div>
                        </div>
                        {!isFreeOffer && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '7px 10px', borderRadius: '10px', background: alpha(mvRating.color, 0.08), border: `1px solid ${alpha(mvRating.color, 0.2)}` }}>
                          <span style={{ fontFamily: SAIRA, fontSize: '10px', fontWeight: '700', color: mvRating.color, padding: '2px 6px', borderRadius: '6px', background: alpha(mvRating.color, 0.15) }}>{mvRating.label}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textSub }}>市場価値 <span style={{ color: C.text, fontWeight: '700' }}>{fmtYen(mv)}</span></span>
                          <span style={{ fontFamily: SAIRA, fontSize: '11px', color: mvRating.color, marginLeft: 'auto', fontWeight: '700' }}>{Math.round(ratio * 100)}%</span>
                        </div>
                        )}
                        {isFreeOffer && (
                        <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '12px', lineHeight: 1.6 }}>
                          契約満了が近いため、移籍金なしでの獲得打診です。断っても契約が切れればFAで流出する可能性があります。
                        </div>
                        )}
                        <Btn variant="primary" style={{ width: '100%' }} onClick={() => setChatOfferId(offer.id)}>対応する</Btn>
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
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18 }}>{claimedGift.jewels ? `ジュエル${claimedGift.jewels}個を手に入れた` : `カード${claimedGift.cards.length}枚を手に入れた`}</div>
            <button onClick={() => setClaimedGift(null)} style={{ width: '100%', padding: 13, borderRadius: 12, background: `linear-gradient(135deg, ${C.gold}, #FFD54F)`, border: 'none', color: '#111', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
    </div>
  )
}
