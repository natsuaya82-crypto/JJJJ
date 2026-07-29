// 区間タイム詳細のカードと区間タブ。
//
// 本編のレース結果画面（ResultsPhase の「区間タイム詳細」）で使っていた中身を、
// オンライン対戦の最終結果からも同じ見た目で使えるように切り出したもの。
// ここは表示だけ。ストアには触らない（オンラインでは手元のセーブに無い選手も並ぶため）。
import type { Race, RaceResults, Team, Player, Nationality } from '../../types'
import { formatTime, formatDiff } from '../../engine/raceEngine'
import { terrainColor, terrainLabel } from './raceUtils'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export type SegRunner = { playerId: string; teamId: string; timeSec: number; rank: number }
export type SegResult = RaceResults['segmentResults'][number]

export function FaceOrDot({ playerId, nationality, size = 40 }: { playerId?: string; nationality?: string; size?: number }) {
  if (playerId && nationality) {
    return <PlayerFace playerId={playerId} nationality={nationality as Nationality} size={size} />
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `linear-gradient(135deg, ${C.surface3}, ${C.border2})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, color: C.textGhost,
    }}>?</div>
  )
}

/** 区間タブ（横スクロール）。本編・オンライン共通 */
export function SegmentTabs({ labels, value, onChange }: {
  labels: string[]
  value: number
  onChange: (i: number) => void
}) {
  return (
    <div style={{ display: 'flex', overflowX: 'auto', gap: 6, padding: '10px 12px 6px', WebkitOverflowScrolling: 'touch' }}>
      {labels.map((label, i) => {
        const sel = i === value
        return (
          <button key={i} onClick={() => onChange(i)} style={{
            flexShrink: 0, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: SAIRA,
            fontSize: 13, fontWeight: sel ? 900 : 700,
            background: sel ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : C.surface2,
            color: sel ? C.bg : C.textDim,
            border: `1px solid ${sel ? C.gold : C.border2}`,
          }}>
            {label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * 1区間ぶんの全順位カード（1位〜最下位）。
 *   myTeamId … シアンで強調する自分のチーム
 *   newSegRecords … 「区間新！」を出す区間×選手（オンラインでは渡さない）
 *   onPlayerTap … 行タップ。渡さなければタップ無効
 */
export function SegmentDetailCard({
  segResult, race, teamMap, playerMap, myTeamId,
  newSegRecords = [], onPlayerTap, marginBottom = 0,
}: {
  segResult: SegResult
  race: Race
  teamMap: Map<string, Team>
  playerMap: Map<string, Player>
  myTeamId: string
  newSegRecords?: { segmentIndex: number; playerId: string }[]
  onPlayerTap?: (playerId: string) => void
  marginBottom?: number
}) {
  const sr = segResult
  const seg = race.segments.find(s => s.index === sr.segmentIndex)
  const segCol = seg ? terrainColor(seg.uphillPct, seg.downhillPct) : C.blue
  const leaderTime = sr.runners[0]?.timeSec ?? 0
  const myRunner = sr.runners.find(r => r.teamId === myTeamId)
  const isMyWin = sr.runners[0]?.teamId === myTeamId
  const displayed = sr.runners

  return (
    <div style={{
      borderRadius: 14,
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${C.goldDark}`,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      marginBottom,
    }}>
      <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />

      {/* Segment header */}
      <div style={{
        padding: '9px 12px 8px',
        display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: `1px solid ${alpha(C.gold, 0.1)}`,
        background: isMyWin ? `linear-gradient(90deg, ${alpha(C.gold, 0.07)}, transparent)` : undefined,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: `linear-gradient(180deg, #2a4060 0%, #122440 100%)`,
          border: `2px solid ${C.bg}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 900, color: segCol, fontFamily: SAIRA,
        }}>
          {sr.segmentIndex}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.textSub, fontFamily: SAIRA }}>
            {sr.segmentIndex}区
            {seg && <span style={{ fontSize: 9, color: C.textDim, marginLeft: 5 }}>{terrainLabel(seg.uphillPct, seg.downhillPct, seg.distanceKm)} · {seg.distanceKm}km</span>}
          </div>
        </div>
        {myRunner && (
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 900, fontFamily: SAIRA, color: myRunner.rank === 1 ? C.gold : myRunner.rank <= 3 ? C.green : C.textSub, textShadow: myRunner.rank === 1 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>
              {myRunner.rank}位
            </div>
            <div style={{ fontSize: 8, color: C.textGhost, fontFamily: SAIRA }}>{formatTime(myRunner.timeSec)}</div>
          </div>
        )}
      </div>

      {/* Runner rows */}
      <div>
        {displayed.map((runner, ri) => {
          const isMe = runner.teamId === myTeamId
          const t = teamMap.get(runner.teamId)
          const p = playerMap.get(runner.playerId)
          const diff = runner.timeSec - leaderTime
          const rankCol = runner.rank === 1 ? C.gold : runner.rank === 2 ? '#9B97A8' : runner.rank === 3 ? '#CD7F32' : isMe ? C.cyan : C.textGhost
          const myRunnerPlayer = isMe && seg ? p : null
          const highFatigue = myRunnerPlayer && (myRunnerPlayer.fatigue ?? 0) >= 70
          const tappable = !!(p && onPlayerTap)

          return (
            <div key={runner.playerId}
              onClick={tappable ? () => onPlayerTap!(p!.id) : undefined}
              style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 12px',
              borderBottom: ri < displayed.length - 1 ? `1px solid ${alpha(C.gold, 0.07)}` : 'none',
              background: isMe ? `linear-gradient(90deg, ${alpha(C.cyan, 0.08)}, transparent)` : undefined,
              borderLeft: isMe ? `3px solid ${C.cyan}` : '3px solid transparent',
              cursor: tappable ? 'pointer' : 'default',
            }}>
              <div style={{ width: 18, textAlign: 'center', flexShrink: 0, fontSize: 11, fontWeight: 900, fontFamily: SAIRA, color: rankCol, textShadow: runner.rank === 1 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>
                {runner.rank}
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <FaceOrDot playerId={p?.id} nationality={p?.nationality} size={30} />
                {t && (
                  <div style={{ position: 'absolute', bottom: -2, right: -3 }}>
                    <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} logoId={t.logoId} size={14} />
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                  {p && <div style={{ fontSize: 11, fontWeight: isMe ? 800 : 600, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>}
                  {newSegRecords.some(m => m.segmentIndex === sr.segmentIndex && m.playerId === runner.playerId) && (
                    <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, backgroundColor: alpha(C.red, 0.15), border: `1px solid ${alpha(C.red, 0.5)}`, color: C.red, fontWeight: 900, flexShrink: 0 }}>区間新！</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                  <span style={{ fontSize: 9, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{t?.name ?? '?'}</span>
                  {highFatigue && <span style={{ fontSize: 8, color: C.red, fontWeight: 700, fontFamily: SAIRA, flexShrink: 0 }}>疲{myRunnerPlayer!.fatigue}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 10, fontFamily: SAIRA, color: isMe ? C.text : C.textDim }}>{formatTime(runner.timeSec)}</div>
                {diff > 0 && <div style={{ fontSize: 8, color: C.textGhost, fontFamily: SAIRA }}>{formatDiff(diff)}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
