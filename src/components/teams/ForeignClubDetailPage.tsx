import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { useOpponentMenu } from './opponentMenu'

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

export default function ForeignClubDetailPage() {
  const { leagueId, clubId } = useParams<{ leagueId: string; clubId: string }>()
  const navigate = useNavigate()
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  const players = useGameStore(s => s.players)
  const currentSeason = useGameStore(s => s.currentSeason)
  const scoutOpponentPlayer = useGameStore(s => s.scoutOpponentPlayer)
  const { rowHandlers, overlay } = useOpponentMenu()

  const league = foreignLeagues.find(l => l.id === leagueId)
  const club = league?.clubs.find(c => c.id === clubId)

  if (!league || !club) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C5870', fontFamily: 'inherit' }}>
      クラブが見つかりません
    </div>
  )

  const scoutedOpponents = currentSeason.scoutedOpponents ?? []
  const scoutPoints = currentSeason.scoutPoints ?? 0

  const clubPlayers = players
    .filter(p => club.playerIds.includes(p.id))
    .sort((a, b) => ovr(b) - ovr(a))

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{
        margin: '8px 12px 12px',
        borderRadius: '16px',
        background: `linear-gradient(135deg, ${club.colors.primary}25, #14121F)`,
        border: `1px solid ${club.colors.primary}40`,
        padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <TeamLogoSVG primary={club.colors.primary} secondary={club.colors.secondary} shortName={club.shortName} teamId={club.id} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: '900', color: '#F0EDE8', marginBottom: '3px' }}>{club.name}</div>
            <div style={{ fontSize: '11px', color: '#5C5870' }}>{league.name} • {clubPlayers.length}名</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>ROSTER</div>

        {clubPlayers.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#3A3758', fontSize: '12px', backgroundColor: '#0E0D17', borderRadius: '14px' }}>
            選手データなし
          </div>
        )}

        {clubPlayers.map(p => {
          const rating = ovr(p)
          const value = calcTransferValue(p)
          const salary = p.contract.annualSalary
          const specCol = SPEC_COLOR[p.specialty]
          const scout = scoutedOpponents.find(s => s.playerId === p.id)
          const isScouted = scout != null && currentSeason.year - scout.year <= 1

          return (
            <div key={p.id} style={{
              marginBottom: '6px',
              borderRadius: '12px',
              backgroundColor: '#0E0D17',
              border: '1px solid #1A1828',
              padding: '10px 12px',
              cursor: 'pointer',
            }}
              {...rowHandlers(p.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PlayerFace playerId={p.id} nationality={p.nationality} size={40} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <span style={{ padding: '1px 5px', borderRadius: '8px', backgroundColor: `${specCol}15`, color: specCol, fontSize: '8px', fontWeight: '700', flexShrink: 0 }}>
                      {SPECIALTY_LABELS[p.specialty]}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ fontSize: '9px', color: '#5C5870' }}>
                      価値 <span style={{ color: '#4CAF50', fontFamily: 'monospace', fontWeight: '700' }}>{fmt(value)}</span>
                    </span>
                    <span style={{ fontSize: '9px', color: '#5C5870' }}>
                      年俸 <span style={{ color: '#C9A84C', fontFamily: 'monospace', fontWeight: '700' }}>{fmt(salary)}</span>
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '20px', fontWeight: '900', fontFamily: 'monospace', color: isScouted ? ratingColor(rating) : '#3A3758', flexShrink: 0 }}>
                  {isScouted ? rating : '?'}
                </div>
              </div>

            </div>
          )
        })}
      </div>
      {overlay}
    </div>
  )
}
