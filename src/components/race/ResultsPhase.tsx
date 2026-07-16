import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Race, RaceResults, Team, Player, Season, Nationality } from '../../types'
import { formatTime, formatDiff } from '../../engine/raceEngine'
import { ovr, ratingColor } from '../../utils/playerUtils'
import { terrainColor, terrainLabel } from './raceUtils'
import { useGameStore } from '../../store/gameStore'
import { useAdHeight } from '../layout/Layout'
import { RARITY_COLORS, RARITY_LABELS, CARD_STAT_LABELS, CARD_NAMES, REST_CARD_NAME } from '../../utils/cardCombo'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG } from '../icons/Icons'
import StandingsTable from '../teams/StandingsTable'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

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
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4   // gameStoreのrequiredExpForLevelと常に一致させる
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
  reserveStandings, onContinue, hideCards, standingsLabel,
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
  hideCards?: boolean   // ECL等、カード報酬のないレースで前レースの獲得カードが出ないように
  standingsLabel?: string   // 順位表の見出し差し替え（ECL＝「ECL シリーズ順位」等）
}) {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const [view, setView] = useState<'main' | 'segments' | 'exp'>('main')
  const [segView, setSegView] = useState(0)  // 区間タイム詳細で表示中の区間index
  const segTopRef = useRef<HTMLDivElement>(null)

  // 区間タイム詳細を開いた瞬間・タブ切替時は先頭（1位）が見えるようスクロールを戻す。
  // スクロールコンテナはLayoutの<main>なのでwindowでは効かず、要素基準のscrollIntoViewで戻す。
  useEffect(() => {
    if (view === 'segments') segTopRef.current?.scrollIntoView({ block: 'start' })
  }, [view, segView])
  const raceDroppedCards = useGameStore(s => s.raceDroppedCards ?? [])
  const openPlayerSheet = useGameStore(s => s.openPlayerSheet)
  const raceExpGains = useGameStore(s => s.raceExpGains ?? {})
  // このレースで出た区間新記録（区間×選手）。「区間新！」バッジ表示用
  const newSegRecords = useGameStore(s => s.raceNewSegmentRecords) ?? []
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
    // replace遷移にして、通知から「戻る」を押したときにレース画面（次の記録会等）ではなくホームへ戻す
    if (urgentRenewalExists && !isLastRace && !reserveStandings && !onContinue) { navigate('/notifications', { replace: true }); return }
    // 最終戦直後の広告は廃止（「次シーズン開幕へ」で1回だけ流す。2連続で広告が出るのを防ぐ）
    onContinue ? onContinue() : navigate('/')
  }

  const standingsSource = reserveStandings ?? currentSeason.standings
  const fullSorted = [...standingsSource].sort((a, b) => b.totalPoints - a.totalPoints)
  const seasonMaxPts = fullSorted[0]?.totalPoints || 1
  const playerSeasonRank = fullSorted.findIndex(s => s.teamId === playerTeamId) + 1
  // 上位10行。トップ10外なら自チーム行を区切って末尾に追加
  const seasonRows: { s: typeof fullSorted[number]; rank: number; isBreak: boolean }[] =
    fullSorted.map((s, i) => ({ s, rank: i + 1, isBreak: false }))

  const segmentDetailCards = results.segmentResults.map((sr, i) => {
    const seg = race.segments.find(s => s.index === sr.segmentIndex)
    const segCol = seg ? terrainColor(seg.uphillPct, seg.downhillPct) : C.blue
    const leaderTime = sr.runners[0]?.timeSec ?? 0
    const myRunner = sr.runners.find(r => r.teamId === playerTeamId)
    const isMyWin = sr.runners[0]?.teamId === playerTeamId

    // 区間タブで1区間ずつ表示するので、その区間の全順位（1〜最下位）を出す
    const displayed = sr.runners

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
            const highFatigue = myRunnerPlayer && (myRunnerPlayer.fatigue ?? 0) >= 70

            return (
              <div key={runner.playerId}
                onClick={p ? () => openPlayerSheet(p.id) : undefined}
                style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px',
                borderBottom: ri < displayed.length - 1 ? `1px solid ${alpha(C.gold, 0.07)}` : 'none',
                background: isMe ? `linear-gradient(90deg, ${alpha(C.cyan, 0.08)}, transparent)` : undefined,
                borderLeft: isMe ? `3px solid ${C.cyan}` : '3px solid transparent',
                cursor: p ? 'pointer' : 'default',
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
  })

  // 区間タイム詳細：別ビュー（結果画面が長いので分離）
  if (view === 'segments') {
    return (
      <div ref={segTopRef} style={{ fontFamily: SAIRA, paddingBottom: '40px', background: C.bg, minHeight: '100dvh' }}>
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
        {/* 区間タブ（上部・横スクロール） */}
        <div style={{ display: 'flex', overflowX: 'auto', gap: 6, padding: '10px 12px 6px', WebkitOverflowScrolling: 'touch' }}>
          {results.segmentResults.map((sr, i) => {
            const sel = i === segView
            return (
              <button key={sr.segmentIndex} onClick={() => setSegView(i)} style={{
                flexShrink: 0, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', fontFamily: SAIRA,
                fontSize: 13, fontWeight: sel ? 900 : 700,
                background: sel ? `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.7)})` : C.surface2,
                color: sel ? C.bg : C.textDim,
                border: `1px solid ${sel ? C.gold : C.border2}`,
              }}>
                {sr.segmentIndex}区
              </button>
            )
          })}
        </div>
        {/* 選択区間の全順位（1〜最下位） */}
        <div style={{ padding: '6px 12px 14px' }}>
          {segmentDetailCards[segView]}
        </div>
      </div>
    )
  }

  // 経験値獲得：最終結果のあとに表示する専用画面
  if (view === 'exp') {
    return (
      <div style={{ fontFamily: SAIRA, paddingBottom: `calc(88px + env(safe-area-inset-bottom))`, background: C.bg, minHeight: '100dvh' }}>
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
                      <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(p)) }}>{ovr(p)}</span>
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
        <div style={{
          position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px', padding: '8px 12px 10px',
          background: `linear-gradient(to top, ${C.bg} 72%, ${alpha(C.bg, 0)})`, zIndex: 35,
        }}>
          {isLastRace ? (
            <button className="btn-game btn-game--gold" onClick={finish} style={{ width: '100%' }}>
              <span className="btn-game__inner">
                {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
              </span>
            </button>
          ) : (
            <button className="btn-game btn-game--blue" onClick={finish} style={{ width: '100%' }}>
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
    <div style={{ fontFamily: SAIRA, paddingBottom: `calc(88px + env(safe-area-inset-bottom))` }}>

      <div style={{
        padding: '12px 16px 11px', textAlign: 'center',
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.goldDark}`,
        borderRadius: 12,
        position: 'relative',
        overflow: 'hidden',
        margin: '12px 12px 0',
        boxShadow: `0 3px 0 #5a3500, 0 5px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>
        <div style={{ fontSize: '9px', color: C.gold, letterSpacing: '3px', marginBottom: '3px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
          RACE COMPLETE
        </div>
        <div style={{ fontSize: '17px', fontWeight: '900', color: C.text, marginBottom: '2px' }}>
          {race.name}
        </div>
        <div style={{ fontSize: '11px', color: C.textSub }}>
          優勝：{teamMap.get(leader?.teamId ?? '')?.name ?? '―'}
        </div>
      </div>

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
              margin: '12px 12px 0',
              padding: '11px 14px',
              borderRadius: 12,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.goldDark}`,
              position: 'relative', overflow: 'hidden',
              boxShadow: `0 3px 0 #5a3500, 0 5px 14px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ fontSize: '9px', color: C.gold, letterSpacing: '2px', marginBottom: '6px', textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                YOUR RESULT
              </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              fontSize: '30px', fontWeight: '900', color: rankColors[playerResult.rank] ?? C.textDim,
              fontFamily: SAIRA, lineHeight: 1,
              textShadow: playerResult.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none',
            }}>
              {playerResult.rank}
            </div>
            <div style={{ fontSize: '9px', color: C.textSub, marginTop: '3px' }}>位</div>
            <div style={{ flex: 1, marginLeft: '6px' }}>
              <div style={{ fontSize: '10px', color: C.textDim }}>獲得リーグポイント</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: C.gold, fontFamily: SAIRA, textShadow: `0 0 10px ${alpha(C.gold, 0.5)}` }}>
                +{playerResult.positionPoints + playerResult.segmentPoints}pt
              </div>
              <div style={{ fontSize: '9px', color: C.textDim }}>
                順位 {playerResult.positionPoints} ／ 区間賞 {playerResult.segmentPoints}
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

      <div style={{ padding: '0 12px', marginTop: '16px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px' }}>最終順位</div>
          <div style={{ display: 'flex', gap: '10px', fontSize: '9px', fontFamily: SAIRA }}>
            <span style={{ color: C.gold }}>● 順位</span>
            <span style={{ color: C.cyan }}>● 区間賞</span>
          </div>
        </div>
        <div style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border2}`, background: C.border }}>
          {results.teamRankings.map((tr, i) => {
            const t = teamMap.get(tr.teamId)
            const isPlayer = tr.teamId === playerTeamId
            const rowStyle = RANK_ROW_STYLE(tr.rank, isPlayer)
            return (
              <div key={tr.teamId} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '6px 12px',
                borderBottom: i < results.teamRankings.length - 1 ? `1px solid ${C.surface2}` : 'none',
                ...rowStyle,
              }}>
                <div style={{ width: '20px', textAlign: 'center', flexShrink: 0, fontSize: '12px', fontWeight: '800', fontFamily: SAIRA, color: rankColors[tr.rank] ?? C.textGhost, textShadow: tr.rank === 1 ? `0 0 10px ${alpha(C.gold, 0.5)}` : 'none' }}>
                  {tr.rank}
                </div>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={18} />}
                <div style={{ flex: 1, minWidth: 0, fontSize: '12px', color: isPlayer ? C.text : C.textSub, fontWeight: isPlayer ? '700' : '400', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t?.name ?? tr.teamId}
                </div>
                <div style={{ fontSize: '12px', color: C.textSub, fontFamily: SAIRA, minWidth: '50px', textAlign: 'right', flexShrink: 0 }}>
                  {formatTime(tr.totalTimeSec)}
                </div>
                <div style={{ flexShrink: 0, minWidth: 66, textAlign: 'right', fontFamily: SAIRA, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.gold }}>{tr.positionPoints}</span>
                  <span style={{ fontSize: 9, color: C.textGhost, margin: '0 1px' }}>/</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.cyan }}>{tr.segmentPoints}</span>
                  <span style={{ fontSize: 9, color: C.textGhost, margin: '0 2px' }}>=</span>
                  <span style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{tr.positionPoints + tr.segmentPoints}</span>
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
        const segWins = results.segmentResults
          .filter(sr => sr.runners[0]?.teamId === playerTeamId)
          .map(sr => {
            const w = sr.runners[0]
            const margin = sr.runners[1] ? sr.runners[1].timeSec - w.timeSec : 0
            return { ...w, segmentIndex: sr.segmentIndex, margin }
          })
        if (segWins.length === 0) return null
        return (
          <div style={{ margin: '14px 12px 0' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 10,
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
          </div>
        )
      })()}

      <div style={{ padding: '0 12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px' }}>
            {standingsLabel ?? (reserveStandings ? 'リザーブ順位（暫定）' : 'シーズン順位（暫定）')}
          </span>
          {!reserveStandings && playerSeasonRank > 0 && (
            <span style={{ fontSize: '10px', color: C.textDim }}>
              自チーム
              <span style={{ fontSize: '14px', fontWeight: '900', color: playerSeasonRank === 1 ? C.gold : playerSeasonRank <= 3 ? C.green : C.textSub, fontFamily: SAIRA, margin: '0 3px', textShadow: playerSeasonRank <= 3 ? `0 0 8px ${alpha(C.gold, 0.4)}` : 'none' }}>{playerSeasonRank}</span>
              位 / {fullSorted.length}
            </span>
          )}
        </div>
        {/* 順位表はJPEL順位表と同じ共通コンポーネント（見た目を全画面で統一） */}
        <div style={{ margin: '0 -12px' }}>
          <StandingsTable rows={seasonRows.map(({ s }) => {
            const t = teamMap.get(s.teamId)
            return {
              id: s.teamId, name: t?.name ?? s.teamId, shortName: t?.shortName ?? '?',
              primary: t?.colors.primary ?? C.blue, secondary: t?.colors.secondary ?? '#777', teamId: t?.id,
              points: s.totalPoints,
              recentForm: (s.raceResults ?? []).map(r => r.rank),
              isMe: s.teamId === playerTeamId,
            }
          })} />
        </div>
      </div>

      {!hideCards && raceDroppedCards.length > 0 && (
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
                    {card.kind === 'rest' ? REST_CARD_NAME : CARD_NAMES[card.statKey]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', padding: '8px 12px 10px',
        background: `linear-gradient(to top, ${C.bg} 72%, ${alpha(C.bg, 0)})`, zIndex: 35,
      }}>
        {hasExp ? (
          <button className="btn-game btn-game--blue" onClick={() => setView('exp')} style={{ width: '100%' }}>
            <span className="btn-game__inner">経験値を確認 →</span>
          </button>
        ) : isLastRace ? (
          <button className="btn-game btn-game--gold" onClick={finish} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              {onContinue ? 'シーズン終了 — 戻る' : 'シーズン終了 — ホームへ'}
            </span>
          </button>
        ) : (
          <button className="btn-game btn-game--blue" onClick={finish} style={{ width: '100%' }}>
            <span className="btn-game__inner">
              {onContinue ? '次の試合へ →' : 'ホームへ戻る'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
