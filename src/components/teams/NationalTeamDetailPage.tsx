import { useParams, useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { C, SAIRA, F } from '../../styles/tokens'
import PlayerRow from '../player/PlayerRow'
import { useOpponentMenu } from './opponentMenu'
import { ekidenCandidates } from '../../engine/worldAthletics'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import type { Nationality, Player } from '../../types'
import PlayerList from '../player/PlayerList'

// 代表候補として表示する上位人数（全選手ではなく代表クラスだけ）
const SQUAD_SIZE = 30

// 代表ロスター本体（ルートからもTeamsHubのドリルダウンからも使う）。onBack で戻り先を差し込む。
export function NationalTeamRoster({ code, onBack }: { code: string; onBack: () => void }) {
  const players = useGameStore(s => s.players)
  const year = useGameStore(s => s.currentSeason.year)
  const clubIndex = useClubIndex()
  const worldTournament = useGameStore(s => s.worldTournament)
  const waResults = useGameStore(s => s.worldAthleticsResults) ?? []
  const { rowHandlers, overlay } = useOpponentMenu()

  const nat = (code ?? '') as Nationality
  const label = NAT_LABEL[nat] ?? nat

  // 実際に選出された代表20人を表示する（大会開催中はworldTournament、それ以外は直近の保存結果）。
  // 予選の20人→本戦の20人は選出のたびに切り替わる。選出実績が無い国だけ候補表示にフォールバック
  const currentSquad = worldTournament?.squads?.[`nat_${nat}`]
  const savedSquad = waResults.find(r => (r.squads?.[`nat_${nat}`]?.length ?? 0) > 0)?.squads?.[`nat_${nat}`]
  const squadIds = (currentSquad?.length ? currentSquad : undefined) ?? savedSquad
  const isSquad = !!squadIds?.length

  // 選出済みなら選ばれた順（＝選考の並び）をそのまま出す。OVR順に並べ替えない。
  //
  // 引退した選手も落とさない。選出は年に一度で、次の選出までは「その年の代表20人」が正。
  // 引退で消すと翌年の代表タブが18人になり、20人選ばれたはずの表示が勝手に減る。
  //
  // 未選出の国だけ候補を出す。並びは選考画面とまったく同じ ekidenCandidates（OVR上位）。
  const roster = isSquad
    ? squadIds!.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p)
    : ekidenCandidates(players, nat, year, SQUAD_SIZE).map(c => c.player)

  const clubName = (teamId: string): string => {
    const c = clubIndex.byId(teamId)
    return c ? (c.shortName || c.name) : '-'
  }

  // タップ＝オファーのメニュー / 長押し＝詳細。他チームの選手を見る画面は全部これで統一する
  //（TeamDetailPage・StarredPlayersPage と同じ useOpponentMenu）。
  // 自チームの選手は useOpponentMenu 側でメニューを出さず長押しのみになる。
  const rowExtra = (p: Player) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <span style={{ fontSize: F.tiny, color: clubName(p.teamId) === '-' ? C.textGhost : C.textDim, fontWeight: 700 }}>{clubName(p.teamId)}</span>
    </span>
  )

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <PageHeader title={`${label} 代表`} onBack={onBack} />

      <div style={{
        margin: '8px 12px 12px',
        background: `linear-gradient(135deg, ${C.gold}22, #14121F)`,
        border: `1px solid ${C.goldDark}55`, padding: '16px',
      }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: 2, fontWeight: 900, marginBottom: 6 }}>NATIONAL TEAM</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Flag code={nat} width={40} />
          <div style={{ fontSize: F.head, fontWeight: '900', color: C.text }}>{label} 代表</div>
        </div>
      </div>

      <div style={{ padding: '0 12px' }}>
        {/* 選出済みなら「代表メンバー 20名」。未選出の国は見出しを出さずロスターだけ（「候補 上位30名」の謎表記は廃止） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px', paddingLeft: '4px' }}>
          {isSquad && <>
            <span style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: C.text }}>代表メンバー</span>
            <span style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 800, color: C.gold }}>{roster.length}<span style={{ fontSize: F.caption, color: C.textDim }}>名</span></span>
          </>}
          <span style={{ fontSize: F.micro, color: C.textDim, marginLeft: 'auto' }}>タップでオファー / 長押しで詳細</span>
        </div>

        {roster.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: C.textGhost, fontSize: F.body, backgroundColor: C.surface,}}>
            選手データなし
          </div>
        ) : (
          <PlayerList style={{ marginBottom: 80 }}>
            {roster.map(p => <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} extra={rowExtra(p)} />)}
          </PlayerList>
        )}
      </div>
      {overlay}
    </div>
  )
}

// ルート /teams/national/:code 用の薄いラッパ（外部遷移・直リンク用）
export default function NationalTeamDetailPage() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  return <NationalTeamRoster code={code ?? ''} onBack={() => navigate(-1)} />
}
