import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Race, RaceResults, Team, Player } from '../../types'
import { LineupPhase } from '../race/LineupPhase'
import { SkipRaceButton } from '../race/SkipRaceButton'
import { ResultsPhase } from '../race/ResultsPhase'
import { RaceSimPanel } from '../shared/RaceSimPanel'
import StandingsTable, { type StandRow } from '../teams/StandingsTable'
import Flag from '../ui/Flag'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { WA_EVENT_LABEL } from '../../engine/worldAthletics'
import { formatRaceTime } from '../../utils/eventTime'
import { runWithLoading } from '../../store/loadingStore'
import { C, alpha, rankColor, SAIRA, FONT, bottomStack } from '../../styles/tokens'
import { useAdHeight } from '../layout/Layout'


type Phase = 'individuals' | 'entry' | 'lineup' | 'simulating' | 'results'

// 世界選手権トーナメント（予選・本番共通）。ECLと同じ構成：エントリー→区間配置→レース再生→結果。
// 本番は最初に個人種目（5000/10000/マラソン）の代表発表を挟み、
// 競技順は 駅伝1→5000m結果→駅伝2→10000m結果→駅伝3→マラソン結果→総合 のインターリーブ。
export default function WorldTournamentPage() {
  const navigate = useNavigate()
  const adH = useAdHeight()
  const { players, playerTeamId, currentSeason, setActiveRacePhase } = useGameStore()
  const t = useGameStore(s => s.worldTournament)
  const advanceWorldRace = useGameStore(s => s.advanceWorldRace)
  const markWorldIndividualsSeen = useGameStore(s => s.markWorldIndividualsSeen)
  const markWorldIndividualRevealed = useGameStore(s => s.markWorldIndividualRevealed)
  const longPress = usePlayerLongPress()

  const nextRace = t && t.raceIndex < t.races.length ? t.races[t.raceIndex] : null
  const needIndividuals = !!t && t.kind === 'main' && !t.individualsSeen

  const [phase, setPhase] = useState<Phase>(() => needIndividuals ? 'individuals' : 'entry')
  const [indStep, setIndStep] = useState(0)
  const [revealOpen, setRevealOpen] = useState(false)  // 種目結果を開いているか（エントリー→結果を見る→次戦）
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
        flagCode: pt.nat,
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

  const title = t.kind === 'main' ? `世界選手権 ${t.year}` : `世界選手権アジア予選 ${t.year}`

  // ── 個人種目の出場選手発表（本番のみ・1種目1ページでめくる）──
  // 駅伝代表が決まった時点での「代表発表」。結果はまだ出さない（駅伝の合間に1種目ずつ発表）
  if (phase === 'individuals' && t.individuals) {
    const inds = t.individuals
    const ir = inds[Math.min(indStep, inds.length - 1)]
    const last = indStep >= inds.length - 1
    // 結果順のまま出すとネタバレになるので、日本→国コード→名前順に並べ替えて表示
    // 名前は改名後の今の名前で並べる（画面に出ている名前と並び順をそろえる）
    const shownName = (pl: { playerId: string; playerName: string }) =>
      players.find(x => x.id === pl.playerId)?.name || pl.playerName
    const entrants = [...ir.placings].sort((a, b) => {
      if ((a.nat === 'JPN') !== (b.nat === 'JPN')) return a.nat === 'JPN' ? -1 : 1
      return a.nat.localeCompare(b.nat) || shownName(a).localeCompare(shownName(b), 'ja')
    })
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: bottomStack(adH, { aboveNav: true, extra: 88 }) }}>
        <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <BackButton onClick={() => navigate('/')} />
          <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900 }}>{title} 代表発表</span>
        </div>
        <div style={{ padding: '2px 16px 8px', fontSize: 11, color: C.textDim }}>個人種目 {indStep + 1}/{inds.length} ・ 長押しで選手詳細</div>
        <div style={{ margin: '4px 12px 0', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.purpleDark}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.purple }}>{WA_EVENT_LABEL[ir.event]} 出場選手</span>
            <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, color: C.textDim, marginLeft: 'auto' }}>{ir.placings.length}名</span>
          </div>
          <div style={{ padding: '8px 12px 12px' }}>
            {entrants.map(pl => {
              const p = players.find(x => x.id === pl.playerId)
              return (
                <div key={pl.playerId} {...(p ? longPress(p.id) : {})} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 6px', borderBottom: `1px solid ${C.border}`, cursor: p ? 'pointer' : 'default' }}>
                  <PlayerFace playerId={pl.playerId} nationality={pl.nat} size={28} />
                  <Flag code={pl.nat} width={20} />
                  <span style={{ flex: 1, fontSize: 12, color: pl.nat === 'JPN' ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name || pl.playerName}</span>
                </div>
              )
            })}
          </div>
        </div>
        {/* 次へは下部固定（タブバー＋広告の上）。スクロール不要 */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: bottomStack(adH, { aboveNav: true }), maxWidth: 480, margin: '0 auto', padding: '14px 14px 10px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, zIndex: 50 }}>
          <button
            onClick={() => {
              if (last) { markWorldIndividualsSeen(); setPhase('entry') } else setIndStep(indStep + 1)
              window.scrollTo(0, 0)
            }}
            className="btn-game btn-game--purple"
            style={{ width: '100%' }}
          ><span className="btn-game__inner">{last ? '駅伝へ →' : `次へ（${WA_EVENT_LABEL[inds[indStep + 1].event]}）→`}</span></button>
        </div>
      </div>
    )
  }

  // ── 個人種目の結果発表（駅伝第N戦後にN種目目・1種目1ページ）──
  // 競技順: 駅伝1→5000m→駅伝2→10000m→駅伝3→マラソン→総合
  const revealIdx = t.individualsRevealed ?? 0
  const pendingReveal = t.kind === 'main' && !!t.individuals && revealIdx < Math.min(t.raceIndex, t.individuals.length)
  // 結果を「見る」ボタンを押したときだけ種目結果を開く（エントリー順位表→結果→次戦の流れ）
  if (phase === 'entry' && pendingReveal && revealOpen) {
    const ir = t.individuals![revealIdx]
    const isFinal = t.raceIndex >= t.races.length && revealIdx >= (t.individuals!.length - 1)
    const nextLabel = isFinal ? '総合成績へ →' : `駅伝 第${t.raceIndex + 1}戦へ →`
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: bottomStack(adH, { aboveNav: true, extra: 88 }) }}>
        <div style={{ padding: '8px 8px 0', display: 'flex', alignItems: 'center', gap: 2 }}>
          <BackButton onClick={() => navigate('/')} />
          <span style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900 }}>{WA_EVENT_LABEL[ir.event]} 決勝</span>
        </div>
        <div style={{ padding: '2px 16px 8px', fontSize: 11, color: C.textDim }}>{title} ・ 長押しで選手詳細</div>
        <div style={{ margin: '4px 12px 0', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.purpleDark}`, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.purple }}>{WA_EVENT_LABEL[ir.event]} 結果</div>
          <div style={{ padding: '8px 12px 12px' }}>
            {ir.placings.map(pl => {
              const p = players.find(x => x.id === pl.playerId)
              return (
                <div key={pl.playerId} {...(p ? longPress(p.id) : {})} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 6px', borderBottom: `1px solid ${C.border}`, cursor: p ? 'pointer' : 'default', background: pl.nat === 'JPN' ? alpha(C.gold, 0.05) : 'transparent' }}>
                  <span style={{ fontFamily: SAIRA, fontSize: pl.rank <= 3 ? 16 : 13, fontWeight: 900, color: rankColor(pl.rank), width: 24, textAlign: 'center', flexShrink: 0 }}>{pl.rank}</span>
                  <PlayerFace playerId={pl.playerId} nationality={pl.nat} size={28} />
                  <Flag code={pl.nat} width={20} />
                  <span style={{ flex: 1, fontSize: 12, color: pl.nat === 'JPN' ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p?.name || pl.playerName}</span>
                  <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: C.gold, flexShrink: 0 }}>{formatRaceTime(pl.timeSec)}</span>
                </div>
              )
            })}
          </div>
        </div>
        {/* 次へは下部固定・次に何が来るか明記（駅伝第N戦へ / 総合成績へ） */}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: bottomStack(adH, { aboveNav: true }), maxWidth: 480, margin: '0 auto', padding: '14px 14px 10px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, zIndex: 50 }}>
          <button
            onClick={() => {
              markWorldIndividualRevealed()
              setRevealOpen(false)
              if (isFinal) navigate('/national/result')
              else window.scrollTo(0, 0)
            }}
            className="btn-game btn-game--purple"
            style={{ width: '100%' }}
          ><span className="btn-game__inner">{nextLabel}</span></button>
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
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.purple, letterSpacing: 3, fontWeight: 900, margin: '4px 14px 8px' }}>順位（{t.raceIndex}/{t.races.length}戦消化・合計ポイント）・国を長押しで代表詳細</div>
        <StandingsTable rows={standRows} onRowLongPress={id => { if (id.startsWith('nat_')) navigate(`/teams/national/${id.slice(4)}`) }} />
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: bottomStack(adH, { aboveNav: true }), maxWidth: 480, margin: '0 auto', padding: '14px 14px 10px', background: `linear-gradient(180deg, transparent, ${C.bg} 40%)`, zIndex: 50 }}>
          {pendingReveal ? (
            // 種目結果が未発表なら、まず結果を見せる（何の結果かを明記）
            <button onClick={() => { setRevealOpen(true); window.scrollTo(0, 0) }} className="btn-game btn-game--purple" style={{ width: '100%' }}><span className="btn-game__inner">{WA_EVENT_LABEL[t.individuals![revealIdx].event]}の結果を見る →</span></button>
          ) : done ? (
            <button onClick={() => navigate('/national/result')} className="btn-game btn-game--purple" style={{ width: '100%' }}><span className="btn-game__inner">最終結果へ →</span></button>
          ) : t.japanIn ? (
            <button onClick={() => setPhase('lineup')} className="btn-game btn-game--purple" style={{ width: '100%' }}><span className="btn-game__inner">第{t.raceIndex + 1}戦 区間配置へ →</span></button>
          ) : (
            // 日本が出ていない年。再生を見せられ続けないよう、区間配置と同じスキップを並べる
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <SkipRaceButton onClick={() => runWithLoading('結果を計算中…', () => run(undefined, true), 500)} label="結果だけ見る" />
              <button onClick={() => runWithLoading('レース準備中…', () => run(), 500)} className="btn-game btn-game--purple" style={{ flex: 1 }}><span className="btn-game__inner">第{t.raceIndex + 1}戦を観戦する</span></button>
            </div>
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
        competition="world"
      />
    )
  }

  // ── レース再生（ECLと同じ）──
  if (phase === 'simulating' && results && lockedRace) {
    return (
      <RaceSimPanel
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
        competition="world"
        isLastRace={false}
        altStandings={standRows.map(s => ({
          teamId: s.id, totalPoints: s.points ?? 0,
          raceResults: t.races.filter(r => r.results).map(r => ({ raceId: r.id, rank: r.results!.teamRankings.find(tr => tr.teamId === s.id)?.rank ?? 99, points: 0 })),
        }))}
        onContinue={() => { setResults(null); setLockedRace(null); setPhase('entry') }}
        hideCards
        standingsLabel={`${t.kind === 'main' ? '世界選手権' : '予選'} 順位（暫定・合計ポイント）`}
      />
    )
  }

  return null
}
