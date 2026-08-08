import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey, CardRarity } from '../../types'
import { CARD_NAMES, REST_CARD_NAME } from '../../utils/cardCombo'
import { C, alpha, SAIRA } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'


const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

const SORT_OPTIONS = [
  { key: 'rarity', label: 'レア度順' },
  { key: 'stat', label: 'ステ順' },
  { key: 'value', label: '数値順' },
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

const RARITY_RANK: Record<CardRarity, number> = { legendary: 4, epic: 3, rare: 2, normal: 1 }

// 絞り込み・並べ替えはプルダウン（<select>）で統一
const selectStyle = {
  padding: '6px 28px 6px 10px', borderRadius: 8,
  background: C.surface2, border: `1px solid ${C.border}`,
  color: C.textSub, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  appearance: 'none' as const, WebkitAppearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
}

export default function CardInventoryPage() {
  const navigate = useNavigate()
  const { trainingCards } = useGameStore()
  const [filterStat, setFilterStat] = useState<CardStatKey | 'all' | 'rest'>('all')
  const [sort, setSort] = useState<SortKey>('rarity')

  const filtered = useMemo(() => {
    const base = filterStat === 'all' ? trainingCards
      : filterStat === 'rest' ? trainingCards.filter(c => c.kind === 'rest')
      : trainingCards.filter(c => c.kind !== 'rest' && c.statKey === filterStat)
    return [...base].sort((a, b) => {
      if (sort === 'rarity') return RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]
      if (sort === 'stat') return a.statKey.localeCompare(b.statKey)
      return b.value - a.value
    })
  }, [trainingCards, filterStat, sort])

  // 同じカード（種類×レア度）は1つにまとめて×Nで表示（完全休養は kind でグループを分ける）
  const cardGroups = useMemo(() => {
    const map = new Map<string, { key: string; statKey: CardStatKey; rarity: CardRarity; kind?: 'rest'; value: number; count: number }>()
    for (const c of filtered) {
      const k = `${c.kind ?? 'stat'}_${c.statKey}_${c.rarity}`
      const g = map.get(k)
      if (g) g.count++
      else map.set(k, { key: k, statKey: c.statKey, rarity: c.rarity, kind: c.kind, value: c.value, count: 1 })
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
        <button
          onClick={() => navigate('/cards/convert')}
          style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha('#A855F7', 0.55)}`,
            boxShadow: `0 4px 0 #4c1d95, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
            borderRadius: 11,
            color: '#A855F7', fontSize: 12, fontWeight: 700,
            padding: '8px 14px', cursor: 'pointer', fontFamily: SAIRA,
            position: 'relative', overflow: 'hidden' as const,
            marginBottom: '4px',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }}/>
          変換
        </button>
      </div>

      {/* 絞り込み・並べ替え（プルダウン） */}
      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
        <select value={filterStat} onChange={e => setFilterStat(e.target.value as typeof filterStat)} style={{ ...selectStyle, flex: 1 }}>
          <option value="all">すべての種類</option>
          {statKeys.map(k => <option key={k} value={k}>{CARD_NAMES[k]}</option>)}
          <option value="rest">{REST_CARD_NAME}</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ ...selectStyle, flex: 1 }}>
          {SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

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
            {cardGroups.map(group => (
              <TrainingCardSVG key={group.key} statKey={group.statKey} rarity={group.rarity} width={76} count={group.count} kind={group.kind} value={group.value} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
