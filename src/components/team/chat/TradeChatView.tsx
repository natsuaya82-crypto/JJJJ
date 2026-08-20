import { useState } from 'react'
import { comparePlayers } from '../../../utils/playerSort'
import BackButton from '../../ui/BackButton'
import { useGameStore } from '../../../store/gameStore'
import PlayerFace from '../../player/PlayerFace'
import { ovr, ratingColor, SPEC_COLOR } from '../../../utils/playerUtils'
// トレードの釣り合いの判断はストアと同じ1箇所（utils/tradeValue.ts）を通す
import { tradeValues, tradeBalance, TRADE_MIN_RATIO, TRADE_OK_RATIO, TRADE_HARD_NO_RATIO } from '../../../utils/tradeValue'
import { keyPlayerStatus } from '../../../utils/playerUtils'
import { canBePoached, canTradeAway, eligibilityCtx } from '../../../utils/transferEligibility'
import type { Player, Team } from '../../../types'
import { TeamLogoSVG } from '../../icons/Icons'
import { pickKeysValue } from '../../../data/economy'
import { C, alpha, SAIRA, F } from '../../../styles/tokens'
import { tradeConsentBonus, tradeRefuser } from '../../../engine/tradeConsent'
import { fmtYen } from '../../../utils/money'
import { SpecChip } from '../../player/PlayerChips'

// --- 他チーム（所属選手を表示し、選手を選ぶと契約オファー＝交渉を開始） ---

export function TradeChatView({ team, onClose, initialGetId }: { team: Team; onClose: () => void; initialGetId?: string; initialMode?: 'fee' | 'trade'; onNegotiateContract?: (playerId: string) => void }) {
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
      outExtra: pickKeysValue([...givePk]),
      inExtra: pickKeysValue([...getPk]) }
    const { cpuGain, cpuLoss, ratio } = tradeValues(tradeIn, tvCtx)
    const hasKey = getPlayers.some(p => keyPlayerStatus(p, tvCtx.currentSeason, tvCtx.pastSeasons) !== 'open')
    // 本人が断るかは engine/tradeConsent 1本（成立させる tradePlayer・打診の proposeTrade と同じ）。
    // 行き先も store の destinationOf 1本（トレード成立時に使われるものと同じ）
    const refuser = tradeRefuser(getPlayers, { myTeamId: playerTeamId, teams, foreignLeagues, destinationOf,
      currentSeason, pastSeasons, year: currentSeason.year }, tradeConsentBonus(ratio))
    const blockMsg = refuser?.reason ?? ''
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
      style={{ flex: 1, padding: '14px',cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.4, background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.04)})`, backdropFilter: 'blur(10px) saturate(118%)', WebkitBackdropFilter: 'blur(10px) saturate(118%)', border: `1px solid ${alpha(C.gold, 0.65)}`, color: C.gold, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)', fontSize: F.subLg, fontWeight: 900, fontFamily: SAIRA }}>
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
          <div style={{ fontSize: F.sub, fontWeight: 800, color: C.text }}>{team.name} とトレード</div>
          <div style={{ fontSize: F.caption, color: C.textDim }}>STEP {step}/3 · {stepTitle}</div>
        </div>
      </div>

      {/* STEP 1: 相手選手を選ぶ */}
      {step === 1 && (
        <div style={{ padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: F.label, color: C.textDim }}>{team.shortName}から<b style={{ color: C.green }}>貰う選手</b>を選択（複数可）</div>
          {theirPlayers.map(p => <TradeSelRow key={p.id} player={p} selected={getP.has(p.id)} color={C.green} onToggle={() => toggle(setGetP, p.id)} />)}
          {(team.draftPicks ?? []).length > 0 && (<>
            <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 6 }}>指名権</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {(team.draftPicks ?? []).map(pk => { const k = pickKey(pk); return <PickChip key={k} label={pickLabel(k)} selected={getPk.has(k)} color={C.green} onToggle={() => toggle(setGetPk, k)} /> })}
            </div>
          </>)}
        </div>
      )}

      {/* STEP 2: 自チーム選手を選ぶ */}
      {step === 2 && (
        <div style={{ padding: '10px 12px 4px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: F.label, color: C.textDim }}>自チームから<b style={{ color: C.red }}>出す選手</b>を選択（複数可）</div>
          {myPlayersT.map(p => <TradeSelRow key={p.id} player={p} selected={give.has(p.id)} color={C.red} onToggle={() => toggle(setGive, p.id)} />)}
          {(myTeam?.draftPicks ?? []).length > 0 && (<>
            <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 6 }}>指名権</div>
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
            <div style={{padding: '14px', textAlign: 'center', background: alpha(C.green, 0.12), border: `1.5px solid ${alpha(C.green, 0.5)}` }}>
              <div style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: 900, color: C.green, marginBottom: 4 }}>トレード成立！</div>
              <div style={{ fontSize: F.label, color: C.textSub, lineHeight: 1.6 }}>加入選手は2軍へ。契約体系は「移籍・獲得」タブの契約交渉で確定してください。</div>
              <button onClick={onClose} style={{ marginTop: 10, padding: '10px 20px',border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: F.bodyLg, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>閉じる</button>
            </div>
          )}
          {submitted && neg && (
            <div style={{padding: '10px 12px', background: alpha(neg.status === 'rejected' ? C.red : C.gold, 0.1), border: `1.5px solid ${alpha(neg.status === 'rejected' ? C.red : C.gold, 0.5)}` }}>
              <div style={{ fontSize: F.body, color: C.text, lineHeight: 1.6 }}>{neg.message}</div>
              {neg.status === 'countered' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => { acceptTradeCounter(neg.id) }} style={{ flex: 1, padding: 10,border: 'none', background: C.green, color: '#fff', fontSize: F.bodyLg, fontWeight: 800, cursor: 'pointer', fontFamily: SAIRA }}>条件を飲んで成立</button>
                  <button onClick={() => { dismissTradeNegotiation(neg.id); setSubmitted(false); setStep(1) }} style={{ padding: '10px 12px',border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: F.body, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>組み替え</button>
                </div>
              )}
              {neg.status === 'rejected' && (
                <>
                  {tradeOutlook.blockNote
                    ? <div style={{ fontSize: F.caption, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{tradeOutlook.blockNote}</div>
                    : tradeOutlook.shortage > 0 && <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>あと約{fmtYen(tradeOutlook.shortage)}相当が不足しています。出す選手か指名権を追加して再提案してください</div>}
                  <button onClick={() => { dismissTradeNegotiation(neg.id); setSubmitted(false); setStep(1) }} style={{ marginTop: 8, padding: '8px 14px',border: `1px solid ${C.border}`, background: 'transparent', color: C.textDim, fontSize: F.body, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA }}>組み替えて再提案</button>
                </>
              )}
              <div style={{ fontSize: F.tiny, color: C.textGhost, marginTop: 6, fontFamily: SAIRA }}>交渉 {neg.round}/3 回目</div>
            </div>
          )}

          <div style={{background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, padding: '12px 14px' }}>
            <div style={{ fontSize: F.label, fontWeight: 800, color: C.red, marginBottom: 6 }}>出す（自チーム）</div>
            {giveCount === 0
              ? <div style={{ fontSize: F.label, color: C.textGhost }}>なし</div>
              : <div style={{ fontSize: F.body, color: C.text, lineHeight: 1.7 }}>{[...[...give].map(nameOf), ...[...givePk].map(pickLabel)].join('・')}</div>}
            <div style={{ height: 1, background: C.border, margin: '10px 0' }} />
            <div style={{ fontSize: F.label, fontWeight: 800, color: C.green, marginBottom: 6 }}>貰う（{team.shortName}）</div>
            <div style={{ fontSize: F.body, color: C.text, lineHeight: 1.7 }}>{[...[...getP].map(nameOf), ...[...getPk].map(pickLabel)].join('・')}</div>
          </div>

          {!submitted && giveCount > 0 && getCount > 0 && (() => {
            const { rate, shortage, blockMsg, hasKey, isFinal } = tradeOutlook
            const barColor = rate >= 70 ? C.green : rate >= 30 ? C.gold : C.red
            const filled = Math.round(rate / 10)
            return (
              <div style={{background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border2}`, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: F.caption, color: C.textDim, fontFamily: SAIRA, flexShrink: 0 }}>成功率</span>
                  <div style={{ display: 'flex', gap: 3, flex: 1 }}>
                    {Array.from({ length: 10 }).map((_, i) => (
                      <div key={i} style={{ flex: 1, height: 6,background: i < filled ? barColor : C.border2 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: F.bodyLg, fontWeight: 900, color: barColor, fontFamily: SAIRA, flexShrink: 0, minWidth: 38, textAlign: 'right' }}>{rate}%</span>
                </div>
                {hasKey && <div style={{ fontSize: F.caption, color: C.gold, marginTop: 6, lineHeight: 1.5 }}>主力を含むため必要額1.5倍で計算されています</div>}
                {blockMsg && <div style={{ fontSize: F.caption, color: C.red, marginTop: 6, lineHeight: 1.5 }}>{blockMsg}</div>}
                {!blockMsg && rate < 100 && shortage > 0 && (
                  <div style={{ fontSize: F.caption, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
                    あと約{fmtYen(shortage)}相当が不足。出す選手か指名権を追加してください
                    {isFinal && <span style={{ color: C.red }}>（最終交渉：合意圏内でないと決裂します）</span>}
                  </div>
                )}
                {!blockMsg && rate === 100 && <div style={{ fontSize: F.caption, color: C.green, marginTop: 6 }}>合意圏内です</div>}
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
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',cursor: 'pointer', textAlign: 'left', width: '100%', background: selected ? alpha(color, 0.14) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${selected ? color : C.border}`, fontFamily: 'inherit' }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, border: `2px solid ${selected ? color : C.border2}`, background: selected ? color : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0A0912', fontSize: F.body, fontWeight: 900 }}>{selected ? '✓' : ''}</div>
      <div style={{ flexShrink: 0,overflow: 'hidden', border: `1.5px solid ${alpha(specCol, 0.4)}` }}><PlayerFace playerId={player.id} nationality={player.nationality} size={40} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: F.bodyLg, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
          <SpecChip specialty={player.specialty} size="sm" />
        </div>
        <div style={{ fontSize: F.caption, color: C.textDim }}>{player.age}歳 · {fmtYen(player.contract.annualSalary)} · 残{player.contract.yearsLeft}年</div>
      </div>
      <span style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: 900, color: ratingColor(ovr(player)), flexShrink: 0 }}>{ovr(player)}</span>
    </button>
  )
}

function PickChip({ label, selected, color, onToggle }: { label: string; selected: boolean; color: string; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ padding: '6px 10px',cursor: 'pointer', fontFamily: SAIRA, fontSize: F.label, fontWeight: 800, background: selected ? alpha(color, 0.18) : C.surface2, border: `1.5px solid ${selected ? color : C.border2}`, color: selected ? color : C.textDim }}>
      {label}指名権
    </button>
  )
}
