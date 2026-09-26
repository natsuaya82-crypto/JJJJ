// レースの時計（タスキをつないで途切れずに走る）。
//
// 各チームの区間タイムから「時刻 t に、どのチームがどの区間の何km地点にいるか」と、
// 総合の差・区間の差を出す**唯一の場所**。棒グラフ（`components/race/SimPhase` の `RaceTrack`）も
// 2.0.9 の3Dもここだけを読む。★React も store も import しないこと（点検から呼ぶため）。
//
// ■時計
//   t はスタートからのレース秒。どのチームも 0 秒に1区を走り出し、区間を走り終えた瞬間に
//   次の走者へタスキを渡す。**先頭のチームは後ろのチームより先の区間を走っている。**
//   以前の画面は区間ごとに全チームを同時に走り出させていた（区間の頭で全員が横一線に戻る）。
//
// ■差の定義
//   総合 … 先頭がその地点を通ってから何秒後に通ったか（先頭は0）。ゴール後は総合タイムの差
//   区間 … その区間の頭から同じ地点まで、その区間に入ったチームのうち**いちばん速いペース**
//          より何秒かかっているか（並べたときの1位との差）。区間を走り終えたチームは区間タイムの差そのもの。
//          ★「その地点に実際に着いたチーム」だけと比べないこと。いちばん前のチームは比べる相手が
//            居ないので、遅くても必ず1位になる

//
// ■並び
//   前を走っている順。同じ地点なら先に着いた順、それも同じなら**渡された並びの順**。
//   最終順位（`raceEngine` の `buildTeamRankings`）は同タイムを渡した並びのまま残すので、
//   チームは最終順位を作るときと同じ並びで渡すこと（そうすれば最後の時刻で必ず一致する）。
//
// ■速さが途中で変わったとき
//   区間の途中でタイムが変わっても（駅伝中の選択）、**位置は跳ばない。** 変わった点を `via` に
//   残し、そこから先の距離だけ速さが変わる（`withNewLegTime`）。

/** 区間の途中で速さが変わった点（区間の頭からの秒・km） */
export type LegPoint = { at: number; km: number }

/** 1区間ぶんの走り。`time` 秒で区間を走り切る */
export type Leg = { time: number; via?: readonly LegPoint[] }

export type TimelineTeam = {
  teamId: string
  /** 区間ごとの走り（走る順）。null＝走者が居ない＝そこで止まる */
  legs: readonly (Leg | null)[]
}

type Built = TimelineTeam & {
  order: number
  /** 各区間を走り出した時刻（走った区間ぶんだけ） */
  starts: number[]
  /** 走った区間の数（最初に走者が居ない区間まで） */
  ran: number
  /** 止まった時刻（ゴール or 走者の居ない区間に着いた時刻） */
  end: number
}

export type RaceTimeline = {
  /** 区間の距離（走る順） */
  distances: readonly number[]
  /** 各区間の頭がスタートから何kmか */
  startKm: readonly number[]
  entries: readonly Built[]
  /** 全チームが止まる時刻 */
  endTime: number
}

/** 時刻 t のそのチーム */
export type RunnerState = {
  teamId: string
  /** 走っている区間（`distances` の添字）。止まったら最後に走った区間 */
  leg: number
  /** その区間の頭からのkm */
  km: number
  /** スタートからのkm */
  raceKm: number
  /** いまの地点に着いた時刻（走っている間は t） */
  at: number
  /** 全区間を走り終えた */
  finished: boolean
}

export type TimelineSnapshot = {
  t: number
  /** 前を走っている順。`gap` は先頭がその地点を通ってからの秒（先頭は0） */
  overall: (RunnerState & { gap: number })[]
  /** 全チームが止まった */
  done: boolean
}

function pointsOf(leg: Leg, dist: number): LegPoint[] {
  const pts: LegPoint[] = [{ at: 0, km: 0 }]
  for (const p of leg.via ?? []) {
    const last = pts[pts.length - 1]
    if (p.at > last.at && p.km >= last.km && p.at < leg.time && p.km < dist) pts.push(p)
  }
  pts.push({ at: leg.time, km: dist })
  return pts
}

function kmAt(pts: LegPoint[], e: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (e <= b.at) return a.km + (b.km - a.km) * (b.at > a.at ? (e - a.at) / (b.at - a.at) : 1)
  }
  return pts[pts.length - 1].km
}

function elapsedAt(pts: LegPoint[], km: number): number {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    if (km <= b.km) return a.at + (b.at - a.at) * (b.km > a.km ? (km - a.km) / (b.km - a.km) : 0)
  }
  return pts[pts.length - 1].at
}

export function buildTimeline(distances: readonly number[], entries: readonly TimelineTeam[]): RaceTimeline {
  const startKm: number[] = []
  let km = 0
  for (const d of distances) { startKm.push(km); km += d }
  const built = entries.map((team, order): Built => {
    const starts: number[] = []
    let clock = 0
    let ran = 0
    for (let j = 0; j < distances.length; j++) {
      const leg = team.legs[j]
      if (!leg) break
      starts.push(clock)
      clock += leg.time
      ran++
    }
    return { ...team, order, starts, ran, end: clock }
  })
  return { distances, startKm, entries: built, endTime: Math.max(0, ...built.map(b => b.end)) }
}

function stateOf(tl: RaceTimeline, b: Built, t: number): RunnerState {
  const finished = b.ran === tl.distances.length
  if (b.ran === 0) return { teamId: b.teamId, leg: 0, km: 0, raceKm: 0, at: 0, finished }
  if (t >= b.end) {
    const leg = b.ran - 1
    const km = tl.distances[leg]
    return { teamId: b.teamId, leg, km, raceKm: tl.startKm[leg] + km, at: b.end, finished }
  }
  const now = Math.max(0, t)
  let leg = 0
  while (leg + 1 < b.ran && b.starts[leg + 1] <= now) leg++
  const km = kmAt(pointsOf(b.legs[leg]!, tl.distances[leg]), now - b.starts[leg])
  return { teamId: b.teamId, leg, km, raceKm: tl.startKm[leg] + km, at: now, finished: false }
}

/** そのチームがスタートから raceKm の地点を通った時刻 */
function passedAt(tl: RaceTimeline, b: Built, raceKm: number): number {
  for (let j = 0; j < b.ran; j++) {
    if (raceKm <= tl.startKm[j] + tl.distances[j]) {
      return b.starts[j] + elapsedAt(pointsOf(b.legs[j]!, tl.distances[j]), raceKm - tl.startKm[j])
    }
  }
  return b.end
}

const teamOf = (tl: RaceTimeline, teamId: string) => tl.entries.find(b => b.teamId === teamId)

export function runnerAt(tl: RaceTimeline, teamId: string, t: number): RunnerState | null {
  const b = teamOf(tl, teamId)
  return b ? stateOf(tl, b, t) : null
}

/** そのチームがその区間を走り終える時刻（走らない区間なら null） */
export function legEndAt(tl: RaceTimeline, teamId: string, leg: number): number | null {
  const b = teamOf(tl, teamId)
  return b && leg < b.ran ? b.starts[leg] + b.legs[leg]!.time : null
}

export function snapshotAt(tl: RaceTimeline, t: number): TimelineSnapshot {
  const states = tl.entries.map(b => ({ b, s: stateOf(tl, b, t) }))
  states.sort((x, y) => y.s.raceKm - x.s.raceKm || x.s.at - y.s.at || x.b.order - y.b.order)
  const leader = states[0]
  const overall = states.map(({ s }) => ({
    ...s,
    gap: leader ? Math.max(0, s.at - passedAt(tl, leader.b, s.raceKm)) : 0,
  }))
  return { t, overall, done: t >= tl.endTime }
}

/**
 * その区間の順（その区間で速い順）。`gap` は1位との差の秒。まだその区間に入っていないチームは
 * 後ろに総合の順で並び、`gap` は null。
 */
export function legBoardAt(tl: RaceTimeline, t: number, leg: number): { teamId: string; gap: number | null }[] {
  const dist = tl.distances[leg] ?? 0
  const started = tl.entries
    .filter(b => leg < b.ran && b.starts[leg] <= t)
    .map(b => {
      const pts = pointsOf(b.legs[leg]!, dist)
      const e = Math.min(t, b.starts[leg] + b.legs[leg]!.time) - b.starts[leg]
      return { b, pts, e, km: kmAt(pts, e) }
    })
  const lost = started.map(x => {
    const best = Math.min(...started.map(y => elapsedAt(y.pts, x.km)))
    return { x, lost: x.e - best }
  }).sort((p, q) => p.lost - q.lost || p.x.b.order - q.x.b.order)
  const top = lost[0]?.lost ?? 0
  const inLeg = new Set(lost.map(p => p.x.b.teamId))
  return [
    ...lost.map(p => ({ teamId: p.x.b.teamId, gap: p.lost - top })),
    ...snapshotAt(tl, t).overall.filter(s => !inLeg.has(s.teamId)).map(s => ({ teamId: s.teamId, gap: null })),
  ]
}

/**
 * 区間の途中でタイムが変わったときの新しい走り。時刻 t の位置はそのままで、
 * **残りの距離だけ速さが変わる**（位置が跳ばない）。
 */
export function withNewLegTime(tl: RaceTimeline, teamId: string, leg: number, t: number, newTime: number): Leg | null {
  const b = teamOf(tl, teamId)
  const old = b?.legs[leg]
  if (!b || !old || leg >= b.ran) return null
  const e = t - b.starts[leg]
  if (e <= 0 || e >= old.time) return { time: newTime, via: old.via }
  const km = kmAt(pointsOf(old, tl.distances[leg]), e)
  return { time: newTime, via: [...(old.via ?? []).filter(p => p.at < e), { at: e, km }] }
}
