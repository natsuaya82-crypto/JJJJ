import { useState, useRef } from 'react'
import { comparePlayers } from '../../utils/playerSort'
import { useParams, useLocation, useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { teamHistoryOf, titleRows } from '../../utils/teamHistory'
// 海外クラブの本拠地・創設年・監督名（クラブIDから毎回同じ値を出す）

// 予算は格1本、施設も1本（国内CPUも海外も同じ決まり）
import { tierBudget } from '../../utils/clubTier'
import { clubCity, clubFounded, clubGmName } from '../../utils/clubs'
import { facilitiesOf, FACILITY_LABEL } from '../../utils/facilities'
import { useClubIndex } from '../../lib/useClubIndex'
import { useEclHistory } from '../../lib/useEclHistory'
import { TeamLogoSVG } from '../icons/Icons'
import { ovr, ratingColor, SPEC_COLOR, playerLabel, foreignClubsOf } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { SPECIALTY_LABELS } from '../../types'
import type { Division } from '../../types'
import { ROSTER_MAX } from '../../data/rosterRules'
import { belongsToClub } from '../../utils/rosterSync'
import { C, rankColor, SAIRA, F } from '../../styles/tokens'
import PlayerFace from '../player/PlayerFace'
import { usePlayerLongPress } from '../player/usePlayerLongPress'
import PlayerRow from '../player/PlayerRow'
import { useOpponentMenu } from './opponentMenu'
import { rankedStandings, DIVISION_LABEL } from '../../utils/league'
import { clubStandingRow, clubSeasonRank, clubRacesDone, clubWonLeague, divisionAxisPos, divisionAxisBands } from '../../utils/clubStanding'
import PlayerList from '../player/PlayerList'



// 'YYYY-MM-DD' → 'YYYY年M月D日'。日付が無ければ年だけ
function fmtDate(d: string | undefined, year: number): string {
  if (d) {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (m) return `${+m[1]}年${+m[2]}月${+m[3]}日`
  }
  return `${year}年`
}

// 歴代成績の折れ線グラフ。
//
// ★**縦軸は1本の物差し。上が1部1位、下が3部最下位**（オーナー・2026-08-12）。
//   高さの計算は `utils/clubStanding` の `divisionAxisPos` 1本を通す
//   （画面で通し順位を組み立てないこと。`npm run check` が見張っている）。
//
//   以前は「その部の中での順位」をそのまま高さにしていたので、**1部5位と3部5位が
//   同じ高さ**に描かれ、昇降格した年に線が繋がると上がったのか下がったのか分からなかった。
//   部の変わり目に**縦**の点線を入れて誤魔化していたが、1本の物差しに載せれば要らない。
//   いま引く点線は**横**で、部の切れ目（1部と2部の境／2部と3部の境）を示す。
//
// ★海外クラブには部が無いので、今までどおり「リーグ内順位」をそのまま高さにする。
//   `division` が無い行がそれ。
function RankHistoryChart({ history, color }: { history: { year: number; rank: number; total: number; division?: Division }[]; color: string }) {
  const domestic = history.some(h => h.division != null)
  const maxRank = Math.max(2, ...history.map(h => h.total), ...history.map(h => h.rank))
  const W = 320, H = 150, padL = 24, padR = 24, padT = 18, padB = 26
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = history.length
  const x = (i: number) => n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW
  /** 0（上）〜1（下）を実際のy座標へ */
  const yAt = (pos: number) => padT + pos * plotH
  const y = (h: { rank: number; division?: Division }) => yAt(
    h.division != null ? divisionAxisPos(h.division, h.rank) : (h.rank - 1) / (maxRank - 1))
  const pts = history.map((h, i) => `${x(i)},${y(h)}`).join(' ')
  const bands = domestic ? divisionAxisBands() : []
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* 部の帯。**横**の点線で切れ目を出し、左端に部の名前を置く */}
      {bands.map(b => (
        <g key={b.division}>
          {b.division !== 1 && (
            <line x1={padL - 4} x2={W - padR} y1={yAt(b.top)} y2={yAt(b.top)}
              stroke="#5C5870" strokeWidth="0.8" opacity="0.7" strokeDasharray="2 3"/>
          )}
          <text x={2} y={yAt((b.top + b.bottom) / 2) + 3} fontSize="7" fill="#3A3758" fontFamily={SAIRA}>
            {DIVISION_LABEL[b.division]}
          </text>
        </g>
      ))}
      {/* 一番上（1部1位）と一番下（3部最下位）の目印 */}
      <line x1={padL - 4} x2={W - padR} y1={yAt(0)} y2={yAt(0)} stroke="#C9A84C" strokeWidth="0.5" opacity="0.35" strokeDasharray="3 3"/>
      <line x1={padL - 4} x2={W - padR} y1={yAt(1)} y2={yAt(1)} stroke="#2E2B42" strokeWidth="0.5"/>
      {n > 1 &&<polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"/>}
      {history.map((h, i) => {
        const col = h.rank === 1 ? '#C9A84C' : h.rank <= 3 ? '#4CAF50' : '#9B97A8'
        // ★出す数字は**部内順位**のまま（「3部15位」）。通し順位は画面に出さない
        const label = h.division != null ? `${DIVISION_LABEL[h.division]}${h.rank}位` : `${h.rank}位`
        return (
          <g key={h.year}>
            <circle cx={x(i)} cy={y(h)} r="3.5" fill={col}/>
            <text x={x(i)} y={y(h) - 8} textAnchor="middle" fontSize="8" fontWeight="900" fill={col} fontFamily={SAIRA}>{label}</text>
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="8" fill="#5C5870" fontFamily={SAIRA}>{h.year}</text>
          </g>
        )
      })}
    </svg>
  )
}

function TrophyIcon({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <path d="M8 21h8M12 17v4M7 3h10v7a5 5 0 01-10 0V3z" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 5H4v1a3.5 3.5 0 003.5 3.5M17 5h3v1a3.5 3.5 0 01-3.5 3.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ルート変化（teamId / clubId）ごとに key で内部を必ず再マウントし、
// 常に1ページ目・スクロール先頭・入タブの初期状態から表示する。
export default function TeamDetailPage() {
  const { teamId, leagueId, clubId } = useParams<{ teamId?: string; leagueId?: string; clubId?: string }>()
  const routeKey = teamId ?? `${leagueId}/${clubId}`
  return <TeamDetailInner key={routeKey} teamId={teamId} leagueId={leagueId} clubId={clubId} />
}

function TeamDetailInner({ teamId, leagueId, clubId }: { teamId?: string; leagueId?: string; clubId?: string }) {
  const { teams, players, currentSeason, playerTeamId, pastSeasons, openPlayerSheet } = useGameStore()
  const foreignLeaguesRaw = useGameStore(s => s.foreignLeagues)
  const foreignLeagues = foreignLeaguesRaw ?? []
  const clubIndex = useClubIndex()
  const transferHistory = useGameStore(s => s.transferHistory)
  const removedPlayers = useGameStore(s => s.removedPlayers)
  const eclHistory = useEclHistory()
  const location = useLocation()
  const navigate = useNavigate()
  // 選手詳細から飛んできた場合は、戻るで元の選手詳細（モーダル）を開き直す
  const fromPlayerSheet = (location.state as { fromPlayerSheet?: string } | null)?.fromPlayerSheet
  const handleBack = () => {
    navigate(-1)
    if (fromPlayerSheet) openPlayerSheet(fromPlayerSheet)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const longPressP = usePlayerLongPress()
  const [activePage, setActivePage] = useState(0)
  const [moveTab, setMoveTab] = useState<'in' | 'out'>('in')
  // 他チーム選手：タップ＝吹き出しメニュー / 長押し＝詳細（共有フック）
  const { rowHandlers, overlay } = useOpponentMenu()
  // ページ確定はスクロールが止まってから。スワイプ中に activePage を切り替えると
  // 非表示ページの高さ畳み（maxHeight）が発火してレイアウトが動き、スナップが効かなくなる
  const scrollEndTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ※上記のフックは「チームが見つかりません」の early return より前に置く。
  //   後ろに置くとフック数が変わって「Rendered fewer hooks than expected」で白画面になる。

  const isForeign = !!clubId
  const league = isForeign ? foreignLeagues.find(l => l.id === leagueId) : undefined
  const club = isForeign ? league?.clubs.find(c => c.id === clubId) : undefined
  const domesticTeam = !isForeign ? teams.find(t => t.id === teamId) : undefined

  // 国内チーム or 海外クラブを共通の表示モデルに正規化する
  const id = isForeign ? clubId! : teamId!
  const found = isForeign ? club : domesticTeam
  if (!found) return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#5C5870', fontFamily: 'inherit' }}>
      {isForeign ? 'クラブが見つかりません' : 'チームが見つかりません'}
    </div>
  )
  const colors = found.colors
  const name = found.name
  const shortName = found.shortName

  const isMyTeam = !isForeign && id === playerTeamId

  // ロスター（1軍/2軍の区別なし）。国内チームも海外クラブも判定は同じ
  const mainPlayers = players.filter(p => belongsToClub(p, id))
    .sort(comparePlayers('ovr'))
  const teamSalary = mainPlayers.reduce((s, p) => s + p.contract.annualSalary, 0)

  // 現在順位・ポイント・直近フォーム。**引き方は utils/clubStanding の1本**（国内も海外も同じ）。
  // 順位表の置き場所は国内(standings)と海外(foreignStandings)で分かれているが、
  // 読む側がそれを知る必要はない。以前はここだけで6か所が二重になっていた
  const standing = clubStandingRow(currentSeason, id)
  // ★順位は「その集団の中での順位」（国内＝部内順位／海外＝リーグ内順位）。
  //   通し順位（1〜52）は格を決める内部の数なので出さない（utils/clubStanding）
  const { rank, division: myDivision } = clubSeasonRank(currentSeason, id)
  const standingPoints = standing?.totalPoints ?? 0
  const recentForm = (standing?.raceResults ?? []).slice(-4)
  const completedRaces = clubRacesDone(currentSeason, id)

  // 歴代成績（過去シーズンの最終順位）。国内は部内順位、海外はリーグ内順位。
  // どちらで数えるかも clubSeasonRank が持っている
  const historyRanks = (pastSeasons ?? []).map(s => ({ year: s.year, ...clubSeasonRank(s, id) }))
    .filter(h => h.rank > 0).slice(-8)

  // トロフィー
  const titles: { label: string; count: number; color: string }[] = []
  if (isForeign) {
    // 海外はリーグ優勝回数（過去シーズンの当該リーグ順位表1位）
    const leagueTitles = (pastSeasons ?? []).filter(s => clubWonLeague(s, id)).length
    if (leagueTitles > 0) titles.push({ label: `${league?.name ?? 'リーグ'}優勝`, count: leagueTitles, color: '#C9A84C' })
  } else {
    // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
    // ★**部ごとに出す**（オーナー・2026-08-12）。合計にすると3部優勝と1部優勝が混ざる
    for (const r of titleRows(teamHistoryOf(pastSeasons, id).titles)) {
      titles.push({ label: `${DIVISION_LABEL[r.division]}優勝`, count: r.count,
        color: r.division === 1 ? '#C9A84C' : r.division === 2 ? '#9FB4CC' : '#7A6E58' })
    }
    const reserveTitles = (pastSeasons ?? []).filter(s => {
      const st = s.secondTeamStandings
      if (!st || st.length === 0) return false
      const top = rankedStandings(st)[0]
      return top.teamId === id
    }).length
    if (reserveTitles > 0) titles.push({ label: 'リザーブリーグ優勝', count: reserveTitles, color: '#9B97A8' })
  }
  // ECL優勝（歴代優勝から集計。国内チーム・海外クラブ共通）
  const eclTitles = (eclHistory ?? []).filter(e => e.championId === id).length
  if (eclTitles > 0) titles.push({ label: 'ECL優勝', count: eclTitles, color: '#2ECC71' })

  // TEAM INFO（本拠地行 + 創設年/優勝回数/最高順位）
  // 海外クラブも国内チームと同じ作りにする。本拠地・創設年・監督名はクラブIDから
  // 毎回同じ値を出す（utils/foreignClubProfile.ts）
  // 本拠地・創設年・監督名は国内も海外も同じ入口（utils/clubs）。
  // 保存されていればその値、無ければクラブIDから決め打ち
  const anyClub = (isForeign ? club! : domesticTeam!) as { id: string; shortName: string; city?: string; founded?: number; gmName?: string; country?: string }
  const infoLocation = isForeign
    ? `${league?.countryName ?? league?.name ?? '—'} · ${clubCity(anyClub)}`
    : `${domesticTeam!.region} · ${clubCity(anyClub)}`
  const infoFounded = String(clubFounded(anyClub))
  const infoGm = clubGmName(anyClub)
  // クラブ規模（年間予算と施設）。**国内も海外も同じ出どころ**（格1本・施設1本）。
  // 以前は海外クラブだけ別の式で、しかも施設はクラブIDのハッシュから作った飾りだった
  // ★**国内クラブにも出す**（オーナー・2026-08-12「なんで海外にはこれがあるのに日本にはないの？」）。
  //   値はもともと国内も海外も同じ1本（格→年間予算・utils/facilities）で計算していて、
  //   **表示だけが海外に閉じていた**。名前も clubBudget / clubFac に直す（foreign* は嘘だった）
  const clubBudget = tierBudget(isForeign ? club! : domesticTeam!)
  const clubFac = facilitiesOf(isForeign ? club! : domesticTeam!)
  const FAC_LABEL: { key: 'trainingCamp' | 'medicalCenter' | 'scoutOffice' | 'tacticsRoom'; label: string; color: string }[] = [
    { key: 'trainingCamp', label: FACILITY_LABEL.trainingCamp, color: '#4CAF50' },
    { key: 'medicalCenter', label: FACILITY_LABEL.medicalCenter, color: '#4FC3F7' },
    { key: 'scoutOffice', label: FACILITY_LABEL.scoutOffice, color: '#FF9800' },
    { key: 'tacticsRoom', label: FACILITY_LABEL.tacticsRoom, color: '#7986CB' },
  ]
  const infoChampions = isForeign
    ? (titles[0]?.count ?? 0)
    : teamHistoryOf(pastSeasons, id).championships
  // 最高順位。**部をまたいで数の大小では比べられない**（3部1位と1部10位はどちらも「1」「10」）。
  // 部が上のほう → その中で順位が上のほう、の順で選び、部つきで出す
  const infoBest = historyRanks.filter(h => h.rank > 0)
    .sort((a, b) => (a.division ?? 9) - (b.division ?? 9) || a.rank - b.rank)[0] ?? null

  // 移籍の入/出：シーズンごとの出場・在籍記録の年またぎ差分から導出する。
  // レンタルによる所属変化は完全移籍ではないので除外
  type MoveRow = { year: number; playerId: string; otherTeamId: string; dir: 'in' | 'out' }
  const moveRows: MoveRow[] = (() => {
    const tid = id
    const seasons = [...(pastSeasons ?? []), currentSeason]
    const app = new Map<string, Map<number, Set<string>>>()
    const add = (pid: string, year: number, t: string) => {
      if (!t) return
      let ym = app.get(pid)
      if (!ym) { ym = new Map(); app.set(pid, ym) }
      let s = ym.get(year)
      if (!s) { s = new Set(); ym.set(year, s) }
      s.add(t)
    }
    for (const s of seasons) {
      for (const race of [...(s.races ?? []), ...(s.secondTeamRaces ?? [])]) {
        if (!race.results) continue
        for (const sr of race.results.segmentResults) for (const r of sr.runners) add(r.playerId, s.year, r.teamId)
      }
      for (const [pid, clubId] of Object.entries(foreignClubsOf(s))) add(pid, s.year, clubId)
      for (const z of s.zeroAppearances ?? []) add(z.playerId, s.year, z.teamId)
    }
    // 今季未出走の現役選手も今季の所属として拾う（加入直後の選手を落とさない）
    for (const p of players) if (p.status !== 'retired') add(p.id, currentSeason.year, p.teamId)

    const rows: MoveRow[] = []
    for (const [pid, ym] of app) {
      const years = [...ym.keys()].sort((a, b) => a - b)
      if (!years.some(y => ym.get(y)!.has(tid))) continue
      // 長期整理で削除された選手も移籍履歴に残す（名前・顔は removedPlayers から出せる）
      const p = players.find(pl => pl.id === pid)
      if (!p && !removedPlayers?.[pid]) continue
      const isLoanRec = (y: number, t: string) =>
        (p?.loanTeamYears ?? []).some(l => l.year === y && l.teamId === t)
        || (!!p?.loan && y === currentSeason.year && t === p.teamId)
      for (let i = 1; i < years.length; i++) {
        const prev = ym.get(years[i - 1])!, cur = ym.get(years[i])!
        if (cur.has(tid) && !prev.has(tid) && ![...cur].some(t => t !== tid && prev.has(t))) {
          const from = [...prev].find(t => t !== tid)
          if (from && !isLoanRec(years[i], tid) && !isLoanRec(years[i - 1], from)) rows.push({ year: years[i], playerId: pid, otherTeamId: from, dir: 'in' })
        }
        if (prev.has(tid) && !cur.has(tid) && ![...prev].some(t => t !== tid && cur.has(t))) {
          const to = [...cur].find(t => t !== tid)
          if (to && !isLoanRec(years[i], to) && !isLoanRec(years[i - 1], tid)) rows.push({ year: years[i], playerId: pid, otherTeamId: to, dir: 'out' })
        }
      }
      for (const y of years) {
        const set = ym.get(y)!
        if (!set.has(tid) || set.size < 2) continue
        const other = [...set].find(t => t !== tid)!
        if (isLoanRec(y, other) || isLoanRec(y, tid)) continue
        const later = years.find(yy => yy > y)
        const endsHere = later ? ym.get(later)!.has(tid) : p?.teamId === tid
        rows.push({ year: y, playerId: pid, otherTeamId: other, dir: endsHere ? 'in' : 'out' })
      }
    }
    rows.sort((a, b) => b.year - a.year)
    return rows
  })()
  // 表示用の移籍行。transferHistory（正確な金額・契約・日付付き）を最優先で使い、
  // 記録が無い過去の移籍だけ moveRows（在籍差分）で補う。
  // ※FA加入は前年が無所属で在籍差分が作れないため、transferHistory を直接ソースにしないと「入」に出ない
  type MoveEntry = { year: number; date?: string; playerId: string; otherTeamId: string; dir: 'in' | 'out'; fee?: number; kind?: 'free' | 'trade'; years?: number; hasRec: boolean }
  const moveEntries: MoveEntry[] = (() => {
    const out: MoveEntry[] = []
    const seen = new Set<string>()
    for (const r of (transferHistory ?? [])) {
      if (r.toTeamId === id) {
        const k = `${r.playerId}-${r.year}-in`
        if (!seen.has(k)) { seen.add(k); out.push({ year: r.year, date: r.date, playerId: r.playerId, otherTeamId: r.fromTeamId, dir: 'in', fee: r.fee, kind: r.kind, years: r.years, hasRec: true }) }
      }
      if (r.fromTeamId === id) {
        const k = `${r.playerId}-${r.year}-out`
        if (!seen.has(k)) { seen.add(k); out.push({ year: r.year, date: r.date, playerId: r.playerId, otherTeamId: r.toTeamId, dir: 'out', fee: r.fee, kind: r.kind, years: r.years, hasRec: true }) }
      }
    }
    for (const row of moveRows) {
      const k = `${row.playerId}-${row.year}-${row.dir}`
      if (!seen.has(k)) { seen.add(k); out.push({ year: row.year, playerId: row.playerId, otherTeamId: row.otherTeamId, dir: row.dir, hasRec: false }) }
    }
    // ★**新しいものが上**。年だけで並べると、同じ年の中は積んだ順（＝古い順）のまま残る。
    //   実機で「6月28日 → 7月19日」と古い方が上に出ていたのがこれ。
    //   日付（YYYY-MM-DD）まで見て降順にする。日付が無い行（記録の無い推定ぶん）は
    //   その年のいちばん後ろへ回す（'' は文字列比較でどの日付より小さい）
    out.sort((a, b) => b.year - a.year || (b.date ?? '').localeCompare(a.date ?? ''))
    return out
  })()
  const movesIn = moveEntries.filter(r => r.dir === 'in')
  const movesOut = moveEntries.filter(r => r.dir === 'out')
  const resolveAnyTeam = (tid: string) => clubIndex.byId(tid)

  const handleScroll = () => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current)
    scrollEndTimer.current = setTimeout(() => {
      if (!scrollRef.current) return
      const { scrollLeft, clientWidth } = scrollRef.current
      const next = Math.round(scrollLeft / clientWidth)
      if (next !== activePage) {
        setActivePage(next)
        window.scrollTo({ top: 0 })  // ページを切り替えたら縦スクロールを先頭に戻す
      }
    }, 90)
  }

  // 表示中でないページは高さを畳む：縦スクロールの長さが常に「今見ているページ」の高さになる
  // （畳まないと一番長いページに引きずられ、短いページで何もない所まで延々スクロールできてしまう）
  const pageStyle = (i: number): React.CSSProperties => ({
    minWidth: '100%', scrollSnapAlign: 'start',
    ...(activePage === i ? {} : { maxHeight: '70vh', overflow: 'hidden' }),
  })

  return (
    <div style={{ fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif", paddingBottom: '80px' }}>
      <div style={{ padding: '10px 16px 4px' }}>
        <BackButton onClick={handleBack}/>
      </div>

      <div style={{
        margin: '0 12px 10px',
        background: `linear-gradient(135deg, ${colors.primary}25, #14121F)`,
        border: `1px solid ${colors.primary}40`,
        padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <TeamLogoSVG primary={colors.primary} secondary={colors.secondary} shortName={shortName} teamId={id} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
              <span style={{ fontSize: F.titleLg, fontWeight: '900', color: '#F0EDE8' }}>{name}</span>
              {isMyTeam && (
                <span style={{ fontSize: F.micro, padding: '2px 6px',backgroundColor: `${colors.primary}30`, color: colors.primary, fontWeight: '700' }}>自チーム</span>
              )}
            </div>
            <div style={{ fontSize: F.label, color: '#5C5870' }}>{infoLocation} • {mainPlayers.length}名</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: '900', color: rankColor(rank), fontFamily: 'monospace', lineHeight: 1 }}>{rank > 0 ? rank : '—'}</div>
            <div style={{ fontSize: F.micro, color: '#3A3758' }}>{myDivision != null ? `${DIVISION_LABEL[myDivision]} 位` : '位'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px',backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: F.titleLg, fontWeight: '900', color: '#C9A84C', fontFamily: 'monospace' }}>{standingPoints}</div>
            <div style={{ fontSize: F.micro, color: '#3A3758' }}>ポイント</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px',backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: F.titleLg, fontWeight: '900', color: '#9B97A8', fontFamily: 'monospace' }}>{completedRaces}</div>
            <div style={{ fontSize: F.micro, color: '#3A3758' }}>消化試合</div>
          </div>
          <div style={{ flex: 1, textAlign: 'center', padding: '8px',backgroundColor: '#0E0D17' }}>
            <div style={{ fontSize: F.titleLg, fontWeight: '900', color: '#4CAF50', fontFamily: 'monospace' }}>
              {mainPlayers.length > 0 ? Math.round(mainPlayers.reduce((s, p) => s + ovr(p), 0) / mainPlayers.length) : '—'}
            </div>
            <div style={{ fontSize: F.micro, color: '#3A3758' }}>平均OVR</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', paddingBottom: '10px' }}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            onClick={() => scrollRef.current?.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: 'smooth' })}
            style={{
              height: '4px',
              width: activePage === i ? '20px' : '6px',
              background: activePage === i ? '#C9A84C' : '#2E2B42',
              transition: 'all 0.2s',
              cursor: 'pointer',
            }}
          />
        ))}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          overflowX: 'scroll',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as never,
        }}
      >
        {/* Page 1: 概要（歴代成績グラフ・トロフィー） */}
        <div style={pageStyle(0)}>
          <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '10px', paddingBottom: '10px' }}>

            <div>
              <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>RECENT FORM</div>
              <div style={{ backgroundColor: '#0E0D17',padding: '12px 16px', border: '1px solid #1A1828' }}>
                {recentForm.length === 0 ? (
                  <div style={{ textAlign: 'center', fontSize: F.label, color: '#3A3758' }}>データなし</div>
                ) : (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                    {recentForm.map((r, i) => {
                      const col = r.rank === 1 ? '#C9A84C' : r.rank <= 3 ? '#4CAF50' : r.rank <= 6 ? '#9B97A8' : '#3A3758'
                      return (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: col }} />
                          <span style={{ fontSize: F.tiny, fontFamily: SAIRA, fontWeight: '900', color: col }}>{r.rank}位</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>TEAM INFO</div>
              <div style={{ backgroundColor: '#0E0D17',padding: '12px 16px', border: '1px solid #1A1828' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1A1828' }}>
                  <span style={{ fontSize: F.tiny, color: '#3A3758', letterSpacing: '2px', width: 42, flexShrink: 0 }}>本拠地</span>
                  <span style={{ fontSize: F.sub, fontWeight: '800', color: '#F0EDE8' }}>{infoLocation}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1A1828' }}>
                  <span style={{ fontSize: F.tiny, color: '#3A3758', letterSpacing: '2px', width: 42, flexShrink: 0 }}>監督</span>
                  <span style={{ fontSize: F.sub, fontWeight: '800', color: '#F0EDE8' }}>{infoGm}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: '900', color: '#C9A84C' }}>{infoFounded}</div>
                    <div style={{ fontSize: F.micro, color: '#3A3758' }}>創設年</div>
                  </div>
                  <div style={{ width: '1px', background: '#1A1828' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: '900', color: '#F0EDE8' }}>{infoChampions}</div>
                    <div style={{ fontSize: F.micro, color: '#3A3758' }}>優勝回数</div>
                  </div>
                  <div style={{ width: '1px', background: '#1A1828' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: '900', color: '#9B97A8' }}>{infoBest ? <>{infoBest.division != null && <span style={{ fontSize: F.caption, color: '#5C5870' }}>{DIVISION_LABEL[infoBest.division]} </span>}{infoBest.rank}<span style={{ fontSize: F.label, color: '#3A3758' }}>位</span></> : '—'}</div>
                    <div style={{ fontSize: F.micro, color: '#3A3758' }}>最高順位</div>
                  </div>
                </div>
              </div>
            </div>

            {/* クラブ規模。**国内も海外も出す**（値はどちらも格1本・施設1本から出ている） */}
            {clubFac && (
              <div>
                <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>クラブ規模</div>
                <div style={{ backgroundColor: '#0E0D17',padding: '12px 16px', border: '1px solid #1A1828' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 10, marginBottom: 10, borderBottom: '1px solid #1A1828' }}>
                    <span style={{ fontSize: F.tiny, color: '#3A3758', letterSpacing: '2px', width: 42, flexShrink: 0 }}>年間予算</span>
                    <span style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: '900', color: '#C9A84C' }}>{fmtYen(clubBudget)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {FAC_LABEL.map((f, i) => (
                      <div key={f.key} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                        {i > 0 && <div style={{ width: '1px', alignSelf: 'stretch', background: '#1A1828', marginRight: 8 }} />}
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontFamily: SAIRA, fontSize: F.titleLg, fontWeight: '900', color: f.color }}>Lv{clubFac[f.key] ?? 0}</div>
                          <div style={{ fontSize: F.micro, color: '#3A3758' }}>{f.label}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 歴代成績（折れ線グラフ） */}
            <div>
              <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>歴代成績</div>
              <div style={{ backgroundColor: '#0E0D17',padding: '10px 8px 4px', border: '1px solid #1A1828' }}>
                {historyRanks.length === 0 ? (
                  <div style={{ fontSize: F.label, color: '#3A3758', textAlign: 'center', padding: '12px 4px' }}>まだ過去シーズンの記録がありません</div>
                ) : (
                  <RankHistoryChart history={historyRanks} color={colors.primary} />
                )}
              </div>
            </div>

            {/* トロフィー */}
            <div>
              <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>トロフィー</div>
              <div style={{ backgroundColor: '#0E0D17',padding: '12px 16px', border: '1px solid #1A1828' }}>
                {titles.length === 0 ? (
                  <div style={{ fontSize: F.label, color: '#3A3758', textAlign: 'center', padding: '4px' }}>まだタイトル獲得なし</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {titles.map(t => (
                      <div key={t.label} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <TrophyIcon color={t.color} />
                        <span style={{ fontSize: F.bodyLg, fontWeight: '700', color: '#F0EDE8' }}>{t.label}</span>
                        <span style={{ marginLeft: 'auto', fontFamily: SAIRA, fontSize: F.title, fontWeight: '900', color: t.color }}>×{t.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {mainPlayers[0] && (() => {
              const ace = mainPlayers[0]
              const rating = ovr(ace)
              const specCol = SPEC_COLOR[ace.specialty]
              return (
                <div>
                  <div style={{ fontSize: F.caption, color: '#5C5870', letterSpacing: '2px', marginBottom: '8px', paddingLeft: '4px' }}>ACE</div>
                  <div
                    {...rowHandlers(ace.id)}
                    style={{ backgroundColor: '#0E0D17',padding: '12px', border: '1px solid #1A1828', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                  >
                    <PlayerFace playerId={ace.id} nationality={ace.nationality} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                        <span style={{ fontSize: F.sub, fontWeight: '700', color: '#F0EDE8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ace.name}</span>
                        <span style={{ padding: '1px 5px',backgroundColor: `${specCol}15`, color: specCol, fontSize: F.micro, fontWeight: '700', flexShrink: 0 }}>
                          {SPECIALTY_LABELS[ace.specialty]}
                        </span>
                      </div>
                      <div style={{ fontSize: F.caption, color: '#5C5870' }}>
                        {ace.age}歳
                      </div>
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: '26px', fontWeight: '900', color: ratingColor(rating), flexShrink: 0 }}>
                      {rating}
                    </div>
                  </div>
                </div>
              )
            })()}

          </div>
        </div>

        {/* Page 2: ロスター */}
        <div style={pageStyle(1)}>
          <div style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '8px', paddingLeft: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: '#F0EDE8' }}>ロスター</span>
              <span style={{ fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 800, color: '#C9A84C' }}>
                {mainPlayers.length}<span style={{ fontSize: F.caption, color: '#5C5870' }}>{isForeign ? '名' : `/${ROSTER_MAX}`}</span>
              </span>
              <span style={{ fontSize: F.caption, color: '#5C5870' }}>総年俸 <span style={{ color: '#9B97A8', fontWeight: 700, fontFamily: SAIRA }}>{fmtYen(teamSalary)}</span></span>
              {!isMyTeam && <span style={{ fontSize: F.micro, color: '#5C5870', marginLeft: 'auto' }}>タップ=交渉 / 長押し=詳細</span>}
            </div>
            {mainPlayers.length === 0
              ? <div style={{ textAlign: 'center', padding: '20px', color: '#3A3758', fontSize: F.body, backgroundColor: '#0E0D17',marginBottom: '12px' }}>登録なし</div>
              : (
                <PlayerList style={{ marginBottom: 80 }}>
                  {mainPlayers.map(p => <PlayerRow key={p.id} player={p} handlers={rowHandlers(p.id)} />)}
                </PlayerList>
              )
            }
          </div>
        </div>

        {/* Page 3: 移籍（入/出をスライド切替、カード表示） */}
        <div style={pageStyle(2)}>
          <div style={{ padding: '0 12px 80px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: '#F0EDE8', marginBottom: '10px', paddingLeft: '4px' }}>移籍</div>

            {/* 入/出 スライド切替 */}
            <div style={{ position: 'relative', display: 'flex', background: '#0E0D17', border: '1px solid #1A1828',padding: '3px', marginBottom: '12px' }}>
              <div style={{
                position: 'absolute', top: 3, bottom: 3,
                left: moveTab === 'in' ? 3 : '50%',
                width: 'calc(50% - 3px)',
                background: moveTab === 'in' ? 'rgba(76,175,80,0.16)' : 'rgba(232,70,42,0.16)',
                border: `1px solid ${moveTab === 'in' ? '#4CAF5055' : '#E8462A55'}`,
                transition: 'left 0.2s, background 0.2s, border-color 0.2s',
              }}/>
              {([
                { key: 'in' as const, label: '入', color: '#4CAF50' },
                { key: 'out' as const, label: '出', color: '#E8462A' },
              ]).map(tb => (
                <button
                  key={tb.key}
                  onClick={() => setMoveTab(tb.key)}
                  style={{
                    flex: 1, zIndex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: SAIRA, fontSize: F.bodyLg, fontWeight: 900,
                    color: moveTab === tb.key ? tb.color : '#5C5870',
                    transition: 'color 0.2s',
                  }}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {(() => {
              const rows = moveTab === 'in' ? movesIn : movesOut
              const otherLabel = moveTab === 'in' ? '移籍元' : '移籍先'
              if (rows.length === 0) return (
                <div style={{ textAlign: 'center', padding: '28px', color: '#3A3758', fontSize: F.label, backgroundColor: '#0E0D17',border: '1px solid #1A1828' }}>記録なし</div>
              )
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {rows.map(row => {
                    // 長期整理で削除された選手は名前・顔だけ出し、選手詳細は開かない
                    const p = players.find(pl => pl.id === row.playerId)
                    const pl = playerLabel(players, removedPlayers, row.playerId)
                    const other = resolveAnyTeam(row.otherTeamId)
                    if (!pl) return null
                    const otherName = other?.name ?? (row.kind === 'free' || !row.otherTeamId ? '無所属' : '不明')
                    const feeLabel = row.hasRec ? (row.kind === 'trade' ? 'トレード' : (row.fee ?? 0) > 0 ? fmtYen(row.fee!) : 'フリー') : '—'
                    const yearsLabel = row.years ? `${row.years}年` : '—'
                    const dateLabel = fmtDate(row.date, row.year)
                    return (
                      <div
                        key={`${row.playerId}-${row.year}`}
                        {...(pl.isRemoved ? {} : longPressP(pl.id))}
                        style={{ background: '#0E0D17', border: '1px solid #1A1828',padding: '14px 16px 12px', cursor: pl.isRemoved ? 'default' : 'pointer' }}
                      >
                        {/* 真ん中に顔（右下にOVR） */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
                          <div style={{ position: 'relative' }}>
                            <PlayerFace playerId={pl.id} nationality={pl.nationality} size={52} />
                            <div style={{ position: 'absolute', bottom: -2, right: -6, background: 'rgba(0,0,0,0.88)', padding: '0 4px',fontFamily: SAIRA, fontSize: F.label, fontWeight: 900, color: p ? ratingColor(ovr(p)) : C.textGhost, lineHeight: '15px', border: '1px solid #1A1828' }}>
                              {p ? ovr(p) : '?'}
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: F.sub, fontWeight: '700', color: '#F0EDE8', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '10px' }}>{pl.name}</div>
                        {/* 下に 移籍元 / 契約期間 / 移籍金 */}
                        <div style={{ borderTop: '1px solid #1A1828', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: F.caption, color: '#3A3758' }}>{otherLabel}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                              {other && <TeamLogoSVG primary={other.colors.primary} secondary={other.colors.secondary} shortName={other.shortName} teamId={other.id} size={16} />}
                              <span style={{ fontSize: F.body, fontWeight: 700, color: '#9B97A8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{otherName}</span>
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: F.caption, color: '#3A3758' }}>契約期間</span>
                            <span style={{ fontSize: F.bodyLg, fontWeight: 700, color: yearsLabel === '—' ? '#3A3758' : '#F0EDE8', fontFamily: SAIRA }}>{yearsLabel}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: F.caption, color: '#3A3758' }}>移籍金</span>
                            <span style={{ fontSize: F.bodyLg, fontWeight: 800, color: feeLabel === '—' ? '#3A3758' : '#C9A84C', fontFamily: SAIRA }}>{feeLabel}</span>
                          </div>
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'center', fontSize: F.caption, color: '#5C5870', fontFamily: 'monospace' }}>{dateLabel}</div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {overlay}
    </div>
  )
}
