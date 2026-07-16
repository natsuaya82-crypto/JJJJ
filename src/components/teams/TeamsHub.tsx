import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type HubCard = { key: string; path: string; label: string; desc: string; icon: React.ReactNode }

export default function TeamsHub() {
  const navigate = useNavigate()
  const { currentSeason, foreignLeagues } = useGameStore()
  const leagues = foreignLeagues ?? []
  const completedRaces = currentSeason.races.filter(r => r.results).length

  const cards: HubCard[] = [
    {
      key: 'jpel', path: '/teams/jpel', label: 'JPEL', desc: `国内リーグ • ${completedRaces}戦消化`,
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M8.5 12l2.3 2.3L15.5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    {
      key: 'ecl', path: '/ecl', label: 'ECL', desc: 'エリート・チャンピオンズリーグ',
      icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 4h12v3a6 6 0 01-12 0V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M6 6H3v1a3 3 0 003 3M18 6h3v1a3 3 0 01-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M12 13v4M9 20h6M10 20l.5-3M14 20l-.5-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    },
    ...leagues.map(l => ({
      key: l.id, path: `/teams/foreign/${l.id}`, label: l.countryName,
      desc: `${l.name} • ${l.clubs.length}クラブ`,
      icon: <LeagueLogoSVG leagueId={l.id} size={40} />,
    })),
  ]

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>{currentSeason.year} STANDINGS</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>順位表</div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {cards.map(s => {
          const isLeagueLogo = s.key !== 'jpel' && s.key !== 'ecl'
          return (
            <button
              key={s.key}
              onClick={() => navigate(s.path)}
              className="btn-press"
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${C.goldDark}`,
                boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                display: 'flex', alignItems: 'center', gap: 12,
                fontFamily: 'inherit', position: 'relative', overflow: 'hidden',
              } as React.CSSProperties}
            >
              <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
              {isLeagueLogo ? (
                <div style={{ flexShrink: 0, position: 'relative', zIndex: 1 }}>{s.icon}</div>
              ) : (
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, position: 'relative', zIndex: 1, background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)', border: `2px solid ${C.bg}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.gold, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)' }}>{s.icon}</div>
              )}
              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '800', color: C.text, marginBottom: '2px' }}>{s.label}</div>
                <div style={{ fontSize: '10px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
