import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG, LeagueLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function TeamsHub() {
  const navigate = useNavigate()
  const { teams, currentSeason, playerTeamId, foreignLeagues } = useGameStore()
  const [slide, setSlide] = useState(0) // 0=国内, 1=海外

  const sortedStandings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const completedRaces = currentSeason.races.filter(r => r.results).length
  const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank <= 3 ? C.green : myRank <= 6 ? C.textSub : C.textDim
  const leagues = foreignLeagues ?? []

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>
          {currentSeason.year} LEAGUE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>チーム</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: alpha(myRankColor, 0.12), border: `1px solid ${alpha(myRankColor, 0.28)}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>自チーム</span>
              <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: myRankColor, textShadow: myRank <= 3 ? `0 0 6px ${alpha(myRankColor, 0.5)}` : 'none' }}>{myRank > 0 ? myRank : '—'}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>位</span>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>消化</span>
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: C.textSub }}>{completedRaces}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>戦</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', background: C.surface2, borderRadius: '10px', padding: '3px', gap: '3px' }}>
          {(['国内', '海外'] as const).map((label, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              style={{
                flex: 1, padding: '7px 0', borderRadius: '8px', border: 'none', cursor: 'pointer',
                background: slide === i ? `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)` : 'transparent',
                boxShadow: slide === i ? `0 2px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.08)` : 'none',
                borderTop: slide === i ? `1px solid ${C.goldDark}` : '1px solid transparent',
                fontFamily: SAIRA, fontSize: '13px', fontWeight: '900',
                color: slide === i ? C.gold : C.textDim,
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {slide === 1 ? (
        <div style={{ padding: '4px 12px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', padding: '4px 0 8px' }}>OVERSEAS LEAGUES</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {leagues.map(league => (
              <button
                key={league.id}
                onClick={() => navigate(`/teams/foreign/${league.id}`)}
                className="btn-press"
                style={{
                  width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                  border: `2px solid ${C.goldDark}`,
                  boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                  display: 'flex', alignItems: 'center', gap: 12,
                  fontFamily: 'inherit', position: 'relative', overflow: 'hidden',
                }}
              >
                <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
                <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>
                  <LeagueLogoSVG leagueId={league.id} size={40} />
                </div>
                <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1, textAlign: 'left' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '800', color: C.text, marginBottom: '2px' }}>{league.name}</div>
                  <div style={{ fontSize: '10px', color: C.textDim }}>
                    {league.countryName} • {league.clubs.length}クラブ
                  </div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}>
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
            {leagues.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px', color: C.textGhost, fontSize: '12px' }}>データなし</div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '4px 16px 6px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>STANDINGS</div>
          </div>

          <div style={{ margin: '0 12px', borderRadius: '14px', overflow: 'hidden', border: `2px solid ${C.goldDark}`, boxShadow: `0 6px 0 #5a3500, 0 10px 28px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.08)`, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.25)', borderRadius: 10, pointerEvents: 'none', zIndex: 1 }}/>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '7px 12px', background: C.surface3, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700' }}>#</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', letterSpacing: '1px' }}>チーム</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'center' }}>直近</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'right' }}>ポイント</span>
            </div>

            {sortedStandings.map((s, i) => {
              const team = teams.find(t => t.id === s.teamId)
              const isMe = s.teamId === playerTeamId
              const rankColor = i === 0 ? C.gold : i <= 2 ? C.textSub : C.textGhost
              const recentForm = (s.raceResults ?? []).slice(-4)

              return (
                <div
                  key={s.teamId}
                  onClick={() => navigate(`/teams/detail/${s.teamId}`)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 1fr 44px 60px',
                    gap: '4px',
                    padding: '9px 12px',
                    background: isMe
                      ? alpha(team?.colors.primary ?? C.blue, 0.1)
                      : i % 2 === 0 ? C.surface2 : C.surface,
                    borderBottom: i < sortedStandings.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: 'pointer',
                    borderLeft: isMe ? `3px solid ${team?.colors.primary ?? C.blue}` : '3px solid transparent',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {i === 0 ? (
                      <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, textShadow: `0 0 6px ${alpha(C.gold, 0.5)}` }}>★</span>
                    ) : (
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankColor }}>{i + 1}</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    {team && (
                      <TeamLogoSVG
                        primary={team.colors.primary}
                        secondary={team.colors.secondary}
                        shortName={team.shortName}
                        teamId={team.id}
                        size={24}
                      />
                    )}
                    <span style={{
                      fontFamily: SAIRA,
                      fontSize: '12px',
                      fontWeight: isMe ? '800' : '500',
                      color: isMe ? C.text : C.textSub,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {team?.name ?? '?'}
                      {isMe && <span style={{ marginLeft: '4px', fontSize: '8px', color: team?.colors.primary ?? C.blue }}>自</span>}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'center', alignItems: 'center' }}>
                    {recentForm.map((r, fi) => {
                      const col = r.rank === 1 ? C.gold : r.rank <= 3 ? C.green : r.rank <= 6 ? C.textDim : C.border2
                      return <div key={fi} style={{ width: '6px', height: '6px', borderRadius: '50%', background: col, flexShrink: 0 }} />
                    })}
                    {recentForm.length === 0 && <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.border2 }}>—</span>}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: i === 0 ? C.gold : isMe ? C.text : C.textSub, textShadow: i === 0 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>
                      {s.totalPoints}
                    </span>
                    <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, marginLeft: '2px' }}>pt</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
