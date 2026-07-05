import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'

export default function ForeignLeaguesPage() {
  const navigate = useNavigate()
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{ padding: '10px 16px 16px' }}>
        <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px', marginBottom: '4px' }}>OVERSEAS</div>
        <div style={{ fontSize: '22px', fontWeight: '900', color: '#F0EDE8', marginBottom: '16px' }}>海外リーグ</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {foreignLeagues.map(league => (
            <button
              key={league.id}
              onClick={() => navigate(`/teams/foreign/${league.id}`)}
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '14px', cursor: 'pointer',
                background: 'linear-gradient(135deg, #1E1B2E, #14121F)',
                border: '1px solid #2E2B42',
                display: 'flex', alignItems: 'center', gap: '14px',
                fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <div style={{ flexShrink: 0 }}>
                <LeagueLogoSVG leagueId={league.id} size={44} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: '800', color: '#F0EDE8', marginBottom: '3px' }}>{league.name}</div>
                <div style={{ fontSize: '10px', color: '#5C5870' }}>
                  {league.countryName} • {league.clubs.length}クラブ
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M9 18l6-6-6-6" stroke="#5C5870" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
