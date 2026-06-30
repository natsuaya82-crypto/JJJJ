import { useState, useMemo, useEffect } from 'react'
import BackButton from '../ui/BackButton'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import {
  CARD_STAT_LABELS, RARITY_COLORS, RARITY_LABELS, RARITY_BG,
  detectCombo,
} from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import { CardTrainingHeaderSVG, STAT_ICON_MAP } from '../icons/StatIcons'
import PlayerFace from '../player/PlayerFace'
import { audio } from '../../utils/audio'
import { showRewardAd } from '../../utils/ads'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const PURPLE = '#A855F7'
const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

function requiredExp(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4
  return Math.floor(0.5 * level * level * dull)
}

export default function CardTrainingPage() {
  const navigate = useNavigate()
  const { trainingCards, players, playerTeamId, applyTrainingCards, dismissDroppedCards } = useGameStore()

  useEffect(() => { dismissDroppedCards() }, [])

  const [step, setStep] = useState<'player' | 'cards'>('player')
  const [filterStat, setFilterStat] = useState<CardStatKey | 'all'>('all')
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([])
  const [targetPlayerId, setTargetPlayerId] = useState<string>('')
  const [applied, setApplied] = useState<{ combo: NonNullable<ReturnType<typeof detectCombo>>; traitGranted: boolean; greatSuccess: boolean; preRatings: Partial<Record<CardStatKey, number>>; preExp: Partial<Record<CardStatKey, number>> } | null>(null)
  const [adWatched, setAdWatched] = useState(false)
  const [barAnimated, setBarAnimated] = useState(false)

  useEffect(() => {
    if (!applied) { setBarAnimated(false); return }
    const t = setTimeout(() => setBarAnimated(true), 80)
    return () => clearTimeout(t)
  }, [applied])

  const mainPlayers = useMemo(
    () => players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main' && p.status !== 'retired').sort((a, b) => ovr(b) - ovr(a)),
    [players, playerTeamId]
  )

  const filteredCards = useMemo(
    () => filterStat === 'all' ? trainingCards : trainingCards.filter(c => c.statKey === filterStat),
    [trainingCards, filterStat]
  )

  const selectedCards = useMemo(
    () => trainingCards.filter(c => selectedCardIds.includes(c.id)),
    [trainingCards, selectedCardIds]
  )

  const combo = useMemo(() => detectCombo(selectedCards), [selectedCards])
  const targetPlayer = useMemo(() => players.find(p => p.id === targetPlayerId), [players, targetPlayerId])

  function selectPlayer(id: string) {
    setTargetPlayerId(id)
    setSelectedCardIds([])
    setStep('cards')
  }

  function toggleCard(id: string) {
    setApplied(null)
    setSelectedCardIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  function handleApply() {
    if (!targetPlayerId || selectedCardIds.length === 0 || !combo || !targetPlayer) return
    const preRatings: Partial<Record<CardStatKey, number>> = {}
    const preExp: Partial<Record<CardStatKey, number>> = {}
    statKeys.forEach(k => {
      preRatings[k] = (targetPlayer.ratings as Record<CardStatKey, number>)[k] ?? 0
      preExp[k] = (targetPlayer.exp ?? {})[k] ?? 0
    })
    const greatSuccess = adWatched || Math.random() < 0.05
    const multiplier = greatSuccess ? 1.5 : 1.0
    const willTrait = !!(combo.traitGrant && combo.traitChance && Math.random() < combo.traitChance)
    applyTrainingCards(targetPlayerId, selectedCardIds, willTrait, multiplier)
    setApplied({ combo, traitGranted: willTrait, greatSuccess, preRatings, preExp })
    setSelectedCardIds([])
    setAdWatched(false)
    audio.playSe(greatSuccess ? 'great_success' : 'levelup')
  }

  const canApply = !!targetPlayerId && selectedCardIds.length > 0 && !!combo

  const sharedHeader = (onBack: () => void, backLabel?: string) => (
    <div style={{
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      padding: '12px 16px 12px',
      borderBottom: `2px solid ${C.border2}`,
      position: 'relative',
    }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(PURPLE, 0.3)}, transparent)`, pointerEvents: 'none' }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton onClick={onBack}/>
        {backLabel && <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: C.textSub }}>{backLabel}</div>}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: PURPLE, letterSpacing: '3px', fontWeight: 900, marginBottom: 1 }}>CARD TRAINING</div>
            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.text }}>カード特訓</div>
          </div>
          <CardTrainingHeaderSVG width={60} height={43} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            padding: '4px 10px', borderRadius: 20,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha(PURPLE, 0.5)}`,
            boxShadow: `0 2px 0 ${alpha(PURPLE, 0.3)}`,
          }}>
            <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: PURPLE }}>{trainingCards.length}</span>
            <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textSub }}> 枚</span>
          </div>
          <button
            onClick={() => navigate('/cards/list')}
            style={{
              padding: '6px 12px', borderRadius: 8,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              boxShadow: `0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)`,
              color: C.gold, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >一覧</button>
        </div>
      </div>
    </div>
  )

  // ── STEP 1: Player selection ──────────────────────────────────
  if (step === 'player') {
    return (
      <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", color: C.text, paddingBottom: 80 }}>
        {sharedHeader(() => navigate(-1))}

        <div style={{ padding: '14px 14px 6px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: '3px', fontWeight: 900, marginBottom: 2 }}>STEP 1</div>
          <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>特訓する選手を選ぶ</div>
        </div>

        <div style={{ padding: '6px 12px' }}>
          {mainPlayers.length === 0 && (
            <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: C.textDim }}>選手がいません</div>
          )}
          {mainPlayers.map(p => {
            const rating = ovr(p)
            const specCol = SPEC_COLOR[p.specialty]
            return (
              <div
                key={p.id}
                onClick={() => selectPlayer(p.id)}
                style={{
                  marginBottom: 6, borderRadius: 14, overflow: 'hidden',
                  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                  border: `2px solid ${C.goldDark}`,
                  boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)`,
                  padding: '10px 12px 7px',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(C.gold, 0.3)}, transparent)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1.5px solid ${alpha(C.gold, 0.5)}`, boxShadow: `0 0 8px ${alpha(C.gold, 0.3)}` }}>
                    <PlayerFace playerId={p.id} nationality={p.nationality} size={56} />
                  </div>
<span style={{ padding: '2px 6px', borderRadius: 7, flexShrink: 0, background: alpha(specCol, 0.15), color: specCol, fontSize: 9, fontWeight: 700 }}>
                    {SPECIALTY_LABELS[p.specialty]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 1 }}>{p.age}歳</div>
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(rating), minWidth: 32, textAlign: 'right', flexShrink: 0 }}>{rating}</div>
                </div>
                <div style={{ display: 'flex', paddingLeft: 34, paddingBottom: 2, gap: 0 }}>
                  {([
                    ['速', p.ratings.speed], ['持', p.ratings.stamina], ['登', p.ratings.mountainUp],
                    ['下', p.ratings.mountainDown], ['ペ', p.ratings.pacing], ['精', p.ratings.mental], ['回', p.ratings.recovery],
                  ] as [string, number][]).map(([label, val]) => (
                    <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim }}>{label}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: ratingColor(val), lineHeight: 1.2 }}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── STEP 2: Card selection ────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", color: C.text, paddingBottom: 80 }}>
      {sharedHeader(() => setStep('player'), '選手変更')}

      {/* Selected player banner */}
      {targetPlayer && (
        <div style={{
          margin: '12px 14px 0',
          padding: '10px 14px', borderRadius: 12,
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.goldDark}`,
          boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 3, border: `1px solid rgba(245,200,66,0.18)`, borderRadius: 9, pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(C.gold, 0.4)}, transparent)`, pointerEvents: 'none' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ flexShrink: 0, borderRadius: 10, overflow: 'hidden', border: `1px solid ${alpha(C.gold, 0.4)}` }}>
              <PlayerFace playerId={targetPlayer.id} nationality={targetPlayer.nationality} size={60} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{targetPlayer.name}</div>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{targetPlayer.age}歳 · OVR {ovr(targetPlayer)}</div>
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: '2px', fontWeight: 900 }}>STEP 2</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
            {statKeys.map(k => {
              const current = targetPlayer.ratings[k] ?? 0
              const delta = combo?.statDeltas[k] ?? 0
              const curExp = targetPlayer.exp?.[k] ?? 0
              const req = requiredExp(current)
              const basePct = req > 0 ? Math.min(curExp / req, 1) : 1
              const gainExp = Math.min(curExp + delta, req)
              const gainPct = req > 0 ? Math.max(0, gainExp / req - basePct) : 0
              const levelUp = req > 0 && curExp + delta >= req
              return (
                <div key={k} style={{
                  padding: '5px 6px', borderRadius: 6, textAlign: 'center',
                  background: delta > 0 ? alpha('#9FE88D', 0.12) : alpha(C.surface, 0.8),
                  border: `1px solid ${delta > 0 ? alpha('#9FE88D', 0.35) : C.border}`,
                }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, marginBottom: 2 }}>{CARD_STAT_LABELS[k]}</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: delta > 0 ? '#9FE88D' : C.textSub, marginBottom: 4 }}>
                    {current}{levelUp && <span style={{ fontSize: 8, color: '#9FE88D', marginLeft: 2 }}>↑</span>}
                  </div>
                  <div style={{ height: 3, borderRadius: 2, background: alpha(C.border, 0.8), overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${basePct * 100}%`, background: alpha(C.textSub, 0.5), borderRadius: 2, transition: 'width 0.25s ease' }}/>
                    <div style={{ position: 'absolute', left: `${basePct * 100}%`, top: 0, height: '100%', width: `${gainPct * 100}%`, background: '#9FE88D', borderRadius: 2, transition: 'left 0.25s ease, width 0.25s ease' }}/>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ padding: '12px 14px 0' }}>
        {/* Card filter */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: '2px', fontWeight: 900 }}>
            カードを選ぶ
            {selectedCardIds.length > 0 && <span style={{ color: C.gold, marginLeft: 8 }}>{selectedCardIds.length}枚選択中</span>}
          </div>
          <select
            value={filterStat}
            onChange={e => setFilterStat(e.target.value as typeof filterStat)}
            style={{
              padding: '5px 28px 5px 8px', borderRadius: 6,
              background: C.surface2, border: `1px solid ${C.border}`,
              color: C.textSub, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer',
              appearance: 'none', WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}
          >
            <option value="all">すべて</option>
            <option value="speed">スピード</option>
            <option value="stamina">スタミナ</option>
            <option value="mountainUp">山登り</option>
            <option value="mountainDown">山下り</option>
            <option value="pacing">ペース</option>
            <option value="mental">メンタル</option>
            <option value="recovery">回復力</option>
          </select>
        </div>

        {/* Card grid */}
        {trainingCards.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '32px 0' }}>カードがありません</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 7, marginBottom: 12 }}>
            {filteredCards.map(card => {
              const sel = selectedCardIds.includes(card.id)
              return (
                <button
                  key={card.id}
                  onClick={() => toggleCard(card.id)}
                  style={{
                    background: sel ? RARITY_BG[card.rarity] : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `2px solid ${sel ? RARITY_COLORS[card.rarity] : alpha(RARITY_COLORS[card.rarity], 0.35)}`,
                    borderRadius: 10, padding: '10px 6px 8px',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    outline: 'none',
                    boxShadow: sel
                      ? `0 4px 0 ${alpha(RARITY_COLORS[card.rarity], 0.5)}, 0 6px 14px ${alpha(RARITY_COLORS[card.rarity], 0.25)}, inset 0 1px 0 rgba(255,255,255,0.1)`
                      : `0 3px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {sel && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(RARITY_COLORS[card.rarity], 0.4)}, transparent)`, pointerEvents: 'none' }}/>}
                  <div style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                    color: RARITY_COLORS[card.rarity],
                    background: `${RARITY_COLORS[card.rarity]}22`,
                    padding: '2px 5px', borderRadius: 4,
                    fontFamily: SAIRA,
                  }}>{RARITY_LABELS[card.rarity]}</div>
                  {STAT_ICON_MAP[card.statKey]({ size: 20, color: RARITY_COLORS[card.rarity] })}
                  <div style={{ fontSize: 10, color: sel ? C.text : C.textSub, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
                    {CARD_STAT_LABELS[card.statKey]}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Combo preview */}
        {selectedCards.length > 0 && (
          <div style={{
            marginBottom: 12, borderRadius: 12,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: combo?.isSpecial ? `2px solid ${combo.color}` : `2px solid ${C.goldDark}`,
            boxShadow: combo?.isSpecial
              ? `0 4px 0 ${alpha(combo.color, 0.45)}, 0 6px 16px ${alpha(combo.color, 0.15)}, inset 0 1px 0 rgba(255,255,255,0.08)`
              : `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)`,
            padding: '12px 14px',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 3, border: `1px solid ${combo?.isSpecial ? alpha(combo.color, 0.2) : 'rgba(245,200,66,0.15)'}`, borderRadius: 9, pointerEvents: 'none' }}/>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${combo?.isSpecial ? alpha(combo.color, 0.5) : alpha(C.gold, 0.4)}, transparent)`, pointerEvents: 'none' }}/>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: combo?.isSpecial ? combo.color : C.gold, letterSpacing: '2px', fontWeight: 900, marginBottom: 8 }}>
              選択中 {selectedCards.length}枚
              {combo?.isSpecial && <span style={{ marginLeft: 8, background: `${combo.color}33`, padding: '1px 6px', borderRadius: 4, letterSpacing: 1 }}>COMBO</span>}
            </div>
            {combo ? (
              <>
                <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: combo.color, marginBottom: 10, textShadow: `0 0 12px ${alpha(combo.color, 0.5)}` }}>
                  {combo.name}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {Object.entries(combo.statDeltas).map(([key]) => (
                    <div key={key} style={{
                      fontFamily: SAIRA, fontSize: 12, fontWeight: 800,
                      background: `linear-gradient(180deg, ${alpha('#9FE88D', 0.18)}, ${alpha('#9FE88D', 0.08)})`,
                      padding: '4px 10px', borderRadius: 6, color: '#9FE88D',
                      border: `1px solid ${alpha('#9FE88D', 0.35)}`,
                      boxShadow: `0 2px 0 ${alpha('#9FE88D', 0.2)}`,
                    }}>
                      {CARD_STAT_LABELS[key as CardStatKey]}
                    </div>
                  ))}
                </div>
                {combo.traitGrant && (
                  <div style={{ fontSize: 10, color: C.gold, marginTop: 8, fontFamily: SAIRA, fontWeight: 700 }}>
                    {Math.round((combo.traitChance ?? 0) * 100)}% でスキル付与の可能性
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12, color: C.textDim }}>コンボなし — 通常合成</div>
            )}
          </div>
        )}

        {/* Ad option */}
        {canApply && (
          <div style={{ marginBottom: 8, textAlign: 'center' }}>
            {!adWatched ? (
              <button
                onClick={async () => { if (await showRewardAd()) setAdWatched(true) }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 4px',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <rect x="2" y="4" width="20" height="16" rx="2.5" stroke={C.textDim} strokeWidth="1.8"/>
                  <path d="M10 9.5l5 2.5-5 2.5z" fill={C.textDim}/>
                </svg>
                <span style={{ fontSize: 11, color: C.textSub, textDecoration: 'underline', textUnderlineOffset: 2 }}>
                  広告を見て大成功（通常5%）
                </span>
              </button>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 4px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold }} />
                <span style={{ fontSize: 11, color: C.gold }}>広告視聴済み</span>
              </div>
            )}
          </div>
        )}

        {/* Apply button */}
        <button
          onClick={handleApply}
          disabled={!canApply}
          style={{
            width: '100%', position: 'relative', overflow: 'hidden',
            background: !canApply
              ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
              : combo?.isSpecial
              ? `linear-gradient(180deg, ${alpha(combo.color, 0.9)}, #7e22ce)`
              : `linear-gradient(180deg, #9333ea, #7e22ce)`,
            color: !canApply ? C.textGhost : '#fff',
            border: canApply ? `2px solid #c084fc` : `2px solid ${C.border2}`,
            borderRadius: 12, padding: '15px',
            boxShadow: canApply
              ? `0 5px 0 #4c1d95, 0 7px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)`
              : `0 3px 0 rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
            fontSize: 14, fontWeight: 800, cursor: canApply ? 'pointer' : 'not-allowed',
            fontFamily: SAIRA, letterSpacing: '1px',
          }}
        >
          {canApply && <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '40%', background: 'linear-gradient(180deg,rgba(255,255,255,0.18),transparent)', borderRadius: '6px 6px 50% 50%', pointerEvents: 'none' }} />}
          {selectedCardIds.length === 0 ? 'カードを選んでください'
            : !combo ? '—'
            : '特訓実行'}
        </button>
      </div>

      {/* Result overlay */}
      {applied && (
        <div
          onClick={() => setApplied(null)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 24,
          }}
        >
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${applied.combo.color}`,
            borderRadius: 20, padding: 28,
            maxWidth: 340, width: '100%',
            textAlign: 'center',
            boxShadow: `0 6px 0 ${alpha(applied.combo.color, 0.35)}, 0 10px 40px ${alpha(applied.combo.color, 0.25)}, inset 0 1px 0 rgba(255,255,255,0.1)`,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(applied.combo.color, 0.2)}`, borderRadius: 16, pointerEvents: 'none' }}/>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(applied.combo.color, 0.6)}, transparent)`, pointerEvents: 'none' }}/>
            <div style={{ position: 'absolute', top: 2, left: 8, right: 8, height: '25%', background: `linear-gradient(180deg, rgba(255,255,255,0.07), transparent)`, borderRadius: '12px 12px 50% 50%', pointerEvents: 'none' }}/>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: applied.combo.color, letterSpacing: 3, marginBottom: 4, fontWeight: 900 }}>
              {applied.combo.isSpecial ? 'COMBO CLEAR' : '合成完了'}
            </div>
            {applied.greatSuccess && (
              <div style={{
                marginBottom: 14,
                background: `linear-gradient(180deg, ${alpha('#F59E0B', 0.2)}, ${alpha('#F59E0B', 0.08)})`,
                border: `2px solid #F59E0B`,
                borderRadius: 12, padding: '8px 16px',
                fontFamily: SAIRA, fontSize: 22, fontWeight: 900,
                color: '#F59E0B', letterSpacing: 3,
                textShadow: `0 0 20px ${alpha('#F59E0B', 0.6)}`,
                boxShadow: `0 4px 0 ${alpha('#F59E0B', 0.3)}, 0 6px 20px ${alpha('#F59E0B', 0.15)}`,
              }}>
                大成功！
              </div>
            )}
            <div style={{ fontFamily: SAIRA, fontSize: 24, fontWeight: 900, color: applied.combo.color, marginBottom: 18, textShadow: `0 0 20px ${alpha(applied.combo.color, 0.6)}` }}>
              {applied.combo.name}
            </div>
            {/* Animated exp bars */}
            <div style={{ width: '100%', marginBottom: 14 }}>
              {statKeys.filter(k => (applied.combo.statDeltas[k] ?? 0) > 0).map(k => {
                const preLevel = applied.preRatings[k] ?? 0
                const preExpVal = applied.preExp[k] ?? 0
                const rawDelta = applied.combo.statDeltas[k] ?? 0
                const effectiveDelta = applied.greatSuccess ? Math.round(rawDelta * 1.5) : rawDelta
                const preReq = requiredExp(preLevel)
                const levelUp = preReq > 0 && (preExpVal + effectiveDelta >= preReq)
                const prePct = preReq > 0 ? Math.min(preExpVal / preReq, 1) : 1
                const targetPct = levelUp ? 1 : (preReq > 0 ? Math.min((preExpVal + effectiveDelta) / preReq, 1) : 1)
                const postLevel = (targetPlayer?.ratings as Record<CardStatKey, number> | undefined)?.[k] ?? (levelUp ? preLevel + 1 : preLevel)
                return (
                  <div key={k} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                      <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{CARD_STAT_LABELS[k]}</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: levelUp ? '#9FE88D' : C.text }}>
                        {levelUp ? `${preLevel} → ${postLevel}` : preLevel}
                        {levelUp && <span style={{ fontFamily: SAIRA, fontSize: 8, color: '#9FE88D', marginLeft: 4, letterSpacing: 1 }}>LV UP</span>}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: alpha(C.border, 0.9), overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${prePct * 100}%`, background: alpha(C.textSub, 0.4), borderRadius: 3 }} />
                      <div style={{
                        position: 'absolute', left: `${prePct * 100}%`, top: 0, height: '100%',
                        width: barAnimated ? `${Math.max(0, targetPct - prePct) * 100}%` : '0%',
                        background: levelUp ? '#9FE88D' : PURPLE,
                        borderRadius: 3,
                        transition: 'width 0.55s cubic-bezier(0.34,1.56,0.64,1)',
                        boxShadow: barAnimated ? `0 0 6px ${levelUp ? alpha('#9FE88D', 0.6) : alpha(PURPLE, 0.6)}` : 'none',
                      }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {applied.traitGranted && applied.combo.traitGrant && (
              <div style={{
                background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${alpha(C.gold, 0.08)})`,
                border: `2px solid ${C.goldDark}`,
                boxShadow: `0 3px 0 #5a3500, 0 5px 14px ${alpha(C.gold, 0.2)}`,
                borderRadius: 10, padding: '9px 16px',
                fontFamily: SAIRA, fontSize: 14, color: C.gold, fontWeight: 900, marginBottom: 14,
                textShadow: `0 0 10px ${alpha(C.gold, 0.5)}`,
              }}>
                スキル獲得！
              </div>
            )}
            <button
              onClick={() => setApplied(null)}
              style={{
                marginTop: 8, width: '100%',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${C.border2}`,
                borderRadius: 10, padding: '12px',
                boxShadow: `0 3px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`,
                fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.text, cursor: 'pointer',
                letterSpacing: '2px',
              }}
            >閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
