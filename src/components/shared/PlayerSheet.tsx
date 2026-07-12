import { useState, useEffect, useRef } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useAdHeight } from '../layout/Layout'
import { SPECIALTY_LABELS } from '../../types'
import type { Player, TeamRole } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, isOpponentScouted, getStatPotentials, statCapBand, isStatMaxed } from '../../utils/playerUtils'
import { formatTime } from '../../engine/raceEngine'
import { EVENT_DISTANCES, EVENT_LABEL, formatRaceTime } from '../../utils/eventTime'
import { MAIN_RACE_NAMES, RESERVE_RACE_POOL_NAMES } from '../../data/races'

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
  const foreignLeagues = useGameStore(s => s.foreignLeagues ?? [])
  // 国内チーム or 海外クラブから所属を解決
  const resolveTeam = (id: string) => teams.find(t => t.id === id) ?? foreignLeagues.flatMap(l => l.clubs).find(c => c.id === id)
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const segmentRecords = useGameStore(s => s.segmentRecords ?? {})
  const adH = useAdHeight()
  const [page, setPage] = useState(1)
  const [pageAnim, setPageAnim] = useState('')
  const [pageKey, setPageKey] = useState(0)
  const [selectedRaceName, setSelectedRaceName] = useState<string | null>(null)
  const touchStart = useRef({ x: 0, y: 0 })

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
      // ドラフト候補（通常選手リスト外）は2ページまで
      const maxPage = players.some(p => p.id === openPlayerId) ? 3 : 2
      if (dx < 0) goToPage(Math.min(page + 1, maxPage))
      if (dx > 0) goToPage(Math.max(page - 1, 1))
    }
  }

  // 通常の選手に加え、スカウトのドラフト候補（Player[]）も詳細表示できるよう解決する
  const player = players.find(p => p.id === openPlayerId)
    ?? (currentSeason.scoutProspects ?? []).find(p => p.id === openPlayerId)

  useEffect(() => {
    setPage(1)
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
  // スカウトのドラフト候補（通常の選手リストに居ない＝scoutProspects由来）は詳細ページを簡略表示にする
  const isProspect = !players.some(p => p.id === player.id)
  const isScouted = isMyPlayer || isProspect || isOpponentScouted(player.id, currentSeason)

  // ドラフト候補の予想指名順位（能力＋将来性で全候補内の順位を推定）
  const predictedPick = isProspect ? (() => {
    const val = (pl: typeof player) => ovr(pl) + (pl.potential ?? 0) * 0.5
    const pool = [...(currentSeason.scoutProspects ?? [])].sort((a, b) => val(b) - val(a))
    const idx = pool.findIndex(p => p.id === player.id)
    return idx >= 0 ? idx + 1 : null
  })() : null
  const playerOvr = ovr(player)
  const specCol = SPEC_COLOR[player.specialty]

  type RaceEntry = { year: number; segIdx: number; rank: number; timeSec: number }
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
      addEntry(race.name, { year, segIdx: sr.segmentIndex, rank: runner.rank, timeSec: runner.timeSec })
    }
  }
  for (const ps of pastSeasons) {
    processRaces(ps.races, ps.year)
    processRaces(ps.collegeRaces ?? [], ps.year)
  }
  processRaces(currentSeason.races, currentSeason.year)
  processRaces(currentSeason.collegeRaces ?? [], currentSeason.year)

  const seenReserveNames = new Set<string>()
  for (const r of [...(currentSeason.collegeRaces ?? []), ...pastSeasons.flatMap(ps => ps.collegeRaces ?? [])]) {
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
  // 現行シーズンは未出場でも「今年・現チーム・現在の1軍2軍」を必ず1行出す（0レースで空にしない）
  {
    const curTier: 'main' | 'second' = player.rosterTier === 'second' ? 'second' : 'main'
    const key = `${currentSeason.year}|${player.teamId}|${curTier}`
    if (!historyMap.has(key)) historyMap.set(key, { year: currentSeason.year, teamId: player.teamId, tier: curTier, races: 0, wins: 0 })
  }
  // 同じ年に2チーム（シーズン中の移籍）がある場合は、現所属チームを必ず上にする
  const historyRows = [...historyMap.values()].sort(
    (a, b) => b.year - a.year
      || (a.teamId === b.teamId ? 0 : a.teamId === player.teamId ? -1 : b.teamId === player.teamId ? 1 : 0)
      || (a.tier === b.tier ? 0 : a.tier === 'main' ? -1 : 1)
  )

  return (
    <>
      <div
        onClick={() => openPlayerSheet(null)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
      />
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          // 下は広告バナーの帯（買い切り版は0）。他画面と同じくシートは広告の上で止める
          position: 'fixed', top: 0, bottom: adH, left: 0, right: 0, margin: '0 auto',
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
              (isProspect ? [1, 2] : [1, 2, 3]).map(p => (
                <div key={p} onClick={() => goToPage(p)} style={{
                  width: page === p ? '20px' : '6px', height: '6px', borderRadius: '3px',
                  backgroundColor: page === p ? specCol : '#2E2B42',
                  transition: 'width 0.2s, background-color 0.2s',
                  cursor: 'pointer',
                }} />
              ))
            )}
          </div>
          {!isMyPlayer && !isProspect && page !== 4 ? (
            <button
              onClick={() => toggleStarOpponent(player.id)}
              title="ウォッチリスト"
              style={{ width: '52px', display: 'flex', justifyContent: 'flex-end', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill={starredOpponents.includes(player.id) ? '#F5C842' : 'none'} stroke={starredOpponents.includes(player.id) ? '#F5C842' : '#5C5870'} strokeWidth="1.8">
                <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z" strokeLinejoin="round"/>
              </svg>
            </button>
          ) : (
            <div style={{ width: '52px' }} />
          )}
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
          {page === 1 && (
            <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isScouted && <RadarChart ratings={player.ratings} color={specCol} player={player} />}
              {isScouted && !isProspect && (() => {
                const caps = getStatPotentials(player)
                return (
                  <div style={{ padding: '10px 12px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E' }}>
                    <div style={{ fontSize: '8px', color: '#5C5870', letterSpacing: '1px', marginBottom: '6px' }}>伸びしろ（成長上限の目安）</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '5px' }}>
                      {RADAR_KEYS.map(({ key, abbr }) => {
                        const cur = player.ratings[key] ?? 0
                        const cap = (caps as Record<string, number>)[key] ?? 99
                        const maxed = cur >= cap
                        const band = statCapBand(cap)
                        return (
                          <div key={key} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '6px', background: maxed ? `${'#C9A84C'}14` : '#100E1A', border: `1px solid ${maxed ? '#C9A84C40' : '#1E1B2E'}` }}>
                            <div style={{ fontSize: '8px', color: '#5C5870', marginBottom: '1px' }}>{abbr}</div>
                            <div style={{ fontFamily: "'Saira Condensed',system-ui,sans-serif", fontSize: '11px', fontWeight: '900', color: maxed ? '#C9A84C' : '#9B97A8' }}>{cur}</div>
                            <div style={{ fontFamily: "'Saira Condensed',system-ui,sans-serif", fontSize: '8px', color: maxed ? '#C9A84C' : '#5C5870' }}>
                              {maxed ? 'MAX' : `~${band.lo}-${band.hi}`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
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
                      { label: '所属', val: team?.name ?? (player.teamId === '' ? 'FA' : '—') },
                      { label: '出身', val: player.origin },
                      { label: '成長タイプ', val: isScouted ? (player.growthCurve === 'early' ? '早熟' : player.growthCurve === 'late_bloomer' ? '晩成' : '標準') : '?' },
                      { label: '市場価値', val: isScouted ? fmt(calcTransferValue(player)) : '?' },
                      { label: '契約残', val: isScouted ? `${player.contract.yearsLeft}年` : '?' },
                      { label: '年俸', val: isScouted ? fmt(player.contract.annualSalary) : '?' },
                      { label: 'ドラフト', val: isScouted ? (player.draftRound && player.draftPick != null ? `${player.draftYear}年 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外') : '?' },
                      { label: '立ち位置', val: isScouted ? (player.teamRole ? TEAM_ROLE_LABEL[player.teamRole] : '—') : '?' },
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

              {/* Career */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  { label: '通算出走', val: player.career.totalRaces },
                  { label: '区間賞', val: player.career.segmentWins },
                ].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: '8px', backgroundColor: '#14121F', border: '1px solid #1E1B2E' }}>
                    <div style={{ fontSize: '20px', fontWeight: '900', color: val > 0 ? '#C9A84C' : '#3A3758', fontFamily: 'monospace', lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: '8px', color: '#5C5870', marginTop: '3px' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* 自己ベスト（種目別・記録会で走った実タイムのみ） */}
              <div>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>自己ベスト</div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E' }}>
                  {EVENT_DISTANCES.map((d, i) => {
                    const best = player.eventBests?.[d]
                    return (
                      <div key={d} style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', backgroundColor: i % 2 === 0 ? '#14121F' : 'transparent', borderBottom: i < EVENT_DISTANCES.length - 1 ? '1px solid #1A1828' : 'none' }}>
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: '700', color: '#C9C6D0' }}>{EVENT_LABEL[d]}</span>
                        {best ? (
                          <>
                            <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: '900', color: '#C9A84C' }}>{formatRaceTime(best.timeSec)}</span>
                            <span style={{ width: 40, textAlign: 'right', fontSize: '8px', color: '#5C5870' }}>{`'${String(best.year).slice(2)}`}</span>
                          </>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#3A3758' }}>記録なし</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 1軍 races（ドラフト候補では非表示） */}
              {!isProspect && <div>
                <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>1軍駅伝</div>
                <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E' }}>
                  {MAIN_RACE_NAMES.map((name, i) => {
                    const entries = raceGroupMap.get(name) ?? []
                    const lastEntry = entries.slice().sort((a, b) => b.year - a.year)[0]
                    return (
                      <div key={name} onClick={() => openRaceDetail(name)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderBottom: i < MAIN_RACE_NAMES.length - 1 ? '1px solid #1A1828' : 'none', cursor: 'pointer' }}>
                        <span style={{ flex: 1, fontSize: '12px', fontWeight: '700', color: entries.length > 0 ? '#F0EDE8' : '#3A3758' }}>{name}</span>
                        {lastEntry && (
                          <span style={{ fontSize: '10px', color: lastEntry.rank === 1 ? '#C9A84C' : '#5C5870', fontFamily: 'monospace' }}>
                            {lastEntry.year}年 {lastEntry.rank}位
                          </span>
                        )}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                      </div>
                    )
                  })}
                </div>
              </div>}

              {/* 2軍 races */}
              {reserveRaceNames.length > 0 && (
                <div>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: '#5C5870', letterSpacing: '2px', marginBottom: '6px' }}>2軍駅伝</div>
                  <div style={{ borderRadius: '8px', overflow: 'hidden', border: '1px solid #1E1B2E' }}>
                    {reserveRaceNames.map((name, i) => {
                      const entries = raceGroupMap.get(name) ?? []
                      const lastEntry = entries.slice().sort((a, b) => b.year - a.year)[0]
                      return (
                        <div key={name} onClick={() => openRaceDetail(name)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 12px', borderBottom: i < reserveRaceNames.length - 1 ? '1px solid #1A1828' : 'none', cursor: 'pointer' }}>
                          <span style={{ flex: 1, fontSize: '12px', fontWeight: '700', color: entries.length > 0 ? '#F0EDE8' : '#3A3758' }}>{name}</span>
                          {lastEntry && (
                            <span style={{ fontSize: '10px', color: lastEntry.rank === 1 ? '#C9A84C' : '#5C5870', fontFamily: 'monospace' }}>
                              {lastEntry.year}年 {lastEntry.rank}位
                            </span>
                          )}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, opacity: 0.3 }}>
                            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                          </svg>
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
                    const suffix = `${row.tier === 'second' ? '(B)' : ''}${isLoan ? '(L)' : ''}`
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderBottom: i < historyRows.length - 1 ? '1px solid #1A1828' : 'none', backgroundColor: i % 2 === 0 ? '#0E0D17' : 'transparent' }}>
                        <span style={{ width: '40px', flexShrink: 0, fontSize: '12px', color: '#5C5870', fontFamily: 'monospace' }}>{row.year}</span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20} />}
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {teamName}
                            {suffix && <span style={{ fontSize: '10px', color: '#9B97A8', marginLeft: '3px' }}>{suffix}</span>}
                          </span>
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
                          <span style={{ fontSize: '12px', color: '#9B97A8', flexShrink: 0 }}>第{e.segIdx + 1}区</span>
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
