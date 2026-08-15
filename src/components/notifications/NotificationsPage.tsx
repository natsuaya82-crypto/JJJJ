import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { panelStyle } from '../ui/Panel'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { ovr, calcTransferValue, ratingColor, racesConsumed } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { collectNotifications, expiredNegText, chatReplyLine } from '../../utils/notifItems'
import { audio } from '../../utils/audio'
import { Btn } from '../ui'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { TeamLogoSVG } from '../icons/Icons'
import NumberDial from '../ui/NumberDial'
import type { TransferBid, Player } from '../../types'
import { ROSTER_MAX } from '../../data/rosterRules'
import { feeRatingOf } from '../../data/economy'
import TrainingCardSVG from '../training/TrainingCardSVG'
import { CARD_NAMES, RARITY_LABELS } from '../../utils/cardCombo'
import { useClubGifts, dropClubGift } from '../../lib/useClubGifts'
import { claimClubGift } from '../../lib/clubsApi'
import { stashGifts, peekGifts, clearGifts } from '../../lib/giftInbox'

const EMPTY_IDS: string[] = []

function SectionHead({ label, color, count }: { label: string; color: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 20px 8px' }}>
      <div style={{ width: '3px', height: '16px',background: color, flexShrink: 0 }}/>
      <span style={{ fontFamily: SAIRA, fontSize: F.label, fontWeight: '800', color, letterSpacing: '3px' }}>{label}</span>
      <span style={{ fontFamily: SAIRA, fontSize: F.caption, fontWeight: '800', padding: '1px 7px',background: alpha(color, 0.2), color }}>{count}</span>
    </div>
  )
}

function FaceOvr({ playerId, nationality, pOvr, accentColor }: {
  playerId: string; nationality: string; pOvr: number; accentColor: string
}) {
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <div style={{ width: '42px', height: '42px',overflow: 'hidden', border: `1px solid ${alpha(accentColor, 0.35)}` }}>
        <PlayerFace playerId={playerId} nationality={nationality as import('../../types').Nationality} size={42} />
      </div>
      <div style={{ position: 'absolute', bottom: -1, right: -1, background: 'rgba(0,0,0,0.88)', padding: '0 3px',fontFamily: SAIRA, fontSize: F.caption, fontWeight: '900', color: ratingColor(pOvr), lineHeight: '14px' }}>
        {pOvr}
      </div>
    </div>
  )
}

// --- 移籍金の交渉 ---

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
  const counterFeeRating = feeRatingOf(counterRatio)
  const counterRating = counterFeeRating === 'fair' ? { label: '適正', color: C.green } : counterFeeRating === 'soft' ? { label: 'やや高', color: C.orange } : { label: '高値', color: C.red }
  const [dialOpen, setDialOpen] = useState(false)
  const [dialFee, setDialFee] = useState(counterFee || bid.offeredFee)

  return (
    <div style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
      <div style={inset}/>
      <div style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <FaceOvr playerId={player.id} nationality={player.nationality} pOvr={pOvr} accentColor={C.green} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{player.name}</div>
            {/* 競り上げのときは「誰にいくらで抜かれたか」を出す。
                クラブが値を吊り上げてきたのか、他クラブに抜かれたのかで打つ手が違う */}
            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: bid.outbidBy ? C.orange : C.textSub, marginTop: '2px' }}>
              {bid.outbidBy ? `${bid.outbidBy}に競り上げられています` : `${targetTeamName} へ移籍打診中`}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', padding: '8px 12px',background: alpha(counterRating.color, 0.07), border: `1px solid ${alpha(counterRating.color, 0.2)}` }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>提示額</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '900', color: C.text }}>{fmtYen(bid.offeredFee)}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke={C.textGhost} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>{bid.outbidBy ? '勝つのに必要' : '先方希望'}</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '900', color: counterRating.color }}>{fmtYen(counterFee)}</div>
          </div>
          <span style={{ fontFamily: SAIRA, fontSize: F.label, fontWeight: '700', color: counterRating.color, padding: '2px 7px',background: alpha(counterRating.color, 0.15), marginLeft: 4 }}>{counterRating.label}</span>
        </div>

        {!dialOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Btn variant="primary" color={C.green} style={{ width: '100%'}} onClick={onAccept}>{fmtYen(counterFee)}で合意する</Btn>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDialFee(counterFee || bid.offeredFee); setDialOpen(true) }}
                style={{ flex: 1, padding: '11px',border: `1.5px solid ${alpha(C.gold, 0.45)}`, backgroundColor: alpha(C.gold, 0.08), color: C.gold, fontSize: F.bodyLg, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>金額を提示する</button>
              <button onClick={onGiveUp}
                style={{ flex: 1, padding: '11px',border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: F.bodyLg, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>あきらめる</button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>提示する移籍金</div>
            <NumberDial value={dialFee} onChange={v => setDialFee(Math.max(1_000_000, v))} min={1_000_000} accent={C.green} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="primary" color={C.green} style={{ flex: 1}} onClick={() => onReoffer(dialFee)}>この額で再提示</Btn>
              <button onClick={() => setDialOpen(false)}
                style={{ flex: 1, padding: '11px',border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: F.bodyLg, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>戻る</button>
            </div>
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
  const clubIndex = useClubIndex()
  const acceptFeeCounter = useGameStore(s => s.acceptFeeCounter)
  const rejectTransferBid = useGameStore(s => s.rejectTransferBid)
  const submitTransferBid = useGameStore(s => s.submitTransferBid)
  const seenJoinIds = useGameStore(s => s.seenJoinIds) ?? []
  const dismissJoinNotice = useGameStore(s => s.dismissJoinNotice)
  const longPress = usePlayerLongPress()
  const pendingGifts = useGameStore(s => s.pendingGifts) ?? []
  const claimGift = useGameStore(s => s.claimGift)

  const [claimedGift, setClaimedGift] = useState<(typeof pendingGifts)[number] | null>(null)

  // 走友会のなかまから届いたカード
  const addTrainingCards = useGameStore(s => s.addTrainingCards)
  const clubGifts = useClubGifts()
  const [claiming, setClaiming] = useState('')
  const onClaimClubGift = async (id: string) => {
    setClaiming(id)
    try {
      const got = await claimClubGift(id)
      if (got) {
        stashGifts([...peekGifts(), got])
        addTrainingCards([got])
        audio.playSe('reward')
        setTimeout(clearGifts, 2000)
      }
      dropClubGift(id)
    } catch { /* 通信できないときは何もしない。次に開いたときにまた出る */ }
    finally { setClaiming('') }
  }

  // 通知の中身は utils/notifItems.ts で数える。ベルの数字（useNotifCount）と同じ関数を
  // 使うので、片方だけ直して件数がズレることがない
  // ※セレクタで `?? []` すると毎回新しい配列になり無限レンダリングするので、フィールドをそのまま取る
  const seenInjuryIdsRaw = useGameStore(s => s.seenInjuryIds)
  const {
    incomingOfferPlayers,
    stayOrLeave, freeContacts, freeTransferNotices, departureNotices,
    retirementRequests, transferReqs, overseasReqs, counteredBids, feeAcceptedBids,
    sponsorOffers, tradeOffers, chatReplies, joinNotices,
    renewalPlayers, rosterOver, signingBanned, injuredPlayers,
    loginUnclaimed, expiredNegotiations, loanResponses,
    injuryKey, total,
  } = collectNotifications({
    currentSeason, players, teams, playerTeamId, lastLoginDate,
    seenJoinIds,
    seenInjuryIds: seenInjuryIdsRaw ?? EMPTY_IDS,
    pendingGiftsCount: pendingGifts.length,
    clubGiftsCount: clubGifts.length,
  })
  const renewalNeeded = renewalPlayers.length
  // 「交渉中で応対待ち」の人数。まとめカードの一行に出す
  const renewalWaiting = renewalPlayers.filter(r => r.req).length
  const myRosterCount = players.filter(p => p.teamId === playerTeamId && p.status === 'active').length
  const myTeamFinance = teams.find(t => t.id === playerTeamId)?.finance

  // 通知から用件を片付けるための操作
  const dismissFreeTransferNotice = useGameStore(s => s.dismissFreeTransferNotice)
  const markFreeContactSeen = useGameStore(s => s.markFreeContactSeen)
  const dismissDepartureNotice = useGameStore(s => s.dismissDepartureNotice)
  const acceptTradeOffer = useGameStore(s => s.acceptTradeOffer)
  const rejectTradeOffer = useGameStore(s => s.rejectTradeOffer)
  const dismissInjuryNotice = useGameStore(s => s.dismissInjuryNotice)
  const dismissExpiredNegotiation = useGameStore(s => s.dismissExpiredNegotiation)
  const dismissLoanResponse = useGameStore(s => s.dismissLoanResponse)

  const cardStyle = (borderColor: string, _shadowColor: string): React.CSSProperties => ({
    ...panelStyle(borderColor),
    marginBottom: '8px',
  })

  const inset: React.CSSProperties = {
    position: 'absolute', inset: 4, border: '1px solid rgba(255,255,255,0.06)',pointerEvents: 'none',
  }

  return (
    <div style={{ minHeight: '100%', fontFamily: SAIRA }}>

      <div style={{ borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.bg, zIndex: 10 }}>
        <PageHeader title="通知" right={total > 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: F.body, fontWeight: '800', padding: '3px 10px', background: C.red, color: '#fff' }}>{total}件</div>
        ) : undefined} />
      </div>

      {total === 0 ? (
        <div style={{ padding: '80px 20px', textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: F.sub }}>通知なし</div>
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
                          <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '900', color: C.gold }}>{gift.title}</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.textSub, lineHeight: 1.6, marginBottom: '10px' }}>{gift.message}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: F.label, fontWeight: '700', color: C.gold, marginBottom: '12px', padding: '6px 10px',background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.25)}` }}>{gift.jewels ? `ジュエル${gift.jewels}個` : `カード${gift.cards.length}枚`}</div>
                      <Btn variant="primary" style={{ width: '100%' }} onClick={() => { audio.playSe('reward'); setClaimedGift(gift); claimGift(gift.id) }}>受け取る</Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 走友会のなかまから届いたカード */}
          {clubGifts.length > 0 && (
            <section style={{ marginTop: pendingGifts.length > 0 ? '20px' : 0 }}>
              <SectionHead label="走友会からのカード" color={C.green} count={clubGifts.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {clubGifts.map(g => (
                  <div key={g.id} style={cardStyle(alpha(C.green, 0.6), '#14432a')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                        <TrainingCardSVG statKey={g.card.statKey} rarity={g.card.rarity} width={44}/>
                        <div style={{ flex: 1, minWidth: 0, fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: '800', color: C.text, lineHeight: 1.6 }}>
                          {g.fromName}から{RARITY_LABELS[g.card.rarity]}の{CARD_NAMES[g.card.statKey]}のカードが届きました！
                        </div>
                      </div>
                      <Btn
                        variant="primary"
                        disabled={claiming === g.id}
                        color={C.green} style={{ width: '100%'}}
                        onClick={() => { void onClaimClubGift(g.id) }}
                      >
                        {claiming === g.id ? '受け取り中…' : '受け取る'}
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 加入（全経路：FA/移籍/レンタル/トレード/ドラフト） */}
          {joinNotices.length > 0 && (
            <section style={{ marginTop: (pendingGifts.length > 0 || clubGifts.length > 0) ? '20px' : 0 }}>
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
                            <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '800', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.cyan, fontWeight: '700', marginTop: '2px' }}>
                              {isLoan ? `レンタルで${yrs}シーズン加入しました` : 'チームに加入しました'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginBottom: '12px' }}>ロスター画面で確認できます。</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Btn variant="primary" color={C.cyan} style={{ flex: 1}} onClick={() => { dismissJoinNotice(key); navigate('/team/roster') }}>ロスターで確認</Btn>
                          <button onClick={() => dismissJoinNotice(key)} style={{ flex: 'none', padding: '11px 16px',border: `1.5px solid ${alpha(C.textSub, 0.4)}`, backgroundColor: alpha(C.textSub, 0.06), color: C.textSub, fontSize: F.bodyLg, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>確認</button>
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
                    <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: '800', color: C.text, marginBottom: 6 }}>
                      本日のログインボーナスが未受取です
                    </div>
                    <Btn variant="primary" color={C.cyan} style={{ width: '100%'}} onClick={() => navigate('/login-bonus')}>受け取る</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 他クラブからの買い取り打診。**返事は選手ごとに1回**なので、
              5クラブが1人を取り合っていてもカードは1枚（数え方は utils/notifItems）。
              返事そのものはチャットでするので、ここは「来ている」を知らせて連れて行くだけ */}
          {incomingOfferPlayers.length > 0 && (
            <section>
              <SectionHead label="買い取り打診" color={C.cyan} count={incomingOfferPlayers.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {incomingOfferPlayers.map(({ playerId, offers }) => {
                  const p = players.find(x => x.id === playerId)
                  if (!p) return null
                  const best = offers.reduce((a, b) => (b.offeredPrice > a.offeredPrice ? b : a))
                  const from = teams.find(t => t.id === best.fromTeamId)
                  return (
                    <div key={playerId} style={cardStyle(alpha(C.cyan, 0.45), '#0a2a3a')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={ovr(p)} accentColor={C.cyan} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: '700', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textSub }}>
                              {from ? from.name : '他クラブ'} ほか{offers.length > 1 ? ` 計${offers.length}クラブ` : ''} / 最高 {fmtYen(best.offeredPrice)}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          {/* ★**必ず ?player= を付ける。** 付けないとチャットの一覧（契約更新のタブ）に
                              着くだけで、その選手の会話が開かない＝「押しても飛ばない」に見える。
                              45c5a6b で一度直したのに、2f70214 でこの節を足したとき素の
                              `/team/chat` に戻っていた。 */}
                          <Btn variant="primary" style={{ flex: 1 }} onClick={() => navigate(`/team/chat?player=${playerId}`)}>チャットで返事</Btn>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* CPUからのトレード打診 */}
          {tradeOffers.length > 0 && (
            <section>
              <SectionHead label="トレード打診" color={C.orange} count={tradeOffers.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {tradeOffers.map(o => {
                  const fromTeam = teams.find(t => t.id === o.fromTeamId)
                  const getP = players.find(p => p.id === o.offeredPlayerIds[0])
                  const giveP = players.find(p => p.id === o.requestedPlayerIds[0])
                  if (!fromTeam || !getP || !giveP) return null
                  return (
                    <div key={o.id} style={cardStyle(alpha(C.orange, 0.45), '#5a2800')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                          <TeamLogoSVG primary={fromTeam.colors.primary} secondary={fromTeam.colors.secondary} shortName={fromTeam.shortName} teamId={fromTeam.id} size={20}/>
                          <span style={{ fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: '800', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fromTeam.name}</span>
                          <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: F.caption, fontWeight: '700', color: C.orange, flexShrink: 0 }}>1対1交換</span>
                        </div>
                        {[
                          { p: getP, tag: '獲得', col: C.green },
                          { p: giveP, tag: '放出', col: C.red },
                        ].map(({ p, tag, col }) => (
                          <div key={p.id} {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 8px',background: alpha(col, 0.06), border: `1px solid ${alpha(col, 0.2)}`, marginBottom: '6px', cursor: 'pointer' }}>
                            <span style={{ fontFamily: SAIRA, fontSize: F.caption, fontWeight: '900', color: col, width: '26px', flexShrink: 0 }}>{tag}</span>
                            <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={ovr(p)} accentColor={col} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: '700', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                              <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textSub }}>{p.age}歳 / 価値 {fmtYen(calcTransferValue(p))}</div>
                            </div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <Btn variant="primary" color={C.green} style={{ flex: 1}} onClick={() => acceptTradeOffer(o.id)}>承諾する</Btn>
                          <Btn style={{ flex: 1 }} onClick={() => rejectTradeOffer(o.id)}>断る</Btn>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 契約更新。**1人1枚にしない**（オーナー・2026-08-14「◯人ってまとめてたのに
              なんで全員出てくるようになったの」→「まとめ」）。人数だけ出して、
              交渉はチャットの一覧でまとめて片づける。
              ★「まだ話していない（満了間近）」と「交渉中で応対待ち」は1つの節のまま。
                別々の節にして数え方も違っていたので、チャットを開いた瞬間にベルの数字が
                勝手に減っていた（0cf1feb）。 */}
          {renewalNeeded > 0 && (
            <section>
              <SectionHead label="契約更新" color={C.orange} count={renewalNeeded}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.orange, 0.45), '#5a3500')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    {/* ★形は**他のカードと同じ**（左に顔・中央に見出しと補足・右に状態）。
                        ここだけ別の組み方をしないこと（オーナー・2026-08-14
                        「他のやつと同じような見た目にしろよ」）。**違うのは
                        名前のところが人数になることだけ。** */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                      {/* ★顔は**1つだけ**。この画面のカードは全部「顔1つ＋中央＋右」で、
                          2つ以上並べているものは1枚も無い。まとめだからと顔を並べると
                          ここだけ別物になる（オーナー・2026-08-14「カード2枚なら別やつ
                          他のカードでやってねえだろ」）。 */}
                      <FaceOvr playerId={renewalPlayers[0].p.id} nationality={renewalPlayers[0].p.nationality}
                        pOvr={ovr(renewalPlayers[0].p)} accentColor={C.orange} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{renewalNeeded}人</div>
                        <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.textSub, marginTop: '2px' }}>今季で満了</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: '900', color: renewalWaiting > 0 ? C.gold : C.red }}>
                          {renewalWaiting > 0 ? `交渉中 ${renewalWaiting}` : '未交渉'}
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: renewalWaiting > 0 ? C.gold : C.red }}>
                          {renewalWaiting > 0 ? 'あなたの返事待ちです' : '早急に更新を'}
                        </div>
                      </div>
                    </div>
                    <Btn variant="primary" color={C.orange} style={{ width: '100%' }} onClick={() => navigate('/team/chat')}>契約を交渉する</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}


          {/* 負傷者情報（負傷名・全治・復帰までのレース数） */}
          {injuredPlayers.length > 0 && (
            <section>
              <SectionHead label="負傷者情報" color={C.red} count={injuredPlayers.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {injuredPlayers.map(p => {
                  const pOvr = ovr(p)
                  const left = p.injuredUntilRace != null ? Math.max(0, p.injuredUntilRace - racesConsumed(currentSeason)) : null
                  return (
                    <div key={p.id} style={cardStyle(alpha(C.red, 0.45), '#5a1010')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={pOvr} accentColor={C.red} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.red, marginTop: '2px' }}>
                              {p.injuryName ?? '負傷'}で離脱中
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: '900', color: C.red }}>{left != null ? `あと${left}戦` : '離脱中'}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>で復帰</div>
                          </div>
                        </div>
                        <Btn variant="ghost" style={{ width: '100%', marginTop: '10px' }} onClick={() => dismissInjuryNotice(injuryKey(p))}>OK</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* 補強禁止の警告（赤字ペナルティ中） */}
          {signingBanned && (
            <section>
              <SectionHead label="補強禁止" color={C.red} count={1}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.red, 0.45), '#5a1010')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>赤字が解消するまで補強できません</div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.red, marginBottom: '8px' }}>
                      理由: {(myTeamFinance?.budget ?? 0) < 0 ? '予算残高がマイナスです。' : `${myTeamFinance?.deficitStreak ?? 0}シーズン連続で期末残高がマイナスです。`}
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginBottom: '10px', lineHeight: 1.7 }}>
                      <div>・禁止されるもの: FA・移籍金での獲得・引き抜き・レンタル・海外獲得</div>
                      <div>・引き続き可能: ドラフト指名・契約更新・選手の売却／放出</div>
                      <div style={{ color: C.orange }}>・3シーズン連続赤字が続く間は、<b>毎年ドラフトの最上位指名権が強制売却</b>されます</div>
                      <div style={{ color: C.textSub, marginTop: 4 }}>
                        解除条件: <b>単年の営業収支</b>（繰越・移籍金を含まない今季単体の収支）を黒字にし、かつ残高をプラスに戻すこと。
                        判定に使っている金額と、黒字化に必要な額は財務画面に表示されています。
                      </div>
                    </div>
                    <Btn variant="primary" color={C.red} style={{ width: '100%'}} onClick={() => navigate('/budget')}>財務を確認する</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ロスター超過警告（旧セーブ救済・強制解雇なし。整理を促すだけ） */}
          {rosterOver > 0 && (
            <section>
              <SectionHead label="ロスター超過" color={C.red} count={1}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.red, 0.45), '#5a1010')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>ロスターが上限を超えています（{myRosterCount}/{ROSTER_MAX}）</div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.red, marginBottom: '14px' }}>{rosterOver}名分オーバーしています。放出して{ROSTER_MAX}人以下に整理してください（超過中は新規補強ができません）</div>
                    <Btn variant="primary" color={C.red} style={{ width: '100%'}} onClick={() => navigate('/team/roster')}>ロスターを整理する</Btn>
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
                            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.textSub, marginTop: '2px' }}>{p.age}歳 · 通算{p.career.totalRaces}レース</div>
                          </div>
                        </div>
                        {/* 引退の承認/引き留めはチャットで行う（選手ページには承認ボタンが無い） */}
                        <Btn variant="primary" color={C.blue} style={{ width: '100%'}} onClick={() => navigate(`/team/chat?player=${req.playerId}`)}>チャットで対応する</Btn>
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
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>{transferReqs.length}人が移籍を希望</div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.orange, marginBottom: '14px' }}>チャットで対応してください</div>
                    <Btn variant="primary" color={C.orange} style={{ width: '100%'}} onClick={() => navigate('/team/chat')}>チャットへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 海外挑戦希望。チャットには返事のボタンが出るのに、ここにもベルにも出ていなかった */}
          {overseasReqs.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length > 0 || transferReqs.length > 0) ? '20px' : 0 }}>
              <SectionHead label="海外挑戦希望" color={C.blue} count={overseasReqs.length}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.blue, 0.45), '#0d2f5a')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>{overseasReqs.length}人が海外挑戦を希望</div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.blue, marginBottom: '14px' }}>チャットで対応してください</div>
                    <Btn variant="primary" color={C.blue} style={{ width: '100%'}} onClick={() => navigate('/team/chat')}>チャットへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* チャットで返事を待っているもの（獲得オファーの逆提示・トレードの逆提示・レンタルの申し込み）。
              チャットには返事のボタンが出ているのに、ベルにも通知ページにも出ていなかった。
              種類ごとに節を分けると数え方がまた枝分かれするので、1つの節でまとめて出す */}
          {chatReplies.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length > 0 || transferReqs.length > 0 || overseasReqs.length > 0) ? '20px' : 0 }}>
              <SectionHead label="返事待ち" color={C.cyan} count={chatReplies.length}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.cyan, 0.45), '#0a3a4a')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>{chatReplies.length}件があなたの返事待ち</div>
                    {/* カードは1枚にまとめて出すので、何が待っているかは**文で**伝える。
                        文面は utils/notifItems の chatReplyLine 1本（画面に直書きしないこと）。
                        「3件があなたの返事待ち」だけだと、それがレンタルの話なのか
                        獲得の話なのか分からなかった */}
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.cyan, marginBottom: '14px' }}>{chatReplyLine(chatReplies)}</div>
                    <Btn variant="primary" color={C.cyan} style={{ width: '100%'}} onClick={() => navigate('/team/chat')}>チャットへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 移籍金交渉 */}
          {counteredBids.length > 0 && (
            <section style={{ marginTop: (retirementRequests.length > 0 || transferReqs.length > 0 || overseasReqs.length > 0 || chatReplies.length > 0) ? '20px' : 0 }}>
              <SectionHead label="移籍金交渉" color={C.green} count={counteredBids.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {counteredBids.map(bid => {
                  const p = players.find(pl => pl.id === bid.playerId)
                  // 海外クラブへの入札もあるため、国内チーム→海外クラブの順で名前を解決する
                  const targetTeamName = clubIndex.byId(bid.targetTeamId)?.name ?? '海外クラブ'
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
                  const targetTeamName = clubIndex.byId(bid.targetTeamId)?.name ?? '海外クラブ'
                  if (!p) return null
                  return (
                    <div key={bid.id} style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                          <FaceOvr playerId={p.id} nationality={p.nationality} pOvr={ovr(p)} accentColor={C.green} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{p.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.green, fontWeight: '700', marginTop: '2px' }}>{targetTeamName} が移籍金 {fmtYen(bid.offeredFee)} に合意</div>
                          </div>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginBottom: '12px' }}>次は選手本人と年俸・役割を交渉します。</div>
                        <Btn variant="primary" color={C.green} style={{ width: '100%'}} onClick={() => navigate(`/team/chat?player=${bid.playerId}`)}>選手と契約交渉へ</Btn>
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
                  const clubName = clubIndex.byId(o.fromTeamId)?.shortName ?? '他クラブ'
                  const decidesIn = Math.max(1, o.expiresAtRace - racesConsumed(currentSeason))
                  return (
                    <button key={o.id} onClick={() => { navigate(`/team/chat?player=${target.id}`); markFreeContactSeen(o.id) }} style={{ ...cardStyle(alpha(C.orange, 0.4), '#5a2800'), width: '100%', textAlign: 'left', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FaceOvr playerId={target.id} nationality={target.nationality} pOvr={ovr(target)} accentColor={C.orange} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '700', color: C.text }}>{clubName}が{target.name}と接触中</div>
                          <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: '2px', lineHeight: 1.6 }}>
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
                          <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '700', color: C.text }}>
                            {n.reason === 'loan'
                              ? `${n.playerName}が${n.toTeamName}へレンタルされました`
                              : n.reason === 'transfer'
                              ? `${n.playerName}が${n.toTeamName}へ移籍しました`
                              : `${n.playerName}が契約満了で退団しました`}
                          </div>
                          <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: '2px' }}>
                            {n.reason === 'loan'
                              ? `${n.years ?? 1}シーズンのレンタルで貸出`
                              : n.reason === 'transfer'
                              ? (n.fee != null ? `移籍金${fmtYen(n.fee)}での移籍` : '移籍が成立しました')
                              : 'FAとなり移籍先を探しています'}
                          </div>
                        </div>
                      </div>
                      <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: F.body }} onClick={() => dismissDepartureNotice(n.id)}>確認</Btn>
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
                {freeTransferNotices.map(n => {
                  const ftP = players.find(pl => pl.id === n.playerId)
                  return (
                  <div key={n.id} style={cardStyle(alpha(n.left ? C.red : C.green, 0.45), n.left ? '#3d0000' : '#0d3d22')}>
                    <div style={inset}/>
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                      {ftP && <FaceOvr playerId={ftP.id} nationality={ftP.nationality} pOvr={ovr(ftP)} accentColor={n.left ? C.red : C.green} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '700', color: C.text }}>
                          {n.left ? `${n.playerName}が${n.toTeamName}へのフリー移籍を決めました` : `${n.playerName}は残留を選びました`}
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: '2px' }}>
                          {n.left ? '契約満了に伴う本人の決断です（移籍金なし）' : `${n.toTeamName}の勧誘を断りました`}
                        </div>
                      </div>
                      <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: F.body }} onClick={() => dismissFreeTransferNotice(n.id)}>確認</Btn>
                    </div>
                  </div>
                  )
                })}
              </div>
            </section>
          )}

          {expiredNegotiations.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="交渉期限切れ" color={C.red} count={expiredNegotiations.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {expiredNegotiations.map(neg => {
                  // 名前だけでは誰か分からないので、顔・OVR・所属チーム（ロゴ+フルネーム）を出す（費用合意通知と同じ見た目）
                  const negP = players.find(pl => pl.id === neg.playerId)
                  const negTeam = negP ? clubIndex.byId(negP.teamId) : undefined
                  // 文言は種類から出す。ここで種類ごとに節を分けない
                  const negText = expiredNegText(neg.kind)
                  return (
                    <div key={neg.id} style={cardStyle(alpha(C.red, 0.45), '#3d0000')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          {negP && <FaceOvr playerId={negP.id} nationality={negP.nationality} pOvr={ovr(negP)} accentColor={C.red} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '700', color: C.text }}>{negText.title(neg.playerName)}</div>
                            {negTeam && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', minWidth: 0 }}>
                                <TeamLogoSVG primary={negTeam.colors.primary} secondary={negTeam.colors.secondary} shortName={negTeam.shortName} teamId={negTeam.id} size={14}/>
                                <span style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{negTeam.name}</span>
                              </div>
                            )}
                            <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textDim, marginTop: '2px' }}>{neg.detail ?? negText.note}</div>
                          </div>
                          <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: F.body }} onClick={() => dismissExpiredNegotiation(neg.id)}>確認</Btn>
                        </div>
                      </div>
                    </div>
                  )
                })}
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
                  const loanP = players.find(pl => pl.id === resp.playerId)
                  return (
                    <div key={resp.id} style={cardStyle(alpha(accent, 0.45), shadow)}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        {loanP && <FaceOvr playerId={loanP.id} nationality={loanP.nationality} pOvr={ovr(loanP)} accentColor={accent} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: '700', color: C.text }}>
                            {resp.accepted
                              ? `${resp.ownerShort}が${resp.playerName}のレンタルを承諾`
                              : `${resp.ownerShort}が${resp.playerName}のレンタルを却下`}
                          </div>
                          <div style={{ fontFamily: SAIRA, fontSize: F.label, color: accent, marginTop: '2px' }}>
                            {resp.accepted ? `${resp.years}年で加入しました` : '要請は受け入れられませんでした'}
                          </div>
                        </div>
                        <Btn variant="ghost" style={{ flexShrink: 0, padding: '6px 14px', fontSize: F.body }} onClick={() => dismissLoanResponse(resp.id)}>確認</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* スポンサーオファー */}
          {sponsorOffers.length > 0 && (
            <section style={{ marginTop: '20px' }}>
              <SectionHead label="スポンサーオファー" color={C.green} count={1}/>
              <div style={{ padding: '0 16px' }}>
                <div style={cardStyle(alpha(C.green, 0.45), '#0d3d22')}>
                  <div style={inset}/>
                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text, marginBottom: '4px' }}>{sponsorOffers.length}社からスポンサーオファー</div>
                    <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.green, marginBottom: '14px' }}>契約内容を確認してください</div>
                    <Btn variant="primary" color={C.green} style={{ width: '100%'}} onClick={() => navigate('/sponsors')}>スポンサーページへ</Btn>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* 移籍オファー */}
          {/* 行き先が決まらなかった退団予定の選手。FAで出すか残留させるかの返事待ち */}
          {stayOrLeave.length > 0 && (
            <section style={{ marginTop: 20 }}>
              <SectionHead label="去就未定" color={C.orange} count={stayOrLeave.length}/>
              <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stayOrLeave.map(x => {
                  const target = players.find(p => p.id === x.playerId)
                  if (!target) return null
                  return (
                    <div key={x.playerId} style={cardStyle(alpha(C.orange, 0.45), '#5a2800')}>
                      <div style={inset}/>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <FaceOvr playerId={target.id} nationality={target.nationality} pOvr={ovr(target)} accentColor={C.orange} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '700', color: C.text }}>{target.name}</div>
                            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.textSub, marginTop: '2px' }}>移籍先が決まりませんでした</div>
                          </div>
                        </div>
                        <div style={{ fontSize: F.label, color: C.textDim, marginBottom: '12px', lineHeight: 1.6 }}>
                          このまま残すか、契約を解除してFAにするかを決めてください。残しても移籍希望は続きます。
                        </div>
                        <Btn variant="primary" style={{ width: '100%' }} onClick={() => navigate(`/team/chat?player=${target.id}`)}>チャットで対応する</Btn>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ★買い取りの打診は通知に出さない（2026-08-12・オーナー判断「受信箱はいいけど通知に来なければいい」）。
              1レースに1〜2件しか来ないのに打診は5レース残るので、通知に出すと常時8〜11件が並び続けていた。
              返事は**移籍ページ**（「他クラブからのオファー N件 — 要確認」）と**チャット**でできるので、
              ここから外しても詰まらない。utils/notifItems の total からも外してある
              （ベルの数字と通知ページの枚数は必ず一致させる、という決まり） */}

        </div>
      )}

      {/* 受け取りました ポップ */}
      {claimedGift && createPortal((
        <div onClick={() => setClaimedGift(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
          <div style={{ ...panelStyle(C.gold), padding: 28, maxWidth: 320, width: '100%', textAlign: 'center', boxShadow: `inset 0 1px 0 rgba(255,255,255,0.10), 0 10px 40px ${alpha(C.gold, 0.25)}` }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.body, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>GIFT</div>
            <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, color: C.gold, marginBottom: 12, textShadow: `0 0 20px ${alpha(C.gold, 0.6)}` }}>受け取りました！</div>
            <div style={{ fontSize: F.bodyLg, color: C.textSub, marginBottom: 6 }}>{claimedGift.title}</div>
            <div style={{ fontSize: F.body, color: C.textDim, marginBottom: 18 }}>{claimedGift.jewels ? `ジュエル${claimedGift.jewels}個を手に入れた` : `カード${claimedGift.cards.length}枚を手に入れた`}</div>
            <button onClick={() => setClaimedGift(null)} style={{ width: '100%', padding: 13, background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})`, backdropFilter: 'blur(10px) saturate(118%)', WebkitBackdropFilter: 'blur(10px) saturate(118%)', border: `1px solid ${alpha(C.gold, 0.65)}`, color: C.gold, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)', fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}
