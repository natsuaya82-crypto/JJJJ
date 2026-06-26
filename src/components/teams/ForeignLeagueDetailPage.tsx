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
  const league = foreignLeagues.find(l => l.id === leagueId)

  if (!league) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C5870', fontFamily: 'inherit' }}>
      リーグが見つかりません
    </div>
  )

  // Build standings: clubs ranked by average OVR
  const clubStandings = league.clubs.map(club => {
    const clubPlayers = players.filter(p => club.playerIds.includes(p.id))
    const avgOvr = clubPlayers.length > 0
      ? Math.round(clubPlayers.reduce((s, p) => s + ovr(p), 0) / clubPlayers.length)
      : 0
    const topOvr = clubPlayers.length > 0 ? Math.max(...clubPlayers.map(p => ovr(p))) : 0
    return { club, avgOvr, topOvr, playerCount: clubPlayers.length }
  }).sort((a, b) => b.avgOvr - a.avgOvr)

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton onClick={() => navigate('/teams/foreign')}/>
      </div>

      <div style={{ padding: '10px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <LeagueLogoSVG leagueId={league.id} size={56} />
          <div>
            <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px', marginBottom: '3px' }}>{league.countryName.toUpperCase()}</div>
            <div style={{ fontSize: '20px', fontWeight: '900', color: '#F0EDE8', lineHeight: 1.2 }}>{league.name}</div>
            <div style={{ fontSize: '11px', color: '#5C5870', marginTop: '2px' }}>{league.clubs.length}クラブ — OVR平均順</div>
          </div>
        </div>

        {/* Standings header */}
        <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 48px 48px 48px', gap: '8px', padding: '4px 8px', marginBottom: '4px' }}>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>#</div>
          <div style={{ fontSize: '8px', color: '#3A3758' }}>クラブ</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>登録</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>平均OVR</div>
          <div style={{ fontSize: '8px', color: '#3A3758', textAlign: 'center' }}>最高OVR</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {clubStandings.map(({ club, avgOvr, topOvr, playerCount }, idx) => {
            const rankColor = idx === 0 ? '#C9A84C' : idx === 1 ? '#9B97A8' : idx === 2 ? '#CD7F32' : '#3A3758'
            return (
              <button
                key={club.id}
                onClick={() => navigate(`/teams/foreign/${league.id}/${club.id}`)}
                style={{
                  width: '100%', borderRadius: '13px', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${club.colors.primary}15, #14121F)`,
                  border: `1px solid ${idx === 0 ? club.colors.primary + '50' : club.colors.primary + '25'}`,
                  display: 'grid', gridTemplateColumns: '28px 1fr 48px 48px 48px',
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
                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{club.name}</div>
                    <div style={{ fontSize: '9px', color: '#5C5870' }}>{club.shortName}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#5C5870', fontFamily: 'monospace', textAlign: 'center' }}>
                  {playerCount}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '900', color: avgOvr >= 75 ? '#C9A84C' : '#9B97A8', fontFamily: 'monospace', textAlign: 'center' }}>
                  {avgOvr || '-'}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '900', color: topOvr >= 80 ? '#C9A84C' : '#9B97A8', fontFamily: 'monospace', textAlign: 'center' }}>
                  {topOvr || '-'}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
