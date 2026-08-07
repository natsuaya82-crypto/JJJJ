import { useState, useRef, useMemo } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { GameStore } from '../../store/gameStore'
import { liveName } from '../../utils/playerUtils'
import { formatRaceTime } from '../../utils/eventTime'
import { makeIsDomestic } from '../../utils/domesticPlayers'
import { useClubIndex } from '../../lib/useClubIndex'
import { teamHistoryOf } from '../../utils/teamHistory'
import { makeTeamIdAt, normalizeTenures } from '../../utils/gmTenure'
import { useSeasonAwards } from '../../lib/useSeasonAwards'
import { SPECIALTY_LABELS } from '../../types'
import type { SeasonAward, SeasonStanding } from '../../types'
import { C, alpha } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import { TeamLogoSVG } from '../icons/Icons'
import { seasonDivisionStandings, standingRowOf, rankOfTeam, type SeasonStandingsLike } from '../../utils/league'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 記録室の各ページ共通のヘッダー付き外枠（ハブと同じ見た目・横タブは廃止）
function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '0 0 16px', fontFamily: SAIRA, background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>RECORDS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: '10px' }}>
          <BackButton/>
          <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text }}>{title}</div>
        </div>
      </div>
      <div style={{ padding: '2px 16px 0' }}>
        {children}
      </div>
    </div>
  )
}

// 自チーム記録（優勝記録・歴代種目別記録・シーズン成績）
export default function FranchiseRecordsPage() {
  const { teams, players, pastSeasons, currentSeason, playerTeamId } = useGameStore()
  const seasonAwards = useSeasonAwards()
  return (
    <PageShell title="自チーム記録">
      <FranchiseTab teams={teams} pastSeasons={pastSeasons} currentSeason={currentSeason} playerTeamId={playerTeamId} players={players} seasonAwards={seasonAwards} />
    </PageShell>
  )
}

// 個人ランキング（通算区間賞・MVP・歴代種目別記録会）
export function IndividualRecordsPage() {
  const { teams, players, currentSeason, pastSeasons, foreignLeagues } = useGameStore()
  return (
    <PageShell title="個人ランキング">
      <PlayersTab players={players} teams={teams} foreignLeagues={foreignLeagues} currentSeason={currentSeason} pastSeasons={pastSeasons} />
    </PageShell>
  )
}

// GMキャリア（評判・キャリア統計・順位推移・育成実績）
export function GmCareerPage() {
  const { teams, players, pastSeasons, currentSeason, playerTeamId, gmRep, growthReport, gmTenures } = useGameStore()
  return (
    <PageShell title="GMキャリア">
      <GmCareerTab gmRep={gmRep ?? 50} pastSeasons={pastSeasons} currentSeason={currentSeason} playerTeamId={playerTeamId} teams={teams} growthReport={growthReport} players={players} gmTenures={gmTenures} />
    </PageShell>
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

// 記録室のセクション切替。
// 中身を縦に全部積むと1画面に収まらず延々スクロールになるので、
// 上の横タブで1つずつ出す。左右スワイプでも隣のセクションへ移れる。
// 見た目は既にある EventDistTabs（種目の切替）と同じものを使う（新しい見た目は増やさない）。
type Section = { label: string; node: React.ReactNode }

function SectionSwitcher({ sections }: { sections: Section[] }) {
  const [idx, setIdx] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  const n = sections.length
  // 記録が無くなってセクションが減った場合にはみ出さないように丸める
  const i = Math.min(idx, n - 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: '2px', background: C.surface, borderRadius: '10px', padding: '3px', border: `1px solid ${C.border}`, margin: '0 0 10px' }}>
        {sections.map((s, k) => (
          <button key={s.label} onClick={() => setIdx(k)} style={{
            flex: 1, padding: '8px 0', border: 'none', cursor: 'pointer', borderRadius: '8px', fontFamily: SAIRA,
            fontSize: '10px', fontWeight: i === k ? 700 : 400, whiteSpace: 'nowrap',
            background: i === k ? `linear-gradient(180deg, ${C.surface3}, ${C.surface2})` : 'none',
            color: i === k ? '#5EC8B8' : C.textDim,
            boxShadow: i === k ? `0 1px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)` : 'none',
          }}>{s.label}</button>
        ))}
      </div>

      <div
        onTouchStart={e => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY } }}
        onTouchEnd={e => {
          const s = touch.current
          touch.current = null
          if (!s) return
          const t = e.changedTouches[0]
          const dx = t.clientX - s.x, dy = t.clientY - s.y
          // 縦スクロールや長押しと取り違えないように、横の動きが縦よりはっきり大きいときだけ反応する
          if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return
          setIdx(dx < 0 ? Math.min(i + 1, n - 1) : Math.max(i - 1, 0))
        }}
      >
        {sections[i]?.node}
      </div>

      {/* いま何枚目か。スワイプで動くことが分かるように出す */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', padding: '14px 0 20px' }}>
        {sections.map((s, k) => (
          <div key={s.label} style={{
            width: '6px', height: '6px', borderRadius: '50%',
            background: i === k ? C.gold : alpha(C.textGhost, 0.35),
          }}/>
        ))}
      </div>
    </div>
  )
}

function FranchiseTab({ teams, pastSeasons, currentSeason, playerTeamId, players, seasonAwards }: {
  teams: GameStore['teams']
  pastSeasons: GameStore['pastSeasons']
  currentSeason: GameStore['currentSeason']
  playerTeamId: string
  players: GameStore['players']
  seasonAwards: SeasonAward[]
}) {
  const myTeam = teams.find(t => t.id === playerTeamId)
  const longPress = usePlayerLongPress()
  // 優勝回数・連続上位はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
  const myHistory = teamHistoryOf(pastSeasons, playerTeamId)
  const championships = myHistory.championships
  const bestStreak = myHistory.bestStreak
  const currentStreak = myHistory.currentStreak
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
        const name = liveName(players, rec.playerId, rec.playerName)
        if (!name) return null
        return { id: rec.playerId, name, nationality: p?.nationality ?? rec.nationality ?? 'JPN' as const, specialty: p?.specialty ?? null, inRoster: !!p, t: rec.timeSec, year: rec.year }
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.t - b.t)
      .slice(0, 10)
    return { dist, label, rows }
  })

  const champPanel = (
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
  )

  const seasonPanel = (
      <CardPanel>
        <SectionLabel>シーズン成績</SectionLabel>
        {allSeasons.length === 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[...allSeasons].reverse().map(season => {
              // その年の自分の部だけで数える（utils/league）。全52チームで並べると部の差でずれる
              const sorted = seasonDivisionStandings(season, playerTeamId)
              const myStanding = rankOfTeam(sorted, playerTeamId)
              const myRow = standingRowOf(season, playerTeamId)
              const myPoints = myRow?.totalPoints ?? 0
              const wins = myRow?.raceResults?.filter(r => r.rank === 1).length ?? 0
              const isCurrent = season.year === currentSeason.year
              const rankCol = myStanding === 1 ? C.gold : myStanding <= 3 ? C.green : myStanding <= 5 ? C.textSub : C.textDim
              // 年間表彰（MVP・新人王）。名前が焼き込まれているので選手が抜けても表示できる
              const award = seasonAwards.find(a => a.year === season.year)
              const mvpName = liveName(players, award?.mvpId, award?.mvpName) || undefined
              const rookieName = liveName(players, award?.rookieId, award?.rookieName) || undefined

              return (
                <div key={season.year} style={{
                  display: 'flex', flexDirection: 'column', gap: '5px',
                  padding: '10px 0', borderBottom: `1px solid ${C.border}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textSub, width: '44px', flexShrink: 0, fontWeight: '700' }}>
                      {season.year}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontFamily: SAIRA, fontSize: '8px', padding: '1px 5px', borderRadius: '3px',
                        background: alpha(C.gold, 0.12), color: C.gold, fontWeight: '700',
                      }}>進行中</span>
                    )}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: SAIRA, fontSize: '11px', color: C.green, minWidth: '34px', textAlign: 'right' }}>
                      {wins}勝
                    </span>
                    <span style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: rankCol, lineHeight: 1, textShadow: myStanding <= 3 ? `0 0 8px ${alpha(rankCol, 0.5)}` : 'none' }}>
                      {myStanding > 0 ? myStanding : '—'}
                    </span>
                    <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>位</span>
                    <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textDim, minWidth: '44px', textAlign: 'right' }}>
                      {myPoints}pt
                    </span>
                  </div>
                  {(mvpName || rookieName) && (
                    <div style={{ display: 'flex', gap: '10px', paddingLeft: '44px', flexWrap: 'wrap' }}>
                      {mvpName && (
                        <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>
                          <span style={{ color: C.gold, fontWeight: '900' }}>MVP</span> {mvpName}
                        </span>
                      )}
                      {rookieName && (
                        <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>
                          <span style={{ color: C.blue, fontWeight: '900' }}>新人王</span> {rookieName}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardPanel>
  )

  const evPanel = (
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
  )

  // 歴代の名選手（自チームで現役を終えた選手）。
  // 以前はチーム側に legends として引退時の情報を焼き込んで貯めていたが、どの画面にも出ていなかった。
  // 自チームに在籍したことがある選手はセーブの整理でも消えない決まりなので、選手データから毎回作れる。
  // 引退時の所属（retiredTeamId）で自チーム引退かを見る。
  // ただし古いセーブには retiredTeamId が入っていない引退選手が居るので、
  // その場合は選手詳細の「在籍履歴」と同じやり方で、最後に居たチームを出走記録から拾う。
  const lastTeamOf = useMemo(() => {
    const last = new Map<string, { year: number; teamId: string }>()
    const put = (year: number, playerId: string, teamId: string) => {
      if (!teamId) return
      const cur = last.get(playerId)
      if (!cur || year >= cur.year) last.set(playerId, { year, teamId })
    }
    for (const season of [...pastSeasons, currentSeason]) {
      for (const race of [...(season.races ?? []), ...(season.secondTeamRaces ?? [])]) {
        if (!race.results) continue
        for (const sr of race.results.segmentResults) {
          for (const r of sr.runners) put(season.year, r.playerId, r.teamId)
        }
      }
      // 出走ゼロの年も在籍として数える（在籍履歴が0戦の行を出しているのと同じ）
      for (const z of season.zeroAppearances ?? []) put(season.year, z.playerId, z.teamId)
    }
    return last
  }, [pastSeasons, currentSeason])

  const myLegends = useMemo(() => players
    .filter(p => p.status === 'retired')
    .filter(p => p.retiredTeamId === playerTeamId || (p.retiredTeamId == null && lastTeamOf.get(p.id)?.teamId === playerTeamId))
    // 名選手の線引きは以前と同じ（区間賞5つ以上・優勝経験あり・4年以上のどれか）
    .filter(p => p.career.segmentWins >= 5 || p.career.championships >= 1 || p.yearsPro >= 4)
    .sort((a, b) => (b.retiredYear ?? 0) - (a.retiredYear ?? 0) || (b.finalOvr ?? 0) - (a.finalOvr ?? 0))
    .slice(0, 30)
  , [players, playerTeamId, lastTeamOf])

  const legendPanel = (
      <CardPanel>
        <SectionLabel>歴代の名選手（自チーム）</SectionLabel>
        {myLegends.length === 0 ? (
          <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost, padding: '10px 0' }}>まだ記録なし — 自チームで現役を終えた選手がここに並ぶ</div>
        ) : myLegends.map(p => (
          <div key={p.id} {...longPress(p.id)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', flexShrink: 0, overflow: 'hidden' }}><PlayerFace playerId={p.id} nationality={p.nationality} size={28} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontFamily: SAIRA, fontSize: '12px', color: C.text }}>{p.name}</span>
                <span style={{ fontFamily: SAIRA, fontSize: '8px', padding: '1px 4px', borderRadius: 3, background: alpha(C.textGhost, 0.12), color: C.textGhost }}>引退</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                {myTeam && <TeamLogoSVG primary={myTeam.colors.primary} secondary={myTeam.colors.secondary} shortName={myTeam.shortName} teamId={myTeam.id} size={12} />}
                <span style={{ fontSize: '9px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{myTeam?.name ?? ''}{p.specialty ? ` / ${SPECIALTY_LABELS[p.specialty]}` : ''} / 通算{p.yearsPro}年</span>
              </div>
              {(p.career.segmentWins > 0 || p.career.championships > 0 || p.career.mvpAwards > 0) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: 2, flexWrap: 'wrap' }}>
                  {p.career.segmentWins > 0 && <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.green }}>区間賞 {p.career.segmentWins}</span>}
                  {p.career.championships > 0 && <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.gold }}>優勝 {p.career.championships}</span>}
                  {p.career.mvpAwards > 0 && <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.gold }}>MVP {p.career.mvpAwards}</span>}
                </div>
              )}
            </div>
            <div style={{ flexShrink: 0, textAlign: 'right' }}>
              {p.finalOvr != null && (
                <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: C.gold }}>{p.finalOvr}</div>
              )}
              <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim }}>
                {p.retiredYear != null ? `${p.retiredYear}年` : ''}{p.age != null ? ` / ${p.age}歳` : ''}
              </div>
            </div>
          </div>
        ))}
      </CardPanel>
  )

  return <SectionSwitcher sections={[
    { label: '優勝記録', node: champPanel },
    { label: 'シーズン成績', node: seasonPanel },
    { label: '種目別記録', node: evPanel },
    { label: '名選手', node: legendPanel },
  ]} />
}

function PlayersTab({ players, teams, foreignLeagues, currentSeason, pastSeasons }: {
  players: GameStore['players']
  teams: GameStore['teams']
  foreignLeagues: GameStore['foreignLeagues']
  currentSeason: GameStore['currentSeason']
  pastSeasons: GameStore['pastSeasons']
}) {
  const longPress = usePlayerLongPress()
  const clubIndex = useClubIndex()
  // 国内（JPEL）の記録として数えてよい選手かの判定は domesticPlayers.ts に集約。
  // 引退すると teamId が空になるので、引退時の所属（retiredTeamId）を見て海外クラブ勢を外す
  const isDomestic = useMemo(() => makeIsDomestic(teams, foreignLeagues), [teams, foreignLeagues])

  // キャリア記録は引退含む国内選手のみ
  const careerPlayers = players.filter(p =>
    isDomestic(p) &&
    (p.career.totalRaces > 0 || p.career.segmentWins > 0 || p.career.championships > 0 || p.career.mvpAwards > 0)
  )

  const topMVP = [...careerPlayers].sort((a, b) => b.career.mvpAwards - a.career.mvpAwards).slice(0, 10).filter(p => p.career.mvpAwards > 0)

  // 通算JPEL区間賞。career.segmentWins は ECL・海外リーグの区間賞も混ざっているので使わず、
  // 過去シーズン＋今季のJPELレース結果だけから数え直す（レース結果はセーブに全部残っている）
  const jpelSegWinMap = useMemo(() => {
    const map: Record<string, number> = {}
    const seasons = [...pastSeasons.map(ps => ps.races), currentSeason.races]
    for (const races of seasons) {
      for (const race of races) {
        if (!race.results) continue
        for (const seg of race.results.segmentResults) {
          const winner = seg.runners.find(r => r.rank === 1)
          if (winner) map[winner.playerId] = (map[winner.playerId] ?? 0) + 1
        }
      }
    }
    return map
  }, [pastSeasons, currentSeason.races])
  const topSegWins = players
    .filter(p => isDomestic(p) && (jpelSegWinMap[p.id] ?? 0) > 0)
    .sort((a, b) => (jpelSegWinMap[b.id] ?? 0) - (jpelSegWinMap[a.id] ?? 0))
    .slice(0, 10)

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
    const team = clubIndex.byId(p.teamId)
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

  const seasonSegPanel = (
      <CardPanel>
        <SectionLabel>{currentSeason.year}シーズン 区間賞スタッツ</SectionLabel>
        {topSeasonSeg.length === 0
          ? <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>レース未実施</div>
          : topSeasonSeg.map(({ p, wins }, i) => <RankRow key={p.id} p={p} i={i} value={wins} unit="回" />)
        }
      </CardPanel>
  )

  const careerSegPanel = (
      <CardPanel>
        <SectionLabel>通算JPEL区間賞ランキング</SectionLabel>
        {topSegWins.length === 0
          ? <div style={{ fontFamily: SAIRA, fontSize: '12px', color: C.textGhost }}>記録なし</div>
          : topSegWins.map((p, i) => <RankRow key={p.id} p={p} i={i} value={jpelSegWinMap[p.id] ?? 0} unit="回" />)
        }
      </CardPanel>
  )

  // 受賞者がまだ誰もいない間はタブ自体を出さない（空のページを見せない）
  const mvpPanel = topMVP.length > 0 ? (
        <CardPanel>
          <SectionLabel>MVP受賞ランキング</SectionLabel>
          {topMVP.map((p, i) => <RankRow key={p.id} p={p} i={i} value={p.career.mvpAwards} unit="回" />)}
        </CardPanel>
  ) : null

  return <SectionSwitcher sections={[
    { label: '今季区間賞', node: seasonSegPanel },
    { label: '通算区間賞', node: careerSegPanel },
    ...(mvpPanel ? [{ label: 'MVP', node: mvpPanel }] : []),
  ]} />
}

function GmCareerTab({ gmRep, pastSeasons, currentSeason, playerTeamId, teams, players, gmTenures }: {
  gmRep: number
  pastSeasons: GameStore['pastSeasons']
  currentSeason: GameStore['currentSeason']
  playerTeamId: string
  teams: GameStore['teams']
  growthReport: GameStore['growthReport']
  players: GameStore['players']
  gmTenures: GameStore['gmTenures']
}) {
  const allSeasons = [...pastSeasons, ...(currentSeason.currentRaceIndex > 0 ? [currentSeason] : [])]
  // 監督は別のチームへ移れる。順位も優勝も「その年に指揮していたチーム」で引かないと、
  // 移った瞬間に前のチームの実績が消えて移籍先の過去が自分の成績になる（utils/gmTenure.ts）
  const tenures = normalizeTenures(gmTenures, playerTeamId, allSeasons[0]?.year ?? currentSeason.year)
  const teamIdAt = makeTeamIdAt(tenures, playerTeamId)
  const rankIn = (s: SeasonStandingsLike<SeasonStanding>, teamId: string): number | null => {
    const r = rankOfTeam(seasonDivisionStandings(s, teamId), teamId)
    return r > 0 ? r : null
  }
  // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す
  const championships = pastSeasons.filter(s => rankIn(s, teamIdAt(s.year)) === 1).length
  const totalSeasons = allSeasons.length
  const bestRank = allSeasons.length > 0
    ? Math.min(...allSeasons.map(s => rankIn(s, teamIdAt(s.year)) ?? 99))
    : 99

  const repColor = gmRep >= 70 ? C.green : gmRep >= 40 ? C.gold : C.red
  const repLabel = gmRep >= 80 ? '名GMの称号' : gmRep >= 60 ? '優秀なGM' : gmRep >= 40 ? '一般的なGM' : '改善が必要'

  const repPanel = (
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
  )

  const statsPanel = (
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
  )

  const rankTrend = allSeasons.length > 0 && (() => {
        // 直近10季の順位を折れ線で表示（1位が上）
        const chartSeasons = allSeasons.slice(-10)
        const pts = chartSeasons.map(s => {
          const sorted = seasonDivisionStandings(s, teamIdAt(s.year))
          return { year: s.year, rank: rankIn(s, teamIdAt(s.year)), totalTeams: sorted.length || 10, isCurrent: s.year === currentSeason.year }
        })
        const maxTeams = Math.max(8, ...pts.map(p => p.totalTeams))
        const n = pts.length
        const xFor = (i: number) => n <= 1 ? 50 : (i / (n - 1)) * 100
        const yFor = (rank: number) => 12 + ((rank - 1) / Math.max(1, maxTeams - 1)) * 74
        const rankCol = (rank: number) => rank === 1 ? C.gold : rank <= 3 ? C.green : rank <= 5 ? C.blue : C.textGhost
        const linePts = pts.map((p, i) => p.rank != null ? `${xFor(i)},${yFor(p.rank)}` : null).filter((x): x is string => x != null).join(' ')
        return (
          <CardPanel>
            <SectionLabel>シーズン別順位推移（直近{n}季）</SectionLabel>
            <div style={{ position: 'relative', height: '138px', margin: '6px 4px 4px' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                <line x1="0" y1={yFor(1)} x2="100" y2={yFor(1)} stroke={alpha(C.gold, 0.28)} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
                {linePts && <polyline points={linePts} fill="none" stroke={C.gold} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
              </svg>
              {pts.map((p, i) => p.rank != null ? (
                <div key={p.year} style={{ position: 'absolute', left: `${xFor(i)}%`, top: `${yFor(p.rank)}%`, transform: 'translate(-50%,-50%)', pointerEvents: 'none' }}>
                  <div style={{ position: 'absolute', left: '50%', bottom: '9px', transform: 'translateX(-50%)', fontFamily: SAIRA, fontSize: '9px', fontWeight: 900, color: rankCol(p.rank), textShadow: p.rank <= 3 ? `0 0 5px ${alpha(rankCol(p.rank), 0.6)}` : 'none' }}>{p.rank}</div>
                  <div style={{ width: p.isCurrent ? '11px' : '9px', height: p.isCurrent ? '11px' : '9px', borderRadius: '50%', background: rankCol(p.rank), border: `2px solid ${C.bg}`, boxShadow: `0 0 0 1.5px ${rankCol(p.rank)}` }} />
                </div>
              ) : null)}
              {pts.map((p, i) => (
                <div key={'yr' + p.year} style={{ position: 'absolute', left: `${xFor(i)}%`, bottom: '-4px', transform: 'translateX(-50%)', fontFamily: SAIRA, fontSize: '8px', color: p.isCurrent ? C.gold : C.textGhost, fontWeight: p.isCurrent ? 700 : 400 }}>'{String(p.year).slice(2)}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
              {([[C.gold, '1位'], [C.green, '2-3位'], [C.blue, '4-5位'], [C.textGhost, '6位以下']] as [string, string][]).map(([col, label]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: col }}/>
                  <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim }}>{label}</span>
                </div>
              ))}
            </div>
          </CardPanel>
        )
      })()

  const ovrTrend = (() => {
        const myPlayers = players.filter(p => p.teamId === playerTeamId)
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
      })()

  const totalsPanel = (() => {
        // 通算成績（自チームの全シーズン駅伝結果を集計）
        let totalRaces = 0, totalWins = 0, podiums = 0, totalPts = 0
        for (const s of allSeasons) {
          const my = standingRowOf(s, teamIdAt(s.year))
          if (!my) continue
          totalPts += my.totalPoints ?? 0
          for (const rr of (my.raceResults ?? [])) {
            totalRaces += 1
            if (rr.rank === 1) totalWins += 1
            if (rr.rank <= 3) podiums += 1
          }
        }
        const winRate = totalRaces > 0 ? Math.round((totalWins / totalRaces) * 100) : 0
        const tiles: { label: string; value: string; sub: string; color: string }[] = [
          { label: '通算レース', value: `${totalRaces}`, sub: '戦', color: C.textSub },
          { label: '通算勝利', value: `${totalWins}`, sub: '勝', color: totalWins > 0 ? C.gold : C.textDim },
          { label: '表彰台', value: `${podiums}`, sub: '回', color: podiums > 0 ? C.green : C.textDim },
        ]
        return (
          <CardPanel>
            <SectionLabel>通算成績</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {tiles.map(t => (
                <div key={t.label} style={{ padding: '10px 8px', borderRadius: '10px', background: C.surface, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textDim, marginBottom: '4px' }}>{t.label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
                    <span style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: t.color, lineHeight: 1, textShadow: t.color !== C.textDim && t.color !== C.textSub ? `0 0 8px ${alpha(t.color, 0.4)}` : 'none' }}>{t.value}</span>
                    <span style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim }}>{t.sub}</span>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
                <span style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim }}>勝率</span>
                <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: C.gold }}>{winRate}<span style={{ fontSize: '9px', color: C.textDim }}>%</span></span>
              </div>
              <div style={{ height: '7px', background: C.surface, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${winRate}%`, background: `linear-gradient(90deg, ${alpha(C.gold, 0.55)}, ${C.gold})`, borderRadius: '4px' }}/>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim, marginTop: '8px', textAlign: 'right' }}>通算獲得ポイント {totalPts}pt</div>
            </div>
          </CardPanel>
        )
      })()

  // 在任履歴。チームを移った監督だけに意味があるので、1チームしか指揮していない間は出さない。
  const tenurePanel = tenures.length > 1 ? (
      <CardPanel>
        <SectionLabel>在任履歴</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {[...tenures].reverse().map(t => {
            const team = teams.find(x => x.id === t.teamId)
            const inTenure = allSeasons.filter(s => s.year >= t.fromYear && (t.toYear == null || s.year <= t.toYear))
            const ranks = inTenure.map(s => rankIn(s, t.teamId)).filter((r): r is number => r != null)
            const titles = inTenure.filter(s => s.year !== currentSeason.year && rankIn(s, t.teamId) === 1).length
            const best = ranks.length > 0 ? Math.min(...ranks) : null
            const isNow = t.toYear == null
            return (
              <div key={`${t.teamId}-${t.fromYear}`} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 0', borderBottom: `1px solid ${C.border}`,
              }}>
                {team && <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={18} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '700', color: isNow ? C.gold : C.textSub, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {team?.name ?? '不明なチーム'}
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim, marginTop: '2px' }}>
                    {t.fromYear}〜{t.toYear ?? '現在'}（{inTenure.length}季）
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SAIRA, fontSize: '11px', color: titles > 0 ? C.gold : C.textDim, fontWeight: titles > 0 ? '900' : '400' }}>
                    優勝{titles}回
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.textDim, marginTop: '2px' }}>
                    最高{best != null ? `${best}位` : '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardPanel>
  ) : null

  // 順位の折れ線とOVRの棒グラフは両方「推移」なので1枚にまとめる。
  // どちらも出せない（1季目など）ときはタブ自体を出さない。
  const trendPanel = (rankTrend || ovrTrend) ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{rankTrend}{ovrTrend}</div>
  ) : null

  return <SectionSwitcher sections={[
    { label: 'GM評判', node: repPanel },
    { label: 'キャリア統計', node: statsPanel },
    ...(tenurePanel ? [{ label: '在任履歴', node: tenurePanel }] : []),
    ...(trendPanel ? [{ label: '推移', node: trendPanel }] : []),
    { label: '通算成績', node: totalsPanel },
  ]} />
}
