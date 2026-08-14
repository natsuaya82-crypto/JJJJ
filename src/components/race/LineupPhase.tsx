import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import BackButton from '../ui/BackButton'
import { SkipRaceButton } from './SkipRaceButton'
import type { Player, Race, Nationality } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { calcBaseAbility, calcSegmentAffinity, calcConditionModifier } from '../../engine/raceEngine'
import { ovr, effSegOvr, SPEC_COLOR, ratingColor, isStatMaxed } from '../../utils/playerUtils'
import { terrainColor, terrainLabel } from './raceUtils'
import PlayerFace from '../player/PlayerFace'
import PlayerRow from '../player/PlayerRow'
import { useAdHeight } from '../layout/Layout'
import { C, alpha, COMPETITION_BTN, SAIRA, bottomStack } from '../../styles/tokens'
import type { Competition } from '../../styles/tokens'
import { natLabel } from '../../data/nationalities'
import { SpecChip } from '../player/PlayerChips'
import { courseProfile } from '../../data/races'


const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

function autoFill(
  segments: import('../../types').Segment[],
  players: Player[],
  currentLineup: Record<number, string>,
  setRaceLineup: (i: number, id: string) => void,
) {
  const assignedIds = new Set(Object.values(currentLineup).filter(Boolean))
  // ── 全区間の組み合わせで最適化する ──────────────────────────────
  // 区間を1つずつ「その区間で一番いい選手」で埋めていくと、後ろの区間に余り物が回る。
  // 1区に置いた選手が実は5区でしか活きない、という取りこぼしが起きるので、
  // 「埋めたあとに入れ替えて良くなるならずっと入れ替える」で全体の合計を上げる。
  const open = segments.filter(seg => !currentLineup[seg.index])
  if (open.length === 0) return
  const pool = players.filter(p => !assignedIds.has(p.id))
  // 区間×選手の点数表。1回だけ作って使い回す（毎回計算すると入れ替えのたびに重い）
  const scoreOf = (p: Player, seg: import('../../types').Segment) =>
    calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
    * calcSegmentAffinity(p.specialty, seg)
    * calcConditionModifier(p.fatigue ?? 0, p.morale ?? 70, p.form ?? 0)
  const table = new Map<string, number>()
  for (const seg of open) for (const p of pool) table.set(`${seg.index}:${p.id}`, scoreOf(p, seg))
  const at = (segIdx: number, pid: string) => table.get(`${segIdx}:${pid}`) ?? 0

  // ① まず難所（上り/下りが急な区間）から貪欲に埋める
  const orderedSegs = [...open].sort((a, b) => Math.max(b.uphillPct, b.downhillPct) - Math.max(a.uphillPct, a.downhillPct))
  const pick: Record<number, string> = {}
  const used = new Set<string>()
  for (const seg of orderedSegs) {
    let bestId = '', bestScore = -1
    for (const p of pool) {
      if (used.has(p.id)) continue
      const sc = at(seg.index, p.id)
      if (sc > bestScore) { bestScore = sc; bestId = p.id }
    }
    if (bestId) { pick[seg.index] = bestId; used.add(bestId) }
  }

  // ② 入れ替えて合計が上がるなら入れ替える。上がらなくなるまで繰り返す。
  //    ・出走同士の交換（1区と5区を入れ替える）
  //    ・控えとの交換（その区間だけ見れば下でも、全体では上がることがある）
  const segIdx = orderedSegs.map(sg => sg.index)
  for (let loop = 0; loop < 8; loop++) {
    let improved = false
    for (let i = 0; i < segIdx.length; i++) {
      const a = segIdx[i]
      // 出走同士
      for (let j = i + 1; j < segIdx.length; j++) {
        const b = segIdx[j]
        const now = at(a, pick[a]) + at(b, pick[b])
        const swapped = at(a, pick[b]) + at(b, pick[a])
        if (swapped > now + 1e-9) { const t = pick[a]; pick[a] = pick[b]; pick[b] = t; improved = true }
      }
      // 控えとの交換
      for (const p of pool) {
        if (used.has(p.id)) continue
        if (at(a, p.id) > at(a, pick[a]) + 1e-9) {
          used.delete(pick[a]); used.add(p.id); pick[a] = p.id; improved = true
        }
      }
    }
    if (!improved) break
  }

  for (const seg of orderedSegs) if (pick[seg.index]) setRaceLineup(seg.index, pick[seg.index])
}

const ALL_STATS: [string, keyof import('../../types').Player['ratings']][] = [
  ['速', 'speed'], ['持', 'stamina'], ['登', 'mountainUp'],
  ['下', 'mountainDown'], ['ペ', 'pacing'], ['精', 'mental'], ['回', 'recovery'],
]

export function LineupPhase({
  race, raceNumber, totalRaces, mainPlayers, raceLineup, allSegsFilled,
  pickerSeg, setPickerSeg, setRaceLineup, clearRaceLineup, onStart, onSkipRace,
  onBack, unavailable, competition,
  startLabel, startDisabled, hideBack, bottomInset, headerNote,
}: {
  race: Race
  raceNumber: number
  totalRaces: number
  mainPlayers: Player[]
  raceLineup: Record<number, string>
  assignedIds?: Set<string>
  allSegsFilled: boolean
  pickerSeg: number | null
  setPickerSeg: (i: number | null) => void
  setRaceLineup: (i: number, id: string) => void
  clearRaceLineup: () => void
  onStart: (tactics: Record<number, string>) => void
  onSkipRace?: () => void
  weatherLabel?: Record<string, string>
  raceStrategy?: 'aggressive' | 'balanced' | 'conservative'
  setRaceStrategy?: (s: 'aggressive' | 'balanced' | 'conservative') => void
  onBack?: () => void
  unavailable?: Record<string, string>  // playerId → 出走不可の理由ラベル。選択不可・グレー表示になる
  competition: Competition   // スタートボタンの色（大会ごとに1色。COMPETITION_BTNから引く）
  // ここから下はオンライン対戦で使う差し替え。本編は今までどおり何も渡さない。
  startLabel?: string      // 下の大ボタンの文字（例：このオーダーで提出）
  startDisabled?: boolean  // 提出済みで押せない状態
  hideBack?: boolean       // 戻るボタンを出さない（部屋から抜けてしまうため）
  bottomInset?: number     // 下タブが出ている画面用。ボトムバーをその分だけ上げる
  headerNote?: React.ReactNode  // 見出しの下に出す一行（残り時間など）
}) {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
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
  const [segTactics] = useState<Record<number, string>>({})
  const [pickerSort, setPickerSort] = useState<'seg' | 'ovr' | 'age' | 'fatigue' | 'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery'>('seg')

  useEffect(() => {
    setPickerSeg(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // セーブ破損・想定外データで segments / conditions が欠けていても、
  // ここで例外を投げるとルートごとアンマウントされて画面が真っ白になるため必ず正規化して使う。
  const segments = useMemo(
    () => (Array.isArray(race?.segments) ? race.segments : []).filter(sg => sg && typeof sg.index === 'number')
      .map(sg => ({
        ...sg,
        distanceKm: Number.isFinite(sg.distanceKm) ? sg.distanceKm : 0,
        uphillPct: Number.isFinite(sg.uphillPct) ? sg.uphillPct : 0,
        downhillPct: Number.isFinite(sg.downhillPct) ? sg.downhillPct : 0,
      })),
    [race?.segments],
  )
  const filledCount = Object.values(raceLineup).filter(Boolean).length

  const availablePlayers = useMemo(() => mainPlayers.filter(p => !unavailable?.[p.id]), [mainPlayers, unavailable])

  const greedyRec = useMemo(() => {
    const pairs: { segIndex: number; playerId: string; score: number }[] = []
    for (const seg of segments) {
      for (const p of availablePlayers) {
        // おすすめ(最適)表示も自動配置と同じ基準（疲労・士気・調子込み）で算出する
        const score = calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
                    * calcSegmentAffinity(p.specialty, seg)
                    * calcConditionModifier(p.fatigue ?? 0, p.morale ?? 70, p.form ?? 0)
        pairs.push({ segIndex: seg.index, playerId: p.id, score })
      }
    }
    pairs.sort((a, b) => b.score - a.score)
    const usedSegs = new Set<number>(), usedPlayers = new Set<string>()
    const rec: Record<number, string> = {}
    for (const { segIndex, playerId } of pairs) {
      if (usedSegs.has(segIndex) || usedPlayers.has(playerId)) continue
      rec[segIndex] = playerId
      usedSegs.add(segIndex)
      usedPlayers.add(playerId)
    }
    return rec
  }, [segments, availablePlayers])

  function getPlayerSegment(playerId: string): number | null {
    for (const [k, v] of Object.entries(raceLineup)) {
      if (v === playerId) return +k
    }
    return null
  }

  function selectPlayer(segIndex: number, playerId: string) {
    if (unavailable?.[playerId]) return
    const oldSeg = getPlayerSegment(playerId)
    const displaced = raceLineup[segIndex]
    if (oldSeg !== null && oldSeg !== segIndex) {
      setRaceLineup(oldSeg, displaced ?? '')
    }
    setRaceLineup(segIndex, playerId)
    setPickerSeg(null)
  }

  // 起伏の平均は data/races の courseProfile 1本（コースの種別の判定と同じ計算）
  const profile = courseProfile(segments)
  const avgUp = Math.round(profile.avgUp)
  const avgDown = Math.round(profile.avgDown)

  const assignedPlayers = Object.values(raceLineup).filter(Boolean).map(id => mainPlayers.find(p => p.id === id)).filter((p): p is Player => !!p)
  const lineupNatCounts: Record<string, number> = {}
  for (const p of assignedPlayers) lineupNatCounts[p.nationality] = (lineupNatCounts[p.nationality] ?? 0) + 1
  const maxNatCount = assignedPlayers.length > 0 ? Math.max(...Object.values(lineupNatCounts)) : 0
  const dominantNat = Object.entries(lineupNatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const chemBonus = maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0
  // アジア/外国人の配置枠は廃止したためカウントは持たない（誰でも起用可）

  const pickerSegData = pickerSeg !== null ? segments.find(s => s.index === pickerSeg) : null
  const pickerPlayers = useMemo(() => {
    if (!pickerSegData) return []
    return mainPlayers.map(p => {
      const score = calcBaseAbility(p.ratings, pickerSegData.uphillPct, pickerSegData.downhillPct, pickerSegData.distanceKm, pickerSegData.statWeights)
                  * calcSegmentAffinity(p.specialty, pickerSegData)
      const assignedSeg = getPlayerSegment(p.id)
      return { p, score, assignedSeg }
    })
    .sort((a, b) => {
      // 出走不可の選手は常に末尾
      const ua = unavailable?.[a.p.id] ? 1 : 0
      const ub = unavailable?.[b.p.id] ? 1 : 0
      if (ua !== ub) return ua - ub
      switch (pickerSort) {
        case 'ovr':    return ovr(b.p) - ovr(a.p)
        case 'age':    return a.p.age - b.p.age
        case 'fatigue': return (a.p.fatigue ?? 0) - (b.p.fatigue ?? 0)
        case 'speed': case 'stamina': case 'mountainUp': case 'mountainDown':
        case 'pacing': case 'mental': case 'recovery':
          return (b.p.ratings[pickerSort] as number) - (a.p.ratings[pickerSort] as number)
        default:       return b.score - a.score
      }
    })
  }, [pickerSegData, mainPlayers, raceLineup, pickerSort, unavailable]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickerSegCol = pickerSegData ? terrainColor(pickerSegData.uphillPct, pickerSegData.downhillPct) : C.blue

  // --- 選手ピッカー画面 ---
  if (pickerSeg !== null && pickerSegData) {
    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: 40 }}>
        {/* ピッカーヘッダー */}
        <div style={{
          background: `linear-gradient(135deg, ${C.surface2}, ${C.bg})`,
          padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <BackButton onClick={() => setPickerSeg(null)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{
              width: 40, height: 40,flexShrink: 0,
              background: `linear-gradient(135deg, ${pickerSegCol}, ${alpha(pickerSegCol, 0.55)})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, fontWeight: 900, color: C.bg, fontFamily: SAIRA,
            }}>
              {pickerSeg}
            </div>
            <div>
              <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: pickerSegCol, lineHeight: 1.2 }}>
                {terrainLabel(pickerSegData.uphillPct, pickerSegData.downhillPct, pickerSegData.distanceKm)}
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{pickerSegData.distanceKm.toFixed(1)}km</div>
            </div>
            {raceLineup[pickerSeg] && (() => {
              const ap = mainPlayers.find(p => p.id === raceLineup[pickerSeg])
              if (!ap) return null
              const eff = effSegOvr(ap, pickerSegData.uphillPct, pickerSegData.downhillPct, pickerSegData.distanceKm, pickerSegData.statWeights)
              return (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{overflow: 'hidden' }}>
                    <PlayerFace playerId={ap.id} nationality={ap.nationality as Nationality} size={30} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{ap.name}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: pickerSegCol }}>{eff}</div>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>

        {/* ソート・絞り込みバー */}
        <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
          <select value={pickerSort} onChange={e => setPickerSort(e.target.value as typeof pickerSort)} style={{ flex: 1, padding: '5px 8px',border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
            <option value="seg">区間適性順</option>
            <option value="ovr">OVR順</option>
            <option value="age">年齢順</option>
            <option value="fatigue">疲労少ない順</option>
            <option value="speed">スピード順</option>
            <option value="stamina">スタミナ順</option>
            <option value="mountainUp">登り順</option>
            <option value="mountainDown">下り順</option>
            <option value="pacing">ペース順</option>
            <option value="mental">精神力順</option>
            <option value="recovery">回復順</option>
          </select>
        </div>

        {/* 選手リスト */}
        <div style={{ background: C.bg }}>
          {pickerPlayers.map(({ p, assignedSeg }) => {
            const isSelected = raceLineup[pickerSeg] === p.id
            const isAssignedElsewhere = assignedSeg !== null && assignedSeg !== pickerSeg
            const isRec = greedyRec[pickerSeg] === p.id
            const blockReason = unavailable?.[p.id]
            return (
              <div key={p.id} style={{ opacity: blockReason ? 0.45 : 1 }}>
                <PlayerRow
                  player={p}
                  selected={isSelected}
                  handlers={pickerRowHandlers(p.id, () => { if (!blockReason) selectPlayer(pickerSeg, p.id) })}
                  extra={<>
                    {isRec && !isSelected && <span style={{ fontSize: 8, padding: '1px 4px',backgroundColor: alpha(pickerSegCol, 0.15), color: pickerSegCol, fontWeight: 800, flexShrink: 0 }}>最適</span>}
                    {isAssignedElsewhere && <span style={{ fontSize: 8, padding: '1px 5px',backgroundColor: alpha(C.cyan, 0.12), color: C.cyan, fontWeight: 700, border: `1px solid ${alpha(C.cyan, 0.35)}`, flexShrink: 0 }}>⇄{assignedSeg}区</span>}
                    {blockReason && <span style={{ fontSize: 8, padding: '1px 5px',backgroundColor: alpha(C.red, 0.12), color: C.red, fontWeight: 700, border: `1px solid ${alpha(C.red, 0.3)}`, flexShrink: 0 }}>{blockReason}</span>}
                  </>}
                />
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // --- メイン画面（区一覧） ---
  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: bottomStack(adH, { extra: 88 }) }}>

      {/* ヘッダー */}
      <div style={{ background: `linear-gradient(135deg, ${C.surface2}, ${C.bg})`, padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {!hideBack && <BackButton onClick={onBack ?? (() => navigate(-1))} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '2px' }}>第{raceNumber}戦 / 全{totalRaces}戦{race.date ? ` — ${race.date}` : ''}</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1.1, marginBottom: headerNote ? 4 : 8 }}>{race.name}</div>
          {headerNote && <div style={{ marginBottom: 8 }}>{headerNote}</div>}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px' }}>
            {[
              { label: '天候', value: weatherLabel[race.conditions?.weather] ?? '—' },
              { label: '気温', value: race.conditions?.temperature != null ? `${race.conditions.temperature}℃` : '—' },
              { label: '平均上り', value: `${avgUp}%` },
              { label: '平均下り', value: `${avgDown}%` },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '5px 6px',backgroundColor: alpha(C.border, 0.6) }}>
                <div style={{ fontSize: '8px', color: C.textDim, marginBottom: '1px' }}>{label}</div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 制約バー */}
      <div style={{ padding: '8px 16px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '10px', color: C.textDim }}>
            配置 <span style={{ color: filledCount === segments.length ? C.green : C.gold, fontWeight: '700', fontFamily: SAIRA }}>{filledCount}/{segments.length}</span>
          </span>
          {/* アジア/外国人の配置枠は廃止（誰でも起用可）。カウンター表示も削除 */}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {assignedPlayers.length >= 3 && dominantNat && chemBonus > 0 && (
            <div style={{ fontSize: '9px', padding: '2px 6px',backgroundColor: alpha('#7EC8A0', 0.08), border: `1px solid ${alpha('#7EC8A0', 0.25)}`, color: '#7EC8A0', fontWeight: '700' }}>
              {natLabel(dominantNat as Nationality)} 士気+{chemBonus}
            </div>
          )}
          <button onClick={() => autoFill(segments, availablePlayers, raceLineup, setRaceLineup)} style={{ fontSize: '11px', fontWeight: 700, padding: '5px 12px',border: `1.5px solid ${alpha(C.cyan, 0.6)}`, background: alpha(C.cyan, 0.1), color: C.cyan, cursor: 'pointer', fontFamily: 'inherit' }}>自動配置</button>
        </div>
      </div>

      {/* 区リスト */}
      <div style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segments.map(seg => {
          const player = mainPlayers.find(p => p.id === raceLineup[seg.index])
          const segCol = terrainColor(seg.uphillPct, seg.downhillPct)
          const playerOvr = player ? ovr(player) : 0
          return (
            <div
              key={seg.index}
              onClick={() => setPickerSeg(seg.index)}
              style={{
                padding: '10px 12px',cursor: 'pointer',
                background: player ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})` : C.surface2,
                border: `1px solid ${player ? alpha(segCol, 0.4) : C.border2}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 区番号 */}
                <div style={{
                  width: 36, height: 36,flexShrink: 0,
                  background: player
                    ? `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.55)})`
                    : alpha(segCol, 0.12),
                  border: player ? 'none' : `1px solid ${alpha(segCol, 0.3)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 900, color: player ? C.bg : alpha(segCol, 0.6), fontFamily: SAIRA,
                }}>
                  {seg.index}
                </div>

                {/* 地形・距離 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: segCol, lineHeight: 1.2 }}>
                      {terrainLabel(seg.uphillPct, seg.downhillPct, seg.distanceKm)}
                    </div>
                    {seg.recommended && (
                      <span style={{ fontSize: 8, padding: '1px 5px',backgroundColor: alpha(SPEC_COLOR[seg.recommended], 0.1), color: SPEC_COLOR[seg.recommended], fontWeight: 700, flexShrink: 0 }}>
                        {SPECIALTY_LABELS[seg.recommended]}推奨
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{seg.distanceKm.toFixed(1)}km</div>
                </div>

                {/* 配置選手 or 未設定 */}
                {player ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{player.name}</div>
                      <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: segCol, lineHeight: 1 }}>{playerOvr}</div>
                    </div>
                    <div style={{overflow: 'hidden' }}>
                      <PlayerFace playerId={player.id} nationality={player.nationality as Nationality} size={36} />
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
                  <SpecChip specialty={player.specialty} size="sm" highlight={seg.recommended === player.specialty} />
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

      {/* ボトムバー（fixed：常に画面下端＝広告の上に固定。選手を何人置いても位置が動かない） */}
      <div style={{
        position: 'fixed', bottom: bottomStack(adH, { extra: bottomInset ?? 0 }), left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px',
        padding: '8px 14px calc(10px)',
        background: `linear-gradient(to top, ${C.bg} 68%, ${alpha(C.bg, 0)})`,
        display: 'flex', alignItems: 'center', gap: '6px',
        zIndex: 35,
      }}>
        <button onClick={clearRaceLineup} style={{ padding: '10px 12px',border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>クリア</button>
        {allSegsFilled ? (
          <>
            {onSkipRace && (
              <SkipRaceButton onClick={onSkipRace} />
            )}
            <button
              className={`btn-game ${COMPETITION_BTN[competition]}`}
              onClick={() => { if (!startDisabled) onStart(segTactics) }}
              style={{ flex: 1, opacity: startDisabled ? 0.5 : 1 }}
            >
              <span className="btn-game__inner">{startLabel ?? 'レース開始！'}</span>
            </button>
          </>
        ) : (
          <button style={{ flex: 1, padding: '12px',border: 'none', background: C.surface2, color: C.textGhost, fontSize: '14px', fontWeight: '700', cursor: 'default', fontFamily: 'inherit' }}>
            {segments.length - filledCount}区間未設定
          </button>
        )}
      </div>
    </div>
  )
}
