import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import type { CardStatKey, CardRarity } from '../../types'
import { CARD_NAMES, REST_CARD_NAME } from '../../utils/cardCombo'
import { C, SAIRA, SELECT_STYLE, F } from '../../styles/tokens'
import TrainingCardSVG from './TrainingCardSVG'
import GlassButton from '../ui/GlassButton'


const statKeys: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

const SORT_OPTIONS = [
  { key: 'rarity', label: 'レア度順' },
  { key: 'stat', label: 'ステ順' },
  { key: 'value', label: '数値順' },
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

const RARITY_RANK: Record<CardRarity, number> = { legendary: 4, epic: 3, rare: 2, normal: 1 }

// 絞り込み・並べ替えはプルダウン（<select>）で統一

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
    <div style={{ minHeight: '100dvh', fontFamily: SAIRA, color: C.text, paddingBottom: 80 }}>
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: `linear-gradient(180deg, ${C.bg} 70%, transparent)`,
      }}>
        <PageHeader
          eyebrow={`${trainingCards.length}枚所持`}
          title="カード一覧"
          right={<span style={{ display: 'flex', gap: 8 }}>
            <GlassButton color={C.blue} size="sm" style={{ padding: '8px 14px', fontFamily: SAIRA, fontSize: F.body }} onClick={() => navigate('/cards')}>
              合成する
            </GlassButton>
            <GlassButton color="#A855F7" size="sm" style={{ padding: '8px 14px', fontFamily: SAIRA, fontSize: F.body }} onClick={() => navigate('/cards/convert')}>
              変換
            </GlassButton>
          </span>}
        />
      </div>

      {/* 絞り込み・並べ替え（プルダウン） */}
      <div style={{ padding: '0 14px 12px', display: 'flex', gap: 8 }}>
        <select value={filterStat} onChange={e => setFilterStat(e.target.value as typeof filterStat)} style={{ ...SELECT_STYLE, flex: 1 }}>
          <option value="all">すべての種類</option>
          {statKeys.map(k => <option key={k} value={k}>{CARD_NAMES[k]}</option>)}
          <option value="rest">{REST_CARD_NAME}</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ ...SELECT_STYLE, flex: 1 }}>
          {SORT_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Card grid */}
      <div style={{ padding: '0 14px' }}>
        {cardGroups.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, fontFamily: SAIRA, fontSize: F.bodyLg, padding: '40px 0' }}>
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
