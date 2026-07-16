import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import BackButton from '../ui/BackButton'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function JpelStandingsPage() {
  const navigate = useNavigate()
  const { teams, currentSeason, playerTeamId } = useGameStore()

  const sortedStandings = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const completedRaces = currentSeason.races.filter(r => r.results).length
  const myRank = sortedStandings.findIndex(s => s.teamId === playerTeamId) + 1
  const myRankColor = myRank === 1 ? C.gold : myRank <= 3 ? C.green : myRank <= 6 ? C.textSub : C.textDim

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 12px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <BackButton />
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
            <div key={s.teamId} onClick={() => navigate(`/teams/detail/${s.teamId}`)}
              style={{ display: 'grid', gridTemplateColumns: '28px 1fr 44px 60px', gap: '4px', padding: '9px 12px',
                background: isMe ? alpha(team?.colors.primary ?? C.blue, 0.1) : i % 2 === 0 ? C.surface2 : C.surface,
                borderBottom: i < sortedStandings.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer',
                borderLeft: isMe ? `3px solid ${team?.colors.primary ?? C.blue}` : '3px solid transparent', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i === 0 ? (
                  <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, textShadow: `0 0 6px ${alpha(C.gold, 0.5)}` }}>★</span>
                ) : (
                  <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankColor }}>{i + 1}</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={24} />}
                <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: isMe ? '800' : '500', color: isMe ? C.text : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {team?.name ?? '?'}{isMe && <span style={{ marginLeft: '4px', fontSize: '8px', color: team?.colors.primary ?? C.blue }}>自</span>}
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
                <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: i === 0 ? C.gold : isMe ? C.text : C.textSub, textShadow: i === 0 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>{s.totalPoints}</span>
                <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, marginLeft: '2px' }}>pt</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
