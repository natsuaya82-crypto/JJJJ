import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { C } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import { WA_EVENTS, WA_EVENT_LABEL, recentBest, distanceScore, individualStarIds, type WAEvent } from '../../engine/worldAthletics'
import { formatRaceTime } from '../../utils/eventTime'
import type { Nationality, Player } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
// 代表候補として表示する上位人数（全選手ではなく代表クラスだけ）
const SQUAD_SIZE = 30

// 代表ロスター本体（ルートからもTeamsHubのドリルダウンからも使う）。onBack で戻り先を差し込む。
export function NationalTeamRoster({ code, onBack }: { code: string; onBack: () => void }) {
  const players = useGameStore(s => s.players)
  const teams = useGameStore(s => s.teams)
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  const year = useGameStore(s => s.currentSeason.year)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)

  const nat = (code ?? '') as Nationality
  const label = NAT_LABEL[nat] ?? nat

  const natPlayers = players.filter(p => p.nationality === nat && p.status !== 'retired')
  // 持ちタイム(eventBests)がある選手＝代表候補は持ちタイム順（世界陸上の選考基準）。
  // まだ持ちタイムが無い選手はOVR順で後ろに並べる。
  const withTime = natPlayers.filter(p => distanceScore(p, year) > 0).sort((a, b) => distanceScore(b, year) - distanceScore(a, year))
  const noTime = natPlayers.filter(p => distanceScore(p, year) === 0).sort((a, b) => ovr(b) - ovr(a))
  const roster = [...withTime, ...noTime].slice(0, SQUAD_SIZE)
  const stars = individualStarIds(natPlayers, nat, year)

  // その選手の一番速い持ちタイム（種目＋タイム）
  const bestPB = (p: Player): { ev: WAEvent; t: number } | null => {
    let best: { ev: WAEvent; t: number } | null = null
    for (const ev of WA_EVENTS) {
      const t = recentBest(p, ev, year)
      if (t == null) continue
      const s = 1 / t
      if (!best || s > 1 / best.t) best = { ev, t }
    }
    return best
  }

  const clubName = (teamId: string): string => {
    if (!teamId) return '-'
    const t = teams.find(t => t.id === teamId)
    if (t) return t.shortName || t.name
    for (const l of foreignLeagues) {
      const c = l.clubs.find(c => c.id === teamId)
      if (c) return c.shortName || c.name
    }
    return '-'
  }

  const handlers = (pid: string) => ({ onClick: () => openPlayerSheet(pid) })
  const rowExtra = (p: Player) => {
    const pb = bestPB(p)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {pb && (
          <span style={{ fontSize: 9, fontFamily: SAIRA, fontWeight: 800, color: C.gold }}>
            {WA_EVENT_LABEL[pb.ev]} <span style={{ color: C.text }}>{formatRaceTime(pb.t)}</span>
          </span>
        )}
        {stars.has(p.id) && (
          <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 3, background: `${C.purple}22`, border: `1px solid ${C.purple}66`, color: C.purple, fontWeight: 800 }}>選考</span>
        )}
        <span style={{ fontSize: 9, color: clubName(p.teamId) === '-' ? C.textGhost : C.textDim, fontWeight: 700 }}>{clubName(p.teamId)}</span>
      </span>
    )
  }

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
        <BackButton onClick={onBack} />
        <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900, color: C.text }}>{label} 代表</span>
      </div>

      <div style={{
        margin: '8px 12px 12px', borderRadius: '16px',
        background: `linear-gradient(135deg, ${C.gold}22, #14121F)`,
        border: `1px solid ${C.goldDark}55`, padding: '16px',
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
          <span style={{ fontSize: 8, color: C.textDim, marginLeft: 'auto' }}>持ちタイム順・タップ=詳細</span>
        </div>

        {roster.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: C.textGhost, fontSize: '12px', backgroundColor: C.surface, borderRadius: '14px' }}>
            選手データなし
          </div>
        ) : (
          <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '80px' }}>
            {roster.map(p => <PlayerRow key={p.id} player={p} handlers={handlers(p.id)} extra={rowExtra(p)} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ルート /teams/national/:code 用の薄いラッパ（外部遷移・直リンク用）
export default function NationalTeamDetailPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  return <NationalTeamRoster code={code ?? ''} onBack={() => navigate(-1)} />
}
