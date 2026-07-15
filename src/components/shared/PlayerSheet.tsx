import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useAdHeight } from '../layout/Layout'
import { SPECIALTY_LABELS } from '../../types'
import type { Player, TeamRole } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, isOpponentScouted, isStatMaxed } from '../../utils/playerUtils'
import { getPlayerBadges, BADGE_COLOR } from '../../utils/badges'
import { formatTime } from '../../engine/raceEngine'
import { EVENT_DISTANCES, EVENT_LABEL, formatRaceTime } from '../../utils/eventTime'
import { MAIN_RACE_NAMES, RESERVE_RACE_POOL_NAMES } from '../../data/races'
import ShareCard from './ShareCard'

const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  ace: 'エース',
  sub_ace: 'サブエース',
  key_player: '主力',
  rotation: 'ローテ',
  development: '育成',
}

const RADAR_KEYS: { key: keyof Player['ratings']; abbr: string }[] = [
  { key: 'speed', abbr: '速' },
  { key: 'stamina', abbr: '持' },
  { key: 'mountainUp', abbr: '登' },
  { key: 'mountainDown', abbr: '下' },
  { key: 'pacing', abbr: 'ペ' },
  { key: 'mental', abbr: '精' },
  { key: 'recovery', abbr: '回' },
]

function RadarChart({ ratings, color, player }: { ratings: Player['ratings']; color: string; player: Player }) {
  const cx = 100, cy = 100, R = 66, labelR = 88
  const n = RADAR_KEYS.length
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const px = (i: number, r: number) => cx + r * Math.cos(ang(i))
  const py = (i: number, r: number) => cy + r * Math.sin(ang(i))
  const polyPts = (r: number) => RADAR_KEYS.map((_, i) => `${px(i,r)},${py(i,r)}`).join(' ')
  const dataPts = RADAR_KEYS.map((a, i) => {
    const ratio = (ratings[a.key] ?? 50) / 100
    return `${px(i, R * ratio)},${py(i, R * ratio)}`
  }).join(' ')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"
      style={{ display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <polygon key={lv} points={polyPts(R * lv)}
          fill="none" stroke={color} strokeWidth={lv === 1 ? 1 : 0.5} opacity={lv === 1 ? 0.4 : 0.1} />
      ))}
      {RADAR_KEYS.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={px(i,R)} y2={py(i,R)}
          stroke={color} strokeWidth={0.75} opacity={0.25} />
      ))}
      <polygon points={dataPts}
        fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {RADAR_KEYS.map((a, i) => {
        const ratio = (ratings[a.key] ?? 50) / 100
        return <circle key={i} cx={px(i,R*ratio)} cy={py(i,R*ratio)} r={2.5} fill={color} />
      })}
      {RADAR_KEYS.map((a, i) => {
        const val = ratings[a.key] ?? 50
        const valCol = ratingColor(val, isStatMaxed(player, a.key))
        return (
          <g key={i}>
            <text x={px(i,labelR)} y={py(i,labelR)-6}
              textAnchor="middle" dominantBaseline="middle" fill={color} opacity={0.85}
              fontSize="8" fontWeight="700" fontFamily="'Saira Condensed',system-ui,sans-serif">{a.abbr}</text>
            <text x={px(i,labelR)} y={py(i,labelR)+6}
              textAnchor="middle" dominantBaseline="middle" fill={valCol}
              fontSize="11" fontWeight="900" fontFamily="'Saira Condensed',system-ui,sans-serif">{val}</text>
          </g>
        )
      })}
    </svg>
  )
}

function OVRSparkline({ history }: { history: { year: number; ovr: number }[] }) {
  if (history.length < 2) return null
  const vals = history.map(h => h.ovr)
  const vmin = Math.min(...vals) - 2, vmax = Math.max(...vals) + 2
  const W = 64, H = 22
  const range = vmax - vmin || 1
  const points = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * W,
    y: H - ((v - vmin) / range) * H,
  }))
  const pts = points.map(p => `${p.x},${p.y}`).join(' ')
  const last = points[points.length - 1]
  const trend = vals[vals.length - 1] - vals[vals.length - 2]
  const col = trend > 0 ? '#4CAF50' : trend < 0 ? '#E8462A' : '#9B97A8'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      <svg width={W} height={H}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={last.x} cy={last.y} r="2.5" fill={col}/>
      </svg>
      <span style={{ fontSize: '9px', fontWeight: '700', color: col, fontFamily: 'monospace' }}>
        {trend > 0 ? `+${trend}` : `${trend}`}
      </span>
    </div>
  )
}

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

export default function PlayerSheet() {
  const {
    openPlayerId, openPlayerSheet, players, teams,
    currentSeason, pastSeasons, playerTeamId,
  } = useGameStore()
  // draftState を購読（安定参照）。pool の ?? [] はセレクタの外で行う（毎回新配列を返すと無限ループになる）
  const draftState = useGameStore(s => s.draftState)
  const draftPool = draftState?.pool ?? []
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  // 国内チーム or 海外クラブから所属を解決
  const resolveTeam = (id: string) => teams.find(t => t.id === id) ?? foreignLeagues.flatMap(l => l.clubs).find(c => c.id === id)
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const starredProspects = useGameStore(s => s.starredProspects ?? [])
  const toggleStarProspect = useGameStore(s => s.toggleStarProspect)
  const segmentRecords = useGameStore(s => s.segmentRecords ?? {})
  // 記録パッチ（世界/日本記録・MVP・新人王・区間記録）の解決用
  const worldRecords = useGameStore(s => s.worldRecords)
  const japanRecords = useGameStore(s => s.japanRecords)
  const seasonAwards = useGameStore(s => s.seasonAwards)
  const setDisplayBadge = useGameStore(s => s.setDisplayBadge)
  const adH = useAdHeight()
  const navigate = useNavigate()

  // レース進行画面(/race・/reserve)の上ではチーム詳細へ飛ばない。
  // 飛ぶとレース画面がアンマウントされ、戻った時に結果画面が消えて次レースの選手選定から始まってしまうため
  const location = useLocation()
  const teamJumpBlocked = location.pathname === '/race' || location.pathname === '/reserve'

  // 在籍履歴のチーム欄タップでそのチームの詳細ページへ（国内/海外で遷移先が異なる）。
  // 遷移先の「戻る」で元の選手詳細に戻れるよう、開いていた選手IDを履歴stateに載せる。
  const goToTeamPage = (teamId: string) => {
    if (teamJumpBlocked) return
    const returnId = openPlayerId
    // 先に遷移し、シートは次フレームで閉じる。先に閉じると下の旧画面が1フレーム見えてチラつく
    const closeNextFrame = () => requestAnimationFrame(() => openPlayerSheet(null))
    if (teams.some(t => t.id === teamId)) {
      navigate(`/teams/detail/${teamId}`, { state: { fromPlayerSheet: returnId } })
      closeNextFrame()
      return
    }
    const league = foreignLeagues.find(l => l.clubs.some(c => c.id === teamId))
    if (league) {
      navigate(`/teams/foreign/${league.id}/${teamId}`, { state: { fromPlayerSheet: returnId } })
      closeNextFrame()
    }
  }
  const [page, setPage] = useState(1)
  const [pageAnim, setPageAnim] = useState('')
  const [pageKey, setPageKey] = useState(0)
  const [selectedRaceName, setSelectedRaceName] = useState<string | null>(null)
  const touchStart = useRef({ x: 0, y: 0 })
  const sheetRef = useRef<HTMLDivElement>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)

  const goToPage = (next: number) => {
    if (next === page) return
    setPageAnim(next > page ? 'page-slide-left' : 'page-slide-right')
    setPage(next)
    setPageKey(k => k + 1)
  }

  const openRaceDetail = (name: string) => {
    setSelectedRaceName(name)
    setPageAnim('page-slide-left')
    setPage(4)
    setPageKey(k => k + 1)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (page === 4) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 48) {
      // ドラフト候補（通常選手リスト外）は2ページまで。引退選手は1ページ目を出さないので2から。
      const cur = players.find(p => p.id === openPlayerId)
      const maxPage = cur ? 3 : 2
      const minPage = cur?.status === 'retired' ? 2 : 1
      if (dx < 0) goToPage(Math.min(page + 1, maxPage))
      if (dx > 0) goToPage(Math.max(page - 1, minPage))
    }
  }

  // 通常の選手に加え、スカウトのドラフト候補・ドラフト進行中のプール選手も詳細表示できるよう解決する
  const player = players.find(p => p.id === openPlayerId)
    ?? (currentSeason.scoutProspects ?? []).find(p => p.id === openPlayerId)
    ?? draftPool.find(p => p.id === openPlayerId)

  useEffect(() => {
    // 引退選手は1ページ目を出さないので2ページ目から開く
    setPage(player?.status === 'retired' ? 2 : 1)
    setSelectedRaceName(null)
  }, [openPlayerId])

  // シート表示中は背景ページのスクロールをロックする
  useEffect(() => {
    if (!player) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [player?.id])

  if (!player) return null

  const team = teams.find(t => t.id === player.teamId)
  const isMyPlayer = player.teamId === playerTeamId
  // 記録パッチ（最大5個・優先順: 世界>日本>MVP>新人王>区間記録）
  const badges = getPlayerBadges(player, { worldRecords, japanRecords, seasonAwards, segmentRecords })
  const handleShare = async () => {
    if (!shareCardRef.current) return
    try {
      const { shareElementAsImage } = await import('../../utils/shareImage')
      await shareElementAsImage(shareCardRef.current, { filename: `${player.name}.png`, title: player.name, text: `${player.name} OVR${ovr(player)} #JPELManager` })
    } catch (e) { console.error('share failed', e) }
  }
  // ドラフト候補は詳細ページを簡略表示にする。
  // ドラフト進行中は候補が state.players に teamId '__pool__' / status 'draft_eligible' で入るため、
  // 「playersに居ない」だけだと判定できずフル詳細が開いてしまう。status で確実に候補と判定する。
  const isProspect = player.status === 'draft_eligible'
    || player.teamId === '__pool__'
    || !players.some(p => p.id === player.id)
  const isRetired = player.status === 'retired'
  const isScouted = isMyPlayer || isProspect || isOpponentScouted(player.id, currentSeason)

  // ドラフト候補の予想指名順位。生成時に焼き込んだ player.predictedPick を使う（ドラフト中も不変）。
  // predictedPick が無い旧セーブだけ、その場で母集団から推定する（scout/draftどちらのプールでも）。
  const predictedPick = isProspect
    ? (player.predictedPick ?? (() => {
        const val = (pl: typeof player) => ovr(pl) + (pl.potential ?? 0) * 0.5
        const scoutPool = currentSeason.scoutProspects ?? []
        const basePool = scoutPool.some(p => p.id === player.id) ? scoutPool : draftPool
        const pool = [...basePool].sort((a, b) => val(b) - val(a))
        const idx = pool.findIndex(p => p.id === player.id)
        return idx >= 0 ? idx + 1 : null
      })())
    : null
  const playerOvr = ovr(player)
  const specCol = SPEC_COLOR[player.specialty]

  type RaceEntry = { year: number; segIdx: number; distKm?: number; rank: number; timeSec: number }
  const raceGroupMap = new Map<string, RaceEntry[]>()
  const addEntry = (name: string, e: RaceEntry) => {
    if (!raceGroupMap.has(name)) raceGroupMap.set(name, [])
    raceGroupMap.get(name)!.push(e)
  }
  const processRaces = (raceList: typeof currentSeason.races, year: number) => {
    for (const race of raceList) {
      if (!race.results) continue
      const sr = race.results.segmentResults.find(s => s.runners.some(r => r.playerId === player.id))
      if (!sr) continue
      const runner = sr.runners.find(r => r.playerId === player.id)!
      const seg = race.segments.find(s => s.index === sr.segmentIndex)
      addEntry(race.name, { year, segIdx: sr.segmentIndex, distKm: seg?.distanceKm, rank: runner.rank, timeSec: runner.timeSec })
    }
  }
  for (const ps of pastSeasons) {
    processRaces(ps.races, ps.year)
    processRaces(ps.secondTeamRaces ?? [], ps.year)   // リザーブ駅伝の結果も履歴に含める
    processRaces(ps.collegeRaces ?? [], ps.year)
  }
  processRaces(currentSeason.races, currentSeason.year)
  processRaces(currentSeason.secondTeamRaces ?? [], currentSeason.year)
  processRaces(currentSeason.collegeRaces ?? [], currentSeason.year)

  // 2軍駅伝は年ごとに開催大会が入れ替わるため、「このセーブで実際に開催されたことのある大会」だけを一覧に出す
  // （未出場の開催大会は空欄で並ぶ。プールにあるだけで一度も開催されていない大会は出さない）
  const seenReserveNames = new Set<string>()
  for (const r of [
    ...(currentSeason.collegeRaces ?? []), ...pastSeasons.flatMap(ps => ps.collegeRaces ?? []),
    ...(currentSeason.secondTeamRaces ?? []), ...pastSeasons.flatMap(ps => ps.secondTeamRaces ?? []),
  ]) {
    seenReserveNames.add(r.name)
  }
  const reserveRaceNames = RESERVE_RACE_POOL_NAMES.filter(n => seenReserveNames.has(n))

  // 在籍履歴（移籍情報）集計：年 × teamId × tier(1軍/2軍) ごとに 出場数・区間賞数
  type HistoryRow = { year: number; teamId: string; tier: 'main' | 'second'; races: number; wins: number }
  const historyMap = new Map<string, HistoryRow>()
  const addHistory = (year: number, tier: 'main' | 'second', raceList: typeof currentSeason.races | undefined) => {
    if (!raceList) return
    for (const race of raceList) {
      if (!race.results) continue
      for (const sr of race.results.segmentResults) {
        for (const runner of sr.runners) {
          if (runner.playerId !== player.id) continue
          const key = `${year}|${runner.teamId}|${tier}`
          let row = historyMap.get(key)
          if (!row) { row = { year, teamId: runner.teamId, tier, races: 0, wins: 0 }; historyMap.set(key, row) }
          row.races += 1
          if (runner.rank === 1) row.wins += 1
        }
      }
    }
  }
  for (const ps of pastSeasons) {
    addHistory(ps.year, 'main', ps.races)
    addHistory(ps.year, 'second', ps.secondTeamRaces)
  }
  addHistory(currentSeason.year, 'main', currentSeason.races)
  addHistory(currentSeason.year, 'second', currentSeason.secondTeamRaces)
  // 海外リーグの出場（国内レースには出ないので foreignAppearances から年×クラブで積む）
  const addForeignHistory = (year: number, appMap: Record<string, { clubId: string; races: number; wins: number }> | undefined) => {
    const a = appMap?.[player.id]
    if (!a || !a.clubId) return
    const key = `${year}|${a.clubId}|main`
    let row = historyMap.get(key)
    if (!row) { row = { year, teamId: a.clubId, tier: 'main', races: 0, wins: 0 }; historyMap.set(key, row) }
    row.races += a.races
    row.wins += a.wins
  }
  for (const ps of pastSeasons) addForeignHistory(ps.year, ps.foreignAppearances)
  addForeignHistory(currentSeason.year, currentSeason.foreignAppearances)
  // 出走ゼロだった年の国内所属（シーズン終了時に保存）からも行を埋める（0戦でも在籍は表示する）
  for (const ps of pastSeasons) {
    const z = (ps.zeroAppearances ?? []).find(e => e.playerId === player.id)
    if (z) {
      const key = `${ps.year}|${z.teamId}|${z.tier}`
      if (!historyMap.has(key)) historyMap.set(key, { year: ps.year, teamId: z.teamId, tier: z.tier, races: 0, wins: 0 })
    }
  }
  // 現行シーズンは未出場でも「今年・現チーム」を必ず1行出す（0レースで空にしない）。
  // ルール: 1軍(A)にも2軍(B)にも出ていない選手はB行で表示。既にA/Bどちらかの出場行があれば追加しない
  // （Bのみ出場の選手に空のA行が生えるのを防ぐ）
  // 引退選手は現行シーズンの所属が無い（teamId空）ので、引退後の年に空行を生やさない
  if (!isRetired) {
    const anyThisYear = [...historyMap.keys()].some(k => k.startsWith(`${currentSeason.year}|${player.teamId}|`))
    if (!anyThisYear) historyMap.set(`${currentSeason.year}|${player.teamId}|second`, { year: currentSeason.year, teamId: player.teamId, tier: 'second', races: 0, wins: 0 })
  }
  // 同じ年に2チーム（シーズン中の移籍）がある場合は、現所属チームを必ず上にする
  const historyRows = [...historyMap.values()].sort(
    (a, b) => b.year - a.year
      || (a.teamId === b.teamId ? 0 : a.teamId === player.teamId ? -1 : b.teamId === player.teamId ? 1 : 0)
      || (a.tier === b.tier ? 0 : a.tier === 'main' ? -1 : 1)
  )

  return (
    <>
      {/* SNS共有用カード（画面外に描画してキャプチャする） */}
      <div ref={shareCardRef} style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <ShareCard player={player} team={team} />
      </div>
      <div
        onClick={() => openPlayerSheet(null)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
      />
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          // 上端はダイナミックアイランドの下（セーフエリア）から。下は広告バナー＋ホームバーの上で止める。
          position: 'fixed', top: 'env(safe-area-inset-top)', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px',
          overflowY: 'auto',
          touchAction: 'pan-y',
          backgroundColor: '#0A1729',
          zIndex: 201,
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center',
          padding: '12px 16px',
          backgroundColor: '#0A1729',
          borderBottom: '1px solid #1a3252',
        }}>
          <BackButton onClick={() => page === 4 ? goToPage(2) : openPlayerSheet(null)}/>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            {page === 4 ? (
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#F0EDE8' }}>{selectedRaceName}</span>
            ) : (
              (isProspect ? [1, 2] : isRetired ? [2, 3] : [1, 2, 3]).map(p => (
                <div key={p} onClick={() => goToPage(p)} style={{
                  width: page === p ? '20px' : '6px', height: '6px', borderRadius: '3px',
                  backgroundColor: page === p ? specCol : '#2E2B42',
                  transition: 'width 0.2s, background-color 0.2s',
                  cursor: 'pointer',
                }} />
              ))
            )}
          </div>
          <div style={{ minWidth: '52px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleShare} title="共有" data-html2canvas-ignore="true" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8FA6C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>
              </svg>
            </button>
            {!isMyPlayer && page !== 4 && (() => {
              const starred = isProspect ? starredProspects.includes(player.id) : starredOpponents.includes(player.id)
              return (
                <button onClick={() => isProspect ? toggleStarProspect(player.id) : toggleStarOpponent(player.id)} title={isProspect ? '注目リスト' : 'ウォッチリスト'} data-html2canvas-ignore="true" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={starred ? '#F5C842' : 'none'} stroke={starred ? '#F5C842' : '#5C5870'} strokeWidth="1.8">
                    <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z" strokeLinejoin="round"/>
                  </svg>
                </button>
              )
            })()}
          </div>
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 14px', background: `linear-gradient(135deg, ${specCol}10, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flexShrink: 0, position: 'relative', borderRadius: 14, overflow: 'hidden', border: `1.5px solid ${specCol}40` }}>
              <PlayerFace playerId={player.id} nationality={player.nationality} size={64} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px', fontWeight: '900', color: '#F0EDE8' }}>{player.name}</span>
                {player.nationality === 'FOREIGN' && (
                  <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#7986CB18', border: '1px solid #7986CB35', color: '#7986CB', fontWeight: '700' }}>外</span>
                )}
                {player.status === 'injured' && (
                  <span style={{ fontSize: '8px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#E8462A18', border: '1px solid #E8462A35', color: '#E8462A', fontWeight: '700' }}>負傷中</span>
                )}
              </div>
              <div style={{ fontSize: '10px', color: '#5C5870', marginBottom: '6px' }}>{player.nameKana}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ padding: '2px 8px', borderRadius: '10px', backgroundColor: isScouted ? `${specCol}18` : '#1E1B2E', color: isScouted ? specCol : '#5C5870', fontSize: '10px', fontWeight: '700' }}>
                  {isScouted ? SPECIALTY_LABELS[player.specialty] : '?'}
                </span>
                <span style={{ fontSize: '10px', color: '#5C5870' }}>{isScouted ? `${player.age}歳 / ${player.yearsPro + 1}年目` : '?'}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '32px', fontWeight: '900', color: isScouted ? ratingColor(playerOvr) : '#5C5870', fontFamily: 'monospace', lineHeight: 1 }}>{isScouted ? playerOvr : '?'}</div>
              <div style={{ fontSize: '8px', color: '#5C5870', letterSpacing: '1px' }}>OVR</div>
              {isScouted && player.ovrHistory && player.ovrHistory.length >= 2 && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                  <OVRSparkline history={player.ovrHistory}/>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page content (animated) */}
        <div key={pageKey} className={pageAnim}>

          {/* Page 1: プロフィール */}
          {page === 1 && !isRetired && (
            <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 記録パッチ（世界/日本記録・MVP・新人王・区間記録、最大5個）。
                  自チーム選手はタップでロスター名前横に表示するパッチを選べる */}
              {badges.length > 0 && (
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center', paddingTop: '10px' }}>
                  {badges.map(b => {
                    const col = BADGE_COLOR[b.kind]
                    const selected = player.displayBadge === b.key
                    return (
                      <span
                        key={b.key}
                        onClick={isMyPlayer ? () => setDisplayBadge(player.id, selected ? null : b.key) : undefined}
                        style={{
                          fontSize: '9px', fontWeight: 900, padding: '3px 8px', borderRadius: '7px',
                          background: `linear-gradient(180deg, ${col}2E, ${col}14)`,
                          color: col, border: `1px solid ${selected ? col : `${col}55`}`,
                          boxShadow: selected ? `0 0 8px ${col}66` : 'none',
                          cursor: isMyPlayer ? 'pointer' : 'default', flexShrink: 0,
                        }}
                      >
                        {b.label}{selected ? ' ✓' : ''}
                      </span>
                    )
                  })}
                  {isMyPlayer && <span style={{ width: '100%', textAlign: 'center', fontSize: '8px', color: '#5C5870' }}>タップでロスターに表示するパッチを選択</span>}
                </div>
              )}
              {isScouted && <RadarChart ratings={player.ratings} color={specCol} player={player} />}
              {isProspect ? (
                <>
                  <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E' }}>
                    <div style={{ fontSize: '8px', color: '#5C5870', marginBottom: '2px' }}>所属</div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#9B97A8' }}>{player.origin}</div>
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '8px', color: '#5C5870' }}>予想指名順位</div>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: (predictedPick && predictedPick <= 40) ? '#C9A84C' : '#5C5870', fontFamily: 'monospace' }}>
                      {predictedPick && predictedPick <= 40 ? `${Math.ceil(predictedPick / 20)}巡目 全体${predictedPick}位` : '指名圏外'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: '所属', val: team?.name ?? (player.teamId === '' ? '未所属' : '—') },
                      { label: '出身', val: player.origin },
                      { label: '成長タイプ', val: isScouted ? (player.growthCurve === 'early' ? '早熟' : player.growthCurve === 'late_bloomer' ? '晩成' : '標準') : '?' },
                      { label: '市場価値', val: isScouted ? fmt(calcTransferValue(player)) : '?' },
                      { label: '契約残', val: isScouted ? `${player.contract.yearsLeft}年` : '?' },
                      { label: '年俸', val: isScouted ? fmt(player.contract.annualSalary) : '?' },
                      { label: 'ドラフト', val: isScouted ? (player.draftRound && player.draftPick != null ? `${player.draftYear}年 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外') : '?' },
                    ].map(({ label, val }) => (
                      <div key={label} style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E' }}>
                        <div style={{ fontSize: '8px', color: '#5C5870', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#9B97A8' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Page 2: 駅伝データ */}
          {page === 2 && (
            <div style={{ padding: '12px 20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* 引退選手は1ページ目を出さないので、ドラフト情報をここに移植 */}
              {isRetired && (
                <div style={{ padding: '8px 10px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '8px', color: '#5C5870' }}>ドラフト</div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#9B97A8' }}>
                    {player.draftRound && player.draftPick != null ? `${player.draftYear}年 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外'}
                  </div>
                </div>
              )}

              {/* 自己ベスト（種目別・記録会で走った実タイムのみ）。種目を横に並べてタイムを下に置く */}
              <div>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>自己ベスト</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${EVENT_DISTANCES.length}, 1fr)`, borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E', background: '#14121F' }}>
                  {EVENT_DISTANCES.map((d, i) => {
                    const best = player.eventBests?.[d]
                    return (
                      <div key={d} style={{ padding: '9px 4px', textAlign: 'center', borderLeft: i > 0 ? '1px solid #1A1828' : 'none' }}>
                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#8B87A0', marginBottom: '4px' }}>{EVENT_LABEL[d]}</div>
                        {best ? (
                          <>
                            <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '900', color: '#C9A84C' }}>{formatRaceTime(best.timeSec)}</div>
                            <div style={{ fontSize: '8px', color: '#5C5870', marginTop: '1px' }}>{`'${String(best.year).slice(2)}`}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: '12px', color: '#3A3758' }}>—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 1軍 races（ドラフト候補では非表示）。縦長を避けるため3列カードで並べる */}
              {!isProspect && <div>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>1軍駅伝</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                  {MAIN_RACE_NAMES.map(name => {
                    const entries = raceGroupMap.get(name) ?? []
                    return (
                      <div key={name} onClick={() => openRaceDetail(name)} style={{
                        padding: '10px 6px', borderRadius: '8px', border: '1px solid #1E1B2E', backgroundColor: '#14121F',
                        cursor: 'pointer', textAlign: 'center', minHeight: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '10px', fontWeight: '700', lineHeight: 1.25, color: entries.length > 0 ? '#F0EDE8' : '#3A3758' }}>{name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>}

              {/* 2軍 races（ドラフト候補では非表示。加入後は通常詳細に切り替わり表示される） */}
              {!isProspect && reserveRaceNames.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>2軍駅伝</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                    {reserveRaceNames.map(name => {
                      const entries = raceGroupMap.get(name) ?? []
                      return (
                        <div key={name} onClick={() => openRaceDetail(name)} style={{
                          padding: '10px 6px', borderRadius: '8px', border: '1px solid #1E1B2E', backgroundColor: '#14121F',
                          cursor: 'pointer', textAlign: 'center', minHeight: 44,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', lineHeight: 1.25, color: entries.length > 0 ? '#F0EDE8' : '#3A3758' }}>{name}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Page 3: 在籍履歴（移籍情報）。ドラフト候補では非表示 */}
          {page === 3 && !isProspect && (
            <div style={{ padding: '12px 20px 28px' }}>
              <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '8px' }}>在籍履歴</div>
              {historyRows.length > 0 ? (
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E' }}>
                  {/* header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#14121F', borderBottom: '1px solid #1E1B2E' }}>
                    <span style={{ width: '40px', flexShrink: 0, fontSize: '8px', fontWeight: '700', color: '#5C5870' }}>年</span>
                    <span style={{ flex: 1, fontSize: '8px', fontWeight: '700', color: '#5C5870' }}>チーム名</span>
                    <span style={{ width: '36px', flexShrink: 0, fontSize: '8px', fontWeight: '700', color: '#5C5870', textAlign: 'center' }}>出場</span>
                    <span style={{ width: '36px', flexShrink: 0, fontSize: '8px', fontWeight: '700', color: '#5C5870', textAlign: 'center' }}>区間賞</span>
                  </div>
                  {historyRows.map((row, i) => {
                    const t = resolveTeam(row.teamId)
                    const teamName = t?.name ?? t?.shortName ?? ''
                    const isLoan = (player.loanTeamYears ?? []).some(l => l.year === row.year && l.teamId === row.teamId)
                      || (row.year === currentSeason.year && !!player.loan && row.teamId === player.teamId)
                    // 出走0の年はB表示（未出場の在籍はB扱い）
                    const suffix = `${row.tier === 'second' || row.races === 0 ? '(B)' : ''}${isLoan ? '(L)' : ''}`
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: i < historyRows.length - 1 ? '1px solid #1A1828' : 'none', backgroundColor: i % 2 === 0 ? '#0E0D17' : 'transparent' }}>
                        <span style={{ width: '40px', flexShrink: 0, fontSize: '12px', color: '#5C5870', fontFamily: 'monospace' }}>{row.year}</span>
                        <div
                          onClick={t && !teamJumpBlocked ? () => goToTeamPage(row.teamId) : undefined}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, cursor: t && !teamJumpBlocked ? 'pointer' : 'default' }}
                        >
                          {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20} />}
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {teamName}
                            {suffix && <span style={{ fontSize: '10px', color: '#9B97A8', marginLeft: '3px' }}>{suffix}</span>}
                            {isRetired && i === 0 && <span style={{ fontSize: '9px', fontWeight: 800, color: '#E8462A', marginLeft: '5px', padding: '1px 5px', borderRadius: 4, background: 'rgba(232,70,42,0.12)', border: '1px solid rgba(232,70,42,0.3)' }}>引退済み</span>}
                          </span>
                          {t && !teamJumpBlocked && (
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" style={{ color: '#5C5870', flexShrink: 0 }}>
                              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                            </svg>
                          )}
                        </div>
                        <span style={{ width: '36px', flexShrink: 0, fontSize: '13px', fontWeight: '900', color: '#9B97A8', fontFamily: 'monospace', textAlign: 'center' }}>{row.races}</span>
                        <span style={{ width: '36px', flexShrink: 0, fontSize: '13px', fontWeight: '900', color: row.wins > 0 ? '#C9A84C' : '#3A3758', fontFamily: 'monospace', textAlign: 'center' }}>{row.wins}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#3A3758', fontSize: '13px', padding: '48px 0' }}>記録なし</div>
              )}
            </div>
          )}

          {/* Page 4: レース詳細（ドリルダウン） */}
          {page === 4 && selectedRaceName && (() => {
            const entries = (raceGroupMap.get(selectedRaceName) ?? []).slice().sort((a, b) => b.year - a.year)
            return (
              <div style={{ padding: '12px 20px 28px' }}>
                {entries.length > 0 ? (
                  <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E' }}>
                    {entries.map((e, i) => {
                      const rankCol = e.rank === 1 ? '#C9A84C' : e.rank <= 3 ? '#9B97A8' : '#5C5870'
                      // この大会×区間の区間記録保持者で、かつこの行がその記録更新の走りなら「区間記録」パッチ
                      const rec = (segmentRecords[`${selectedRaceName}-${e.segIdx}`] ?? [])[0]
                      const isSegRecord = !!rec && rec.timeSec === e.timeSec &&
                        (rec.playerId ? rec.playerId === player.id : rec.playerName === player.name)
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: i < entries.length - 1 ? '1px solid #1A1828' : 'none', backgroundColor: i % 2 === 0 ? '#0E0D17' : 'transparent' }}>
                          <span style={{ fontSize: '12px', color: '#5C5870', fontFamily: 'monospace', flexShrink: 0, width: '48px' }}>{e.year}年</span>
                          <span style={{ fontSize: '12px', color: '#9B97A8', flexShrink: 0 }}>第{e.segIdx}区{e.distKm != null ? ` ${e.distKm}km` : ''}</span>
                          <span style={{ fontSize: '15px', fontWeight: '900', color: rankCol, fontFamily: 'monospace', width: '32px', textAlign: 'center', flexShrink: 0 }}>{e.rank}位</span>
                          {isSegRecord && (
                            <span style={{ fontSize: '8px', fontWeight: '900', letterSpacing: '0.05em', padding: '2px 6px', borderRadius: '4px', background: 'linear-gradient(180deg,#F5D76E,#C9A84C)', color: '#1a0d00', flexShrink: 0 }}>区間記録</span>
                          )}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#9B97A8', fontFamily: 'monospace', flexShrink: 0 }}>{formatTime(e.timeSec)}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: '#3A3758', fontSize: '13px', padding: '48px 0' }}>未出走</div>
                )}
              </div>
            )
          })()}

        </div>
      </div>
    </>
  )
}
