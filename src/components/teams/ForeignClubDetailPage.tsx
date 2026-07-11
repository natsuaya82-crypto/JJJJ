import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr } from '../../utils/playerUtils'
import { C } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'
import { useOpponentMenu } from './opponentMenu'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px', paddingLeft: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: '#F0EDE8' }}>ロスター</span>
          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: '#C9A84C' }}>{clubPlayers.length}<span style={{ fontSize: 10, color: '#5C5870' }}>名</span></span>
          <span style={{ fontSize: 10, color: '#5C5870' }}>総年俸 <span style={{ color: '#9B97A8', fontWeight: 700, fontFamily: SAIRA }}>{fmt(clubPlayers.reduce((s, p) => s + p.contract.annualSalary, 0))}</span></span>
          <span style={{ fontSize: 8, color: '#5C5870', marginLeft: 'auto' }}>タップ=交渉 / 長押し=詳細</span>
        </div>

        {clubPlayers.length === 0
          ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#3A3758', fontSize: '12px', backgroundColor: '#0E0D17', borderRadius: '14px' }}>
              選手データなし
            </div>
          ) : (
            <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '80px' }}>
              {clubPlayers.map(p => <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} />)}
            </div>
          )
        }
      </div>
      {overlay}
    </div>
  )
}
