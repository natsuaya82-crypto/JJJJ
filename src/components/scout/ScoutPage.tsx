import { useState, useEffect, useRef } from 'react'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import type { Specialty } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha, SAIRA } from '../../styles/tokens'
import PlayerRow, { type RowHandlers } from '../player/PlayerRow'
import SortSelect from '../ui/SortSelect'
import { comparePlayers, PLAYER_SORT_LABEL, type PlayerSortKey } from '../../utils/playerSort'
import PlayerList from '../player/PlayerList'

const SORT_OPTIONS: { value: PlayerSortKey; label: string }[] = [
  { value: 'ovr', label: PLAYER_SORT_LABEL.ovr },
  { value: 'specialty', label: PLAYER_SORT_LABEL.specialty },
  { value: 'age', label: PLAYER_SORT_LABEL.age },
]

export default function ScoutPage() {
  const { currentSeason, initScoutPool, openPlayerSheet, players } = useGameStore()
  const starredProspects = useGameStore(s => s.starredProspects) ?? []

  useEffect(() => { initScoutPool() }, [])

  // ドラフトで加入済みの選手（＝playersに存在）は候補リストに残っていても表示しない（スカウトに居座らせない）。
  const enrolledIds = new Set(players.map(p => p.id))
  const prospects = (currentSeason.scoutProspects ?? []).filter(p => !enrolledIds.has(p.id))

  const [sortBy, setSortBy] = useState<PlayerSortKey>('ovr')
  const [filterSpec, setFilterSpec] = useState<Specialty | null>(null)

  // 長押しで選手詳細（ロスターと同じ挙動）
  const lp = useRef<{ t?: number; long: boolean }>({ long: false })
  const rowHandlers = (pid: string): RowHandlers => ({
    onPointerDown: () => { lp.current.long = false; lp.current.t = window.setTimeout(() => { lp.current.long = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerLeave: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onPointerMove: () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } },
    onClick: () => {},
  })

  const sorted = [...prospects]
    .filter(p => filterSpec === null || p.specialty === filterSpec)
    .sort(comparePlayers(sortBy, sortBy === 'ovr' ? 'desc' : 'asc'))

  return (
    <div style={{
      paddingTop: '4px', paddingBottom: '80px',
      fontFamily: SAIRA,
      background: C.bg,
      minHeight: '100dvh',
    }}>
      <PageHeader title="スカウト" />
      <div style={{ padding: '0 16px 8px' }}>
        <div style={{ padding: '8px 12px',background: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.2)}`, marginBottom: '10px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.blue, fontWeight: '700', marginBottom: '4px', letterSpacing: '1px' }}>ドラフトの仕組み</div>
          <div style={{ fontSize: '10px', color: C.textDim, lineHeight: 1.5 }}>
            候補選手の能力はすべて公開。長押しで詳細を確認できる。シーズン終了後のドラフトで指名する。
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <span style={{ fontSize: '11px', color: C.textDim }}>
            {prospects.length}名の候補選手
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <SortSelect options={SORT_OPTIONS} value={sortBy} onChange={setSortBy} style={{ flex: 1 }} />
          <select value={filterSpec ?? 'all'} onChange={e => setFilterSpec(e.target.value === 'all' ? null : e.target.value as Specialty)} style={{
            flex: 1, padding: '7px 10px',
            background: C.surface2, border: `1px solid ${C.border2}`,
            color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
          }}>
            <option value="all">全ポジション</option>
            {(Object.keys(SPECIALTY_LABELS) as Specialty[]).map(spec => (
              <option key={spec} value={spec}>{SPECIALTY_LABELS[spec]}</option>
            ))}
          </select>
        </div>
      </div>

      <PlayerList style={{ margin: '0 12px' }}>
        {sorted.map(p => (
          <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} extra={starredProspects.includes(p.id) ? <span style={{ color: '#F5C842', fontSize: 13, flexShrink: 0 }}>★</span> : undefined} />
        ))}
      </PlayerList>
    </div>
  )
}
