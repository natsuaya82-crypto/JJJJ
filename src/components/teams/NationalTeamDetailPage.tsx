import { useParams, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { ovr } from '../../utils/playerUtils'
import { C } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import type { Nationality, Player } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
// 代表候補として表示する上位人数（全選手ではなく代表クラスだけ）
const SQUAD_SIZE = 30

// 代表ロスター本体（ルートからもTeamsHubのドリルダウンからも使う）。onBack で戻り先を差し込む。
export function NationalTeamRoster({ code, onBack }: { code: string; onBack: () => void }) {
  const players = useGameStore(s => s.players)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const starred = useGameStore(s => s.starredOpponents) ?? []
  const toggleStar = useGameStore(s => s.toggleStarOpponent)
  const clubIndex = useClubIndex()
  const worldTournament = useGameStore(s => s.worldTournament)
  const waResults = useGameStore(s => s.worldAthleticsResults) ?? []
  const longPress = usePlayerLongPress()

  const nat = (code ?? '') as Nationality
  const label = NAT_LABEL[nat] ?? nat

  // 実際に選出された代表20人を表示する（大会開催中はworldTournament、それ以外は直近の保存結果）。
  // 予選の20人→本戦の20人は選出のたびに切り替わる。選出実績が無い国だけ候補表示にフォールバック
  const currentSquad = worldTournament?.squads?.[`nat_${nat}`]
  const savedSquad = waResults.find(r => (r.squads?.[`nat_${nat}`]?.length ?? 0) > 0)?.squads?.[`nat_${nat}`]
  const squadIds = (currentSquad?.length ? currentSquad : undefined) ?? savedSquad
  const isSquad = !!squadIds?.length

  const natPlayers = players.filter(p => p.nationality === nat && p.status !== 'retired')
  // 候補はOVR順で並べる（前は持ちタイム順で、強い選手が持ちタイムの有無次第で下に沈んで見えた）
  const roster = isSquad
    ? squadIds!.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p && p.status !== 'retired')
    : [...natPlayers].sort((a, b) => ovr(b) - ovr(a)).slice(0, SQUAD_SIZE)

  const clubName = (teamId: string): string => {
    const c = clubIndex.byId(teamId)
    return c ? (c.shortName || c.name) : '-'
  }

  // 詳細は長押しで（アプリ全体の統一操作）。タップは何もしない。
  // 持ちタイムは詳細で見られるので行には出さず、パッチは PlayerRow が名前横に表示する
  const handlers = (pid: string) => ({ ...longPress(pid), onClick: () => {} })
  const rowExtra = (p: Player) => {
    const isStarred = starred.includes(p.id)
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: clubName(p.teamId) === '-' ? C.textGhost : C.textDim, fontWeight: 700 }}>{clubName(p.teamId)}</span>
        {/* ★＝ウォッチリスト登録。獲得候補をここから直接マークできる（自チームの選手には出さない） */}
        {p.teamId !== playerTeamId && (
          <button
            onClick={e => { e.stopPropagation(); toggleStar(p.id) }}
            onPointerDown={e => e.stopPropagation()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', lineHeight: 1 }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={isStarred ? C.gold : 'none'}>
              <path d="M12 3.2l2.5 5.7 6.2.5-4.7 4 1.4 6-5.4-3.2-5.4 3.2 1.4-6-4.7-4 6.2-.5z" stroke={isStarred ? C.gold : C.textGhost} strokeWidth="1.6" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
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
        {/* 選出済みなら「代表メンバー 20名」。未選出の国は見出しを出さずロスターだけ（「候補 上位30名」の謎表記は廃止） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px', paddingLeft: '4px' }}>
          {isSquad && <>
            <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>代表メンバー</span>
            <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.gold }}>{roster.length}<span style={{ fontSize: 10, color: C.textDim }}>名</span></span>
          </>}
          <span style={{ fontSize: 8, color: C.textDim, marginLeft: 'auto' }}>長押しで詳細</span>
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
