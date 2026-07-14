import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { GameStore } from '../../store/gameStore'
import { careerStage, CAREER_STAGE_LABEL, CAREER_STAGE_COLOR } from '../../utils/playerUtils'
import { formatRaceTime } from '../../utils/eventTime'
import { SPECIALTY_LABELS } from '../../types'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { TeamLogoSVG } from '../icons/Icons'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Tab = 'franchise' | 'league' | 'players' | 'gm'

export default function RecordsPage({ defaultTab }: { defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'franchise')
  const { teams, players, pastSeasons, currentSeason, playerTeamId, gmRep, growthReport } = useGameStore()
  const navigate = useNavigate()

  return (
    <div style={{ padding: '0 0 16px', fontFamily: SAIRA, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <BackButton/>
        <div style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: C.text }}>記録室</div>
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '12px' }}>
          RECORDS
        </div>

        <div style={{
          display: 'flex', gap: '2px',
          background: C.surface, borderRadius: '12px', padding: '3px',
          border: `1px solid ${C.border}`,
        }}>
          {([
            { key: 'franchise', label: '自チーム' },
            { key: 'league', label: 'リーグ' },
            { key: 'players', label: '個人' },
            { key: 'gm', label: 'GMキャリア' },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer',
                borderRadius: '9px', fontFamily: SAIRA,
                fontSize: '12px', fontWeight: tab === key ? '700' : '400',
                background: tab === key
                  ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`
                  : 'none',
                color: tab === key ? C.gold : C.textDim,
                boxShadow: tab === key ? `0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)` : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        {tab === 'franchise' && <FranchiseTab teams={teams} pastSeasons={pastSeasons} currentSeason={currentSeason} playerTeamId={playerTeamId} players={players} />}
        {tab === 'league' && <LeagueTab teams={teams} pastSeasons={pastSeasons} />}
        {tab === 'players' && <PlayersTab players={players} teams={teams} currentSeason={currentSeason} />}
        {tab === 'gm' && <GmCareerTab gmRep={gmRep ?? 50} pastSeasons={pastSeasons} currentSeason={currentSeason} playerTeamId={playerTeamId} teams={teams} growthReport={growthReport} players={players} />}
      </div>
    </div>
  )
}

function CardPanel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      padding: '14px 16px', borderRadius: '14px', position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${C.border2}`,
      boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
      ...style,
    }}>
      <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
      {children}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '8px' }}>{children}</div>
  )
}

// 選手行の長押しで選手詳細（PlayerSheet）を開く共通ハンドラ
// 長押し=詳細の共有フックへ移行（../player/usePlayerLongPress）

// 種目別記録の距離切替タブ（5000m/10000m/ハーフ/マラソン）
type EvDist = 5000 | 10000 | 21097 | 42195
const EV_DIST_TABS: { dist: EvDist; label: string }[] = [
  { dist: 5000, label: '5000m' }, { dist: 10000, label: '10000m' },
  { dist: 21097, label: 'ハーフ' }, { dist: 42195, label: 'マラソン' },
]
// EvDist → eventBests（選手ごとに永続する種目別自己ベスト）のキー
type EvKey = 'd5000' | 'd10000' | 'half' | 'marathon'
const EV_KEY: Record<EvDist, EvKey> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }
function EventDistTabs({ value, onChange }: { value: EvDist; onChange: (d: EvDist) => void }) {
  return (
    <div style={{ display: 'flex', gap: '2px', background: C.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${C.border}`, margin: '4px 0 6px' }}>
      {EV_DIST_TABS.map(({ dist, label }) => (
        <button key={dist} onClick={() => onChange(dist)} style={{
          flex: 1, padding: '7px 0', border: 'none', cursor: 'pointer', borderRadius: '8px', fontFamily: SAIRA,
          fontSize: '11px', fontWeight: value === dist ? 700 : 400,
          background: value === dist ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : 'none',
          color: value === dist ? '#5EC8B8' : C.textDim,
          boxShadow: value === dist ? `0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)` : 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

function FranchiseTab({ teams, pastSeasons, currentSeason, playerTeamId, players }: {
  teams: GameStore['teams']
  pastSeasons: GameStore['pastSeasons']
  currentSeason: GameStore['currentSeason']
  playerTeamId: string
  players: GameStore['players']
}) {
  const myTeam = teams.find(t => t.id === playerTeamId)
  const longPress = usePlayerLongPress()
  const championships = myTeam?.history.championships ?? 0
  const bestStreak = myTeam?.history.bestStreak ?? 0
  const currentStreak = myTeam?.history.currentStreak ?? 0
  const allSeasons = [
    ...pastSeasons,
    ...(currentSeason.currentRaceIndex > 0 ? [currentSeason] : []),
  ].sort((a, b) => a.year - b.year)

  // 記録会 種目別記録（歴代・チームに永続）。在籍時に出した記録はチームに残る（選手が抜けても保持）。
  const [evDist, setEvDist] = useState<EvDist>(5000)
  const myEventTops = EV_DIST_TABS.map(({ dist, label }) => {
    const key = EV_KEY[dist]
    // 選手データが長期整理で削除されていても、記録に焼き込まれた名前で表示を続ける
    const rows = (myTeam?.eventRecords?.[key] ?? [])
      .map(rec => {
        const p = players.find(x => x.id === rec.playerId)
        const name = p?.name ?? rec.playerName
        if (!name) return null
        return { id: rec.playerId, name, nationality: p?.nationality ?? rec.nationality ?? 'JPN' as const, specialty: p?.specialty ?? null, inRoster: !!p, t: rec.timeSec, year: rec.year }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.t - b.t)
      .slice(0, 10)
    return { dist, label, rows }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <CardPanel>
        <SectionLabel>優勝記録</SectionLabel>
        {championships > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            {Array.from({ length: Math.min(championships, 8) }).map((_, i) => (
              <div key={i} style={{
                width: '32px', height: '32px', borderRadius: '50%',
                background: alpha(C.gold, 0.15), border: `1px solid ${alpha(C.gold, 0.45)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SAIRA, fontSize: '16px', color: C.gold, textShadow: `0 0 8px ${alpha(C.gold, 0.5)}`,
              }}>★</div>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost, marginBottom: '8px' }}>まだ優勝なし — 頂点を目指せ</div>
        )}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: C.gold, textShadow: `0 0 8px ${alpha(C.gold, 0.5)}` }}>
            {championships}回
          </div>
          {bestStreak > 0 && (
            <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.green }}>
              最長連続TOP3: {bestStreak}季
              {currentStreak >= 2 && (
                <span style={{ marginLeft: '8px', color: C.gold, fontWeight: '700' }}>現在{currentStreak}連続</span>
              )}
            </div>
          )}
        </div>
      </CardPanel>

      <CardPanel>
        <SectionLabel>歴代 種目別記録（自チーム）</SectionLabel>
        <EventDistTabs value={evDist} onChange={setEvDist} />
        {(() => {
          const group = myEventTops.find(g => g.dist === evDist)
          if (!group || group.rows.length === 0) return <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost, padding: '10px 0' }}>記録なし</div>
          return group.rows.map((row, i) => {
            const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
            return (
              <div key={row.id} {...(row.inRoster ? longPress(row.id) : {})} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: row.inRoster ? 'pointer' : 'default' }}>
                <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center' }}>{i + 1}</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={row.id} nationality={row.nationality} size={28} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{row.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                    {myTeam && <TeamLogoSVG primary={myTeam.colors.primary} secondary={myTeam.colors.secondary} shortName={myTeam.shortName} teamId={myTeam.id} size={12} />}
                    <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myTeam?.name ?? ''}{row.specialty ? ` / ${SPECIALTY_LABELS[row.specialty]}` : ''} / {row.year}年</span>
                  </div>
                </div>
                <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: rankCol }}>{formatRaceTime(row.t)}</span>
              </div>
            )
          })
        })()}
      </CardPanel>

      <CardPanel>
        <SectionLabel>シーズン成績</SectionLabel>
        {allSeasons.length === 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {allSeasons.map(season => {
              const sorted = [...(season.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
              const myStanding = sorted.findIndex(s => s.teamId === playerTeamId) + 1
              const myPoints = season.standings?.find(s => s.teamId === playerTeamId)?.totalPoints ?? 0
              const isCurrent = season.year === currentSeason.year
              const rankCol = myStanding === 1 ? C.gold : myStanding <= 3 ? C.green : myStanding <= 5 ? C.textSub : C.textDim

              return (
                <div key={season.year} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, width: '44px', flexShrink: 0 }}>
                    {season.year}
                  </span>
                  {isCurrent && (
                    <span style={{
                      fontFamily: SAIRA, fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                      background: alpha(C.gold, 0.12), color: C.gold, fontWeight: '700',
                    }}>進行中</span>
                  )}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: rankCol, lineHeight: 1, textShadow: myStanding <= 3 ? `0 0 8px ${alpha(rankCol, 0.5)}` : 'none' }}>
                    {myStanding > 0 ? myStanding : '—'}
                  </span>
                  <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>位</span>
                  <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textDim, minWidth: '40px', textAlign: 'right' }}>
                    {myPoints}pt
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardPanel>
    </div>
  )
}

function LeagueTab({ teams, pastSeasons }: {
  teams: GameStore['teams']
  pastSeasons: GameStore['pastSeasons']
}) {
  const champCounts = teams.map(t => ({
    team: t,
    championships: t.history.championships,
  })).sort((a, b) => b.championships - a.championships)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <CardPanel>
        <SectionLabel>歴代優勝回数</SectionLabel>
        {champCounts.filter(c => c.championships > 0).length === 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>まだ優勝チームなし</div>
        ) : (
          champCounts.filter(c => c.championships > 0).map(({ team, championships }, i) => (
            <div key={team.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '7px 0', borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: C.gold, width: '18px', textAlign: 'center', textShadow: `0 0 6px ${alpha(C.gold, 0.5)}` }}>
                {i + 1}
              </span>
              <span style={{ flex: 1, fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{team.shortName}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {Array.from({ length: Math.min(championships, 5) }).map((_, j) => (
                  <span key={j} style={{ fontFamily: SAIRA, fontSize: '12px', color: C.gold, textShadow: `0 0 5px ${alpha(C.gold, 0.4)}` }}>★</span>
                ))}
                {championships > 5 && <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold }}>×{championships}</span>}
              </div>
            </div>
          ))
        )}
      </CardPanel>

      {pastSeasons.length > 0 && (
        <CardPanel>
          <SectionLabel>歴代チャンピオン</SectionLabel>
          {[...pastSeasons].reverse().map(season => {
            const sorted = [...(season.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
            const champId = sorted[0]?.teamId
            const champ = teams.find(t => t.id === champId)
            return (
              <div key={season.year} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 0', borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim, width: '44px' }}>{season.year}</span>
                <span style={{ fontFamily: SAIRA, fontSize: '13px', color: C.gold, textShadow: `0 0 5px ${alpha(C.gold, 0.4)}` }}>★</span>
                <span style={{ flex: 1, fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{champ?.shortName ?? '—'}</span>
                <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textDim }}>{sorted[0]?.totalPoints ?? 0}pt</span>
              </div>
            )
          })}
        </CardPanel>
      )}
    </div>
  )
}

function PlayersTab({ players, teams, currentSeason }: {
  players: GameStore['players']
  teams: GameStore['teams']
  currentSeason: GameStore['currentSeason']
}) {
  const longPress = usePlayerLongPress()
  // 国内チームIDセット（海外リーグ選手を除外するため）
  const domesticTeamIds = new Set(teams.map(t => t.id))
  const isDomestic = (p: GameStore['players'][0]) => p.teamId === '' || domesticTeamIds.has(p.teamId)

  // キャリア記録は引退含む国内選手のみ
  const careerPlayers = players.filter(p =>
    isDomestic(p) &&
    (p.career.totalRaces > 0 || p.career.segmentWins > 0 || p.career.championships > 0 || p.career.mvpAwards > 0)
  )

  const topSegWins = [...careerPlayers].sort((a, b) => b.career.segmentWins - a.career.segmentWins).slice(0, 10).filter(p => p.career.segmentWins > 0)
  const topMVP     = [...careerPlayers].sort((a, b) => b.career.mvpAwards - a.career.mvpAwards).slice(0, 10).filter(p => p.career.mvpAwards > 0)

  // 記録会 種目別記録（歴代・全チーム）。eventBests＝選手ごとの永続自己ベストを使う。
  const [evDist, setEvDist] = useState<EvDist>(5000)
  const seasonEventTops = EV_DIST_TABS.map(({ dist, label }) => {
    const key = EV_KEY[dist]
    const rows = players
      .filter(p => isDomestic(p) && p.eventBests?.[key])
      .map(p => ({ p, t: p.eventBests![key]!.timeSec, year: p.eventBests![key]!.year }))
      .sort((a, b) => a.t - b.t)
      .slice(0, 10)
    return { dist, label, rows }
  })

  // 今季スタッツ: 実レース結果から集計
  const seasonSegWinMap: Record<string, number> = {}
  for (const race of currentSeason.races) {
    if (!race.results) continue
    for (const seg of race.results.segmentResults) {
      const winner = seg.runners.find(r => r.rank === 1)
      if (winner) seasonSegWinMap[winner.playerId] = (seasonSegWinMap[winner.playerId] ?? 0) + 1
    }
  }
  const topSeasonSeg = Object.entries(seasonSegWinMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, wins]) => ({ p: players.find(x => x.id === id), wins }))
    .filter((x): x is { p: GameStore['players'][0]; wins: number } => !!x.p)

  function RankRow({ p, i, value, unit, color }: { p: GameStore['players'][0]; i: number; value: number; unit: string; color?: string }) {
    const team = teams.find(t => t.id === p.teamId)
    const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
    const valCol = color ?? (i === 0 ? C.gold : i <= 2 ? C.green : C.textSub)
    const isRetired = p.status === 'retired'
    return (
      <div {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
        <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center', textShadow: i <= 2 ? `0 0 6px ${alpha(rankCol, 0.5)}` : 'none' }}>{i + 1}</span>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={28} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{p.name}</span>
            {isRetired && <span style={{ fontFamily: SAIRA, fontSize: '8px', padding: '1px 4px', borderRadius: 3, background: alpha(C.textGhost, 0.12), color: C.textGhost }}>引退</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
            {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
            <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team?.name ?? (isRetired ? '引退' : '—')} / {SPECIALTY_LABELS[p.specialty]}</span>
          </div>
        </div>
        <span style={{ fontFamily: SAIRA, fontSize: '18px', fontWeight: '900', color: valCol, textShadow: i <= 2 ? `0 0 8px ${alpha(valCol, 0.5)}` : 'none' }}>{value}</span>
        <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>{unit}</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

      <CardPanel>
        <SectionLabel>{currentSeason.year}シーズン 区間賞スタッツ</SectionLabel>
        {topSeasonSeg.length === 0
          ? <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>レース未実施</div>
          : topSeasonSeg.map(({ p, wins }, i) => <RankRow key={p.id} p={p} i={i} value={wins} unit="回" />)
        }
      </CardPanel>

      <CardPanel>
        <SectionLabel>通算区間賞ランキング</SectionLabel>
        {topSegWins.length === 0
          ? <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
          : topSegWins.map((p, i) => <RankRow key={p.id} p={p} i={i} value={p.career.segmentWins} unit="回" />)
        }
      </CardPanel>

      {topMVP.length > 0 && (
        <CardPanel>
          <SectionLabel>MVP受賞ランキング</SectionLabel>
          {topMVP.map((p, i) => <RankRow key={p.id} p={p} i={i} value={p.career.mvpAwards} unit="回" />)}
        </CardPanel>
      )}

      <CardPanel>
        <SectionLabel>歴代 種目別記録（記録会）</SectionLabel>
        <EventDistTabs value={evDist} onChange={setEvDist} />
        {(() => {
          const group = seasonEventTops.find(g => g.dist === evDist)
          if (!group || group.rows.length === 0) return <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost, padding: '10px 0' }}>記録なし</div>
          return group.rows.map(({ p, t, year }, i) => {
            const team = teams.find(tm => tm.id === p.teamId)
            const rankCol = i === 0 ? C.gold : i <= 2 ? C.green : C.textSub
            return (
              <div key={p.id} {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '900', color: rankCol, width: '18px', textAlign: 'center' }}>{i + 1}</span>
                <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={28} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                    {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={12} />}
                    <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(team?.name ?? (p.status === 'retired' ? '引退' : '—'))} / {year}年</span>
                  </div>
                </div>
                <span style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: rankCol }}>{formatRaceTime(t)}</span>
              </div>
            )
          })
        })()}
      </CardPanel>
    </div>
  )
}

function GmCareerTab({ gmRep, pastSeasons, currentSeason, playerTeamId, teams, growthReport, players }: {
  gmRep: number
  pastSeasons: GameStore['pastSeasons']
  currentSeason: GameStore['currentSeason']
  playerTeamId: string
  teams: GameStore['teams']
  growthReport: GameStore['growthReport']
  players: GameStore['players']
}) {
  const allSeasons = [...pastSeasons, ...(currentSeason.currentRaceIndex > 0 ? [currentSeason] : [])]
  const myTeam = teams.find(t => t.id === playerTeamId)
  const championships = myTeam?.history.championships ?? 0
  const totalSeasons = allSeasons.length
  const bestRank = allSeasons.length > 0
    ? Math.min(...allSeasons.map(s => {
        const sorted = [...(s.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
        const r = sorted.findIndex(x => x.teamId === playerTeamId) + 1
        return r > 0 ? r : 99
      }))
    : 99

  const repColor = gmRep >= 70 ? C.green : gmRep >= 40 ? C.gold : C.red
  const repLabel = gmRep >= 80 ? '名GMの称号' : gmRep >= 60 ? '優秀なGM' : gmRep >= 40 ? '一般的なGM' : '改善が必要'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingBottom: '24px' }}>
      <CardPanel>
        <SectionLabel>GM評判</SectionLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: '42px', fontWeight: '900', color: repColor, lineHeight: 1, textShadow: `0 0 12px ${alpha(repColor, 0.5)}` }}>{gmRep}</div>
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '14px', fontWeight: '800', color: repColor }}>{repLabel}</div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim, marginTop: '2px' }}>/ 100点</div>
          </div>
        </div>
        <div style={{ height: '8px', background: C.surface, borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${gmRep}%`, background: `linear-gradient(90deg, ${alpha(repColor, 0.55)}, ${repColor})`, borderRadius: '4px', transition: 'width 0.4s' }}/>
        </div>
      </CardPanel>

      <CardPanel>
        <SectionLabel>GMキャリア統計</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: '在任シーズン', value: `${totalSeasons}季`, color: C.textSub },
            { label: '優勝回数', value: `${championships}回`, color: championships > 0 ? C.gold : C.textDim },
            { label: '最高順位', value: bestRank <= 10 ? `${bestRank}位` : '—', color: bestRank === 1 ? C.gold : bestRank <= 3 ? C.green : C.textSub },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ padding: '10px 8px', borderRadius: '10px', background: C.surface, border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textDim, marginBottom: '4px' }}>{label}</div>
              <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color, lineHeight: 1, textShadow: color !== C.textDim && color !== C.textSub ? `0 0 8px ${alpha(color, 0.4)}` : 'none' }}>{value}</div>
            </div>
          ))}
        </div>
      </CardPanel>

      {allSeasons.length > 0 && (
        <CardPanel>
          <SectionLabel>シーズン別順位推移</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '60px' }}>
            {allSeasons.map(s => {
              const sorted = [...(s.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
              const rank = sorted.findIndex(x => x.teamId === playerTeamId) + 1
              const totalTeams = sorted.length || 10
              const barH = rank > 0 ? Math.round(((totalTeams - rank + 1) / totalTeams) * 56) : 4
              const barCol = rank === 1 ? C.gold : rank <= 3 ? C.green : rank <= 5 ? C.blue : C.textGhost
              const isCurrent = s.year === currentSeason.year
              return (
                <div key={s.year} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: '4px' }}>
                  <div style={{
                    width: '100%', height: `${barH}px`,
                    background: isCurrent ? `linear-gradient(180deg, ${barCol}, ${alpha(barCol, 0.55)})` : barCol,
                    borderRadius: '3px 3px 0 0',
                    opacity: isCurrent ? 1 : 0.75,
                    border: isCurrent ? `1px solid ${barCol}` : 'none',
                  }}/>
                  <div style={{ fontFamily: SAIRA, fontSize: '9px', color: rank === 1 ? C.gold : C.textDim, fontWeight: rank <= 3 ? '700' : '400' }}>
                    {rank > 0 ? rank : '—'}
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost }}>{String(s.year).slice(2)}</div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
            {[[C.gold, '1位'], [C.green, '2-3位'], [C.blue, '4-5位'], [C.textGhost, '6位以下']].map(([col, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: col }}/>
                <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim }}>{label}</span>
              </div>
            ))}
          </div>
        </CardPanel>
      )}

      {(() => {
        const myPlayers = players.filter(p => p.teamId === playerTeamId && p.rosterTier === 'main')
        const yearOvrMap: Record<number, number[]> = {}
        for (const p of myPlayers) {
          for (const h of (p.ovrHistory ?? [])) {
            if (!yearOvrMap[h.year]) yearOvrMap[h.year] = []
            yearOvrMap[h.year].push(h.ovr)
          }
        }
        const yearEntries = Object.entries(yearOvrMap)
          .map(([y, ovrs]) => ({ year: +y, avg: Math.round(ovrs.reduce((s, v) => s + v, 0) / ovrs.length) }))
          .sort((a, b) => a.year - b.year)
        if (yearEntries.length < 2) return null
        const minOvr = Math.min(...yearEntries.map(e => e.avg))
        const maxOvr = Math.max(...yearEntries.map(e => e.avg))
        const range = maxOvr - minOvr || 1
        const teamPrimary = teams.find(t => t.id === playerTeamId)?.colors.primary ?? C.blue
        return (
          <CardPanel>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>チーム平均OVR推移</span>
              <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '900', color: teamPrimary, textShadow: `0 0 6px ${alpha(teamPrimary, 0.4)}` }}>
                {yearEntries[yearEntries.length - 1]?.avg}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '3px', alignItems: 'flex-end', height: '52px' }}>
              {yearEntries.map(e => {
                const h = Math.max(8, Math.round(((e.avg - minOvr) / range) * 44) + 8)
                return (
                  <div key={e.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textDim }}>{e.avg}</div>
                    <div style={{ width: '100%', height: `${h}px`, background: alpha(teamPrimary, 0.22), border: `1px solid ${alpha(teamPrimary, 0.45)}`, borderRadius: '2px' }}/>
                    <div style={{ fontFamily: SAIRA, fontSize: '7px', color: C.textGhost }}>{String(e.year).slice(2)}</div>
                  </div>
                )
              })}
            </div>
          </CardPanel>
        )
      })()}

      <CardPanel>
        <SectionLabel>育成実績{growthReport ? `（${growthReport.year}シーズン）` : ''}</SectionLabel>
        {!growthReport || growthReport.entries.length === 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>シーズン終了後に育成実績が表示されます</div>
        ) : growthReport.entries.slice(0, 8).map(e => {
          const delta = e.ovrAfter - e.ovrBefore
          const deltaColor = delta >= 3 ? C.green : delta >= 1 ? C.gold : delta < 0 ? C.red : C.textDim
          return (
            <div key={e.playerId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{e.name}</div>
                <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>{SPECIALTY_LABELS[e.specialty]} / {e.age}歳</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: SAIRA, fontSize: '11px', color: C.textSub }}>{e.ovrBefore} → {e.ovrAfter}</div>
                <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: deltaColor, textShadow: `0 0 6px ${alpha(deltaColor, 0.4)}` }}>
                  {delta >= 0 ? `+${delta}` : `${delta}`}
                </div>
              </div>
            </div>
          )
        })}
      </CardPanel>
    </div>
  )
}
