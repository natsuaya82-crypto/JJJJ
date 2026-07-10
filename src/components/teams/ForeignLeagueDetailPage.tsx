import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { LeagueLogoSVG, TeamLogoSVG } from '../icons/Icons'

export default function ForeignLeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const navigate = useNavigate()
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  const players = useGameStore(s => s.players)
  const foreignStandings = useGameStore(s => s.currentSeason.foreignStandings)
  const league = foreignLeagues.find(l => l.id === leagueId)

  if (!league) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C5870', fontFamily: 'inherit' }}>
      リーグが見つかりません
    </div>
  )

  // リーグ順位表：裏で進行した勝点があれば勝点順、無ければ（開幕前など）平均OVR順。
  const leagueStandings = foreignStandings?.[league.id]
  const hasResults = !!leagueStandings && leagueStandings.some(s => s.raceResults.length > 0)
  const clubStandings = league.clubs.map(club => {
    const clubPlayers = players.filter(p => club.playerIds.includes(p.id))
    const avgOvr = clubPlayers.length > 0
      ? Math.round(clubPlayers.reduce((s, p) => s + ovr(p), 0) / clubPlayers.length)
      : 0
    const topOvr = clubPlayers.length > 0 ? Math.max(...clubPlayers.map(p => ovr(p))) : 0
    const st = leagueStandings?.find(s => s.clubId === club.id)
    return { club, avgOvr, topOvr, playerCount: clubPlayers.length, points: st?.totalPoints ?? 0, played: st?.raceResults.length ?? 0 }
  }).sort((a, b) => hasResults ? b.points - a.points : b.avgOvr - a.avgOvr)

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{ padding: '10px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <LeagueLogoSVG leagueId={league.id} size={56} />
          <div>
            <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px', marginBottom: '3px' }}>{league.countryName.toUpperCase()}</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#F0EDE8', lineHeight: 1.2 }}>{league.name}</div>
            <div style={{ fontSize: '11px', color: '#5C5870', marginTop: '2px' }}>{league.clubs.length}クラブ — {hasResults ? '勝点順' : 'OVR平均順（開幕前）'}</div>
          </div>
        </div>

        {/* Standings header */}
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 32px 44px 44px', gap: '8px', padding: '4px 8px', marginBottom: '4px' }}>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>#</div>
          <div style={{ fontSize: '8px', color: '#3A3758' }}>クラブ</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>戦</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>勝点</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>OVR</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {clubStandings.map(({ club, avgOvr, points, played }, idx) => {
            const rankColor = idx === 0 ? '#C9A84C' : idx === 1 ? '#9B97A8' : idx === 2 ? '#CD7F32' : '#3A3758'
            const eclSpot = hasResults && idx < 2   // 上位2クラブを金枠で強調
            return (
              <button
                key={club.id}
                onClick={() => navigate(`/teams/foreign/${league.id}/${club.id}`)}
                style={{
                  width: '100%', borderRadius: '13px', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${club.colors.primary}15, #14121F)`,
                  border: `1px solid ${eclSpot ? '#C9A84C70' : idx === 0 ? club.colors.primary + '50' : club.colors.primary + '25'}`,
                  display: 'grid', gridTemplateColumns: '28px 1fr 32px 44px 44px',
                  gap: '8px', alignItems: 'center', padding: '12px 12px',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: '900', color: rankColor, fontFamily: 'monospace', textAlign: 'center' }}>
                  {idx + 1}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                  <div style={{ flexShrink: 0 }}>
                    <TeamLogoSVG primary={club.colors.primary} secondary={club.colors.secondary} shortName={club.shortName} teamId={club.id} size={30} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</span>
                    </div>
                    <div style={{ fontSize: '9px', color: '#5C5870' }}>{club.shortName}</div>
                  </div>
                </div>
                <div style={{ fontSize: '11px', fontWeight: '700', color: '#5C5870', fontFamily: 'monospace', textAlign: 'center' }}>
                  {hasResults ? played : '-'}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '900', color: eclSpot ? '#C9A84C' : '#F0EDE8', fontFamily: 'monospace', textAlign: 'center' }}>
                  {hasResults ? points : '-'}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '900', color: avgOvr >= 75 ? '#C9A84C' : '#9B97A8', fontFamily: 'monospace', textAlign: 'center' }}>
                  {avgOvr || '-'}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
