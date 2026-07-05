import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { isSecondMember } from '../../data/rosterRules'
import PlayerFace from '../player/PlayerFace'
import { useOpponentMenu } from './opponentMenu'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const { teams, players, currentSeason, playerTeamId, pastSeasons } = useGameStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activePage, setActivePage] = useState(0)

  const team = teams.find(t => t.id === teamId)
  if (!team) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C5870', fontFamily: 'inherit' }}>
      チームが見つかりません
    </div>
  )

  const standing = currentSeason.standings.find(s => s.teamId === teamId)
  const rank = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
    .findIndex(s => s.teamId === teamId) + 1
  const rankColor = rank === 1 ? '#C9A84C' : rank <= 3 ? '#9B97A8' : '#3A3758'
  const isMyTeam = teamId === playerTeamId
  const scoutedOpponents = currentSeason.scoutedOpponents ?? []
  const scoutPoints = currentSeason.scoutPoints ?? 0

  // 他チーム選手：タップ＝吹き出しメニュー / 長押し＝詳細（共有フック）
  const { rowHandlers, overlay } = useOpponentMenu()

  const mainPlayers = players
    .filter(p => p.teamId === teamId && p.rosterTier === 'main')
    .sort((a, b) => ovr(b) - ovr(a))

  const secondPlayers = players
    .filter(p => p.teamId === teamId && isSecondMember(p))
    .sort((a, b) => ovr(b) - ovr(a))

  const completedRaces = currentSeason.races.filter(r => r.results)
  const recentForm = (standing?.raceResults ?? []).slice(-4)

  // 歴代成績（過去シーズンの最終順位）
  const historyRanks = (pastSeasons ?? []).map(s => {
    const sorted = [...(s.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
    const r = sorted.findIndex(x => x.teamId === teamId) + 1
    return { year: s.year, rank: r, total: sorted.length }
  }).filter(h => h.rank > 0).slice(-8)

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, clientWidth } = scrollRef.current
    setActivePage(Math.round(scrollLeft / clientWidth))
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{
        margin: '0 12px 10px',
        borderRadius: '16px',
        background: `linear-gradient(135deg, ${team.colors.primary}25, #14121F)`,
        border: `1px solid ${team.colors.primary}40`,
        padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontSize: '18px', fontWeight: '900', color: '#F0EDE8' }}>{team.name}</span>
              {isMyTeam && (
                <span style={{ fontSize: '8px', padding: '2px 6px', borderRadius: '4px', backgroundColor: `${team.colors.primary}30`, color: team.colors.primary, fontWeight: '700' }}>自チーム</span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#5C5870' }}>{team.city} • {mainPlayers.length}名</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '900', color: rankColor, fontFamily: 'monospace', lineHeight: 1 }}>{rank}</div>
            <div style={{ fontSize: '8px', color: '#3A3758' }}>位</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '10px', backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#C9A84C', fontFamily: 'monospace' }}>{standing?.totalPoints ?? 0}</div>
            <div style={{ fontSize: '8px', color: '#3A3758' }}>ポイント</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '10px', backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#9B97A8', fontFamily: 'monospace' }}>{completedRaces.length}</div>
            <div style={{ fontSize: '8px', color: '#3A3758' }}>消化試合</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px', borderRadius: '10px', backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#4CAF50', fontFamily: 'monospace' }}>
              {mainPlayers.length > 0 ? Math.round(mainPlayers.reduce((s, p) => s + ovr(p), 0) / mainPlayers.length) : '—'}
            </div>
            <div style={{ fontSize: '8px', color: '#3A3758' }}>平均OVR</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', paddingBottom: '10px' }}>
        {[0, 1].map(i => (
          <div
            key={i}
            onClick={() => scrollRef.current?.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: 'smooth' })}
            style={{
              height: '4px',
              width: activePage === i ? '20px' : '6px',
              borderRadius: '2px',
              background: activePage === i ? '#C9A84C' : '#2E2B42',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          overflowX: 'scroll',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as never,
        }}
      >
        <div style={{ minWidth: '100%', scrollSnapAlign: 'start' }}>
          <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }}>

            <div>
              <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>RECENT FORM</div>
              <div style={{ backgroundColor: '#0E0D17', borderRadius: '12px', padding: '12px 16px', border: '1px solid #1A1828' }}>
                {recentForm.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: '11px', color: '#3A3758' }}>データなし</div>
                ) : (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    {recentForm.map((r, i) => {
                      const col = r.rank === 1 ? '#C9A84C' : r.rank <= 3 ? '#4CAF50' : r.rank <= 6 ? '#9B97A8' : '#3A3758'
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col }} />
                          <span style={{ fontSize: '9px', fontFamily: SAIRA, fontWeight: '900', color: col }}>{r.rank}位</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>TEAM INFO</div>
              <div style={{ backgroundColor: '#0E0D17', borderRadius: '12px', padding: '12px 16px', border: '1px solid #1A1828' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1A1828' }}>
                  <span style={{ fontSize: '9px', color: '#3A3758', letterSpacing: '2px', width: 42, flexShrink: 0 }}>本拠地</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#F0EDE8' }}>{team.region} · {team.city}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: '#C9A84C' }}>{team.founded}</div>
                    <div style={{ fontSize: '8px', color: '#3A3758' }}>創設年</div>
                  </div>
                  <div style={{ width: '1px', background: '#1A1828' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: '#F0EDE8' }}>{team.history.championships}</div>
                    <div style={{ fontSize: '8px', color: '#3A3758' }}>優勝回数</div>
                  </div>
                  <div style={{ width: '1px', background: '#1A1828' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: '#9B97A8' }}>{historyRanks.length > 0 ? Math.min(...historyRanks.map(h => h.rank)) : '—'}<span style={{ fontSize: 11, color: '#3A3758' }}>位</span></div>
                    <div style={{ fontSize: '8px', color: '#3A3758' }}>最高順位</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 歴代成績 */}
            <div>
              <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>歴代成績</div>
              <div style={{ backgroundColor: '#0E0D17', borderRadius: '12px', padding: '12px', border: '1px solid #1A1828' }}>
                {historyRanks.length === 0 ? (
                  <div style={{ fontSize: '11px', color: '#3A3758', textAlign: 'center', padding: '4px' }}>まだ過去シーズンの記録がありません</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {historyRanks.map(h => {
                      const col = h.rank === 1 ? '#C9A84C' : h.rank <= 3 ? '#4CAF50' : '#9B97A8'
                      return (
                        <div key={h.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 9px', borderRadius: 8, background: '#141221', border: `1px solid ${col}30`, minWidth: 46 }}>
                          <span style={{ fontFamily: SAIRA, fontSize: 9, color: '#3A3758' }}>{h.year}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: col }}>{h.rank}<span style={{ fontSize: 9 }}>位</span></span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {mainPlayers[0] && (() => {
              const ace = mainPlayers[0]
              const rating = ovr(ace)
              const specCol = SPEC_COLOR[ace.specialty]
              const scout = scoutedOpponents.find(s => s.playerId === ace.id)
              const isScouted = isMyTeam || (scout != null && currentSeason.year - scout.year <= 1)
              return (
                <div>
                  <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>ACE</div>
                  <div
                    {...rowHandlers(ace.id)}
                    style={{ backgroundColor: '#0E0D17', borderRadius: '12px', padding: '12px', border: '1px solid #1A1828', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                  >
                    <PlayerFace playerId={ace.id} nationality={ace.nationality} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ace.name}</span>
                        <span style={{ padding: '1px 5px', borderRadius: '6px', backgroundColor: `${specCol}15`, color: specCol, fontSize: '8px', fontWeight: '700', flexShrink: 0 }}>
                          {SPECIALTY_LABELS[ace.specialty]}
                        </span>
                      </div>
                      <div style={{ fontSize: '10px', color: '#5C5870' }}>{ace.age}歳 • {ace.contract.yearsLeft}年契約</div>
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: '26px', fontWeight: '900', color: isScouted ? ratingColor(rating) : '#3A3758', flexShrink: 0 }}>
                      {isScouted ? rating : '?'}
                    </div>
                  </div>
                </div>
              )
            })()}

          </div>
        </div>

        <div style={{ minWidth: '100%', scrollSnapAlign: 'start' }}>
          <div style={{ padding: '0 12px' }}>
            {(() => {
              const renderPlayer = (p: typeof mainPlayers[0]) => {
                const specCol = SPEC_COLOR[p.specialty]
                const rating = ovr(p)
                const value = calcTransferValue(p)
                const salary = p.contract.annualSalary
                const scout = scoutedOpponents.find(s => s.playerId === p.id)
                const isScouted = isMyTeam || (scout != null && currentSeason.year - scout.year <= 1)
                return (
                  <div key={p.id} style={{
                    marginBottom: '6px', borderRadius: '12px',
                    backgroundColor: '#0E0D17', border: '1px solid #1A1828',
                    padding: '10px 12px', cursor: 'pointer',
                  }}
                    {...rowHandlers(p.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={40} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                          <span style={{ padding: '1px 5px', borderRadius: '8px', backgroundColor: `${specCol}15`, color: specCol, fontSize: '8px', fontWeight: '700', flexShrink: 0 }}>
                            {SPECIALTY_LABELS[p.specialty]}
                          </span>
                          {!isMyTeam && <span style={{ fontSize: '8px', color: '#5C5870', marginLeft: 'auto', flexShrink: 0 }}>タップ=交渉 / 長押し=詳細</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <span style={{ fontSize: '9px', color: '#5C5870' }}>
                            価値 <span style={{ color: '#4CAF50', fontFamily: 'monospace', fontWeight: '700' }}>{fmt(value)}</span>
                          </span>
                          <span style={{ fontSize: '9px', color: '#5C5870' }}>
                            年俸 <span style={{ color: '#C9A84C', fontFamily: 'monospace', fontWeight: '700' }}>{fmt(salary)}</span>
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: '900', fontFamily: 'monospace', color: isScouted ? ratingColor(rating) : '#3A3758', flexShrink: 0 }}>
                        {isScouted ? rating : '?'}
                      </div>
                    </div>
                  </div>
                )
              }
              return (
                <>
                  <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>
                    一軍 <span style={{ color: '#3A3758' }}>({mainPlayers.length})</span>
                  </div>
                  {mainPlayers.length === 0
                    ? <div style={{ textAlign: 'center', padding: '20px', color: '#3A3758', fontSize: '12px', backgroundColor: '#0E0D17', borderRadius: '14px', marginBottom: '12px' }}>登録なし</div>
                    : mainPlayers.map(renderPlayer)
                  }
                  {secondPlayers.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', margin: '12px 0 8px', paddingLeft: '4px' }}>
                        二軍 <span style={{ color: '#3A3758' }}>({secondPlayers.length})</span>
                      </div>
                      {secondPlayers.map(renderPlayer)}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {overlay}
    </div>
  )
}
