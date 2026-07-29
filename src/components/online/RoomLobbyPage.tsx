import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ConfirmDialog from '../ui/ConfirmDialog'
import NoticeDialog from '../ui/NoticeDialog'
import { LoadingBox } from '../friends/friendsUi'
import { TeamLogoSVG } from '../icons/Icons'
import { ensureAuth } from '../../lib/supabase'
import { useGameStore } from '../../store/gameStore'
import type { Player } from '../../types'
import {
  getRoom, listMembers, leaveRoom, kickMember, setReady, startRoom, formatRoomCode, getMemberRoster,
  finishMatch, DEFAULT_RULES, type MatchRules, type MatchResultEntry, type Room, type RoomMember,
} from '../../lib/roomsApi'
import { openRoomChannel, RoomEvent, type RoomChannel, type ChannelStatus } from '../../lib/roomChannel'
import { deadlineIn, serverNow } from '../../lib/serverTime'
import { randomCourseIds, courseById } from '../../data/matchCourses'
import RulesPanel from './RulesPanel'
import PickPanel, { autoOrder, isOrderComplete, type Order } from './PickPanel'
import RacePanel from './RacePanel'
import CoursePanel from './CoursePanel'
import FinishPanel from './FinishPanel'
import { buildRacePayload, seriesStandings, type MatchRacePayload, type MatchTeamInfo } from '../../lib/matchSim'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

/** 開始に必要な最少チーム数（CPUを足さない場合） */
const MIN_TEAMS = 2
/** ホストがルールを決める持ち時間 */
const RULES_SECONDS = 45
/** コース発表を見せる時間 */
const COURSE_SECONDS = 5
/** オーダーを組む持ち時間 */
const PICK_SECONDS = 120
/** レース前のカウントダウン */
const COUNTDOWN_SECONDS = 5
/** 提出が届くまでの猶予（時間切れの取りこぼし防止） */
const GRACE_MS = 1500

/** 最初の1人が「次のレースへ」を押してから、残りを待つ上限 */
const RACE_WAIT_MS = 30 * 1000
/** 見終わった人を待つ上限。誰かが固まっても試合が止まらないようにする */
const WATCH_LIMIT_MS = 5 * 60 * 1000

/** CPUのチームIDにつける印。人のID（UUID）とぶつからないようにする。 */
const CPU_PREFIX = 'cpu:'

type Phase = 'lobby' | 'rules' | 'course' | 'pick' | 'race' | 'finish'

// 対戦の待合室。番号を見せて人が集まるのを待つ画面。
// 人の増減は Realtime の lobby イベントで知らせ合い、各自がDBを引き直す。
export default function RoomLobbyPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()

  const [me, setMe] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | undefined>()
  const [members, setMembers] = useState<RoomMember[]>([])
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState<string[]>([])
  const [conn, setConn] = useState<ChannelStatus>('connecting')

  const [phase, setPhase] = useState<Phase>('lobby')
  const [rules, setRules] = useState<MatchRules>(DEFAULT_RULES)
  const [deadline, setDeadline] = useState<number | null>(null)

  // ── 選手選択 ──
  const [raceNo, setRaceNo] = useState(0)              // 0始まり
  const [rosters, setRosters] = useState<Record<string, Player[]>>({})
  const [submitted, setSubmitted] = useState(false)

  // ── レース ──
  const [result, setResult] = useState<MatchRacePayload | null>(null)
  const [results, setResults] = useState<MatchRacePayload[]>([])   // 全レースぶん（最終結果で使う）
  const [seriesPts, setSeriesPts] = useState<Record<string, number>>({})
  const [waitingNext, setWaitingNext] = useState(false)
  const [segGo, setSegGo] = useState(-1)                            // ホストが「次の区間へ」と言った区間

  const [askLeave, setAskLeave] = useState(false)
  const [askKick, setAskKick] = useState<RoomMember | null>(null)
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const chRef = useRef<RoomChannel | null>(null)
  const aliveRef = useRef(true)
  const confirmedRef = useRef(false)

  // 受信ハンドラは登録時の値を掴んだままになるので、最新の値は ref 経由で見る
  const entriesRef = useRef<Record<string, Order>>({})
  const advancedRef = useRef(false)
  const advanceRef = useRef<(() => void) | null>(null)
  const isHostRef = useRef(false)
  const activeIdsRef = useRef<string[]>([])
  const rostersRef = useRef<Record<string, Player[]>>({})
  const rulesRef = useRef<MatchRules>(DEFAULT_RULES)
  const raceNoRef = useRef(0)
  const teamInfosRef = useRef<MatchTeamInfo[]>([])
  const teamCountRef = useRef(2)                       // 得点表は開始時の参加数で固定する
  const lastResultRef = useRef<MatchRacePayload | null>(null)
  const watchedRef = useRef<Record<string, boolean>>({})
  const nextStartedRef = useRef(false)
  const startNextRef = useRef<(() => void) | null>(null)
  const resultsRef = useRef<MatchRacePayload[]>([])
  // CPUチーム（ホストのセーブから借りてくる）。ホストの端末だけが持つ。
  const cpuTeamsRef = useRef<MatchTeamInfo[]>([])
  const cpuRostersRef = useRef<Record<string, Player[]>>({})
  // 区間ごとの待ち合わせ。「どの区間ぶんを数えているか」と「誰が見終わったか」
  const segWatchRef = useRef<{ key: string; ids: Record<string, boolean> }>({ key: '', ids: {} })
  const nextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pickSentRef = useRef(-1)
  const startPickRef = useRef<((n: number) => void) | null>(null)
  const finishSentRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!roomId) return
    try {
      const [r, ms] = await Promise.all([getRoom(roomId), listMembers(roomId)])
      if (!aliveRef.current) return
      setRoom(r)
      setMembers(ms)
      // ホストが抜けた／期限切れで部屋が消えたとき
      if (!r || r.status === 'closed') {
        setNotice({ title: '部屋が閉じられました', message: 'ホストが退出したか、時間切れになりました。' })
      }
    } catch {
      /* 一時的な通信エラーは黙って次の更新を待つ */
    } finally {
      if (aliveRef.current) setLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    aliveRef.current = true
    let timer: ReturnType<typeof setInterval> | null = null

    ;(async () => {
      const uid = await ensureAuth()
      if (!aliveRef.current) return
      setMe(uid)
      await refresh()
      if (!roomId || !uid || !aliveRef.current) return

      const ch = await openRoomChannel(roomId, uid)
      if (!aliveRef.current) { ch.close(); return }
      chRef.current = ch
      ch.on(RoomEvent.LOBBY, () => { refresh() })
      // ホストが「はじめる」を押した → 全員でルール画面へ
      ch.on<{ rules: MatchRules; deadline: number }>(RoomEvent.RULES, p => {
        if (!p) return
        setRules(p.rules)
        setDeadline(p.deadline)
        setPhase('rules')
      })
      // ルール確定 → 今回のコース発表
      ch.on<{ rules: MatchRules; deadline: number }>(RoomEvent.COURSE, p => {
        if (!p) return
        setRules(p.rules)
        setDeadline(p.deadline)
        setPhase('course')
      })
      // コース発表のあと → オーダー提出へ
      ch.on<{ rules: MatchRules; deadline: number; race: number }>(RoomEvent.PICK, p => {
        if (!p) return
        setRules(p.rules)
        setDeadline(p.deadline)
        setRaceNo(p.race ?? 0)
        setPhase('pick')
        setSubmitted(false)
        setWaitingNext(false)
        setSegGo(-1)
        entriesRef.current = {}
        advancedRef.current = false
        watchedRef.current = {}
        segWatchRef.current = { key: '', ids: {} }
        nextStartedRef.current = false
        if (nextTimerRef.current) { clearTimeout(nextTimerRef.current); nextTimerRef.current = null }
      })
      // 誰かが提出した（ホストだけが集める）
      ch.on<{ race: number; order: Order }>(RoomEvent.ENTRY, (p, from) => {
        if (!p || !isHostRef.current) return
        if (p.race !== raceNoRef.current) return
        entriesRef.current[from] = p.order
        if (activeIdsRef.current.every(id => entriesRef.current[id])) advanceRef.current?.()
      })
      // 全員のオーダーが出そろった → ホストが計算した結果が届く。全員これを再生する。
      ch.on<MatchRacePayload>(RoomEvent.RACE, p => {
        if (!p?.segments) return
        // 前のレースぶんの得点をここで通算に足す
        const last = lastResultRef.current
        if (last && last.race !== p.race) {
          setSeriesPts(prev => {
            const out = { ...prev }
            for (const s of last.standings) out[s.teamId] = (out[s.teamId] ?? 0) + s.points
            return out
          })
        }
        lastResultRef.current = p
        setResult(p)
        // 全レースぶんを取っておく。最終結果はこれを各自が集計する（配り直さない）。
        setResults(prev => {
          const out = [...prev.filter(r => r.race !== p.race), p].sort((a, b) => a.race - b.race)
          resultsRef.current = out
          return out
        })
        setRaceNo(p.race)
        setWaitingNext(false)
        setSegGo(-1)
        setPhase('race')
        watchedRef.current = {}
        segWatchRef.current = { key: '', ids: {} }
        nextStartedRef.current = false
        if (nextTimerRef.current) { clearTimeout(nextTimerRef.current); nextTimerRef.current = null }
      })
      // 区間結果を見終わった人の集計（ホストだけ）。CPUは数えない。
      ch.on<{ race: number; seg: number }>(RoomEvent.SEG, (p, from) => {
        if (!p || !isHostRef.current) return
        if (p.race !== raceNoRef.current) return
        const key = `${p.race}:${p.seg}`
        if (segWatchRef.current.key !== key) segWatchRef.current = { key, ids: {} }
        segWatchRef.current.ids[from] = true
        if (activeIdsRef.current.every(id => segWatchRef.current.ids[id])) {
          chRef.current?.send(RoomEvent.SEGGO, { race: p.race, seg: p.seg }).catch(() => {})
        }
      })
      // 全員そろった → 次の区間へ
      ch.on<{ race: number; seg: number }>(RoomEvent.SEGGO, p => {
        if (!p || p.race !== raceNoRef.current) return
        setSegGo(v => Math.max(v, p.seg))
      })
      // 見終わった人の集計（ホストだけ）
      ch.on<{ race: number }>(RoomEvent.NEXT, (p, from) => {
        if (!p || !isHostRef.current) return
        if (p.race !== raceNoRef.current) return
        watchedRef.current[from] = true
        if (activeIdsRef.current.every(id => watchedRef.current[id])) { startNextRef.current?.(); return }
        // 最初の1人が押したら、そこから30秒で打ち切る（固まった人を待ち続けない）
        if (!nextTimerRef.current) {
          nextTimerRef.current = setTimeout(() => { startNextRef.current?.() }, RACE_WAIT_MS)
        }
      })
      // シリーズ終了
      ch.on(RoomEvent.FINISH, () => { setPhase('finish') })
      ch.onPresence(ids => setOnline(ids))
      ch.onStatus(s => setConn(s))

      // 保険：通知を取りこぼしても最後には揃うように、ゆっくり定期更新する
      timer = setInterval(refresh, 15000)
    })()

    return () => {
      aliveRef.current = false
      if (timer) clearInterval(timer)
      if (nextTimerRef.current) { clearTimeout(nextTimerRef.current); nextTimerRef.current = null }
      chRef.current?.close()
      chRef.current = null
    }
  }, [roomId, refresh])

  const notifyLobby = () => { chRef.current?.send(RoomEvent.LOBBY).catch(() => {}) }

  const isHost = !!room && !!me && room.host === me
  const mine = members.find(m => m.userId === me)
  const active = members.filter(m => !m.left)

  const onLeave = async () => {
    setAskLeave(false)
    if (!roomId) return
    setBusy(true)
    try {
      await leaveRoom(roomId)
      notifyLobby()
      navigate('/online/match', { replace: true })
    } catch {
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(false) }
  }

  const onKick = async () => {
    const target = askKick
    setAskKick(null)
    if (!roomId || !target) return
    setBusy(true)
    try {
      await kickMember(roomId, target.userId)
      await refresh()
      notifyLobby()
    } catch {
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(false) }
  }

  const onToggleReady = async () => {
    if (!roomId || !mine) return
    setBusy(true)
    try {
      await setReady(roomId, !mine.ready)
      await refresh()
      notifyLobby()
    } catch {
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(false) }
  }

  // ── ルール決め ──────────────────────────────────────────
  const onStart = async () => {
    if (!roomId || busy || active.length < MIN_TEAMS) return
    setBusy(true)
    try {
      const res = await startRoom(roomId, rules)
      if (res !== 'started') {
        setNotice({ title: '開始できませんでした', message: 'もう一度お試しください' })
        return
      }
      const dl = deadlineIn(RULES_SECONDS)
      await chRef.current?.send(RoomEvent.RULES, { rules, deadline: dl })
      setDeadline(dl)
      setPhase('rules')
    } catch {
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(false) }
  }

  // ホストが1項目いじるたびに全員へ流す。ゲストの画面も同じ内容に変わる。
  const onChangeRules = (next: MatchRules) => {
    setRules(next)
    if (!deadline) return
    chRef.current?.send(RoomEvent.RULES, { rules: next, deadline }).catch(() => {})
  }

  // CPUを用意する（ホストの端末だけ）。
  // ホストのセーブにあるチームから、自分と参加者以外を必要な数だけ借りてくる。
  const buildCpu = useCallback((count: number) => {
    cpuTeamsRef.current = []
    cpuRostersRef.current = {}
    if (count <= 0) return
    const st = useGameStore.getState()
    const used = new Set(teamInfosRef.current.map(t => t.name))
    const pool = (st.teams ?? []).filter(t => t.id !== st.playerTeamId && !used.has(t.name))
    // 適当に混ぜて先頭から取る
    const shuffled = [...pool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    for (const t of shuffled.slice(0, count)) {
      const id = `${CPU_PREFIX}${t.id}`
      cpuTeamsRef.current.push({
        id,
        name: t.name,
        shortName: t.shortName,
        primary: t.colors?.primary ?? '#122440',
        secondary: t.colors?.secondary ?? '#f5c842',
        logoId: t.logoId ?? 'logo_01',
      })
      cpuRostersRef.current[id] = st.players.filter(p => p.teamId === t.id)
    }
  }, [])

  // ホストだけが呼ぶ。オーダー提出フェーズを始める。
  const startPick = useCallback((n: number) => {
    if (!isHostRef.current) return
    if (pickSentRef.current === n) return       // 二重に送らない
    pickSentRef.current = n
    const dl = deadlineIn(PICK_SECONDS)
    chRef.current?.send(RoomEvent.PICK, { rules: rulesRef.current, deadline: dl, race: n }).catch(() => {})
  }, [])
  useEffect(() => { startPickRef.current = startPick }, [startPick])

  const onConfirmRules = useCallback(async () => {
    if (!roomId || confirmedRef.current) return
    confirmedRef.current = true
    const final: MatchRules = {
      ...rules,
      // 「ランダム」はここで抽選して確定させる（全員が同じコースを走るため）
      courses: rules.courses === 'random' ? randomCourseIds(rules.races) : rules.courses,
    }
    buildCpu(final.cpu)
    teamCountRef.current = Math.max(2, activeIdsRef.current.length + cpuTeamsRef.current.length)
    setBusy(true)
    try {
      await startRoom(roomId, final)
      const dl = deadlineIn(COURSE_SECONDS)
      rulesRef.current = final     // このあとすぐ startPick が古いルールを送らないように
      await chRef.current?.send(RoomEvent.COURSE, { rules: final, deadline: dl })
      setRules(final)
      setDeadline(dl)
      setRaceNo(0)
      setPhase('course')
    } catch {
      confirmedRef.current = false
      setNotice({ title: '通信できませんでした', message: '電波の良い場所で、もう一度お試しください' })
    } finally { setBusy(false) }
  }, [roomId, rules, buildCpu])

  // 45秒たったらホストが自動で確定する（ゲストは待つだけ）
  useEffect(() => {
    if (phase !== 'rules' || !isHost || !deadline) return
    const t = setTimeout(() => { onConfirmRules() }, Math.max(0, deadline - serverNow()))
    return () => clearTimeout(t)
  }, [phase, isHost, deadline, onConfirmRules])

  // コース発表は5秒で自動的にオーダー選びへ（ホストはボタンで早送りできる）
  useEffect(() => {
    if (phase !== 'course' || !isHost || !deadline) return
    const t = setTimeout(() => { startPickRef.current?.(0) }, Math.max(0, deadline - serverNow()))
    return () => clearTimeout(t)
  }, [phase, isHost, deadline])

  // ── 選手選択 ───────────────────────────────────────────
  const courseIds = rules.courses === 'random' ? [] : rules.courses
  const course = courseById(courseIds[raceNo] ?? '')
  // 再生中のコースは結果に入っているものを使う（届いた結果と必ず一致させる）
  const raceCourse = courseById(result?.courseId ?? '')

  // 受信ハンドラから見るための最新値
  useEffect(() => { isHostRef.current = isHost }, [isHost])
  useEffect(() => { rulesRef.current = rules }, [rules])
  useEffect(() => { raceNoRef.current = raceNo }, [raceNo])
  useEffect(() => { rostersRef.current = rosters }, [rosters])
  useEffect(() => { activeIdsRef.current = members.filter(m => !m.left).map(m => m.userId) }, [members])
  useEffect(() => {
    teamInfosRef.current = members.filter(m => !m.left).map(m => ({
      id: m.userId,
      name: m.profile?.teamName ?? 'チーム',
      shortName: m.profile?.shortName ?? '—',
      primary: m.profile?.primary ?? '#122440',
      secondary: m.profile?.secondary ?? '#f5c842',
      logoId: m.profile?.logoId ?? 'logo_01',
    }))
  }, [members])

  // 選手選択に入ったら選手を読み込む。自分のぶんは手元のセーブが確実なのでそちらを使う。
  // 相手のぶんはホストだけが読む（未提出の人をおまかせで埋めるため。他の人は見ない）。
  useEffect(() => {
    if (phase !== 'pick' || !me) return
    let alive = true
    ;(async () => {
      const st = useGameStore.getState()
      const out: Record<string, Player[]> = { [me]: st.players.filter(p => p.teamId === st.playerTeamId) }
      if (alive) setRosters({ ...out })
      if (!isHostRef.current) return
      const ids = members.filter(m => !m.left && m.userId !== me).map(m => m.userId)
      await Promise.all(ids.map(async id => {
        try { out[id] = await getMemberRoster(id) } catch { out[id] = [] }
      }))
      if (alive) setRosters({ ...out })
    })()
    return () => { alive = false }
  }, [phase, me])   // eslint-disable-line react-hooks/exhaustive-deps

  // ホストだけが呼ぶ。出そろった（または時間切れ）のでレースを計算して配る。
  const advance = useCallback(() => {
    if (!isHostRef.current || advancedRef.current) return
    const ids = rulesRef.current.courses === 'random' ? [] : rulesRef.current.courses
    const c = courseById(ids[raceNoRef.current] ?? '')
    if (!c) return
    advancedRef.current = true
    // 出さなかった人・中身が足りない人はおまかせで埋める（回線落ちでも試合が止まらないように）
    const orders: Record<string, Record<number, string>> = {}
    const forfeits: string[] = []
    for (const id of activeIdsRef.current) {
      const got = entriesRef.current[id]
      if (isOrderComplete(got, c)) {
        orders[id] = got!.lineup
      } else {
        orders[id] = autoOrder(rostersRef.current[id] ?? [], c, raceNoRef.current + 1).lineup
        if (!got) forfeits.push(id)
      }
    }
    // CPUのオーダーは毎回おまかせで組む
    for (const t of cpuTeamsRef.current) {
      orders[t.id] = autoOrder(cpuRostersRef.current[t.id] ?? [], c, raceNoRef.current + 1).lineup
    }
    const payload = buildRacePayload({
      raceNo: raceNoRef.current,
      course: c,
      startAt: deadlineIn(COUNTDOWN_SECONDS),
      teams: [
        ...teamInfosRef.current.filter(t => activeIdsRef.current.includes(t.id)),
        ...cpuTeamsRef.current,
      ],
      rosters: { ...rostersRef.current, ...cpuRostersRef.current },
      orders,
      teamCount: teamCountRef.current,
      forfeits,
    })
    chRef.current?.send(RoomEvent.RACE, payload).catch(() => {})
  }, [])
  useEffect(() => { advanceRef.current = advance }, [advance])

  // 時間切れ。少しだけ待ってから進める（提出の取りこぼし防止）
  useEffect(() => {
    if (phase !== 'pick' || !isHost || !deadline) return
    const t = setTimeout(advance, Math.max(0, deadline - serverNow()) + GRACE_MS)
    return () => clearTimeout(t)
  }, [phase, isHost, deadline, advance])

  const onSubmitOrder = (o: Order) => {
    if (submitted) return
    setSubmitted(true)
    chRef.current?.send(RoomEvent.ENTRY, { race: raceNo, order: o }).catch(() => {})
  }

  // ── レース ─────────────────────────────────────────────
  // ホストだけが呼ぶ。全員が見終わったので次のレースへ（または終了へ）。
  const startNext = useCallback(() => {
    if (!isHostRef.current || nextStartedRef.current) return
    nextStartedRef.current = true
    const n = raceNoRef.current + 1
    if (n >= rulesRef.current.races) {
      chRef.current?.send(RoomEvent.FINISH, {}).catch(() => {})
      return
    }
    startPickRef.current?.(n)
  }, [])
  useEffect(() => { startNextRef.current = startNext }, [startNext])

  // 保険：誰かの画面が固まっても、5分たてば次へ進める
  useEffect(() => {
    if (phase !== 'race' || !isHost) return
    const t = setTimeout(() => { startNextRef.current?.() }, WATCH_LIMIT_MS)
    return () => clearTimeout(t)
  }, [phase, isHost, raceNo])

  const onNextRace = () => {
    setWaitingNext(true)
    chRef.current?.send(RoomEvent.NEXT, { race: raceNo }).catch(() => {})
  }

  // 区間結果を見終わった合図。全員そろえばホストから SEGGO が返ってくる。
  const onSegDone = (seg: number) => {
    chRef.current?.send(RoomEvent.SEG, { race: raceNo, seg }).catch(() => {})
  }

  // ── 通算成績をサーバーへ記録する（ホストが1回だけ） ──────
  useEffect(() => {
    if (phase !== 'finish' || !isHost || !roomId || finishSentRef.current) return
    const races = resultsRef.current
    if (!races.length) return
    finishSentRef.current = true
    const humans = new Set(activeIdsRef.current)
    const entries: MatchResultEntry[] = seriesStandings(races)
      .filter(s => humans.has(s.teamId))
      .map(s => ({ user_id: s.teamId, rank: s.rank, points: s.points, forfeit: s.forfeit }))
    finishMatch(roomId, { races: races.length, courses: races.map(r => r.courseId) }, entries)
      .catch(() => { /* 記録できなくても画面は進める */ })
  }, [phase, isHost, roomId])

  if (loading) {
    return (
      <div style={{ fontFamily: SAIRA, padding: '12px 16px', minHeight: '100%', background: C.bg }}>
        <div style={{ marginTop: 40 }}><LoadingBox /></div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      {/* ヘッダー：戻るではなく「退出」。黙って抜けると相手側に残ってしまうため。 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.cyan, 0.7), letterSpacing: '3px', fontWeight: 900 }}>ROOM</div>
        <div style={{ flex: 1 }} />
        {conn !== 'online' && (
          <div style={{ fontSize: 10, color: C.textDim }}>{conn === 'connecting' ? '接続中…' : 'オフライン'}</div>
        )}
        <button onClick={() => setAskLeave(true)} disabled={busy} style={{ padding: '5px 10px', borderRadius: 8, border: `1px solid ${C.border2}`, background: 'transparent', color: C.textSub, fontSize: 11, fontWeight: 800, fontFamily: SAIRA, cursor: 'pointer' }}>退出</button>
      </div>

      {phase === 'lobby' && (<>
      {/* 部屋番号 */}
      <div style={{ margin: '4px 12px 0', padding: '16px', borderRadius: 16, textAlign: 'center', background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`, border: `2px solid ${alpha(C.cyan, 0.4)}` }}>
        <div style={{ fontFamily: SAIRA, fontSize: 9, color: alpha(C.cyan, 0.6), letterSpacing: '4px', fontWeight: 900 }}>ROOM CODE</div>
        <div style={{ fontFamily: SAIRA, fontSize: 44, fontWeight: 900, color: C.cyan, letterSpacing: '8px', lineHeight: 1.3 }}>
          {formatRoomCode(room?.code ?? '')}
        </div>
      </div>

      {/* 参加者 */}
      <div style={{ padding: '18px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <div style={{ fontFamily: SAIRA, fontSize: 10, color: alpha(C.gold, 0.55), letterSpacing: '2px', fontWeight: 900 }}>参加チーム</div>
          <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.text }}>{active.length} / {room?.maxPlayers ?? 20}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {active.map(m => {
            const p = m.profile
            const isMe = m.userId === me
            const isRoomHost = room?.host === m.userId
            const connected = online.includes(m.userId)
            return (
              <div key={m.userId} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12,
                background: isMe ? alpha(C.gold, 0.08) : C.surface2,
                border: `1px solid ${isMe ? alpha(C.gold, 0.35) : C.border}`,
              }}>
                <div style={{ fontFamily: SAIRA, fontSize: 12, fontWeight: 900, color: C.textDim, width: 16, textAlign: 'center' }}>{m.seat}</div>
                <TeamLogoSVG primary={p?.primary ?? '#122440'} secondary={p?.secondary ?? '#f5c842'} shortName={p?.shortName ?? '—'} logoId={p?.logoId ?? 'logo_01'} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p?.teamName ?? '読み込み中'}
                    {isRoomHost && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 5, background: C.gold, color: '#1a0d00', fontSize: 9, fontWeight: 900 }}>ホスト</span>}
                  </div>
                  <div style={{ fontSize: 10, color: C.textDim }}>GM {p?.gmName ?? '—'}{!connected && '・接続待ち'}</div>
                </div>
                {m.ready && !isRoomHost && (
                  <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.green }}>準備OK</div>
                )}
                {isHost && !isMe && (
                  <button onClick={() => setAskKick(m)} disabled={busy} style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${alpha(C.red, 0.5)}`, background: 'transparent', color: C.red, fontSize: 10, fontWeight: 900, fontFamily: SAIRA, cursor: 'pointer' }}>退出</button>
                )}
              </div>
            )
          })}
        </div>

        {/* 開始できるのは2チームから（サーバー側も同じ） */}
        {active.length < MIN_TEAMS && (
          <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 800, color: C.textDim, marginTop: 12, textAlign: 'center', letterSpacing: '1px' }}>
            あと {MIN_TEAMS - active.length} チーム
          </div>
        )}
      </div>

      {/* 準備完了（ゲストのみ。ホストは開始ボタン側で操作する） */}
      {!isHost && mine && (
        <div style={{ padding: '20px 12px 0' }}>
          <button onClick={onToggleReady} disabled={busy} className="btn-press" style={{
            width: '100%', padding: '15px 14px', borderRadius: 14,
            border: `2px solid ${mine.ready ? C.green : C.goldDark}`,
            background: mine.ready ? alpha(C.green, 0.15) : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            color: mine.ready ? C.green : C.gold, fontFamily: SAIRA, fontSize: 16, fontWeight: 900, cursor: 'pointer',
          }}>
            {mine.ready ? '準備完了（取り消す）' : '準備完了'}
          </button>
        </div>
      )}

      {/* はじめる（ホストのみ） */}
      {isHost && (
        <div style={{ padding: '20px 12px 0' }}>
          <button onClick={onStart} disabled={busy || active.length < MIN_TEAMS} className="btn-press" style={{
            width: '100%', padding: '16px 14px', borderRadius: 14, border: `2px solid ${C.goldDark}`,
            background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
            boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5)',
            color: C.gold, fontFamily: SAIRA, fontSize: 17, fontWeight: 900,
            cursor: 'pointer', opacity: busy || active.length < MIN_TEAMS ? 0.4 : 1,
          }}>
            はじめる
          </button>
        </div>
      )}
      </>)}

      {phase === 'rules' && (
        <RulesPanel
          rules={rules}
          isHost={isHost}
          deadline={deadline}
          teams={active.length}
          maxTeams={room?.maxPlayers ?? 20}
          onChange={onChangeRules}
          onConfirm={onConfirmRules}
          busy={busy}
        />
      )}

      {phase === 'course' && (
        <CoursePanel
          courses={courseIds.map(id => courseById(id))}
          deadline={deadline}
          isHost={isHost}
          onNext={() => startPick(0)}
        />
      )}

      {phase === 'pick' && (
        !course || !rosters[me ?? ''] ? (
          <div style={{ marginTop: 40 }}><LoadingBox /></div>
        ) : (
          <PickPanel
            course={course}
            raceNo={raceNo + 1}
            totalRaces={rules.races}
            deadline={deadline}
            roster={rosters[me ?? ''] ?? []}
            submitted={submitted}
            onSubmit={onSubmitOrder}
          />
        )
      )}

      {phase === 'race' && (
        !result || !raceCourse ? (
          <div style={{ marginTop: 40 }}><LoadingBox /></div>
        ) : (
          <RacePanel
            payload={result}
            course={raceCourse}
            raceNo={raceNo + 1}
            totalRaces={rules.races}
            meId={me ?? ''}
            myPlayers={rosters[me ?? ''] ?? []}
            seriesPts={seriesPts}
            waiting={waitingNext}
            onNext={onNextRace}
            segGo={segGo}
            onSegDone={onSegDone}
          />
        )
      )}

      {/* 最終結果。まだ1レースも届いていない（途中で入り直した等）ときだけ簡易表示にする。 */}
      {phase === 'finish' && (
        results.length > 0 ? (
          <FinishPanel races={results} meId={me ?? ''} onLeave={() => setAskLeave(true)} />
        ) : (
          <div style={{ padding: '48px 16px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: alpha(C.gold, 0.6), letterSpacing: '3px', fontWeight: 900 }}>FINISH</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginTop: 8 }}>対戦終了</div>
            <div style={{ fontSize: 12, color: C.textDim, marginTop: 10, lineHeight: 1.7 }}>お疲れさまでした。</div>
            <button onClick={() => setAskLeave(true)} className="btn-press" style={{
              marginTop: 24, padding: '13px 28px', borderRadius: 12, border: `2px solid ${C.goldDark}`,
              background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
              color: C.gold, fontFamily: SAIRA, fontSize: 15, fontWeight: 900, cursor: 'pointer',
            }}>部屋を出る</button>
          </div>
        )
      )}

      {askLeave && (
        <ConfirmDialog
          title={isHost ? '部屋を解散しますか？' : '退出しますか？'}
          message={isHost ? 'ホストが抜けると部屋は閉じられ、全員が待合室から出ます。' : 'この部屋から出ます。もう一度入るには番号が必要です。'}
          confirmLabel={isHost ? '解散する' : '退出する'}
          accent={C.red}
          onConfirm={onLeave}
          onCancel={() => setAskLeave(false)}
        />
      )}

      {askKick && (
        <ConfirmDialog
          title="このチームを退出させますか？"
          message={`${askKick.profile?.teamName ?? 'このチーム'}を部屋から出します。番号を知っていれば入り直せます。`}
          confirmLabel="退出させる"
          accent={C.red}
          onConfirm={onKick}
          onCancel={() => setAskKick(null)}
        />
      )}

      {notice && (
        <NoticeDialog
          title={notice.title}
          message={notice.message}
          onClose={() => { setNotice(null); navigate('/online/match', { replace: true }) }}
        />
      )}
    </div>
  )
}
