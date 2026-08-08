import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, individualEventAbility, applyRaceBoosts } from '../../store/gameStore'
import { useClubIndex } from '../../lib/useClubIndex'
import { ovr, ratingColor, racesConsumed } from '../../utils/playerUtils'
import { runWithLoading } from '../../store/loadingStore'
import type { RaceResults, IndividualEvent, Player } from '../../types'
import BackButton from '../ui/BackButton'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import TrainingCardSVG from '../training/TrainingCardSVG'
import { TeamLogoSVG } from '../icons/Icons'
import { LineupPhase } from './LineupPhase'
import { SimPhase } from './SimPhase'
import { ResultsPhase } from './ResultsPhase'
import { useAdHeight } from '../layout/Layout'
import { buildCpuLineups } from '../../engine/raceEngine'
import { audio } from '../../utils/audio'
import { getDueIndividualEvent, formatRaceTime } from '../../utils/eventTime'
import { C, alpha, SAIRA, TT_COLOR } from '../../styles/tokens'
import {
  calcCpuTimesForSeg, calcSegOvr, calcNaturalDrain, calcFinalSegTime,
  generateSegmentEvents, resolveChoice, finalizeSegment,
} from '../../engine/interactiveRace'
import type { ISim, InteractiveSegResult } from '../../engine/interactiveRace'
import { buildTeamRankings, countSegmentsByTeam } from '../../engine/raceEngine'

type Phase = 'lineup' | 'simulating' | 'results'

const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

const TT_DIST_LABEL: Record<number, string> = { 5000: '5000m', 10000: '10000m', 21097: 'ハーフ', 42195: 'マラソン' }

// 記録会画面: 未実施なら開催ボタン、実施済みなら結果を表示して次へ進む
function IndividualEventScreen({ event, players, playerTeamId, onRun, onDone }: {
  event: IndividualEvent
  players: Player[]
  playerTeamId: string
  onRun: (skipPlayerIds: string[]) => void
  onDone: () => void
}) {
  const longPress = usePlayerLongPress()
  const adH = useAdHeight()
  // 世界新/日本新バッジ用（記録は結果確定時に更新済みなので「今年・この選手・このタイム」が現行記録なら今大会の樹立）
  const worldRecords = useGameStore(s => s.worldRecords)
  const japanRecords = useGameStore(s => s.japanRecords)
  const seasonYear = useGameStore(s => s.currentSeason.year)
  // 記録会には来季のドラフト候補（scoutProspects＝players外）も出るので、そちらからも名前/出身を解決する
  const scoutProspects = useGameStore(s => s.currentSeason.scoutProspects) ?? []
  const findP = (id: string) => players.find(p => p.id === id) ?? scoutProspects.find(p => p.id === id)
  // 国内チーム or 海外クラブから所属を解決（記録会に海外選手が出るため）
  const clubIndex = useClubIndex()
  const resolveTeam = (id: string) => clubIndex.byId(id)
  const [resting, setResting] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<'pb' | 'fatigue' | 'ovr' | 'age'>('pb')
  const toggleResting = (id: string) => setResting(prev => {
    const n = new Set(prev)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const done = !!event.results
  const bestKey = event.distance === 5000 ? 'd5000' as const
    : event.distance === 10000 ? 'd10000' as const
    : event.distance === 21097 ? 'half' as const : 'marathon' as const
  const playerName = (id: string) => findP(id)?.name ?? ''
  const topTen = (event.results ?? []).slice(0, 10)
  const myResults = (event.results ?? []).filter(r => r.teamId === playerTeamId)

  return (
    <div style={{ fontFamily: "'Noto Sans JP', system-ui, sans-serif", paddingBottom: 100, background: C.bg, minHeight: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.border}`, background: C.bg, position: 'sticky', top: 0, zIndex: 5 }}>
        <BackButton />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '1px', color: TT_COLOR, padding: '1px 7px', borderRadius: 6, backgroundColor: alpha(TT_COLOR, 0.14), border: `1px solid ${alpha(TT_COLOR, 0.3)}`, fontFamily: SAIRA }}>記録会</span>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginTop: 3 }}>{event.name}</div>
          <div style={{ fontSize: 10, color: C.textDim }}>{event.date.replace(/-/g, '/')} · {TT_DIST_LABEL[event.distance]}{event.weather ? ` · ${({ sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '風' } as const)[event.weather]}` : ''}</div>
        </div>
      </div>

      {!done ? (
        <>
          <div style={{ padding: '12px 14px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: TT_COLOR, letterSpacing: '0.1em', flexShrink: 0 }}>自チームの出場選手</span>
            <select value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)}
              style={{ padding: '5px 8px', borderRadius: 7, border: `1px solid ${C.border2}`, background: C.surface2, color: C.text, fontSize: 11, fontFamily: 'inherit', cursor: 'pointer' }}>
              <option value="pb">自己ベスト順</option>
              <option value="fatigue">疲労少ない順</option>
              <option value="ovr">OVR順</option>
              <option value="age">年齢順</option>
            </select>
          </div>
          <div style={{ padding: '4px 14px 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(() => {
              const runners = players
                .filter(p => p.teamId === playerTeamId && p.status === 'active')
                .map(p => ({ p, ability: Math.round(individualEventAbility(p, event.distance)) }))
                .sort((a, b) => {
                  switch (sortKey) {
                    case 'pb': {
                      const pa = a.p.eventBests?.[bestKey]?.timeSec ?? Infinity
                      const pbb = b.p.eventBests?.[bestKey]?.timeSec ?? Infinity
                      // PB未記録同士は種目適性順で並べる
                      return pa === pbb ? b.ability - a.ability : pa - pbb
                    }
                    case 'fatigue': return (a.p.fatigue ?? 0) - (b.p.fatigue ?? 0)
                    case 'ovr': return ovr(b.p) - ovr(a.p)
                    case 'age': return a.p.age - b.p.age
                    default: return b.ability - a.ability
                  }
                })
              return runners.map(({ p }) => {
                const pb = p.eventBests?.[bestKey]
                const fat = p.fatigue ?? 0
                const isResting = resting.has(p.id)
                return (
                  <div key={p.id} {...longPress(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px 7px 12px', borderRadius: 9, cursor: 'pointer', width: '100%', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1px solid ${C.border}`, opacity: isResting ? 0.45 : 1 }}>
                    <div style={{ borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                      <PlayerFace playerId={p.id} nationality={p.nationality} size={32} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 700, color: pb ? C.textSub : C.textGhost, flexShrink: 0 }}>PB {pb ? formatRaceTime(pb.timeSec) : '--'}</span>
                      </div>
                      <span style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 700, color: fat < 40 ? C.green : fat < 70 ? C.gold : C.red }}>疲{fat}</span>
                    </div>
                    {/* 表示は正規OVR（種目適性値は紛らわしいのでソート専用に） */}
                    <span style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: ratingColor(ovr(p)), flexShrink: 0 }}>{ovr(p)}</span>
                    <button onClick={(e) => { e.stopPropagation(); toggleResting(p.id) }}
                      style={{ flexShrink: 0, padding: '5px 9px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: 10, fontWeight: 800, background: isResting ? 'transparent' : alpha(TT_COLOR, 0.14), border: `1.5px solid ${isResting ? C.border2 : alpha(TT_COLOR, 0.5)}`, color: isResting ? C.textDim : TT_COLOR }}>
                      {isResting ? '休む' : '出走'}
                    </button>
                  </div>
                )
              })
            })()}
          </div>
          <div style={{ position: 'sticky', bottom: 0, left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: '480px', padding: '8px 14px calc(12px + env(safe-area-inset-bottom))', background: `linear-gradient(to top, ${C.bg} 70%, ${alpha(C.bg, 0)})`, borderTop: `1px solid ${C.border}`, zIndex: 35 }}>
            <button className="btn-game btn-game--gold" onClick={() => onRun([...resting])} style={{ width: '100%' }}>
              <span className="btn-game__inner">記録会スタート！</span>
            </button>
          </div>
        </>
      ) : (
        <>
        <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.gold, letterSpacing: '0.1em', marginBottom: 6 }}>総合上位10名</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {topTen.map((r, i) => (
                <button key={r.playerId} {...longPress(r.playerId)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit',
                    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                    border: `1px solid ${r.rank === 1 ? alpha(C.gold, 0.5) : r.teamId === playerTeamId ? alpha(TT_COLOR, 0.5) : C.border}`,
                    // 下位から順に表示して1位が最後に出る
                    animation: 'race-result-in 0.35s ease both',
                    animationDelay: `${(topTen.length - 1 - i) * 0.15}s`,
                  }}>
                  <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: r.rank === 1 ? C.gold : r.rank <= 3 ? C.text : C.textSub, width: 22, flexShrink: 0 }}>{r.rank}</span>
                  <div style={{ borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                    <PlayerFace playerId={r.playerId} nationality={findP(r.playerId)?.nationality ?? 'JPN'} size={30} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName(r.playerId)}</span>
                      {(() => {
                        const wr = worldRecords?.[bestKey]
                        const jr = japanRecords?.[bestKey]
                        // 保持者本人は「新！」、同タイムの共同保持者は「タイ！」
                        if (wr && wr.playerId === r.playerId && wr.timeSec === r.timeSec && wr.year === seasonYear)
                          return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.gold, 0.15), color: C.gold, border: `1px solid ${alpha(C.gold, 0.5)}`, flexShrink: 0 }}>世界新！</span>
                        if (wr && wr.timeSec === r.timeSec && (wr.coHolders ?? []).some(c => c.playerId === r.playerId && c.year === seasonYear))
                          return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.gold, 0.15), color: C.gold, border: `1px solid ${alpha(C.gold, 0.5)}`, flexShrink: 0 }}>世界タイ！</span>
                        if (jr && jr.playerId === r.playerId && jr.timeSec === r.timeSec && jr.year === seasonYear)
                          return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.red, 0.15), color: C.red, border: `1px solid ${alpha(C.red, 0.5)}`, flexShrink: 0 }}>日本新！</span>
                        if (jr && jr.timeSec === r.timeSec && (jr.coHolders ?? []).some(c => c.playerId === r.playerId && c.year === seasonYear))
                          return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.red, 0.15), color: C.red, border: `1px solid ${alpha(C.red, 0.5)}`, flexShrink: 0 }}>日本タイ！</span>
                        return null
                      })()}
                    </div>
                    {(() => {
                      const t = resolveTeam(r.teamId)
                      if (t) return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                          <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={12} />
                          <span style={{ fontSize: 9, color: r.teamId === playerTeamId ? TT_COLOR : C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        </div>
                      )
                      // ドラフト候補は所属チームが無いので出身（高校/大学）を表示
                      const origin = scoutProspects.find(p => p.id === r.playerId)?.origin
                      if (origin) return (
                        <div style={{ fontSize: 9, color: C.textDim, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{origin}</div>
                      )
                      return null
                    })()}
                  </div>
                  <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: r.rank === 1 ? C.gold : C.text }}>{formatRaceTime(r.timeSec)}</span>
                </button>
              ))}
            </div>
          </div>

          {(event.rewardCards ?? []).length > 0 && (
            <div style={{ borderRadius: 12, padding: '10px 14px', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `1.5px solid ${alpha(C.gold, 0.4)}`, animation: 'race-result-in 0.4s ease both', animationDelay: `${topTen.length * 0.15 + 0.2}s` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.gold, letterSpacing: '0.1em', marginBottom: 8 }}>獲得した練習カード · {(event.rewardCards ?? []).length}枚</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(event.rewardCards ?? []).map(c => (
                  <TrainingCardSVG key={c.id} statKey={c.statKey} rarity={c.rarity} width={62} />
                ))}
              </div>
            </div>
          )}

          <div style={{ animation: 'race-result-in 0.4s ease both', animationDelay: `${topTen.length * 0.15 + 0.35}s` }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: TT_COLOR, letterSpacing: '0.1em', marginBottom: 6 }}>自チームの結果</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {myResults.map(r => {
                const p = players.find(pl => pl.id === r.playerId)
                const isPB = p?.eventBests?.[bestKey]?.timeSec === r.timeSec
                return (
                  <button key={r.playerId} {...longPress(r.playerId)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: 'inherit',
                      background: isPB ? alpha(C.green, 0.06) : C.surface2,
                      border: `1px solid ${isPB ? alpha(C.green, 0.45) : C.border}`,
                      boxShadow: isPB ? `0 0 8px ${alpha(C.green, 0.15)}` : 'none',
                    }}>
                    <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: r.rank <= 3 ? C.gold : C.textDim, minWidth: 30, flexShrink: 0, whiteSpace: 'nowrap' }}>{r.rank}位</span>
                    <div style={{ borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                      <PlayerFace playerId={r.playerId} nationality={p?.nationality ?? 'JPN'} size={26} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{playerName(r.playerId)}</div>
                    {(() => {
                      const wr = worldRecords?.[bestKey]
                      const jr = japanRecords?.[bestKey]
                      if (wr && wr.playerId === r.playerId && wr.timeSec === r.timeSec && wr.year === seasonYear)
                        return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.gold, 0.15), color: C.gold, border: `1px solid ${alpha(C.gold, 0.5)}`, flexShrink: 0 }}>世界新！</span>
                      if (wr && wr.timeSec === r.timeSec && (wr.coHolders ?? []).some(c => c.playerId === r.playerId && c.year === seasonYear))
                        return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.gold, 0.15), color: C.gold, border: `1px solid ${alpha(C.gold, 0.5)}`, flexShrink: 0 }}>世界タイ！</span>
                      if (jr && jr.playerId === r.playerId && jr.timeSec === r.timeSec && jr.year === seasonYear)
                        return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.red, 0.15), color: C.red, border: `1px solid ${alpha(C.red, 0.5)}`, flexShrink: 0 }}>日本新！</span>
                      if (jr && jr.timeSec === r.timeSec && (jr.coHolders ?? []).some(c => c.playerId === r.playerId && c.year === seasonYear))
                        return <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 4px', borderRadius: 4, background: alpha(C.red, 0.15), color: C.red, border: `1px solid ${alpha(C.red, 0.5)}`, flexShrink: 0 }}>日本タイ！</span>
                      return isPB ? <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 4, background: alpha(C.green, 0.15), color: C.green, border: `1px solid ${alpha(C.green, 0.4)}`, fontFamily: SAIRA, flexShrink: 0 }}>PB</span> : null
                    })()}
                    <span style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 800, color: C.textSub, flexShrink: 0 }}>{formatRaceTime(r.timeSec)}</span>
                  </button>
                )
              })}
            </div>
          </div>

        </div>
        <div style={{ position: 'fixed', bottom: `calc(${adH}px + env(safe-area-inset-bottom))`, left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: '480px', padding: '8px 14px 10px', background: `linear-gradient(to top, ${C.bg} 68%, ${alpha(C.bg, 0)})`, zIndex: 35 }}>
          <button className="btn-game btn-game--gold" onClick={onDone} style={{ width: '100%' }}>
            <span className="btn-game__inner">ホームに戻る</span>
          </button>
        </div>
        </>
      )}
    </div>
  )
}

// 最終順位は raceEngine の buildTeamRankings が唯一の決まり。
// ここで自前に並べ替えると、中継で見た順位と結果画面の順位がズレる。
function buildTeamRankingsForInteractive(
  cumTime: Record<string, number>,
  completedSegs: InteractiveSegResult[],
  segPts: Record<string, number>,
  totalSegs: number,
): RaceResults['teamRankings'] {
  return buildTeamRankings({
    teamIds: Object.keys(cumTime),
    cumTime,
    segCountByTeam: countSegmentsByTeam(completedSegs),
    segPts,
    totalSegs,
  })
}

export default function RacePage() {
  const navigate = useNavigate()
  const {
    currentSeason, teams, players, playerTeamId,
    raceLineup, setRaceLineup, clearRaceLineup, runRace,
    raceStrategy, setRaceStrategy,
    raceTeamTalk, setRaceTeamTalk,
    setActiveRacePhase, setActiveRaceLocked,
    simulateIndividualEvent,
  } = useGameStore()

  // タイム計算に使う選手配列。戦術分析室（ペース配分・メンタル+Lv）と国籍ケミストリー（士気+）を反映する。
  // リーグ戦のタイムはこの画面で計算して store に渡すため、ここで補正を掛けないと施設の効果が消える。
  // 表示用（ロスター一覧・記録会）には素の players を使い、能力値の見た目は変えない。
  const racePlayers = useMemo(
    () => applyRaceBoosts(players, teams, playerTeamId, raceLineup),
    [players, teams, playerTeamId, raceLineup],
  )

  const [phase, setPhaseLocal] = useState<Phase>('lineup')
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [results, setResults] = useState<RaceResults | null>(null)
  const [lockedRace, setLockedRace] = useState<import('../../types').Race | null>(null)
  const [lockedRaceIndex, setLockedRaceIndex] = useState<number>(0)
  const [iSim, setISim] = useState<ISim | null>(null)
  const [ttViewId, setTtViewId] = useState<string | null>(null)
  // レース最終確定（runRace）の二重発火ガード。ゴーストクリック等で同じレースを2回確定すると
  // 次レースに結果が書き込まれセーブが壊れるため、レースIDで1回に制限する
  const finalizedRaceIdRef = useRef<string | null>(null)

  const setPhase = (p: Phase) => {
    setPhaseLocal(p)
    setActiveRacePhase(p)
    audio.playBgm(p === 'simulating' ? 'race' : 'home')
  }

  // 描画前(useLayoutEffect)に lineup 化して下ナビを隠す＝タブが一瞬見えてから消える「遅れて全画面化」を防ぐ。
  useLayoutEffect(() => {
    setActiveRacePhase('lineup')
    return () => { setActiveRacePhase(null) }
  }, [])
  useEffect(() => { audio.playBgm('home') }, [])

  const raceIndex = currentSeason.currentRaceIndex
  const currentRace = currentSeason.races[raceIndex]

  const race = (phase !== 'lineup' && lockedRace) ? lockedRace : currentRace
  const activeRaceIndex = (phase !== 'lineup' && lockedRace) ? lockedRaceIndex : raceIndex

  const segCount = race?.segments?.length ?? 6
  // ロスターは1つだけ。所属している選手（レンタルで借りている選手も含む）は全員出走できる
  const mainPlayers = players.filter(p => p.teamId === playerTeamId && p.status !== 'retired')
  // 【進行不可の安全弁2】それでも健常者が区間数未満なら、負傷者の出走も許可する
  // （全区間を埋められないと「開始」も「スキップ」も出せず完全に詰むため）
  const allowInjured = mainPlayers.filter(p => p.status !== 'injured').length < segCount
  // 出走不可の選手（リストには表示するが選択不可）: playerId → 理由ラベル
  const unavailableMap: Record<string, string> = {}
  for (const p of mainPlayers) {
    if (p.status === 'injured' && !allowInjured) {
      const left = p.injuredUntilRace != null ? p.injuredUntilRace - racesConsumed(currentSeason) : 0
      unavailableMap[p.id] = left > 0 ? `故障中・復帰まで約${left}戦` : '故障中'
    }
    // 移籍/トレード加入直後の出走制限は撤廃（加入したレースからいつでも出走可）
  }
  const assignedIds = new Set(Object.values(raceLineup))
  const allSegsFilled = (race?.segments ?? []).every(s => !!raceLineup[s.index])

  // 既に配置済みの選手が出走不可になった場合（配置後に故障など）はラインナップから外す
  useEffect(() => {
    if (phase !== 'lineup') return
    for (const [segIdx, pid] of Object.entries(raceLineup)) {
      if (pid && unavailableMap[pid]) setRaceLineup(+segIdx, '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, raceLineup])

  // イベントが無い区間（イベントオフ設定・抽選でイベント0件）は選択待ちが発生しないため、自動で区間を確定する。
  // 従来はイベント選択の完了時にしか確定されず、流し見モードでスキップを押すまで止まってしまっていた。
  // 結果の「表示」はSimPhase側がアニメ完了まで待つので、先に確定しても走りは最後まで見える
  // ※このフックは early return より前に置く。後ろだとレース未設定時にフック数が変わって
  //   「Rendered fewer hooks than expected」で白画面になる（finalizeCurrentSegは関数宣言なので巻き上げで呼べる）。
  useEffect(() => {
    if (!iSim || !race || phase !== 'simulating') return
    if (iSim.showingSegResult || iSim.pendingEvents.length > 0) return
    finalizeCurrentSeg(iSim)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iSim, phase])

  if (!currentRace && phase === 'lineup') {
    return (
      <div style={{
        padding: '48px 24px', textAlign: 'center',
        fontFamily: "'Noto Sans JP', system-ui, sans-serif",
        color: '#5C5870', fontSize: '14px',
      }}>
        {raceIndex >= currentSeason.races.length
          ? 'シーズン終了。すべてのレースが完了しました。'
          : 'レーススケジュールが未設定です。'}
      </div>
    )
  }
  if (!race) return null

  function buildSegmentState(
    sim: ISim,
    segIdx: number,
    activeRace: import('../../types').Race,
  ): ISim {
    const seg = activeRace.segments.find(s => s.index === segIdx)
    if (!seg) return sim

    const playerPlayerId = raceLineup[segIdx]
    const playerObj = racePlayers.find(p => p.id === playerPlayerId)
    const playerTeam = teams.find(t => t.id === playerTeamId)
    const seasonProgress = raceIndex / currentSeason.races.length
    const totalSegs = activeRace.segments.length

    const cpuTimesForSeg = calcCpuTimesForSeg(
      seg, teams, sim.cpuLineups, racePlayers, playerTeamId,
      activeRace, seasonProgress, totalSegs,
    )

    const segOvr = playerObj ? calcSegOvr(playerObj, seg) : 50
    const naturalDrain = calcNaturalDrain(segOvr, seg.distanceKm)
    const segStamina = Math.max(1, segOvr - naturalDrain)

    // プレイヤーの区間タイムも CPU と同じ計算方式（消耗込み calcFinalSegTime）で見積もる。
    // イベント予測順位・ライブ表示・確定フォールバックの基準を CPU と揃える。
    const playerBaseTime = playerObj
      ? calcFinalSegTime(segStamina, segOvr, 0, playerObj, seg, playerTeam, activeRace, seasonProgress, raceStrategy, totalSegs)
      : 9999

    // Build cumulative times for event context (keyed by teamId, player as '__player__')
    const cumulativeTimes: Record<string, number> = { '__player__': sim.cumulativeTime[playerTeamId] ?? 0 }
    for (const [tid, t] of Object.entries(sim.cumulativeTime)) {
      if (tid !== playerTeamId) cumulativeTimes[tid] = t
    }

    // 設定でレース中の選択イベントをオフ（流し見モード）にしていたらイベントを出さない
    const events = (playerObj && (useGameStore.getState().raceEventsEnabled ?? true))
      ? generateSegmentEvents({
          seg,
          playerBaseTime,
          cpuTimesForSeg,
          cumulativeTimes,
          isFirstSeg: segIdx === activeRace.segments[0]?.index,
          player: playerObj,
          totalSegs,
          players: racePlayers,
          cpuLineups: sim.cpuLineups,
          teams,
        })
      : []

    return {
      ...sim,
      currentSegIdx: segIdx,
      cpuTimesForSeg,
      playerBaseTime,
      initialSegStamina: segOvr,
      segStamina,
      playerTimeMod: 0,
      pendingEvents: events,
      showingSegResult: false,
      lastSegResult: null,
    }
  }

  function startInteractiveSim(_tactics: Record<number, string>) {
    if (!allSegsFilled || !currentRace) return
    if (!currentRace.segments?.length) return

    setLockedRace(currentRace)
    setLockedRaceIndex(raceIndex)
    setActiveRaceLocked(currentRace, raceIndex)

    // 出走するのは自分と同じ部のチームだけ。判定は engine/raceEngine.ts の1本
    const cpuLineups = buildCpuLineups(teams, players, currentRace, playerTeamId)

    const initialSim: ISim = {
      cpuLineups,
      currentSegIdx: 0,
      cpuTimesForSeg: {},
      playerBaseTime: 0,
      initialSegStamina: 0,
      segStamina: 0,
      playerTimeMod: 0,
      pendingEvents: [],
      completedSegs: [],
      cumulativeTime: {},
      segPts: {},
      showingSegResult: false,
      lastSegResult: null,
    }

    const firstSegIdx = currentRace.segments[0].index
    const readySim = buildSegmentState(initialSim, firstSegIdx, currentRace)
    setISim(readySim)
    setPhase('simulating')
  }

  function handleChoice(choiceIdx: number) {
    if (!iSim || !race) return
    const event = iSim.pendingEvents[0]
    if (!event) return

    const playerPlayerId = raceLineup[iSim.currentSegIdx]
    const playerObj = racePlayers.find(p => p.id === playerPlayerId)
    if (!playerObj) return

    const { staminaDelta: _sd, timeDelta, newStamina } = resolveChoice(event, choiceIdx, iSim.segStamina, iSim.playerBaseTime)
    void _sd

    const remainingEvents = iSim.pendingEvents.slice(1)
    const newPlayerTimeMod = iSim.playerTimeMod + timeDelta

    if (remainingEvents.length === 0) {
      finalizeCurrentSeg({ ...iSim, pendingEvents: [], playerTimeMod: newPlayerTimeMod, segStamina: newStamina })
    } else {
      setISim(prev => prev ? {
        ...prev,
        pendingEvents: remainingEvents,
        playerTimeMod: newPlayerTimeMod,
        segStamina: newStamina,
      } : null)
    }
  }

  // 現区間を即確定（残りイベント・アニメをスキップして区間結果へ）
  function handleSkipSegment() {
    if (!iSim || !race) return
    if (iSim.showingSegResult) return
    finalizeCurrentSeg({ ...iSim, pendingEvents: [] })
  }

  function finalizeCurrentSeg(sim: ISim) {
    if (!race) return
    // 冪等化：同一区間を二重確定しない（選択とスキップの競合でのポイント二重加算を防止）
    if (sim.showingSegResult || sim.completedSegs.some(s => s.segmentIndex === sim.currentSegIdx)) return

    const playerPlayerId = raceLineup[sim.currentSegIdx]
    const playerObj2 = racePlayers.find(p => p.id === playerPlayerId)
    const playerTeam2 = teams.find(t => t.id === playerTeamId)
    const seg2 = race.segments.find(s => s.index === sim.currentSegIdx)
    const seasonProgress2 = raceIndex / currentSeason.races.length
    const totalSegs2 = race.segments.length
    const playerFinalTime = playerObj2 && seg2
      ? calcFinalSegTime(sim.segStamina, sim.initialSegStamina, sim.playerTimeMod, playerObj2, seg2, playerTeam2, race, seasonProgress2, raceStrategy, totalSegs2)
      : Math.max(30, sim.playerBaseTime)

    const segResult = finalizeSegment({
      segmentIndex: sim.currentSegIdx,
      playerTeamId,
      playerPlayerId: playerPlayerId ?? '',
      playerFinalTime,
      cpuTimesForSeg: sim.cpuTimesForSeg,
      cpuLineups: sim.cpuLineups,
    })

    // Update cumulative times
    const newCumTime = { ...sim.cumulativeTime }
    newCumTime[playerTeamId] = (newCumTime[playerTeamId] ?? 0) + playerFinalTime
    for (const [tid, t] of Object.entries(sim.cpuTimesForSeg)) {
      newCumTime[tid] = (newCumTime[tid] ?? 0) + t
    }

    // Update segment points (top 3)
    const newSegPts = { ...sim.segPts }
    segResult.runners.slice(0, 3).forEach((r, i) => {
      newSegPts[r.teamId] = (newSegPts[r.teamId] ?? 0) + [3, 2, 1][i]
    })

    const newCompletedSegs = [...sim.completedSegs, segResult]

    setISim({
      ...sim,
      completedSegs: newCompletedSegs,
      cumulativeTime: newCumTime,
      segPts: newSegPts,
      showingSegResult: true,
      lastSegResult: segResult,
      pendingEvents: [],
    })
  }

  function handleAdvance() {
    if (!iSim || !race) return

    // 完了区間数で判定（index の付き方に依存しない堅牢な完了検出）
    const doneIdx = new Set(iSim.completedSegs.map(s => s.segmentIndex))
    const nextSeg = race.segments.find(s => !doneIdx.has(s.index))
    const allDone = iSim.completedSegs.length >= race.segments.length || !nextSeg

    if (allDone) {
      if (finalizedRaceIdRef.current === race.id) return  // 二重発火ガード
      // Race complete — build RaceResults and hand off to store
      const segmentResults = iSim.completedSegs.map(s => ({
        segmentIndex: s.segmentIndex,
        runners: s.runners,
      }))

      const teamRankings = buildTeamRankingsForInteractive(iSim.cumulativeTime, iSim.completedSegs, iSim.segPts, race.segments.length)

      const preComputedResults: RaceResults = { teamRankings, segmentResults }
      // runRace を先に実行してシーズン順位を更新してから結果画面へ（失敗しても結果は見られるように）
      let finalResults: RaceResults = preComputedResults
      try {
        const r = runRace(raceLineup, {}, preComputedResults)
        if (r) finalResults = r
        // 成功後にガードを立てる（runRaceは同期なので二重クリックは防げる。失敗時は再試行を塞がない）
        finalizedRaceIdRef.current = race.id
      } catch (e) {
        console.error('runRace failed:', e)
      }
      setResults(finalResults)
      setPhase('results')
      return
    }

    // Advance to next segment
    const nextSim = buildSegmentState(iSim, nextSeg.index, race)
    setISim(nextSim)
  }

  function handleSkip() {
    if (!iSim || !race) return

    // Simulate remaining segments instantly (without events)
    const sim = { ...iSim }

    // If currently mid-segment, finalize it first
    const playerPlayerId = raceLineup[sim.currentSegIdx]
    const playerFinalTime = Math.max(30, sim.playerBaseTime)
    const currentSegResult = finalizeSegment({
      segmentIndex: sim.currentSegIdx,
      playerTeamId,
      playerPlayerId: playerPlayerId ?? '',
      playerFinalTime,
      cpuTimesForSeg: sim.cpuTimesForSeg,
      cpuLineups: sim.cpuLineups,
    })

    let completedSegs = sim.showingSegResult && sim.lastSegResult
      ? sim.completedSegs
      : [...sim.completedSegs, currentSegResult]

    const cumTime = { ...sim.cumulativeTime }
    if (!sim.showingSegResult) {
      cumTime[playerTeamId] = (cumTime[playerTeamId] ?? 0) + playerFinalTime
      for (const [tid, t] of Object.entries(sim.cpuTimesForSeg)) {
        cumTime[tid] = (cumTime[tid] ?? 0) + t
      }
    }

    const segPts = { ...sim.segPts }
    if (!sim.showingSegResult) {
      currentSegResult.runners.slice(0, 3).forEach((r, i) => {
        segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][i]
      })
    }

    // Simulate all remaining segments
    const segs = race.segments
    const doneSeg = new Set(completedSegs.map(s => s.segmentIndex))
    const seasonProgress = raceIndex / currentSeason.races.length
    const totalSegs = segs.length

    for (const seg of segs) {
      if (doneSeg.has(seg.index)) continue
      const pid = raceLineup[seg.index]
      const playerObj = racePlayers.find(p => p.id === pid)
      const playerTeam = teams.find(t => t.id === playerTeamId)

      const cpuTimes = calcCpuTimesForSeg(seg, teams, sim.cpuLineups, racePlayers, playerTeamId, race, seasonProgress, totalSegs)
      // スキップ区間もCPUと同じ消耗込み計算で見積もる
      const skSegOvr = playerObj ? calcSegOvr(playerObj, seg) : 50
      const skSegStamina = Math.max(1, skSegOvr - calcNaturalDrain(skSegOvr, seg.distanceKm))
      const pBase = playerObj
        ? calcFinalSegTime(skSegStamina, skSegOvr, 0, playerObj, seg, playerTeam, race, seasonProgress, raceStrategy, totalSegs)
        : 9999

      const skippedResult = finalizeSegment({
        segmentIndex: seg.index,
        playerTeamId,
        playerPlayerId: pid ?? '',
        playerFinalTime: pBase,
        cpuTimesForSeg: cpuTimes,
        cpuLineups: sim.cpuLineups,
      })

      completedSegs = [...completedSegs, skippedResult]
      cumTime[playerTeamId] = (cumTime[playerTeamId] ?? 0) + pBase
      for (const [tid, t] of Object.entries(cpuTimes)) {
        cumTime[tid] = (cumTime[tid] ?? 0) + t
      }
      skippedResult.runners.slice(0, 3).forEach((r, i) => {
        segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][i]
      })
    }

    const teamRankings = buildTeamRankingsForInteractive(cumTime, completedSegs, segPts, race.segments.length)
    const preComputedResults: RaceResults = { teamRankings, segmentResults: completedSegs }
    if (finalizedRaceIdRef.current === race.id) return  // 二重発火ガード
    const finalResults = runRace(raceLineup, {}, preComputedResults)
    finalizedRaceIdRef.current = race.id  // 成功後に立てる（同期実行なので二重クリックは防げる）
    setResults(finalResults)
    setPhase('results')
  }

  // 選手選択画面から「まるごとスキップ」：全区間をイベントなし（素の実力）で計算して結果へ
  function handleFullSkip() {
    if (!allSegsFilled || !currentRace) return
    if (finalizedRaceIdRef.current === currentRace.id) return  // 二重発火ガード
    setLockedRace(currentRace)
    setLockedRaceIndex(raceIndex)
    setActiveRaceLocked(currentRace, raceIndex)
    const race = currentRace
    const cpuLineups = buildCpuLineups(teams, players, race, playerTeamId)
    const seasonProgress = raceIndex / currentSeason.races.length
    const totalSegs = race.segments.length
    let completedSegs: ReturnType<typeof finalizeSegment>[] = []
    const cumTime: Record<string, number> = {}
    const segPts: Record<string, number> = {}
    for (const seg of race.segments) {
      const pid = raceLineup[seg.index]
      const playerObj = racePlayers.find(p => p.id === pid)
      const playerTeam = teams.find(t => t.id === playerTeamId)
      const cpuTimes = calcCpuTimesForSeg(seg, teams, cpuLineups, racePlayers, playerTeamId, race, seasonProgress, totalSegs)
      const skSegOvr = playerObj ? calcSegOvr(playerObj, seg) : 50
      const skSegStamina = Math.max(1, skSegOvr - calcNaturalDrain(skSegOvr, seg.distanceKm))
      const pBase = playerObj
        ? calcFinalSegTime(skSegStamina, skSegOvr, 0, playerObj, seg, playerTeam, race, seasonProgress, raceStrategy, totalSegs)
        : 9999
      const res = finalizeSegment({ segmentIndex: seg.index, playerTeamId, playerPlayerId: pid ?? '', playerFinalTime: pBase, cpuTimesForSeg: cpuTimes, cpuLineups })
      completedSegs = [...completedSegs, res]
      cumTime[playerTeamId] = (cumTime[playerTeamId] ?? 0) + pBase
      for (const [tid, t] of Object.entries(cpuTimes)) cumTime[tid] = (cumTime[tid] ?? 0) + t
      res.runners.slice(0, 3).forEach((r, i) => { segPts[r.teamId] = (segPts[r.teamId] ?? 0) + [3, 2, 1][i] })
    }
    const teamRankings = buildTeamRankingsForInteractive(cumTime, completedSegs, segPts, race.segments.length)
    const preComputedResults: RaceResults = { teamRankings, segmentResults: completedSegs }
    const finalResults = runRace(raceLineup, {}, preComputedResults)
    finalizedRaceIdRef.current = race.id  // 成功後に立てる（同期実行なので二重クリックは防げる）
    setResults(finalResults ?? preComputedResults)
    setPhase('results')
  }

  // Derive lowStaminaHint from internal state (not passed directly)
  const lowStaminaHint = iSim && iSim.initialSegStamina > 0
    ? iSim.segStamina / iSim.initialSegStamina < 0.6
    : false

  // カレンダー進行: 次のリーグ戦より前の日付に未実施の記録会があれば、先にそれを消化する
  if (phase === 'lineup') {
    const ttEvent = ttViewId
      ? (currentSeason.individualEvents ?? []).find(e => e.id === ttViewId) ?? null
      : getDueIndividualEvent(currentSeason)
    if (ttEvent) return (
      <IndividualEventScreen
        event={ttEvent as NonNullable<typeof currentSeason.individualEvents>[0]}
        players={players}
        playerTeamId={playerTeamId}
        onRun={(skipIds) => runWithLoading('記録会 開催中…', () => { simulateIndividualEvent(ttEvent.id, skipIds); setTtViewId(ttEvent.id) }, 800)}
        onDone={() => navigate('/')}
      />
    )
  }

  if (phase === 'lineup') return (
    <LineupPhase
      race={race}
      raceNumber={raceIndex + 1}
      totalRaces={currentSeason.races.length}
      mainPlayers={mainPlayers}
      raceLineup={raceLineup}
      assignedIds={assignedIds}
      allSegsFilled={allSegsFilled}
      pickerSeg={pickerSeg}
      setPickerSeg={setPickerSeg}
      setRaceLineup={setRaceLineup}
      clearRaceLineup={clearRaceLineup}
      onStart={(tactics) => runWithLoading('レース準備中…', () => startInteractiveSim(tactics), 500)}
      onSkipRace={() => runWithLoading('結果を計算中…', () => handleFullSkip(), 500)}
      weatherLabel={weatherLabel}
      raceStrategy={raceStrategy}
      setRaceStrategy={setRaceStrategy}
      teamTalk={raceTeamTalk}
      setTeamTalk={setRaceTeamTalk}
      unavailable={unavailableMap}
      competition="jpel"
    />
  )

  if (phase === 'simulating' && iSim) {
    const segRunnerIds: Record<string, string> = {}
    const segIdx = iSim.currentSegIdx
    if (raceLineup[segIdx]) segRunnerIds[playerTeamId] = raceLineup[segIdx]
    for (const [tid, lineup] of Object.entries(iSim.cpuLineups)) {
      if (lineup[segIdx]) segRunnerIds[tid] = lineup[segIdx]
    }

    // ライブ表示用：現在のスタミナ・イベント補正を反映した投影最終タイム（実結果と一致させる）
    const livePlayerObj = racePlayers.find(p => p.id === raceLineup[segIdx])
    const livePlayerTeam = teams.find(t => t.id === playerTeamId)
    const liveSeg = race.segments.find(s => s.index === segIdx)
    const liveSeasonProgress = raceIndex / currentSeason.races.length
    const livePlayerTime = livePlayerObj && liveSeg
      ? calcFinalSegTime(iSim.segStamina, iSim.initialSegStamina, iSim.playerTimeMod, livePlayerObj, liveSeg, livePlayerTeam, race, liveSeasonProgress, raceStrategy, race.segments.length)
      : iSim.playerBaseTime

    return (
      <SimPhase
        race={race}
        teams={teams}
        players={players}
        playerTeamId={playerTeamId}
        pendingEvent={iSim.pendingEvents[0] ?? null}
        pendingEventsCount={iSim.pendingEvents.length}
        lowStaminaHint={lowStaminaHint}
        currentSegIdx={iSim.currentSegIdx}
        completedSegResults={iSim.completedSegs}
        cumulativeTime={iSim.cumulativeTime}
        cpuTimesForSeg={iSim.cpuTimesForSeg}
        playerBaseTime={livePlayerTime}
        segStamina={iSim.segStamina}
        segPts={iSim.segPts}
        showingSegResult={iSim.showingSegResult}
        lastSegResult={iSim.lastSegResult}
        segRunnerIds={segRunnerIds}
        onChoiceMade={handleChoice}
        onAdvance={handleAdvance}
        onSkip={handleSkip}
        onSkipSegment={handleSkipSegment}
      />
    )
  }

  if (phase === 'results' && results) return (
    <ResultsPhase
      race={race}
      results={results}
      teams={teams}
      players={players}
      playerTeamId={playerTeamId}
      currentSeason={currentSeason}
      competition="jpel"
      isLastRace={activeRaceIndex >= currentSeason.races.length - 1}
    />
  )

  return null
}
