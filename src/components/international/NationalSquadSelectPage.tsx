import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { ekidenCandidates, bestPBLabel, type Candidate } from '../../engine/worldAthletics'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SQUAD = 20

// 日本代表（駅伝20人）の選考画面。
// 上＝代表メンバー（タップで外す）、下＝候補（タップで選出）。長押しで選手詳細。
export default function NationalSquadSelectPage() {
  const navigate = useNavigate()
  const players = useGameStore(s => s.players)
  const year = useGameStore(s => s.currentSeason.year)
  const worldSquad = useGameStore(s => s.worldSquad)
  const setWorldSquad = useGameStore(s => s.setWorldSquad)
  const worldRacePlans = useGameStore(s => s.worldRacePlans)
  const ensureWorldRacePlans = useGameStore(s => s.ensureWorldRacePlans)
  const longPress = usePlayerLongPress()
  // コース（3戦の地形）を選考前に確定して見せる。地形を見て登り屋・下り屋を入れるか判断できる
  useEffect(() => { ensureWorldRacePlans() }, [ensureWorldRacePlans])
  const plans = worldRacePlans?.year === year ? worldRacePlans.plans : []
  // 長押しで詳細を開いた直後のタップ（指を離した時のclick）で選出/解除が発火しないようにする
  const lpFired = useRef(false)
  const lpGuard = (pid: string) => {
    const h = longPress(pid)
    return {
      ...h,
      onPointerDown: () => { lpFired.current = false; h.onPointerDown() },
      onPointerUp: () => { h.onPointerUp() },
    }
  }

  const candidates = useMemo(() => ekidenCandidates(players, 'JPN', year, 50), [players, year])

  // 前年代表のうち今も候補にいる選手をベースに、足りなければ持ちタイム上位で埋める
  const initial = useMemo(() => {
    const candIds = new Set(candidates.map(c => c.player.id))
    const sel = new Set((worldSquad?.playerIds ?? []).filter(id => candIds.has(id)))
    for (const c of candidates) { if (sel.size >= SQUAD) break; sel.add(c.player.id) }
    return sel
  }, [candidates, worldSquad])

  const [picked, setPicked] = useState<Set<string>>(initial)
  const add = (id: string) => setPicked(prev => prev.size >= SQUAD ? prev : new Set(prev).add(id))
  const remove = (id: string) => setPicked(prev => { const n = new Set(prev); n.delete(id); return n })

  const members = candidates.filter(c => picked.has(c.player.id))
  const rest = candidates.filter(c => !picked.has(c.player.id))
  const full = picked.size >= SQUAD

  const save = () => { setWorldSquad([...picked]); navigate(-1) }

  const Row = ({ c, selected }: { c: Candidate; selected: boolean }) => {
    const p = c.player
    return (
      <button
        {...lpGuard(p.id)}
        onClick={() => { selected ? remove(p.id) : add(p.id) }}
        className="btn-press"
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', cursor: 'pointer',
          padding: '9px 12px', borderRadius: 12,
          background: selected ? `linear-gradient(180deg, ${C.purple}26, ${C.purple}10)` : C.surface2,
          border: `2px solid ${selected ? C.purple : C.border}`,
          fontFamily: 'inherit',
          opacity: !selected && full ? 0.45 : 1,
        }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${C.border2}` }}>
          <PlayerFace playerId={p.id} nationality={p.nationality} size={36} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
          <div style={{ fontSize: 10, color: C.gold, fontFamily: SAIRA, fontWeight: 800 }}>{bestPBLabel(p, year) ?? '—'}</div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.textDim }}>{ovr(p)}</span>
        {selected ? (
          <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, background: C.purple, color: '#fff', fontSize: 11, fontWeight: 900 }}>外す</span>
        ) : (
          <span style={{ flexShrink: 0, padding: '4px 10px', borderRadius: 8, background: full ? C.surface : 'transparent', border: `2px solid ${full ? C.border : C.purple}`, color: full ? C.textDim : C.purple, fontSize: 11, fontWeight: 900 }}>{full ? '枠なし' : '選出'}</span>
        )}
      </button>
    )
  }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',system-ui,sans-serif", background: C.bg, minHeight: '100dvh', paddingBottom: 96 }}>
      <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
        <BackButton />
        <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900, color: C.text }}>日本代表 選考</span>
      </div>
      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{ fontSize: 11, color: C.textDim }}>タップで選出・外す／長押しで選手詳細</div>
      </div>

      {/* 大会コース（3戦の地形）。区間ごとの距離・登り・下りを見て編成を決める */}
      {plans.length > 0 && (
        <div style={{ padding: '0 16px 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.purple, marginBottom: 6 }}>大会コース（全{plans.length}戦）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plans.map((plan, i) => {
              const total = Math.round(plan.segments.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10
              const avgUp = Math.round(plan.segments.reduce((s, x) => s + x.uphillPct, 0) / plan.segments.length)
              const avgDown = Math.round(plan.segments.reduce((s, x) => s + x.downhillPct, 0) / plan.segments.length)
              const chara = avgUp >= 20 ? '山型' : avgDown >= 15 ? '下り型' : avgUp >= 12 ? 'やや起伏' : '平坦型'
              return (
                <div key={i} style={{ padding: '9px 12px', borderRadius: 11, background: C.surface2, border: `1px solid ${C.border2}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.text }}>第{i + 1}戦</span>
                    <span style={{ fontSize: 10, color: C.textDim }}>{plan.segments.length}区間・{total}km</span>
                    <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, color: C.purple, background: `${C.purple}18`, border: `1px solid ${C.purple}44` }}>{chara}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {plan.segments.map((s, j) => (
                      <span key={j} style={{ fontSize: 8.5, fontFamily: SAIRA, fontWeight: 700, color: s.uphillPct >= 20 ? C.orange : s.downhillPct >= 15 ? C.cyan : C.textSub, padding: '2px 5px', borderRadius: 4, background: C.surface, border: `1px solid ${C.border}` }}>
                        {j + 1}区 {s.distanceKm}k{s.uphillPct >= 20 ? ' 登' : s.downhillPct >= 15 ? ' 下' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 代表メンバー */}
      <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.purple }}>代表メンバー</span>
        <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: full ? C.purple : C.text }}>{picked.size}<span style={{ fontSize: 10, color: C.textDim }}>/{SQUAD}</span></span>
      </div>
      <div style={{ padding: '0 16px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {members.map(c => <Row key={c.player.id} c={c} selected />)}
        {members.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: C.textGhost, fontSize: 12, background: C.surface, borderRadius: 12 }}>下の候補から選出してください</div>
        )}
      </div>

      {/* 候補 */}
      <div style={{ padding: '0 16px 6px' }}>
        <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.textSub }}>候補（持ちタイム順）</span>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rest.map(c => <Row key={c.player.id} c={c} selected={false} />)}
        {candidates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: C.textGhost, fontSize: 12, background: C.surface, borderRadius: 14 }}>
            まだ持ちタイムのある候補がいません（記録会で持ちタイムがつくと並びます）
          </div>
        )}
      </div>

      {/* 確定バー */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '10px 16px calc(10px + env(safe-area-inset-bottom))', background: `linear-gradient(180deg, transparent, ${C.bg} 30%)`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: full ? C.purple : C.text }}>{picked.size}<span style={{ fontSize: 11, color: C.textDim }}>/{SQUAD}</span></div>
        <button onClick={save} disabled={picked.size === 0} style={{
          flex: 1, padding: '13px 0', borderRadius: 12, cursor: picked.size === 0 ? 'default' : 'pointer',
          background: picked.size === 0 ? C.surface2 : `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`,
          border: `2px solid ${C.purpleDark}`, color: picked.size === 0 ? C.textDim : '#fff',
          fontFamily: SAIRA, fontSize: 15, fontWeight: 900,
        }}>この{picked.size}人で確定</button>
      </div>
    </div>
  )
}
