import type { SeasonStanding, Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'
import { SectionLabel } from '../ui'

interface Props {
  standings: SeasonStanding[]
  teams: Team[]
  playerTeamId: string
  seasonYear: number
  myPts: number
  myRank: number
}

export default function StandingsSection({ standings, teams, playerTeamId, seasonYear, myPts, myRank }: Props) {
  const sorted = [...standings].sort((a, b) => b.totalPoints - a.totalPoints)
  const playerInTop5 = myRank > 0 && myRank <= 5
  const rows = playerInTop5
    ? sorted.slice(0, 5)
    : [...sorted.slice(0, 5), sorted[myRank - 1]].filter(Boolean)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <SectionLabel>{seasonYear} 順位表</SectionLabel>
        <span className="mono" style={{ fontSize: '11px', color: C.border3 }}>
          {myPts}pt · {myRank > 0 ? `${myRank}位` : '—'}
        </span>
      </div>
      <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border2}`, background: C.surface2 }}>
        {rows.map((s, i) => {
          const t = teams.find(tm => tm.id === s.teamId)
          const isPlayer = s.teamId === playerTeamId
          const rank = sorted.findIndex(x => x.teamId === s.teamId) + 1
          const isBreak = !playerInTop5 && i === 5
          const rankColor = rank === 1 ? C.gold : rank <= 3 ? C.textSub : C.border3
          return (
            <div key={s.teamId}>
              {isBreak && (
                <div style={{ padding: '4px 14px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ height: '1px', borderTop: `1px dashed ${C.border2}` }}/>
                </div>
              )}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px',
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
                backgroundColor: isPlayer ? `${C.gold}12` : 'transparent',
              }}>
                <div className="mono" style={{ width: '22px', textAlign: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '800', color: rankColor }}>
                  {rank}
                </div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={22}/>}
                <div style={{ flex: 1, fontSize: '13px', color: isPlayer ? C.text : C.textSub, fontWeight: isPlayer ? '700' : '400' }}>
                  {t?.shortName ?? s.teamId}
                </div>
                <div className="mono" style={{ fontSize: '14px', fontWeight: '800', color: isPlayer ? C.gold : C.textDim }}>
                  {s.totalPoints}
                </div>
                <div style={{ fontSize: '10px', color: C.border3 }}>pt</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
