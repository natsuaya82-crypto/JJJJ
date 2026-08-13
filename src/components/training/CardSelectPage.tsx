import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey, CardRarity } from '../../types'
import { CARD_NAMES, MAX_FUSION_CARDS, REST_CARD_NAME, detectCombo } from '../../utils/cardCombo'
import { isStatMaxed } from '../../utils/playerUtils'
import { C, alpha, SAIRA, SELECT_STYLE, PURPLE } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'
import GlassButton from '../ui/GlassButton'


const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
const MENU_MULT_LABEL: Record<number, string> = { 2: '1.2', 3: '1.4', 4: '1.6', 5: '1.8' }


const RARITY_RANK: Record<CardRarity, number> = { legendary: 4, epic: 3, rare: 2, normal: 1 }

export default function CardSelectPage() {
  const navigate = useNavigate()
  const { trainingCards, fusionCardIds, addFusionCard, removeFusionCard, fusionPlayerId, players } = useGameStore()
  const [filterStat, setFilterStat] = useState<CardStatKey | 'all' | 'rest'>('all')
  const [filterRarity, setFilterRarity] = useState<CardRarity | 'all'>('all')
  // 並べ替え。入手順＝所持配列の順（今までの表示と同じ）
  const [sort, setSort] = useState<'obtained' | 'rarity' | 'stat'>('obtained')

  const fusionFull = fusionCardIds.length >= MAX_FUSION_CARDS
  // 合成対象の選手。上限到達能力のカードも選択可（レシピの種類数を揃えるため）。
  // その能力自体は伸びない（EXPは上限でクランプ）が、「上限」スタンプで無駄になることは示す。
  const targetPlayer = fusionPlayerId ? players.find(p => p.id === fusionPlayerId) ?? null : null
  const isCardMaxed = (statKey: CardStatKey, kind?: 'rest') => kind !== 'rest' && !!targetPlayer && isStatMaxed(targetPlayer, statKey)

  // 選択中カード（選択順・存在するものだけ）。タップで外せる。
  const selectedCards = useMemo(
    () => fusionCardIds.map(id => trainingCards.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c),
    [trainingCards, fusionCardIds]
  )

  // 選択中カードの合成結果（レシピ判定）をこの画面でもプレビュー表示する
  const combo = useMemo(() => detectCombo(selectedCards), [selectedCards])
  const isMenu = !!combo && combo.name !== '通常合成'
  const fatigueDelta = combo?.fatigueDelta ?? 0
  const distinctCount = useMemo(() => new Set(selectedCards.filter(c => c.kind !== 'rest').map(c => c.statKey)).size, [selectedCards])

  const filteredCards = useMemo(
    () => trainingCards.filter(c => {
      const statOk = filterStat === 'all' ? true
        : filterStat === 'rest' ? c.kind === 'rest'
        : (c.kind !== 'rest' && c.statKey === filterStat)
      const rarityOk = filterRarity === 'all' || c.rarity === filterRarity
      return statOk && rarityOk
    }),
    [trainingCards, filterStat, filterRarity]
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
    const groups = [...map.values()]
    if (sort === 'rarity') groups.sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || statKeys.indexOf(a.statKey) - statKeys.indexOf(b.statKey))
    if (sort === 'stat') groups.sort((a, b) => statKeys.indexOf(a.statKey) - statKeys.indexOf(b.statKey) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity])
    return groups
  }, [filteredCards, sort])

  // グループをタップ：既に合成中でない同種カードを1枚追加（画面は閉じずに続けて選べる＝まとめて選択）
  function pick(cards: typeof filteredCards) {
    if (fusionFull) return
    const next = cards.find(c => !fusionCardIds.includes(c.id))
    if (!next) return
    addFusionCard(next.id)
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: SAIRA, color: C.text }}>
      {/* 上部固定：ヘッダ＋選択中＋絞り込み（カード一覧だけスクロールし、選択中は常に見える） */}
      <div style={{ flexShrink: 0, background: C.bg, borderBottom: `1px solid ${C.border}` }}>
        <PageHeader
          title="カードを選ぶ"
          right={<div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>
            合成中 <span style={{ color: PURPLE, fontWeight: 800 }}>{fusionCardIds.length}</span>/{MAX_FUSION_CARDS}
          </div>}
        />

        {/* 選択中（タップで外す）。常時表示：後から出現するとリストが押し下がり、連打時に違うカードを誤選択するため */}
        <div style={{ padding: '0 14px 10px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: PURPLE, letterSpacing: 2, fontWeight: 900, marginBottom: 6 }}>選択中 {selectedCards.length}/{MAX_FUSION_CARDS}{selectedCards.length > 0 ? '（タップで外す）' : ''}</div>
          {combo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8, padding: '7px 11px', borderRadius: 9, background: alpha(combo.color, 0.12), border: `1px solid ${alpha(combo.color, 0.4)}` }}>
              <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: combo.color }}>{combo.name}</span>
              {isMenu && distinctCount >= 2 && (
                <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: combo.color, background: `${combo.color}22`, padding: '1px 7px', borderRadius: 5 }}>×{MENU_MULT_LABEL[distinctCount] ?? '1.0'}</span>
              )}
              {fatigueDelta > 0 && (
                <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: combo.color, background: `${combo.color}22`, padding: '1px 7px', borderRadius: 5 }}>疲労 -{fatigueDelta}</span>
              )}
              {combo.name === '通常合成' && (
                <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>レシピ未成立（ボーナスなし）</span>
              )}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 70, alignItems: 'center' }}>
            {selectedCards.length === 0 ? (
              <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textGhost }}>下のカードをタップして選択</span>
            ) : selectedCards.map(card => (
              <button key={card.id} onClick={() => removeFusionCard(card.id)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <TrainingCardSVG statKey={card.statKey} rarity={card.rarity} width={50} selected kind={card.kind} value={card.value} />
              </button>
            ))}
          </div>
        </div>

        {/* 絞り込み（種類＋レア度） */}
        <div style={{ padding: '0 14px 10px', display: 'flex', gap: 8 }}>
          <select value={filterStat} onChange={e => setFilterStat(e.target.value as typeof filterStat)} style={{ ...SELECT_STYLE, flex: 1, minWidth: 0 }}>
            <option value="all">すべての種類</option>
            {statKeys.map(k => <option key={k} value={k}>{CARD_NAMES[k]}</option>)}
            <option value="rest">{REST_CARD_NAME}</option>
          </select>
          <select value={filterRarity} onChange={e => setFilterRarity(e.target.value as typeof filterRarity)} style={{ ...SELECT_STYLE, flex: 1, minWidth: 0 }}>
            <option value="all">全レア度</option>
            <option value="legendary">レジェンダリー</option>
            <option value="epic">エピック</option>
            <option value="rare">レア</option>
            <option value="normal">ノーマル</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ ...SELECT_STYLE, flex: 1, minWidth: 0 }}>
            <option value="obtained">入手順</option>
            <option value="rarity">レア度順</option>
            <option value="stat">種類順</option>
          </select>
        </div>
      </div>

      {fusionFull && (
        <div style={{ padding: '0 14px 12px', textAlign: 'center', fontSize: 11, color: C.gold }}>
          スロットが満杯です（{MAX_FUSION_CARDS}枚）
        </div>
      )}

      {/* Card grid（ここだけスクロール） */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 14px 12px' }}>
        {cardGroups.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: 13, padding: '40px 0' }}>
            カードがありません
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))',
            gap: 10, justifyItems: 'center',
          }}>
            {cardGroups.map(group => {
              // 残り枚数 = 所持数 − 既に合成中の同種枚数
              const selCount = group.cards.filter(c => fusionCardIds.includes(c.id)).length
              const remaining = group.cards.length - selCount
              const statMaxed = isCardMaxed(group.statKey, group.kind)
              const disabled = remaining <= 0 || fusionFull
              return (
                <button
                  key={group.key}
                  onClick={() => pick(group.cards)}
                  disabled={disabled}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: disabled ? 'not-allowed' : 'pointer', position: 'relative' }}
                >
                  <TrainingCardSVG statKey={group.statKey} rarity={group.rarity} width={70} count={remaining} dimmed={disabled} kind={group.kind} value={group.value} />
                  {statMaxed && (
                    <span style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%) rotate(-12deg)', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: '#fff', background: alpha(C.red, 0.85), padding: '2px 8px', borderRadius: 5, letterSpacing: 1, pointerEvents: 'none', whiteSpace: 'nowrap' }}>上限</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 下端固定：決定して合成画面へ戻る */}
      <div style={{
        flexShrink: 0,
        padding: '10px 14px calc(10px + env(safe-area-inset-bottom))',
        background: C.bg, borderTop: `1px solid ${C.border}`,
      }}>
        <GlassButton full color="#c084fc" style={{ padding: '15px', fontFamily: SAIRA, fontSize: 14, letterSpacing: '1px' }} onClick={() => navigate(-1)}>
          決定（{fusionCardIds.length}枚）
        </GlassButton>
      </div>
    </div>
  )
}
