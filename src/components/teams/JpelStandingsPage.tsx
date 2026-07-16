import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import BackButton from '../ui/BackButton'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function JpelStandingsPage() {
  const navigate = useNavigate()
  const { teams, currentSeason, playerTeamId } = useGameStore()

  const sortedStandings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const completedRaces = currentSeason.races.filter(r => r.results).length
  const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank <= 3 ? C.green : myRank <= 6 ? C.textSub : C.textDim

  const rows: StandRow[] = sortedStandings.map(s => {
    const team = teams.find(t => t.id === s.teamId)
    return {
      id: s.teamId, name: team?.name ?? '?', shortName: team?.shortName ?? '?',
      primary: team?.colors.primary ?? C.blue, secondary: team?.colors.secondary ?? '#777', teamId: team?.id,
      points: s.totalPoints, recentForm: (s.raceResults ?? []).map(r => r.rank),
      isMe: s.teamId === playerTeamId,
    }
  })

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <BackButton />
          <LeagueLogoSVG leagueId="jpel" size={36} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>{currentSeason.year} LEAGUE</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1 }}>JPEL 順位表</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: alpha(myRankColor, 0.12), border: `1px solid ${alpha(myRankColor, 0.28)}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>自チーム</span>
              <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: myRankColor }}>{myRank > 0 ? myRank : '—'}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>位</span>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>消化</span>
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: C.textSub }}>{completedRaces}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>戦</span>
            </div>
          </div>
        </div>
      </div>

      <StandingsTable rows={rows} onRowClick={(id) => navigate(`/teams/detail/${id}`)} />
    </div>
  )
}
