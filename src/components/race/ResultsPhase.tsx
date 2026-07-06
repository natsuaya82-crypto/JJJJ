import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { showRewardAd } from '../../utils/ads'
import type { Race, RaceResults, Team, Player, Season, Nationality } from '../../types'
import { formatTime, formatDiff } from '../../engine/raceEngine'
import { segOvr } from '../../utils/playerUtils'
import { terrainColor, terrainLabel } from './raceUtils'
import { useGameStore } from '../../store/gameStore'
import { RARITY_COLORS, RARITY_LABELS, CARD_STAT_LABELS, CARD_NAMES } from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

function paceLabel(timeSec: number, km: number): string {
  if (km <= 0) return '--'
  const p = timeSec / km
  const m = Math.floor(p / 60)
  const s = Math.round(p % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}

function FaceOrDot({ playerId, nationality, size = 40 }: { playerId?: string; nationality?: string; size?: number }) {
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

function requiredExp(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 1.5 : 2
  return Math.floor(0.5 * level * level * dull)
}

const rankColors: Record<number, string> = { 1: C.gold, 2: '#9B97A8', 3: '#CD7F32' }

const RANK_ROW_STYLE = (rank: number, isPlayer: boolean): React.CSSProperties => {
  if (isPlayer) return {
    background: `linear-gradient(90deg, ${alpha(C.cyan, 0.1)}, transparent)`,
    borderLeft: `3px solid ${C.cyan}`,
  }
  if (rank === 1) return {
    background: `linear-gradient(90deg, ${alpha(C.gold, 0.1)}, transparent)`,
    borderLeft: `3px solid ${C.gold}`,
  }
  if (rank === 2) return {
    background: `linear-gradient(90deg, ${alpha('#9B97A8', 0.08)}, transparent)`,
    borderLeft: '3px solid #9B97A8',
  }
  if (rank === 3) return {
    background: `linear-gradient(90deg, ${alpha('#CD7F32', 0.08)}, transparent)`,
    borderLeft: '3px solid #CD7F32',
  }
  return { paddingLeft: 3 }
}

export function ResultsPhase({
  race, results, teams, players, playerTeamId, currentSeason, isLastRace,
  reserveStandings, onContinue,
}: {
  race: Race
  results: RaceResults
  teams: Team[]
  players: Player[]
  playerTeamId: string
  currentSeason: Season
  isLastRace: boolean
  reserveStandings?: Season['secondTeamStandings']
  onContinue?: () => void
}) {
  const navigate = useNavigate()
  const [view, setView] = useState<'main' | 'segments' | 'exp'>('main')
  const raceDroppedCards = useGameStore(s => s.raceDroppedCards ?? [])
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const raceExpGains = useGameStore(s => s.raceExpGains ?? {})
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const playerMap = new Map(players.map(p => [p.id, p]))
  const playerResult = results.teamRankings.find(r => r.teamId === playerTeamId)
  const leader = results.teamRankings[0]
  const championTextIdx = results.teamRankings.length % 3

  // 経験値を獲得した自チームの出走選手
  const expRacers = (() => {
    if (Object.keys(raceExpGains).length === 0) return [] as Player[]
    const racerIds = results.segmentResults.flatMap(sr => sr.runners.map(r => r.playerId))
    const myRacerIds = [...new Set(racerIds)].filter(id => playerMap.get(id)?.teamId === playerTeamId)
    return myRacerIds.map(id => playerMap.get(id)).filter((p): p is Player => !!p && !!raceExpGains[p.id])
  })()
  const hasExp = expRacers.length > 0

  // 契約満了3ヶ月未満の選手がいれば、レース後に契約対応（通知）へ強制遷移する
  const urgentRenewalExists = (() => {
    const raceIndex = currentSeason.currentRaceIndex ?? 0
    const totalRaces = currentSeason.races?.length ?? 1
    return players.some(p => {
      if (p.teamId !== playerTeamId || p.status !== 'active') return false
      const remaining = Math.max(0, totalRaces - raceIndex)
      const months = Math.round((p.contract.yearsLeft - 1 + remaining / totalRaces) * 12)
      return months < 3 && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id)
    })
  })()

  const finish = async () => {
    // 契約満了間近の選手がいる場合は先に対応させる。
    // シーズン最終戦・リザーブリーグ（reserveStandings/onContinue経由）では誘導しない。
    if (urgentRenewalExists && !isLastRace && !reserveStandings && !onContinue) { navigate('/notifications'); return }
    if (isLastRace && !adsRemoved) await showRewardAd()
    onContinue ? onContinue() : navigate('/')
  }

  const teamPopularity = (() => {
    const sorted = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
    const rank = sorted.findIndex(s => s.teamId === playerTeamId) + 1 || Math.ceil(teams.length / 2)
    const t = teams.find(tm => tm.id === playerTeamId)
    const champBonus = t ? t.history.championships * 6 : 0
    return Math.max(15, Math.min(95, 75 - (rank - 1) * 5 + champBonus))
  })()
  const audienceK = Math.round((40 + teamPopularity * 0.8) * 10) / 10

  const standingsSource = reserveStandings ?? currentSeason.standings
  const fullSorted = [...standingsSource].sort((a, b) => b.totalPoints - a.totalPoints)
  const seasonMaxPts = fullSorted[0]?.totalPoints || 1
  const playerSeasonRank = fullSorted.findIndex(s => s.teamId === playerTeamId) + 1
  // 上位10行。トップ10外なら自チーム行を区切って末尾に追加
  const seasonRows: { s: typeof fullSorted[number]; rank: number; isBreak: boolean }[] =
    fullSorted.slice(0, 10).map((s, i) => ({ s, rank: i + 1, isBreak: false }))
  if (playerSeasonRank > 10) {
    seasonRows.push({ s: fullSorted[playerSeasonRank - 1], rank: playerSeasonRank, isBreak: true })
  }

  const segmentDetailCards = results.segmentResults.map((sr, i) => {
    const seg = race.segments.find(s => s.index === sr.segmentIndex)
    const segCol = seg ? terrainColor(seg.uphillPct, seg.downhillPct) : C.blue
    const leaderTime = sr.runners[0]?.timeSec ?? 0
    const myRunner = sr.runners.find(r => r.teamId === playerTeamId)
    const isMyWin = sr.runners[0]?.teamId === playerTeamId

    // top3 + my runner if not in top3
    const displayed = (() => {
      const top3 = sr.runners.slice(0, 3)
      if (!myRunner || top3.some(r => r.teamId === playerTeamId)) return top3
      return [...top3, myRunner]
    })()

    return (
      <div key={sr.segmentIndex} style={{
        borderRadius: 14,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
        marginBottom: i < results.segmentResults.length - 1 ? 10 : 0,
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
            const isMe = runner.teamId === playerTeamId
            const t = teamMap.get(runner.teamId)
            const p = playerMap.get(runner.playerId)
            const diff = runner.timeSec - leaderTime
            const rankCol = runner.rank === 1 ? C.gold : runner.rank === 2 ? '#9B97A8' : runner.rank === 3 ? '#CD7F32' : isMe ? C.cyan : C.textGhost
            const myRunnerPlayer = isMe && seg ? p : null
            const ovrVal = myRunnerPlayer && seg ? segOvr(myRunnerPlayer, seg.uphillPct, seg.downhillPct, seg.distanceKm) : null
            const highFatigue = myRunnerPlayer && (myRunnerPlayer.fatigue ?? 0) >= 70

            return (
              <div key={runner.playerId} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                borderBottom: ri < displayed.length - 1 ? `1px solid ${alpha(C.gold, 0.07)}` : 'none',
                background: isMe ? `linear-gradient(90deg, ${alpha(C.cyan, 0.08)}, transparent)` : undefined,
                borderLeft: isMe ? `3px solid ${C.cyan}` : '3px solid transparent',
              }}>
                <div style={{ width: 18, textAlign: 'center', flexShrink: 0, fontSize: 11, fontWeight: 900, fontFamily: SAIRA, color: rankCol, textShadow: runner.rank === 1 ? `0 0 8px ${alpha(C.gold, 0.5)}` : 'none' }}>
                  {runner.rank}
                </div>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <FaceOrDot playerId={p?.id} nationality={p?.nationality} size={30} />
                  {t && (
                    <div style={{ position: 'absolute', bottom: -2, right: -3 }}>
                      <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={14} />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {p && <div style={{ fontSize: 11, fontWeight: isMe ? 800 : 600, color: isMe ? C.text : C.textSub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
                    <span style={{ fontSize: 9, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>{t?.name ?? '?'}</span>
                    {ovrVal !== null && <span style={{ fontSize: 8, fontWeight: 700, fontFamily: SAIRA, color: ovrVal >= 80 ? C.gold : ovrVal >= 65 ? C.green : C.textDim, flexShrink: 0 }}>{ovrVal}</span>}
                    {highFatigue && <span style={{ fontSize: 8, color: C.red, fontWeight: 700, fontFamily: SAIRA, flexShrink: 0 }}>疲{myRunnerPlayer!.fatigue}</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontFamily: SAIRA, color: isMe ? C.text : C.textDim }}>{formatTime(runner.timeSec)}</div>
                  {diff > 0 && <div style={{ fontSize: 8, color: C.textGhost, fontFamily: SAIRA }}>+{formatDiff(diff)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  })

  // 区間タイム詳細：別ビュー（結果画面が長いので分離）
  if (view === 'segments') {
    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: '40px', background: C.bg, minHeight: '100dvh' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setView('main')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.textSub,
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 9, color: C.gold, letterSpacing: 2, fontWeight: 800 }}>SEGMENTS</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>区間タイム詳細</div>
          </div>
        </div>
        <div style={{ padding: '14px 12px' }}>
          {segmentDetailCards}
        </div>
      </div>
    )
  }

  // 経験値獲得：最終結果のあとに表示する専用画面
  if (view === 'exp') {
    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: '40px', background: C.bg, minHeight: '100dvh' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.surface2, borderBottom: `1px solid ${C.border}`, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setView('main')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: C.textSub,
            padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <div style={{ fontSize: 9, color: '#7986CB', letterSpacing: 2, fontWeight: 800 }}>EXP GAIN</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>経験値獲得</div>
          </div>
        </div>
        <div style={{ padding: '14px 12px' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${alpha('#7986CB', 0.6)}`,
            borderRadius: 16, padding: '14px 16px',
            boxShadow: `0 4px 0 #0d1133, 0 6px 16px rgba(0,0,0,0.4)`,
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {expRacers.map(p => {
                const gains = raceExpGains[p.id] ?? {}
                const gainedKeys = Object.keys(gains) as import('../../types').CardStatKey[]
                return (
                  <div key={p.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <FaceOrDot playerId={p.id} nationality={p.nationality} size={32} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {gainedKeys.map(k => {
                        const gained = gains[k] ?? 0
                        const cur = p.ratings[k] ?? 0
                        const curExp = p.exp?.[k] ?? 0
                        const req = requiredExp(cur)
                        const beforeExp = Math.max(0, curExp - gained)
                        const basePct = req > 0 ? Math.min(beforeExp / req, 1) : 1
                        const gainPct = req > 0 ? Math.min(gained / req, 1 - basePct) : 0
                        return (
                          <div key={k} style={{ minWidth: 66 }}>
                            <div style={{ fontSize: 8, color: C.textDim, marginBottom: 3 }}>{CARD_STAT_LABELS[k]}</div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#7986CB', fontFamily: SAIRA }}>{cur}</span>
                              <span style={{ fontSize: 9, fontWeight: 700, color: C.green, fontFamily: SAIRA }}>+{gained}</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 2, background: alpha(C.border, 0.8), overflow: 'hidden', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${basePct * 100}%`, background: alpha(C.textSub, 0.4), borderRadius: 2 }}/>
                              <div style={{ position: 'absolute', left: `${basePct * 100}%`, top: 0, height: '100%', width: `${gainPct * 100}%`, background: '#7986CB', borderRadius: 2, boxShadow: `0 0 6px #7986CB` }}/>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <div style={{ padding: '8px 12px' }}>
          {isLastRace ? (
            <button className="btn-game btn-game--gold" onClick={finish} style={{ width: '100%', marginBottom: 8 }}>
              <span className="btn-game__inner">
                {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
              </span>
            </button>
          ) : (
            <button className="btn-game btn-game--blue" onClick={finish} style={{ width: '100%', marginBottom: 8 }}>
              <span className="btn-game__inner">
                {onContinue ? '次の試合へ →' : 'ホームへ戻る'}
              </span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '40px' }}>

      <div style={{
        padding: '28px 20px 20px', textAlign: 'center',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        borderRadius: 14,
        position: 'relative',
        overflow: 'hidden',
        margin: '12px 12px 0',
        boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 40px ${alpha(C.gold, 0.08)}`,
      }}>
        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '3px', marginBottom: '6px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
          RACE COMPLETE
        </div>
        <div style={{
          fontSize: '26px', fontWeight: '900', color: C.text, marginBottom: '6px',
          textShadow: '-1px -1px 0 #061224,1px -1px 0 #061224,-1px 1px 0 #061224,1px 1px 0 #061224',
        }}>
          {race.name}
        </div>
        <div style={{ fontSize: '13px', color: C.textSub }}>
          優勝：{teamMap.get(leader?.teamId ?? '')?.name ?? '―'}
        </div>
      </div>

      {/* ── HIGHLIGHTS ── */}
      {(() => {
        const segMeta = new Map(race.segments.map(s => [s.index, s]))
        const allPerf = results.segmentResults.flatMap(sr => {
          const km = segMeta.get(sr.segmentIndex)?.distanceKm ?? 1
          return sr.runners.map(r => ({ ...r, segmentIndex: sr.segmentIndex, km, pace: km > 0 ? r.timeSec / km : Infinity }))
        })
        if (allPerf.length === 0) return null

        // 最速ラップ（区間距離が違うのでペース基準）
        const fastest = allPerf.reduce((b, p) => p.pace < b.pace ? p : b)

        // 自チーム区間賞
        const segWins = results.segmentResults
          .filter(sr => sr.runners[0]?.teamId === playerTeamId)
          .map(sr => {
            const w = sr.runners[0]
            const margin = sr.runners[1] ? sr.runners[1].timeSec - w.timeSec : 0
            return { ...w, segmentIndex: sr.segmentIndex, margin }
          })

        // MVP：自チームの最良パフォーマンス（区間賞のうち最大差→なければ最高順位）
        const myPerf = allPerf.filter(p => p.teamId === playerTeamId)
        const mvp = segWins.length > 0
          ? segWins.reduce((a, b) => b.margin > a.margin ? b : a)
          : myPerf.length > 0
            ? myPerf.reduce((a, b) => b.rank < a.rank ? b : a)
            : null

        type HL = { key: string; label: string; color: string; playerId: string; teamId: string; segmentIndex: number; detail: string; sub: string }
        const cards: HL[] = []
        if (mvp) {
          const isWin = 'margin' in mvp
          cards.push({
            key: 'mvp', label: 'MVP', color: C.cyan,
            playerId: mvp.playerId, teamId: mvp.teamId, segmentIndex: mvp.segmentIndex,
            detail: isWin ? `${mvp.segmentIndex}区 区間賞` : `${mvp.segmentIndex}区 ${mvp.rank}位`,
            sub: formatTime(mvp.timeSec),
          })
        }
        cards.push({
          key: 'fastest', label: 'FASTEST LAP', color: C.gold,
          playerId: fastest.playerId, teamId: fastest.teamId, segmentIndex: fastest.segmentIndex,
          detail: `${fastest.segmentIndex}区 最速`,
          sub: paceLabel(fastest.timeSec, fastest.km),
        })

        return (
          <div style={{ margin: '14px 12px 0' }}>
            <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2, fontWeight: 800, marginBottom: 8, textShadow: `0 0 10px ${alpha(C.gold, 0.4)}` }}>HIGHLIGHTS</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {cards.map(c => {
                const p = playerMap.get(c.playerId)
                const t = teamMap.get(c.teamId)
                return (
                  <div key={c.key} style={{
                    flex: 1, minWidth: 0,
                    borderRadius: 14, padding: '12px 12px 14px',
                    background: `linear-gradient(180deg, ${alpha(c.color, 0.12)}, ${C.surface2})`,
                    border: `2px solid ${alpha(c.color, 0.5)}`,
                    boxShadow: `0 4px 0 rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.35), 0 0 20px ${alpha(c.color, 0.1)}`,
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 2, color: c.color, marginBottom: 8, textShadow: `0 0 8px ${alpha(c.color, 0.5)}` }}>{c.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <FaceOrDot playerId={p?.id} nationality={p?.nationality} size={42} />
                        {t && (
                          <div style={{ position: 'absolute', bottom: -2, right: -3 }}>
                            <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={18} />
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p?.name ?? '—'}</div>
                        <div style={{ fontSize: 9, color: C.textDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t?.name ?? ''}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c.color, fontFamily: SAIRA }}>{c.detail}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: C.text, fontFamily: SAIRA, lineHeight: 1.1 }}>{c.sub}</div>
                  </div>
                )
              })}
            </div>
            {segWins.length > 0 && (
              <div style={{
                marginTop: 8, padding: '8px 12px', borderRadius: 10,
                background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.3)}`,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>区間賞</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: C.gold, fontFamily: SAIRA, textShadow: `0 0 8px ${alpha(C.gold, 0.5)}` }}>{segWins.length}</span>
                <div style={{ flex: 1 }} />
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {segWins.map(w => (
                    <span key={w.segmentIndex} style={{ fontSize: 9, fontWeight: 700, color: C.gold, fontFamily: SAIRA, padding: '1px 5px', borderRadius: 4, background: alpha(C.gold, 0.12) }}>{w.segmentIndex}区</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {raceDroppedCards.length > 0 && (
        <div style={{ margin: '14px 12px 0' }}>
          <div style={{
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.green}`,
            borderRadius: 16, padding: '14px 16px',
            position: 'relative', overflow: 'hidden',
            boxShadow: `0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}>
            <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.green, 0.15)}`, borderRadius: 12, pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 10, color: C.green, letterSpacing: 2, fontWeight: 700, textShadow: `0 0 10px ${alpha(C.green, 0.5)}` }}>CARD DROP</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>
                  {raceDroppedCards.length}枚のカードを獲得
                </div>
              </div>
              <button
                onClick={() => navigate('/cards')}
                style={{
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${C.green}`,
                  borderRadius: 11, color: C.green,
                  fontSize: 11, fontWeight: 700,
                  padding: '11px 18px', cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 0 #0d3d22, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)',
                  position: 'relative', overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <span style={{ position: 'absolute', top: 2, left: 6, right: 6, height: '35%', background: 'linear-gradient(180deg,rgba(255,255,255,0.1),transparent)', borderRadius: '5px 5px 50% 50%', pointerEvents: 'none' }} />
                練習する
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
              {raceDroppedCards.map(card => (
                <div key={card.id} style={{
                  flexShrink: 0,
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `1.5px solid ${RARITY_COLORS[card.rarity]}`,
                  borderRadius: 10, padding: '8px 10px',
                  textAlign: 'center', minWidth: 68,
                }}>
                  <div style={{ fontSize: 8, color: RARITY_COLORS[card.rarity], fontWeight: 700, marginBottom: 4 }}>
                    {RARITY_LABELS[card.rarity]}
                  </div>
                  <div style={{ fontSize: 10, color: C.textSub, marginBottom: 4 }}>
                    {CARD_NAMES[card.statKey]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {playerResult && (() => {
        const mySegWinCount = results.segmentResults.filter(sr => sr.runners[0]?.teamId === playerTeamId).length
        const mySegWinPlayer = mySegWinCount > 0
          ? playerMap.get(results.segmentResults.find(sr => sr.runners[0]?.teamId === playerTeamId)!.runners[0].playerId)
          : null
        const totalTeams = results.teamRankings.length
        const isBigComeback = playerResult.rank <= 3 && results.segmentResults.length >= 3 &&
          results.segmentResults.slice(0, Math.floor(results.segmentResults.length / 2))
            .some(sr => (sr.runners.find(r => r.teamId === playerTeamId)?.rank ?? 99) > Math.floor(totalTeams / 2))

        const moment: { label: string; text: string; color: string } | null =
          playerResult.rank === 1 ? {
            label: 'CHAMPION',
            text: ['圧倒的な走りで頂点に立った。', '最後まで諦めない走りが優勝をもたらした。', 'チーム一丸となった完璧なレース。'][championTextIdx],
            color: C.gold,
          }
          : isBigComeback ? {
            label: 'COMEBACK',
            text: '後半で驚異的な追い上げを見せた。チームの底力を証明した一戦。',
            color: C.cyan,
          }
          : mySegWinCount >= 2 ? {
            label: 'SEGMENT ACE',
            text: `${mySegWinPlayer?.name ?? 'チーム'}ら${mySegWinCount}区間で区間賞。個人成績は光る。`,
            color: C.green,
          }
          : playerResult.rank >= totalTeams - 1 ? {
            label: 'TOUGH DAY',
            text: '厳しい結果に終わったが、これが次への糧となる。反省と修正を重ねよう。',
            color: C.textDim,
          }
          : null

        return (
          <>
            <div style={{
              margin: '14px 12px',
              padding: '16px',
              borderRadius: 14,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              position: 'relative', overflow: 'hidden',
              boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />
              <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '8px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                YOUR RESULT
              </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              fontSize: '44px', fontWeight: '900', color: rankColors[playerResult.rank] ?? C.textDim,
              fontFamily: SAIRA, lineHeight: 1,
              textShadow: playerResult.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none',
            }}>
              {playerResult.rank}
            </div>
            <div style={{ fontSize: '10px', color: C.textSub, marginTop: '4px' }}>位</div>
            <div style={{ flex: 1, marginLeft: '8px' }}>
              <div style={{ fontSize: '11px', color: C.textDim, marginBottom: '2px' }}>
                獲得リーグポイント
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                +{playerResult.positionPoints + playerResult.segmentPoints}pt
              </div>
              <div style={{ fontSize: '10px', color: C.textDim, marginTop: '2px' }}>
                順位 {playerResult.positionPoints}pt ／ 区間賞 {playerResult.segmentPoints}pt
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: C.textDim }}>タイム</div>
              <div style={{ fontSize: '15px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>
                {formatTime(playerResult.totalTimeSec)}
              </div>
              {leader && playerResult.rank > 1 && (
                <div style={{ fontSize: '10px', color: C.textDim }}>
                  {formatDiff(playerResult.totalTimeSec - leader.totalTimeSec)}
                </div>
              )}
            </div>
          </div>
        </div>

            {moment && (
              <div style={{
                margin: '10px 12px 16px',
                padding: '12px 16px',
                borderRadius: 12,
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${alpha(moment.color, 0.45)}`,
                boxShadow: `0 4px 0 rgba(0,0,0,0.4), 0 0 20px ${alpha(moment.color, 0.12)}`,
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(moment.color, 0.15)}`, borderRadius: 8, pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{ fontSize: '9px', fontWeight: '800', color: moment.color, letterSpacing: '3px', marginBottom: '5px', textShadow: `0 0 10px ${alpha(moment.color, 0.5)}` }}>
                    {moment.label}
                  </div>
                  <div style={{ fontSize: '12px', color: C.textSub, lineHeight: 1.5 }}>
                    {moment.text}
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}

      <div style={{
        margin: '0 12px 16px', padding: '14px',
        borderRadius: 14,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}>
        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px' }}>スタジアム</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div>
            <div style={{ fontSize: '24px', fontWeight: '900', color: C.text, fontFamily: SAIRA, lineHeight: 1, textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
              {audienceK.toFixed(1)}<span style={{ fontSize: '11px', color: C.textSub }}> 万人</span>
            </div>
            <div style={{ fontSize: '9px', color: C.textDim, marginTop: '2px' }}>推定観客動員数</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>チーム人気度</span>
              <span style={{ fontSize: '10px', fontWeight: '700', color: teamPopularity >= 70 ? C.gold : C.textSub, fontFamily: SAIRA, textShadow: teamPopularity >= 70 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>{teamPopularity}</span>
            </div>
            <div style={{ height: '4px', borderRadius: '2px', backgroundColor: C.border2, overflow: 'hidden' }}>
              <div style={{ width: `${teamPopularity}%`, height: '100%', borderRadius: '2px', backgroundColor: teamPopularity >= 70 ? C.gold : teamPopularity >= 45 ? C.textSub : C.textDim }}/>
            </div>
            <div style={{ fontSize: '9px', color: C.textGhost, marginTop: '3px' }}>
              {playerResult?.rank === 1 ? '優勝で人気急上昇！' : playerResult?.rank && playerResult.rank <= 3 ? '表彰台で人気上昇' : '勝利を重ねて人気を上げよう'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '10px' }}>最終順位</div>
        <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border2}`, background: C.border }}>
          {results.teamRankings.map((tr, i) => {
            const t = teamMap.get(tr.teamId)
            const isPlayer = tr.teamId === playerTeamId
            const rowStyle = RANK_ROW_STYLE(tr.rank, isPlayer)
            return (
              <div key={tr.teamId} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px',
                borderBottom: i < results.teamRankings.length - 1 ? `1px solid ${C.surface2}` : 'none',
                ...rowStyle,
              }}>
                <div style={{ width: '22px', textAlign: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '800', fontFamily: SAIRA, color: rankColors[tr.rank] ?? C.textGhost, textShadow: tr.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>
                  {tr.rank}
                </div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={22} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: isPlayer ? C.text : C.textSub, fontWeight: isPlayer ? '700' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t?.name ?? tr.teamId}
                </div>
                <div style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA, minWidth: '52px', textAlign: 'right', flexShrink: 0 }}>
                  {formatTime(tr.totalTimeSec)}
                </div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: C.gold, fontFamily: SAIRA, minWidth: '32px', textAlign: 'right', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                  +{tr.positionPoints + tr.segmentPoints}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <button onClick={() => setView('segments')} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px', borderRadius: 14, cursor: 'pointer',
          background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
          border: `2px solid ${C.border2}`,
          boxShadow: '0 4px 0 rgba(0,0,0,0.4), 0 6px 16px rgba(0,0,0,0.3)',
          fontFamily: 'inherit',
        }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h10" stroke={C.bg} strokeWidth="2.4" strokeLinecap="round"/>
            </svg>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>区間タイム詳細</div>
            <div style={{ fontSize: 10, color: C.textDim }}>全{results.segmentResults.length}区間のタイム・順位を見る</div>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ color: C.textSub, flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {(() => {
        const myDeltas: { playerId: string; delta: number }[] = []
        for (const sr of results.segmentResults) {
          const total = sr.runners.length
          const myRunner = sr.runners.find(r => r.teamId === playerTeamId)
          if (!myRunner) continue
          const delta = myRunner.rank === 1 ? 1 : myRunner.rank > Math.floor(total * 0.67) ? -1 : 0
          const existing = myDeltas.find(x => x.playerId === myRunner.playerId)
          if (existing) existing.delta += delta
          else myDeltas.push({ playerId: myRunner.playerId, delta })
        }
        const changed = myDeltas.filter(d => d.delta !== 0)
        if (changed.length === 0) return null
        return (
          <div style={{ padding: '0 12px', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px' }}>フォーム変動</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {changed.map(({ playerId, delta }) => {
                const p = playerMap.get(playerId)
                if (!p) return null
                const col = delta > 0 ? C.green : C.red
                const arrow = delta > 0 ? '↑' : '↓'
                const curForm = p.form ?? 0
                return (
                  <div key={playerId} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 10px', borderRadius: '10px',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `1px solid ${alpha(col, 0.3)}`,
                  }}>
                    <span style={{ fontSize: '11px', color: C.textSub, fontFamily: SAIRA }}>{p.name}</span>
                    <span style={{ fontSize: '14px', fontWeight: '900', color: col, fontFamily: SAIRA, textShadow: `0 0 8px ${alpha(col, 0.5)}` }}>{arrow}</span>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: col, fontFamily: SAIRA }}>{curForm > 0 ? `+${curForm}` : `${curForm}`}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px' }}>
            {reserveStandings ? 'リザーブ順位（暫定）' : 'シーズン順位（暫定）'}
          </span>
          {!reserveStandings && playerSeasonRank > 0 && (
            <span style={{ fontSize: '10px', color: C.textDim }}>
              自チーム
              <span style={{ fontSize: '14px', fontWeight: '900', color: playerSeasonRank === 1 ? C.gold : playerSeasonRank <= 3 ? C.green : C.textSub, fontFamily: SAIRA, margin: '0 3px', textShadow: playerSeasonRank <= 3 ? `0 0 8px ${alpha(C.gold, 0.4)}` : 'none' }}>{playerSeasonRank}</span>
              位 / {fullSorted.length}
            </span>
          )}
        </div>
        <div style={{ borderRadius: '14px', overflow: 'hidden', border: `1px solid ${C.border2}`, background: C.surface2 }}>
          {seasonRows.map(({ s, rank, isBreak }, idx) => {
            const t = teamMap.get(s.teamId)
            const isPlayer = s.teamId === playerTeamId
            const rowStyle = RANK_ROW_STYLE(rank, isPlayer)
            const barPct = Math.max(3, Math.round((s.totalPoints / seasonMaxPts) * 100))
            const barCol = rank === 1 ? C.gold : rank <= 3 ? C.green : isPlayer ? C.cyan : C.border3
            const trGain = results.teamRankings.find(tr => tr.teamId === s.teamId)
            const raceGain = trGain ? trGain.positionPoints + trGain.segmentPoints : 0
            return (
              <div key={s.teamId}>
                {isBreak && (
                  <div style={{ padding: '3px 14px', background: C.surface2 }}>
                    <div style={{ borderTop: `1px dashed ${C.border2}` }} />
                  </div>
                )}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 14px',
                  borderBottom: idx < seasonRows.length - 1 && !(seasonRows[idx + 1]?.isBreak) ? `1px solid ${C.border}` : 'none',
                  ...rowStyle,
                }}>
                  <div style={{ width: '20px', textAlign: 'center', flexShrink: 0, fontSize: '13px', fontWeight: '800', fontFamily: SAIRA, color: rank <= 3 ? rankColors[rank] : C.textGhost, textShadow: rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>
                    {rank}
                  </div>
                  {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={22} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: isPlayer ? C.text : C.textSub, fontWeight: isPlayer ? '700' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>
                      {t?.shortName ?? s.teamId}
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: C.border2, overflow: 'hidden' }}>
                      <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 2, background: `linear-gradient(90deg, ${alpha(barCol, 0.5)}, ${barCol})`, boxShadow: isPlayer ? `0 0 6px ${alpha(barCol, 0.6)}` : 'none' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div>
                      <span style={{ fontSize: '14px', fontWeight: '800', fontFamily: SAIRA, color: isPlayer ? C.gold : C.textDim, textShadow: isPlayer ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>
                        {s.totalPoints}
                      </span>
                      <span style={{ fontSize: '9px', color: C.textGhost, marginLeft: 2 }}>pt</span>
                    </div>
                    {raceGain > 0 && (
                      <div style={{ fontSize: '9px', fontWeight: 700, color: C.green, fontFamily: SAIRA, textShadow: `0 0 6px ${alpha(C.green, 0.4)}` }}>+{raceGain}</div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '16px 12px 8px' }}>
        {hasExp ? (
          <button className="btn-game btn-game--blue" onClick={() => setView('exp')} style={{ width: '100%', marginBottom: 8 }}>
            <span className="btn-game__inner">経験値を確認 →</span>
          </button>
        ) : isLastRace ? (
          <button className="btn-game btn-game--gold" onClick={finish} style={{ width: '100%', marginBottom: 8 }}>
            <span className="btn-game__inner">
              {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
            </span>
          </button>
        ) : (
          <button className="btn-game btn-game--blue" onClick={finish} style={{ width: '100%', marginBottom: 8 }}>
            <span className="btn-game__inner">
              {onContinue ? '次の試合へ →' : 'ホームへ戻る'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
