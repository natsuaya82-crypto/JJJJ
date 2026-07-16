import { useEffect, useMemo, useRef, useState } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Race, RaceResults, Team } from '../../types'
import { LineupPhase } from '../race/LineupPhase'
import { ResultsPhase } from '../race/ResultsPhase'
import { ReserveSimPhase } from '../reserve/ReserveLeaguePage'
import { TeamLogoSVG, LeagueLogoSVG } from '../icons/Icons'
import PlayerFace from '../player/PlayerFace'
import StandingsTable, { type StandRow } from '../teams/StandingsTable'
import { formatRaceTime } from '../../utils/eventTime'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const FONT = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"
const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

type Phase = 'entry' | 'lineup' | 'simulating' | 'results' | 'view'

// ECL：前年の各リーグ上位2チーム（16）がシーズン中の5戦をポイント制で争う。
// レース体験は1軍リーグ戦と全く同じ（区間配置 → レース再生 → 結果画面）
export default function EclPage() {
  const { players, playerTeamId, currentSeason, advanceEclRace, openPlayerSheet, setActiveRacePhase } = useGameStore()

  // 長押しで選手詳細
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lp = (pid: string) => ({
    onPointerDown: () => { lpTimer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
  })
  const series = currentSeason.eclSeries
  const eclResult = currentSeason.eclResult

  const nextRace = series && series.raceIndex < series.races.length ? series.races[series.raceIndex] : null
  const playerQualified = !!series?.participants.some(e => e.isPlayerTeam)
  // 開催は年間予定表の順序どおり：次のリーグ戦より日付が前のときだけ開催できる（4月に7月の戦は絶対に走らせない）
  const nextLeagueRace = currentSeason.races[currentSeason.currentRaceIndex]
  const eclDue = !!nextRace && (!nextLeagueRace || nextRace.date <= nextLeagueRace.date)

  // 出場権があり開催期日なら、他の駅伝と同じく開いたらすぐ区間配置へ
  const [phase, setPhase] = useState<Phase>(() => (nextRace && playerQualified && eclDue ? 'lineup' : 'entry'))
  const [lineup, setLineupState] = useState<Record<number, string>>({})
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)

  // レース進行中（配置・再生・結果）は下タブを隠す（1軍・リザーブと同じ挙動。結果のボタンがタブに隠れないように）
  useEffect(() => {
    setActiveRacePhase(phase === 'lineup' || phase === 'simulating' || phase === 'results' ? phase : null)
    return () => setActiveRacePhase(null)
  }, [phase, setActiveRacePhase])
  const [raceStrategy, setRaceStrategy] = useState<'aggressive' | 'balanced' | 'conservative'>('balanced')
  const [lockedRace, setLockedRace] = useState<Race | null>(null)
  const [results, setResults] = useState<RaceResults | null>(null)
  const [viewTeamId, setViewTeamId] = useState<string | null>(null)   // 観戦結果でタップしたチーム

  // 海外クラブも含めた表示用チーム（1軍のResultsPhase/SimPhaseが参照するのは id/name/shortName/colors のみ）
  const pseudoTeams = useMemo(
    () => (series?.participants ?? []).map(pt => ({ id: pt.id, name: pt.name, shortName: pt.shortName, colors: pt.colors } as unknown as Team)),
    [series]
  )

  const myPlayers = useMemo(
    () => players.filter(p => p.teamId === playerTeamId && p.status !== 'retired'),
    [players, playerTeamId]
  )
  const unavailableMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of myPlayers) if (p.status === 'injured') m[p.id] = '負傷'
    return m
  }, [myPlayers])
  const assignedIds = new Set(Object.values(lineup).filter(Boolean))
  const allSegsFilled = (nextRace?.segments ?? []).every(s => !!lineup[s.index])

  function run(withLineup?: Record<number, string>) {
    if (!series || !eclDue) return   // 期日前は開催しない
    const idx = series.raceIndex
    advanceEclRace(withLineup)
    const ran = useGameStore.getState().currentSeason.eclSeries?.races[idx]
    if (ran?.results) {
      setLockedRace(ran)
      setResults(ran.results)
      // 出場したときだけレース再生（自チームが走らない観戦は順位表→ラインナップ閲覧）
      setPhase(playerQualified ? 'simulating' : 'view')
    } else {
      setPhase('entry')
    }
    setLineupState({})
  }

  // 出場権がない年は「観戦」：開催期日なら開いた瞬間にレースが始まる
  const autoRan = useRef(false)
  useEffect(() => {
    if (!autoRan.current && series && nextRace && eclDue && !playerQualified) {
      autoRan.current = true
      run()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // シリーズ順位（累計ポイント）
  const standings = useMemo(() => {
    if (!series) return []
    return series.participants
      .map(pt => ({ ...pt, points: series.points[pt.id] ?? 0 }))
      .sort((a, b) => b.points - a.points)
  }, [series])

  if (!series) {
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text }}>
        <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BackButton/>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900 }}>ECL</div>
        </div>
        <div style={{ padding: '50px 24px', textAlign: 'center', fontSize: 13, color: C.textDim, lineHeight: 1.8 }}>
          今シーズンのECLは開催されません。<br/>前年の各リーグ上位2チームに出場権が与えられます。
        </div>
      </div>
    )
  }

  // ── 区間配置（1軍と全く同じ LineupPhase）──
  if (phase === 'lineup' && nextRace) {
    return (
      <LineupPhase
        race={nextRace}
        raceNumber={series.raceIndex + 1}
        totalRaces={series.races.length}
        mainPlayers={myPlayers}
        raceLineup={lineup}
        assignedIds={assignedIds}
        allSegsFilled={allSegsFilled}
        pickerSeg={pickerSeg}
        setPickerSeg={setPickerSeg}
        setRaceLineup={(i, id) => setLineupState(prev => ({ ...prev, [i]: id }))}
        clearRaceLineup={() => setLineupState({})}
        onStart={() => run(lineup)}
        onSkipRace={() => run()}
        onBack={() => setPhase('entry')}
        weatherLabel={weatherLabel}
        raceStrategy={raceStrategy}
        setRaceStrategy={setRaceStrategy}
        teamTalk=""
        setTeamTalk={() => {}}
        unavailable={unavailableMap}
      />
    )
  }

  // ── レース再生（リザーブと同じ：SimPhase構成・選択肢なし）──
  if (phase === 'simulating' && results && lockedRace) {
    return (
      <ReserveSimPhase
        race={lockedRace}
        results={results}
        teams={pseudoTeams}
        players={players}
        playerTeamId={playerTeamId}
        onDone={() => setPhase('results')}
      />
    )
  }

  // ── 結果（出場時のみ。1軍と同じ ResultsPhase。順位表はECLシリーズの累計ポイント）──
  if (phase === 'results' && results && lockedRace) {
    return (
      <ResultsPhase
        race={lockedRace}
        results={results}
        teams={pseudoTeams}
        players={players}
        playerTeamId={playerTeamId}
        currentSeason={currentSeason}
        isLastRace={false}
        reserveStandings={standings.map(s => ({ teamId: s.id, totalPoints: s.points, raceResults: [] }))}
        hideCards
      />
    )
  }

  // ── 観戦結果：順位表 → チームをタップでラインナップ（区間配置とタイム）──
  if (phase === 'view' && results && lockedRace && series) {
    const teamById2 = new Map(series.participants.map(pt => [pt.id, pt]))
    if (viewTeamId != null) {
      const t = teamById2.get(viewTeamId)
      const myRanking = results.teamRankings.find(tr => tr.teamId === viewTeamId)
      const segs = [...lockedRace.segments].sort((a, b) => a.index - b.index)
      return (
        <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 90 }}>
          <div style={{ padding: '12px 16px 8px' }}>
            <BackButton onClick={() => setViewTeamId(null)}/>
          </div>
          <div style={{ padding: '0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '12px 14px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.border2}` }}>
              {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={34} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{lockedRace.name}（{lockedRace.location}）</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: myRanking?.rank === 1 ? C.gold : C.textSub, fontFamily: SAIRA }}>{myRanking?.rank ?? '—'}<span style={{ fontSize: 9, color: C.textGhost }}>位</span></div>
                <div style={{ fontSize: 10, color: C.textDim, fontFamily: SAIRA }}>{myRanking ? formatRaceTime(myRanking.totalTimeSec) : ''}</div>
              </div>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {segs.map((seg, i) => {
                const sr = results.segmentResults.find(s => s.segmentIndex === seg.index)
                const runner = sr?.runners.find(r => r.teamId === viewTeamId)
                const pl = runner ? players.find(p => p.id === runner.playerId) : undefined
                const isSegWin = runner?.rank === 1
                return (
                  <div key={seg.index} {...(pl ? lp(pl.id) : {})} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    background: isSegWin ? alpha(C.gold, 0.08) : i % 2 === 0 ? C.surface : 'transparent',
                    borderBottom: i < segs.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: pl ? 'pointer' : 'default',
                  }}>
                    <div style={{ width: 38, flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 900, color: C.textSub, fontFamily: SAIRA }}>{seg.index}区</div>
                      <div style={{ fontSize: 8, color: C.textGhost }}>{seg.distanceKm}km</div>
                    </div>
                    {pl && (
                      <div style={{ width: 26, height: 26, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                        <PlayerFace playerId={pl.id} nationality={pl.nationality} size={26} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name ?? '—'}</span>
                      {isSegWin && <span style={{ fontSize: 8, fontWeight: 800, color: C.gold, padding: '1px 5px', borderRadius: 4, background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.4)}`, flexShrink: 0 }}>区間賞</span>}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: isSegWin ? C.gold : C.textDim, flexShrink: 0, fontFamily: SAIRA }}>区間{runner?.rank ?? '—'}位</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isSegWin ? C.gold : C.textSub, flexShrink: 0, fontFamily: SAIRA }}>{runner ? formatRaceTime(runner.timeSec) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 90 }}>
        <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <BackButton onClick={() => { setPhase('entry'); setViewTeamId(null) }}/>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.red, letterSpacing: 3, fontWeight: 900 }}>ECL</div>
            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900 }}>{lockedRace.name}（{lockedRace.location}）</div>
          </div>
        </div>
        <div style={{ padding: '8px 12px 0' }}>
          <div style={{ borderRadius: '14px', overflow: 'hidden', border: `2px solid ${C.goldDark}`, boxShadow: '0 6px 0 #5a3500, 0 10px 28px rgba(0,0,0,0.6), inset 0 2px 0 rgba(255,255,255,0.08)', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.25)', borderRadius: 10, pointerEvents: 'none', zIndex: 1 }}/>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 40px 74px', gap: '4px', padding: '7px 12px', background: C.surface3, borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700' }}>#</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', letterSpacing: '1px' }}>チーム</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'center' }}>獲得pt</span>
              <span style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost, fontWeight: '700', textAlign: 'right' }}>タイム</span>
            </div>
            {[...results.teamRankings].sort((a, b) => a.rank - b.rank).map((tr, i, arr) => {
              const t = teamById2.get(tr.teamId)
              const isMe = tr.teamId === playerTeamId
              const diff = tr.totalTimeSec - arr[0].totalTimeSec
              const rankColor = i === 0 ? C.gold : i <= 2 ? C.textSub : C.textGhost
              return (
                <button key={tr.teamId} onClick={() => setViewTeamId(tr.teamId)} style={{
                  display: 'grid', gridTemplateColumns: '28px 1fr 40px 74px', gap: '4px', padding: '9px 12px', width: '100%', cursor: 'pointer', textAlign: 'left',
                  background: isMe ? alpha(t?.colors.primary ?? C.blue, 0.1) : i % 2 === 0 ? C.surface2 : C.surface,
                  border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  borderLeft: isMe ? `3px solid ${t?.colors.primary ?? C.blue}` : '3px solid transparent',
                  color: C.text, fontFamily: SAIRA, alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {tr.rank === 1 ? (
                      <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, textShadow: `0 0 6px ${alpha(C.gold, 0.5)}` }}>★</span>
                    ) : (
                      <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: rankColor }}>{tr.rank}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={24} />}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: isMe ? 800 : 500, color: isMe ? C.text : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t?.name ?? '—'}{isMe && <span style={{ marginLeft: '4px', fontSize: '8px', color: t?.colors.primary ?? C.blue }}>自</span>}
                      </div>
                      <div style={{ fontSize: '8px', color: C.textGhost }}>{t?.leagueName ?? ''}</div>
                    </div>
                  </div>
                  <span style={{ fontFamily: SAIRA, fontSize: '11px', fontWeight: 800, color: C.green, textAlign: 'center' }}>+{tr.positionPoints + tr.segmentPoints}</span>
                  <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: 800, color: tr.rank === 1 ? C.gold : C.textSub, textAlign: 'right' }}>
                    {tr.rank === 1 ? formatRaceTime(tr.totalTimeSec) : `+${formatRaceTime(diff)}`}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ── シリーズ概要（順位表・スケジュール）──
  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 90 }}>
      <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton/>
        <LeagueLogoSVG leagueId="ecl" size={36} />
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900 }}>EKIDEN CHAMPIONS LEAGUE</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900 }}>ECL {currentSeason.year}</div>
        </div>
      </div>

      {/* 年間王者（確定後） */}
      {eclResult && (
        <div style={{
          margin: '8px 14px 14px', padding: '16px', borderRadius: 16, textAlign: 'center',
          background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${C.surface2})`,
          border: `3px solid ${C.gold}`, boxShadow: '0 6px 0 #8b6914',
        }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 4, fontWeight: 900 }}>WORLD CHAMPION</div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 6px' }}>
            {standings[0] && <TeamLogoSVG primary={standings[0].colors.primary} secondary={standings[0].colors.secondary} shortName={standings[0].shortName} teamId={standings[0].id} size={54} />}
          </div>
          <div style={{ fontSize: 17, fontWeight: 900 }}>{eclResult.standings[0]?.name}</div>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 2 }}>{eclResult.standings[0]?.points ?? 0}pt で年間王者</div>
          {eclResult.playerRank != null && (
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, color: eclResult.playerRank === 1 ? C.gold : C.textSub }}>
              自チームは総合{eclResult.playerRank}位
            </div>
          )}
        </div>
      )}

      {/* 次戦（出場権なしの観戦・開催ボタン） */}
      {nextRace && (
        <div style={{ margin: '8px 14px 14px', padding: '14px 16px', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.goldDark}`, boxShadow: '0 4px 0 #5a3500' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: 2, fontWeight: 900, marginBottom: 4 }}>NEXT — {nextRace.date.replace(/-/g, '/')}</div>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{nextRace.name}<span style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, fontWeight: 700 }}>／{series.races.length}</span></div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {nextRace.location}・{nextRace.segments.length}区間 {Math.round(nextRace.segments.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10}km・{weatherLabel[nextRace.conditions.weather]}
          </div>
          <div style={{ marginTop: 10 }}>
            {!eclDue ? (
              <div style={{ textAlign: 'center', fontSize: 11, color: C.textDim, padding: '6px 0' }}>
                リーグ戦の進行に合わせて {nextRace.date.replace(/-/g, '/')} に開催
              </div>
            ) : playerQualified ? (
              <button onClick={() => setPhase('lineup')} className="btn-game btn-game--gold" style={{ width: '100%', padding: '13px', fontFamily: SAIRA, fontSize: 14, fontWeight: 800 }}>
                出走メンバーを組む
              </button>
            ) : (
              <button onClick={() => run()} className="btn-game btn-game--gold" style={{ width: '100%', padding: '13px', fontFamily: SAIRA, fontSize: 14, fontWeight: 800 }}>
                観戦する
              </button>
            )}
          </div>
        </div>
      )}

      {/* シリーズ順位表（JPEL順位表と同じ共通コンポーネント） */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8, padding: '0 14px' }}>シリーズ順位（{series.raceIndex}/{series.races.length}戦消化）</div>
        <StandingsTable rows={standings.map((s): StandRow => ({
          id: s.id, name: s.name, shortName: s.shortName,
          primary: s.colors.primary, secondary: s.colors.secondary, teamId: s.id,
          points: s.points,
          recentForm: series.races.filter(r => r.results).map(r => r.results!.teamRankings.find(tr => tr.teamId === s.id)?.rank ?? 99),
          isMe: s.isPlayerTeam,
        }))} />
      </div>

      {/* 開催スケジュール（消化済みの戦はタップで結果再生） */}
      <div style={{ margin: '0 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>開催スケジュール</div>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {series.races.map((r, i) => {
            const done = !!r.results
            const winner = done ? (r.results!.teamRankings.find(tr => tr.rank === 1) ?? r.results!.teamRankings[0]) : null
            const wt = winner ? series.participants.find(pt => pt.id === winner.teamId) : null
            return (
              <div key={r.id} onClick={done ? () => { setLockedRace(r); setResults(r.results!); setViewTeamId(null); setPhase('view') } : undefined} style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                background: i % 2 === 0 ? C.surface : 'transparent',
                borderBottom: i < series.races.length - 1 ? `1px solid ${C.border}` : 'none',
                cursor: done ? 'pointer' : 'default', opacity: done || i === series.raceIndex ? 1 : 0.6,
              }}>
                <div style={{ width: 58, flexShrink: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.textSub }}>第{i + 1}戦</div>
                  <div style={{ fontSize: 8, color: C.textGhost }}>{r.date.slice(5).replace('-', '/')}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.location}</div>
                  {done && wt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <TeamLogoSVG primary={wt.colors.primary} secondary={wt.colors.secondary} shortName={wt.shortName} teamId={wt.id} size={12} />
                      <span style={{ fontSize: 8, color: C.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>優勝 {wt.name}</span>
                    </div>
                  )}
                </div>
                <span style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 800, color: done ? C.gold : i === series.raceIndex ? C.gold : C.textGhost }}>
                  {done ? '結果 ›' : i === series.raceIndex ? 'NEXT' : '未開催'}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
