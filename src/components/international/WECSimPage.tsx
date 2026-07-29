import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, fmtTime } from '../../store/gameStore'
import { formatDiff } from '../../engine/raceEngine'
import { terrainColor, terrainLabel } from '../race/raceUtils'
import type { WECRaceResult, WECSegmentNationTime } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const BG = '#0A0912'
const SURFACE = '#14121F'
const SURFACE2 = '#1E1B2E'
const BORDER = '#2E2B42'
const GOLD = '#C9A84C'
const RED = '#E8462A'
const TEXT = '#F0EDE8'
const TEXT_SUB = '#9B97A8'
const TEXT_DIM = '#5C5870'

const WEATHER_LABEL: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

const rankColor = (rank: number) =>
  rank === 1 ? GOLD : rank === 2 ? '#9B97A8' : rank === 3 ? '#CD7F32' : rank <= 5 ? TEXT_SUB : TEXT_DIM

type SimState =
  | { phase: 'race'; raceIdx: number; revealedSegs: number }
  | { phase: 'race_end'; raceIdx: number }
  | { phase: 'final' }

export default function WECSimPage() {
  const navigate = useNavigate()
  const result = useGameStore(s => s.currentSeason.worldEkidenResult)

  const [watching, setWatching] = useState(false)
  const [sim, setSim] = useState<SimState>({ phase: 'race', raceIdx: 0, revealedSegs: 0 })
  const [paused, setPaused] = useState(false)

  const races = result?.races ?? []
  const totalRaces = races.length

  const advance = useCallback(() => {
    setSim(prev => {
      if (prev.phase === 'final') return prev
      if (prev.phase === 'race_end') {
        const next = prev.raceIdx + 1
        if (next >= totalRaces) return { phase: 'final' }
        return { phase: 'race', raceIdx: next, revealedSegs: 0 }
      }
      const race = races[prev.raceIdx]
      if (!race) return { phase: 'final' }
      if (prev.revealedSegs < race.segmentNationTimes.length) {
        return { phase: 'race', raceIdx: prev.raceIdx, revealedSegs: prev.revealedSegs + 1 }
      }
      return { phase: 'race_end', raceIdx: prev.raceIdx }
    })
  }, [races, totalRaces])

  useEffect(() => {
    if (!watching || paused || sim.phase === 'final') return
    const delay = sim.phase === 'race_end' ? 2200 : sim.phase === 'race' && sim.revealedSegs === 0 ? 600 : 1600
    const t = setTimeout(advance, delay)
    return () => clearTimeout(t)
  }, [watching, sim, paused, advance])

  function skipToFinal() {
    setSim({ phase: 'final' })
  }

  if (!result || races.length === 0) {
    return (
      <div style={{ background: BG, minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button onClick={() => navigate('/international')} style={{ color: TEXT_SUB, background: 'none', border: 'none', fontFamily: SAIRA, fontSize: 14, cursor: 'pointer' }}>← 戻る</button>
      </div>
    )
  }

  if (!watching) {
    return (
      <div style={{ background: BG, minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: '0 24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: GOLD, letterSpacing: '4px', fontWeight: 900, marginBottom: 8 }}>WORLD EKIDEN CHAMPIONSHIP</div>
          <div style={{ fontFamily: SAIRA, fontSize: 28, fontWeight: 900, color: TEXT, marginBottom: 4 }}>{result.hostCity}</div>
          <div style={{ fontFamily: SAIRA, fontSize: 12, color: TEXT_SUB }}>{result.courseChar}</div>
        </div>
        <button
          onClick={() => setWatching(true)}
          style={{
            padding: '16px 48px', borderRadius: 14, cursor: 'pointer',
            background: `linear-gradient(180deg, #2a2540, #1a1630)`,
            border: `2px solid ${GOLD}`,
            boxShadow: `0 4px 0 #5a3500, 0 8px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)`,
            color: GOLD, fontFamily: SAIRA, fontSize: 18, fontWeight: 900, letterSpacing: '2px',
          }}
        >
          観戦開始
        </button>
        <button onClick={() => navigate('/international')} style={{ color: TEXT_SUB, background: 'none', border: 'none', fontFamily: SAIRA, fontSize: 13, cursor: 'pointer' }}>
          ← 戻る
        </button>
      </div>
    )
  }

  // Compute cumulative times up to revealedSegs for current race
  function getCumTimes(race: WECRaceResult, upTo: number): Record<string, number> {
    const cum: Record<string, number> = {}
    for (let i = 0; i < upTo; i++) {
      const snt = race.segmentNationTimes[i]
      if (!snt) continue
      snt.nations.forEach(n => { cum[n.country] = (cum[n.country] ?? 0) + n.timeSec })
    }
    return cum
  }

  // Cumulative points so far
  function getAccPoints(upToRaceIdx: number, includeCurrentRaceResult = false): Record<string, number> {
    const acc: Record<string, number> = {}
    const limit = includeCurrentRaceResult ? upToRaceIdx + 1 : upToRaceIdx
    for (let i = 0; i < limit; i++) {
      races[i]?.countryResults.forEach(c => { acc[c.country] = (acc[c.country] ?? 0) + c.points })
    }
    return acc
  }

  const progressPct = (raceIdx: number, revealedSegs: number) => {
    const total = races.reduce((s, r) => s + r.segmentNationTimes.length, 0)
    const done = races.slice(0, raceIdx).reduce((s, r) => s + r.segmentNationTimes.length, 0) + revealedSegs
    return total > 0 ? (done / total) * 100 : 0
  }

  // ── FINAL PHASE ─────────────────────────────────────────────────
  if (sim.phase === 'final') {
    const japanFinalRank = result.japanFinalRank
    const medalLabel = japanFinalRank === 1 ? '金メダル' : japanFinalRank === 2 ? '銀メダル' : japanFinalRank === 3 ? '銅メダル' : null
    return (
      <div style={{ fontFamily: SAIRA, background: BG, minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ position: 'sticky', top: 0, background: BG, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: GOLD, letterSpacing: '3px' }}>FINAL RESULT</div>
          </div>
          <button onClick={() => navigate('/international')} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_SUB, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>完了</button>
        </div>

        <div style={{ padding: '16px 14px 0' }}>
          {/* Japan result banner */}
          <div style={{ marginBottom: 14, borderRadius: 16, padding: '24px 16px', textAlign: 'center', background: `linear-gradient(180deg, ${SURFACE2}, ${SURFACE})`, border: `2px solid ${japanFinalRank <= 3 ? GOLD : BORDER}`, boxShadow: japanFinalRank <= 3 ? `0 4px 20px rgba(201,168,76,0.25)` : 'none', position: 'relative', overflow: 'hidden' }}>
            {japanFinalRank <= 3 && <div style={{ position: 'absolute', inset: 3, border: `1px solid rgba(201,168,76,0.2)`, borderRadius: 12, pointerEvents: 'none' }} />}
            <div style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: '3px', marginBottom: 4 }}>{result.year}年 世界選手権</div>
            <div style={{ fontSize: 11, color: TEXT_DIM, marginBottom: 6 }}>{result.hostCity} / {result.courseChar}</div>
            {medalLabel && <div style={{ fontSize: 14, color: rankColor(japanFinalRank), letterSpacing: '3px', marginBottom: 4 }}>{medalLabel}</div>}
            <div style={{ fontSize: 60, fontWeight: 900, color: rankColor(japanFinalRank), lineHeight: 1, marginBottom: 8 }}>{japanFinalRank}位</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              {races.map((r, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: TEXT_DIM }}>第{i + 1}レース</div>
                  <div style={{ fontSize: 14, fontWeight: 900, color: rankColor(r.japanRank) }}>{r.japanRank}位</div>
                </div>
              ))}
            </div>
          </div>

          {/* Final standings */}
          <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px', marginBottom: 6 }}>3レース合計ポイント</div>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${BORDER}`, marginBottom: 14 }}>
            {result.finalStandings.map((s, idx) => {
              const isJapan = s.country === 'JPN'
              return (
                <div key={s.country} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 60px', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: idx < result.finalStandings.length - 1 ? `1px solid ${BORDER}` : 'none', background: isJapan ? 'rgba(201,168,76,0.05)' : SURFACE }}>
                  <div style={{ fontSize: 14, fontWeight: 900, color: rankColor(s.finalRank), textAlign: 'center', fontFamily: SAIRA }}>{s.finalRank}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {isJapan && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(201,168,76,0.15)', color: GOLD, fontWeight: 700, border: `1px solid rgba(201,168,76,0.35)` }}>日本</span>}
                    <span style={{ fontSize: 13, fontWeight: isJapan ? 800 : 400, color: isJapan ? TEXT : TEXT_SUB }}>{s.name}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: s.finalRank <= 3 ? GOLD : TEXT_DIM, textAlign: 'right' }}>{s.totalPoints}pt</div>
                </div>
              )
            })}
          </div>

          {/* Per-race summary */}
          {races.map((race, ri) => (
            <div key={ri} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px', marginBottom: 5 }}>第{ri + 1}レース ({WEATHER_LABEL[race.weather]})</div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
                {race.legResults.map((leg, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderBottom: i < race.legResults.length - 1 ? `1px solid ${BORDER}` : 'none', background: SURFACE }}>
                    <div style={{ fontSize: 12, fontWeight: 900, color: GOLD, width: 24, flexShrink: 0 }}>{leg.segmentIndex}区</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: TEXT }}>{leg.playerName}</div>
                      <div style={{ fontSize: 9, color: TEXT_DIM }}>{leg.distanceKm}km</div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SUB, fontFamily: 'monospace' }}>{fmtTime(leg.timeSec)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── RACE END PHASE ───────────────────────────────────────────────
  if (sim.phase === 'race_end') {
    const race = races[sim.raceIdx]
    const accPoints = getAccPoints(sim.raceIdx, true)
    const sortedPoints = Object.entries(accPoints).sort((a, b) => b[1] - a[1])
    return (
      <div style={{ fontFamily: SAIRA, background: BG, minHeight: '100dvh', paddingBottom: 80 }}>
        <div style={{ position: 'sticky', top: 0, background: BG, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px 8px', zIndex: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>第{sim.raceIdx + 1}レース 終了</span>
            <button onClick={skipToFinal} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_SUB, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>最終結果 →</button>
          </div>
          <div style={{ height: 3, background: BORDER, borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${progressPct(sim.raceIdx, race?.segmentNationTimes.length ?? 0)}%`, background: `linear-gradient(90deg, ${RED}, ${GOLD})`, borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ padding: '14px 14px 0' }}>
          {/* Japan result this race */}
          <div style={{ marginBottom: 14, padding: '16px', borderRadius: 14, textAlign: 'center', background: `linear-gradient(180deg, ${SURFACE2}, ${SURFACE})`, border: `1px solid ${race?.japanRank && race.japanRank <= 3 ? GOLD : BORDER}` }}>
            <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px', marginBottom: 4 }}>第{sim.raceIdx + 1}レース 日本</div>
            <div style={{ fontSize: 44, fontWeight: 900, color: race ? rankColor(race.japanRank) : TEXT_DIM, lineHeight: 1, marginBottom: 4 }}>{race?.japanRank ?? '—'}位</div>
            <div style={{ fontSize: 11, color: TEXT_DIM }}>{race ? fmtTime(race.japanTime) : ''}</div>
          </div>

          {/* Cumulative points */}
          <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px', marginBottom: 6 }}>暫定ポイント ({sim.raceIdx + 1}/{totalRaces}レース終了)</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
            {sortedPoints.slice(0, 8).map(([country, pts], i) => {
              const cr = race?.countryResults.find(c => c.country === country)
              const isJapan = country === 'JPN'
              const countryName = race?.countryResults.find(c => c.country === country)?.name
                ?? result.finalStandings.find(s => s.country === country)?.name ?? country
              return (
                <div key={country} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: i < 7 ? `1px solid ${BORDER}` : 'none', background: isJapan ? 'rgba(201,168,76,0.05)' : SURFACE }}>
                  <div style={{ width: 20, textAlign: 'center', fontSize: 13, fontWeight: 900, color: rankColor(i + 1), fontFamily: 'monospace' }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, color: isJapan ? TEXT : TEXT_SUB, fontWeight: isJapan ? 800 : 400 }}>{countryName}</div>
                  <div style={{ fontSize: 10, color: TEXT_DIM, marginRight: 4 }}>+{cr?.points ?? 0}pt</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: i <= 2 ? GOLD : TEXT_DIM }}>{pts}pt</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── RACE SIM PHASE ───────────────────────────────────────────────
  const race = races[sim.raceIdx]
  if (!race) return null

  const { revealedSegs } = sim
  const currentSNT: WECSegmentNationTime | undefined = race.segmentNationTimes[revealedSegs - 1]
  const segCol = currentSNT ? terrainColor(currentSNT.uphillPct, currentSNT.downhillPct) : '#7986CB'

  const cumTimes = getCumTimes(race, revealedSegs)
  const sortedCum = Object.entries(cumTimes).filter(([, t]) => t > 0).sort(([, a], [, b]) => a - b)
  const leaderTime = sortedCum[0]?.[1] ?? 0

  const japanSegTime = currentSNT?.nations.find(n => n.country === 'JPN')?.timeSec
  const segWinner = currentSNT?.nations[0]
  const segWinnerIsJapan = segWinner?.country === 'JPN'

  const japanCumRank = sortedCum.findIndex(([c]) => c === 'JPN') + 1

  const totalSegs = race.segmentNationTimes.length
  const raceProgress = totalSegs > 0 ? (revealedSegs / totalSegs) * 100 : 0
  const overallProgress = progressPct(sim.raceIdx, revealedSegs)

  // Name lookup
  const countryName = (country: string) =>
    race.countryResults.find(c => c.country === country)?.name ?? country

  return (
    <div style={{ fontFamily: SAIRA, background: BG, minHeight: '100dvh', paddingBottom: 80 }}>

      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: `linear-gradient(180deg, #0D0C1A, ${BG})`, borderBottom: `1px solid ${BORDER}`, padding: '10px 16px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: RED, boxShadow: `0 0 6px ${RED}` }} />
            <span style={{ fontSize: 10, color: RED, fontWeight: 800, letterSpacing: '2px' }}>LIVE</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>世界選手権 第{sim.raceIdx + 1}レース / {totalRaces}</span>
            <span style={{ fontSize: 9, color: TEXT_DIM }}>({WEATHER_LABEL[race.weather]})</span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setPaused(p => !p)} style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_DIM, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>
              {paused ? '再開' : '一時停止'}
            </button>
            <button onClick={skipToFinal} style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${BORDER}`, background: SURFACE, color: TEXT_SUB, fontSize: 10, cursor: 'pointer', fontFamily: SAIRA }}>最終結果 →</button>
          </div>
        </div>
        {/* Overall + race progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${overallProgress}%`, background: `linear-gradient(90deg, ${RED}, ${GOLD})`, transition: 'width 0.6s ease', borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 10, color: GOLD, fontWeight: 700, flexShrink: 0, fontFamily: 'monospace' }}>{revealedSegs}/{totalSegs}区</span>
        </div>
        {/* Race progress bars */}
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {Array.from({ length: totalRaces }).map((_, i) => {
            const r = races[i]
            const done = i < sim.raceIdx
            const current = i === sim.raceIdx
            const pct = done ? 100 : current ? raceProgress : 0
            return (
              <div key={i} style={{ flex: 1 }}>
                <div style={{ fontSize: 8, color: done ? GOLD : current ? TEXT_SUB : TEXT_DIM, marginBottom: 2, textAlign: 'center' }}>
                  第{i + 1}{done && r ? ` ${r.japanRank}位` : ''}
                </div>
                <div style={{ height: 2, background: BORDER, borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: done ? GOLD : TEXT_SUB, transition: 'width 0.6s ease', borderRadius: 1 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current segment spotlight */}
      {currentSNT && (
        <div style={{ margin: '10px 12px', borderRadius: 16, overflow: 'hidden', border: `1.5px solid ${segCol}40` }}>
          {/* Segment header */}
          <div style={{ padding: '10px 14px 8px', background: `linear-gradient(135deg, ${segCol}20, ${SURFACE})`, borderBottom: `1px solid ${segCol}25`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${segCol}, ${segCol}80)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: BG, flexShrink: 0 }}>
              {currentSNT.segmentIndex}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: segCol }}>{terrainLabel(currentSNT.uphillPct, currentSNT.downhillPct, currentSNT.distanceKm)}</div>
              <div style={{ fontSize: 10, color: TEXT_DIM }}>{currentSNT.distanceKm}km / 上り{currentSNT.uphillPct}%</div>
            </div>
          </div>

          {/* Segment winner */}
          <div style={{ padding: '12px 14px', background: segWinnerIsJapan ? 'linear-gradient(135deg, rgba(201,168,76,0.1), transparent)' : SURFACE, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ fontSize: 9, color: segWinnerIsJapan ? GOLD : TEXT_DIM, letterSpacing: '2px', marginBottom: 5 }}>
              {segWinnerIsJapan ? '★ 日本 区間賞！' : '区間賞'}
            </div>
            {segWinner && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: GOLD, lineHeight: 1 }}>1</div>
                <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: segWinnerIsJapan ? GOLD : TEXT }}>{countryName(segWinner.country)}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: GOLD, fontFamily: 'monospace' }}>{fmtTime(segWinner.timeSec)}</div>
              </div>
            )}
          </div>

          {/* Japan result (if not winner) */}
          {japanSegTime !== undefined && !segWinnerIsJapan && (() => {
            const japanSegRank = (currentSNT.nations.findIndex(n => n.country === 'JPN') + 1)
            const rc = japanSegRank <= 3 ? GOLD : japanSegRank <= 6 ? TEXT_SUB : TEXT_DIM
            return (
              <div style={{ padding: '10px 14px', background: BG, borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px', marginBottom: 4 }}>日本</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: rc, lineHeight: 1 }}>{japanSegRank}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: TEXT }}>{race.legResults.find(l => l.segmentIndex === currentSNT.segmentIndex)?.playerName ?? '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: rc, fontFamily: 'monospace' }}>{fmtTime(japanSegTime)}</div>
                    {segWinner && <div style={{ fontSize: 9, color: TEXT_DIM }}>{formatDiff(japanSegTime - segWinner.timeSec)}</div>}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Top 5 nations this segment */}
          <div style={{ background: BG }}>
            {currentSNT.nations.slice(segWinnerIsJapan ? 1 : 0, 5).map(n => {
              if (n.country === 'JPN' && !segWinnerIsJapan) return null
              const isJapan = n.country === 'JPN'
              const rank = currentSNT.nations.findIndex(x => x.country === n.country) + 1
              if (rank === 1) return null
              return (
                <div key={n.country} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: `1px solid #141220`, background: isJapan ? 'rgba(201,168,76,0.04)' : 'transparent' }}>
                  <div style={{ width: 18, textAlign: 'center', fontSize: 11, fontWeight: 700, color: rank === 2 ? '#9B97A8' : rank === 3 ? '#CD7F32' : TEXT_DIM }}>{rank}</div>
                  <div style={{ flex: 1, fontSize: 11, color: isJapan ? TEXT : TEXT_SUB, fontWeight: isJapan ? 700 : 400 }}>{n.name}</div>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: isJapan ? GOLD : TEXT_DIM }}>{fmtTime(n.timeSec)}</div>
                  {segWinner && <div style={{ fontSize: 10, color: TEXT_DIM, fontFamily: 'monospace', minWidth: 40, textAlign: 'right' }}>{formatDiff(n.timeSec - segWinner.timeSec)}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Live cumulative standings */}
      {sortedCum.length > 0 && (
        <div style={{ margin: '0 12px 10px', borderRadius: 16, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
          <div style={{ padding: '8px 14px', background: SURFACE, borderBottom: `1px solid ${BORDER}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: TEXT_DIM, letterSpacing: '2px' }}>暫定順位（累計タイム）</span>
            <span style={{ fontSize: 9, color: TEXT_DIM }}>{revealedSegs}区間</span>
          </div>
          {sortedCum.slice(0, 8).map(([country, cumTime], i) => {
            const isJapan = country === 'JPN'
            const gap = cumTime - leaderTime
            const maxGap = sortedCum.length > 1 ? (sortedCum[Math.min(7, sortedCum.length - 1)][1] - leaderTime) : 1
            const barPct = i === 0 ? 100 : Math.max(15, 100 - (gap / Math.max(maxGap, 1)) * 75)
            const rc = i === 0 ? GOLD : i === 1 ? '#9B97A8' : i === 2 ? '#CD7F32' : TEXT_DIM
            return (
              <div key={country} style={{ padding: '7px 14px', borderBottom: `1px solid #141220`, background: isJapan ? 'rgba(201,168,76,0.05)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <div style={{ width: 20, textAlign: 'center', fontSize: 13, fontWeight: 900, color: rc, fontFamily: 'monospace' }}>{isJapan ? '▶' : ''}{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, color: isJapan ? TEXT : TEXT_SUB, fontWeight: isJapan ? 800 : 400 }}>{countryName(country)}</div>
                  <div style={{ fontFamily: 'monospace', textAlign: 'right', fontSize: 12, fontWeight: 700, color: i === 0 ? GOLD : isJapan ? RED : TEXT_DIM }}>
                    {i === 0 ? fmtTime(cumTime) : `+${formatDiff(gap).replace('+', '')}`}
                  </div>
                </div>
                <div style={{ marginLeft: 28, height: 2, background: BORDER, borderRadius: 1, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: isJapan ? `linear-gradient(90deg, ${GOLD}, #E8C86A)` : i === 0 ? `${GOLD}60` : BORDER, transition: 'width 0.6s ease', borderRadius: 1 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Japan position summary */}
      {revealedSegs > 0 && japanCumRank > 0 && (
        <div style={{ margin: '0 12px 10px', padding: '10px 14px', borderRadius: 12, background: SURFACE, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px' }}>日本 暫定順位</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: rankColor(japanCumRank), lineHeight: 1 }}>{japanCumRank}位</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: TEXT_DIM }}>累計</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT_SUB, fontFamily: 'monospace' }}>{fmtTime(cumTimes['JPN'] ?? 0)}</div>
          </div>
        </div>
      )}

      {/* Previous segments */}
      {revealedSegs > 1 && (
        <div style={{ margin: '0 12px', borderRadius: 14, overflow: 'hidden', border: `1px solid #1A1828` }}>
          <div style={{ padding: '7px 14px', background: SURFACE, borderBottom: `1px solid #1A1828` }}>
            <span style={{ fontSize: 9, color: TEXT_DIM, letterSpacing: '2px' }}>日本 区間タイム</span>
          </div>
          {race.legResults.slice(0, revealedSegs - 1).reverse().map(leg => {
            const snt = race.segmentNationTimes.find(s => s.segmentIndex === leg.segmentIndex)
            const japanRank = snt ? (snt.nations.findIndex(n => n.country === 'JPN') + 1) : 0
            const sCol = snt ? terrainColor(snt.uphillPct, snt.downhillPct) : TEXT_DIM
            return (
              <div key={leg.segmentIndex} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: `1px solid #141220` }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, background: `${sCol}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: sCol, flexShrink: 0 }}>{leg.segmentIndex}</div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 10, color: TEXT_SUB }}>{leg.playerName}</span>
                  <span style={{ fontSize: 9, color: TEXT_DIM, marginLeft: 4 }}>{leg.distanceKm}km</span>
                </div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: japanRank === 1 ? GOLD : japanRank <= 3 ? '#4CAF50' : TEXT_DIM }}>{japanRank}位</div>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: TEXT_DIM }}>{fmtTime(leg.timeSec)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
