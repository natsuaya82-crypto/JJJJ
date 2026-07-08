import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey, CardRarity } from '../../types'
import { CARD_NAMES, MAX_FUSION_CARDS, REST_CARD_NAME } from '../../utils/cardCombo'
import { isStatMaxed } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const PURPLE = '#A855F7'

const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

const selectStyle = {
  padding: '6px 28px 6px 10px', borderRadius: 8,
  background: C.surface2, border: `1px solid ${C.border}`,
  color: C.textSub, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  appearance: 'none' as const, WebkitAppearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
}

export default function CardSelectPage() {
  const navigate = useNavigate()
  const { trainingCards, fusionCardIds, addFusionCard, removeFusionCard, fusionPlayerId, players } = useGameStore()
  const [filterStat, setFilterStat] = useState<CardStatKey | 'all' | 'rest'>('all')

  const fusionFull = fusionCardIds.length >= MAX_FUSION_CARDS
  // 合成対象の選手（能力別ポテンシャル上限に達した能力のカードは使えない＝無駄防止）
  const targetPlayer = fusionPlayerId ? players.find(p => p.id === fusionPlayerId) ?? null : null
  const isCardMaxed = (statKey: CardStatKey, kind?: 'rest') => kind !== 'rest' && !!targetPlayer && isStatMaxed(targetPlayer, statKey)

  // 選択中カード（選択順・存在するものだけ）。タップで外せる。
  const selectedCards = useMemo(
    () => fusionCardIds.map(id => trainingCards.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [trainingCards, fusionCardIds]
  )

  const filteredCards = useMemo(
    () => filterStat === 'all' ? trainingCards
      : filterStat === 'rest' ? trainingCards.filter(c => c.kind === 'rest')
      : trainingCards.filter(c => c.kind !== 'rest' && c.statKey === filterStat),
    [trainingCards, filterStat]
  )

  // 同じ種類（種類×レア度）のカードは1つにまとめて表示する（完全休養は kind でグループを分ける）
  const cardGroups = useMemo(() => {
    const map = new Map<string, { key: string; statKey: CardStatKey; rarity: CardRarity; kind?: 'rest'; value: number; cards: typeof filteredCards }>()
    for (const c of filteredCards) {
      const k = `${c.kind ?? 'stat'}_${c.statKey}_${c.rarity}`
      const g = map.get(k)
      if (g) g.cards.push(c)
      else map.set(k, { key: k, statKey: c.statKey, rarity: c.rarity, kind: c.kind, value: c.value, cards: [c] })
    }
    return [...map.values()]
  }, [filteredCards])

  // グループをタップ：既に合成中でない同種カードを1枚追加（画面は閉じずに続けて選べる＝まとめて選択）
  function pick(cards: typeof filteredCards) {
    if (fusionFull) return
    const next = cards.find(c => !fusionCardIds.includes(c.id))
    if (!next) return
    if (isCardMaxed(next.statKey, next.kind)) return  // 上限到達能力は追加不可
    addFusionCard(next.id)
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: SAIRA, color: C.text, paddingBottom: 96 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: `linear-gradient(180deg, ${C.bg} 70%, transparent)`,
        padding: '14px 16px 10px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <BackButton/>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900 }}>カードを選ぶ</div>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 1 }}>
            合成中 <span style={{ color: PURPLE, fontWeight: 800 }}>{fusionCardIds.length}</span>/{MAX_FUSION_CARDS}
          </div>
        </div>
      </div>

      {/* 選択中（タップで外す） */}
      {selectedCards.length > 0 && (
        <div style={{ padding: '0 14px 12px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: 2, fontWeight: 900, marginBottom: 6 }}>選択中（タップで外す）</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {selectedCards.map(card => (
              <button key={card.id} onClick={() => removeFusionCard(card.id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <TrainingCardSVG statKey={card.statKey} rarity={card.rarity} width={50} selected kind={card.kind} value={card.value} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 絞り込み（プルダウン） */}
      <div style={{ padding: '0 14px 12px' }}>
        <select value={filterStat} onChange={e => setFilterStat(e.target.value as typeof filterStat)} style={{ ...selectStyle, width: '100%' }}>
          <option value="all">すべての種類</option>
          {statKeys.map(k => <option key={k} value={k}>{CARD_NAMES[k]}</option>)}
          <option value="rest">{REST_CARD_NAME}</option>
        </select>
      </div>

      {fusionFull && (
        <div style={{ padding: '0 14px 12px', textAlign: 'center', fontSize: 11, color: C.gold }}>
          スロットが満杯です（{MAX_FUSION_CARDS}枚）
        </div>
      )}

      {/* Card grid */}
      <div style={{ padding: '0 14px' }}>
        {cardGroups.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: 13, padding: '40px 0' }}>
            カードがありません
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(76px, 1fr))',
            gap: 10, justifyItems: 'center',
          }}>
            {cardGroups.map(group => {
              // 残り枚数 = 所持数 − 既に合成中の同種枚数
              const selCount = group.cards.filter(c => fusionCardIds.includes(c.id)).length
              const remaining = group.cards.length - selCount
              const statMaxed = isCardMaxed(group.statKey, group.kind)
              const disabled = remaining <= 0 || fusionFull || statMaxed
              return (
                <button
                  key={group.key}
                  onClick={() => pick(group.cards)}
                  disabled={disabled}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative' }}
                >
                  <TrainingCardSVG statKey={group.statKey} rarity={group.rarity} width={76} count={remaining} dimmed={disabled} kind={group.kind} value={group.value} />
                  {statMaxed && (
                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-12deg)', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: '#fff', background: alpha(C.red, 0.85), padding: '2px 8px', borderRadius: 5, letterSpacing: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>上限</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 下固定：決定して合成画面へ戻る */}
      <div style={{
        position: 'sticky', bottom: 0, marginTop: 16,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        background: `linear-gradient(180deg, transparent, ${C.bg} 30%)`,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            width: '100%', padding: '15px', borderRadius: 12,
            background: `linear-gradient(180deg, #9333ea, #7e22ce)`,
            border: `2px solid #c084fc`, color: '#fff',
            boxShadow: `0 5px 0 #4c1d95, 0 7px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.15)`,
            fontFamily: SAIRA, fontSize: 14, fontWeight: 800, letterSpacing: '1px', cursor: 'pointer',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '40%', background: 'linear-gradient(180deg,rgba(255,255,255,0.18),transparent)', borderRadius: '6px 6px 50% 50%', pointerEvents: 'none' }} />
          決定（{fusionCardIds.length}枚）
        </button>
      </div>
    </div>
  )
}
