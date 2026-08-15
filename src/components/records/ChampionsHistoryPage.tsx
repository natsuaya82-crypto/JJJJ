import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import { compareTitles, teamHistoriesOf, titleRows } from '../../utils/teamHistory'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { makeTeamIdAt } from '../../utils/gmTenure'
import type { Division, Race } from '../../types'
import { formatRaceTime } from '../../utils/eventTime'
import { playerLabel } from '../../utils/playerUtils'
import { TeamLogoSVG } from '../icons/Icons'
import Flag from '../ui/Flag'
import { NAT_LABEL } from '../../data/nationalities'
import type { Nationality } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { C, alpha, DIV_STAR, glassStyle, SAIRA, F } from '../../styles/tokens'
import { DIVISION_LABEL, rankedStandings, seasonDivisionStandings } from '../../utils/league'
import GlassButton from '../ui/GlassButton'
import { panelStyle } from '../ui/Panel'


type Category = 'jpel' | 'ecl' | 'waqual' | 'wamain' | 'reserve' | 'tt'
const OVERALL = '__overall__'   // 総合優勝を表す特別なraceName
type RaceRef = { year: number; race: Race }
type DistKey = 'd5000' | 'd10000' | 'half' | 'marathon'

const CAT_LABEL: Record<Category, string> = { jpel: 'JPEL', ecl: 'ECL', waqual: 'アジア予選', wamain: '世界選手権', reserve: 'リザーブ駅伝', tt: '記録会' }
// 各大会の確立カラーに合わせる（JPEL=金 / ECL=赤 / アジア予選=ピンク / 世界選手権=紫 / リザーブ=青 / 記録会=緑）
const CAT_COLOR: Record<Category, string> = { jpel: '#f5c842', ecl: '#ff4757', waqual: '#EC407A', wamain: '#A855F7', reserve: '#7986CB', tt: '#2ecc71' }
const GOLD = '#FFD700'
const DIST_LABEL: Record<DistKey, string> = { d5000: '5000m', d10000: '10000m', half: 'ハーフ', marathon: 'マラソン' }
const DIST_KEYS: DistKey[] = ['d5000', 'd10000', 'half', 'marathon']
const DIST_TO_KEY: Record<number, DistKey> = { 5000: 'd5000', 10000: 'd10000', 21097: 'half', 42195: 'marathon' }

// ドリルダウンの行（年を選ぶ・大会を選ぶ・種目を選ぶ）の見た目。**この画面の11か所が全部これ。**
// 以前は同じ塊（枠2px＋下に3pxの影＋グラデーション）が11か所に写してあり、飴玉の影をやめたときに
// この画面だけ取り残された。押すものはガラス（`glassStyle`）で、色は大会の色をそのまま渡す。
//   hl … その年が自分（または日本）だったときの強調。金のガラスにする
//   wide … 大会・種目を選ぶ行（年の行より少し広い）
function rowStyle(hl = false, wide = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: wide ? 12 : 10, width: '100%',
    cursor: 'pointer', textAlign: 'left', padding: wide ? '14px 16px' : '12px 14px',
    ...glassStyle(hl ? C.gold : C.textSub),
    color: C.text, fontFamily: SAIRA,
  }
}

// 大会別の歴代記録。カテゴリ → 大会 → 年度 → 順位表 → チームの区間配置、とドリルダウンで見る
export default function ChampionsHistoryPage() {
  const navigate = useNavigate()
  const { teams, players, currentSeason, pastSeasons, playerTeamId, gmTenures, openPlayerSheet, eventSeasonTops, worldRecords, japanRecords, removedPlayers } = useGameStore()
  // 監督は別のチームへ移れる。過去の年の「自チーム」印は、その年に指揮していたチームで付ける。
  // 今のチームで付けると、自分で獲った優勝から印が消え、移籍先が前に獲った優勝に印が付く（utils/gmTenure.ts）
  const teamIdAt = makeTeamIdAt(gmTenures, playerTeamId)
  const clubIndex = useClubIndex()

  // 記録パッチは選手ではなく「記録そのもの」に付ける：その走りのタイムが現行の世界/日本記録である行だけに出す。
  // 同タイムの共同保持者（coHolders）にも付く
  const holds = (rec: { playerId: string; timeSec: number; coHolders?: { playerId: string }[] } | undefined, playerId: string, timeSec: number) =>
    !!rec && rec.timeSec === timeSec && (rec.playerId === playerId || (rec.coHolders ?? []).some(c => c.playerId === playerId))
  const recordBadge = (dist: DistKey, playerId: string, timeSec: number) => {
    if (holds(worldRecords?.[dist], playerId, timeSec)) return { label: '世界記録', color: '#FF5C8A' }
    if (holds(japanRecords?.[dist], playerId, timeSec)) return { label: '日本記録', color: '#F5C842' }
    return null
  }

  const [cat, setCat] = useState<Category | null>(null)
  const [raceName, setRaceName] = useState<string | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [ttDist, setTtDist] = useState<DistKey | null>(null)
  // 世界選手権（本線）の種目選択と、アジア予選/駅伝のレース選択
  const [waEvent, setWaEvent] = useState<'d5000' | 'd10000' | 'marathon' | 'ekiden' | null>(null)
  const [waRace, setWaRace] = useState<Race | null>(null)

  const waResults = useGameStore(s => s.worldAthleticsResults) ?? []
  const waQual = useMemo(() => waResults.filter(r => r.kind === 'qualifier').sort((a, b) => b.year - a.year), [waResults])
  const waMain = useMemo(() => waResults.filter(r => r.kind === 'main').sort((a, b) => b.year - a.year), [waResults])
  // 国別対抗（nat_XXX）の見た目：クラブロゴの代わりに国旗＋国名
  const natOfTeamId = (tid: string): Nationality | null => tid.startsWith('nat_') ? tid.slice(4) as Nationality : null
  const natName = (n: Nationality) => NAT_LABEL[n] ?? n

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
    const maps: Record<Category, Map<string, RaceRef[]>> = { jpel: new Map(), ecl: new Map(), waqual: new Map(), wamain: new Map(), reserve: new Map(), tt: new Map() }
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

  const resolveClub = (tid: string) => clubIndex.byId(tid)

  // チーム/クラブの詳細ページへ遷移（国内=teams/detail、海外=teams/foreign）
  const goToTeam = (tid: string) => {
    const path = clubRoutePath(clubIndex.byId(tid))
    if (path) navigate(path)
  }

  // カテゴリ別・シーズン別の年間総合順位（正規化）。jpel/reserve=勝点、ecl=EclStandingのpoints。
  type OverallRow = { rank: number; teamId: string; name: string; colors?: { primary: string; secondary: string }; score: number; isMe: boolean }
  const overallStandingsFor = (c: Category, ps: typeof pastSeasons[number]): OverallRow[] => {
    const mk = (teamId: string, i: number, score: number) => {
      const t = resolveClub(teamId)
      return { rank: i + 1, teamId, name: t?.name ?? '—', colors: t?.colors, score, isMe: teamId === teamIdAt(ps.year) }
    }
    // その年、監督が指揮していたチームの部だけで並べる（部ごとにレース数が違うので混ぜられない）
    if (c === 'jpel') return seasonDivisionStandings(ps, teamIdAt(ps.year)).map((s, i) => mk(s.teamId, i, s.totalPoints))
    if (c === 'reserve') {
      const st = ps.secondTeamStandings ?? []
      // その年リザーブ戦を1度も開催していない（全チームraceResults空）なら総合優勝なし
      if (!st.some(s => (s.raceResults?.length ?? 0) > 0)) return []
      return rankedStandings(st).map((s, i) => mk(s.teamId, i, s.totalPoints))
    }
    if (c === 'ecl') {
      const es = ps.eclSeries
      // ECLシリーズが無い/一度もポイントが動いていない年は総合優勝なし
      if (!es || !es.participants.some(p => (es.points[p.id] ?? 0) > 0)) return []
      return [...es.participants].sort((a, b) => (es.points[b.id] ?? 0) - (es.points[a.id] ?? 0))
        .map((p, i) => ({ rank: i + 1, teamId: p.id, name: p.name, colors: p.colors, score: es.points[p.id] ?? 0, isMe: p.isPlayerTeam }))
    }
    return []
  }
  // 総合優勝の年度一覧（各年の1位）。新しい年が上。
  const overallChampYears = (c: Category) => {
    const seen = new Set<number>()
    return [...pastSeasons].reverse().map(ps => ({ year: ps.year, champ: overallStandingsFor(c, ps)[0] as OverallRow | undefined }))
      .filter((x): x is { year: number; champ: OverallRow } => !!x.champ)
      .filter(x => { if (seen.has(x.year)) return false; seen.add(x.year); return true })   // 同一年の重複を除去
  }

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
    if (waRace != null) return setWaRace(null)
    if (year != null) return setYear(null)
    if (ttDist != null) return setTtDist(null)
    if (waEvent != null) return setWaEvent(null)
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
        <PageHeader eyebrow="RECORDS" title="歴代優勝" onBack={goBack} />
        {!lockScreen && (
          <div style={{ fontSize: F.label, color: C.textDim, padding: '4px 16px 10px' }}>
            {cat === 'waqual' ? (waRace ? `${year}年 順位表` : year != null ? `${year}年 アジア予選 — レースを選択` : 'アジア予選 — 年度を選択')
              : cat === 'wamain' ? (waRace ? `${year}年 順位表`
                : waEvent === 'ekiden' ? (year != null ? `${year}年 駅伝 — レースを選択` : '駅伝 — 年度を選択')
                : waEvent != null ? (year != null ? `${year}年 結果` : '年度を選択')
                : '世界選手権 — 種目を選択')
              : raceName === OVERALL ? (year != null ? `${year}年 ${cat ? CAT_LABEL[cat] : ''} 総合順位` : `${cat ? CAT_LABEL[cat] : ''} 総合優勝`)
              : cat === 'tt'
              ? (ttDist != null ? `${DIST_LABEL[ttDist]} — 年度を選択` : '記録会 — 種目を選択')
              : year != null ? `${year}年 ${raceName} — 順位表`
              : raceName != null ? `${raceName} — 年度を選択`
              : cat != null ? `${CAT_LABEL[cat]} — 大会を選択`
              : 'カテゴリを選択'}
          </div>
        )}
      </div>

      {/* Level 0: リーグ歴代優勝回数ランキング（旧・リーグ記録タブから統合） */}
      {cat == null && (() => {
        // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
        const histories = teamHistoriesOf(pastSeasons)
        // ★**部ごとに分ける**（オーナー・2026-08-12「部ごとです」）。合計で並べると
        //   「3部で4回優勝」が「1部で1回優勝」より上に来る。並べ方は compareTitles 1本
        const champRanking = [...teams]
          .map(t => ({ team: t, titles: histories[t.id]?.titles ?? {} }))
          .filter(c => titleRows(c.titles).length > 0)
          .sort((a, b) => compareTitles(a.titles, b.titles))
        if (champRanking.length === 0) return null
        return (
          <div style={{ padding: '0 16px 12px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 8 }}>JPEL 歴代優勝回数</div>
            <div style={panelStyle(C.gold)}>
              {champRanking.map(({ team, titles }, i, arr) => {
                const isMe = team.id === playerTeamId
                return (
                  <div key={team.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: isMe ? alpha(C.gold, 0.1) : 'transparent',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}>
                    <span style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, width: 20, textAlign: 'center', color: i === 0 ? C.gold : i <= 2 ? C.textSub : C.textGhost, textShadow: i === 0 ? `0 0 6px ${alpha(C.gold, 0.5)}` : 'none' }}>{i + 1}</span>
                    <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={22} />
                    <span style={{ flex: 1, fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</span>
                    {/* ★**部ごとに出す**。1部★2 2部★1 のように、どの部での優勝かが分かる形 */}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {titleRows(titles).map(r => (
                        <div key={r.division} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                          <span style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.textDim }}>{DIVISION_LABEL[r.division]}</span>
                          <span style={{ fontFamily: SAIRA, fontSize: F.bodyLg, color: DIV_STAR[r.division], textShadow: `0 0 5px ${alpha(DIV_STAR[r.division], 0.4)}` }}>★</span>
                          <span style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900, color: DIV_STAR[r.division] }}>{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: 3, fontWeight: 900, margin: '14px 0 2px' }}>大会別の記録</div>
          </div>
        )
      })()}

      {/* Level 0: カテゴリ（横長ボタンを縦に並べる。見た目は歴代ドラフト等の一覧ボタンと同じ） */}
      {cat == null && (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(['jpel', 'ecl', 'waqual', 'wamain', 'reserve', 'tt'] as Category[]).map(c => (
            <GlassButton key={c} full style={{
              justifyContent: 'flex-start', gap: 12, textAlign: 'left',
              padding: '14px 16px', color: C.text, fontFamily: SAIRA,
            }} onClick={() => setCat(c)}>
              <span style={{ fontSize: F.title, fontWeight: 900, color: CAT_COLOR[c], flex: 1 }}>{CAT_LABEL[c]}</span>
              <span style={{ color: C.textGhost, fontSize: F.titleLg }}>›</span>
            </GlassButton>
          ))}
        </div>
      )}

      {/* 総合優勝: 年度別の年間王者一覧（年度タップでその年の総合順位表へ） */}
      {cat != null && cat !== 'tt' && cat !== 'waqual' && cat !== 'wamain' && raceName === OVERALL && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: GOLD, paddingLeft: 2, marginBottom: 2 }}>{CAT_LABEL[cat]} 総合優勝</div>
          {overallChampYears(cat).length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ記録がありません</div>
          ) : overallChampYears(cat).map(({ year: y, champ }) => (
            <button key={y} onClick={() => setYear(y)} style={rowStyle(champ.isMe)}>
              <span style={{ fontSize: F.title, fontWeight: 900, color: GOLD }}>{y}</span>
              {champ.colors && <TeamLogoSVG primary={champ.colors.primary} secondary={champ.colors.secondary} shortName={champ.name} teamId={champ.teamId} size={24} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.bodyLg, fontWeight: 700, color: champ.isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champ.name}</div>
                <div style={{ fontSize: F.micro, color: C.textGhost }}>年間総合優勝</div>
              </div>
              <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{champ.score}pt</span>
              <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* 総合優勝: その年の総合順位表（全チーム） */}
      {cat != null && cat !== 'tt' && cat !== 'waqual' && cat !== 'wamain' && raceName === OVERALL && year != null && (() => {
        const ps = pastSeasons.find(p => p.year === year)
        const rows = ps ? overallStandingsFor(cat, ps) : []
        return (
          <div style={{ padding: '0 14px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: GOLD, paddingLeft: 2, marginBottom: 8 }}>{year}年 {CAT_LABEL[cat]} 総合順位</div>
            <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {rows.map((r, i, arr) => (
                <button key={r.teamId} onClick={() => goToTeam(r.teamId)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', width: '100%', textAlign: 'left', cursor: 'pointer',
                  background: r.isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  color: C.text, fontFamily: SAIRA,
                }}>
                  <span style={{ fontSize: F.sub, fontWeight: 900, width: 22, textAlign: 'center', color: r.rank === 1 ? C.gold : r.rank <= 3 ? C.textSub : C.textGhost }}>{r.rank}</span>
                  {r.colors && <TeamLogoSVG primary={r.colors.primary} secondary={r.colors.secondary} shortName={r.name} teamId={r.teamId} size={20} />}
                  <span style={{ flex: 1, fontSize: F.body, fontWeight: 700, color: r.isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ fontSize: F.label, fontWeight: 800, color: r.rank === 1 ? C.gold : C.textSub }}>{r.score}pt</span>
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Level 1: 大会一覧（先頭に総合優勝） */}
      {cat != null && cat !== 'tt' && cat !== 'waqual' && cat !== 'wamain' && raceName == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => setRaceName(OVERALL)} style={rowStyle(true, true)}>
            <span style={{ fontSize: F.sub, fontWeight: 900, color: GOLD, flex: 1 }}>総合優勝（年間王者）</span>
            <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
          </button>
          {byCategory[cat].size === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ大会結果がありません</div>
          ) : [...byCategory[cat].entries()].map(([name, rows]) => (
            <button key={name} onClick={() => setRaceName(name)} style={rowStyle(false, true)}>
              <span style={{ fontSize: F.sub, fontWeight: 800, flex: 1 }}>{name}</span>
              <span style={{ fontSize: F.caption, color: C.textDim, padding: '2px 8px',background: alpha(accent, 0.12) }}>{rows.length}回開催</span>
              <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
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
              <button key={d} onClick={() => setTtDist(d)} style={rowStyle(false, true)}>
                <span style={{ fontSize: F.sub, fontWeight: 800, flex: 1 }}>{DIST_LABEL[d]}</span>
                <span style={{ fontSize: F.caption, color: C.textDim, padding: '2px 8px',background: alpha(CAT_COLOR.tt, 0.12) }}>{rows.length}シーズン</span>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 記録会 Level 2: 年度一覧（その年の1位付き） */}
      {cat === 'tt' && ttDist != null && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.tt, paddingLeft: 2, marginBottom: 2 }}>{DIST_LABEL[ttDist]}</div>
          {(ttByDist.get(ttDist) ?? []).length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ記録がありません</div>
          ) : (ttByDist.get(ttDist) ?? []).map(({ year: y, top }) => {
            const first = top[0]
            const t = first ? resolveClub(first.teamId) : undefined
            const isMe = first?.teamId === teamIdAt(y)
            return (
              <button key={y} onClick={() => setYear(y)} style={rowStyle(isMe)}>
                <span style={{ fontSize: F.title, fontWeight: 900, color: CAT_COLOR.tt }}>{y}</span>
                {first && (
                  <div style={{ width: 26, height: 26,overflow: 'hidden', flexShrink: 0 }}>
                    <PlayerFace playerId={first.playerId} nationality={resolvePlayer(first.playerId)?.nationality ?? 'JPN'} size={26} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                    <span style={{ fontSize: F.body, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first ? (resolvePlayer(first.playerId)?.name || first.playerName || '—') : '—'}</span>
                    {first && (() => {
                      const rb = recordBadge(ttDist, first.playerId, first.timeSec)
                      return rb ? <span style={{ fontSize: F.micro, fontWeight: 900, padding: '1px 5px',flexShrink: 0, color: rb.color, background: alpha(rb.color, 0.14), border: `1px solid ${alpha(rb.color, 0.45)}` }}>{rb.label}</span> : null
                    })()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                    {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={12} />}
                    <span style={{ fontSize: F.micro, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? (first ? resolvePlayer(first.playerId)?.origin ?? '' : '')}</span>
                  </div>
                </div>
                <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{first ? formatRaceTime(first.timeSec) : ''}</span>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 記録会 Level 3: その年のシーズン記録（トップ10・1画面固定） */}
      {cat === 'tt' && ttDist != null && year != null && (
        <div style={{ padding: '0 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.tt, paddingLeft: 2, marginBottom: 6 }}>{year}年 {DIST_LABEL[ttDist]}</div>
          <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {((ttByDist.get(ttDist) ?? []).find(r => r.year === year)?.top ?? []).map((e, i, arr) => {
              const t = resolveClub(e.teamId)
              const pl = resolvePlayer(e.playerId)
              const isMe = year != null && e.teamId === teamIdAt(year)
              return (
                <div key={e.playerId} {...(pl ? lp(pl.id) : {})} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px',
                  background: isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  cursor: pl ? 'pointer' : 'default',
                }}>
                  <span style={{ fontSize: F.sub, fontWeight: 900, width: 22, textAlign: 'center', color: i === 0 ? C.gold : i < 3 ? C.textSub : C.textGhost }}>{i + 1}</span>
                  <div style={{ width: 28, height: 28,overflow: 'hidden', flexShrink: 0 }}>
                    <PlayerFace playerId={e.playerId} nationality={pl?.nationality ?? 'JPN'} size={28} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                      <span style={{ fontSize: F.body, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name || e.playerName || '—'}</span>
                      {(() => {
                        const rb = recordBadge(ttDist, e.playerId, e.timeSec)
                        return rb ? <span style={{ fontSize: F.micro, fontWeight: 900, padding: '1px 5px',flexShrink: 0, color: rb.color, background: alpha(rb.color, 0.14), border: `1px solid ${alpha(rb.color, 0.45)}` }}>{rb.label}</span> : null
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={12} />}
                      <span style={{ fontSize: F.micro, color: C.textGhost, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? pl?.origin ?? ''}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: F.body, fontWeight: 800, color: i === 0 ? C.gold : C.textSub }}>{formatRaceTime(e.timeSec)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── アジア予選: 年度一覧（年間優勝国） ── */}
      {cat === 'waqual' && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.waqual, paddingLeft: 2, marginBottom: 2 }}>アジア予選 年間優勝</div>
          {waQual.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ記録がありません</div>
          ) : waQual.map(r => {
            const champ = r.standings[0]
            const isJp = champ?.nat === 'JPN'
            return (
              <button key={r.year} onClick={() => setYear(r.year)} style={rowStyle(isJp)}>
                <span style={{ fontSize: F.title, fontWeight: 900, color: CAT_COLOR.waqual }}>{r.year}</span>
                {champ && <Flag code={champ.nat} width={26} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.bodyLg, fontWeight: 700, color: isJp ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champ ? natName(champ.nat) : '—'}</div>
                  <div style={{ fontSize: F.micro, color: C.textGhost }}>年間優勝{r.host ? ` ・ ${natName(r.host)}開催` : ''}</div>
                </div>
                <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{champ?.strength ?? 0}pt</span>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 世界選手権: 種目一覧（5000m/10000m/マラソン/駅伝） ── */}
      {cat === 'wamain' && waEvent == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([['d5000', '5000m'], ['d10000', '10000m'], ['marathon', 'マラソン'], ['ekiden', '駅伝']] as const).map(([ev, label]) => (
            <button key={ev} onClick={() => setWaEvent(ev)} style={rowStyle(false, true)}>
              <span style={{ fontSize: F.sub, fontWeight: 800, flex: 1 }}>{label}</span>
              <span style={{ fontSize: F.caption, color: C.textDim, padding: '2px 8px',background: alpha(CAT_COLOR.wamain, 0.12) }}>{waMain.length}回開催</span>
              <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
            </button>
          ))}
        </div>
      )}

      {/* ── 世界選手権 個人種目: 年度一覧（優勝者付き・記録会と同じ見た目） ── */}
      {cat === 'wamain' && (waEvent === 'd5000' || waEvent === 'd10000' || waEvent === 'marathon') && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.wamain, paddingLeft: 2, marginBottom: 2 }}>{waEvent === 'd5000' ? '5000m' : waEvent === 'd10000' ? '10000m' : 'マラソン'}</div>
          {waMain.filter(r => (r.meet?.individuals ?? []).some(ir => ir.event === waEvent && ir.placings.length > 0)).length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ記録がありません</div>
          ) : waMain.map(r => {
            const ir = (r.meet?.individuals ?? []).find(x => x.event === waEvent)
            const first = ir?.placings[0]
            if (!first) return null
            const isJp = first.nat === 'JPN'
            return (
              // タップ=年度へ / 長押し=優勝者の選手詳細
              <button key={r.year} onClick={() => setYear(r.year)} {...lp(first.playerId)} style={rowStyle(isJp)}>
                <span style={{ fontSize: F.title, fontWeight: 900, color: CAT_COLOR.wamain }}>{r.year}</span>
                <div style={{ width: 26, height: 26,overflow: 'hidden', flexShrink: 0 }}>
                  <PlayerFace playerId={first.playerId} nationality={first.nat} size={26} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.body, fontWeight: 700, color: isJp ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolvePlayer(first.playerId)?.name || first.playerName}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                    <Flag code={first.nat} width={13} />
                    <span style={{ fontSize: F.micro, color: C.textGhost }}>{natName(first.nat)} ・ 優勝</span>
                  </div>
                </div>
                <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{formatRaceTime(first.timeSec)}</span>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── 世界選手権 個人種目: その年の結果（トップ8・記録会と同じ見た目） ── */}
      {cat === 'wamain' && (waEvent === 'd5000' || waEvent === 'd10000' || waEvent === 'marathon') && year != null && (() => {
        const r = waMain.find(x => x.year === year)
        const ir = (r?.meet?.individuals ?? []).find(x => x.event === waEvent)
        const rows = (ir?.placings ?? []).slice(0, 8)
        return (
          <div style={{ padding: '0 14px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.wamain, paddingLeft: 2, marginBottom: 6 }}>{year}年 世界選手権 {waEvent === 'd5000' ? '5000m' : waEvent === 'd10000' ? '10000m' : 'マラソン'}</div>
            <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {rows.map((e, i, arr) => {
                const isJp = e.nat === 'JPN'
                return (
                  // 長押しは常時有効（選手が既に削除済みの古い記録だけシートが開かない）
                  <div key={e.playerId} {...lp(e.playerId)} style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '6px 12px',
                    background: isJp ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                    borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: 'pointer',
                  }}>
                    <span style={{ fontSize: F.sub, fontWeight: 900, width: 22, textAlign: 'center', color: i === 0 ? C.gold : i < 3 ? C.textSub : C.textGhost }}>{e.rank}</span>
                    <div style={{ width: 28, height: 28,overflow: 'hidden', flexShrink: 0 }}>
                      <PlayerFace playerId={e.playerId} nationality={e.nat} size={28} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: F.body, fontWeight: 700, color: isJp ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resolvePlayer(e.playerId)?.name || e.playerName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                        <Flag code={e.nat} width={13} />
                        <span style={{ fontSize: F.micro, color: C.textGhost }}>{natName(e.nat)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: F.body, fontWeight: 800, color: i === 0 ? C.gold : C.textSub }}>{formatRaceTime(e.timeSec)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── 世界選手権 駅伝: 年度一覧（優勝国付き・アジア予選と同じ見た目） ── */}
      {cat === 'wamain' && waEvent === 'ekiden' && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: CAT_COLOR.wamain, paddingLeft: 2, marginBottom: 2 }}>世界選手権 駅伝</div>
          {waMain.length === 0 ? (
            <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>まだ記録がありません</div>
          ) : waMain.map(r => {
            const champ = (r.meet?.ekiden ?? []).find(e => e.rank === 1)
            const isJp = champ?.nat === 'JPN'
            return (
              <button key={r.year} onClick={() => setYear(r.year)} style={rowStyle(isJp)}>
                <span style={{ fontSize: F.title, fontWeight: 900, color: CAT_COLOR.wamain }}>{r.year}</span>
                {champ && <Flag code={champ.nat} width={26} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.bodyLg, fontWeight: 700, color: isJp ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{champ ? natName(champ.nat) : '—'}</div>
                  <div style={{ fontSize: F.micro, color: C.textGhost }}>駅伝優勝{r.host ? ` ・ ${natName(r.host)}開催` : ''}</div>
                </div>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── アジア予選/世界選手権駅伝: その年の3戦一覧 ── */}
      {((cat === 'waqual') || (cat === 'wamain' && waEvent === 'ekiden')) && year != null && waRace == null && (() => {
        const src = cat === 'waqual' ? waQual : waMain
        const r = src.find(x => x.year === year)
        const races = (r?.races ?? []).filter(rc => rc.results)
        const accent2 = cat === 'waqual' ? CAT_COLOR.waqual : CAT_COLOR.wamain
        return (
          <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: accent2, paddingLeft: 2, marginBottom: 2 }}>{year}年 {cat === 'waqual' ? 'アジア予選' : '世界選手権 駅伝'} 全{races.length}戦</div>
            {races.length === 0 ? (
              <div style={{ textAlign: 'center', color: C.textDim, fontSize: F.bodyLg, padding: '30px 0' }}>この年はレース詳細の記録がありません</div>
            ) : races.map(rc => {
              const top = rc.results!.teamRankings.find(tr => tr.rank === 1) ?? rc.results!.teamRankings[0]
              const nat = top ? natOfTeamId(top.teamId) : null
              return (
                <button key={rc.id} onClick={() => setWaRace(rc)} style={rowStyle()}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: F.body, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rc.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      {nat && <Flag code={nat} width={14} />}
                      <span style={{ fontSize: F.tiny, color: C.textGhost }}>{nat ? `${natName(nat)} 優勝` : ''}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{top ? formatRaceTime(top.totalTimeSec) : ''}</span>
                  <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
                </button>
              )
            })}
          </div>
        )
      })()}

      {/* ── アジア予選/世界選手権駅伝: 順位表（国別・タップで区間配置へ） ── */}
      {waRace != null && teamId == null && (
        <div style={{ padding: '0 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: cat === 'waqual' ? CAT_COLOR.waqual : CAT_COLOR.wamain, paddingLeft: 2, marginBottom: 8 }}>{waRace.name}</div>
          <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {[...waRace.results!.teamRankings].sort((a, b) => a.rank - b.rank).map((tr, i, arr) => {
              const nat = natOfTeamId(tr.teamId)
              const isJp = nat === 'JPN'
              const diff = tr.totalTimeSec - arr[0].totalTimeSec
              return (
                <button key={tr.teamId} onClick={() => setTeamId(tr.teamId)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', width: '100%', cursor: 'pointer', textAlign: 'left',
                  background: isJp ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  color: C.text, fontFamily: SAIRA,
                }}>
                  <span style={{ fontSize: F.sub, fontWeight: 900, width: 22, textAlign: 'center', color: tr.rank === 1 ? C.gold : tr.rank <= 3 ? C.textSub : C.textGhost }}>{tr.rank}</span>
                  {nat && <Flag code={nat} width={22} />}
                  <span style={{ flex: 1, fontSize: F.body, fontWeight: 700, color: isJp ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nat ? natName(nat) : '—'}</span>
                  <span style={{ fontSize: F.label, fontWeight: 800, color: tr.rank === 1 ? C.gold : C.textSub }}>
                    {tr.rank === 1 ? formatRaceTime(tr.totalTimeSec) : `+${formatRaceTime(diff)}`}
                  </span>
                  <span style={{ color: C.textGhost, fontSize: F.sub }}>›</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── アジア予選/世界選手権駅伝: 国の区間配置（選手は顔付き・長押しで詳細） ── */}
      {waRace != null && teamId != null && (() => {
        const nat = natOfTeamId(teamId)
        const results = waRace.results!
        const myRanking = results.teamRankings.find(tr => tr.teamId === teamId)
        const segs = [...waRace.segments].sort((a, b) => a.index - b.index)
        return (
          <div style={{ padding: '0 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '12px 14px',background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.border2}` }}>
              {nat && <Flag code={nat} width={34} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.sub, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nat ? `${natName(nat)} 代表` : '—'}</div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>{waRace.name}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: F.title, fontWeight: 900, color: myRanking?.rank === 1 ? C.gold : C.textSub }}>{myRanking?.rank ?? '—'}<span style={{ fontSize: F.tiny, color: C.textGhost }}>位</span></div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>{myRanking ? formatRaceTime(myRanking.totalTimeSec) : ''}</div>
              </div>
            </div>
            <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {segs.map((seg, i) => {
                const sr = results.segmentResults.find(x => x.segmentIndex === seg.index)
                const runner = sr?.runners.find(x => x.teamId === teamId)
                // 長期整理で削除された選手も removedPlayers から名前・国籍を引いて同じように出す
                const pl = playerLabel(players, removedPlayers, runner?.playerId)
                const isSegWin = runner?.rank === 1
                return (
                  <div key={seg.index} {...(pl && !pl.isRemoved ? lp(pl.id) : {})} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    background: isSegWin ? alpha(C.gold, 0.08) : i % 2 === 0 ? C.surface : 'transparent',
                    borderBottom: i < segs.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: pl && !pl.isRemoved ? 'pointer' : 'default',
                  }}>
                    <div style={{ width: 38, flexShrink: 0 }}>
                      <div style={{ fontSize: F.body, fontWeight: 900, color: C.textSub }}>{seg.index}区</div>
                      <div style={{ fontSize: F.micro, color: C.textGhost }}>{seg.distanceKm}km</div>
                    </div>
                    {pl && (
                      <div style={{ width: 26, height: 26,overflow: 'hidden', flexShrink: 0 }}>
                        <PlayerFace playerId={pl.id} nationality={pl.nationality} size={26} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: F.body, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name ?? '—'}</span>
                      {isSegWin && <span style={{ fontSize: F.micro, fontWeight: 800, color: C.gold, padding: '1px 5px',background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.4)}`, flexShrink: 0 }}>区間賞</span>}
                    </div>
                    <span style={{ fontSize: F.caption, fontWeight: 800, color: isSegWin ? C.gold : C.textDim, flexShrink: 0 }}>区間{runner?.rank ?? '—'}位</span>
                    <span style={{ fontSize: F.body, fontWeight: 800, color: isSegWin ? C.gold : C.textSub, flexShrink: 0 }}>{runner ? formatRaceTime(runner.timeSec) : '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Level 2: 年度一覧（優勝チーム付き） */}
      {cat != null && cat !== 'tt' && cat !== 'waqual' && cat !== 'wamain' && raceName != null && raceName !== OVERALL && year == null && (
        <div style={{ padding: '0 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: accent, paddingLeft: 2, marginBottom: 2 }}>{raceName}</div>
          {[...raceEntries].reverse().map(({ year: y, race }) => {
            const top = race.results!.teamRankings.find(tr => tr.rank === 1) ?? race.results!.teamRankings[0]
            const t = top ? resolveClub(top.teamId) : undefined
            const isMe = top?.teamId === teamIdAt(y)
            return (
              <button key={y} onClick={() => setYear(y)} style={rowStyle(isMe)}>
                <span style={{ fontSize: F.title, fontWeight: 900, color: accent }}>{y}</span>
                {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={22} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: F.body, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</div>
                  <div style={{ fontSize: F.micro, color: C.textGhost }}>優勝</div>
                </div>
                <span style={{ fontSize: F.body, fontWeight: 800, color: C.textSub }}>{top ? formatRaceTime(top.totalTimeSec) : ''}</span>
                <span style={{ color: C.textGhost, fontSize: F.title }}>›</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Level 3: 順位表（チームをタップで区間配置へ） */}
      {currentEntry && teamId == null && year != null && (
        <div style={{ padding: '0 14px' }}>
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: 900, color: accent, paddingLeft: 2, marginBottom: 8 }}>{year}年 {raceName}</div>
          <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
            {[...currentEntry.race.results!.teamRankings].sort((a, b) => a.rank - b.rank).map((tr, i, arr) => {
              const t = resolveClub(tr.teamId)
              const isMe = year != null && tr.teamId === teamIdAt(year)
              const diff = tr.totalTimeSec - arr[0].totalTimeSec
              return (
                <button key={tr.teamId} onClick={() => setTeamId(tr.teamId)} style={{
                  display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', width: '100%', cursor: 'pointer', textAlign: 'left',
                  background: isMe ? alpha(C.gold, 0.1) : i % 2 === 0 ? C.surface : 'transparent',
                  border: 'none', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none',
                  color: C.text, fontFamily: SAIRA,
                }}>
                  <span style={{ fontSize: F.sub, fontWeight: 900, width: 22, textAlign: 'center', color: tr.rank === 1 ? C.gold : tr.rank <= 3 ? C.textSub : C.textGhost }}>{tr.rank}</span>
                  {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20} />}
                  <span style={{ flex: 1, fontSize: F.body, fontWeight: 700, color: isMe ? C.gold : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</span>
                  <span style={{ fontSize: F.label, fontWeight: 800, color: tr.rank === 1 ? C.gold : C.textSub }}>
                    {tr.rank === 1 ? formatRaceTime(tr.totalTimeSec) : `+${formatRaceTime(diff)}`}
                  </span>
                  <span style={{ color: C.textGhost, fontSize: F.sub }}>›</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '12px 14px',background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${C.border2}` }}>
              {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={34} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: F.sub, fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t?.name ?? '—'}</div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>{year}年 {raceName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: F.title, fontWeight: 900, color: myRanking?.rank === 1 ? C.gold : C.textSub }}>{myRanking?.rank ?? '—'}<span style={{ fontSize: F.tiny, color: C.textGhost }}>位</span></div>
                <div style={{ fontSize: F.caption, color: C.textDim }}>{myRanking ? formatRaceTime(myRanking.totalTimeSec) : ''}</div>
              </div>
            </div>
            <div style={{overflow: 'hidden', border: `1px solid ${C.border}` }}>
              {segs.map((seg, i) => {
                const sr = results.segmentResults.find(s => s.segmentIndex === seg.index)
                const runner = sr?.runners.find(r => r.teamId === teamId)
                const pl = playerLabel(players, removedPlayers, runner?.playerId)
                const isSegWin = runner?.rank === 1
                return (
                  <div key={seg.index} {...(pl && !pl.isRemoved ? lp(pl.id) : {})} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                    background: isSegWin ? alpha(C.gold, 0.08) : i % 2 === 0 ? C.surface : 'transparent',
                    borderBottom: i < segs.length - 1 ? `1px solid ${C.border}` : 'none',
                    cursor: pl && !pl.isRemoved ? 'pointer' : 'default',
                  }}>
                    <div style={{ width: 38, flexShrink: 0 }}>
                      <div style={{ fontSize: F.body, fontWeight: 900, color: C.textSub }}>{seg.index}区</div>
                      <div style={{ fontSize: F.micro, color: C.textGhost }}>{seg.distanceKm}km</div>
                    </div>
                    {pl && (
                      <div style={{ width: 26, height: 26,overflow: 'hidden', flexShrink: 0 }}>
                        <PlayerFace playerId={pl.id} nationality={pl.nationality} size={26} />
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: F.body, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl?.name ?? '—'}</span>
                      {isSegWin && <span style={{ fontSize: F.micro, fontWeight: 800, color: C.gold, padding: '1px 5px',background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.4)}`, flexShrink: 0 }}>区間賞</span>}
                    </div>
                    <span style={{ fontSize: F.caption, fontWeight: 800, color: isSegWin ? C.gold : C.textDim, flexShrink: 0 }}>区間{runner?.rank ?? '—'}位</span>
                    <span style={{ fontSize: F.body, fontWeight: 800, color: isSegWin ? C.gold : C.textSub, flexShrink: 0 }}>{runner ? formatRaceTime(runner.timeSec) : '—'}</span>
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
