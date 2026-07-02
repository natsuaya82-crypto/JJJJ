import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey, CardRarity } from '../../types'
import { CARD_STAT_LABELS, RARITY_COLORS, RARITY_LABELS } from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import { STAT_ICON_MAP } from '../icons/StatIcons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const RARITY_ORDER: CardRarity[] = ['legendary', 'epic', 'rare', 'normal']

const STAT_TABS: { key: CardStatKey | 'all'; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'speed', label: 'SPD' },
  { key: 'stamina', label: 'STA' },
  { key: 'mountainUp', label: '山↑' },
  { key: 'mountainDown', label: '山↓' },
  { key: 'pacing', label: 'PACe' },
  { key: 'mental', label: 'MEN' },
  { key: 'recovery', label: 'REC' },
]

const SORT_OPTIONS = [
  { key: 'rarity', label: 'レア度順' },
  { key: 'stat', label: 'ステ順' },
  { key: 'value', label: '数値順' },
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

const RARITY_RANK: Record<CardRarity, number> = { legendary: 4, epic: 3, rare: 2, normal: 1 }

export default function CardInventoryPage() {
  const navigate = useNavigate()
  const { trainingCards } = useGameStore()
  const [filterStat, setFilterStat] = useState<CardStatKey | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('rarity')

  const counts = useMemo(() => {
    const m: Partial<Record<CardRarity, number>> = {}
    for (const c of trainingCards) m[c.rarity] = (m[c.rarity] ?? 0) + 1
    return m
  }, [trainingCards])

  const filtered = useMemo(() => {
    const base = filterStat === 'all' ? trainingCards : trainingCards.filter(c => c.statKey === filterStat)
    return [...base].sort((a, b) => {
      if (sort === 'rarity') return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]
      if (sort === 'stat') return a.statKey.localeCompare(b.statKey)
      return b.value - a.value
    })
  }, [trainingCards, filterStat, sort])

  const statCounts = useMemo(() => {
    const m: Partial<Record<CardStatKey, number>> = {}
    for (const c of trainingCards) m[c.statKey] = (m[c.statKey] ?? 0) + 1
    return m
  }, [trainingCards])

  // 合成画面と同じく、同じカードは1つにまとめて×Nで表示
  const cardGroups = useMemo(() => {
    const map = new Map<string, { key: string; statKey: CardStatKey; rarity: CardRarity; count: number }>()
    for (const c of filtered) {
      const k = `${c.statKey}_${c.rarity}`
      const g = map.get(k)
      if (g) g.count++
      else map.set(k, { key: k, statKey: c.statKey, rarity: c.rarity, count: 1 })
    }
    return [...map.values()]
  }, [filtered])

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, fontFamily: SAIRA, color: C.text, paddingBottom: 80 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: `linear-gradient(180deg, ${C.bg} 70%, transparent)`,
        padding: '14px 16px 10px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <BackButton/>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900 }}>カード一覧</div>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 1 }}>{trainingCards.length}枚所持</div>
        </div>
        <button
          onClick={() => navigate('/cards')}
          style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha(C.blue, 0.55)}`,
            boxShadow: `0 4px 0 #2a3580, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
            borderRadius: 11,
            color: C.blue, fontSize: 12, fontWeight: 700,
            padding: '8px 14px', cursor: 'pointer', fontFamily: SAIRA,
            position: 'relative', overflow: 'hidden' as const,
            marginBottom: '4px',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }}/>
          合成する
        </button>
      </div>

      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
        {RARITY_ORDER.map(r => (
          <div key={r} style={{
            flex: 1, position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha(RARITY_COLORS[r], 0.45)}`,
            boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            borderRadius: 12, padding: '8px 0', textAlign: 'center',
          }}>
            <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 9, pointerEvents: 'none' }}/>
            <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: RARITY_COLORS[r], textShadow: `0 0 8px ${alpha(RARITY_COLORS[r], 0.5)}` }}>
              {counts[r] ?? 0}
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, marginTop: 2 }}>{RARITY_LABELS[r][0]}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: 'auto', display: 'flex', gap: 6, padding: '0 14px 10px' }}>
        {STAT_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterStat(tab.key)}
            style={{
              flexShrink: 0, padding: '5px 10px', borderRadius: 20, border: 'none',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: SAIRA,
              background: filterStat === tab.key
                ? `linear-gradient(180deg, ${C.surface}, ${C.bg})`
                : C.surface2,
              color: filterStat === tab.key ? C.gold : C.textSub,
              outline: filterStat === tab.key ? `1px solid ${alpha(C.gold, 0.4)}` : `1px solid ${C.border}`,
              boxShadow: filterStat === tab.key ? `0 2px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)` : 'none',
            }}
          >
            {tab.label}
            {tab.key !== 'all' && statCounts[tab.key as CardStatKey] != null && (
              <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.7 }}>
                {statCounts[tab.key as CardStatKey]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 14px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>並べ替え:</span>
        {SORT_OPTIONS.map(s => (
          <button
            key={s.key}
            onClick={() => setSort(s.key)}
            style={{
              padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 600, fontFamily: SAIRA,
              background: sort === s.key
                ? `linear-gradient(180deg, ${C.surface}, ${C.bg})`
                : C.surface2,
              color: sort === s.key ? C.gold : C.textSub,
              outline: sort === s.key ? `1px solid ${alpha(C.gold, 0.4)}` : `1px solid ${C.border}`,
            }}
          >{s.label}</button>
        ))}
      </div>

      <div style={{ padding: '0 14px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: 13, padding: '40px 0' }}>
            カードがありません
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
            gap: 7,
          }}>
            {cardGroups.map(group => (
              <div
                key={group.key}
                style={{
                  position: 'relative', overflow: 'hidden',
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${alpha(RARITY_COLORS[group.rarity], 0.4)}`,
                  boxShadow: `0 3px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)`,
                  borderRadius: 10,
                  padding: '10px 6px 8px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                }}
              >
                {group.count > 1 && (
                  <div style={{ position: 'absolute', top: 4, right: 4, fontSize: 9, fontWeight: 900, color: '#fff', background: RARITY_COLORS[group.rarity], borderRadius: 6, padding: '1px 5px', fontFamily: SAIRA, lineHeight: 1.3 }}>×{group.count}</div>
                )}
                <div style={{
                  fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                  color: RARITY_COLORS[group.rarity],
                  background: `${RARITY_COLORS[group.rarity]}22`,
                  padding: '2px 5px', borderRadius: 4,
                  fontFamily: SAIRA,
                }}>{RARITY_LABELS[group.rarity]}</div>
                {STAT_ICON_MAP[group.statKey]({ size: 20, color: RARITY_COLORS[group.rarity] })}
                <div style={{ fontSize: 10, color: C.textSub, fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
                  {CARD_STAT_LABELS[group.statKey]}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
