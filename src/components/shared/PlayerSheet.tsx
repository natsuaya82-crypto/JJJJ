import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { useSegmentRecords } from '../../lib/useSegmentRecords'
import { useSeasonAwards } from '../../lib/useSeasonAwards'
import { useEclHistory } from '../../lib/useEclHistory'
import { useClubIndex } from '../../lib/useClubIndex'
import { clubRoutePath } from '../../utils/clubs'
import { divisionOf, divisionInYear, DIVISION_LABEL } from '../../utils/league'
import { usePreviewStore } from '../../store/previewStore'
import { useAdHeight } from '../layout/Layout'
import { SPECIALTY_LABELS } from '../../types'
import type { Player } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { TeamLogoSVG, LeagueLogoSVG } from '../icons/Icons'
import { buildPlayerHistory, type HistComp, type HistoryRow } from '../../utils/careerStats'
import { ovr, ratingColor, SPEC_COLOR, calcTransferValue, isStatMaxed } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { C, CARD, glassStyle, rankColor, FONT, SAIRA, bottomStack, F } from '../../styles/tokens'
import { getPlayerBadges } from '../../utils/badges'
import { HOF_MAX, isHofEligible } from '../../utils/hofRoster'
import BadgeContent, { badgeColor } from '../player/BadgeContent'
import { safeRatings } from '../../engine/raceEngine'
import { EVENT_DISTANCES, EVENT_LABEL, formatRaceTime } from '../../utils/eventTime'
import ShareCard from './ShareCard'
import Flag from '../ui/Flag'
import { natLabel, natGeoRegion } from '../../data/nationalities'
import { WA_HOST_CITY } from '../../engine/worldAthletics'
import { waRaceRows } from '../../utils/waRaces'
import { ranRaces, raceKey, splitRaceKey, shortRaceName } from '../../utils/raceHistory'
import { ForeignChip } from '../player/PlayerChips'


const RADAR_KEYS: { key: keyof Player['ratings']; abbr: string }[] = [
  { key: 'speed', abbr: '速' },
  { key: 'stamina', abbr: '持' },
  { key: 'mountainUp', abbr: '登' },
  { key: 'mountainDown', abbr: '下' },
  { key: 'pacing', abbr: 'ペ' },
  { key: 'mental', abbr: '精' },
  { key: 'recovery', abbr: '回' },
]

function RadarChart({ ratings: ratingsIn, color, player }: { ratings: Player['ratings']; color: string; player: Player }) {
  const ratings = safeRatings(ratingsIn)   // 能力欠損データでも描画を落とさない
  const cx = 100, cy = 100, R = 66, labelR = 88
  const n = RADAR_KEYS.length
  const ang = (i: number) => ((-90 + (360 / n) * i) * Math.PI) / 180
  const px = (i: number, r: number) => cx + r * Math.cos(ang(i))
  const py = (i: number, r: number) => cy + r * Math.sin(ang(i))
  const polyPts = (r: number) => RADAR_KEYS.map((_, i) => `${px(i,r)},${py(i,r)}`).join(' ')
  const dataPts = RADAR_KEYS.map((a, i) => {
    const ratio = (ratings[a.key] ?? 50) / 100
    return `${px(i, R * ratio)},${py(i, R * ratio)}`
  }).join(' ')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"
      style={{ display: 'block', margin: '0 auto' }}>
      {[0.25, 0.5, 0.75, 1].map(lv => (
        <polygon key={lv} points={polyPts(R * lv)}
          fill="none" stroke={color} strokeWidth={lv === 1 ? 1 : 0.5} opacity={lv === 1 ? 0.4 : 0.1} />
      ))}
      {RADAR_KEYS.map((_, i) => (
        <line key={i} x1={cx} y1={cy} x2={px(i,R)} y2={py(i,R)}
          stroke={color} strokeWidth={0.75} opacity={0.25} />
      ))}
      <polygon points={dataPts}
        fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} strokeLinejoin="round" />
      {RADAR_KEYS.map((a, i) => {
        const ratio = (ratings[a.key] ?? 50) / 100
        return <circle key={i} cx={px(i,R*ratio)} cy={py(i,R*ratio)} r={2.5} fill={color} />
      })}
      {RADAR_KEYS.map((a, i) => {
        const val = ratings[a.key] ?? 50
        const valCol = ratingColor(val, isStatMaxed(player, a.key))
        return (
          <g key={i}>
            <text x={px(i,labelR)} y={py(i,labelR)-6}
              textAnchor="middle" dominantBaseline="middle" fill={color} opacity={0.85}
              fontSize="8" fontWeight="700" fontFamily={SAIRA}>{a.abbr}</text>
            <text x={px(i,labelR)} y={py(i,labelR)+6}
              textAnchor="middle" dominantBaseline="middle" fill={valCol}
              fontSize="11" fontWeight="900" fontFamily={SAIRA}>{val}</text>
          </g>
        )
      })}
    </svg>
  )
}

function OVRSparkline({ history }: { history: { year: number; ovr: number }[] }) {
  if (history.length < 2) return null
  const vals = history.map(h => h.ovr)
  const vmin = Math.min(...vals) - 2, vmax = Math.max(...vals) + 2
  const W = 64, H = 22
  const range = vmax - vmin || 1
  const points = vals.map((v, i) => ({
    x: (i / (vals.length - 1)) * W,
    y: H - ((v - vmin) / range) * H,
  }))
  const pts = points.map(p => `${p.x},${p.y}`).join(' ')
  const last = points[points.length - 1]
  const trend = vals[vals.length - 1] - vals[vals.length - 2]
  const col = trend > 0 ? CARD.green : trend < 0 ? CARD.red : CARD.textDim
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
      <svg width={W} height={H}>
        <polyline points={pts} fill="none" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx={last.x} cy={last.y} r="2.5" fill={col}/>
      </svg>
      <span style={{ fontSize: F.tiny, fontWeight: '700', color: col, fontFamily: 'monospace' }}>
        {trend > 0 ? `+${trend}` : `${trend}`}
      </span>
    </div>
  )
}

export default function PlayerSheet() {
  const {
    openPlayerId, openPlayerSheet, players,
    currentSeason, pastSeasons, playerTeamId,
  } = useGameStore()
  // draftState を購読（安定参照）。pool の ?? [] はセレクタの外で行う（毎回新配列を返すと無限ループになる）
  const draftState = useGameStore(s => s.draftState)
  const draftPool = draftState?.pool ?? []
  // フレンドのロスターなど、通常の players に居ない選手（画面側が一時登録したもの）
  const previewPlayers = usePreviewStore(s => s.players)
  // 国内チーム or 海外クラブから所属を解決（国が違うだけの同じクラブとして引く）
  const clubIndex = useClubIndex()
  const resolveTeam = (id: string) => clubIndex.byId(id)
  const starredOpponents = useGameStore(s => s.starredOpponents) ?? []
  const toggleStarOpponent = useGameStore(s => s.toggleStarOpponent)
  const starredProspects = useGameStore(s => s.starredProspects) ?? []
  const toggleStarProspect = useGameStore(s => s.toggleStarProspect)
  const segmentRecords = useSegmentRecords()
  // 記録パッチ（世界/日本記録・MVP・新人王・区間記録）の解決用
  const worldRecords = useGameStore(s => s.worldRecords)
  const japanRecords = useGameStore(s => s.japanRecords)
  const seasonAwards = useSeasonAwards()
  const eclHistory = useEclHistory()
  const worldRepresentatives = useGameStore(s => s.worldRepresentatives)
  const worldAthleticsResults = useGameStore(s => s.worldAthleticsResults)
  const foreignLeagues = useGameStore(s => s.foreignLeagues)
  const worldTournament = useGameStore(s => s.worldTournament)
  const eventSeasonTops = useGameStore(s => s.eventSeasonTops)
  const setDisplayBadge = useGameStore(s => s.setDisplayBadge)
  const renamePlayer = useGameStore(s => s.renamePlayer)
  const adH = useAdHeight()
  const navigate = useNavigate()

  // レース進行画面(/race・/reserve)の上ではチーム詳細へ飛ばない。
  // 飛ぶとレース画面がアンマウントされ、戻った時に結果画面が消えて次レースの選手選定から始まってしまうため
  const location = useLocation()
  const teamJumpBlocked = location.pathname === '/race' || location.pathname === '/reserve'

  // 在籍履歴のチーム欄タップでそのチームの詳細ページへ（国内/海外で遷移先が異なる）。
  // 遷移先の「戻る」で元の選手詳細に戻れるよう、開いていた選手IDを履歴stateに載せる。
  const goToTeamPage = (teamId: string) => {
    if (teamJumpBlocked) return
    const returnId = openPlayerId
    // 先に遷移し、シートは次フレームで閉じる。先に閉じると下の旧画面が1フレーム見えてチラつく
    const closeNextFrame = () => requestAnimationFrame(() => openPlayerSheet(null))
    const path = clubRoutePath(clubIndex.byId(teamId))
    if (path) {
      navigate(path, { state: { fromPlayerSheet: returnId } })
      closeNextFrame()
    }
  }
  const [page, setPage] = useState(1)
  const [pageAnim, setPageAnim] = useState('')
  const [pageKey, setPageKey] = useState(0)
  const [selectedRaceName, setSelectedRaceName] = useState<string | null>(null)
  const [showBadges, setShowBadges] = useState(false)
  // 名前変更ダイアログ（null＝閉じている。文字列＝入力中の名前）
  const [renameDraft, setRenameDraft] = useState<string | null>(null)
  // 殿堂入りチーム（utils/hofRoster.ts）。登録時の能力で固定するので、ここでは押した結果だけ持つ
  const [hofMsg, setHofMsg] = useState('')
  const hofRoster = useGameStore(s => s.hofRoster) ?? []
  const registerHof = useGameStore(s => s.registerHofPlayer)
  const touchStart = useRef({ x: 0, y: 0 })
  const sheetRef = useRef<HTMLDivElement>(null)
  const shareCardRef = useRef<HTMLDivElement>(null)
  // 在籍履歴：タップで大会別内訳を開閉、長押しでチーム詳細へ
  const [openHist, setOpenHist] = useState<Record<string, boolean>>({})
  const histLpTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const histLpFired = useRef(false)

  const goToPage = (next: number) => {
    if (next === page) return
    setPageAnim(next > page ? 'page-slide-left' : 'page-slide-right')
    setPage(next)
    setPageKey(k => k + 1)
  }

  const openRaceDetail = (name: string) => {
    setSelectedRaceName(name)
    setPageAnim('page-slide-left')
    setPage(4)
    setPageKey(k => k + 1)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  // 通常の選手に加え、スカウトのドラフト候補・ドラフト進行中のプール選手・
  // フレンドのロスター（previewStore に一時登録されたもの）も詳細表示できるよう解決する
  // previewPlayers（フレンドのロスター）を最優先で引く。選手IDはセーブをまたぐと
  // 重複する（初期選手は全員 base-001…、ドラフトも draft-年-連番）ので、自分の players を
  // 先に引くと、フレンドの選手を開いたつもりで自分の同IDの選手（ドラフト順位も自分のもの）が
  // 出てしまう。previewStore はフレンド詳細ページを開いている間しか中身が無い
  const player = previewPlayers.find(p => p.id === openPlayerId)
    ?? players.find(p => p.id === openPlayerId)
    ?? (currentSeason.scoutProspects ?? []).find(p => p.id === openPlayerId)
    ?? draftPool.find(p => p.id === openPlayerId)

  // 別の選手を開いたらページと選択を初期化する。
  // これを useEffect でやると、開いた直後の1フレームだけ**前の選手のページ**が出る
  // （引退選手を閉じて次を開くと2ページ目が一瞬見える）。描画中に直すのが正しい形。
  // 引退選手は1ページ目を出さないので2ページ目から開く。
  // フレンドのロスターは1ページ目しか無いので必ず1から（下の pages と揃える）
  const [shownPlayerId, setShownPlayerId] = useState<string | null>(openPlayerId)
  if (shownPlayerId !== openPlayerId) {
    setShownPlayerId(openPlayerId)
    const preview = previewPlayers.some(p => p.id === openPlayerId)
    setPage(!preview && player?.status === 'retired' ? 2 : 1)
    setSelectedRaceName(null)
    setShowBadges(false)
  }

  // シート表示中は背景ページのスクロールをロックする
  useEffect(() => {
    if (!player) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [player?.id])

  if (!player) return null

  const team = clubIndex.byId(player.teamId)
  const isMyPlayer = player.teamId === playerTeamId
  const hofEntry = hofRoster.find(h => h.player.id === player.id)
  const inHof = !!hofEntry
  const hofCount = hofRoster.length
  // 記録パッチ（最大5個・優先順: 世界>日本>MVP>新人王>区間記録）
  // パッチ選択は専用ページ（スクロール可）なので上限なしで全部出す（5個で打ち切らない）
  const badges = getPlayerBadges(player, { worldRecords, japanRecords, seasonAwards, segmentRecords, eclHistory, worldRepresentatives, eventSeasonTops, worldAthleticsResults, worldTournament }, 99)
  const handleShare = async () => {
    if (!shareCardRef.current) return
    try {
      const { shareElementAsImage } = await import('../../utils/shareImage')
      await shareElementAsImage(shareCardRef.current, { filename: `${player.name}.png`, title: player.name, text: `${player.name} OVR${ovr(player)} #JPELManager` })
    } catch (e) { console.error('share failed', e) }
  }
  // ドラフト候補は詳細ページを簡略表示にする。
  // ドラフト進行中は候補が state.players に teamId '__pool__' / status 'draft_eligible' で入るため、
  // 「playersに居ない」だけだと判定できずフル詳細が開いてしまう。status で確実に候補と判定する。
  // ただしフレンドのロスター（previewStore に一時登録した選手）は、自分の players に居ないだけで
  // ドラフト候補ではない。除外しないと「所属＝出身校／予想指名順位」のドラフト用画面が出てしまう。
  const isPreview = previewPlayers.some(p => p.id === player.id)
  const isProspect = !isPreview && (
    player.status === 'draft_eligible'
    || player.teamId === '__pool__'
    || !players.some(p => p.id === player.id)
  )
  const isRetired = player.status === 'retired'
  // このシートで出すページ。ここが唯一の置き場所（丸ぽち・スワイプ・各ページの出し分けが全部これを見る）。
  // フレンドのロスターはプロフィール（＝パッチ）だけ。駅伝データと在籍履歴は
  // 「自分のセーブのレース記録」から数えていて、フレンドの選手だと中身が嘘になるため出さない
  const pages = isPreview ? [1] : isProspect ? [1, 2] : isRetired ? [2, 3] : [1, 2, 3]

  // 横スワイプのページ送り。どのページがあるかは上の pages だけを見る
  // （前はここでページ数を別に数え直していて、ページを増減すると片方だけズレた）
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (page === 4) return
    const dx = e.changedTouches[0].clientX - touchStart.current.x
    const dy = e.changedTouches[0].clientY - touchStart.current.y
    if (Math.abs(dx) <= Math.abs(dy) || Math.abs(dx) <= 48) return
    const i = pages.indexOf(page)
    if (i < 0) return
    if (dx < 0 && i < pages.length - 1) goToPage(pages[i + 1])
    if (dx > 0 && i > 0) goToPage(pages[i - 1])
  }
  // ドラフト候補の予想指名順位。生成時に焼き込んだ player.predictedPick を使う（ドラフト中も不変）。
  // predictedPick が無い旧セーブだけ、その場で母集団から推定する（scout/draftどちらのプールでも）。
  const predictedPick = isProspect
    ? (player.predictedPick ?? (() => {
        const val = (pl: typeof player) => ovr(pl) + (pl.potential ?? 0) * 0.5
        const scoutPool = currentSeason.scoutProspects ?? []
        const basePool = scoutPool.some(p => p.id === player.id) ? scoutPool : draftPool
        const pool = [...basePool].sort((a, b) => val(b) - val(a))
        const idx = pool.findIndex(p => p.id === player.id)
        return idx >= 0 ? idx + 1 : null
      })())
    : null
  const playerOvr = ovr(player)
  const specCol = SPEC_COLOR[player.specialty]

  type RaceEntry = { year: number; segIdx: number; distKm?: number; rank: number; timeSec: number }
  // 走ったレースを「リーグ → 駅伝名」で並べる。**どこから拾うかは utils/raceHistory の1本**
  // （自分の部・他の部・大学・2軍・ECL・海外リーグ・世界大会。足し忘れると表示から消える）。
  // 同じ駅伝名でも部が違えば別の記録として持つ（1部の出雲開幕戦と3部の出雲開幕戦）。
  // 走った駅伝は utils/raceHistory の ranRaces 1本で受け取る（自分の部・他の部・大学・
  // 2軍・ECL・海外・世界大会が、どの部のものかのラベル付きで全部返る）。
  // ここで日程を自分で組み立てると、自分の部の分しか数えない書き方に必ず戻る。
  const ranRows = ranRaces({
    seasons: [...pastSeasons, currentSeason],
    waResults: worldAthleticsResults,
    playerTeamId,
    foreignLeagues,
  })
  const raceGroupMap = new Map<string, RaceEntry[]>()
  const raceGroups: { league: string; order: number; names: string[] }[] = []
  {
    const byLeague = new Map<string, { league: string; order: number; names: string[] }>()
    for (const { year, league, order, race } of ranRows) {
      const sr = race.results!.segmentResults.find(sg => sg.runners.some(r => r.playerId === player.id))
      if (!sr) continue
      const runner = sr.runners.find(r => r.playerId === player.id)!
      const seg = race.segments?.find(sg => sg.index === sr.segmentIndex)
      const key = raceKey(league, race.name)
      const list = raceGroupMap.get(key)
      const entry = { year, segIdx: sr.segmentIndex, distKm: seg?.distanceKm, rank: runner.rank, timeSec: runner.timeSec }
      if (list) list.push(entry)
      else raceGroupMap.set(key, [entry])
      let g = byLeague.get(league)
      if (!g) { g = { league, order, names: [] }; byLeague.set(league, g) }
      if (!g.names.includes(race.name)) g.names.push(race.name)
    }
    raceGroups.push(...[...byLeague.values()].sort((a, b) => a.order - b.order || a.league.localeCompare(b.league)))
    for (const g of raceGroups) g.names.sort()
  }

  // 在籍履歴（移籍情報）集計：年 × teamId × 大会(1軍/リザーブ/ECL/海外) ごとに 出場数・区間賞数・平均区間順位。
  // 表示は年×チームの親行に集約し、タップで大会別の内訳を開く（組み立ては utils/careerStats へ移設）
  const isForeignClub = clubIndex.byId(player.teamId)?.isDomestic === false
  const historyMap = buildPlayerHistory({
    playerId: player.id,
    playerTeamId: player.teamId,
    isRetired,
    ranRows,
    pastSeasons,
    currentSeason,
    isForeignClub,
  })
  // 年×チームの親行へ集約（内訳は 1軍→リザーブ→ECL→海外 の順）
  type HistParent = { year: number; teamId: string; races: number; wins: number; rankSum: number; rankedRaces: number; comps: HistoryRow[] }
  const COMP_ORDER: Record<HistComp, number> = { main: 0, second: 1, ecl: 2, foreign: 3 }
  const histParentMap = new Map<string, HistParent>()
  for (const r of historyMap.values()) {
    const key = `${r.year}|${r.teamId}`
    let p = histParentMap.get(key)
    if (!p) { p = { year: r.year, teamId: r.teamId, races: 0, wins: 0, rankSum: 0, rankedRaces: 0, comps: [] }; histParentMap.set(key, p) }
    p.races += r.races; p.wins += r.wins; p.rankSum += r.rankSum; p.rankedRaces += r.rankedRaces
    p.comps.push(r)
  }
  for (const p of histParentMap.values()) p.comps.sort((a, b) => COMP_ORDER[a.comp] - COMP_ORDER[b.comp])
  // 同じ年に2チーム（シーズン中の移籍）がある場合は、現所属チームを必ず上にする
  const historyRows = [...histParentMap.values()].sort(
    (a, b) => b.year - a.year
      || (a.teamId === b.teamId ? 0 : a.teamId === player.teamId ? -1 : b.teamId === player.teamId ? 1 : 0)
  )
  // 海外の内訳行だけリーグ名/リーグロゴを出す。国内チームのIDが来たら今までどおり無し扱い
  const foreignClubOf = (tid: string) => { const cl = clubIndex.byId(tid); return cl && !cl.isDomestic ? cl : undefined }
  // JPELは部まで出す。2部・3部は「格落ち」なので、ただの JPEL と同じ表記だと区別がつかない。
  //
  // ★部は「その行の年」から引くこと。**チームの現在値（divisionOf）で引かないこと。**
  //   以前は divisionOf(resolveTeam(tid)?.team) ＝ 今の部だったので、降格した瞬間に
  //   2部で走った過去の年まで「JPEL 3部」に書き換わっていた。
  //   その年どの部にいたかは順位表に残っている（部ごとに分けて持っている）ので、
  //   utils/league の divisionInYear 1本で引ける。ここで新しい判定を書かないこと。
  const jpelLabel = (year: number, tid: string) => {
    const d = divisionInYear([...pastSeasons, currentSeason], year, tid, divisionOf(resolveTeam(tid)?.team))
    return d === 1 ? 'JPEL' : `JPEL ${DIVISION_LABEL[d]}`
  }
  const histCompLabel = (c: HistoryRow) =>
    c.comp === 'main' ? jpelLabel(c.year, c.teamId)
    : c.comp === 'second' ? 'JPELリザーブリーグ'
    : c.comp === 'ecl' ? 'ECL'
    : (foreignClubOf(c.teamId)?.leagueName ?? '海外リーグ')
  // 内訳行のリーグロゴ（リザーブはJPELロゴを使う。海外は所属リーグのロゴ）
  const histCompLogoId = (c: HistoryRow) =>
    c.comp === 'main' || c.comp === 'second' ? 'jpel'
    : c.comp === 'ecl' ? 'ecl'
    : (foreignClubOf(c.teamId)?.leagueId ?? null)
  // 平均区間順位（データの無い海外出場分は分母に入れない）
  const histAvg = (r: { rankSum: number; rankedRaces: number }) => r.rankedRaces > 0 ? r.rankSum / r.rankedRaces : null
  const histAvgColor = (v: number) => v <= 3 ? C.green : v <= 6 ? CARD.gold : CARD.textGhost

  return (
    <>
      {/* SNS共有用カード（画面外に描画してキャプチャする） */}
      <div ref={shareCardRef} style={{ position: 'fixed', left: '-99999px', top: 0, pointerEvents: 'none' }}>
        <ShareCard player={player} team={team} />
      </div>
      <div
        onClick={() => openPlayerSheet(null)}
        style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 200 }}
      />
      {/* 記録パッチ専用パネル（閲覧＋自チームは表示パッチ選択） */}
      {showBadges && (
        <div style={{
          position: 'fixed', top: 'env(safe-area-inset-top)', bottom: bottomStack(adH),
          left: 0, right: 0, margin: '0 auto', width: '100%', maxWidth: '480px', zIndex: 210,
          background: CARD.bg,overflowY: 'auto',
          fontFamily: FONT,
        }}>
          <div style={{ padding: '10px 12px 2px' }}><BackButton onClick={() => setShowBadges(false)} /></div>
          <div style={{ padding: '0 20px 4px' }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.head, fontWeight: 900, color: CARD.text }}>記録パッチ</div>
            <div style={{ fontSize: F.caption, color: CARD.textGhost, marginTop: 2 }}>
              {player.name} · {badges.length}個{isMyPlayer ? ' · タップでロスターに表示するパッチを選択' : ''}
            </div>
          </div>
          <div style={{ padding: '14px 20px 48px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {badges.map(b => {
              const col = badgeColor(b)
              // 未選択なら優先順トップが自動表示されている（PlayerRowと同じルール）ので、それを「表示中」として見せる
              const selected = (player.displayBadge ?? badges[0]?.key) === b.key
              return (
                <div
                  key={b.key}
                  onClick={isMyPlayer ? () => setDisplayBadge(player.id, selected ? null : b.key) : undefined}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                    background: `linear-gradient(180deg, ${col}22, ${col}0C)`,
                    border: `1px solid ${selected ? col : `${col}44`}`,
                    boxShadow: selected ? `0 0 10px ${col}55` : 'none',
                    cursor: isMyPlayer ? 'pointer' : 'default',
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: F.bodyLg, fontWeight: 800, color: col }}><BadgeContent badge={b} iconSize={13} /></span>
                  {isMyPlayer && (
                    <span style={{ fontSize: F.caption, fontWeight: 900, color: selected ? col : CARD.textGhost }}>
                      {selected ? '表示中 ✓' : '選択'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{
          // 上端はダイナミックアイランドの下（セーフエリア）から。下は広告バナー＋ホームバーの上で止める。
          position: 'fixed', top: 'env(safe-area-inset-top)', bottom: bottomStack(adH), left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: '480px',
          overflowY: 'auto',
          touchAction: 'pan-y',
          backgroundColor: C.bg,
          zIndex: 201,
          fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
        }}
      >
        {/* Top bar */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          display: 'flex', alignItems: 'center',
          padding: '12px 16px',
          backgroundColor: C.bg,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <BackButton onClick={() => page === 4 ? goToPage(2) : openPlayerSheet(null)}/>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
            {page === 4 ? (
              <span style={{ fontSize: F.body, fontWeight: '700', color: CARD.text }}>
                {(() => { const { league, raceName } = splitRaceKey(selectedRaceName ?? ''); return league ? `${league} ${shortRaceName(league, raceName)}` : raceName })()}
              </span>
            ) : (
              pages.map(p => (
                <div key={p} onClick={() => goToPage(p)} style={{
                  width: page === p ? '20px' : '6px', height: '6px',
                  backgroundColor: page === p ? specCol : CARD.border,
                  transition: 'width 0.2s, background-color 0.2s',
                  cursor: 'pointer',
                }} />
              ))
            )}
          </div>
          <div style={{ minWidth: '52px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px' }}>
            <button onClick={handleShare} title="共有" data-html2canvas-ignore="true" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8FA6C8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>
              </svg>
            </button>
            {!isMyPlayer && page !== 4 && (() => {
              const starred = isProspect ? starredProspects.includes(player.id) : starredOpponents.includes(player.id)
              return (
                <button onClick={() => isProspect ? toggleStarProspect(player.id) : toggleStarOpponent(player.id)} title={isProspect ? '注目リスト' : 'ウォッチリスト'} data-html2canvas-ignore="true" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill={starred ? C.gold : 'none'} stroke={starred ? C.gold : CARD.textGhost} strokeWidth="1.8">
                    <path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z" strokeLinejoin="round"/>
                  </svg>
                </button>
              )
            })()}
          </div>
        </div>

        {/* Header */}
        <div style={{ padding: '12px 20px 14px', background: `linear-gradient(135deg, ${specCol}10, transparent)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flexShrink: 0, position: 'relative',overflow: 'hidden', border: `1.5px solid ${specCol}40` }}>
              <PlayerFace playerId={player.id} nationality={player.nationality} size={64} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: F.titleLg, fontWeight: '900', color: CARD.text }}>{player.name}</span>
                {/* 自チームの選手だけ、名前の横のペンから改名できる */}
                {isMyPlayer && !isProspect && (
                  <button
                    onClick={() => setRenameDraft(player.name)}
                    title="名前を変更"
                    data-html2canvas-ignore="true"
                    style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={CARD.textGhost} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                    </svg>
                  </button>
                )}
                <ForeignChip nationality={player.nationality} />
                {player.status === 'injured' && (
                  <span style={{ fontSize: F.micro, padding: '1px 5px',backgroundColor: `${CARD.red}18`, border: `1px solid ${CARD.red}35`, color: CARD.red, fontWeight: '700' }}>負傷中</span>
                )}
              </div>
              <div style={{ fontSize: F.caption, color: CARD.textGhost, marginBottom: '6px' }}>{player.nameKana}</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ padding: '2px 8px',backgroundColor: `${specCol}18`, color: specCol, fontSize: F.caption, fontWeight: '700' }}>
                  {SPECIALTY_LABELS[player.specialty]}
                </span>
                <span style={{ fontSize: F.caption, color: CARD.textGhost }}>{`${player.age}歳 / ${player.yearsPro + 1}年目`}</span>
              </div>
              {/* パッチは1ページ目のある選手だけヘッダーから。1ページ目が無い引退選手は2ページ目に同じボタンがある */}
              {pages.includes(1) && badges.length > 0 && (
                <button
                  onClick={() => setShowBadges(true)}
                  style={{
                    marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                    padding: '4px 10px',background: `linear-gradient(180deg, ${CARD.gold}22, ${CARD.gold}0E)`,
                    border: `1px solid ${CARD.gold}55`, color: CARD.gold, fontFamily: 'inherit', fontWeight: 800, fontSize: F.caption,
                  }}
                >
                  パッチを確認する
                  <span style={{ fontFamily: SAIRA, fontWeight: 900 }}>{badges.length}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                </button>
              )}
            </div>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '32px', fontWeight: '900', color: ratingColor(playerOvr), fontFamily: 'monospace', lineHeight: 1 }}>{playerOvr}</div>
              <div style={{ fontSize: F.micro, color: CARD.textGhost, letterSpacing: '1px' }}>OVR</div>
              {player.ovrHistory && player.ovrHistory.length >= 2 && (
                <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                  <OVRSparkline history={player.ovrHistory}/>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Page content (animated) */}
        <div key={pageKey} className={pageAnim}>

          {/* Page 1: プロフィール */}
          {page === 1 && !isRetired && (
            <div style={{ padding: '0 20px 28px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* 記録パッチは「パッチを確認する」から専用パネルで閲覧・選択（詳細画面には列挙しない） */}
              <RadarChart ratings={player.ratings} color={specCol} player={player} />
              {isProspect ? (
                <>
                  <div style={{ padding: '8px 10px',backgroundColor: CARD.surface, border: `1px solid ${CARD.surface3}` }}>
                    <div style={{ fontSize: F.micro, color: CARD.textGhost, marginBottom: '2px' }}>所属</div>
                    <div style={{ fontSize: F.body, fontWeight: '600', color: CARD.textDim }}>{player.origin}</div>
                  </div>
                  <div style={{ padding: '8px 10px',backgroundColor: CARD.surface, border: `1px solid ${CARD.surface3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: F.micro, color: CARD.textGhost }}>予想指名順位</div>
                    <div style={{ fontSize: F.body, fontWeight: '700', color: (predictedPick && predictedPick <= 40) ? CARD.gold : CARD.textGhost, fontFamily: 'monospace' }}>
                      {predictedPick && predictedPick <= 40 ? `${Math.ceil(predictedPick / 20)}巡目 全体${predictedPick}位` : '指名圏外'}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: '所属', val: resolveTeam(player.teamId)?.name ?? (player.teamId === '' ? '未所属' : '—') },
                      { label: '出身', val: player.origin },
                      { label: '成長タイプ', val: player.growthCurve === 'early' ? '早熟' : player.growthCurve === 'late_bloomer' ? '晩成' : '標準' },
                      { label: '市場価値', val: fmtYen(calcTransferValue(player)) },
                      { label: '契約残', val: player.contract ? `${player.contract.yearsLeft}年` : '—' },
                      { label: '年俸', val: player.contract ? fmtYen(player.contract.annualSalary) : '—' },
                      { label: 'ドラフト', val: player.draftRound && player.draftPick != null ? `${player.draftYear}年 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外' },
                      // 殿堂入り済みなら「いつ・どのクラブの姿で固定したか」。殿堂入りチームから開いた
                      // 凍らせたコピーもここを通るので、登録時期はこの1ページ目だけ見ればわかる
                      ...(hofEntry ? [{ label: '殿堂入り', val: `${hofEntry.year}年 ${hofEntry.teamName}` }] : []),
                    ].map(({ label, val }) => (
                      <div key={label} style={{ padding: '8px 10px',backgroundColor: CARD.surface, border: `1px solid ${CARD.surface3}` }}>
                        <div style={{ fontSize: F.micro, color: CARD.textGhost, marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: F.body, fontWeight: '600', color: CARD.textDim }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* 殿堂入りチーム（utils/hofRoster.ts）。押した瞬間の能力で固定される。
                      もう一度押すとそのときの能力で入れ替わる。
                      いつ・どのクラブの姿で固定したかは上の「殿堂入り」の欄に出ているので、
                      ボタンには出さない（同じことを2か所に書かない）。

                      登録していい相手かは hofRoster の isHofEligible 1本。
                      レンタルで借りている選手は teamId が自クラブになるので、isMyPlayer だけだと
                      借り物まで殿堂入りに登録できてしまっていた。

                      isPreview を見るのは、フレンドや殿堂入りチームから開いた選手を弾くため。
                      別のセーブの選手なので teamId が自分と同じことがあり、それだけでは通ってしまう */}
                  {!isPreview && isHofEligible(player, playerTeamId) && (
                    <div data-html2canvas-ignore="true" style={{ marginTop: 8 }}>
                      <button
                        onClick={() => { if (!registerHof(player.id)) setHofMsg(`殿堂入りは${HOF_MAX}人までです`); else setHofMsg(inHof ? '殿堂入りの能力を今の値に更新しました' : '殿堂入りチームに登録しました') }}
                        style={{
                          width: '100%', padding: '11px 14px',cursor: 'pointer', fontFamily: 'inherit',
                          background: inHof ? 'transparent' : `linear-gradient(180deg, ${CARD.goldHi} 0%, ${CARD.gold} 60%, ${CARD.goldDark} 100%)`,
                          border: `2px solid ${inHof ? `${CARD.gold}66` : CARD.goldDark}`,
                          color: inHof ? CARD.gold : '#1a0d00', fontSize: F.bodyLg, fontWeight: 900,
                        }}
                      >
                        {inHof ? '殿堂入り更新' : '殿堂入り登録'}
                      </button>
                      <div style={{ fontSize: F.caption, color: CARD.textGhost, marginTop: 6, lineHeight: 1.6 }}>
                        {hofMsg || `${hofCount}/${HOF_MAX}人`}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Page 2: 駅伝データ */}
          {page === 2 && pages.includes(2) && (
            <div style={{ padding: '12px 20px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* 引退選手は1ページ目（パッチ表示）を出さないので、現役と同じ「パッチを見る」ボタンをここに置く
                  （前は全パッチをそのまま並べていて、多い選手だと画面がパッチだらけになっていた） */}
              {isRetired && badges.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <button
                    onClick={() => setShowBadges(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                      padding: '5px 12px',background: `linear-gradient(180deg, ${CARD.gold}22, ${CARD.gold}0E)`,
                      border: `1px solid ${CARD.gold}55`, color: CARD.gold, fontFamily: 'inherit', fontWeight: 800, fontSize: F.caption,
                    }}
                  >
                    パッチを見る
                    <span style={{ fontFamily: SAIRA, fontWeight: 900 }}>{badges.length}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                  </button>
                </div>
              )}

              {/* 引退選手は1ページ目を出さないので、ドラフト情報をここに移植 */}
              {isRetired && (() => {
                // 引退年：retiredYear が無い旧セーブは最後に出走した年から推定
                let lastRaceYear: number | null = null
                for (const es of raceGroupMap.values()) for (const e of es) {
                  if (lastRaceYear == null || e.year > lastRaceYear) lastRaceYear = e.year
                }
                const retYear = player.retiredYear ?? lastRaceYear
                return (
                  <>
                    <div style={{ padding: '8px 10px',backgroundColor: CARD.surface, border: `1px solid ${CARD.surface3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: F.micro, color: CARD.textGhost }}>国籍</div>
                      <div style={{ fontSize: F.body, fontWeight: '600', color: CARD.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Flag code={player.nationality} width={18} />
                        {natLabel(player.nationality)}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px',backgroundColor: 'rgba(232,70,42,0.08)', border: '1px solid rgba(232,70,42,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: F.micro, color: CARD.textGhost }}>引退</div>
                      <div style={{ fontSize: F.body, fontWeight: '800', color: CARD.red }}>
                        {retYear != null ? `${retYear}年 引退` : '引退済み'}
                      </div>
                    </div>
                    <div style={{ padding: '8px 10px',backgroundColor: CARD.surface, border: `1px solid ${CARD.surface3}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: F.micro, color: CARD.textGhost }}>ドラフト</div>
                      <div style={{ fontSize: F.body, fontWeight: '600', color: CARD.textDim }}>
                        {player.draftRound && player.draftPick != null ? `${player.draftYear}年 全体${(player.draftRound - 1) * 20 + player.draftPick}位` : 'ドラフト外'}
                      </div>
                    </div>
                  </>
                )
              })()}

              {/* 自己ベスト（種目別・記録会で走った実タイムのみ）。種目を横に並べてタイムを下に置く */}
              <div>
                <div style={{ fontSize: F.tiny, fontWeight: '800', color: CARD.textGhost, letterSpacing: '2px', marginBottom: '6px' }}>自己ベスト</div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${EVENT_DISTANCES.length}, 1fr)`,overflow: 'hidden', border: `1px solid ${CARD.surface3}`, background: CARD.surface }}>
                  {EVENT_DISTANCES.map((d, i) => {
                    const best = player.eventBests?.[d]
                    return (
                      <div key={d} style={{ padding: '9px 4px', textAlign: 'center', borderLeft: i > 0 ? `1px solid ${CARD.surface2}` : 'none' }}>
                        <div style={{ fontSize: F.caption, fontWeight: '700', color: '#8B87A0', marginBottom: '4px' }}>{EVENT_LABEL[d]}</div>
                        {best ? (
                          <>
                            <div style={{ fontFamily: 'monospace', fontSize: F.bodyLg, fontWeight: '900', color: CARD.gold }}>{formatRaceTime(best.timeSec)}</div>
                            <div style={{ fontSize: F.micro, color: CARD.textGhost, marginTop: '1px' }}>{`'${String(best.year).slice(2)}`}</div>
                          </>
                        ) : (
                          <div style={{ fontSize: F.body, color: CARD.border2 }}>—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 走った大会だけを「リーグ → 駅伝名」で並べる（ドラフト候補では非表示）。
                  拾い方は utils/raceHistory の1本。まだ走っていない大会は出さない
                  （海外クラブの選手にJPELの10本が空欄で並ぶ、というのが実際に起きていた）。
                  同じ駅伝名でも部が違えば別の大会として並ぶ（1部の出雲開幕戦と3部の出雲開幕戦）。 */}
              {!isProspect && raceGroups.map(g => (
                <div key={g.league}>
                  <div style={{ fontSize: F.tiny, fontWeight: '800', color: CARD.textGhost, letterSpacing: '2px', marginBottom: '6px' }}>{g.league}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                    {g.names.map(name => (
                      <div key={name} onClick={() => openRaceDetail(raceKey(g.league, name))} style={{
                        padding: '10px 6px',border: `1px solid ${CARD.surface3}`, backgroundColor: CARD.surface,
                        cursor: 'pointer', textAlign: 'center', minHeight: 44,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: F.caption, fontWeight: '700', lineHeight: 1.25, color: CARD.text }}>{shortRaceName(g.league, name)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* 世界選手権の個人種目（5000m 等）。駅伝ではないので大会の並びとは別に置く */}
              {!isProspect && (() => {
                const indLabels = (['5000m', '10000m', 'マラソン'] as const).filter(label => {
                  const ev = label === '5000m' ? 'd5000' : label === '10000m' ? 'd10000' : 'marathon'
                  return (worldAthleticsResults ?? []).some(wr =>
                    wr.kind === 'main' && wr.meet.individuals.some(ir => ir.event === ev && ir.placings.some(pl => pl.playerId === player.id)))
                })
                if (indLabels.length === 0) return null
                return (
                  <div>
                    <div style={{ fontSize: F.tiny, fontWeight: '800', color: C.purple, letterSpacing: '2px', marginBottom: '6px' }}>世界選手権 個人種目</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px' }}>
                      {indLabels.map(label => (
                        <div key={label} onClick={() => openRaceDetail(`世界選手権 ${label}`)} style={{
                          padding: '10px 6px',border: '1px solid rgba(168,85,247,0.35)', backgroundColor: CARD.surface,
                          cursor: 'pointer', textAlign: 'center', minHeight: 44,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <span style={{ fontSize: F.caption, fontWeight: '700', lineHeight: 1.25, color: CARD.text }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Page 3: 在籍履歴（移籍情報）。ドラフト候補・フレンドのロスターでは非表示 */}
          {page === 3 && pages.includes(3) && (
            <div style={{ padding: '12px 20px 28px' }}>
              <div style={{ fontSize: F.tiny, fontWeight: '800', color: CARD.textGhost, letterSpacing: '2px', marginBottom: '8px' }}>在籍履歴</div>
              {historyRows.length > 0 ? (
                <div style={{overflow: 'hidden', border: `1px solid ${CARD.surface3}` }}>
                  {/* header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: CARD.surface, borderBottom: `1px solid ${CARD.surface3}` }}>
                    <span style={{ width: '36px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost }}>年</span>
                    <span style={{ flex: 1, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost }}>チーム名</span>
                    <span style={{ width: '28px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>出場</span>
                    <span style={{ width: '32px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>区間賞</span>
                    <span style={{ width: '36px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>平均</span>
                    <span style={{ width: '10px', flexShrink: 0 }}/>
                  </div>
                  {historyRows.map((row, i) => {
                    const t = resolveTeam(row.teamId)
                    // 無所属(FA)の年はチーム名なし＝「未所属」表示
                    const teamName = t?.name ?? t?.shortName ?? (row.teamId === '' ? '未所属' : '')
                    const isLoan = (player.loanTeamYears ?? []).some(l => l.year === row.year && l.teamId === row.teamId)
                      || (row.year === currentSeason.year && !!player.loan && row.teamId === player.teamId)
                    const histKey = `${row.year}|${row.teamId}`
                    const open = !!openHist[histKey]
                    const canJump = !!t && !teamJumpBlocked
                    const avg = histAvg(row)
                    // タップ=内訳の開閉 / 長押し=チーム詳細へ
                    const cancelLp = () => { if (histLpTimer.current) clearTimeout(histLpTimer.current) }
                    return (
                      <div key={histKey}>
                        <div
                          onPointerDown={() => { histLpFired.current = false; if (canJump) histLpTimer.current = setTimeout(() => { histLpFired.current = true; goToTeamPage(row.teamId) }, 450) }}
                          onPointerUp={cancelLp}
                          onPointerLeave={cancelLp}
                          onPointerMove={cancelLp}
                          onClick={() => { if (!histLpFired.current) setOpenHist(prev => ({ ...prev, [histKey]: !prev[histKey] })) }}
                          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderBottom: i < historyRows.length - 1 || open ? `1px solid ${CARD.surface2}` : 'none', backgroundColor: i % 2 === 0 ? CARD.bg : 'transparent', cursor: 'pointer' }}
                        >
                          <span style={{ width: '36px', flexShrink: 0, fontSize: F.body, color: CARD.textGhost, fontFamily: 'monospace' }}>{row.year}</span>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            {t && <TeamLogoSVG primary={t.colors.primary} secondary={t.colors.secondary} shortName={t.shortName} teamId={t.id} size={20} />}
                            <span style={{ fontSize: F.body, fontWeight: '700', color: CARD.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {teamName}
                              {isLoan && <span style={{ fontSize: F.caption, color: CARD.textDim, marginLeft: '3px' }}>(L)</span>}
                              {isRetired && i === 0 && <span style={{ fontSize: F.tiny, fontWeight: 800, color: CARD.red, marginLeft: '5px', padding: '1px 5px',background: 'rgba(232,70,42,0.12)', border: '1px solid rgba(232,70,42,0.3)' }}>引退済み</span>}
                            </span>
                          </div>
                          <span style={{ width: '28px', flexShrink: 0, fontSize: F.bodyLg, fontWeight: '900', color: CARD.textDim, fontFamily: 'monospace', textAlign: 'center' }}>{row.races}</span>
                          <span style={{ width: '32px', flexShrink: 0, fontSize: F.bodyLg, fontWeight: '900', color: row.wins > 0 ? CARD.gold : CARD.border2, fontFamily: 'monospace', textAlign: 'center' }}>{row.wins}</span>
                          <span style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                            {avg != null ? (
                              <span style={{ fontSize: F.label, fontWeight: '900', fontFamily: 'monospace', padding: '2px 5px',background: histAvgColor(avg), color: CARD.bg }}>{avg.toFixed(1)}</span>
                            ) : (
                              <span style={{ fontSize: F.label, color: CARD.border2 }}>—</span>
                            )}
                          </span>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: CARD.textGhost, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                          </svg>
                        </div>
                        {/* 大会別の内訳（1軍リーグ / リザーブ / ECL / 海外リーグ） */}
                        {open && row.comps.map((c, ci) => {
                          const cavg = histAvg(c)
                          return (
                            <div key={c.comp} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: CARD.bg0, borderBottom: ci < row.comps.length - 1 || i < historyRows.length - 1 ? `1px solid ${CARD.surface2}` : 'none' }}>
                              <span style={{ width: '36px', flexShrink: 0 }}/>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                {histCompLogoId(c) && <LeagueLogoSVG leagueId={histCompLogoId(c)!} size={16} />}
                                <span style={{ fontSize: F.label, fontWeight: '700', color: CARD.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{histCompLabel(c)}</span>
                              </div>
                              <span style={{ width: '28px', flexShrink: 0, fontSize: F.body, fontWeight: '900', color: CARD.textDim, fontFamily: 'monospace', textAlign: 'center' }}>{c.races}</span>
                              <span style={{ width: '32px', flexShrink: 0, fontSize: F.body, fontWeight: '900', color: c.wins > 0 ? CARD.gold : CARD.border2, fontFamily: 'monospace', textAlign: 'center' }}>{c.wins}</span>
                              <span style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                                {cavg != null ? (
                                  <span style={{ fontSize: F.caption, fontWeight: '900', fontFamily: 'monospace', padding: '1px 4px',background: histAvgColor(cavg), color: CARD.bg }}>{cavg.toFixed(1)}</span>
                                ) : (
                                  <span style={{ fontSize: F.label, color: CARD.border2 }}>—</span>
                                )}
                              </span>
                              <span style={{ width: '10px', flexShrink: 0 }}/>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: CARD.border2, fontSize: F.bodyLg, padding: '48px 0' }}>記録なし</div>
              )}

              {/* 代表チーム（世界選手権）。クラブの在籍履歴と同じテーブル形式で分けて下に置く */}
              {(() => {
                type CompLine = { label: string; races: number; wins: number; rankSum: number; ranked: number; ind?: boolean; indRank?: number }
                type NatRow = { year: number; races: number; wins: number; rankSum: number; ranked: number; comps: Map<string, CompLine> }
                const byYear = new Map<number, NatRow>()
                const touch = (year: number): NatRow => {
                  let r = byYear.get(year)
                  if (!r) { r = { year, races: 0, wins: 0, rankSum: 0, ranked: 0, comps: new Map() }; byYear.set(year, r) }
                  return r
                }
                // 駅伝出走（保存済みレース詳細から集計。クラブの在籍履歴と同じ 出場/区間賞/平均）。
                // 本戦・アジア予選・大陸予選を分けず、utils/waRaces の1本から受け取る
                for (const { year, label, race } of waRaceRows([...pastSeasons, currentSeason], worldAthleticsResults)) {
                  const sr = race.results!.segmentResults.find((s2: { runners: { playerId: string }[] }) => s2.runners.some(rn => rn.playerId === player.id))
                  if (!sr) continue
                  const runner = sr.runners.find(rn => rn.playerId === player.id)!
                  const compLabel = `${label} 駅伝`
                  const row = touch(year)
                  row.races += 1
                  if (runner.rank === 1) row.wins += 1
                  if (runner.rank != null) { row.rankSum += runner.rank; row.ranked += 1 }
                  let c = row.comps.get(compLabel)
                  if (!c) { c = { label: compLabel, races: 0, wins: 0, rankSum: 0, ranked: 0 }; row.comps.set(compLabel, c) }
                  c.races += 1
                  if (runner.rank === 1) c.wins += 1
                  if (runner.rank != null) { c.rankSum += runner.rank; c.ranked += 1 }
                }
                // 在籍テーブルは駅伝のみ（個人種目は2ページ目の世界選手権セクションで見る）。
                // レース詳細が無い代表（0走・大陸予選など）も、地域に応じた大会名で行を出す。
                //  本戦=世界選手権／アジア=世界選手権アジア予選／欧州=ユーロ予選／アフリカ=アフリカ予選／アメリカ=アメリカ予選
                const compLabelFor = (year: number): string => {
                  const isMainYear = (year - 2028) % 2 === 0
                  if (isMainYear) return '世界選手権 駅伝'
                  const g = natGeoRegion(player.nationality)
                  if (g === 'アジア' || g === 'オセアニア') return '世界選手権アジア予選 駅伝'
                  if (g === 'ヨーロッパ') return 'ユーロ予選 駅伝'
                  if (g === 'アフリカ') return 'アフリカ予選 駅伝'
                  if (g === 'アメリカ大陸') return 'アメリカ予選 駅伝'
                  return '世界選手権予選 駅伝'
                }
                const addRepRow = (year: number) => {
                  const row = touch(year)
                  const label = compLabelFor(year)
                  // レース出走で既にこの大会の行がある年は追加しない（重複防止）。0走の代表だけ行を作る
                  if (!row.comps.has(label)) row.comps.set(label, { label, races: 0, wins: 0, rankSum: 0, ranked: 0 })
                }
                for (const rep of worldRepresentatives ?? []) {
                  if (rep.playerId !== player.id || rep.label !== '駅伝') continue
                  addRepRow(rep.year)
                }
                // 代表に選ばれたが1本も走らなかった年は、行だけ作る（continentals.squads が元）
                for (const wr of worldAthleticsResults ?? []) {
                  if (wr.kind !== 'qualifier') continue
                  for (const c of wr.continentals ?? []) {
                    if (Object.values(c.squads).some(ids => ids.includes(player.id))) { addRepRow(wr.year); break }
                  }
                }
                const natRows = [...byYear.values()].sort((a, b) => b.year - a.year)
                if (natRows.length === 0) return null
                const medalCol = (rank?: number) => rankColor(rank ?? 0)
                return (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ fontSize: F.tiny, fontWeight: '800', color: C.purple, letterSpacing: '2px', marginBottom: '8px' }}>代表チーム</div>
                    <div style={{overflow: 'hidden', border: `1px solid ${CARD.surface3}` }}>
                      {/* header（在籍履歴と同じ列構成） */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: CARD.surface, borderBottom: `1px solid ${CARD.surface3}` }}>
                        <span style={{ width: '36px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost }}>年</span>
                        <span style={{ flex: 1, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost }}>チーム名</span>
                        <span style={{ width: '28px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>出場</span>
                        <span style={{ width: '32px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>区間賞</span>
                        <span style={{ width: '36px', flexShrink: 0, fontSize: F.micro, fontWeight: '700', color: CARD.textGhost, textAlign: 'center' }}>平均</span>
                        <span style={{ width: '10px', flexShrink: 0 }}/>
                      </div>
                      {natRows.map((row, i) => {
                        const histKey = `nat|${row.year}`
                        const open = !!openHist[histKey]
                        const avg = row.ranked > 0 ? row.rankSum / row.ranked : null
                        const comps = [...row.comps.values()]
                        return (
                          <div key={histKey}>
                            <div
                              onClick={() => setOpenHist(prev => ({ ...prev, [histKey]: !prev[histKey] }))}
                              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', borderBottom: i < natRows.length - 1 || open ? `1px solid ${CARD.surface2}` : 'none', backgroundColor: i % 2 === 0 ? CARD.bg : 'transparent', cursor: 'pointer' }}
                            >
                              <span style={{ width: '36px', flexShrink: 0, fontSize: F.body, color: CARD.textGhost, fontFamily: 'monospace' }}>{row.year}</span>
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <Flag code={player.nationality} width={20} />
                                <span style={{ fontSize: F.body, fontWeight: '700', color: CARD.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{natLabel(player.nationality)}</span>
                              </div>
                              <span style={{ width: '28px', flexShrink: 0, fontSize: F.bodyLg, fontWeight: '900', color: CARD.textDim, fontFamily: 'monospace', textAlign: 'center' }}>{row.races}</span>
                              <span style={{ width: '32px', flexShrink: 0, fontSize: F.bodyLg, fontWeight: '900', color: row.wins > 0 ? CARD.gold : CARD.border2, fontFamily: 'monospace', textAlign: 'center' }}>{row.wins}</span>
                              <span style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                                {avg != null ? (
                                  <span style={{ fontSize: F.label, fontWeight: '900', fontFamily: 'monospace', padding: '2px 5px',background: histAvgColor(avg), color: CARD.bg }}>{avg.toFixed(1)}</span>
                                ) : (
                                  <span style={{ fontSize: F.label, color: CARD.border2 }}>—</span>
                                )}
                              </span>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ color: CARD.textGhost, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                              </svg>
                            </div>
                            {/* 大会別の内訳（駅伝 / 個人種目） */}
                            {open && comps.map((c, ci) => {
                              const cavg = c.ranked > 0 ? c.rankSum / c.ranked : null
                              return (
                                <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: CARD.bg0, borderBottom: ci < comps.length - 1 || i < natRows.length - 1 ? `1px solid ${CARD.surface2}` : 'none' }}>
                                  <span style={{ width: '36px', flexShrink: 0 }}/>
                                  <span style={{ flex: 1, fontSize: F.label, fontWeight: '700', color: CARD.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
                                  <span style={{ width: '28px', flexShrink: 0, fontSize: F.body, fontWeight: '900', color: CARD.textDim, fontFamily: 'monospace', textAlign: 'center' }}>{c.races}</span>
                                  <span style={{ width: '32px', flexShrink: 0, fontSize: F.body, fontWeight: '900', color: c.wins > 0 ? CARD.gold : CARD.border2, fontFamily: 'monospace', textAlign: 'center' }}>{c.ind ? '—' : c.wins}</span>
                                  <span style={{ width: '36px', flexShrink: 0, textAlign: 'center' }}>
                                    {c.ind ? (
                                      <span style={{ fontSize: F.label, fontWeight: '900', fontFamily: 'monospace', color: medalCol(c.indRank) }}>{c.indRank != null ? `${c.indRank}位` : '出場'}</span>
                                    ) : cavg != null ? (
                                      <span style={{ fontSize: F.caption, fontWeight: '900', fontFamily: 'monospace', padding: '1px 4px',background: histAvgColor(cavg), color: CARD.bg }}>{cavg.toFixed(1)}</span>
                                    ) : (
                                      <span style={{ fontSize: F.label, color: CARD.border2 }}>—</span>
                                    )}
                                  </span>
                                  <span style={{ width: '10px', flexShrink: 0 }}/>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Page 4: レース詳細（ドリルダウン） */}
          {page === 4 && selectedRaceName && (() => {
            // 世界選手権の個人種目（世界選手権 5000m 等）：年・開催都市・タイム・順位＋優勝/入賞パッチ
            const indEv = selectedRaceName === '世界選手権 5000m' ? 'd5000'
              : selectedRaceName === '世界選手権 10000m' ? 'd10000'
              : selectedRaceName === '世界選手権 マラソン' ? 'marathon' : null
            if (indEv) {
              const rows: { year: number; city: string; timeSec: number; rank: number }[] = []
              for (const wr of worldAthleticsResults ?? []) {
                if (wr.kind !== 'main') continue
                const pl = wr.meet?.individuals?.find(ir => ir.event === indEv)?.placings?.find(p2 => p2.playerId === player.id)
                if (pl) rows.push({ year: wr.year, city: WA_HOST_CITY[wr.host] ?? natLabel(wr.host), timeSec: pl.timeSec, rank: pl.rank })
              }
              rows.sort((a, b) => b.year - a.year)
              return (
                <div style={{ padding: '12px 20px 28px' }}>
                  {rows.length > 0 ? (
                    <div style={{overflow: 'hidden', border: `1px solid ${CARD.surface3}` }}>
                      {rows.map((e, i) => {
                        const rankCol = rankColor(e.rank)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: i < rows.length - 1 ? `1px solid ${CARD.surface2}` : 'none', backgroundColor: i % 2 === 0 ? CARD.bg : 'transparent' }}>
                            <span style={{ fontSize: F.body, color: CARD.textGhost, fontFamily: 'monospace', flexShrink: 0, width: '48px' }}>{e.year}年</span>
                            <span style={{ fontSize: F.body, color: CARD.textDim, flexShrink: 0 }}>{e.city}</span>
                            <span style={{ fontSize: F.subLg, fontWeight: '900', color: rankCol, fontFamily: 'monospace', width: '38px', textAlign: 'center', flexShrink: 0 }}>{e.rank}位</span>
                            {e.rank === 1 ? (
                              <span style={{ fontSize: F.micro, fontWeight: '900', letterSpacing: '0.05em', padding: '2px 6px',background: `linear-gradient(180deg,${CARD.goldHi2},${CARD.gold})`, color: '#1a0d00', flexShrink: 0 }}>優勝</span>
                            ) : e.rank <= 8 ? (
                              <span style={{ fontSize: F.micro, fontWeight: '900', letterSpacing: '0.05em', padding: '2px 6px',background: 'linear-gradient(180deg,#C583FA,#7E22CE)', color: '#fff', flexShrink: 0 }}>入賞</span>
                            ) : null}
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: F.body, fontWeight: '700', color: CARD.textDim, fontFamily: 'monospace', flexShrink: 0 }}>{formatRaceTime(e.timeSec)}</span>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', color: CARD.border2, fontSize: F.bodyLg, padding: '48px 0' }}>記録なし</div>
                  )}
                </div>
              )
            }
            // 鍵は「リーグ␟駅伝名」。区間記録は駅伝名＋区番号で貯まるので、引き当ては駅伝名のほうを使う
            const { raceName: selectedCourse } = splitRaceKey(selectedRaceName)
            const entries = (raceGroupMap.get(selectedRaceName) ?? []).slice().sort((a, b) => b.year - a.year)
            return (
              <div style={{ padding: '12px 20px 28px' }}>
                {entries.length > 0 ? (
                  <div style={{overflow: 'hidden', border: `1px solid ${CARD.surface3}` }}>
                    {entries.map((e, i) => {
                      const rankCol = rankColor(e.rank)
                      // この大会×区間の記録タイムと同タイムの走りなら「区間記録」パッチ（同タイムの共同保持もタイ記録として付く）
                      const rec = (segmentRecords[`${selectedCourse}-${e.segIdx}`] ?? [])[0]
                      const isSegRecord = !!rec && rec.timeSec === e.timeSec
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: i < entries.length - 1 ? `1px solid ${CARD.surface2}` : 'none', backgroundColor: i % 2 === 0 ? CARD.bg : 'transparent' }}>
                          <span style={{ fontSize: F.body, color: CARD.textGhost, fontFamily: 'monospace', flexShrink: 0, width: '48px' }}>{e.year}年</span>
                          <span style={{ fontSize: F.body, color: CARD.textDim, flexShrink: 0 }}>第{e.segIdx}区{e.distKm != null ? ` ${e.distKm}km` : ''}</span>
                          <span style={{ fontSize: F.subLg, fontWeight: '900', color: rankCol, fontFamily: 'monospace', width: '32px', textAlign: 'center', flexShrink: 0 }}>{e.rank}位</span>
                          {isSegRecord && (
                            <span style={{ fontSize: F.micro, fontWeight: '900', letterSpacing: '0.05em', padding: '2px 6px',background: `linear-gradient(180deg,${CARD.goldHi2},${CARD.gold})`, color: '#1a0d00', flexShrink: 0 }}>区間記録</span>
                          )}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: F.body, fontWeight: '700', color: CARD.textDim, fontFamily: 'monospace', flexShrink: 0 }}>{formatRaceTime(e.timeSec)}</span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', color: CARD.border2, fontSize: F.bodyLg, padding: '48px 0' }}>未出走</div>
                )}
              </div>
            )
          })()}

        </div>
      </div>

      {/* 名前変更ダイアログ */}
      {renameDraft !== null && (
        <div
          onClick={() => setRenameDraft(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px',
            fontFamily: FONT,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 340, background: `linear-gradient(180deg, ${CARD.surface4}, ${CARD.surface2})`,
              border: '2px solid rgba(201,168,76,0.5)',padding: '22px 20px 18px',
              boxShadow: '0 0 40px rgba(201,168,76,0.2), 0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <div style={{ fontSize: F.tiny, color: CARD.gold, letterSpacing: '2px', fontWeight: 900, marginBottom: 8, fontFamily: SAIRA }}>名前を変更</div>
            <div style={{ fontSize: F.body, color: CARD.textDim, lineHeight: 1.6, marginBottom: 12 }}>
              変更した名前は移籍しても引退しても残ります（過去の記録に載っている名前は当時のままです）。
            </div>
            <input
              type="text"
              value={renameDraft}
              autoFocus
              onChange={e => setRenameDraft(e.target.value)}
              maxLength={12}
              style={{
                width: '100%', padding: '12px 14px',border: 'none', marginBottom: 16,
                backgroundColor: CARD.surface3, color: CARD.text, fontSize: F.subLg, boxSizing: 'border-box',
                fontFamily: SAIRA, outline: 'none',
                boxShadow: 'inset 0 0 0 1px rgba(201,168,76,0.14)',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setRenameDraft(null)}
                style={{
                  flex: 1, padding: '12px',cursor: 'pointer',
                  border: `2px solid ${CARD.border2}`, background: 'transparent', color: CARD.textDim,
                  fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900,
                }}
              >
                キャンセル
              </button>
              <button
                disabled={renameDraft.trim() === ''}
                onClick={() => { renamePlayer(player.id, renameDraft); setRenameDraft(null) }}
                style={{
                  flex: 1, padding: '12px',cursor: renameDraft.trim() === '' ? 'default' : 'pointer',
                  ...glassStyle(C.gold, renameDraft.trim() === ''),
                  fontFamily: SAIRA, fontSize: F.subLg, fontWeight: 900,
                }}
              >
                決定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
