import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, faMarketSalary } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

export default function StarredPlayersPage() {
  const navigate = useNavigate()
  const players = useGameStore(s => s.players)
  const teams = useGameStore(s => s.teams)
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)

  const starredPlayers = players.filter(p => starredOpponents.includes(p.id))

  function getTeamName(teamId: string): string {
    if (teamId === '') return 'FA'
    const domestic = teams.find(t => t.id === teamId)
    if (domestic) return domestic.shortName
    for (const league of foreignLeagues) {
      const club = league.clubs.find(c => c.id === teamId)
      if (club) return club.shortName
    }
    return '—'
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton onClick={() => navigate('/transfer')}/>
      </div>

      <div style={{ padding: '8px 16px 16px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', marginBottom: '4px' }}>TRANSFER</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text, marginBottom: '16px' }}>
          WATCHLIST
          {starredPlayers.length > 0 && (
            <span style={{ marginLeft: 10, fontSize: 14, color: C.textDim }}>{starredPlayers.length}名</span>
          )}
        </div>

        {starredPlayers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: C.textGhost, fontSize: 12, backgroundColor: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
            選手ページで ☆ を押すとここに表示されます
          </div>
        ) : starredPlayers.map(p => {
          const rating   = ovr(p)
          const specCol  = SPEC_COLOR[p.specialty]
          const teamName = getTeamName(p.teamId)
          const isFA     = p.teamId === ''
          const value    = isFA ? faMarketSalary(p) : calcTransferValue(p)
          const valueLabel = isFA ? '市場' : '価値'

          return (
            <div key={p.id} style={{ marginBottom: '7px' }}>
              <div style={{
                position: 'relative', overflow: 'hidden',
                borderRadius: '14px',
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${alpha(specCol, 0.25)}`,
                boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
              }}>
                <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ padding: '10px 13px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flexShrink: 0, position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${alpha(specCol, 0.35)}`, cursor: 'pointer' }}
                      onClick={e => { e.stopPropagation(); navigate(`/player/${p.id}`) }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={52} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={e => { e.stopPropagation(); navigate(`/player/${p.id}`) }}>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA, marginBottom: 3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.name}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(rating) }}>{rating}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{p.age}歳</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim }}>{teamName}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>{valueLabel} <span style={{ color: C.gold }}>{fmt(value)}</span></span>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textSub }}>年俸 <span style={{ color: C.textSub }}>{fmt(p.contract.annualSalary)}</span></span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleStarOpponent(p.id) }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: C.gold, fontSize: 18, lineHeight: 1 }}
                      >
                        ★
                      </button>
                      <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textGhost }}>
                        {SPECIALTY_LABELS[p.specialty]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
