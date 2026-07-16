import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import BackButton from '../ui/BackButton'
import StandingsTable, { type StandRow } from './StandingsTable'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// ECLの順位表ページ。JPEL順位表と全く同じ構成（ヘッダー＋共通StandingsTable）
export default function EclStandingsPage() {
  const navigate = useNavigate()
  const { currentSeason, teams, foreignLeagues } = useGameStore()
  const series = currentSeason.eclSeries

  // 行タップでチーム詳細へ（国内チーム／海外クラブで遷移先を出し分け）
  const goTeam = (id: string) => {
    if (teams.some(t => t.id === id)) { navigate(`/teams/detail/${id}`); return }
    const lg = (foreignLeagues ?? []).find(l => l.clubs.some(c => c.id === id))
    if (lg) navigate(`/teams/foreign/${lg.id}/${id}`)
  }

  if (!series) {
    return (
      <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
        <div style={{ padding: '10px 12px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <BackButton />
          <LeagueLogoSVG leagueId="ecl" size={36} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>{currentSeason.year} ECL</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1 }}>ECL 順位表</div>
          </div>
        </div>
        <div style={{ padding: '50px 24px', textAlign: 'center', fontSize: 13, color: C.textDim, lineHeight: 1.8 }}>
          今シーズンのECLは開催されません。<br/>前年の各リーグ上位2チームに出場権が与えられます。
        </div>
      </div>
    )
  }

  const standings = series.participants
    .map(pt => ({ ...pt, points: series.points[pt.id] ?? 0 }))
    .sort((a, b) => b.points - a.points)
  const myRank = standings.findIndex(s => s.isPlayerTeam) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank > 0 && myRank <= 3 ? C.green : C.textSub
  const done = series.raceIndex

  const rows: StandRow[] = standings.map(s => ({
    id: s.id, name: s.name, shortName: s.shortName,
    primary: s.colors.primary, secondary: s.colors.secondary, teamId: s.id,
    points: s.points,
    recentForm: series.races.filter(r => r.results).map(r => r.results!.teamRankings.find(tr => tr.teamId === s.id)?.rank ?? 99),
    isMe: s.isPlayerTeam,
  }))

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <BackButton />
          <LeagueLogoSVG leagueId="ecl" size={36} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>{currentSeason.year} ECL</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text, lineHeight: 1 }}>ECL 順位表</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            {myRank > 0 && (
              <div style={{ padding: '4px 10px', borderRadius: '20px', background: alpha(myRankColor, 0.12), border: `1px solid ${alpha(myRankColor, 0.28)}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: C.textDim }}>自チーム</span>
                <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: myRankColor }}>{myRank}</span>
                <span style={{ fontSize: '9px', color: C.textDim }}>位</span>
              </div>
            )}
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: C.surface2, border: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>消化</span>
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '700', color: C.textSub }}>{done}/{series.races.length}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>戦</span>
            </div>
          </div>
        </div>
      </div>

      <StandingsTable rows={rows} onRowClick={goTeam} />
    </div>
  )
}
