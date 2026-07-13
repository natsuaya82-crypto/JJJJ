import type { Player, Segment, Race, Team } from '../types'
import {
  calcBaseAbility, calcAffinity, calcConditionModifier,
  calcTraitModifier, calcWeatherModifier, calcClubModifier, scoreToTime,
} from './raceEngine'

// ─── Types ──────────────────────────────────────────────────────────────────

export type RaceSegmentEventChoice = {
  id: string
  text: string
  lowStaminaText?: string
}

export type EventTriggerCondition =
  | { type: 'ratio'; min: number }
  | { type: 'kmRemaining'; km: number }
  | { type: 'stamina' }
  | { type: 'gapAheadBelow'; sec: number }
  | { type: 'gapBehindBelow'; sec: number }
  | { type: 'packSize'; minCount: number; withinSec: number }

export type RaceSegmentEvent = {
  id: string
  type: string
  trigger: EventTriggerCondition
  situation: string
  battleContext: string
  choices: RaceSegmentEventChoice[]
  opponentOvr?: number
  _effects: Array<{
    effortType: 'aggressive' | 'balanced' | 'conservative'
    staminaSuccess: number
    timeBonusSuccess: number  // 区間タイムに対する割合、負=速い（例 -0.0048 = 区間タイム-0.48%）
    staminaFail: number
    timeBonusFail: number     // 区間タイムに対する割合、正=遅い
  }>
}

export type InteractiveSegResult = {
  segmentIndex: number
  runners: { playerId: string; teamId: string; timeSec: number; rank: number }[]
}

export type ISim = {
  cpuLineups: Record<string, Record<number, string>>
  currentSegIdx: number
  cpuTimesForSeg: Record<string, number>
  playerBaseTime: number
  initialSegStamina: number
  segStamina: number
  playerTimeMod: number
  pendingEvents: RaceSegmentEvent[]
  completedSegs: InteractiveSegResult[]
  cumulativeTime: Record<string, number>
  segPts: Record<string, number>
  showingSegResult: boolean
  lastSegResult: InteractiveSegResult | null
}

// ─── Stamina ─────────────────────────────────────────────────────────────────

export function calcSegOvr(player: Player, seg: Segment): number {
  return calcBaseAbility(player.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
}

export function calcNaturalDrain(segOvr: number, distanceKm: number): number {
  return Math.round(segOvr * 0.02 * distanceKm)
}

export function calcFinalSegTime(
  segStamina: number,
  initialOvr: number,
  playerTimeMod: number,
  player: Player,
  seg: Segment,
  team: Team | undefined,
  race: Race,
  _seasonProgress: number,
  raceStrategy: 'aggressive' | 'balanced' | 'conservative',
  totalSegs: number,
): number {
  const traits = player.traits ?? []
  const aff = calcAffinity(player.specialty, seg.uphillPct, seg.downhillPct, seg.distanceKm)
  const clubMod = team ? calcClubModifier(team, race.location) : 1.0
  const fatigue = player.specialty === 'grinder' ? Math.min(player.fatigue ?? 0, 40) : (player.fatigue ?? 0)
  const condMod = calcConditionModifier(fatigue, player.morale ?? 70, player.form ?? 0)
  const traitMod = calcTraitModifier(traits, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.index, totalSegs)
  const weatherMod = race.conditions
    ? calcWeatherModifier(race.conditions.weather, player.specialty, player.ratings.stamina, player.ratings.mental)
    : 1.0
  const STRATEGY_MODS = { aggressive: 1.03, balanced: 1.0, conservative: 0.98 } as const
  const stratMod = STRATEGY_MODS[raceStrategy]

  const score = segStamina * aff * clubMod * condMod * traitMod * weatherMod * stratMod
  const baseTime = Math.round(scoreToTime(score, seg.distanceKm, seg.uphillPct, seg.downhillPct))

  const staminaPct = initialOvr > 0 ? segStamina / initialOvr : 1.0
  const penalty = staminaPct <= 0.3 ? 1.2 : staminaPct <= 0.5 ? 1.1 : 1.0

  return Math.max(30, Math.round(baseTime * penalty + playerTimeMod))
}

// ─── Player Base Time ────────────────────────────────────────────────────────


// ─── CPU Times ───────────────────────────────────────────────────────────────

export function calcCpuTimesForSeg(
  seg: Segment,
  teams: Team[],
  cpuLineups: Record<string, Record<number, string>>,
  players: Player[],
  playerTeamId: string,
  race: Race,
  seasonProgress: number,
  totalSegs: number,
): Record<string, number> {
  const result: Record<string, number> = {}
  const playerMap = new Map(players.map(p => [p.id, p]))
  for (const team of teams) {
    if (team.id === playerTeamId) continue
    const playerId = cpuLineups[team.id]?.[seg.index]
    if (!playerId) continue
    const player = playerMap.get(playerId)
    if (!player) continue
    // プレイヤーと完全に同じ計算方式（スタミナ消耗 → calcFinalSegTime）
    const segOvr = calcSegOvr(player, seg)
    const drain = calcNaturalDrain(segOvr, seg.distanceKm)
    const segStamina = Math.max(1, segOvr - drain)
    // CPUはイベント選択がない代わりに小さな試合ごとのばらつきを timeMod 相当で付与
    const baseTime = calcFinalSegTime(
      segStamina, segOvr, 0, player, seg, team, race, seasonProgress, 'balanced', totalSegs,
    )
    const rand = 0.97 + Math.random() * 0.06
    result[team.id] = Math.round(baseTime * rand)
  }
  return result
}

// ─── Event Generation ────────────────────────────────────────────────────────

const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

// 総合順位コンテキスト：実況テキストを実際のレース状況と同期させるための情報
export type RaceContext = {
  overallRank: number
  totalTeams: number
  gapAheadSec: number | null
  gapBehindSec: number | null
  aheadName: string | null
  behindName: string | null
  segIdx: number
  totalSegs: number
  isFirstSeg: boolean
}

export function generateSegmentEvents(params: {
  seg: Segment
  playerBaseTime: number
  cpuTimesForSeg: Record<string, number>
  cumulativeTimes: Record<string, number>
  isFirstSeg: boolean
  player: Player
  totalSegs: number
  players: Player[]
  cpuLineups: Record<string, Record<number, string>>
  teams: Team[]
}): RaceSegmentEvent[] {
  const { seg, playerBaseTime, cpuTimesForSeg, cumulativeTimes, isFirstSeg, player, totalSegs, players, cpuLineups, teams } = params

  // 各区間ちょうど1回だけイベントを出す（くどさ回避のため2回目は出さない）。
  const events: RaceSegmentEvent[] = []

  const playerMap = new Map(players.map(p => [p.id, p]))
  const segIdx = seg.index

  function getCpuOvr(teamId: string): number | undefined {
    const pid = cpuLineups[teamId]?.[segIdx]
    const p = pid ? playerMap.get(pid) : undefined
    if (!p) return undefined
    return calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
  }

  const cpuSegTimes = Object.values(cpuTimesForSeg)
  const sortedCpuEntries = Object.entries(cpuTimesForSeg).sort(([, a], [, b]) => a - b)
  const fasterCpus = cpuSegTimes.filter(t => t < playerBaseTime)
  const closeFasterCpus = cpuSegTimes.filter(t => t > playerBaseTime && t - playerBaseTime <= 10)
  const projectedRank = fasterCpus.length + 1
  const totalTeams = cpuSegTimes.length + 1

  const fasterEntries = sortedCpuEntries.filter(([, t]) => t < playerBaseTime)
  const nearestFasterOvr = fasterEntries.length > 0
    ? getCpuOvr(fasterEntries[fasterEntries.length - 1][0])
    : undefined

  const slowerEntries = sortedCpuEntries.filter(([, t]) => t > playerBaseTime)
  const nearestChaserOvr = slowerEntries.length > 0
    ? getCpuOvr(slowerEntries[0][0])
    : undefined

  const nearbyEntries = sortedCpuEntries.filter(([, t]) => Math.abs(t - playerBaseTime) <= 15)
  const nearbyOvrs = nearbyEntries.map(([tid]) => getCpuOvr(tid)).filter((v): v is number => v !== undefined)
  const avgNearbyOvr = nearbyOvrs.length > 0 ? nearbyOvrs.reduce((a, b) => a + b) / nearbyOvrs.length : undefined

  const playerCumTime = cumulativeTimes['__player__'] ?? 0
  const cpuCumArr = Object.entries(cumulativeTimes)
  const nearCpuCum = cpuCumArr.filter(([, t]) => Math.abs(t - playerCumTime) <= 8)

  // ─── 総合順位コンテキスト計算 ───
  const teamName = (id: string): string | null =>
    id === '__player__' ? null : (teams.find(t => t.id === id)?.shortName ?? null)

  // 総合タイム昇順ソート（プレイヤー含む）
  const sortedCum = cpuCumArr.slice().sort(([, a], [, b]) => a - b)
  const playerCumIdx = sortedCum.findIndex(([id]) => id === '__player__')
  // 初区間は総合タイムが全員0で無意味 → 区間予測順位を使う
  const overallRank = isFirstSeg ? projectedRank : (playerCumIdx >= 0 ? playerCumIdx + 1 : projectedRank)

  const aheadEntry = !isFirstSeg && playerCumIdx > 0 ? sortedCum[playerCumIdx - 1] : null
  const behindEntry = !isFirstSeg && playerCumIdx >= 0 && playerCumIdx < sortedCum.length - 1
    ? sortedCum[playerCumIdx + 1] : null

  const gapAheadSec = aheadEntry ? Math.abs(playerCumTime - aheadEntry[1]) : null
  const gapBehindSec = behindEntry ? Math.abs(behindEntry[1] - playerCumTime) : null
  const aheadName = aheadEntry ? teamName(aheadEntry[0]) : null
  const behindName = behindEntry ? teamName(behindEntry[0]) : null

  const ctx: RaceContext = {
    overallRank,
    totalTeams,
    gapAheadSec,
    gapBehindSec,
    aheadName,
    behindName,
    segIdx,
    totalSegs,
    isFirstSeg,
  }

  if (isFirstSeg) {
    events.push(makeStartDashEvent(player, ctx))
  } else if (seg.uphillPct >= 28) {
    events.push(makeMountainAscentEvent(player, seg, ctx))
  } else if (seg.downhillPct >= 28) {
    events.push(makeMountainDescentEvent(player, ctx))
  } else if (nearCpuCum.length >= 2) {
    events.push(makePackRaceEvent(player, nearCpuCum.length, avgNearbyOvr, ctx))
  } else if (overallRank > 1 && closeFasterCpus.length > 0 && closeFasterCpus.length <= 2) {
    // 「追い上げ（前を追う）」は自分が1位でない時だけ。首位で誤って出さない
    events.push(makeCatchingUpEvent(player, closeFasterCpus.length, nearestFasterOvr, ctx))
  } else if (overallRank === 1 && ctx.gapBehindSec != null && ctx.gapBehindSec <= 30) {
    // 首位でも、後続が30秒以内に迫っている時だけ「先頭プレッシャー」。独走中は誤った“追いつかれる”演出を出さない
    events.push(makeFrontPressureEvent(player, nearestChaserOvr, ctx))
  } else {
    events.push(makeWaterStationEvent(player, ctx))
  }

  // 発火地点はイベントの内容に応じた適切なゾーンで出す（毎回同じにならないよう、ゾーン内で少しだけランダム）。
  // スタートダッシュ=序盤 / 山岳=序盤〜中盤 / 給水=中盤 / ラスト勝負=終盤 / 攻防系=中盤の駆け引き。
  for (const e of events) {
    let min: number
    if (e.id === 'start_dash') min = 0.08 + Math.random() * 0.10          // 序盤 8〜18%
    else if (e.id.startsWith('mountain')) min = 0.15 + Math.random() * 0.18  // 山 15〜33%
    else if (e.id === 'water_station') min = 0.35 + Math.random() * 0.20      // 給水 35〜55%
    else if (e.id === 'final_push') min = 0.74 + Math.random() * 0.14         // ラスト 74〜88%
    else min = 0.35 + Math.random() * 0.25                                     // 並走/追い上げ/先頭 35〜60%
    e.trigger = { type: 'ratio', min }
  }

  // IDを区間ごとにユニークにする
  return events.map((e, i) => ({ ...e, id: `${e.id}_seg${segIdx}_${i}` }))
}

// ─── Event Makers ────────────────────────────────────────────────────────────

function makeStartDashEvent(player: Player, ctx: RaceContext): RaceSegmentEvent {
  const isKicker = player.specialty === 'kick'
  const isLong = player.specialty === 'long' || player.specialty === 'grinder'
  const situation = pick([
    'スタートの号砲。各チームが一斉に飛び出し、序盤のポジション争いが始まった。',
    `全${ctx.totalTeams}チームが横一線。1区の主導権を握るのは誰か。`,
    'スタート直後、先頭集団が早くも形成されつつある。どの位置で入るか。',
    `${player.name}がスタートラインに立つ。号砲と共に全チームが動き出した。`,
    '序盤の位置取りがこのレースの流れを決める。最初の判断を誤れない。',
    `先頭が飛び出した。${ctx.totalTeams}チームが一斉に動く、1区の幕開けだ。`,
  ])
  const battleContext = pick([
    '1区開幕。全チームが同じ位置からスタート。序盤の位置取りが全体の流れを決める。',
    `${ctx.totalTeams}チームが団子状態。ここでの位置取りが後半の展開を左右する。`,
    'まだ差はない。序盤で無理をすればツケが回る局面。',
    '序盤の動き過ぎは後半の失速に直結する。冷静な判断が求められる。',
    'スタート直後こそ最も判断が問われる。集団の流れを見極めろ。',
  ])
  return {
    id: 'start_dash',
    type: 'スタートダッシュ',
    trigger: { type: 'ratio', min: 0.1 },
    // 相手がいないイベントも難易度を持たせて、毎回同じ%にならないようにする
    opponentOvr: 52 + Math.floor(Math.random() * 23),
    situation,
    battleContext,
    choices: [
      { id: 'a', text: '先頭集団に食らいつく', lowStaminaText: '先頭集団に食らいつく（後半のペースが心配）' },
      { id: 'b', text: '自分のペースで入る' },
      { id: 'c', text: isKicker ? 'スパートに備えて後半型で入る' : isLong ? '長距離型のリズムで刻む' : '後半勝負で体力を温存する' },
    ],
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makeMountainAscentEvent(player: Player, seg: Segment, ctx: RaceContext): RaceSegmentEvent {
  const isMountain = player.specialty === 'mountain_up'
  const intensity = seg.uphillPct >= 45 ? '激しい登り坂' : '上り区間'
  const situation = pick([
    `${intensity}に突入した。ここでどう走るかが順位を大きく左右する。`,
    ctx.gapAheadSec != null && ctx.aheadName
      ? `${intensity}へ。前を行く${ctx.aheadName}まで${Math.round(ctx.gapAheadSec)}秒。登りで詰められるか。`
      : `${intensity}へ。総合${ctx.overallRank}位、勝負どころの斜面が始まる。`,
    `${intensity}が牙を剥く。脚力の差がそのままタイム差になる区間だ。`,
    `${player.name}が${intensity}に差し掛かった。ここが正念場だ。`,
    `急勾配の${intensity}に入った。ここで無理すれば後半が崩れる。`,
    ctx.overallRank === 1
      ? `首位で${intensity}へ。このリードを登りで広げるか。`
      : `${intensity}へ。総合${ctx.overallRank}位、ここでどこまで押せるか。`,
  ])
  const battleContext = pick([
    '上り区間は選手の特性が際立つ。体力配分の判断が鍵。',
    ctx.gapBehindSec != null && ctx.behindName
      ? `総合${ctx.overallRank}位。後ろの${ctx.behindName}は${Math.round(ctx.gapBehindSec)}秒差。登りで引き離せるか。`
      : `総合${ctx.overallRank}位 / ${ctx.totalTeams}チーム。登りでの一押しが順位を動かす。`,
    'ここで脚を使いすぎれば後半が苦しい。攻めと守りの見極めどころ。',
    '登りは順位が大きく動く区間。一手間違えれば巻き返しが難しい。',
    player.specialty === 'mountain_up'
      ? `${player.name}は山岳スペシャリスト。ここが本領発揮の場面だ。`
      : `総合${ctx.overallRank}位。上りでどこまで粘れるかが鍵になる。`,
  ])
  return {
    id: 'mountain_ascent',
    type: '山岳判断',
    trigger: { type: 'ratio', min: 0.15 },
    // 難易度＝坂のきつさ＋ぶれ（急坂ほど成功率が下がる）
    opponentOvr: Math.round(46 + seg.uphillPct * 0.5 + Math.random() * 8),
    situation,
    battleContext,
    choices: [
      { id: 'a', text: isMountain ? '山のスペシャリストとして序盤から攻める' : '序盤から積極的に攻める', lowStaminaText: '攻める（体力面で厳しくなる可能性がある）' },
      { id: 'b', text: '前半抑えて後半に勝負をかける' },
      { id: 'c', text: 'リズムを刻んで体力を温存する' },
    ],
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makeMountainDescentEvent(player: Player, ctx: RaceContext): RaceSegmentEvent {
  const isDownSpec = player.specialty === 'mountain_down'
  const situation = pick([
    '下り区間に入った。攻め方次第でタイムが大きく変わる局面。',
    ctx.gapAheadSec != null && ctx.aheadName
      ? `下りへ。前の${ctx.aheadName}とは${Math.round(ctx.gapAheadSec)}秒差。一気に詰める好機。`
      : `下りへ。総合${ctx.overallRank}位、ここで攻めれば大きく動ける。`,
    '一気に標高を下げる下り坂。攻めれば差を稼げるが、リスクも伴う。',
    `${player.name}が下り区間へ。スピードに乗るか、足を守るか。`,
    '下りに入った。一瞬の判断がタイム差を生む局面だ。',
    ctx.overallRank <= 3
      ? `表彰台圏内で下りへ。この区間で一気に抜け出せるか。`
      : `下りへ。前との差を詰める絶好のチャンスが来た。`,
  ])
  const battleContext = pick([
    '下りでのリスク管理が順位を左右する。',
    ctx.gapBehindSec != null && ctx.behindName
      ? `総合${ctx.overallRank}位。${ctx.behindName}が${Math.round(ctx.gapBehindSec)}秒後ろ。下りで差を広げたい。`
      : `総合${ctx.overallRank}位 / ${ctx.totalTeams}チーム。下りの使い方が勝負を分ける。`,
    '攻めれば大きく稼げる一方、足元を乱せば失速する諸刃の局面。',
    '下りは体力回復の機会にもなる。どこまでペースを落とすかの見極めが重要だ。',
    player.specialty === 'mountain_down'
      ? `${player.name}は下りのスペシャリスト。この区間を制するのはこの選手だ。`
      : `下りで大幅にタイムを稼ぐのは技術と度胸が要る。`,
  ])
  return {
    id: 'mountain_descent',
    type: '下り判断',
    trigger: { type: 'ratio', min: 0.15 },
    opponentOvr: 52 + Math.floor(Math.random() * 23),
    situation,
    battleContext,
    choices: [
      { id: 'a', text: isDownSpec ? '下りのスペシャリストとして全開で攻める' : '積極的に飛ばして差をつける', lowStaminaText: '飛ばして差をつける（足元に注意が必要）' },
      { id: 'b', text: '安全に確実なペースで走る' },
      { id: 'c', text: '下りを使って体力を回復させながら走る' },
    ],
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makePackRaceEvent(player: Player, nearbyCount: number, opponentOvr: number | undefined, ctx: RaceContext): RaceSegmentEvent {
  const isTeamPlayer = player.specialty === 'grinder' || player.specialty === 'allrounder'
  const situation = pick([
    `${nearbyCount}チームが僅差で並走している。集団走の展開になった。`,
    `総合${ctx.overallRank}位前後で${nearbyCount}チームが密集。団子の中での駆け引きが続く。`,
    `${nearbyCount}チームが肩を並べる集団走。誰がいつ仕掛けるか、緊張感が高まる。`,
    `${player.name}は${nearbyCount}チームの集団の中にいる。この中から抜け出すか。`,
    '膠着した展開が続く。仕掛けるタイミングを見計らう緊張の局面だ。',
    `${nearbyCount}チームが横一線。ペースは落ち着いているが、誰かが仕掛ければ一気に動く。`,
  ])
  const battleContext = pick([
    '集団の中でどう動くかが後半の展開を決める。',
    ctx.gapAheadSec != null && ctx.aheadName
      ? `総合${ctx.overallRank}位。集団を抜け出せば前の${ctx.aheadName}（${Math.round(ctx.gapAheadSec)}秒先）が見えてくる。`
      : `総合${ctx.overallRank}位 / ${ctx.totalTeams}チーム。集団から抜け出すタイミングが鍵。`,
    '無駄な動きは消耗を招く。風よけを使いつつ機をうかがう局面。',
    '集団の中にいる限り安全だが、飛び出すリスクを恐れていては前に進めない。',
    '周囲のペースに引っ張られすぎないことが重要。自分のリズムを保て。',
  ])
  return {
    id: 'pack_race',
    type: '並走',
    trigger: { type: 'packSize', minCount: 2, withinSec: 12 },
    situation,
    battleContext,
    choices: [
      { id: 'a', text: '集団から抜け出しを図る', lowStaminaText: '集団から抜け出す（今の状態では消耗が激しい）' },
      { id: 'b', text: isTeamPlayer ? '集団のペースをコントロールしながら走る' : '集団につきながら体力を温存する' },
      { id: 'c', text: '集団の中で温存してラストに賭ける' },
    ],
    opponentOvr,
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makeCatchingUpEvent(player: Player, aheadCount: number, opponentOvr: number | undefined, ctx: RaceContext): RaceSegmentEvent {
  void player
  const situation = pick([
    ctx.gapAheadSec != null && ctx.aheadName
      ? `現在総合${ctx.overallRank}位。前の${ctx.aheadName}まで${Math.round(ctx.gapAheadSec)}秒。ここで仕掛けるか。`
      : `前を走る${aheadCount <= 1 ? 'チームが射程圏内' : `${aheadCount}チームが前方`}にいる。追いかけるか？`,
    ctx.aheadName
      ? `射程圏内に${ctx.aheadName}の背中。総合${ctx.overallRank}位から浮上のチャンスだ。`
      : `前走者との差がじわじわ縮まる。総合${ctx.overallRank}位、追撃の好機。`,
    `前を行く${aheadCount <= 1 ? 'ライバル' : `${aheadCount}チーム`}が射程に。勝負を仕掛けるか、脚を温存するか。`,
    `${player.name}が前を追う。このまま差を詰めて逆転を狙うか。`,
    ctx.aheadName
      ? `${ctx.aheadName}の背中が見えてきた。あと一押しで届く距離だ。`
      : '少しずつ前との差が縮まっている。勝負に出るなら今しかない。',
    `総合${ctx.overallRank}位、前方のチームを射程に捉えた。一気に仕掛けるか。`,
  ])
  const battleContext = pick([
    '前走者との差が縮まるペース。判断次第で逆転のチャンスがある。',
    ctx.gapAheadSec != null
      ? `前との差は${Math.round(ctx.gapAheadSec)}秒。仕掛けるなら今、だが消耗のリスクも大きい。`
      : '差は詰まりつつある。無理な追走は後半の失速を招く。',
    `総合${ctx.overallRank}位 / ${ctx.totalTeams}チーム。ここでの判断が順位を動かす。`,
    'ここで追いかければタイムを稼げる。ただし後半のスタミナを考えて判断を。',
    '一つ順位を上げるだけで大きくポイントが変わる局面。リスクを取る価値はあるか。',
  ])
  return {
    id: 'catching_up',
    type: '追い上げ',
    trigger: { type: 'gapAheadBelow', sec: 15 },
    situation,
    battleContext,
    choices: [
      { id: 'a', text: 'ペースアップして一気に追いかける', lowStaminaText: '追いかける（消耗が激しくなる）' },
      { id: 'b', text: 'じわじわと距離を縮めていく' },
      { id: 'c', text: '無理をせず自分のレースに集中する' },
    ],
    opponentOvr,
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makeFrontPressureEvent(player: Player, opponentOvr: number | undefined, ctx: RaceContext): RaceSegmentEvent {
  const situation = pick([
    '単独トップを走っているが、後続の気配を感じる。プレッシャーをどう処理するか。',
    ctx.gapBehindSec != null && ctx.behindName
      ? `総合首位。だが${ctx.behindName}が${Math.round(ctx.gapBehindSec)}秒後ろに迫る。逃げ切れるか。`
      : '総合首位を走る。後続のプレッシャーをどう跳ね返すか。',
    'トップを快走中。背後から追い上げる足音が、じわりと重圧をかけてくる。',
    `${player.name}が先頭を独走。後続との差をさらに広げるか、脚を温存するか。`,
    '首位をキープしているが、楽はできない。後続はじわじわと迫ってくる。',
    ctx.gapBehindSec != null
      ? `現在首位。後続との差は${Math.round(ctx.gapBehindSec)}秒。このリードを守り切れるか。`
      : '先頭を走る重圧。ペースを落とせば一瞬で飲み込まれる。',
  ])
  const battleContext = pick([
    '現在トップ独走。後続との差をどう守り切るかが鍵。',
    ctx.gapBehindSec != null && ctx.behindName
      ? `2位の${ctx.behindName}との差は${Math.round(ctx.gapBehindSec)}秒。この貯金をどう使う。`
      : '首位の重圧。守りに入るか、さらに突き放すか。',
    'リードを広げるか、確実に守るか。トップランナーの判断が問われる。',
    '先頭を走ることは精神的なプレッシャーでもある。ペース管理が命運を握る。',
    'リードがあるうちに突き放すか、後半に向けてペースを落とすか。一手の差が大きい。',
  ])
  return {
    id: 'front_pressure',
    type: '先頭プレッシャー',
    trigger: { type: 'gapBehindBelow', sec: 20 },
    situation,
    battleContext,
    choices: [
      { id: 'a', text: '構わずペースを上げてさらに差を広げる', lowStaminaText: 'ペースを上げる（限界が近いかもしれない）' },
      { id: 'b', text: '後続を意識しつつ現ペースを維持する' },
      { id: 'c', text: '計算した走りで無駄なエネルギーを使わない' },
    ],
    opponentOvr,
    _effects: [
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
    ],
  }
}

function makeWaterStationEvent(player: Player, ctx: RaceContext): RaceSegmentEvent {
  const situation = pick([
    '給水ポイントが近づいた。ここでどう補給するか。',
    `総合${ctx.overallRank}位で給水所へ。わずかな所作の差がタイムに響く。`,
    '前方に給水所。喉の渇きと、失いたくない数秒との葛藤。',
    `${player.name}が給水ポイントへ近づく。ここでの判断が後半のスタミナに直結する。`,
    '沿道の給水が見えてきた。一瞬のロスをどうするか。',
    `後半を見据えた補給の判断。総合${ctx.overallRank}位、ここで隙を作りたくない。`,
  ])
  const battleContext = pick([
    '前後のチームも同じタイミングで給水を迎える。',
    ctx.gapAheadSec != null && ctx.aheadName
      ? `前の${ctx.aheadName}とは${Math.round(ctx.gapAheadSec)}秒差。給水のロスを最小に抑えたい。`
      : ctx.gapBehindSec != null && ctx.behindName
        ? `${ctx.behindName}が${Math.round(ctx.gapBehindSec)}秒後ろ。給水で隙を見せたくない。`
        : `総合${ctx.overallRank}位 / ${ctx.totalTeams}チーム。補給の判断も順位に効いてくる。`,
    'ここで水分を入れるかどうかで、後半の粘りが変わってくる。',
    '後半が長いなら補給は必須。ただしタイムロスは避けたい。',
    '補給を怠れば後半の失速につながる。でも止まれば差が開く。',
  ])
  return {
    id: 'water_station',
    type: '給水',
    trigger: { type: 'stamina' },
    opponentOvr: 46 + Math.floor(Math.random() * 20),
    situation,
    battleContext,
    choices: [
      { id: 'a', text: 'しっかり給水して後半に備える' },
      { id: 'b', text: '素早く受け取ってペースを落とさない' },
      { id: 'c', text: '給水をパスしてタイムを削る' },
    ],
    _effects: [
      { effortType: 'conservative', staminaSuccess: 0,  timeBonusSuccess: 0,       staminaFail: 0,  timeBonusFail: 0 },
      { effortType: 'balanced',     staminaSuccess: -1, timeBonusSuccess: -0.0024, staminaFail: -2, timeBonusFail: 0.0018 },
      { effortType: 'aggressive',   staminaSuccess: -2, timeBonusSuccess: -0.0048, staminaFail: -3, timeBonusFail: 0.0036 },
    ],
  }
}


// ─── Resolve Choice ──────────────────────────────────────────────────────────

// 選択肢の成功確率。攻め＝低確率・高リターン / 標準＝中間 / 温存＝高確率。
// どれも実力差(gap)で上下するので、同じイベントでも選択肢ごとに違う%が並ぶ。
// 表示(SimPhase)と判定(resolveChoice)で同じ値を使うためにexportして共用する。
export function choiceSuccessProb(
  effortType: 'aggressive' | 'balanced' | 'conservative',
  segStamina: number,
  opponentOvr: number,
): number {
  const gap = segStamina - opponentOvr
  if (effortType === 'conservative') return Math.max(0.85, Math.min(0.99, 0.93 + gap * 0.004))
  if (effortType === 'aggressive') return Math.max(0.10, Math.min(0.80, 0.42 + gap * 0.025))
  return Math.max(0.30, Math.min(0.92, 0.62 + gap * 0.015))
}

export function resolveChoice(
  event: RaceSegmentEvent,
  choiceIdx: number,
  segStamina: number,
  segBaseTime: number,
): { staminaDelta: number; timeDelta: number; newStamina: number; success: boolean } {
  const effect = event._effects[choiceIdx]
  if (!effect) return { staminaDelta: 0, timeDelta: 0, newStamina: segStamina, success: true }

  // timeBonus は区間タイムに対する割合。区間の基準タイムに掛けて秒に変換する。
  // 温存も含めて全選択肢が表示された%どおりに判定される（温存は高確率だが確実ではない）
  const successProb = choiceSuccessProb(effect.effortType, segStamina, event.opponentOvr ?? segStamina)
  const success = Math.random() < successProb

  const staminaDelta = success ? effect.staminaSuccess : effect.staminaFail
  const timeFrac = success ? effect.timeBonusSuccess : effect.timeBonusFail
  const timeDelta = Math.round(segBaseTime * timeFrac)

  return { staminaDelta, timeDelta, newStamina: segStamina + staminaDelta, success }
}

// ─── Finalize Segment ────────────────────────────────────────────────────────

export function finalizeSegment(params: {
  segmentIndex: number
  playerTeamId: string
  playerPlayerId: string
  playerFinalTime: number
  cpuTimesForSeg: Record<string, number>
  cpuLineups: Record<string, Record<number, string>>
}): InteractiveSegResult {
  const { segmentIndex, playerTeamId, playerPlayerId, playerFinalTime, cpuTimesForSeg, cpuLineups } = params
  const runners: { playerId: string; teamId: string; timeSec: number; rank: number }[] = [
    { playerId: playerPlayerId, teamId: playerTeamId, timeSec: playerFinalTime, rank: 0 },
  ]
  for (const [teamId, timeSec] of Object.entries(cpuTimesForSeg)) {
    const playerId = cpuLineups[teamId]?.[segmentIndex] ?? ''
    runners.push({ playerId, teamId, timeSec, rank: 0 })
  }
  runners.sort((a, b) => a.timeSec - b.timeSec)
  runners.forEach((r, i) => { r.rank = i + 1 })
  return { segmentIndex, runners }
}
