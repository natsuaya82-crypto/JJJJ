// オンライン対戦の最終結果。
//
// 一気に全部出さず、下位から1タップずつ発表していく（表彰式のノリ）。
// 最後に優勝チームを大きく出して、そのあと区間記録を見られるようにする。
import { useMemo, useState } from 'react'
import type { Player, Team } from '../../types'
import { TeamLogoSVG } from '../icons/Icons'
import { formatRaceTime } from '../../utils/eventTime'
import { courseById, courseToRace } from '../../data/matchCourses'
import { asPlayer, asTeam, seriesStandings, type MatchRacePayload, type MatchTeamInfo } from '../../lib/matchSim'
import { SegmentDetailCard, SegmentTabs } from '../race/SegmentDetailCard'
import { useGameStore } from '../../store/gameStore'
import { useRatedRanks } from '../../lib/useRatedRanks'
import { RankBadge } from '../rated/ratedUi'
import { C, alpha, rankColor, SAIRA, F } from '../../styles/tokens'


export default function FinishPanel({
  races, meId, onLeave, history = false, leaveLabel, courseOf = courseById,
}: {
  races: MatchRacePayload[]
  meId: string
  onLeave: () => void
  /**
   * コースの引き方。既定は決まった一覧から引く（`courseById`）。
   * **レート戦だけは日付から作るコース**なので一覧に無く、そこから渡してもらう。
   * ★この画面を2つに増やさないための差し替え口。**中身は何も変えないこと**
   */
  courseOf?: (id: string) => import('../../data/matchCourses').MatchCourse | undefined
  /** 対戦履歴から開いたときは true。順位の発表演出を飛ばし、区間記録から見せる。
   *  履歴のためだけに似た画面を作らず、この画面をそのまま使い回すための切り替え */
  history?: boolean
  /** 右下のボタンの文言。既定は対戦直後の「部屋を出る」 */
  leaveLabel?: string
}) {
  const standings = useMemo(() => seriesStandings(races), [races])
  const teamMap = useMemo(() => {
    const m = new Map<string, MatchTeamInfo>()
    for (const r of races) for (const t of r.teams) if (!m.has(t.id)) m.set(t.id, t)
    return m
  }, [races])

  // 名前の横に出す段位。**他人の名前が出るところには全部付ける**（オーナー・2026-08-14
  // 「フレンドから見えるところ全部だよ」）。ランクマッチ未参加なら何も出ない。
  // `MatchTeamInfo.id` はユーザーIDなので、そのまま渡せる
  const ranks = useRatedRanks(useMemo(() => [...teamMap.keys()], [teamMap]))

  // 下から何チームぶん発表したか。履歴から見るときは演出せず最初から全部出す
  const [shown, setShown] = useState(history ? standings.length : 0)
  const [tab, setTab] = useState<'result' | 'records'>(history ? 'records' : 'result')
  // 区間タイム詳細（本編と同じ画面）で見ているレースと区間
  const [recRace, setRecRace] = useState(0)
  const [recSeg, setRecSeg] = useState(0)
  const total = standings.length
  const done = history || shown >= total
  const champion = standings[0]

  const revealNext = () => setShown(v => Math.min(total, v + 1))
  const nextRank = total - shown        // 次に発表される順位

  // ── 区間タイム詳細（本編のレース結果と同じ画面を使う） ──
  const allPlayers = useGameStore(s => s.players)
  const myTeamId = useGameStore(s => s.playerTeamId)
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const myIds = useMemo(
    () => new Set(allPlayers.filter(p => p.teamId === myTeamId).map(p => p.id)),
    [allPlayers, myTeamId])

  const rec = useMemo(() => {
    const payload = races[Math.min(recRace, races.length - 1)]
    if (!payload) return null
    const course = courseOf(payload.courseId)
    if (!course) return null
    const race = courseToRace(course, recRace + 1)
    const teamList: Team[] = payload.teams.map(asTeam)
    const tMap = new Map(teamList.map(t => [t.id, t]))
    // 自分のチームだけ手元の選手をそのまま使う（顔・長押しが本編と同じになる）
    const srcById = new Map(payload.runners.map(r => [r.id, r]))
    const displayId = (pid: string) => {
      const r = srcById.get(pid)
      return r ? (r.teamId === meId ? r.srcId : r.id) : pid
    }
    const pList: Player[] = [...allPlayers.filter(p => p.teamId === myTeamId)]
    for (const r of payload.runners) if (r.teamId !== meId) pList.push(asPlayer(r))
    const pMap = new Map(pList.map(p => [p.id, p]))
    const segs = payload.segments.map(s => ({
      segmentIndex: s.segmentIndex,
      runners: s.runners.map(r => ({ ...r, playerId: displayId(r.playerId) })),
    }))
    return { course, race, tMap, pMap, segs }
  }, [races, recRace, meId, allPlayers, myTeamId])

  if (tab === 'records') {
    return (
      <div style={{ paddingBottom: 4 }}>
        <div style={{ textAlign: 'center', padding: '10px 12px 2px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: C.gold, letterSpacing: 2, fontWeight: 800 }}>SEGMENTS</div>
          <div style={{ fontSize: F.subLg, fontWeight: 800, color: C.text }}>区間タイム詳細</div>
        </div>

        {/* レース切り替え（R1 / R2 / R3） */}
        {races.length > 1 && (
          <SegmentTabs
            labels={races.map((r, i) => `R${i + 1} ${courseOf(r.courseId)?.name ?? ''}`)}
            value={Math.min(recRace, races.length - 1)}
            onChange={i => { setRecRace(i); setRecSeg(0) }}
          />
        )}

        {rec ? (<>
          <SegmentTabs
            labels={rec.segs.map(s => `${s.segmentIndex}区`)}
            value={Math.min(recSeg, rec.segs.length - 1)}
            onChange={setRecSeg}
          />
          <div style={{ padding: '6px 12px 14px' }}>
            <SegmentDetailCard
              segResult={rec.segs[Math.min(recSeg, rec.segs.length - 1)]}
              race={rec.race}
              teamMap={rec.tMap}
              playerMap={rec.pMap}
              myTeamId={meId}
              onPlayerTap={id => { if (myIds.has(id)) openPlayerSheet(id) }}
            />
          </div>
        </>) : (
          <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: F.body, color: C.textDim }}>
            区間記録を読み込めませんでした
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '0 12px' }}>
          <button className="btn-game btn-game--blue" onClick={() => setTab('result')} style={{ flex: 1 }}>
            <span className="btn-game__inner">結果に戻る</span>
          </button>
          <button className="btn-game btn-game--gold" onClick={onLeave} style={{ flex: 1 }}>
            <span className="btn-game__inner">{leaveLabel ?? '部屋を出る'}</span>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px 12px 0' }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: alpha(C.gold, 0.85), letterSpacing: 3, fontWeight: 900 }}>FINAL RESULT</div>
        <div style={{ fontSize: F.titleLg, fontWeight: 900, color: C.text, marginTop: 4 }}>総合結果</div>
        <div style={{ fontSize: F.label, color: C.textDim, marginTop: 4 }}>
          {history ? `全${races.length}レース` : done ? `全${races.length}レース終了` : `下の順位から発表します（残り${shown === 0 ? total : nextRank + 1}チーム）`}
        </div>
      </div>

      {/* 優勝チーム（最後まで発表したら出る） */}
      {done && champion && (() => {
        const t = teamMap.get(champion.teamId)
        return (
          <div style={{
            margin: '0 0 12px', padding: '18px 14px',textAlign: 'center',
            background: `linear-gradient(180deg, ${alpha(C.gold, 0.18)}, ${C.surface2})`,
            border: `2px solid ${C.gold}`, boxShadow: `0 0 24px ${alpha(C.gold, 0.25)}`,
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.gold, letterSpacing: 4, fontWeight: 900 }}>CHAMPION</div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 8px' }}>
              {t && <TeamLogoSVG primary={t.primary} secondary={t.secondary} shortName={t.shortName} logoId={t.logoId} size={56} />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <div style={{ fontSize: F.head, fontWeight: 900, color: C.text }}>{t?.name ?? champion.teamId}</div>
              <RankBadge rating={ranks.get(champion.teamId)} size={20} />
            </div>
            {t?.gmName && <div style={{ fontSize: F.label, color: C.textDim, marginTop: 2 }}>GM {t.gmName}</div>}
            <div style={{ fontSize: F.body, color: C.gold, marginTop: 4, fontFamily: SAIRA, fontWeight: 900 }}>
              通算 {champion.points}pt
            </div>
          </div>
        )
      })()}

      {/* 順位表（下から埋まっていく） */}
      <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {standings.map((s, i) => {
          const revealed = total - i <= shown
          const t = teamMap.get(s.teamId)
          const isMe = s.teamId === meId
          const rankCol = rankColor(s.rank)
          const top = standings[0]?.totalTimeSec ?? 0
          const gap = s.totalTimeSec - top
          return (
            <div key={s.teamId} style={{
              padding: '10px 12px', borderBottom: `1px solid ${C.surface2}`,
              background: !revealed ? C.surface : isMe ? alpha(C.gold, 0.07) : 'transparent',
              display: 'flex', alignItems: 'center', gap: 8, minHeight: 44,
            }}>
              <div style={{ width: 22, textAlign: 'center', flexShrink: 0, fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: revealed ? rankCol : C.textGhost }}>
                {s.rank}
              </div>
              {revealed ? (<>
                {t && <TeamLogoSVG primary={t.primary} secondary={t.secondary} shortName={t.shortName} logoId={t.logoId} size={26} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: F.bodyLg, fontWeight: isMe ? 900 : 600, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? s.teamId}</span>
                    <RankBadge rating={ranks.get(s.teamId)} size={15} />
                    {/* 全部落ちたら「不戦」、一部だけなら「不戦1」のように回数で出す。
                        1回落ちただけの人を丸ごと不戦扱いにしない */}
                    {s.forfeits > 0 && (
                      <span style={{ marginLeft: 6, fontSize: F.tiny, color: C.red }}>
                        {s.forfeit ? '不戦' : `不戦${s.forfeits}`}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: F.tiny, color: C.textDim, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {/* チーム名は自由に付けられて重複もするので、誰なのかはGM名で分かるようにする */}
                    {t?.gmName && <span style={{ color: C.textSub, marginRight: 6 }}>GM {t.gmName}</span>}
                    各レース {s.ranks.join('・')}位{s.segPts > 0 ? ` / 区間賞 ${s.segPts}pt` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900, color: C.gold }}>{s.points}<span style={{ fontSize: F.tiny, color: C.textDim }}>pt</span></div>
                  <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>
                    {gap === 0 ? formatRaceTime(s.totalTimeSec) : `+${formatRaceTime(gap)}`}
                  </div>
                </div>
              </>) : (
                <div style={{ flex: 1, fontSize: F.body, color: C.textGhost, letterSpacing: 4 }}>ーーーーー</div>
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
              <span className="btn-game__inner">{leaveLabel ?? '部屋を出る'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
