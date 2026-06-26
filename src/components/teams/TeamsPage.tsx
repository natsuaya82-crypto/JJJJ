import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { SPECIALTY_LABELS } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR } from '../../utils/playerUtils'

function RecentForm({ raceResults }: { raceResults: { rank: number }[] }) {
  const last5 = raceResults.slice(-5)
  if (last5.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {last5.map((r, i) => {
        const col = r.rank === 1 ? '#C9A84C' : r.rank <= 3 ? '#4CAF50' : r.rank <= 6 ? '#5C5870' : '#3A3758'
        return <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: col }}/>
      })}
    </div>
  )
}

export default function TeamsPage() {
  const { teams, players, playerTeamId, currentSeason, openPlayerSheet, scoutOpponentPlayer } = useGameStore()
  const navigate = useNavigate()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'rank' | 'name'>('rank')
  const [showDraftOrder, setShowDraftOrder] = useState(false)

  const scoutPoints = currentSeason.scoutPoints ?? 0
  const scoutedOpponents = currentSeason.scoutedOpponents ?? []

  function getScoutLevel(playerId: string): 0 | 1 | 2 {
    const entry = scoutedOpponents.find(s => s.playerId === playerId)
    return (entry?.level ?? 0) as 0 | 1 | 2
  }

  const standings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const getRank = (teamId: string) => standings.findIndex(s => s.teamId === teamId) + 1

  const sortedTeams = [...teams].sort((a, b) =>
    sortBy === 'rank' ? getRank(a.id) - getRank(b.id) : a.name.localeCompare(b.name)
  )

  return (
    <div style={{
      paddingTop: '4px', paddingBottom: '80px',
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
    }}>
      <div style={{ padding: '8px 16px 4px' }}>
        <BackButton onClick={() => navigate('/teams')}/>
      </div>
      {/* Header */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px', marginBottom: '4px' }}>
          {currentSeason.year} SEASON
        </div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#F0EDE8', marginBottom: '6px' }}>他チーム</div>
        <div style={{ fontSize: '10px', color: '#5C5870', marginBottom: '10px', lineHeight: 1.5 }}>
          相手チームの能力値はスカウト派遣で解禁。スカウトPT残:
          <span style={{ color: scoutPoints > 0 ? '#C9A84C' : '#E8462A', fontWeight: '700', marginLeft: '4px' }}>
            {scoutPoints}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'rank' | 'name')} style={{ flex: 1, padding: '7px 10px', borderRadius: '10px', backgroundColor: '#1E1B2E', border: '1px solid #2E2B42', color: '#9B97A8', fontSize: '11px', fontFamily: 'inherit', outline: 'none' }}>
            <option value="rank">順位順</option>
            <option value="name">チーム名順</option>
          </select>
          <button onClick={() => setShowDraftOrder(v => !v)} style={{
            padding: '7px 12px', borderRadius: '10px', border: '1px solid #2E2B42', cursor: 'pointer',
            backgroundColor: showDraftOrder ? '#7986CB20' : '#1E1B2E',
            color: showDraftOrder ? '#7986CB' : '#9B97A8',
            fontSize: '11px', fontWeight: '700', fontFamily: 'inherit',
          }}>
            ドラフト順
          </button>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        {sortedTeams.map(team => {
          const rank = getRank(team.id)
          const standing = standings.find(s => s.teamId === team.id)
          const isMyTeam = team.id === playerTeamId
          const teamPlayers = players.filter(p => p.teamId === team.id && p.rosterTier === 'main')
            .sort((a, b) => ovr(b) - ovr(a))
          const expanded = expandedId === team.id
          const draftPick = standings.length - rank + 1

          // Team avg OVR
          const avgOvr = teamPlayers.length > 0
            ? Math.round(teamPlayers.reduce((s, p) => s + ovr(p), 0) / teamPlayers.length)
            : 0

          return (
            <div key={team.id} style={{ marginBottom: '8px' }}>
              <div
                onClick={() => setExpandedId(expanded ? null : team.id)}
                style={{
                  borderRadius: expanded ? '16px 16px 0 0' : '16px',
                  background: isMyTeam
                    ? `linear-gradient(135deg, ${team.colors.primary}28, #14121F)`
                    : `linear-gradient(135deg, ${team.colors.primary}18, #14121F)`,
                  border: isMyTeam ? `1.5px solid ${team.colors.primary}50` : `1px solid ${team.colors.primary}30`,
                  padding: '12px 14px',
                  display: 'flex', alignItems: 'center', gap: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '28px', textAlign: 'center', flexShrink: 0,
                  fontSize: '16px', fontWeight: '900', fontFamily: 'monospace',
                  color: rank === 1 ? '#C9A84C' : rank <= 3 ? '#9B97A8' : '#3A3758',
                }}>
                  {rank || '—'}
                </div>

                <TeamLogoSVG
                  primary={team.colors.primary}
                  secondary={team.colors.secondary}
                  shortName={team.shortName}
                  teamId={team.id}
                  size={40}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '800', color: '#F0EDE8' }}>{team.name}</span>
                    {isMyTeam && <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: `${team.colors.primary}30`, color: team.colors.primary, fontWeight: '700', flexShrink: 0 }}>自チーム</span>}
                    {(team.history.championships ?? 0) > 0 && (
                      <span style={{ fontSize: '9px', color: '#C9A84C', flexShrink: 0 }}>★{team.history.championships}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: '#5C5870' }}>{team.city} • {teamPlayers.length}名</span>
                    {!showDraftOrder && <RecentForm raceResults={standing?.raceResults ?? []}/>}
                    {showDraftOrder && (
                      <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#7986CB18', color: '#7986CB', fontWeight: '700', border: '1px solid #7986CB30' }}>
                        #{draftPick}指名
                      </span>
                    )}
                  </div>
                </div>

                {/* Team avg OVR */}
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: ratingColor(avgOvr), fontFamily: 'monospace' }}>
                    {avgOvr > 0 ? avgOvr : '—'}
                  </div>
                  <div style={{ fontSize: '7px', color: '#3A3758' }}>AVG</div>
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#C9A84C', fontFamily: 'monospace' }}>
                    {standing?.totalPoints ?? 0}
                  </div>
                  <div style={{ fontSize: '8px', color: '#3A3758' }}>pt</div>
                </div>

                <div style={{ color: '#3A3758', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>

              {/* Expanded roster */}
              {expanded && (
                <div style={{
                  background: '#0E0D17',
                  border: `1px solid ${team.colors.primary}20`,
                  borderTop: 'none',
                  borderRadius: '0 0 16px 16px',
                  padding: '12px 14px',
                }}>
                  {teamPlayers.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px', color: '#3A3758', fontSize: '12px' }}>
                      選手登録なし
                    </div>
                  ) : (
                    teamPlayers.map((p, i) => {
                      const rating = ovr(p)
                      const specCol = SPEC_COLOR[p.specialty]
                      const scoutLevel = isMyTeam ? 2 : getScoutLevel(p.id)

                      return (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '8px 0',
                          borderBottom: i < teamPlayers.length - 1 ? '1px solid #1A1828' : 'none',
                        }}>
                          {/* Jersey */}
                          <div style={{
                            width: '26px', height: '26px', borderRadius: '6px', flexShrink: 0,
                            background: `linear-gradient(135deg, ${team.colors.primary}30, ${team.colors.primary}15)`,
                            border: `1px solid ${team.colors.primary}40`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '11px', fontWeight: '800', color: '#C9A84C', fontFamily: 'monospace',
                          }}>
                            {p.jerseyNumber}
                          </div>

                          {/* Specialty (visible at level 0) */}
                          <span style={{ padding: '1px 5px', borderRadius: '8px', backgroundColor: `${specCol}15`, color: specCol, fontSize: '9px', fontWeight: '700', flexShrink: 0 }}>
                            {SPECIALTY_LABELS[p.specialty]}
                          </span>

                          {/* Name + age */}
                          <div
                            onClick={() => scoutLevel >= 1 ? openPlayerSheet(p.id) : undefined}
                            style={{ flex: 1, cursor: scoutLevel >= 1 ? 'pointer' : 'default' }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: '600', color: scoutLevel >= 1 ? '#F0EDE8' : '#5C5870' }}>
                              {p.name}
                            </div>
                            {scoutLevel >= 1 && (
                              <div style={{ fontSize: '9px', color: '#5C5870' }}>{p.age}歳</div>
                            )}
                          </div>

                          {/* Stats based on scout level */}
                          {scoutLevel >= 2 ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {([['速', p.ratings.speed], ['持', p.ratings.stamina], ['登', p.ratings.mountainUp], ['下', p.ratings.mountainDown], ['精', p.ratings.mental]] as [string, number][]).map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center', minWidth: '18px' }}>
                                  <div style={{ fontSize: '7px', color: '#3A3758' }}>{l}</div>
                                  <div style={{ fontSize: '11px', fontWeight: '700', color: v >= 75 ? '#C9A84C' : '#5C5870', fontFamily: 'monospace' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          ) : scoutLevel === 1 ? (
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {([['速', p.ratings.speed], ['持', p.ratings.stamina], ['精', p.ratings.mental]] as [string, number][]).map(([l, v]) => (
                                <div key={l} style={{ textAlign: 'center', minWidth: '18px' }}>
                                  <div style={{ fontSize: '7px', color: '#3A3758' }}>{l}</div>
                                  <div style={{ fontSize: '11px', fontWeight: '700', color: v >= 75 ? '#C9A84C' : '#5C5870', fontFamily: 'monospace' }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            /* Scout button - level 0 */
                            !isMyTeam && (
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  if (scoutPoints < 1) return
                                  scoutOpponentPlayer(p.id, 1)
                                }}
                                style={{
                                  padding: '4px 10px', borderRadius: '8px', cursor: scoutPoints >= 1 ? 'pointer' : 'not-allowed',
                                  backgroundColor: scoutPoints >= 1 ? '#7986CB18' : '#1A1828',
                                  border: `1px solid ${scoutPoints >= 1 ? '#7986CB40' : '#252236'}`,
                                  color: scoutPoints >= 1 ? '#7986CB' : '#3A3758',
                                  fontSize: '9px', fontWeight: '700', fontFamily: 'inherit', flexShrink: 0,
                                }}
                              >
                                視察 -1PT
                              </button>
                            )
                          )}

                          {/* OVR (always visible) */}
                          <div style={{
                            fontSize: '16px', fontWeight: '900', fontFamily: 'monospace',
                            color: ratingColor(rating), minWidth: '28px', textAlign: 'right', flexShrink: 0,
                          }}>
                            {rating}
                          </div>

                          {/* Upgrade scout level button */}
                          {!isMyTeam && scoutLevel === 1 && (
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                if (scoutPoints < 2) return
                                scoutOpponentPlayer(p.id, 2)
                              }}
                              style={{
                                padding: '4px 8px', borderRadius: '8px', cursor: scoutPoints >= 2 ? 'pointer' : 'not-allowed',
                                backgroundColor: scoutPoints >= 2 ? '#C9A84C15' : '#1A1828',
                                border: `1px solid ${scoutPoints >= 2 ? '#C9A84C35' : '#252236'}`,
                                color: scoutPoints >= 2 ? '#C9A84C' : '#3A3758',
                                fontSize: '8px', fontWeight: '700', fontFamily: 'inherit', flexShrink: 0,
                              }}
                            >
                              詳細 -2PT
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
