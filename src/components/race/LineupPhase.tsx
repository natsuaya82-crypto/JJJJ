import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import type { Player, Race, Nationality } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { calcBaseAbility, calcAffinity } from '../../engine/raceEngine'
import { ovr, effSegOvr, SPEC_COLOR, ratingColor, isStatMaxed } from '../../utils/playerUtils'
import { nationalityToForeignCategory } from '../../engine/playerGenerator'
import { terrainColor, terrainLabel } from './raceUtils'
import PlayerFace from '../player/PlayerFace'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

// 下ナビは lineup 中は非表示なので、広告(50px)の上にボトムバーを置く
const BOTTOM_OFFSET = 50

function autoFill(
  segments: import('../../types').Segment[],
  players: Player[],
  currentLineup: Record<number, string>,
  setRaceLineup: (i: number, id: string) => void,
) {
  const assignedIds = new Set(Object.values(currentLineup).filter(Boolean))
  const natCounts: Record<string, number> = {}
  for (const pid of assignedIds) {
    const p = players.find(x => x.id === pid)
    if (p) natCounts[p.nationality] = (natCounts[p.nationality] ?? 0) + 1
  }
  for (const seg of segments) {
    if (currentLineup[seg.index]) continue
    const maxNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const currentMax = Math.max(0, ...Object.values(natCounts))
    let bestId = '', bestScore = -1
    for (const p of players) {
      if (assignedIds.has(p.id)) continue
      let score = calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
                * calcAffinity(p.specialty, seg.uphillPct, seg.downhillPct, seg.distanceKm)
      if (p.nationality === maxNat && currentMax >= 5) score *= 1.04
      if (score > bestScore) { bestScore = score; bestId = p.id }
    }
    if (bestId) {
      const chosen = players.find(x => x.id === bestId)
      if (chosen) natCounts[chosen.nationality] = (natCounts[chosen.nationality] ?? 0) + 1
      assignedIds.add(bestId)
      setRaceLineup(seg.index, bestId)
    }
  }
}

const ALL_STATS: [string, keyof import('../../types').Player['ratings']][] = [
  ['速', 'speed'], ['持', 'stamina'], ['登', 'mountainUp'],
  ['下', 'mountainDown'], ['ペ', 'pacing'], ['精', 'mental'], ['回', 'recovery'],
]

export function LineupPhase({
  race, raceNumber, totalRaces, mainPlayers, raceLineup, allSegsFilled,
  pickerSeg, setPickerSeg, setRaceLineup, clearRaceLineup, onStart, onSkipRace,
  onBack, lastLineup, unavailable,
}: {
  race: Race
  raceNumber: number
  totalRaces: number
  mainPlayers: Player[]
  raceLineup: Record<number, string>
  assignedIds: Set<string>
  allSegsFilled: boolean
  pickerSeg: number | null
  setPickerSeg: (i: number | null) => void
  setRaceLineup: (i: number, id: string) => void
  clearRaceLineup: () => void
  onStart: (tactics: Record<number, string>) => void
  onSkipRace?: () => void
  weatherLabel: Record<string, string>
  raceStrategy: 'aggressive' | 'balanced' | 'conservative'
  setRaceStrategy: (s: 'aggressive' | 'balanced' | 'conservative') => void
  teamTalk: string
  setTeamTalk: (t: string) => void
  onBack?: () => void
  lastLineup?: Record<number, string>
  unavailable?: Record<string, string>  // playerId → 出走不可の理由ラベル。選択不可・グレー表示になる
}) {
  const navigate = useNavigate()
  const [segTactics] = useState<Record<number, string>>({})
  const [pickerSort, setPickerSort] = useState<'seg' | 'ovr' | 'age' | 'fatigue' | 'speed' | 'stamina' | 'mountainUp' | 'mountainDown' | 'pacing' | 'mental' | 'recovery'>('seg')

  useEffect(() => {
    setPickerSeg(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const totalDist = race.segments.reduce((s, sg) => s + sg.distanceKm, 0)
  const filledCount = Object.values(raceLineup).filter(Boolean).length

  const availablePlayers = useMemo(() => mainPlayers.filter(p => !unavailable?.[p.id]), [mainPlayers, unavailable])

  const greedyRec = useMemo(() => {
    const pairs: { segIndex: number; playerId: string; score: number }[] = []
    for (const seg of race.segments) {
      for (const p of availablePlayers) {
        const score = calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
                    * calcAffinity(p.specialty, seg.uphillPct, seg.downhillPct, seg.distanceKm)
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
  }, [race.segments, availablePlayers])

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

  const avgUp = totalDist > 0
    ? Math.round(race.segments.reduce((s, sg) => s + sg.uphillPct * sg.distanceKm, 0) / totalDist) : 0
  const avgDown = totalDist > 0
    ? Math.round(race.segments.reduce((s, sg) => s + sg.downhillPct * sg.distanceKm, 0) / totalDist) : 0

  const assignedPlayers = Object.values(raceLineup).filter(Boolean).map(id => mainPlayers.find(p => p.id === id)).filter((p): p is Player => !!p)
  const lineupNatCounts: Record<string, number> = {}
  for (const p of assignedPlayers) lineupNatCounts[p.nationality] = (lineupNatCounts[p.nationality] ?? 0) + 1
  const maxNatCount = assignedPlayers.length > 0 ? Math.max(...Object.values(lineupNatCounts)) : 0
  const dominantNat = Object.entries(lineupNatCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const chemBonus = maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0
  const NAT_LABELS: Record<string, string> = { JPN: '日本', KOR: '韓国', ETH: 'エチオピア', KEN: 'ケニア', UGA: 'ウガンダ', CHN: '中国', TWN: '台湾', TAN: 'タンザニア', USA: '米国', EUR: '欧州' }
  const lineupForeignCount = assignedPlayers.filter(p => (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'foreign').length
  const lineupAsianCount = assignedPlayers.filter(p => (p.foreignCategory ?? nationalityToForeignCategory(p.nationality)) === 'asian').length

  const pickerSegData = pickerSeg !== null ? race.segments.find(s => s.index === pickerSeg) : null
  const pickerPlayers = useMemo(() => {
    if (!pickerSegData) return []
    return mainPlayers.map(p => {
      const score = calcBaseAbility(p.ratings, pickerSegData.uphillPct, pickerSegData.downhillPct, pickerSegData.distanceKm, pickerSegData.statWeights)
                  * calcAffinity(p.specialty, pickerSegData.uphillPct, pickerSegData.downhillPct, pickerSegData.distanceKm)
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
              width: 40, height: 40, borderRadius: 10, flexShrink: 0,
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
                  <div style={{ borderRadius: 5, overflow: 'hidden' }}>
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
          <select value={pickerSort} onChange={e => setPickerSort(e.target.value as typeof pickerSort)} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
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
          {pickerPlayers.map(({ p, assignedSeg }, rank) => {
            const playerOvr = ovr(p)
            const isSelected = raceLineup[pickerSeg] === p.id
            const isAssignedElsewhere = assignedSeg !== null && assignedSeg !== pickerSeg
            const isRec = greedyRec[pickerSeg] === p.id
            const specCol = SPEC_COLOR[p.specialty]
            const r = p.ratings
            const blockReason = unavailable?.[p.id]
            return (
              <div
                key={p.id}
                onClick={() => selectPlayer(pickerSeg, p.id)}
                style={{
                  padding: '8px 12px 5px',
                  background: isSelected
                    ? `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${alpha(C.gold, 0.03)})`
                    : isAssignedElsewhere ? `linear-gradient(135deg, ${alpha(C.cyan, 0.14)}, ${alpha(C.cyan, 0.06)})` : isRec ? alpha(pickerSegCol, 0.03) : 'transparent',
                  border: isSelected ? `2px solid ${alpha(C.gold, 0.5)}` : isAssignedElsewhere ? `2px solid ${alpha(C.cyan, 0.55)}` : `2px solid transparent`,
                  boxShadow: isSelected ? `0 3px 0 #5a3500, 0 5px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)` : 'none',
                  borderBottom: isSelected || isAssignedElsewhere ? undefined : `1px solid ${C.surface2}`,
                  cursor: blockReason ? 'default' : 'pointer',
                  opacity: blockReason ? 0.45 : 1,
                  borderLeft: isSelected || isAssignedElsewhere ? undefined : (isRec ? `3px solid ${alpha(pickerSegCol, 0.31)}` : `3px solid transparent`),
                  marginBottom: isSelected || isAssignedElsewhere ? 2 : 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <div style={{ flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
                    <PlayerFace playerId={p.id} nationality={p.nationality as Nationality} size={34} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: isRec ? 800 : 600, color: p.status === 'injured' ? C.red : isAssignedElsewhere ? C.cyan : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {isSelected && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(pickerSegCol, 0.15), color: pickerSegCol, fontWeight: 800, flexShrink: 0 }}>選択中</span>}
                      {isRec && !isSelected && <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(pickerSegCol, 0.12), color: pickerSegCol, fontWeight: 800, flexShrink: 0 }}>最適</span>}
                      {isAssignedElsewhere && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(C.cyan, 0.12), color: C.cyan, fontWeight: 700, border: `1px solid ${alpha(C.cyan, 0.35)}`, flexShrink: 0 }}>⇄{assignedSeg}区</span>}
                      {blockReason && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, backgroundColor: alpha(C.red, 0.12), color: C.red, fontWeight: 700, border: `1px solid ${alpha(C.red, 0.3)}`, flexShrink: 0 }}>{blockReason}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 1 }}>
                      <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 4, backgroundColor: alpha(specCol, 0.09), color: specCol, fontWeight: 700 }}>{SPECIALTY_LABELS[p.specialty]}</span>
                      <span style={{ fontSize: 9, color: C.textDim }}>{p.age}歳</span>
                      <span style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 700, color: (p.fatigue ?? 0) < 40 ? C.green : (p.fatigue ?? 0) < 70 ? C.gold : C.red }}>疲{p.fatigue ?? 0}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 900, fontFamily: SAIRA, lineHeight: 1, color: rank === 0 ? pickerSegCol : C.textSub }}>{playerOvr}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', paddingLeft: 40 }}>
                  {ALL_STATS.map(([label, key]) => {
                    const val = r[key] as number
                    return (
                      <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: C.textGhost }}>{label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, fontFamily: SAIRA, lineHeight: 1.2, color: ratingColor(val, isStatMaxed(p, key)) }}>{val}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // --- メイン画面（区一覧） ---
  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: `${BOTTOM_OFFSET + 80}px` }}>

      {/* ヘッダー */}
      <div style={{ background: `linear-gradient(135deg, ${C.surface2}, ${C.bg})`, padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <BackButton onClick={onBack ?? (() => navigate(-1))} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '2px' }}>第{raceNumber}戦 / 全{totalRaces}戦 — {race.date}</div>
          <div style={{ fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1.1, marginBottom: 8 }}>{race.name}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '5px' }}>
            {[
              { label: '天候', value: weatherLabel[race.conditions.weather] },
              { label: '気温', value: `${race.conditions.temperature}℃` },
              { label: '平均上り', value: `${avgUp}%` },
              { label: '平均下り', value: `${avgDown}%` },
            ].map(({ label, value }) => (
              <div key={label} style={{ padding: '5px 6px', borderRadius: '6px', backgroundColor: alpha(C.border, 0.6) }}>
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
            配置 <span style={{ color: filledCount === race.segments.length ? C.green : C.gold, fontWeight: '700', fontFamily: SAIRA }}>{filledCount}/{race.segments.length}</span>
          </span>
          <span style={{ fontSize: '9px', color: lineupAsianCount > 5 ? C.red : C.textDim }}>アジア {lineupAsianCount}/5</span>
          <span style={{ fontSize: '9px', color: lineupForeignCount > 3 ? C.red : C.textDim }}>外国 {lineupForeignCount}/3</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {assignedPlayers.length >= 3 && dominantNat && chemBonus > 0 && (
            <div style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '5px', backgroundColor: alpha('#7EC8A0', 0.08), border: `1px solid ${alpha('#7EC8A0', 0.25)}`, color: '#7EC8A0', fontWeight: '700' }}>
              {NAT_LABELS[dominantNat] ?? dominantNat} 士気+{chemBonus}
            </div>
          )}
          {lastLineup && Object.keys(lastLineup).length > 0 && (
            <button onClick={() => { clearRaceLineup(); Object.entries(lastLineup).forEach(([k, v]) => { if (!unavailable?.[v]) setRaceLineup(+k, v) }) }} style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '6px', border: `1px solid ${C.textGhost}`, background: 'transparent', color: C.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>前回</button>
          )}
        </div>
      </div>

      {/* 区リスト */}
      <div style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {race.segments.map(seg => {
          const player = mainPlayers.find(p => p.id === raceLineup[seg.index])
          const segCol = terrainColor(seg.uphillPct, seg.downhillPct)
          const playerOvr = player ? ovr(player) : 0
          const specCol = player ? SPEC_COLOR[player.specialty] : C.textGhost
          return (
            <div
              key={seg.index}
              onClick={() => setPickerSeg(seg.index)}
              style={{
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: player ? `linear-gradient(135deg, ${C.surface3}, ${C.surface2})` : C.surface2,
                border: `1px solid ${player ? alpha(segCol, 0.4) : C.border2}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* 区番号 */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8, flexShrink: 0,
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
                  <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: segCol, lineHeight: 1.2 }}>
                    {terrainLabel(seg.uphillPct, seg.downhillPct, seg.distanceKm)}
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
                    <div style={{ borderRadius: 6, overflow: 'hidden' }}>
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

      {/* ボトムバー */}
      <div style={{
        position: 'fixed', bottom: BOTTOM_OFFSET, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px',
        padding: '8px 14px 12px',
        background: `linear-gradient(to top, ${C.bg} 80%, transparent)`,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', gap: '6px',
        zIndex: 35,
      }}>
        <button onClick={clearRaceLineup} style={{ padding: '10px 12px', borderRadius: '12px', border: `1px solid ${C.border2}`, backgroundColor: 'transparent', color: C.textDim, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>クリア</button>
        <button
          onClick={() => autoFill(race.segments, availablePlayers, raceLineup, setRaceLineup)}
          style={{
            padding: '11px 18px', borderRadius: 11,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.cyan}`, color: C.cyan,
            fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 0 #0e3f5a, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
            position: 'relative', overflow: 'hidden',
          }}
        >
          <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }} />
          自動配置
        </button>
        {allSegsFilled ? (
          <>
            {onSkipRace && (
              <button
                onClick={onSkipRace}
                title="イベントなしで一気に結果へ"
                style={{
                  flexShrink: 0, padding: '11px 14px', borderRadius: 11,
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${C.border2}`, color: C.textSub,
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 0 rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}
              >
                スキップ
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 4l8 8-8 8M13 4l8 8-8 8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            )}
            <button className="btn-game btn-game--gold" onClick={() => onStart(segTactics)} style={{ flex: 1 }}>
              <span className="btn-game__inner">レース開始！</span>
            </button>
          </>
        ) : (
          <button style={{ flex: 1, padding: '12px', borderRadius: '12px', border: 'none', background: C.surface2, color: C.textGhost, fontSize: '14px', fontWeight: '700', cursor: 'default', fontFamily: 'inherit' }}>
            {race.segments.length - filledCount}区間未設定
          </button>
        )}
      </div>
    </div>
  )
}
