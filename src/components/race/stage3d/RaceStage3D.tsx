import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Race, WorldClub } from '../../../types'
import { legEndAt, type RaceTimeline, type TimelineSnapshot } from '../../../engine/raceTimeline'
import { C, F, SAIRA, FONT, TV, alpha } from '../../../styles/tokens'
import { panelStyle } from '../../ui/Panel'
import { useSegmentRecords } from '../../../lib/useSegmentRecords'
import { formatRaceTime } from '../../../utils/eventTime'
import { clubById } from '../../../utils/world'
import { TeamLogoSVG } from '../../icons/Icons'
import { FaceOrDot } from '../SegmentDetailCard'
import type { Stage } from './scene'

// ============================================================================
// **3D中継**（`RaceTrack` の `renderStage` に差し込む）。
//
// ★位置は `engine/raceTimeline` のスナップショットをそのまま映す（棒グラフと同じ瞬間）。
//   ここでも `scene.ts` でも位置を計算しない。
// ★three.js と走者の模型は、この画面を開いたときにだけ読み込む（`import('./scene')`）。
//   アプリの起動には載らない。
// ★文字は3Dの上に重ねすぎないこと。追っている走者の体が隠れる（試作でオーナー「見えない」）。
//   左上＝区間・距離・いまの地点・区間記録／右上＝時計／下の端＝追うチームの切り替え（一覧の行と同じ顔・ロゴ・名前）。
// ============================================================================

/** 区間新のテロップを出しておく秒（レースの秒） */
const TELOP_SEC = 240

export function RaceStage3D({ race, raceTeams, players, playerTeamId, timeline, snap, runnerIdOf }: {
  race: Race
  raceTeams: readonly WorldClub[]
  players?: Player[]
  playerTeamId: string
  timeline: RaceTimeline
  snap: TimelineSnapshot
  runnerIdOf: (teamId: string, leg: number) => string | undefined
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Stage | null>(null)
  const [ready, setReady] = useState(false)
  const [followId, setFollowId] = useState<string | null>(null)

  const records = useSegmentRecords()
  // 自チームの走者の頭の上の▼。位置は scene が毎コマ直に書く（React を毎コマ回さない）
  const labelRefs = useRef(new Map<string, HTMLSpanElement>())

  // 追っているチーム：選んだチーム → 自チーム（走っていれば）→ 先頭
  const order = snap.overall
  const focus = order.find(r => r.teamId === followId)
    ?? order.find(r => r.teamId === playerTeamId)
    ?? order[0]
  const focusId = focus?.teamId ?? null

  const segKey = useMemo(() => race.segments.map(s => `${s.distanceKm}/${s.uphillPct}/${s.downhillPct}`).join(','), [race.segments])
  const teamKey = useMemo(() => raceTeams.map(t => t.id).join(','), [raceTeams])

  // three.js は開いたときだけ読む。コースか顔ぶれが変わったら作り直す
  useEffect(() => {
    let alive = true
    let stage: Stage | null = null
    setReady(false)
    import('./scene').then(({ createStage }) => {
      if (!alive || !canvasRef.current) return
      stage = createStage(canvasRef.current, race.segments,
        raceTeams.map(t => ({ teamId: t.id, color: t.colors?.primary ?? C.textDim })),
        () => { if (alive) setReady(true) },
        (teamId, x, y, visible) => {
          const el = labelRefs.current.get(teamId)
          if (!el) return
          el.style.visibility = visible ? 'visible' : 'hidden'
          el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`
        })
      stageRef.current = stage
      const box = boxRef.current
      if (box) stage.resize(box.clientWidth, box.clientHeight)
    })
    return () => { alive = false; stage?.dispose(); stageRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segKey, teamKey])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const ro = new ResizeObserver(() => stageRef.current?.resize(box.clientWidth, box.clientHeight))
    ro.observe(box)
    return () => ro.disconnect()
  }, [])

  // 毎コマ、同じ瞬間を渡す
  useEffect(() => {
    stageRef.current?.setFrame({
      runners: order.map(r => ({ teamId: r.teamId, raceKm: r.raceKm, finished: r.finished })),
      focusTeamId: focusId,
    })
  })

  const leg = focus?.leg ?? 0
  const seg = race.segments[leg]
  const legKm = timeline.distances[leg] ?? 0
  const club = focusId ? clubById(raceTeams, focusId) : undefined
  const record = seg ? records[`${race.name}-${seg.index}`]?.[0] : undefined
  const holder = record ? players?.find(p => p.id === record.playerId) : undefined

  // 区間新：いま走り終えた区間で、記録より速かったもの（いちばん新しい1本）
  const newRecord = useMemo(() => {
    let best: { teamId: string; leg: number; time: number; end: number } | null = null
    for (const e of timeline.entries) {
      for (let j = 0; j < race.segments.length; j++) {
        const end = legEndAt(timeline, e.teamId, j)
        if (end == null || end > snap.t || snap.t - end > TELOP_SEC) continue
        const start = j === 0 ? 0 : legEndAt(timeline, e.teamId, j - 1) ?? 0
        const rec = records[`${race.name}-${race.segments[j].index}`]?.[0]
        const time = end - start
        if (rec && time < rec.timeSec && (!best || end > best.end)) best = { teamId: e.teamId, leg: j, time, end }
      }
    }
    return best
  }, [timeline, race, records, snap.t])
  const telopClub = newRecord ? clubById(raceTeams, newRecord.teamId) : undefined
  const telopRunner = newRecord ? players?.find(p => p.id === runnerIdOf(newRecord.teamId, newRecord.leg)) : undefined

  const step = (d: number) => {
    if (order.length === 0) return
    const i = Math.max(0, order.findIndex(r => r.teamId === focusId))
    setFollowId(order[(i + d + order.length) % order.length].teamId)
  }
  const runner = focusId ? players?.find(p => p.id === runnerIdOf(focusId, leg)) : undefined

  const num = { fontFamily: SAIRA, fontWeight: 900, fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', textShadow: TV.edge, color: C.text } as const
  const tag = { flex: 'none', fontFamily: FONT, fontWeight: 900, fontSize: F.body, lineHeight: 1, padding: '2px 5px 1px', minWidth: 22, textAlign: 'center', color: C.text } as const

  return (
    <div style={{ padding: '8px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div ref={boxRef} style={{ ...panelStyle(), position: 'relative', aspectRatio: '16 / 9', background: TV.sky }}>
        <canvas ref={canvasRef} aria-label="3D中継" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />

        {/* 自チームの走者の頭の上の▼ */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <span ref={el => { if (el) labelRefs.current.set(playerTeamId, el); else labelRefs.current.delete(playerTeamId) }}
            style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden', fontSize: F.caption, lineHeight: 1, color: TV.red, textShadow: TV.glow, willChange: 'transform' }}>▼</span>
        </div>

        {/* 左上：区間・距離・いまの地点・区間記録 */}
        <div style={{ position: 'absolute', top: 6, left: 6, width: 118, display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...tag, background: TV.navy, border: `1px solid ${C.text}` }}>{seg?.index ?? 1}区</span>
            <span style={{ ...num, fontSize: F.title, marginLeft: 'auto' }}>{legKm.toFixed(1)}<small style={{ fontSize: F.label }}>km</small></span>
          </div>
          <div style={{ height: 4, background: C.text, boxShadow: '0 0 0 1px rgba(0,0,0,.55)' }}>
            <i style={{ display: 'block', height: '100%', width: `${legKm > 0 ? Math.min(100, ((focus?.km ?? 0) / legKm) * 100) : 0}%`, background: TV.red }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ ...tag, background: TV.orange, maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis' }}>{club?.shortName ?? ''}</span>
            <span style={{ ...num, fontSize: F.title, marginLeft: 'auto' }}>{(focus?.km ?? 0).toFixed(2)}<small style={{ fontSize: F.label }}>km</small></span>
          </div>
          {record && !newRecord && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, width: 'max-content' }}>
              <span style={{ flex: 'none', fontFamily: FONT, fontWeight: 900, fontSize: F.tiny, lineHeight: 1, color: TV.navy, background: C.gold, padding: '2px 4px' }}>区間記録</span>
              <span style={{ ...num, fontSize: F.bodyLg }}>{formatRaceTime(record.timeSec)}</span>
              <span style={{ fontFamily: SAIRA, fontWeight: 700, fontSize: F.caption, color: C.text, textShadow: TV.glow }}>{record.year}年</span>
              {holder && <span style={{ fontFamily: FONT, fontWeight: 700, fontSize: F.tiny, color: C.text, textShadow: TV.glow }}>{holder.name}</span>}
            </div>
          )}
        </div>

        {/* 右上：時計とコース */}
        <div style={{ position: 'absolute', top: 4, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', pointerEvents: 'none' }}>
          <span style={{ ...num, fontSize: F.headLg, lineHeight: 1 }}>{formatRaceTime(snap.t)}</span>
          <span style={{ marginTop: 2, fontFamily: FONT, fontWeight: 700, fontSize: F.tiny, color: C.text, textShadow: TV.glow }}>{race.name}</span>
        </div>

        {/* 区間新（区間記録の行と入れ替わって出る） */}
        {newRecord && (
          <div aria-live="polite" style={{ position: 'absolute', left: 6, right: 6, top: 49, display: 'flex', alignItems: 'stretch', pointerEvents: 'none', fontWeight: 900 }}>
            <style>{`@keyframes stage3d-piko { 50% { color: ${TV.red}; background: ${C.text} } } @media (prefers-reduced-motion: reduce) { .stage3d-kn { animation: none !important } }`}</style>
            <span className="stage3d-kn" style={{ flex: 'none', display: 'flex', alignItems: 'center', padding: '0 8px', fontFamily: FONT, fontSize: F.bodyLg, color: C.text, background: TV.red, animation: 'stage3d-piko .5s steps(1, end) infinite' }}>区間新</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 4px 0', background: C.bg }}>
              <span style={{ width: 5, alignSelf: 'stretch', flex: 'none', background: telopClub?.colors?.primary ?? C.textDim }} />
              <span style={{ flex: 'none', fontFamily: SAIRA, fontSize: F.body, color: C.gold }}>{race.segments[newRecord.leg]?.index}区</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: F.label, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: C.text }}>
                {telopRunner?.name ?? ''} <span style={{ fontSize: F.tiny, color: C.textSub, fontWeight: 700 }}>{telopClub?.shortName ?? ''}</span>
              </span>
              <span style={{ flex: 'none', fontFamily: SAIRA, fontSize: F.subLg, fontVariantNumeric: 'tabular-nums', color: C.text }}>{formatRaceTime(newRecord.time)}</span>
            </span>
          </div>
        )}

        {/* 下の端：追うチームの切り替え（一覧の行と同じ顔・ロゴ・名前） */}
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, display: 'grid', gridTemplateColumns: '28px 1fr 28px', alignItems: 'stretch', background: alpha(C.bg, 0.5) }}>
          <button type="button" aria-label="前のチーム" onClick={() => step(-1)} style={{ appearance: 'none', border: 0, background: 'transparent', color: C.gold, fontFamily: SAIRA, fontWeight: 900, fontSize: F.sub, cursor: 'pointer', padding: 0 }}>‹</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0', minWidth: 0 }}>
            <FaceOrDot playerId={runner?.id} nationality={runner?.nationality} size={22} />
            {club && <TeamLogoSVG primary={club.colors.primary} secondary={club.colors.secondary} shortName={club.shortName} teamId={club.id} logoId={club.logoId} size={13} />}
            <span style={{ fontSize: F.tiny, fontWeight: 700, color: club?.colors?.primary ?? C.textDim, flexShrink: 0 }}>{club?.shortName ?? ''}</span>
            {runner && <span style={{ fontSize: F.caption, fontWeight: 500, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{runner.name}</span>}
          </div>
          <button type="button" aria-label="次のチーム" onClick={() => step(1)} style={{ appearance: 'none', border: 0, background: 'transparent', color: C.gold, fontFamily: SAIRA, fontWeight: 900, fontSize: F.sub, cursor: 'pointer', padding: 0 }}>›</button>
        </div>

        {!ready && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: alpha(C.bg, 0.7), fontWeight: 700, fontSize: F.bodyLg, color: C.textSub }}>読み込み中</div>
        )}
      </div>
    </div>
  )
}
