import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function CardPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '14px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${C.border2}`,
      boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
    }}>
      <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '8px' }}>{children}</div>
  )
}

const LEAGUE_KEY = '__league__'

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const { teams, players, pastSeasons, currentSeason } = useGameStore()

  const allRaceNames = [...new Set(
    pastSeasons.flatMap(s => s.races.filter(r => r.results).map(r => r.name))
  )].sort()

  const selectOptions = [{ value: LEAGUE_KEY, label: 'リーグ（総合）' }, ...allRaceNames.map(n => ({ value: n, label: n }))]
  const [selected, setSelected] = useState(LEAGUE_KEY)

  // 区間記録 TOP5 用
  const allRacesWithYear = [
    ...pastSeasons.flatMap(s => s.races.filter(r => r.results).map(r => ({ ...r, year: s.year }))),
    ...currentSeason.races.filter(r => r.results).map(r => ({ ...r, year: currentSeason.year })),
  ]
  const allSegIndices = [...new Set(
    allRacesWithYear.flatMap(r => r.results!.segmentResults.map(s => s.segmentIndex))
  )].sort((a, b) => a - b)
  const [selectedSegIdx, setSelectedSegIdx] = useState(allSegIndices[0] ?? 0)

  const segTop5 = allRacesWithYear
    .flatMap(r => {
      const seg = r.results!.segmentResults.find(s => s.segmentIndex === selectedSegIdx)
      if (!seg) return []
      return seg.runners.map(runner => ({
        ...runner,
        year: r.year,
        raceName: r.name,
      }))
    })
    .sort((a, b) => a.timeSec - b.timeSec)
    .slice(0, 5)

  const champRows = [...pastSeasons].reverse().map(season => {
    if (selected === LEAGUE_KEY) {
      const sorted = [...(season.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
      const champ = teams.find(t => t.id === sorted[0]?.teamId)
      return { year: season.year, teamName: champ?.shortName ?? '—', detail: `${sorted[0]?.totalPoints ?? 0}pt` }
    } else {
      const race = season.races.find(r => r.name === selected && r.results)
      if (!race?.results) return null
      const winnerId = race.results.teamRankings.find(r => r.rank === 1)?.teamId
      const champ = teams.find(t => t.id === winnerId)
      return { year: season.year, teamName: champ?.shortName ?? '—', detail: '' }
    }
  }).filter((x): x is { year: number; teamName: string; detail: string } => x !== null)

  const leagueSeasons = selected === LEAGUE_KEY ? [...pastSeasons].reverse() : null

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 16px 4px' }}>
        <BackButton onClick={() => navigate('/records')} />
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.orange, letterSpacing: '3px', fontWeight: '900', marginBottom: '2px' }}>RECORDS</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text, marginBottom: '14px' }}>歴史</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {pastSeasons.length === 0 ? (
          <CardPanel>
            <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>まだシーズン終了なし</div>
          </CardPanel>
        ) : (
          <>
            <select
              value={selected}
              onChange={e => setSelected(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: '10px',
                background: C.surface2, border: `1px solid ${C.border2}`,
                color: C.text, fontFamily: SAIRA, fontSize: '14px',
                appearance: 'none', cursor: 'pointer',
              }}
            >
              {selectOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <CardPanel>
              <SectionLabel>歴代チャンピオン</SectionLabel>
              {champRows.length === 0 ? (
                <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
              ) : champRows.map(row => (
                <div key={row.year} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, width: '44px' }}>{row.year}</span>
                  <span style={{ fontFamily: SAIRA, fontSize: '13px', color: C.gold }}>★</span>
                  <span style={{ flex: 1, fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{row.teamName}</span>
                  {row.detail && <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim }}>{row.detail}</span>}
                </div>
              ))}
            </CardPanel>

            {leagueSeasons && leagueSeasons.length > 0 && (
              <CardPanel>
                <SectionLabel>歴代リーグ順位</SectionLabel>
                {leagueSeasons.map(season => {
                  const sorted = [...(season.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
                  return (
                    <div key={season.year} style={{ marginBottom: '12px' }}>
                      <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.gold, fontWeight: '900', marginBottom: '4px', letterSpacing: '1px' }}>{season.year}</div>
                      {sorted.map((s, i) => {
                        const team = teams.find(t => t.id === s.teamId)
                        const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
                        return (
                          <div key={s.teamId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center' }}>{i + 1}</span>
                            <span style={{ flex: 1, fontFamily: SAIRA, fontSize: '11px', color: C.text }}>{team?.shortName ?? '—'}</span>
                            <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim }}>{s.totalPoints}pt</span>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </CardPanel>
            )}

            {allSegIndices.length > 0 && (
              <>
                <select
                  value={selectedSegIdx}
                  onChange={e => setSelectedSegIdx(Number(e.target.value))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: '10px',
                    background: C.surface2, border: `1px solid ${C.border2}`,
                    color: C.text, fontFamily: SAIRA, fontSize: '14px',
                    appearance: 'none', cursor: 'pointer',
                  }}
                >
                  {allSegIndices.map(idx => (
                    <option key={idx} value={idx}>{idx + 1}区</option>
                  ))}
                </select>

                <CardPanel>
                  <SectionLabel>歴代区間記録 TOP5</SectionLabel>
                  {segTop5.length === 0 ? (
                    <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
                  ) : segTop5.map((entry, i) => {
                    const player = players.find(p => p.id === entry.playerId)
                    const team = teams.find(t => t.id === entry.teamId)
                    const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
                    return (
                      <div key={`${entry.playerId}-${entry.year}-${entry.raceName}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center', textShadow: i <= 2 ? `0 0 6px ${rankCol}60` : 'none' }}>{i + 1}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{player?.name ?? '—'}</div>
                          <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim, marginTop: '2px' }}>{team?.shortName ?? '—'} / {entry.year} {entry.raceName}</div>
                        </div>
                        <span style={{ fontFamily: SAIRA, fontSize: '16px', fontWeight: '900', color: rankCol }}>{fmtTime(entry.timeSec)}</span>
                      </div>
                    )
                  })}
                </CardPanel>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
