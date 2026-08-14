import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { belongsToClub } from '../../utils/rosterSync'
import { LeagueLogoSVG } from '../icons/Icons'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, SAIRA, FONT, F } from '../../styles/tokens'


export default function ForeignLeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const navigate = useNavigate()
  const foreignLeagues = useGameStore(s => s.foreignLeagues) ?? []
  const players = useGameStore(s => s.players)
  const foreignStandings = useGameStore(s => s.currentSeason.foreignStandings)
  const league = foreignLeagues.find(l => l.id === leagueId)

  if (!league) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA }}>
      リーグが見つかりません
    </div>
  )

  // 勝点があれば勝点順、無ければ（開幕前など）平均OVR順。
  const leagueStandings = foreignStandings?.[league.id]
  const hasResults = !!leagueStandings && leagueStandings.some(s => s.raceResults.length > 0)
  const clubStandings = league.clubs.map(club => {
    const clubPlayers = players.filter(p => belongsToClub(p, club.id))
    const avgOvr = clubPlayers.length > 0 ? Math.round(clubPlayers.reduce((s, p) => s + ovr(p), 0) / clubPlayers.length) : 0
    const st = leagueStandings?.find(s => s.teamId === club.id)
    return { club, avgOvr, points: st?.totalPoints ?? 0, form: (st?.raceResults ?? []).map(r => r.rank) }
  }).sort((a, b) => hasResults ? b.points - a.points : b.avgOvr - a.avgOvr)

  const rows: StandRow[] = clubStandings.map(({ club, points, form }) => ({
    id: club.id, name: club.name, shortName: club.shortName,
    primary: club.colors.primary, secondary: club.colors.secondary, teamId: club.id,
    points, recentForm: form,
  }))

  return (
    <div style={{ fontFamily: FONT, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader
        icon={<LeagueLogoSVG leagueId={league.id} size={36} />}
        eyebrow={league.countryName.toUpperCase()}
        title={league.name}
        right={<div style={{ padding: '4px 10px', background: C.surface2, border: `1px solid ${C.border2}`, flexShrink: 0 }}>
          <span style={{ fontSize: F.tiny, color: C.textDim }}>{hasResults ? '勝点順' : 'OVR順'}</span>
        </div>}
      />

      <StandingsTable rows={rows} onRowClick={(id) => navigate(`/teams/foreign/${league.id}/${id}`)} />
    </div>
  )
}
