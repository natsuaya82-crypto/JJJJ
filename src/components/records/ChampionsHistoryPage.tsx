import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import type { Race } from '../../types'
import { formatRaceTime } from '../../utils/eventTime'
import { TeamLogoSVG } from '../icons/Icons'
import PlayerFace from '../player/PlayerFace'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type Category = 'jpel' | 'ecl' | 'reserve' | 'tt'
const OVERALL = '__overall__'   // 総合優勝を表す特別なraceName
type RaceRef = { year: number; race: Race }
type DistKey = 'd5000' | 'd10000' | 'half' | 'marathon'

const CAT_LABEL: Record<Category, string> = { jpel: 'JPEL', ecl: 'ECL', reserve: 'リザーブ駅伝', tt: '記録会' }
const CAT_COLOR: Record<Category, string> = { jpel: '#C9A84C', ecl: '#2ECC71', reserve: '#AB8ED6', tt: '#4FC3F7' }
const GOLD = '#FFD700'
const DIST_LABEL: Record<DistKey, string> = { d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン' }
const DIST_KEYS: DistKey[] = ['d5000', 'd10000', 'half', 'marathon']
const DIST_TO_KEY: Record<number, DistKey> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }

// 大会別の歴代記録。カテゴリ → 大会 → 年度 → 順位表 → チームの区間配置、とドリルダウンで見る
export default function ChampionsHistoryPage() {
  const navigate = useNavigate()
  const { teams, players, currentSeason, pastSeasons, foreignLeagues, playerTeamId, openPlayerSheet, eventSeasonTops, worldRecords, japanRecords } = useGameStore()

  // 記録パッチは選手ではなく「記録そのもの」に付ける：その走りのタイムが現行の世界/日本記録である行だけに出す
  const recordBadge = (dist: DistKey, playerId: string, timeSec: number) => {
    const wr = worldRecords?.[dist]
    if (wr && wr.playerId === playerId && wr.timeSec === timeSec) return { label: '世界記録', color: '#FF5C8A' }
    const jr = japanRecords?.[dist]
    if (jr && jr.playerId === playerId && jr.timeSec === timeSec) return { label: '日本記録', color: '#F5C842' }
    return null
  }

  const [cat, setCat] = useState<Category | null>(null)
  const [raceName, setRaceName] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [ttDist, setTtDist] = useState<DistKey | null>(null)

  // 長押しで選手詳細
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lp = (pid: string) => ({
    onPointerDown: () => { timer.current = setTimeout(() => openPlayerSheet(pid), 450) },
    onPointerUp: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerLeave: () => { if (timer.current) clearTimeout(timer.current) },
    onPointerMove: () => { if (timer.current) clearTimeout(timer.current) },
  })

  // カテゴリ別：大会名 → 開催一覧（結果のある年だけ・年昇順）
  const byCategory = useMemo(() => {
    const maps: Record<Category, Map<string, RaceRef[]>> = { jpel: new Map(), ecl: new Map(), reserve: new Map(), tt: new Map() }
    const add = (c: Category, races: Race[] | undefined, y: number) => {
      for (const r of races ?? []) {
        if (!r.results) continue
        if (!maps[c].has(r.name)) maps[c].set(r.name, [])
        maps[c].get(r.name)!.push({ year: y, race: r })
      }
    }
    for (const ps of pastSeasons) {
      add('jpel', ps.races, ps.year)
      add('reserve', ps.secondTeamRaces, ps.year)
      add('ecl', [...(ps.eclSeries?.races ?? []), ...(ps.eclRace ? [ps.eclRace] : [])], ps.year)
    }
    add('jpel', currentSeason.races, currentSeason.year)
    add('reserve', currentSeason.secondTeamRaces, currentSeason.year)
    add('ecl', [...(currentSeason.eclSeries?.races ?? []), ...(currentSeason.eclRace ? [currentSeason.eclRace] : [])], currentSeason.year)
    for (const m of Object.values(maps)) for (const rows of m.values()) rows.sort((a, b) => a.year - b.year)
    return maps
  }, [pastSeasons, currentSeason])

  const resolveClub = (tid: string) =>
    teams.find(t => t.id === tid)
    ?? (foreignLeagues ?? []).flatMap(l => l.clubs).find(c => c.id === tid)

  // カテゴリ別・シーズン別の年間総合順位（正規化）。jpel/reserve=勝点、ecl=EclStandingのpoints。
  type OverallRow = { rank: number; teamId: string; name: string; colors?: { primary: string; secondary: string }; score: number; isMe: boolean }
  const overallStandingsFor = (c: Category, ps: typeof pastSeasons[number]): OverallRow[] => {
    const mk = (teamId: string, i: number, score: number) => {
      const t = resolveClub(teamId)
      return { rank: i + 1, teamId, name: t?.name ?? '—', colors: t?.colors, score, isMe: teamId === playerTeamId }
    }
    if (c === 'jpel') return [...(ps.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints).map((s, i) => mk(s.teamId, i, s.totalPoints))
    if (c === 'reserve') return [...(ps.secondTeamStandings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints).map((s, i) => mk(s.teamId, i, s.totalPoints))
    if (c === 'ecl') {
      const es = ps.eclSeries
      if (!es) return []
      return [...es.participants].sort((a, b) => (es.points[b.id] ?? 0) - (es.points[a.id] ?? 0))
        .map((p, i) => ({ rank: i + 1, teamId: p.id, name: p.name, colors: p.colors, score: es.points[p.id] ?? 0, isMe: p.isPlayerTeam }))
    }
    return []
  }
  // 総合優勝の年度一覧（各年の1位）。新しい年が上。
  const overallChampYears = (c: Category) =>
    [...pastSeasons].reverse().map(ps => ({ year: ps.year, champ: overallStandingsFor(c, ps)[0] as OverallRow | undefined }))
      .filter((x): x is { year: number; champ: OverallRow } => !!x.champ)

  // 記録会：種目 → シーズン別トップ3（過去分はendSeasonで軽量保存、今季分はその場で集計）
  const ttByDist = useMemo(() => {
    const map = new Map<DistKey, { year: number; top: { playerId: string; playerName: string; teamId: string; timeSec: number }[] }[]>()
    for (const e of eventSeasonTops ?? []) {
      if (!map.has(e.dist)) map.set(e.dist, [])
      map.get(e.dist)!.push({ year: e.year, top: e.top })
    }
    // 今季分：開催済みの記録会結果から種目ごと選手ベスト→トップ3
    const cur = new Map<DistKey, Map<string, { playerId: string; teamId: string; timeSec: number }>>()
    for (const ev of currentSeason.individualEvents ?? []) {
      const key = DIST_TO_KEY[ev.distance]
      if (!key || !ev.results) continue
      if (!cur.has(key)) cur.set(key, new Map())
      const best = cur.get(key)!
      for (const r of ev.results) {
        const c = best.get(r.playerId)
        if (!c || r.timeSec < c.timeSec) best.set(r.playerId, { playerId: r.playerId, teamId: r.teamId, timeSec: r.timeSec })
      }
    }
    for (const [dist, best] of cur) {
      const top = [...best.values()].sort((a, b) => a.timeSec - b.timeSec).slice(0, 10)
        .map(e => ({ ...e, playerName: players.find(p => p.id === e.playerId)?.name ?? '' }))
      if (top.length === 0) continue
      if (!map.has(dist)) map.set(dist, [])
      map.get(dist)!.push({ year: currentSeason.year, top })
    }
    for (const rows of map.values()) rows.sort((a, b) => b.year - a.year)
    return map
  }, [eventSeasonTops, currentSeason, players])

  const raceEntries = cat && cat !== 'tt' && raceName ? (byCategory[cat].get(raceName) ?? []) : []
  const currentEntry = year != null ? raceEntries.find(e => e.year === year) ?? null : null

  // 記録会結果にはドラフト候補（players未登録）が混ざることがあるため、両方から解決する
  const resolvePlayer = (pid: string) =>
    players.find(p => p.id === pid) ?? (currentSeason.scoutProspects ?? []).find(p => p.id === pid)

  // 1画面固定ビュー：区間配置と記録会のシーズン記録はスクロール不可にする
  const lockScreen = teamId != null || (cat === 'tt' && ttDist != null && year != null)
  useEffect(() => {
    if (lockScreen) window.scrollTo({ top: 0 })
  }, [lockScreen])

  const goBack = () => {
    if (teamId != null) return setTeamId(null)
    if (year != null) return setYear(null)
    if (ttDist != null) return setTtDist(null)
    if (raceName != null) return setRaceName(null)
    if (cat != null) return setCat(null)
    navigate(-1)
  }

  const accent = cat ? CAT_COLOR[cat] : C.gold

  return (
    <div style={{
      fontFamily: SAIRA, background: C.bg, color: C.text,
      // 固定ビューはカード選択画面と同じ方式（absoluteで画面を埋めてoverflow hidden）でスクロール不可にする
      ...(lockScreen
        ? { position: 'absolute' as const, inset: 0, overflow: 'hidden' }
        : { minHeight: '100dvh', paddingBottom: '80px' }),
    }}>
      {/* ヘッダー（戻る＋タイトル）は上部固定でスクロールに追従しない。区間配置ビューでは補足行を省く */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg }}>
        <div style={{ padding: '8px 16px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <BackButton onClick={goBack} />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900' }}>RECORDS</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900' }}>歴代優勝</div>
          </div>
        </div>
        {!lockScreen && (
          <div style={{ fontSize: '11px', color: C.textDim, padding: '4px 16px 10px' }}>
            {raceName === OVERALL ? (year != null ? `${year}年 ${cat ? CAT_LABEL[cat] : ''} 総合順位` : `${cat ? CAT_LABEL[cat] : ''} 総合優勝`)
              : cat === 'tt'
              ? (ttDist != null ? `${DIST_LABEL[ttDist]} — 年度を選択` : '記録会 — 種目を選択')
              : year != null ? `${year}年 ${raceName} — 順位表`
              : raceName != null ? `${raceName} — 年度を選択`
              : cat != null ? `${CAT_LABEL[cat]} — 大会を選択`
              : 'カテゴリを選択'}
          </div>
        )}
      </div>

      {/* Level 0: カテゴリ（横長ボタンを縦に並べる。見た目は歴代ドラフト等の一覧ボタンと同じ） */}
      {cat == null && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['jpel', 'ecl', 'reserve', 'tt'] as Category[]).map(c => (
            <button key={c} onClick={() => setCat(c)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
              padding: '14px 16px', borderRadius: 12,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.border2}`, color: C.text,
              boxShadow: '0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.06)',
              fontFamily: SAIRA,
            }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: CAT_COLOR[c], flex: 1 }}>{CAT_LABEL[c]}</span>
              <span style={{ color: C.textGhost, fontSize: 18 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* 総合優勝: 年度別の年間王者一覧（年度タップでその年の総合順位表へ） */}
      {cat != null && cat !== 'tt' && raceName === OVERALL && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: GOLD, paddingLeft: 2, marginBottom: 2 }}>{CAT_LABEL[cat]} 総合優勝</div>
          {overallChampYears(cat).length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '30px 0' }}>まだ記録がありません</div>
          ) : overallChampYears(cat).map(({ year: y, champ }) => (
            <button key={y} onClick={() => setYear(y)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer', textAlign: 'left',
              padding: '12px 14px', borderRadius: 12,
              background: champ.isMe ? `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${champ.isMe ? alpha(C.gold, 0.5) : C.border2}`, color: C.text,
              boxShadow: '0 3px 0 rgba(0,0,0,0.45)', fontFamily: SAIRA,
            }}>
              <span style={{ fontSize: 17, fontWeight: 900, color: GOLD }}>{y}</span>
              {champ.colors && <TeamLogoSVG primary={champ.colors.primary} secondary={champ.colors.secondary} shortName={champ.name} teamId={champ.teamId} size={24} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: champ.isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champ.name}</div>
                <div style={{ fontSize: 8, color: C.textGhost }}>年間総合優勝</div>
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.textSub }}>{champ.score}pt</span>
              <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* 総合優勝: その年の総合順位表（全チーム） */}
      {cat != null && cat !== 'tt' && raceName === OVERALL && year != null && (() => {
        const ps = pastSeasons.find(p => p.year === year)
        const rows = ps ? overallStandingsFor(cat, ps) : []
        return (
          <div style={{ padding: '0 14px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: GOLD, paddingLeft: 2, marginBottom: 8 }}>{year}年 {CAT_LABEL[cat]} 総合順位</div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {rows.map((r, i, arr) => (
                <div key={r.teamId} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px',
                  background: r.isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, width: 22, textAlign: 'center', color: r.rank === 1 ? C.gold : r.rank <= 3 ? C.textSub : C.textGhost }}>{r.rank}</span>
                  {r.colors && <TeamLogoSVG primary={r.colors.primary} secondary={r.colors.secondary} shortName={r.name} teamId={r.teamId} size={20} />}
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: r.isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: r.rank === 1 ? C.gold : C.textSub }}>{r.score}pt</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Level 1: 大会一覧（先頭に総合優勝） */}
      {cat != null && cat !== 'tt' && raceName == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setRaceName(OVERALL)} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
            padding: '14px 16px', borderRadius: 12,
            background: `linear-gradient(180deg, ${alpha(GOLD, 0.18)}, ${C.surface2})`,
            border: `2px solid ${alpha(GOLD, 0.5)}`, color: C.text,
            boxShadow: '0 3px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)', fontFamily: SAIRA,
          }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: GOLD, flex: 1 }}>総合優勝（年間王者）</span>
            <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
          </button>
          {byCategory[cat].size === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '30px 0' }}>まだ大会結果がありません</div>
          ) : [...byCategory[cat].entries()].map(([name, rows]) => (
            <button key={name} onClick={() => setRaceName(name)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
              padding: '14px 16px', borderRadius: 12,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              border: `2px solid ${C.border2}`, color: C.text,
              boxShadow: '0 3px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
              fontFamily: SAIRA,
            }}>
              <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{name}</span>
              <span style={{ fontSize: 10, color: C.textDim, padding: '2px 8px', borderRadius: 10, background: alpha(accent, 0.12) }}>{rows.length}回開催</span>
              <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* 記録会 Level 1: 種目一覧 */}
      {cat === 'tt' && ttDist == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {DIST_KEYS.map(d => {
            const rows = ttByDist.get(d) ?? []
            return (
              <button key={d} onClick={() => setTtDist(d)} style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
                padding: '14px 16px', borderRadius: 12,
                background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${C.border2}`, color: C.text,
                boxShadow: '0 3px 0 rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
                fontFamily: SAIRA,
              }}>
                <span style={{ fontSize: 14, fontWeight: 800, flex: 1 }}>{DIST_LABEL[d]}</span>
                <span style={{ fontSize: 10, color: C.textDim, padding: '2px 8px', borderRadius: 10, background: alpha(CAT_COLOR.tt, 0.12) }}>{rows.length}シーズン</span>
                <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 記録会 Level 2: 年度一覧（その年の1位付き） */}
      {cat === 'tt' && ttDist != null && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: CAT_COLOR.tt, paddingLeft: 2, marginBottom: 2 }}>{DIST_LABEL[ttDist]}</div>
          {(ttByDist.get(ttDist) ?? []).length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: 13, padding: '30px 0' }}>まだ記録がありません</div>
          ) : (ttByDist.get(ttDist) ?? []).map(({ year: y, top }) => {
            const first = top[0]
            const t = first ? resolveClub(first.teamId) : undefined
            const isMe = first?.teamId === playerTeamId
            return (
              <button key={y} onClick={() => setYear(y)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer', textAlign: 'left',
                padding: '12px 14px', borderRadius: 12,
                background: isMe ? `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${isMe ? alpha(C.gold, 0.5) : C.border2}`, color: C.text,
                boxShadow: '0 3px 0 rgba(0,0,0,0.45)',
                fontFamily: SAIRA,
              }}>
                <span style={{ fontSize: 17, fontWeight: 900, color: CAT_COLOR.tt }}>{y}</span>
                {first && (
                  <div style={{ width: 26, height: 26, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                    <PlayerFace playerId={first.playerId} nationality={resolvePlayer(first.playerId)?.nationality ?? 'JPN'} size={26} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first ? (first.playerName || resolvePlayer(first.playerId)?.name || '—') : '—'}</span>
                    {first && (() => {
                      const rb = recordBadge(ttDist, first.playerId, first.timeSec)
                      return rb ? <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 4, flexShrink: 0, color: rb.color, background: alpha(rb.color, 0.14), border: `1px solid ${alpha(rb.color, 0.45)}` }}>{rb.label}</span> : null
                    })()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                    {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={12} />}
                    <span style={{ fontSize: 8, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? (first ? resolvePlayer(first.playerId)?.origin ?? '' : '')}</span>
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.textSub }}>{first ? formatRaceTime(first.timeSec) : ''}</span>
                <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 記録会 Level 3: その年のシーズン記録（トップ10・1画面固定） */}
      {cat === 'tt' && ttDist != null && year != null && (
        <div style={{ padding: '0 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: CAT_COLOR.tt, paddingLeft: 2, marginBottom: 6 }}>{year}年 {DIST_LABEL[ttDist]}</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {((ttByDist.get(ttDist) ?? []).find(r => r.year === year)?.top ?? []).map((e, i, arr) => {
              const t = resolveClub(e.teamId)
              const pl = resolvePlayer(e.playerId)
              const isMe = e.teamId === playerTeamId
              return (
                <div key={e.playerId} {...(pl ? lp(pl.id) : {})} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px',
                  background: isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: pl ? 'pointer' : 'default',
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, width: 22, textAlign: 'center', color: i === 0 ? C.gold : i < 3 ? C.textSub : C.textGhost }}>{i + 1}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
                    <PlayerFace playerId={e.playerId} nationality={pl?.nationality ?? 'JPN'} size={28} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.playerName || pl?.name || '—'}</span>
                      {(() => {
                        const rb = recordBadge(ttDist, e.playerId, e.timeSec)
                        return rb ? <span style={{ fontSize: 8, fontWeight: 900, padding: '1px 5px', borderRadius: 4, flexShrink: 0, color: rb.color, background: alpha(rb.color, 0.14), border: `1px solid ${alpha(rb.color, 0.45)}` }}>{rb.label}</span> : null
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={12} />}
                      <span style={{ fontSize: 8, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? pl?.origin ?? ''}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: i === 0 ? C.gold : C.textSub }}>{formatRaceTime(e.timeSec)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Level 2: 年度一覧（優勝チーム付き） */}
      {cat != null && cat !== 'tt' && raceName != null && raceName !== OVERALL && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: accent, paddingLeft: 2, marginBottom: 2 }}>{raceName}</div>
          {[...raceEntries].reverse().map(({ year: y, race }) => {
            const top = race.results!.teamRankings.find(tr => tr.rank === 1) ?? race.results!.teamRankings[0]
            const t = top ? resolveClub(top.teamId) : undefined
            const isMe = top?.teamId === playerTeamId
            return (
              <button key={y} onClick={() => setYear(y)} style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer', textAlign: 'left',
                padding: '12px 14px', borderRadius: 12,
                background: isMe ? `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${C.surface2})` : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                border: `2px solid ${isMe ? alpha(C.gold, 0.5) : C.border2}`, color: C.text,
                boxShadow: '0 3px 0 rgba(0,0,0,0.45)',
                fontFamily: SAIRA,
              }}>
                <span style={{ fontSize: 17, fontWeight: 900, color: accent }}>{y}</span>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={22} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</div>
                  <div style={{ fontSize: 8, color: C.textGhost }}>優勝</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.textSub }}>{top ? formatRaceTime(top.totalTimeSec) : ''}</span>
                <span style={{ color: C.textGhost, fontSize: 16 }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Level 3: 順位表（チームをタップで区間配置へ） */}
      {currentEntry && teamId == null && year != null && (
        <div style={{ padding: '0 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: accent, paddingLeft: 2, marginBottom: 8 }}>{year}年 {raceName}</div>
          <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {[...currentEntry.race.results!.teamRankings].sort((a, b) => a.rank - b.rank).map((tr, i, arr) => {
              const t = resolveClub(tr.teamId)
              const isMe = tr.teamId === playerTeamId
              const diff = tr.totalTimeSec - arr[0].totalTimeSec
              return (
                <button key={tr.teamId} onClick={() => setTeamId(tr.teamId)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', width: '100%', cursor: 'pointer', textAlign: 'left',
                  background: isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  color: C.text, fontFamily: SAIRA,
                }}>
                  <span style={{ fontSize: 14, fontWeight: 900, width: 22, textAlign: 'center', color: tr.rank === 1 ? C.gold : tr.rank <= 3 ? C.textSub : C.textGhost }}>{tr.rank}</span>
                  {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20} />}
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: tr.rank === 1 ? C.gold : C.textSub }}>
                    {tr.rank === 1 ? formatRaceTime(tr.totalTimeSec) : `+${formatRaceTime(diff)}`}
                  </span>
                  <span style={{ color: C.textGhost, fontSize: 14 }}>›</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Level 4: チームの区間配置とタイム（選手は顔付き・長押しで詳細） */}
      {currentEntry && teamId != null && (() => {
        const t = resolveClub(teamId)
        const results = currentEntry.race.results!
        const myRanking = results.teamRankings.find(tr => tr.teamId === teamId)
        const segs = [...currentEntry.race.segments].sort((a, b) => a.index - b.index)
        return (
          <div style={{ padding: '0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '12px 14px', borderRadius: 12, background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.border2}` }}>
              {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={34} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{year}年 {raceName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: myRanking?.rank === 1 ? C.gold : C.textSub }}>{myRanking?.rank ?? '—'}<span style={{ fontSize: 9, color: C.textGhost }}>位</span></div>
                <div style={{ fontSize: 10, color: C.textDim }}>{myRanking ? formatRaceTime(myRanking.totalTimeSec) : ''}</div>
              </div>
            </div>
            <div style={{ borderRadius: 12, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {segs.map((seg, i) => {
                const sr = results.segmentResults.find(s => s.segmentIndex === seg.index)
                const runner = sr?.runners.find(r => r.teamId === teamId)
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
                      <div style={{ fontSize: 12, fontWeight: 900, color: C.textSub }}>{seg.index}区</div>
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
                    <span style={{ fontSize: 10, fontWeight: 800, color: isSegWin ? C.gold : C.textDim, flexShrink: 0 }}>区間{runner?.rank ?? '—'}位</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: isSegWin ? C.gold : C.textSub, flexShrink: 0 }}>{runner ? formatRaceTime(runner.timeSec) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
