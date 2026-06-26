import type { Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha } from '../../styles/tokens'
import { ProgressBar } from '../ui'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

interface Props {
  team: Team
  seasonYear: number
  rank: number
  totalRaces: number
  completedRaces: number
  gmRep: number
  avgMorale: number
  seasonDone: boolean
}

export default function HeroCard({ team, seasonYear, rank, totalRaces, completedRaces, gmRep, avgMorale, seasonDone }: Props) {
  const moraleColor = avgMorale >= 75 ? C.green : avgMorale >= 50 ? C.gold : C.red
  const rankBg = rank === 1
    ? `linear-gradient(135deg, ${C.gold}, ${C.goldHi})`
    : rank <= 3
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(0,0,0,0.45)'
  const rankText = rank === 1 ? C.bg : rank <= 3 ? C.text : C.textSub
  const rankBorder = rank === 1 ? 'none' : rank <= 3 ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.07)'

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      margin: '0 12px 16px',
      borderRadius: '20px',
      background: `linear-gradient(135deg, ${team.colors.primary} 0%, ${C.surface} 55%, ${C.bg} 100%)`,
      border: `3px solid ${C.gold}`,
      padding: '18px 16px 16px',
      boxShadow: `0 8px 0 #8b6914, 0 12px 30px rgba(0,0,0,0.65), inset 0 2px 0 rgba(255,255,255,0.18), inset 0 -2px 0 rgba(0,0,0,0.35)`,
    }}>

      {/* Inner frame line */}
      <div style={{ position: 'absolute', inset: 5, border: '1px solid rgba(245,200,66,0.32)', borderRadius: 15, pointerEvents: 'none', zIndex: 0 }}/>

      {/* Diagonal accent line (tasuki motif) */}
      <div style={{
        position: 'absolute', top: '-40%', right: '-20%',
        width: 200, height: 200,
        background: `linear-gradient(135deg, transparent 45%, ${alpha(team.colors.secondary, 0.18)} 50%, transparent 55%)`,
        transform: 'rotate(15deg)', pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* Background glow */}
      <div style={{
        position: 'absolute', right: 16, top: 8, width: 100, height: 100, borderRadius: '50%',
        background: `radial-gradient(circle, ${alpha(team.colors.primary, 0.28)} 0%, transparent 70%)`,
        filter: 'blur(20px)', pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* Team row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative', zIndex: 2 }}>
        <TeamLogoSVG
          primary={team.colors.primary} secondary={team.colors.secondary}
          shortName={team.shortName} teamId={team.id} size={58}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: '3px', marginBottom: 2, opacity: 0.9, fontWeight: 700 }}>
            {seasonYear} SEASON
          </div>
          <div style={{
            fontSize: 21, fontWeight: 900, color: C.text, lineHeight: 1.1, letterSpacing: '-0.5px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textShadow: `-1px -1px 0 #061224, 1px -1px 0 #061224, -1px 1px 0 #061224, 1px 1px 0 #061224`,
          }}>
            {team.name}
          </div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 2 }}>
            {team.city} · GM: {team.gmName}
          </div>
        </div>

        {/* Rank badge */}
        {!seasonDone && rank > 0 && (
          <div style={{
            flexShrink: 0, width: 54, height: 54, borderRadius: 14,
            background: rankBg, border: rankBorder,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(8px)',
            boxShadow: rank === 1 ? `0 4px 0 #5a3500, 0 0 16px ${alpha(C.gold, 0.4)}` : '0 3px 0 rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, lineHeight: 1, color: rankText }}>{rank}</div>
            <div style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 700, color: rankText, opacity: 0.8 }}>位</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {!seasonDone && totalRaces > 0 && (
        <div style={{ marginTop: 14, position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '1.5px' }}>SEASON PROGRESS</span>
            <span style={{ fontFamily: SAIRA, fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
              {completedRaces} / {totalRaces}戦
            </span>
          </div>
          <ProgressBar
            pct={(completedRaces / totalRaces) * 100}
            color={team.colors.primary}
          />
        </div>
      )}

      {/* Stats row — stat-bar style with vertical dividers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
        gap: 0, marginTop: 14, position: 'relative', zIndex: 2,
        background: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.3) 100%)`,
        borderRadius: 12, overflow: 'hidden',
        border: `1px solid rgba(245,200,66,0.22)`,
        boxShadow: `inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
      }}>
        {[
          { label: '優勝', value: `${team.history.championships}回`, color: C.gold, glow: C.gold },
          null,
          { label: 'GM評判', value: `${gmRep}`, color: gmRep >= 70 ? C.green : gmRep >= 40 ? C.gold : C.red, glow: gmRep >= 70 ? C.green : null },
          null,
          { label: 'モラール', value: `${avgMorale}`, color: moraleColor, glow: moraleColor },
        ].map((item, i) => {
          if (item === null) {
            return (
              <div key={i} style={{
                width: 1,
                background: `linear-gradient(180deg, transparent 0%, ${C.goldDark} 50%, transparent 100%)`,
                alignSelf: 'center', height: 28,
              }}/>
            )
          }
          return (
            <div key={i} style={{ textAlign: 'center', padding: '9px 4px', backdropFilter: 'blur(4px)' }}>
              <div style={{
                fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: item.color, lineHeight: 1,
                textShadow: item.glow ? `0 0 10px ${alpha(item.glow, 0.55)}` : 'none',
              }}>{item.value}</div>
              <div style={{ fontFamily: SAIRA, fontSize: 9, color: 'rgba(140,154,175,0.75)', marginTop: 2, letterSpacing: '0.1em' }}>{item.label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
