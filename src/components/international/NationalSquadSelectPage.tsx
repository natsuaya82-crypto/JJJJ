import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import PlayerFace from '../player/PlayerFace'
import { ekidenCandidates, individualStarIds, bestPBLabel } from '../../engine/worldAthletics'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SQUAD = 20

export default function NationalSquadSelectPage() {
  const navigate = useNavigate()
  const players = useGameStore(s => s.players)
  const year = useGameStore(s => s.currentSeason.year)
  const worldSquad = useGameStore(s => s.worldSquad)
  const setWorldSquad = useGameStore(s => s.setWorldSquad)

  const candidates = useMemo(() => ekidenCandidates(players, 'JPN', year, 50), [players, year])
  const stars = useMemo(() => individualStarIds(players, 'JPN', year), [players, year])

  // 初期選択：前年の代表（まだ候補にいる選手）をベースに、足りなければ持ちタイム上位で埋める
  const initial = useMemo(() => {
    const candIds = new Set(candidates.map(c => c.player.id))
    const base = (worldSquad?.playerIds ?? []).filter(id => candIds.has(id))
    const sel = new Set(base)
    for (const c of candidates) { if (sel.size >= SQUAD) break; sel.add(c.player.id) }
    return sel
  }, [candidates, worldSquad])

  const [picked, setPicked] = useState<Set<string>>(initial)
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else if (next.size < SQUAD) next.add(id)
    return next
  })

  const save = () => { setWorldSquad([...picked]); navigate(-1) }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',system-ui,sans-serif", background: C.bg, minHeight: '100dvh', paddingBottom: 96 }}>
      <div style={{ padding: '8px 8px 0' }}><BackButton /></div>
      <div style={{ padding: '2px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 900 }}>{year} WORLD ATHLETICS</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>日本 駅伝代表 選考</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>持ちタイム上位の候補{candidates.length}人から20人を選抜。紫＝個人種目の代表（基本は駅伝に入れない）。</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {candidates.map((c, i) => {
          const p = c.player
          const sel = picked.has(p.id)
          const isStar = stars.has(p.id)
          return (
            <button key={p.id} onClick={() => toggle(p.id)} className="btn-press" style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
              padding: '9px 12px', borderRadius: 12,
              background: sel ? `linear-gradient(180deg, ${C.purple}26, ${C.purple}10)` : C.surface2,
              border: `2px solid ${sel ? C.purple : C.border}`,
              fontFamily: 'inherit',
            }}>
              <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.textDim, width: 20, textAlign: 'center' }}>{i + 1}</span>
              <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border2}` }}>
                <PlayerFace playerId={p.id} nationality={p.nationality} size={36} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {isStar && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: `${C.purple}22`, border: `1px solid ${C.purple}66`, color: C.purple, fontWeight: 800, flexShrink: 0 }}>個人種目</span>}
                </div>
                <div style={{ fontSize: 10, color: C.gold, fontFamily: SAIRA, fontWeight: 800 }}>{bestPBLabel(p, year) ?? '—'}</div>
              </div>
              <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.textDim }}>{ovr(p)}</span>
              <span style={{
                width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: sel ? C.purple : 'transparent', border: `2px solid ${sel ? C.purple : C.border3}`, color: '#fff', fontSize: 14, fontWeight: 900,
              }}>{sel ? '✓' : ''}</span>
            </button>
          )
        })}
        {candidates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: C.textGhost, fontSize: 12, background: C.surface, borderRadius: 14 }}>
            まだ持ちタイムのある候補がいません（記録会が進むと選手が並びます）
          </div>
        )}
      </div>

      {/* 保存バー */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: `linear-gradient(180deg, transparent, ${C.bg} 30%)`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: picked.size === SQUAD ? C.purple : C.text }}>{picked.size}<span style={{ fontSize: 11, color: C.textDim }}>/{SQUAD}</span></div>
        <button onClick={save} disabled={picked.size === 0} style={{
          flex: 1, padding: '13px 0', borderRadius: 12, cursor: picked.size === 0 ? 'default' : 'pointer',
          background: picked.size === 0 ? C.surface2 : `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`,
          border: `2px solid ${C.purpleDark}`, color: picked.size === 0 ? C.textDim : '#fff',
          fontFamily: SAIRA, fontSize: 15, fontWeight: 900,
        }}>代表を確定する</button>
      </div>
    </div>
  )
}
