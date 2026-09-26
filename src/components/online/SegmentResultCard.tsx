// オンライン対戦の区間結果のカード。
//
// 本編の中継は区間で止まらない（`race/SimPhase`＝タスキをつないで最後まで走る）が、
// オンライン対戦は区間ごとに全員の待ち合わせがあるので、ここで止まってこのカードを出す。
import type { Race, Player, WorldClub } from '../../types'
import type { InteractiveSegResult } from '../../engine/interactiveRace'
import { formatDiff } from '../../engine/raceEngine'
import { formatRaceTime } from '../../utils/eventTime'
import { panelStyle } from '../ui/Panel'
import { terrainColor } from '../race/raceUtils'
import { FaceOrDot } from '../race/SegmentDetailCard'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { C, alpha, rankColor, SAIRA, F } from '../../styles/tokens'

export function SegmentResultCard({
  seg, race, teamMap, playerMap, playerTeamId, isLastSeg, onAdvance, advanceLabel,
  nextLabel, advanceDisabled = false,
}: {
  seg: InteractiveSegResult
  race: Race
  teamMap: ReadonlyMap<string, WorldClub>
  playerMap: Map<string, Player>
  playerTeamId: string
  isLastSeg: boolean
  onAdvance: () => void
  /** 最終区のボタン文字を差し替える */
  advanceLabel?: string
  /** 最終区以外のボタン文字を差し替える（オンライン対戦の待ち合わせ表示に使う） */
  nextLabel?: string
  /** 押せなくする（他のチームを待っているあいだ） */
  advanceDisabled?: boolean
}) {
  const longPress = usePlayerLongPress()
  const raceSegData = race.segments.find(s => s.index === seg.segmentIndex)
  const segCol = raceSegData ? terrainColor(raceSegData.uphillPct, raceSegData.downhillPct) : C.blue
  const winner = seg.runners[0]
  const isMyWin = winner?.teamId === playerTeamId
  const myRunner = seg.runners.find(r => r.teamId === playerTeamId)
  const myRankCol = !myRunner ? C.textGhost : myRunner.rank === 1 ? C.gold : myRunner.rank <= 3 ? C.green : myRunner.rank <= 6 ? C.textSub : C.textGhost

  return (
    <div style={{ margin: '0 12px' }}>
      <div style={panelStyle(isMyWin ? C.gold : segCol)}>
        <div style={{
          padding: '10px 14px 8px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: `1px solid ${alpha(segCol, 0.2)}`,
        }}>
          <div style={{
            width: 34, height: 34,flexShrink: 0,
            background: `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.5)})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: F.title, fontWeight: 900, color: C.bg,
          }}>{seg.segmentIndex}</div>
          <div>
            {raceSegData && <div style={{ fontSize: F.bodyLg, fontWeight: 800, color: segCol }}>{raceSegData.distanceKm.toFixed(1)} km</div>}
            <div style={{ fontSize: F.tiny, color: isMyWin ? C.gold : C.textDim, letterSpacing: 2 }}>{isMyWin ? '★ 区間賞！' : '区間結果'}</div>
          </div>
        </div>
        {/* 必ず5行：自チームが4位以内なら1〜5位、それ以外は1〜4位＋自チーム */}
        {(() => {
          const top4 = seg.runners.slice(0, 4)
          const mine = seg.runners.find(r => r.teamId === playerTeamId)
          return (!mine || top4.some(r => r.teamId === playerTeamId)) ? seg.runners.slice(0, 5) : [...top4, mine]
        })().map((r) => {
          const t = teamMap.get(r.teamId)
          const p = playerMap.get(r.playerId)
          const isMe = r.teamId === playerTeamId
          const rCol = rankColor(r.rank)
          return (
            <div key={r.teamId} {...(p ? longPress(p.id) : {})} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 14px', borderBottom: `1px solid ${C.border}`,
              background: isMe ? alpha(C.gold, 0.06) : 'transparent',
              cursor: p ? 'pointer' : 'default',
            }}>
              <div style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: r.rank <= 3 ? 18 : 14, fontWeight: 900, color: rCol, fontFamily: SAIRA, lineHeight: 1 }}>{r.rank}</div>
              <FaceOrDot playerId={p?.id} nationality={p?.nationality} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: F.body, fontWeight: isMe ? 800 : 500, color: isMe ? C.gold : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? r.teamId}</span>
                </div>
                {p && <div style={{ fontSize: F.tiny, color: C.textSub }}>{p.name}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: F.body, fontWeight: 700, color: r.rank === 1 ? C.gold : isMe ? myRankCol : C.textDim, fontFamily: SAIRA }}>{formatRaceTime(r.timeSec)}</div>
                {winner && r.rank > 1 && <div style={{ fontSize: F.tiny, color: C.textGhost, fontFamily: 'monospace' }}>{formatDiff(r.timeSec - winner.timeSec)}</div>}
              </div>
            </div>
          )
        })}
        <div style={{ padding: '10px 12px' }}>
          {isLastSeg ? (
            <button className="btn-game btn-game--gold" onClick={() => { if (!advanceDisabled) onAdvance() }}
              style={{ width: '100%', opacity: advanceDisabled ? 0.5 : 1 }}>
              <span className="btn-game__inner">{advanceLabel ?? '最終結果を見る'}</span>
            </button>
          ) : (
            <button className="btn-game btn-game--blue" onClick={() => { if (!advanceDisabled) onAdvance() }}
              style={{ width: '100%', opacity: advanceDisabled ? 0.5 : 1 }}>
              <span className="btn-game__inner">{nextLabel ?? '次の区間へ →'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
