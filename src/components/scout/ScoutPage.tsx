import { useState, useEffect, useRef } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Specialty } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { ovr } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerRow, { type RowHandlers } from '../player/PlayerRow'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function ScoutPage() {
  const { currentSeason, initScoutPool, openPlayerSheet, players } = useGameStore()
  const starredProspects = useGameStore(s => s.starredProspects) ?? []

  useEffect(() => { initScoutPool() }, [])

  // ドラフトで加入済みの選手（＝playersに存在）は候補リストに残っていても表示しない（スカウトに居座らせない）。
  const enrolledIds = new Set(players.map(p => p.id))
  const prospects = (currentSeason.scoutProspects ?? []).filter(p => !enrolledIds.has(p.id))

  const [sortBy, setSortBy] = useState<'ovr' | 'specialty' | 'age'>('ovr')
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
    .sort((a, b) => {
      if (sortBy === 'ovr') return ovr(b) - ovr(a)
      if (sortBy === 'specialty') return a.specialty.localeCompare(b.specialty)
      return a.age - b.age
    })

  return (
    <div style={{
      paddingTop: '4px', paddingBottom: '80px',
      fontFamily: SAIRA,
      background: C.bg,
      minHeight: '100dvh',
    }}>
      <div style={{ padding: '8px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px' }}>
          <BackButton/>
          <div style={{ fontSize: '22px', fontWeight: '900', color: C.text }}>スカウト</div>
        </div>

        <div style={{ padding: '8px 12px', borderRadius: '10px', background: alpha(C.blue, 0.08), border: `1px solid ${alpha(C.blue, 0.2)}`, marginBottom: '10px' }}>
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
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'ovr' | 'specialty' | 'age')} style={{
            flex: 1, padding: '7px 10px', borderRadius: '10px',
            background: C.surface2, border: `1px solid ${C.border2}`,
            color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
          }}>
            <option value="ovr">評価順</option>
            <option value="specialty">タイプ順</option>
            <option value="age">年齢順</option>
          </select>
          <select value={filterSpec ?? 'all'} onChange={e => setFilterSpec(e.target.value === 'all' ? null : e.target.value as Specialty)} style={{
            flex: 1, padding: '7px 10px', borderRadius: '10px',
            background: C.surface2, border: `1px solid ${C.border2}`,
            color: C.textSub, fontSize: '11px', fontFamily: SAIRA, outline: 'none',
          }}>
            <option value="all">全タイプ</option>
            {(Object.keys(SPECIALTY_LABELS) as Specialty[]).map(spec => (
              <option key={spec} value={spec}>{SPECIALTY_LABELS[spec]}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {sorted.map(p => (
          <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} extra={starredProspects.includes(p.id) ? <span style={{ color: '#F5C842', fontSize: 13, flexShrink: 0 }}>★</span> : undefined} />
        ))}
      </div>
    </div>
  )
}
