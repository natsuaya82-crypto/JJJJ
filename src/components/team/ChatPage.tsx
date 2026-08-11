import { useState, useEffect, useRef } from 'react'
import { comparePlayers } from '../../utils/playerSort'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import PlayerFace from '../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR, faMarketSalary, calcTransferValue, playerConsentToMove, racesConsumed } from '../../utils/playerUtils'
// トレードの釣り合いの判断はストアと同じ1箇所（utils/tradeValue.ts）を通す
import { tradeValues, keyFactor, tradeBalance, TRADE_MIN_RATIO, TRADE_OK_RATIO, TRADE_HARD_NO_RATIO } from '../../utils/tradeValue'
import { useOfferResults } from '../transfer/useOfferResults'
import { OfferResultList } from '../transfer/OfferResultList'
import { canBePoached, canTradeAway, eligibilityCtx } from '../../utils/transferEligibility'
import { offersByPlayer, offersAwaitingReply } from '../../utils/notifItems'
import { settledPath } from '../../utils/talkSync'
import { contractTalkCtx, contractMonthsLeft, liveContractOf, needsRenewalAttention } from '../../utils/contractTalk'
import type { ContractTalkCtx } from '../../utils/contractTalk'
import type { AcquisitionOffer, Player, Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { pickKeyValue } from '../../data/economy'
import { C, alpha, SAIRA } from '../../styles/tokens'
import { tierOfPlayerClub, allTieredClubs } from '../../utils/clubTier'
import { fmtYen } from '../../utils/money'
import { SpecChip } from '../player/PlayerChips'
import { ChatView } from './chat/ChatView'
import { fmtDuration } from '../../utils/chatFormat'




// --- 他チーム（所属選手を表示し、選手を選ぶと契約オファー＝交渉を開始） ---

function TradeChatView({ team, onClose, initialGetId }: { team: Team; onClose: () => void; initialGetId?: string; initialMode?: 'fee' | 'trade'; onNegotiateContract?: (playerId: string) => void }) {
  const { players, teams, playerTeamId, currentSeason, pastSeasons, proposeTrade, acceptTradeCounter, dismissTradeNegotiation, destinationOf } = useGameStore()
  const foreignLeagues = useGameStore(s => s.foreignLeagues)
  // 選べる＝動かせる、になるように候補は成立判定と同じものを使う（utils/transferEligibility.ts）。
  // 以前は相手側を素通しにしていたので、相手が他クラブから借りている選手が「もらう」候補に並び、
  // 選ぶと「いいだろう、その条件で成立だ」と言われるのに選手は動かなかった
  // 判定に渡す材料はシーズンから1本で作る（utils/transferEligibility の eligibilityCtx）。
  // 手書きしていたので「譲ります」と返事をした選手がトレードの候補に残っていた
  const tradeCtxT = eligibilityCtx(currentSeason, playerTeamId)
  const theirPlayers = players.filter(p => canBePoached(p, { teamId: team.id, currentYear: currentSeason.year })).sort(comparePlayers('ovr'))
  const myPlayersT = players.filter(p => canTradeAway(p, tradeCtxT)).sort(comparePlayers('ovr'))
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
    const consentBonus = ratio >= 1.2 ? 0.15 : 0
    let blockMsg = ''
    for (const rp of getPlayers) {
      // 行き先は store の destinationOf 1本（トレード成立時に使われるものと同じ）
      const consent = playerConsentToMove(rp, destinationOf(playerTeamId, rp), tierOfPlayerClub(rp.teamId, allTieredClubs(teams, foreignLeagues)), 0.5, 0, consentBonus)
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
          <SpecChip specialty={player.specialty} size="sm" />
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
// 相手クラブから来た打診の1行。返事は会話（ChatView）でするので、ここはタップして開くだけ。
function OfferChatRow({ player, accent, badge, title, sub, onOpen }: {
  player: Player; accent: string; badge?: string; title: string; sub: string; onOpen: () => void
}) {
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(accent, 0.4)}`, padding: '10px 12px', marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(accent, 0.4)}` }}>
          <PlayerFace playerId={player.id} nationality={player.nationality} size={40} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            {badge && <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 5, background: alpha(accent, 0.18), color: accent, flexShrink: 0 }}>{badge}</span>}
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(player)) }}>{ovr(player)}</span>
      </div>
    </button>
  )
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
