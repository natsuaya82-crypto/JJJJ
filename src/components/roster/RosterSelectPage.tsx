import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const MIN_MAIN = 16
const MAX_MAIN = 23  // 1軍登録上限（本契約18＋2way5）
const MAX_SECOND = 20  // リザーブ登録上限（育成15＋2way5）
const FOOTER_BOTTOM = 114
const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Tier = 'main' | 'second'

export default function RosterSelectPage() {
  const navigate = useNavigate()
  const { players, playerTeamId, currentSeason, submitRoster, getRosterWindow } = useGameStore()
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const rosterWindow = getRosterWindow()

  const eligible = useMemo(() =>
    players
      .filter(p => p.teamId === playerTeamId && p.status !== 'retired')
      .sort((a, b) => ovr(b) - ovr(a)),
    [players, playerTeamId]
  )

  const [assign, setAssign] = useState<Record<string, Tier>>(() =>
    Object.fromEntries(
      eligible
        .filter(p => p.rosterTier === 'main' || p.rosterTier === 'second')
        .map(p => [p.id, p.rosterTier as Tier])
    )
  )
  const [checked, setChecked] = useState<Set<string>>(new Set())  // まとめて選択中
  const [sortKey, setSortKey] = useState<'ovr_desc' | 'ovr_asc' | 'age_asc' | 'age_desc' | 'name'>('ovr_desc')
  const [filterKey, setFilterKey] = useState<'all' | 'main' | 'second' | 'undecided' | 'standard' | 'development' | 'dual' | 'expiring'>('all')
  const displayed = useMemo(() => {
    let list = eligible.slice()
    if (filterKey === 'main') list = list.filter(p => assign[p.id] === 'main')
    else if (filterKey === 'second') list = list.filter(p => assign[p.id] === 'second')
    else if (filterKey === 'undecided') list = list.filter(p => !assign[p.id])
    else if (filterKey === 'standard') list = list.filter(p => (p.contract.contractType ?? 'standard') === 'standard')
    else if (filterKey === 'development') list = list.filter(p => p.contract.contractType === 'development')
    else if (filterKey === 'dual') list = list.filter(p => p.contract.contractType === 'dual')
    else if (filterKey === 'expiring') list = list.filter(p => p.contract.yearsLeft <= 1)
    list.sort((a, b) =>
      sortKey === 'ovr_asc' ? ovr(a) - ovr(b)
      : sortKey === 'age_asc' ? a.age - b.age
      : sortKey === 'age_desc' ? b.age - a.age
      : sortKey === 'name' ? a.name.localeCompare(b.name)
      : ovr(b) - ovr(a))
    return list
  }, [eligible, filterKey, sortKey, assign])

  const mainCount = eligible.filter(p => assign[p.id] === 'main').length
  const reserveCount = eligible.filter(p => assign[p.id] === 'second').length
  const undecided = eligible.length - mainCount - reserveCount
  const canSubmit = rosterWindow.open && undecided === 0 && mainCount >= MIN_MAIN && mainCount <= MAX_MAIN && reserveCount <= MAX_SECOND

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  // 選択中の選手をまとめて配置（契約形態による制約あり）
  function applyTier(tier: Tier) {
    setAssign(prev => {
      const next = { ...prev }
      checked.forEach(id => {
        const p = eligible.find(e => e.id === id)
        if (!p) return
        const ct = p.contract.contractType ?? 'standard'
        if (tier === 'second' && ct !== 'development') return  // 本契約/2wayは2軍不可
        if (tier === 'main' && ct === 'development') return     // 育成は1軍不可
        next[id] = tier
      })
      return next
    })
    setChecked(new Set())
  }
  function clearCheck() { setChecked(new Set()) }
  // おまかせ配置：育成は強制2軍、standard/dualはOVR上位でMAX_MAIN枠まで1軍
  function autofill() {
    const mainCandidates = eligible.filter(p => (p.contract.contractType ?? 'standard') !== 'development')
    const devPlayers = eligible.filter(p => p.contract.contractType === 'development')
    const ordered = [
      ...mainCandidates.filter(p => p.rosterTier === 'main'),
      ...mainCandidates.filter(p => p.rosterTier !== 'main'),
    ]
    const mainIds = new Set(ordered.slice(0, MAX_MAIN).map(p => p.id))
    const next: Record<string, Tier> = {}
    for (const p of mainCandidates) { if (mainIds.has(p.id)) next[p.id] = 'main' }
    for (const p of devPlayers) next[p.id] = 'second'
    setAssign(next)
    setChecked(new Set())
  }
  // クリア時も育成契約は2軍固定
  function clearAll() {
    setAssign(Object.fromEntries(
      eligible.filter(p => p.contract.contractType === 'development').map(p => [p.id, 'second' as Tier])
    ))
    setChecked(new Set())
  }

  function handleSubmit() {
    if (!canSubmit) return
    submitRoster(eligible.filter(p => assign[p.id] === 'main').map(p => p.id))
    navigate('/')
  }

  const statusOf = (id: string): { label: string; color: string; locked?: boolean } => {
    const p = eligible.find(e => e.id === id)
    const ct = p?.contract.contractType ?? 'standard'
    if (ct === 'development') return { label: '育成', color: C.blue, locked: true }
    if (ct === 'dual') {
      const t = assign[id]
      return t ? { label: '2way', color: C.cyan, locked: true } : { label: '未定', color: C.textGhost }
    }
    const t = assign[id]
    if (t === 'main') return { label: '1軍', color: C.gold }
    if (t === 'second') return { label: '2軍', color: C.blue }
    return { label: '未定', color: C.textGhost }
  }

  const hasCheck = checked.size > 0

  return (
    <div style={{
      fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif",
      paddingBottom: `${FOOTER_BOTTOM + (hasCheck ? 150 : 80)}px`,
      background: C.bg, minHeight: '100%',
    }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton/>
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', fontWeight: 700 }}>
            {currentSeason.year} PRE-SEASON
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>スカッド編成</div>
        </div>
      </div>

      {/* 人数サマリー */}
      <div style={{ padding: '0 12px 8px', display: 'flex', gap: 8 }}>
        {[
          { label: '1軍', count: mainCount, max: MAX_MAIN, color: mainCount >= MIN_MAIN && mainCount <= MAX_MAIN ? C.gold : C.red },
          { label: '2軍', count: reserveCount, max: MAX_SECOND, color: reserveCount > MAX_SECOND ? C.red : C.blue },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, textAlign: 'center', padding: '9px 4px', borderRadius: 12,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border2}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: '0.1em', marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: s.color, lineHeight: 1 }}>
              {s.count}{s.max != null && <span style={{ fontSize: 11, color: C.textDim }}>/{s.max}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* おまかせ / クリア */}
      <div style={{ padding: '0 12px 10px', display: 'flex', gap: 8 }}>
        <button onClick={autofill} style={{
          flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
          background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.06)})`,
          border: `1.5px solid ${alpha(C.gold, 0.5)}`, color: C.gold, fontSize: 12, fontWeight: 800,
        }}>おまかせ配置</button>
        <button onClick={clearAll} disabled={mainCount === 0 && reserveCount === 0} style={{
          padding: '10px 18px', borderRadius: 10, fontFamily: 'inherit',
          cursor: mainCount === 0 && reserveCount === 0 ? 'not-allowed' : 'pointer',
          background: C.surface2, border: `1px solid ${C.border}`, color: C.textDim, fontSize: 12, fontWeight: 700,
          opacity: mainCount === 0 && reserveCount === 0 ? 0.5 : 1,
        }}>クリア</button>
      </div>

      {/* 絞り込み / 並び替え（プルダウン） */}
      <div style={{ padding: '0 12px 12px', display: 'flex', gap: 8 }}>
        <select value={filterKey} onChange={e => setFilterKey(e.target.value as typeof filterKey)} style={{
          flex: 1, padding: '9px 10px', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          background: C.surface2, border: `1px solid ${C.border2}`, color: C.textSub, cursor: 'pointer',
        }}>
          <option value="all">絞り込み: 全員</option>
          <option value="main">1軍のみ</option>
          <option value="second">2軍のみ</option>
          <option value="undecided">未定のみ</option>
          <option value="standard">本契約</option>
          <option value="development">育成契約</option>
          <option value="dual">2way契約</option>
          <option value="expiring">今季満了</option>
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)} style={{
          flex: 1, padding: '9px 10px', borderRadius: 10, fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
          background: C.surface2, border: `1px solid ${C.border2}`, color: C.textSub, cursor: 'pointer',
        }}>
          <option value="ovr_desc">OVR 高い順</option>
          <option value="ovr_asc">OVR 低い順</option>
          <option value="age_asc">年齢 若い順</option>
          <option value="age_desc">年齢 高い順</option>
          <option value="name">名前順</option>
        </select>
      </div>

      {/* 選手一覧 */}
      <div style={{ padding: '0 12px' }}>
        {eligible.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: C.textDim }}>選手がいません</div>
        )}
        {displayed.map(p => {
          const st = statusOf(p.id)
          return (
            <PlayerRow
              key={p.id}
              p={p}
              status={st}
              locked={st.locked ?? false}
              checked={checked.has(p.id)}
              onTap={() => { if (!st.locked) toggleCheck(p.id) }}
              onLong={() => openPlayerSheet(p.id)}
            />
          )
        })}
      </div>

      {/* まとめて配置バー（選択中のみ） */}
      {hasCheck && (
        <div style={{
          position: 'fixed', bottom: canSubmit ? FOOTER_BOTTOM + 66 : FOOTER_BOTTOM + 8, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, padding: '0 12px', zIndex: 46,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 14,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.goldDark}`, boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}>
            <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.text, flexShrink: 0 }}>{checked.size}名</span>
            <button onClick={() => applyTier('main')} style={{
              flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              background: `linear-gradient(180deg, ${alpha(C.gold, 0.2)}, ${alpha(C.gold, 0.08)})`,
              border: `1.5px solid ${C.gold}`, color: C.gold, fontSize: 14, fontWeight: 900,
            }}>1軍へ</button>
            <button onClick={() => applyTier('second')} style={{
              flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              background: `linear-gradient(180deg, ${alpha(C.blue, 0.2)}, ${alpha(C.blue, 0.08)})`,
              border: `1.5px solid ${C.blue}`, color: C.blue, fontSize: 14, fontWeight: 900,
            }}>2軍へ</button>
            <button onClick={clearCheck} style={{
              padding: '11px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, fontSize: 12, fontWeight: 700,
            }}>解除</button>
          </div>
        </div>
      )}

      {/* フッター：全員配置し終わったら決定ボタンが出る */}
      {canSubmit && (
        <div style={{
          position: 'fixed', bottom: FOOTER_BOTTOM, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px',
          padding: '10px 16px 12px',
          background: `linear-gradient(180deg, rgba(10,23,41,0.0) 0%, rgba(10,23,41,0.97) 30%)`,
          zIndex: 45,
        }}>
          <button className="btn-game btn-game--gold" onClick={handleSubmit} style={{ width: '100%' }}>
            <span className="btn-game__inner">決定</span>
          </button>
        </div>
      )}
    </div>
  )
}

// 一覧の1行：タップで選択トグル、長押しで詳細
function PlayerRow({ p, status, locked, checked, onTap, onLong }: {
  p: Player
  status: { label: string; color: string; locked?: boolean }
  locked: boolean
  checked: boolean
  onTap: () => void
  onLong: () => void
}) {
  const rating = ovr(p)
  const specCol = SPEC_COLOR[p.specialty]
  const lp = useRef<{ t?: number; long: boolean }>({ long: false })
  const start = () => { lp.current.long = false; lp.current.t = window.setTimeout(() => { lp.current.long = true; onLong() }, 450) }
  const cancel = () => { if (lp.current.t) { clearTimeout(lp.current.t); lp.current.t = undefined } }
  const click = () => { if (lp.current.long) { lp.current.long = false; return } onTap() }

  return (
    <div
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerMove={cancel}
      onClick={click}
      style={{
        marginBottom: 6, borderRadius: 12, cursor: locked ? 'default' : 'pointer',
        background: checked
          ? `linear-gradient(180deg, ${alpha(C.gold, 0.14)}, ${alpha(C.gold, 0.05)})`
          : `linear-gradient(180deg, ${C.surface} 0%, ${C.bg} 100%)`,
        border: checked ? `2px solid ${C.gold}` : `1px solid ${C.border2}`,
        padding: '9px 12px', opacity: locked ? 0.75 : 1,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      {/* チェック（locked選手はアイコンで表示） */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border: `2px solid ${locked ? alpha(status.color, 0.5) : checked ? C.gold : C.border2}`,
        background: locked ? alpha(status.color, 0.15) : checked ? C.gold : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: locked ? status.color : '#1a0d00', fontSize: locked ? 9 : 13, fontWeight: 900,
      }}>
        {locked
          ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          : checked ? '✓' : ''}
      </div>

      <div style={{ flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border2}` }}>
        <PlayerFace playerId={p.id} nationality={p.nationality} size={44} />
      </div>

      <span style={{ padding: '2px 6px', borderRadius: 7, flexShrink: 0, background: alpha(specCol, 0.15), color: specCol, fontSize: 9, fontWeight: 700 }}>
        {SPECIALTY_LABELS[p.specialty]}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 1 }}>{p.age}歳</div>
      </div>

      <span style={{
        flexShrink: 0, minWidth: 46, textAlign: 'center', padding: '3px 0', borderRadius: 8,
        background: alpha(status.color, 0.12), border: `1px solid ${alpha(status.color, 0.4)}`,
        color: status.color, fontSize: 10, fontWeight: 800, fontFamily: SAIRA,
      }}>
        {status.label}
      </span>

      <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: ratingColor(rating), minWidth: 30, textAlign: 'right', flexShrink: 0 }}>
        {rating}
      </div>
    </div>
  )
}
