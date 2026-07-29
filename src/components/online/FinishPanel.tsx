// オンライン対戦の最終結果。
//
// 一気に全部出さず、下位から1タップずつ発表していく（表彰式のノリ）。
// 最後に優勝チームを大きく出して、そのあと区間記録を見られるようにする。
import { useMemo, useState } from 'react'
import { TeamLogoSVG } from '../icons/Icons'
import { formatTime } from '../../engine/raceEngine'
import { courseById } from '../../data/matchCourses'
import { seriesStandings, type MatchRacePayload, type MatchTeamInfo } from '../../lib/matchSim'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const rankColors: Record<number, string> = { 1: C.gold, 2: '#9B97A8', 3: '#CD7F32' }

export default function FinishPanel({
  races, meId, onLeave,
}: {
  races: MatchRacePayload[]
  meId: string
  onLeave: () => void
}) {
  const standings = useMemo(() => seriesStandings(races), [races])
  const teamMap = useMemo(() => {
    const m = new Map<string, MatchTeamInfo>()
    for (const r of races) for (const t of r.teams) if (!m.has(t.id)) m.set(t.id, t)
    return m
  }, [races])
  const runnerMap = useMemo(() => {
    const m = new Map<string, { name: string; teamId: string }>()
    for (const r of races) for (const p of r.runners) m.set(p.id, { name: p.name, teamId: p.teamId })
    return m
  }, [races])

  // 下から何チームぶん発表したか
  const [shown, setShown] = useState(0)
  const [tab, setTab] = useState<'result' | 'records'>('result')
  const total = standings.length
  const done = shown >= total
  const champion = standings[0]

  const revealNext = () => setShown(v => Math.min(total, v + 1))
  const nextRank = total - shown        // 次に発表される順位

  if (tab === 'records') {
    return (
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.cyan, letterSpacing: 3, fontWeight: 900 }}>SEGMENT RECORDS</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginTop: 4 }}>区間記録</div>
        </div>

        {races.map((r, ri) => {
          const course = courseById(r.courseId)
          return (
            <div key={ri} style={{ marginBottom: 14, borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <div style={{ padding: '8px 12px', background: C.surface2, borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.gold }}>R{ri + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{course?.name ?? ''}</span>
              </div>
              {r.segments.map(seg => {
                const sorted = [...seg.runners].sort((a, b) => a.rank - b.rank)
                const best = sorted[0]
                const mine = sorted.find(x => x.teamId === meId)
                const bestName = best ? runnerMap.get(best.playerId)?.name ?? '—' : '—'
                const bestTeam = best ? teamMap.get(best.teamId) : undefined
                const myName = mine ? runnerMap.get(mine.playerId)?.name ?? '—' : null
                return (
                  <div key={seg.segmentIndex} style={{ padding: '8px 12px', borderBottom: `1px solid ${C.surface2}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 26, textAlign: 'center', flexShrink: 0, fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.textDim }}>
                        {seg.segmentIndex}区
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.gold, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {bestName}
                          <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6, fontWeight: 500 }}>{bestTeam?.shortName ?? ''}</span>
                        </div>
                      </div>
                      <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.gold, flexShrink: 0 }}>
                        {best ? formatTime(best.timeSec) : '—'}
                      </div>
                    </div>
                    {mine && best && mine.playerId !== best.playerId && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, paddingLeft: 34 }}>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {myName}<span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>自分・{mine.rank}位</span>
                        </div>
                        <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 700, color: C.textSub, flexShrink: 0 }}>{formatTime(mine.timeSec)}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8, padding: '4px 0 0' }}>
          <button className="btn-game btn-game--blue" onClick={() => setTab('result')} style={{ flex: 1 }}>
            <span className="btn-game__inner">結果に戻る</span>
          </button>
          <button className="btn-game btn-game--gold" onClick={onLeave} style={{ flex: 1 }}>
            <span className="btn-game__inner">部屋を出る</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.7), letterSpacing: 3, fontWeight: 900 }}>FINAL RESULT</div>
        <div style={{ fontSize: 19, fontWeight: 900, color: C.text, marginTop: 4 }}>総合結果</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>
          {done ? `全${races.length}レース終了` : `下の順位から発表します（残り${shown === 0 ? total : nextRank + 1}チーム）`}
        </div>
      </div>

      {/* 優勝チーム（最後まで発表したら出る） */}
      {done && champion && (() => {
        const t = teamMap.get(champion.teamId)
        return (
          <div style={{
            margin: '0 0 12px', padding: '18px 14px', borderRadius: 16, textAlign: 'center',
            background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${C.surface2})`,
            border: `2px solid ${C.gold}`, boxShadow: `0 0 24px ${alpha(C.gold, 0.25)}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.gold, letterSpacing: 4, fontWeight: 900 }}>CHAMPION</div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
              {t && <TeamLogoSVG primary={t.primary} secondary={t.secondary} shortName={t.shortName} logoId={t.logoId} size={56} />}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{t?.name ?? champion.teamId}</div>
            <div style={{ fontSize: 12, color: C.gold, marginTop: 4, fontFamily: SAIRA, fontWeight: 900 }}>
              通算 {champion.points}pt
            </div>
          </div>
        )
      })()}

      {/* 順位表（下から埋まっていく） */}
      <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {standings.map((s, i) => {
          const revealed = total - i <= shown
          const t = teamMap.get(s.teamId)
          const isMe = s.teamId === meId
          const rankCol = rankColors[s.rank] ?? C.textGhost
          const top = standings[0]?.totalTimeSec ?? 0
          const gap = s.totalTimeSec - top
          return (
            <div key={s.teamId} style={{
              padding: '10px 12px', borderBottom: `1px solid ${C.surface2}`,
              background: !revealed ? C.surface : isMe ? alpha(C.gold, 0.07) : 'transparent',
              display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
            }}>
              <div style={{ width: 22, textAlign: 'center', flexShrink: 0, fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: revealed ? rankCol : C.textGhost }}>
                {s.rank}
              </div>
              {revealed ? (<>
                {t && <TeamLogoSVG primary={t.primary} secondary={t.secondary} shortName={t.shortName} logoId={t.logoId} size={26} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: isMe ? 900 : 600, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t?.name ?? s.teamId}
                    {s.forfeit && <span style={{ marginLeft: 6, fontSize: 9, color: C.red }}>不戦</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
                    各レース {s.ranks.join('・')}位{s.segPts > 0 ? ` / 区間賞 ${s.segPts}pt` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: C.gold }}>{s.points}<span style={{ fontSize: 9, color: C.textDim }}>pt</span></div>
                  <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
                    {gap === 0 ? formatTime(s.totalTimeSec) : `+${formatTime(gap)}`}
                  </div>
                </div>
              </>) : (
                <div style={{ flex: 1, fontSize: 12, color: C.textGhost, letterSpacing: 4 }}>ーーーーー</div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ padding: '14px 0 0' }}>
        {!done ? (
          <button className="btn-game btn-game--gold" onClick={revealNext} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              {nextRank <= 1 ? '優勝チームを発表' : `${nextRank}位を発表`}
            </span>
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-game btn-game--blue" onClick={() => setTab('records')} style={{ flex: 1 }}>
              <span className="btn-game__inner">区間記録を見る</span>
            </button>
            <button className="btn-game btn-game--gold" onClick={onLeave} style={{ flex: 1 }}>
              <span className="btn-game__inner">部屋を出る</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
