// オンライン対戦のレース再生。
//
// 画面は本編のレース画面をそのまま使う（RaceTrack と 区間結果カード）。
// 違うのは「自分で計算しない」ところだけ。ホストが配った結果を、そのとおりに再生する。
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Team } from '../../types'
import { RaceTrack, SegmentResultCard } from '../race/SimPhase'
import { terrainColor } from '../race/raceUtils'
import { formatDiff } from '../../engine/raceEngine'
import { formatRaceTime } from '../../utils/eventTime'
import { TeamLogoSVG } from '../icons/Icons'
import { courseToRace, type MatchCourse } from '../../data/matchCourses'
import { asPlayer, asTeam, type MatchRacePayload } from '../../lib/matchSim'
import { serverNow } from '../../lib/serverTime'
import { C, alpha, rankColor, SAIRA } from '../../styles/tokens'


type Stage = 'countdown' | 'track' | 'segresult' | 'final'

/** 区間結果で他のチームを待つ上限。これを過ぎたら置いて先へ進む。 */
const SEG_WAIT_SEC = 20
/** レースの結果で他のチームを待つ上限（表示用の目安） */
const RACE_WAIT_SEC = 30

export default function RacePanel({
  payload, course, raceNo, totalRaces, meId, myPlayers, seriesPts, waiting, onNext,
  segGo = -1, onSegDone,
}: {
  payload: MatchRacePayload
  course: MatchCourse
  raceNo: number          // 1始まり
  totalRaces: number
  meId: string
  /** 自分のセーブの選手。顔と長押しを手元のゲームと同じにするため */
  myPlayers: Player[]
  /** ここまでの通算得点（このレースを足す前） */
  seriesPts: Record<string, number>
  /** 「次へ」を押して他のチームを待っている状態 */
  waiting: boolean
  onNext: () => void
  /** ホストが「次の区間へ進んでよい」と言った区間番号（まだなら -1） */
  segGo?: number
  /** 区間結果を見終わったことをホストへ伝える */
  onSegDone?: (segmentIndex: number) => void
}) {
  const race = useMemo(() => courseToRace(course, raceNo), [course, raceNo])
  const segIdxList = useMemo(() => payload.segments.map(s => s.segmentIndex), [payload])

  const [stage, setStage] = useState<Stage>('countdown')
  const [left, setLeft] = useState(0)
  const [pos, setPos] = useState(0)              // 何区間目を再生しているか（0始まり）
  const [kmRatio, setKmRatio] = useState(0)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const rafRef = useRef(0)
  // 区間結果で「次の区間へ」を押したあと、他のチームがそろうのを待っている状態
  const [segWait, setSegWait] = useState<{ seg: number; until: number } | null>(null)
  const [segLeft, setSegLeft] = useState(SEG_WAIT_SEC)
  const [raceLeft, setRaceLeft] = useState(RACE_WAIT_SEC)

  useEffect(() => { pausedRef.current = paused }, [paused])

  // ── カウントダウン ──
  // 0になったら必ず止める。止め忘れると、あとで区間結果を出しても
  // 200ミリ秒ごとに走行画面へ引き戻されてしまう。
  useEffect(() => {
    setStage('countdown'); setPos(0); setSegWait(null)
    let t = 0 as unknown as ReturnType<typeof setInterval>
    const tick = () => {
      const ms = payload.startAt - serverNow()
      setLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0) { clearInterval(t); setStage('track') }
    }
    t = setInterval(tick, 200)
    tick()
    return () => clearInterval(t)
  }, [payload])

  // ── 区間ごとのアニメーション（本編と同じ速さ） ──
  useEffect(() => {
    if (stage !== 'track') return
    const seg = course.segments.find(s => s.index === segIdxList[pos])
    const duration = Math.max(12000, Math.min(30000, (seg?.distanceKm ?? 10) * 1400))
    cancelAnimationFrame(rafRef.current)
    setKmRatio(0)
    setPaused(false)
    let elapsed = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      if (!pausedRef.current) elapsed += dt
      const t = Math.min(elapsed / duration, 1)
      setKmRatio(t)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
      else setStage('segresult')
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [stage, pos, course, segIdxList])

  // ── 区間ごとの待ち合わせ ──
  // 全員が見終わればホストから合図（segGo）が来る。来なくても20秒たったら先へ進む。
  // こうしておけば、誰かが固まってもこちらの画面は止まらない。
  const goNextSeg = () => { setSegWait(null); setPos(p => p + 1); setStage('track') }

  useEffect(() => {
    if (!segWait) return
    const tick = () => {
      const ms = segWait.until - serverNow()
      setSegLeft(Math.max(0, Math.ceil(ms / 1000)))
      if (ms <= 0) goNextSeg()
    }
    tick()
    const t = setInterval(tick, 300)
    return () => clearInterval(t)
  }, [segWait])

  useEffect(() => {
    if (segWait && segGo >= segWait.seg) goNextSeg()
  }, [segGo, segWait])

  // レース結果で待っているあいだの残り秒数（表示だけ。進めるのはホスト）
  useEffect(() => {
    if (!waiting) { setRaceLeft(RACE_WAIT_SEC); return }
    const until = serverNow() + RACE_WAIT_SEC * 1000
    const tick = () => setRaceLeft(Math.max(0, Math.ceil((until - serverNow()) / 1000)))
    tick()
    const t = setInterval(tick, 300)
    return () => clearInterval(t)
  }, [waiting])

  // ── 表示用のチーム・選手 ──
  const teams: Team[] = useMemo(() => payload.teams.map(asTeam), [payload])
  const teamMap = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
  // 自分のチームだけは手元の選手をそのまま使う（顔・長押しが本編と同じになる）
  const srcById = useMemo(() => new Map(payload.runners.map(r => [r.id, r])), [payload])
  const displayId = (pid: string) => {
    const r = srcById.get(pid)
    return r ? (r.teamId === meId ? r.srcId : r.id) : pid
  }
  const players: Player[] = useMemo(() => {
    const out: Player[] = [...myPlayers]
    for (const r of payload.runners) if (r.teamId !== meId) out.push(asPlayer(r))
    return out
  }, [payload, myPlayers, meId])
  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  // ── 進行中の区間の数字 ──
  const segData = payload.segments[pos]
  const seg = course.segments.find(s => s.index === segData?.segmentIndex)
  const segCol = seg ? terrainColor(seg.uphillPct, seg.downhillPct) : C.blue

  const cumBefore = useMemo(() => {
    const out: Record<string, number> = {}
    for (const t of payload.teams) out[t.id] = 0
    for (let i = 0; i < pos; i++) {
      for (const r of payload.segments[i].runners) out[r.teamId] = (out[r.teamId] ?? 0) + r.timeSec
    }
    return out
  }, [payload, pos])

  const timesForSeg = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of segData?.runners ?? []) out[r.teamId] = r.timeSec
    return out
  }, [segData])

  const segRunnerIds = useMemo(() => {
    const out: Record<string, string> = {}
    for (const r of segData?.runners ?? []) out[r.teamId] = displayId(r.playerId)
    return out
  }, [segData, srcById, meId])   // eslint-disable-line react-hooks/exhaustive-deps

  const myTime = timesForSeg[meId] ?? 0

  const segResultForCard = useMemo(() => ({
    segmentIndex: segData?.segmentIndex ?? 0,
    runners: (segData?.runners ?? []).map(r => ({ ...r, playerId: displayId(r.playerId) })),
  }), [segData, srcById, meId])   // eslint-disable-line react-hooks/exhaustive-deps

  // 暫定順位（この区間まで）
  const standingsNow = useMemo(() => {
    const out: Record<string, number> = { ...cumBefore }
    for (const r of segData?.runners ?? []) out[r.teamId] = (out[r.teamId] ?? 0) + r.timeSec
    return Object.entries(out).sort(([, a], [, b]) => a - b)
  }, [cumBefore, segData])

  const isLast = pos >= payload.segments.length - 1

  // ── カウントダウン ──
  if (stage === 'countdown') {
    return (
      <div style={{ padding: '48px 16px 0', textAlign: 'center' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.gold, letterSpacing: 3, fontWeight: 900 }}>R{raceNo} / {totalRaces}</div>
        <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginTop: 6 }}>{course.name}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>{course.distanceKm.toFixed(1)}km / {course.segments.length}区間</div>
        <div style={{
          fontFamily: SAIRA, fontSize: 96, fontWeight: 900, lineHeight: 1.1, marginTop: 24,
          color: left <= 3 ? C.red : C.gold, textShadow: `0 0 24px ${alpha(left <= 3 ? C.red : C.gold, 0.5)}`,
        }}>{left}</div>
        <div style={{ fontFamily: SAIRA, fontSize: 13, color: C.textDim, letterSpacing: 2 }}>まもなくスタート</div>
      </div>
    )
  }

  // ── 最終結果（このレース） ──
  if (stage === 'final') {
    return (
      <div style={{ padding: '10px 12px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.gold, letterSpacing: 3, fontWeight: 900 }}>R{raceNo} / {totalRaces} — 結果</div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginTop: 4 }}>{course.name}</div>
        </div>

        <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {payload.standings.map(s => {
            const t = teamMap.get(s.teamId)
            const isMe = s.teamId === meId
            const top = payload.standings[0]?.totalTimeSec ?? 0
            const gap = s.totalTimeSec - top
            const rankCol = rankColor(s.rank)
            const total = (seriesPts[s.teamId] ?? 0) + s.points
            return (
              <div key={s.teamId} style={{
                padding: '9px 12px', borderBottom: `1px solid ${C.surface2}`,
                background: isMe ? alpha(C.gold, 0.06) : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 20, textAlign: 'center', fontSize: 15, fontWeight: 900, color: rankCol, fontFamily: SAIRA, flexShrink: 0 }}>{s.rank}</div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} logoId={t.logoId} size={24} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isMe ? 800 : 500, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t?.name ?? s.teamId}
                    {payload.forfeits.includes(s.teamId) && <span style={{ marginLeft: 6, fontSize: 9, color: C.red }}>不戦</span>}
                  </div>
                  <div style={{ fontSize: 9, color: C.gold }}>
                    +{s.points}pt{s.segPts > 0 ? `（区間賞 ${s.segPts}）` : ''}
                    {totalRaces > 1 && <span style={{ color: C.textDim }}> / 通算 {total}pt</span>}
                  </div>
                </div>
                <div style={{ fontFamily: SAIRA, textAlign: 'right', flexShrink: 0 }}>
                  {/* 区間を埋められなかったチームは合計が短くなる。マイナス差は出さない。 */}
                  {gap < 0
                    ? <span style={{ fontSize: 12, fontWeight: 700, color: C.textGhost }}>記録なし</span>
                    : gap === 0
                      ? <span style={{ fontSize: 13, fontWeight: 900, color: C.gold }}>{formatRaceTime(s.totalTimeSec)}</span>
                      : <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? C.red : C.textDim }}>+{formatDiff(gap).replace('+', '')}</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding: '14px 0 0' }}>
          <button
            className={`btn-game ${waiting ? 'btn-game--blue' : 'btn-game--gold'}`}
            onClick={() => { if (!waiting) onNext() }}
            style={{ width: '100%', opacity: waiting ? 0.5 : 1 }}
          >
            <span className="btn-game__inner">
              {waiting ? `他のチームを待っています（${raceLeft}）` : raceNo >= totalRaces ? '対戦結果へ' : '次のレースへ'}
            </span>
          </button>
        </div>
      </div>
    )
  }

  // ── 走行中／区間結果 ──
  return (
    <div>
      {/* LIVEヘッダー */}
      <div style={{ padding: '8px 16px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: C.red, boxShadow: `0 0 5px ${C.red}` }} />
          <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.red, fontWeight: 800, letterSpacing: 2 }}>LIVE</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1 }}>{course.name}</span>
          <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>R{raceNo}/{totalRaces}・{segData?.segmentIndex}/{payload.segments.length}区</span>
        </div>
        <div style={{ height: 3, backgroundColor: C.border2, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${(pos / payload.segments.length) * 100}%`, background: `linear-gradient(90deg, ${C.red}, ${C.gold})`, borderRadius: 2 }} />
        </div>
      </div>

      {stage === 'track' && seg && (<>
        <div style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button onClick={() => setPaused(v => !v)} style={{
            padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
            background: paused ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${paused ? C.gold : C.border2}`, color: paused ? C.bg : C.textSub,
            fontFamily: SAIRA, fontSize: 12, fontWeight: 700,
          }}>{paused ? '再生' : '一時停止'}</button>
          <button onClick={() => { cancelAnimationFrame(rafRef.current); setKmRatio(1); setStage('segresult') }} style={{
            padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border2}`, color: C.textSub,
            fontFamily: SAIRA, fontSize: 12, fontWeight: 700,
          }}>この区間をスキップ</button>
        </div>

        <RaceTrack
          teams={teams}
          players={players}
          segRunnerIds={segRunnerIds}
          playerTeamId={meId}
          playerBaseTime={myTime}
          cpuTimesForSeg={timesForSeg}
          baselineCumulative={cumBefore}
          kmRatio={kmRatio}
          distanceKm={seg.distanceKm}
          segCol={segCol}
          currentSegIdx={segData.segmentIndex}
          race={race}
        />
      </>)}

      {stage === 'segresult' && segData && (<>
        <SegmentResultCard
          seg={segResultForCard}
          race={race}
          teamMap={teamMap}
          playerMap={playerMap}
          playerTeamId={meId}
          isLastSeg={isLast}
          showRecordBadge={false}
          advanceLabel="このレースの結果へ"
          nextLabel={segWait ? `他のチームを待っています（${segLeft}）` : undefined}
          advanceDisabled={!!segWait}
          onAdvance={() => {
            if (isLast) { setStage('final'); return }
            if (segWait) return
            onSegDone?.(segData.segmentIndex)
            setSegLeft(SEG_WAIT_SEC)
            setSegWait({ seg: segData.segmentIndex, until: serverNow() + SEG_WAIT_SEC * 1000 })
          }}
        />

        <div style={{ margin: '12px 12px 0', borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          <div style={{ padding: '7px 12px', backgroundColor: C.surface2, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: SAIRA, fontSize: 9, color: C.textDim, letterSpacing: 2 }}>暫定順位</span>
          </div>
          {standingsNow.map(([teamId, cum], i) => {
            const t = teamMap.get(teamId)
            const isMe = teamId === meId
            const gap = cum - (standingsNow[0]?.[1] ?? 0)
            const rankCol = rankColor(i + 1)
            return (
              <div key={teamId} style={{
                padding: '8px 12px', borderBottom: `1px solid ${C.surface2}`,
                backgroundColor: isMe ? alpha(C.gold, 0.05) : 'transparent',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <div style={{ width: 20, textAlign: 'center', fontSize: 14, fontWeight: 900, color: rankCol, fontFamily: SAIRA, flexShrink: 0 }}>{i + 1}</div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} logoId={t.logoId} size={24} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isMe ? 800 : 500, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? teamId}</div>
                </div>
                <div style={{ fontFamily: SAIRA, textAlign: 'right', flexShrink: 0 }}>
                  {gap === 0
                    ? <span style={{ fontSize: 13, fontWeight: 900, color: C.gold }}>{formatRaceTime(cum)}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? C.red : C.textDim }}>+{formatDiff(gap).replace('+', '')}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </>)}
    </div>
  )
}
