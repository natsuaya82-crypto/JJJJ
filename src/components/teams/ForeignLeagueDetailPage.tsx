import { useParams, useNavigate } from 'react-router-dom'
import { clubsInLeague } from '../../utils/world'
import { leagueById } from '../../data/leagues'
import { rankedStandings, leagueStandingRows } from '../../utils/league'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, SAIRA, FONT } from '../../styles/tokens'


export default function ForeignLeagueDetailPage() {
  const { leagueId } = useParams<{ leagueId: string }>()
  const navigate = useNavigate()
  const clubs = useGameStore(s => s.clubs)
  const currentSeason = useGameStore(s => s.currentSeason)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  // この画面に出すのは海外リーグ（日本の部は順位表の画面）
  const league = leagueById(leagueId)

  if (!league || league.division != null) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textGhost, fontFamily: SAIRA }}>
      リーグが見つかりません
    </div>
  )

  // 勝点順に並べるのは `utils/league` の `rankedStandings` 1本（同点のときの扱いもあちら）。
  // 開幕前（誰も走っていない）の名前順は StandingsTable が全リーグ同じに並べる
  const leagueStandings = leagueStandingRows(currentSeason, league.id)
  const clubRows = clubsInLeague(clubs, league.id).map(club => {
    const st = leagueStandings.find(s => s.teamId === club.id)
    return { club, totalPoints: st?.totalPoints ?? 0, form: (st?.raceResults ?? []).map(r => r.rank) }
  })
  const clubStandings = rankedStandings(clubRows)

  const rows: StandRow[] = clubStandings.map(({ club, totalPoints: points, form }) => ({
    id: club.id, name: club.name, shortName: club.shortName,
    primary: club.colors.primary, secondary: club.colors.secondary, teamId: club.id,
    points, recentForm: form,
    isMe: club.id === playerTeamId,
  }))

  return (
    <div style={{ fontFamily: FONT, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader
        icon={<LeagueLogoSVG leagueId={league.id} size={36} />}
        eyebrow={league.countryName.toUpperCase()}
        title={league.name}
      />

      <StandingsTable rows={rows} onRowClick={(id) => navigate(`/teams/foreign/${league.id}/${id}`)} />
    </div>
  )
}
