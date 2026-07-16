import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { LineupPhase } from '../race/LineupPhase'
import { ECL_COURSES } from '../../data/eclCourses'
import { formatRaceTime } from '../../utils/eventTime'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from '../player/PlayerFace'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const FONT = "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif"
const weatherLabel: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }

type EntryTeam = {
  id: string
  name: string
  shortName: string
  isForeign: boolean
  isPlayerTeam: boolean
  leagueName: string
  colors: { primary: string; secondary: string }
}

function fmtPrize(v: number): string {
  return v >= 100_000_000 ? `${v / 100_000_000}億円` : `${Math.round(v / 10_000)}万円`
}

export default function EclPage() {
  const navigate = useNavigate()
  const { teams, players, playerTeamId, currentSeason, foreignLeagues, simulateEcl, prepareEcl, openPlayerSheet } = useGameStore()
  const eclResult = currentSeason.eclResult

  // 長押しで選手詳細
  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lp = (pid: string) => ({
    onPointerDown: () => { lpTimer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerLeave: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
    onPointerMove: () => { if (lpTimer.current) clearTimeout(lpTimer.current) },
  })

  const [phase, setPhase] = useState<'entry' | 'lineup'>('entry')
  const [lineup, setLineupState] = useState<Record<number, string>>({})
  const [pickerSeg, setPickerSeg] = useState<number | null>(null)
  const [raceStrategy, setRaceStrategy] = useState<'aggressive' | 'balanced' | 'conservative'>('balanced')

  useEffect(() => {
    if (!eclResult) prepareEcl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const race = currentSeason.eclRace
  const course = ECL_COURSES.find(c => c.id === currentSeason.eclCourseId)

  // 出場チーム（開催前はstoreと同じ選定ロジック、開催後は結果の順位表）
  const entrants: EntryTeam[] = useMemo(() => {
    if (eclResult) return eclResult.standings
    const std = [...currentSeason.standings].sort((a, b) => b.totalPoints - a.totalPoints)
    const list: EntryTeam[] = []
    std.slice(0, 2).forEach(s => {
      const t = teams.find(tm => tm.id === s.teamId)
      if (t) list.push({ id: t.id, name: t.name, shortName: t.shortName, isForeign: false, isPlayerTeam: t.id === playerTeamId, leagueName: 'JPEL', colors: t.colors })
    })
    const fs = currentSeason.foreignStandings ?? {}
    for (const league of foreignLeagues ?? []) {
      const top2 = [...(fs[league.id] ?? [])].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 2)
      top2.forEach(s => {
        const club = league.clubs.find(c => c.id === s.clubId)
        if (club) list.push({ id: club.id, name: club.name, shortName: club.shortName, isForeign: true, isPlayerTeam: false, leagueName: league.name, colors: club.colors })
      })
    }
    return list
  }, [eclResult, currentSeason.standings, currentSeason.foreignStandings, teams, foreignLeagues, playerTeamId])

  const playerQualified = entrants.some(e => e.isPlayerTeam)
  const teamById = useMemo(() => new Map(entrants.map(e => [e.id, e])), [entrants])

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
  const allSegsFilled = (race?.segments ?? []).every(s => !!lineup[s.index])

  function run(withLineup?: Record<number, string>) {
    simulateEcl(withLineup)
    setPhase('entry')
  }

  // ── 区間配置（1軍レースと同じ LineupPhase）──
  if (!eclResult && phase === 'lineup' && race) {
    return (
      <LineupPhase
        race={race}
        raceNumber={1}
        totalRaces={1}
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

  // ── 結果 ──
  if (eclResult) {
    const champion = eclResult.standings[0]
    const championTime = champion?.timeSec ?? 0
    const rr = eclResult.raceResults
    return (
      <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 90 }}>
        <div style={{ padding: '12px 16px 4px' }}><BackButton/></div>

        {/* 優勝チーム */}
        <div style={{
          margin: '4px 14px 14px', padding: '20px 16px', borderRadius: 16, textAlign: 'center',
          background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${C.surface2})`,
          border: `3px solid ${C.gold}`,
          boxShadow: `0 6px 0 #8b6914, 0 10px 26px rgba(0,0,0,0.6)`,
        }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 4, fontWeight: 900 }}>WORLD CHAMPION</div>
          <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0 8px' }}>
            {champion && <TeamLogoSVG primary={champion.colors.primary} secondary={champion.colors.secondary} shortName={champion.shortName} teamId={champion.id} size={64} />}
          </div>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{champion?.name}</div>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, marginTop: 3 }}>{champion?.leagueName} — {formatRaceTime(championTime)}</div>
          <div style={{ fontSize: 11, color: C.textSub, marginTop: 8 }}>
            {eclResult.year}年 ECL世界一決定戦（{eclResult.courseName ?? ''}・{eclResult.location ?? ''}）
          </div>
          {eclResult.playerRank != null && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 10, background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.35)}`, fontSize: 12, fontWeight: 800, color: eclResult.playerRank === 1 ? C.gold : C.textSub }}>
              自チームは{eclResult.playerRank}位{(eclResult.prize ?? 0) > 0 ? ` — 賞金 ${fmtPrize(eclResult.prize!)}` : ''}
            </div>
          )}
        </div>

        {/* 大会MVP */}
        {eclResult.mvpPlayerId && (() => {
          const mvp = players.find(p => p.id === eclResult.mvpPlayerId)
          if (!mvp) return null
          const mvpTeam = teamById.get(mvp.teamId)
          return (
            <div style={{ margin: '0 14px 14px', padding: '12px 14px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 10, background: `linear-gradient(180deg, ${alpha('#2ECC71', 0.14)}, ${C.surface2})`, border: `2px solid ${alpha('#2ECC71', 0.5)}` }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1px solid ${alpha('#2ECC71', 0.5)}` }}>
                <PlayerFace playerId={mvp.id} nationality={mvp.nationality} size={44}/>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: SAIRA, fontSize: 9, color: '#2ECC71', letterSpacing: 2, fontWeight: 900, marginBottom: 2 }}>ECL MVP</div>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mvp.name}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{mvpTeam?.name ?? ''}</div>
              </div>
              {mvpTeam && <TeamLogoSVG primary={mvpTeam.colors.primary} secondary={mvpTeam.colors.secondary} shortName={mvpTeam.shortName} teamId={mvpTeam.id} size={26} />}
            </div>
          )
        })()}

        {/* 最終順位 */}
        <div style={{ margin: '0 14px 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>最終順位</div>
          <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {eclResult.standings.map((s, i) => {
              const diff = (s.timeSec ?? 0) - championTime
              const isMe = s.isPlayerTeam
              return (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                  background: isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  borderBottom: i < eclResult.standings.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, width: 22, textAlign: 'center', color: i === 0 ? C.gold : i < 3 ? C.textSub : C.textGhost }}>{i + 1}</span>
                  <TeamLogoSVG primary={s.colors.primary} secondary={s.colors.secondary} shortName={s.shortName} teamId={s.id} size={22} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    <div style={{ fontSize: 8, color: C.textGhost }}>{s.leagueName}</div>
                  </div>
                  <span style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 800, color: i === 0 ? C.gold : C.textSub }}>
                    {i === 0 ? formatRaceTime(s.timeSec ?? 0) : `+${formatRaceTime(diff)}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* 区間別結果 */}
        {rr && (
          <div style={{ margin: '0 14px 14px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>区間別結果</div>
            {rr.segmentResults.map(sr => {
              const seg = (race ?? currentSeason.eclRace)?.segments.find(s => s.index === sr.segmentIndex)
              const top3 = sr.runners.slice(0, 3)
              const mine = sr.runners.find(r => r.teamId === playerTeamId)
              const showMine = mine && !top3.some(r => r.playerId === mine.playerId)
              return (
                <div key={sr.segmentIndex} style={{ marginBottom: 8, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, padding: '8px 12px' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.textSub, marginBottom: 5 }}>
                    {sr.segmentIndex}区 <span style={{ color: C.textGhost, fontWeight: 700 }}>{seg ? `${seg.distanceKm}km` : ''}</span>
                  </div>
                  {[...top3, ...(showMine ? [mine!] : [])].map(r => {
                    const t = teamById.get(r.teamId)
                    const pl = players.find(p => p.id === r.playerId)
                    const isMe = r.teamId === playerTeamId
                    return (
                      <div key={r.playerId} {...(pl ? lp(pl.id) : {})} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', cursor: pl ? 'pointer' : 'default' }}>
                        <span style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, width: 18, textAlign: 'center', color: r.rank === 1 ? C.gold : C.textGhost }}>{r.rank}</span>
                        {pl && (
                          <div style={{ width: 22, height: 22, borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                            <PlayerFace playerId={pl.id} nationality={pl.nationality} size={22} />
                          </div>
                        )}
                        {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={15} />}
                        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: isMe ? C.gold : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name ?? '—'}</span>
                        <span style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>{formatRaceTime(r.timeSec)}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ margin: '0 14px' }}>
          <button onClick={() => navigate('/')} className="btn-game btn-game--gold" style={{ width: '100%', padding: '15px', fontFamily: SAIRA, fontSize: 14, fontWeight: 800 }}>
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  // ── 開催前（出場チーム・コース発表）──
  const totalKm = race ? Math.round(race.segments.reduce((s, x) => s + x.distanceKm, 0) * 10) / 10 : 0
  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: '100dvh', color: C.text, paddingBottom: 90 }}>
      <div style={{ padding: '12px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton/>
        <div>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900 }}>EKIDEN CHAMPIONS LEAGUE</div>
          <div style={{ fontFamily: SAIRA, fontSize: 20, fontWeight: 900 }}>ECL 世界一決定戦</div>
        </div>
      </div>

      {/* コース発表 */}
      <div style={{ margin: '10px 14px 14px', padding: '14px 16px', borderRadius: 14, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.goldDark}`, boxShadow: '0 4px 0 #5a3500' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 9, color: C.gold, letterSpacing: 2, fontWeight: 900, marginBottom: 4 }}>開催コース</div>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{course?.name ?? '—'}</div>
        <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
          {course?.location}・7区間 {totalKm}km・{weatherLabel[race?.conditions.weather ?? 'sunny']}
        </div>
        <div style={{ fontSize: 11, color: C.textSub, marginTop: 6, lineHeight: 1.6 }}>{course?.character}</div>
        {race && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 8 }}>
            {race.segments.map(s => {
              const hint = s.uphillPct >= 25 ? '登' : s.downhillPct >= 25 ? '下' : ''
              return (
                <span key={s.index} style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5, background: alpha(hint === '登' ? C.green : hint === '下' ? C.cyan : C.textSub, 0.12), color: hint === '登' ? C.green : hint === '下' ? C.cyan : C.textSub, border: `1px solid ${C.border}` }}>
                  {s.index}区 {s.distanceKm}km{hint ? ` ${hint}` : ''}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {/* 出場チーム */}
      <div style={{ margin: '0 14px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>出場チーム（各リーグ 優勝・準優勝）</div>
        <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
          {entrants.map((e, i) => (
            <div key={e.id} style={{
              display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
              background: e.isPlayerTeam ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
              borderBottom: i < entrants.length - 1 ? `1px solid ${C.border}` : 'none',
            }}>
              <TeamLogoSVG primary={e.colors.primary} secondary={e.colors.secondary} shortName={e.shortName} teamId={e.id} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: e.isPlayerTeam ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                <div style={{ fontSize: 8, color: C.textGhost }}>{e.leagueName}</div>
              </div>
              {e.isPlayerTeam && <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 900, color: C.gold, padding: '1px 6px', borderRadius: 4, background: alpha(C.gold, 0.14), border: `1px solid ${alpha(C.gold, 0.4)}` }}>自チーム</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ margin: '0 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {playerQualified ? (
          <>
            <button onClick={() => setPhase('lineup')} className="btn-game btn-game--gold" style={{ width: '100%', padding: '15px', fontFamily: SAIRA, fontSize: 14, fontWeight: 800 }}>
              区間配置へ
            </button>
            <button onClick={() => run()} style={{ width: '100%', padding: '12px', borderRadius: 12, background: 'transparent', border: `1px solid ${C.border2}`, color: C.textSub, fontFamily: SAIRA, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              おまかせで開催（OVR上位を自動配置）
            </button>
          </>
        ) : (
          <button onClick={() => run()} className="btn-game btn-game--gold" style={{ width: '100%', padding: '15px', fontFamily: SAIRA, fontSize: 14, fontWeight: 800 }}>
            大会を開催する
          </button>
        )}
      </div>
    </div>
  )
}
