import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Race, RaceResults, Team, Player } from '../../types'
import { LineupPhase } from '../race/LineupPhase'
import { ResultsPhase } from '../race/ResultsPhase'
import { ReserveSimPhase } from '../reserve/ReserveLeaguePage'
import StandingsTable, { type StandRow } from '../teams/StandingsTable'
import Flag from '../ui/Flag'
import { WA_EVENT_LABEL } from '../../engine/worldAthletics'
import { runWithLoading } from '../../store/loadingStore'
import { C, alpha } from '../../styles/tokens'
import { useAdHeight } from '../layout/Layout'

const FONT = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"
const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Phase = 'individuals' | 'entry' | 'lineup' | 'simulating' | 'results'

// 世界陸上トーナメント（予選・本番共通）。ECLと同じ構成：エントリー→区間配置→レース再生→結果。
// 本番は最初に個人種目（5000/10000/マラソン）の出場選手発表を挟む（結果は最終結果ページで）。
export default function WorldTournamentPage() {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const { players, playerTeamId, currentSeason, setActiveRacePhase } = useGameStore()
  const t = useGameStore(s => s.worldTournament)
  const advanceWorldRace = useGameStore(s => s.advanceWorldRace)
  const markWorldIndividualsSeen = useGameStore(s => s.markWorldIndividualsSeen)

  const nextRace = t && t.raceIndex < t.races.length ? t.races[t.raceIndex] : null
  const needIndividuals = !!t && t.kind === 'main' && !t.individualsSeen

  const [phase, setPhase] = useState<Phase>(() => needIndividuals ? 'individuals' : 'entry')
  const [indStep, setIndStep] = useState(0)
  const [lineup, setLineupState] = useState<Record<number, string>>({})
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [raceStrategy, setRaceStrategy] = useState<'aggressive' | 'balanced' | 'conservative'>('balanced')
  const [lockedRace, setLockedRace] = useState<Race | null>(null)
  const [results, setResults] = useState<RaceResults | null>(null)

  useEffect(() => {
    setActiveRacePhase(phase === 'lineup' || phase === 'simulating' || phase === 'results' ? phase : null)
    return () => setActiveRacePhase(null)
  }, [phase, setActiveRacePhase])

  const pseudoTeams = useMemo(
    () => (t?.participants ?? []).map(pt => ({ id: pt.id, name: pt.name, shortName: pt.shortName, colors: pt.colors } as unknown as Team)),
    [t]
  )
  // 日本代表20人（配置用）
  const squadPlayers = useMemo(() => {
    const ids = t?.squads['nat_JPN'] ?? []
    return ids.map(id => players.find(p => p.id === id)).filter((p): p is Player => !!p && p.status !== 'retired')
  }, [t, players])
  const unavailableMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of squadPlayers) if (p.status === 'injured') m[p.id] = '負傷'
    return m
  }, [squadPlayers])
  const assignedIds = new Set(Object.values(lineup).filter(Boolean))
  const allSegsFilled = (nextRace?.segments ?? []).every(s => !!lineup[s.index])

  const standRows: StandRow[] = useMemo(() => {
    if (!t) return []
    return t.participants
      .map(pt => ({ pt, points: t.points[pt.id] ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .map(({ pt, points }) => ({
        id: pt.id, name: pt.name, shortName: pt.shortName,
        primary: pt.colors.primary, secondary: pt.colors.secondary, teamId: pt.id,
        points,
        recentForm: t.races.filter(r => r.results).map(r => r.results!.teamRankings.find(tr => tr.teamId === pt.id)?.rank ?? 99),
        isMe: pt.isPlayerTeam,
      }))
  }, [t])

  function run(withLineup?: Record<number, string>, skipPlayback = false) {
    if (!t || !nextRace) return
    advanceWorldRace(withLineup)
    const after = useGameStore.getState().worldTournament
    const ranIdx = after ? after.raceIndex - 1 : t.raceIndex
    const ran = after?.races[ranIdx]
    if (ran?.results) {
      setLockedRace(ran)
      setResults(ran.results)
      setPhase(skipPlayback ? 'results' : 'simulating')
    } else {
      setPhase('entry')
    }
    setLineupState({})
  }

  if (!t) {
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, padding: 16 }}>
        <BackButton />
        <div style={{ textAlign: 'center', color: C.textDim, padding: 40 }}>大会は開催されていません</div>
      </div>
    )
  }

  const title = t.kind === 'main' ? `世界陸上 ${t.year}` : `アジア＋オセアニア予選 ${t.year}`

  // ── 個人種目の出場選手発表（本番のみ・1種目ずつめくる）──
  // 駅伝代表が決まった時点での「代表発表」。結果はまだ出さない（最終結果ページで発表）
  if (phase === 'individuals' && t.individuals) {
    const inds = t.individuals
    const shown = inds.slice(0, indStep + 1)
    const last = indStep >= inds.length - 1
    // 結果順のまま出すとネタバレになるので、日本→国コード→名前順に並べ替えて表示
    const entrantsOf = (ir: typeof inds[number]) => [...ir.placings].sort((a, b) => {
      if ((a.nat === 'JPN') !== (b.nat === 'JPN')) return a.nat === 'JPN' ? -1 : 1
      return a.nat.localeCompare(b.nat) || a.playerName.localeCompare(b.playerName, 'ja')
    })
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 120 }}>
        <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <BackButton onClick={() => navigate('/')} />
          <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900 }}>{title} 個人種目 代表発表</span>
        </div>
        {shown.map(ir => (
          <div key={ir.event} style={{ margin: '12px 12px 0', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.purpleDark}`, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.purple }}>{WA_EVENT_LABEL[ir.event]} 出場選手</span>
              <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, color: C.textDim, marginLeft: 'auto' }}>{ir.placings.length}名</span>
            </div>
            <div style={{ padding: '8px 12px 12px' }}>
              {entrantsOf(ir).map(pl => (
                <div key={pl.playerId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 6px', borderBottom: `1px solid ${C.border}` }}>
                  <Flag code={pl.nat} width={22} />
                  <span style={{ flex: 1, fontSize: 12, color: pl.nat === 'JPN' ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.playerName}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ padding: '14px 12px' }}>
          <button
            onClick={() => { if (last) { markWorldIndividualsSeen(); setPhase('entry') } else setIndStep(indStep + 1) }}
            className="btn-press"
            style={{ width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA, background: `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`, border: `2px solid ${C.purpleDark}`, color: '#fff', fontSize: 15, fontWeight: 900 }}
          >{last ? '駅伝へ →' : `次は ${WA_EVENT_LABEL[inds[indStep + 1].event]} →`}</button>
        </div>
      </div>
    )
  }

  // ── エントリー：順位表＋次戦へ ──
  if (phase === 'entry') {
    const done = t.finished || !nextRace
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 200 }}>
        <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <BackButton onClick={() => navigate('/')} />
          <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900 }}>{title}</span>
        </div>
        <div style={{ padding: '4px 16px 8px', fontSize: 11, color: C.textDim }}>
          {done
            ? '全3戦終了'
            : `駅伝 第${t.raceIndex + 1}戦／全${t.races.length}戦（${nextRace!.segments.length}区間）${t.japanIn ? '' : ' ・ 日本は予選敗退のため観戦'}`}
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 900, margin: '4px 14px 8px' }}>順位（{t.raceIndex}/{t.races.length}戦消化・合計ポイント）</div>
        <StandingsTable rows={standRows} />
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: `calc(${adH + 58}px + env(safe-area-inset-bottom))`, maxWidth: 480, margin: '0 auto', padding: '14px 14px 10px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, zIndex: 50 }}>
          {done ? (
            <button onClick={() => navigate('/national/result')} className="btn-press" style={{ width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA, background: `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`, border: `2px solid ${C.purpleDark}`, color: '#fff', fontSize: 15, fontWeight: 900 }}>最終結果へ →</button>
          ) : t.japanIn ? (
            <button onClick={() => setPhase('lineup')} className="btn-press" style={{ width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA, background: `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`, border: `2px solid ${C.purpleDark}`, color: '#fff', fontSize: 15, fontWeight: 900 }}>第{t.raceIndex + 1}戦 区間配置へ →</button>
          ) : (
            <button onClick={() => runWithLoading('レース準備中…', () => run(), 500)} className="btn-press" style={{ width: '100%', padding: '14px 0', borderRadius: 12, cursor: 'pointer', fontFamily: SAIRA, background: `linear-gradient(180deg, ${C.purple}, ${C.purpleDark})`, border: `2px solid ${C.purpleDark}`, color: '#fff', fontSize: 15, fontWeight: 900 }}>第{t.raceIndex + 1}戦を観戦する</button>
          )}
        </div>
      </div>
    )
  }

  // ── 区間配置（1軍・ECLと同じ LineupPhase）──
  if (phase === 'lineup' && nextRace) {
    return (
      <LineupPhase
        race={nextRace}
        raceNumber={t.raceIndex + 1}
        totalRaces={t.races.length}
        mainPlayers={squadPlayers}
        raceLineup={lineup}
        assignedIds={assignedIds}
        allSegsFilled={allSegsFilled}
        pickerSeg={pickerSeg}
        setPickerSeg={setPickerSeg}
        setRaceLineup={(i, id) => setLineupState(prev => ({ ...prev, [i]: id }))}
        clearRaceLineup={() => setLineupState({})}
        onStart={() => runWithLoading('レース準備中…', () => run(lineup), 500)}
        onSkipRace={() => runWithLoading('結果を計算中…', () => run(lineup, true), 500)}
        onBack={() => setPhase('entry')}
        weatherLabel={{ sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }}
        raceStrategy={raceStrategy}
        setRaceStrategy={setRaceStrategy}
        teamTalk=""
        setTeamTalk={() => {}}
        unavailable={unavailableMap}
        btnClass="btn-game--gold"
      />
    )
  }

  // ── レース再生（ECLと同じ）──
  if (phase === 'simulating' && results && lockedRace) {
    return (
      <ReserveSimPhase
        race={lockedRace}
        results={results}
        teams={pseudoTeams}
        players={players}
        playerTeamId={t.japanIn ? 'nat_JPN' : playerTeamId}
        onDone={() => setPhase('results')}
      />
    )
  }

  // ── 結果（ECLと同じ ResultsPhase・順位表は3戦合計ポイント）──
  if (phase === 'results' && results && lockedRace) {
    return (
      <ResultsPhase
        race={lockedRace}
        results={results}
        teams={pseudoTeams}
        players={players}
        playerTeamId={t.japanIn ? 'nat_JPN' : playerTeamId}
        currentSeason={currentSeason}
        isLastRace={false}
        reserveStandings={standRows.map(s => ({
          teamId: s.id, totalPoints: s.points ?? 0,
          raceResults: t.races.filter(r => r.results).map(r => ({ raceId: r.id, rank: r.results!.teamRankings.find(tr => tr.teamId === s.id)?.rank ?? 99, points: 0 })),
        }))}
        onContinue={() => { setResults(null); setLockedRace(null); setPhase('entry') }}
        hideCards
        standingsLabel={`${t.kind === 'main' ? '世界陸上' : '予選'} 順位（暫定・合計ポイント）`}
        btnClass="btn-game--gold"
      />
    )
  }

  return null
}
