import { useParams } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { C } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
// 代表候補として表示する上位人数（全選手ではなく代表クラスだけ）
const SQUAD_SIZE = 30

export default function NationalTeamDetailPage() {
  const { code } = useParams<{ code: string }>()
  const players = useGameStore(s => s.players)
  const teams = useGameStore(s => s.teams)
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)

  const nat = (code ?? '') as Nationality
  const label = NAT_LABEL[nat] ?? nat

  // 代表候補は「その国籍の中で強い上位30人」に絞る（全員だと数百人になる）
  const roster = players
    .filter(p => p.nationality === nat && p.status !== 'retired')
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, SQUAD_SIZE)

  // teamId → クラブ名。国内チーム＋海外クラブ。代表プール(nat-)や無所属は含めない → 「-」表示
  const clubName = (teamId: string): string => {
    if (!teamId || teamId.startsWith('nat-')) return '-'
    const t = teams.find(t => t.id === teamId)
    if (t) return t.shortName || t.name
    for (const l of foreignLeagues) {
      const c = l.clubs.find(c => c.id === teamId)
      if (c) return c.shortName || c.name
    }
    return '-'
  }

  // タップ＝選手詳細（読み取り専用。代表は交渉対象ではない）
  const handlers = (pid: string) => ({ onClick: () => openPlayerSheet(pid) })

  const clubTag = (teamId: string) => (
    <span style={{ fontSize: 9, color: clubName(teamId) === '-' ? C.textGhost : C.textDim, fontWeight: 700, flexShrink: 0 }}>
      {clubName(teamId)}
    </span>
  )

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton/>
      </div>

      <div style={{
        margin: '8px 12px 12px',
        borderRadius: '16px',
        background: `linear-gradient(135deg, ${C.gold}22, #14121F)`,
        border: `1px solid ${C.goldDark}55`,
        padding: '16px',
      }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 2, fontWeight: 900, marginBottom: 6 }}>NATIONAL TEAM</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Flag code={nat} width={40} radius={4} />
          <div style={{ fontSize: '20px', fontWeight: '900', color: C.text }}>{label} 代表</div>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px', paddingLeft: '4px' }}>
          <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>代表候補</span>
          <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.gold }}>上位{roster.length}<span style={{ fontSize: 10, color: C.textDim }}>名</span></span>
          <span style={{ fontSize: 8, color: C.textDim, marginLeft: 'auto' }}>タップ=詳細</span>
        </div>

        {roster.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: C.textGhost, fontSize: '12px', backgroundColor: C.surface, borderRadius: '14px' }}>
            選手データなし
          </div>
        ) : (
          <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '80px' }}>
            {roster.map(p => <PlayerRow key={p.id} player={p} handlers={handlers(p.id)} extra={clubTag(p.teamId)} />)}
          </div>
        )}
      </div>
    </div>
  )
}
