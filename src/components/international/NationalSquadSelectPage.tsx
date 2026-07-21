import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C, alpha } from '../../styles/tokens'
import { SPECIALTY_LABELS, type Specialty, type Player } from '../../types'
import { ovr, SPEC_COLOR, ratingColor, isStatMaxed } from '../../utils/playerUtils'
import PlayerFace from '../player/PlayerFace'
import PlayerRow from '../player/PlayerRow'
import { ekidenCandidates, type Candidate } from '../../engine/worldAthletics'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const SQUAD = 20

const ALL_STATS: [string, keyof Player['ratings']][] = [
  ['速', 'speed'], ['持', 'stamina'], ['登', 'mountainUp'],
  ['下', 'mountainDown'], ['ペ', 'pacing'], ['精', 'mental'], ['回', 'recovery'],
]

// 日本代表（駅伝20人）の選考画面。区間配置（LineupPhase）と同じ操作系：
// 20枠を並べ、枠タップ→候補ピッカー（ロスターと同じ全数値付きPlayerRow）から選んで埋める。
// 初期状態は前年代表ベース（不足は持ちタイム上位）で全枠埋まっていて、入れ替えたい枠だけ触ればいい。
export default function NationalSquadSelectPage() {
  const navigate = useNavigate()
  const players = useGameStore(s => s.players)
  const year = useGameStore(s => s.currentSeason.year)
  const worldSquad = useGameStore(s => s.worldSquad)
  const setWorldSquad = useGameStore(s => s.setWorldSquad)
  const worldRacePlans = useGameStore(s => s.worldRacePlans)
  const ensureWorldRacePlans = useGameStore(s => s.ensureWorldRacePlans)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  // コース（3戦の地形）を選考前に確定して見せる。地形を見て登り屋・下り屋を入れるか判断できる
  useEffect(() => { ensureWorldRacePlans() }, [ensureWorldRacePlans])
  const plans = worldRacePlans?.year === year ? worldRacePlans.plans : []

  const candidates = useMemo(() => ekidenCandidates(players, 'JPN', year, 50), [players, year])

  // 初期状態は「自分で確定した代表」だけを枠に配置（前年代表ベース）。勝手には埋めない。
  // 初めての選考は全枠空きで、自動選出ボタン or 枠タップで埋める
  const initialSlots = useMemo(() => {
    const candIds = new Set(candidates.map(c => c.player.id))
    const ids = (worldSquad?.playerIds ?? []).filter(id => candIds.has(id))
    const slots: Record<number, string> = {}
    ids.slice(0, SQUAD).forEach((id, i) => { slots[i + 1] = id })
    return slots
  }, [candidates, worldSquad])

  const [slots, setSlots] = useState<Record<number, string>>(initialSlots)
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)

  // ピッカーの絞り込み（特性）とソート（区間配置ピッカーと同じ操作系）
  const [spec, setSpec] = useState<Specialty | 'all'>('all')
  const [pickerSort, setPickerSort] = useState<'time' | 'ovr' | 'age' | 'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery'>('time')

  // 長押し(450ms)で選手詳細。発火した直後のタップ（選択）は打ち消す
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpFired = useRef(false)
  const pickerRowHandlers = (pid: string, onTap: () => void) => ({
    onPointerDown: () => { lpFired.current = false; lpTimer.current = setTimeout(() => { lpFired.current = true; openPlayerSheet(pid) }, 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onClick: () => { if (lpFired.current) { lpFired.current = false; return } onTap() },
  })

  const filledCount = Object.values(slots).filter(Boolean).length
  const full = filledCount >= SQUAD

  const slotOf = (pid: string): number | null => {
    for (const [k, v] of Object.entries(slots)) if (v === pid) return +k
    return null
  }

  // 枠に選手を入れる。他の枠にいる選手を選んだら入れ替え（区間配置と同じ挙動）
  const selectPlayer = (slotIdx: number, pid: string) => {
    const oldSlot = slotOf(pid)
    setSlots(prev => {
      const n = { ...prev }
      const displaced = n[slotIdx]
      if (oldSlot !== null && oldSlot !== slotIdx) {
        if (displaced) n[oldSlot] = displaced
        else delete n[oldSlot]
      }
      n[slotIdx] = pid
      return n
    })
    setPickerSlot(null)
  }

  const save = () => { setWorldSquad(Object.values(slots).filter(Boolean)); navigate(-1) }

  // 自動選出：空き枠を持ちタイム上位から埋める（区間配置の「自動配置」と同じ立ち位置）
  const autoSelect = () => {
    setSlots(prev => {
      const n = { ...prev }
      const used = new Set(Object.values(n))
      let slot = 1
      for (const c of candidates) {
        if (used.has(c.player.id)) continue
        while (slot <= SQUAD && n[slot]) slot++
        if (slot > SQUAD) break
        n[slot] = c.player.id
        used.add(c.player.id)
      }
      return n
    })
  }

  const pickerPlayers = useMemo(() => {
    const val = (c: Candidate) =>
      pickerSort === 'time' ? c.score
      : pickerSort === 'ovr' ? ovr(c.player)
      : pickerSort === 'age' ? -c.player.age
      : (c.player.ratings[pickerSort] as number)
    return candidates
      .filter(c => spec === 'all' || c.player.specialty === spec)
      .sort((a, b) => val(b) - val(a))
  }, [candidates, spec, pickerSort])

  // ── 候補ピッカー（区間配置のピッカーと同じ構造・ロスターと同じ全数値行）──
  if (pickerSlot !== null) {
    const cur = slots[pickerSlot] ? players.find(p => p.id === slots[pickerSlot]) : undefined
    return (
      <div style={{ fontFamily: SAIRA, background: C.bg, minHeight: '100dvh', paddingBottom: 40 }}>
        {/* ピッカーヘッダー */}
        <div style={{
          background: `linear-gradient(135deg, ${C.surface2}, ${C.bg})`,
          padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <BackButton onClick={() => setPickerSlot(null)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${C.purple}, ${alpha(C.purple, 0.55)})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, color: C.bg, fontFamily: SAIRA,
            }}>
              {pickerSlot}
            </div>
            <div>
              <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.purple, lineHeight: 1.2 }}>代表 枠{pickerSlot}</div>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>候補から選んでこの枠へ</div>
            </div>
            {cur && (
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ borderRadius: 5, overflow: 'hidden' }}>
                  <PlayerFace playerId={cur.id} nationality={cur.nationality} size={30} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{cur.name}</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.purple }}>{ovr(cur)}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ソート・絞り込みバー */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <select value={spec} onChange={e => setSpec(e.target.value as Specialty | 'all')} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="all">全特性</option>
            {(Object.keys(SPECIALTY_LABELS) as Specialty[]).map(s => (
              <option key={s} value={s}>{SPECIALTY_LABELS[s]}</option>
            ))}
          </select>
          <select value={pickerSort} onChange={e => setPickerSort(e.target.value as typeof pickerSort)} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="time">持ちタイム順</option>
            <option value="ovr">OVR順</option>
            <option value="age">年齢順</option>
            <option value="speed">スピード順</option>
            <option value="stamina">スタミナ順</option>
            <option value="mountainUp">登り順</option>
            <option value="mountainDown">下り順</option>
            <option value="pacing">ペース順</option>
            <option value="mental">精神力順</option>
            <option value="recovery">回復順</option>
          </select>
        </div>

        {/* 候補リスト（ロスターと同じ全数値付きの行） */}
        <div style={{ background: C.bg }}>
          {pickerPlayers.map(c => {
            const p = c.player
            const assignedSlot = slotOf(p.id)
            const isSelected = slots[pickerSlot] === p.id
            const isAssignedElsewhere = assignedSlot !== null && assignedSlot !== pickerSlot
            return (
              <PlayerRow
                key={p.id}
                player={p}
                selected={isSelected}
                handlers={pickerRowHandlers(p.id, () => selectPlayer(pickerSlot, p.id))}
                extra={<>
                  {isAssignedElsewhere && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(C.cyan, 0.12), color: C.cyan, fontWeight: 700, border: `1px solid ${alpha(C.cyan, 0.35)}`, flexShrink: 0 }}>⇄枠{assignedSlot}</span>}
                </>}
              />
            )
          })}
          {pickerPlayers.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: C.textGhost, fontSize: 12 }}>条件に合う候補なし</div>
          )}
        </div>
      </div>
    )
  }

  // ── メイン画面（20枠一覧・区間配置の区リストと同じ構造）──
  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New','Noto Sans JP',system-ui,sans-serif", background: C.bg, minHeight: '100dvh', paddingBottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
      <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
        <BackButton />
        <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900, color: C.text }}>日本代表 選考</span>
      </div>
      <div style={{ padding: '4px 16px 10px' }}>
        <div style={{ fontSize: 11, color: C.textDim }}>枠をタップして候補から選出（ピッカー内は長押しで選手詳細）</div>
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

      {/* 選出バー */}
      <div style={{ padding: '0 16px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.purple }}>代表メンバー</span>
        <span style={{ fontSize: 10, color: C.textDim }}>
          選出 <span style={{ color: full ? C.green : C.gold, fontWeight: 700, fontFamily: SAIRA }}>{filledCount}/{SQUAD}</span>
        </span>
        <button onClick={autoSelect} style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 8, border: `1.5px solid ${alpha(C.cyan, 0.6)}`, background: alpha(C.cyan, 0.1), color: C.cyan, cursor: 'pointer', fontFamily: 'inherit' }}>自動選出</button>
      </div>

      {/* 20枠リスト */}
      <div style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: SQUAD }, (_, i) => i + 1).map(idx => {
          const player = players.find(p => p.id === slots[idx])
          const specCol = player ? SPEC_COLOR[player.specialty] : C.textGhost
          return (
            <div
              key={idx}
              onClick={() => setPickerSlot(idx)}
              style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: player ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})` : C.surface2,
                border: `1px solid ${player ? alpha(C.purple, 0.4) : C.border2}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 枠番号 */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                  background: player
                    ? `linear-gradient(135deg, ${C.purple}, ${alpha(C.purple, 0.55)})`
                    : alpha(C.purple, 0.12),
                  border: player ? 'none' : `1px solid ${alpha(C.purple, 0.3)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 900, color: player ? C.bg : alpha(C.purple, 0.6), fontFamily: SAIRA,
                }}>
                  {idx}
                </div>

                {/* 選手名 or 空き枠 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {player ? (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{player.age}歳</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, color: C.textGhost }}>空き枠</div>
                  )}
                </div>

                {/* OVR＋顔 or 未設定 */}
                {player ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.purple, lineHeight: 1 }}>{ovr(player)}</div>
                    <div style={{ borderRadius: 6, overflow: 'hidden' }}>
                      <PlayerFace playerId={player.id} nationality={player.nationality} size={36} />
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: C.textGhost, flexShrink: 0 }}>未設定</div>
                )}

                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: C.textGhost, flexShrink: 0 }}>
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>

              {/* スペシャリティ + 全ステータス */}
              {player && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 7, paddingLeft: 46 }}>
                  <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(specCol, 0.1), color: specCol, fontWeight: 700, flexShrink: 0 }}>{SPECIALTY_LABELS[player.specialty]}</span>
                  {ALL_STATS.map(([label, key]) => {
                    const val = player.ratings[key] as number
                    return (
                      <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: C.textGhost }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: SAIRA, lineHeight: 1.1, color: ratingColor(val, isStatMaxed(player, key)) }}>{val}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ボトムバー（区間配置と同じ構造：クリア＋確定） */}
      <div style={{
        position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px',
        padding: '8px 14px 10px',
        background: `linear-gradient(to top, ${C.bg} 68%, ${alpha(C.bg, 0)})`,
        display: 'flex', alignItems: 'center', gap: 6,
        zIndex: 35,
      }}>
        <button onClick={() => setSlots({})} style={{ padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>クリア</button>
        {full ? (
          <button onClick={save} className="btn-game btn-game--purple" style={{ flex: 1 }}>
            <span className="btn-game__inner">この{filledCount}人で確定</span>
          </button>
        ) : (
          <button style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: C.surface2, color: C.textGhost, fontSize: 14, fontWeight: 700, cursor: 'default', fontFamily: 'inherit' }}>
            残り{SQUAD - filledCount}枠 未選出
          </button>
        )}
      </div>
    </div>
  )
}
