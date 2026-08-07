import type { Player, Specialty, RaceResults, Race, Team, Segment } from '../types'
import type { TraitId } from '../utils/traitUtils'
import { positionPointsFor, divisionOf, teamsInDivision } from '../utils/league'

// セーブ破損や旧データで ratings 自体（または一部の能力）が欠けている選手が混ざっても、
// 描画・計算の途中で例外を投げてアプリが真っ白にならないようにするための防御。
// 正常なデータでは同じオブジェクトをそのまま返すのでコストは実質ゼロ。
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
export function safeRatings(r: Player['ratings'] | undefined | null): Player['ratings'] {
  if (r && isNum(r.speed) && isNum(r.stamina) && isNum(r.mountainUp) && isNum(r.mountainDown)
    && isNum(r.pacing) && isNum(r.mental) && isNum(r.recovery)) return r
  const p = (r ?? {}) as Partial<Player['ratings']>
  return {
    speed: isNum(p.speed) ? p.speed : 0,
    stamina: isNum(p.stamina) ? p.stamina : 0,
    mountainUp: isNum(p.mountainUp) ? p.mountainUp : 0,
    mountainDown: isNum(p.mountainDown) ? p.mountainDown : 0,
    pacing: isNum(p.pacing) ? p.pacing : 0,
    mental: isNum(p.mental) ? p.mental : 0,
    recovery: isNum(p.recovery) ? p.recovery : 0,
  }
}

export function calcBaseAbility(
  ratingsIn: Player['ratings'],
  uphillPct: number,
  downhillPct: number,
  distanceKm: number,
  statWeights?: Partial<Record<keyof Player['ratings'], number>>,
): number {
  const ratings = safeRatings(ratingsIn)
  if (statWeights) {
    return (Object.keys(statWeights) as (keyof typeof ratings)[]).reduce((sum, key) => {
      return sum + ratings[key] * (statWeights[key] ?? 0)
    }, 0)
  }
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct)
  const longBonus = Math.min(distanceKm / 20, 1.0)
  const shortBonus = Math.max(0, 1 - distanceKm / 8)
  // 地形ごとに最重要スタットを大きく偏らせ、コースに特色を持たせる
  // flat: speed支配。長距離はstamina+recoveryが伸びる
  const flatScore = ratings.speed    * (0.62 + shortBonus * 0.12)
                  + ratings.stamina  * (0.14 + longBonus  * 0.12)
                  + ratings.pacing   * 0.12
                  + ratings.mental   * 0.06
                  + ratings.recovery * (0.06 + longBonus  * 0.06)
  // uphill: mountainUp圧倒的支配
  const upScore   = ratings.mountainUp * 0.72
                  + ratings.stamina    * (0.15 + longBonus * 0.05)
                  + ratings.mental     * 0.07
                  + ratings.pacing     * 0.04
                  + ratings.recovery   * 0.02
  // downhill: mountainDown圧倒的支配
  const downScore = ratings.mountainDown * 0.72
                  + ratings.speed        * 0.16
                  + ratings.mental       * 0.07
                  + ratings.pacing       * 0.03
                  + ratings.recovery     * 0.02
  return (flatPct / 100) * flatScore + (uphillPct / 100) * upScore + (downhillPct / 100) * downScore
}

export function calcAffinity(
  specialty: Specialty,
  uphillPct: number,
  downhillPct: number,
  distanceKm: number,
): number {
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct)
  let mult = 1.0
  switch (specialty) {
    case 'sprinter':
      mult += (flatPct / 100) * 0.12 * (distanceKm <= 8 ? 1.4 : 1.0)
      mult -= (uphillPct / 100) * 0.18
      break
    case 'mountain_up':
      mult += (uphillPct / 100) * 0.14
      mult -= (flatPct / 100) * 0.07
      break
    case 'mountain_down':
      mult += (downhillPct / 100) * 0.14
      mult -= (uphillPct / 100) * 0.10
      break
    case 'long':
      mult += (distanceKm >= 15 ? 0.10 : distanceKm >= 10 ? 0.05 : -0.04)
      break
    case 'undulating':
      // 起伏型：登りも下りもこなす。平坦だけの区間では強みが出ない
      mult += ((uphillPct + downhillPct) / 100) * 0.13
      mult -= (flatPct / 100) * 0.06
      break
    case 'ace':
      // エースは地形で強みが決まらない。**その区間の推奨がエースのときだけ**大きく効く
      // （どの区間をエース区間にするかはコース側が決める＝ Segment.recommended）。
      // 加点は calcSegmentAffinity 側でまとめて掛けるので、ここでは素の値のまま
      break
    case 'allrounder':
      // オールラウンダー：得意も苦手も無い。どの区間に置いても目減りしない
      mult += 0.02
      break
    case 'kick':
      mult += (flatPct / 100) * 0.08
      mult -= (uphillPct / 100) * 0.08
      break
    case 'grinder':
      mult += (distanceKm >= 12 ? 0.07 : 0)
      mult += (flatPct >= 50 ? 0.03 : 0)
      break
  }
  // 補正の効きを抑える：OVRが素直にタイムへ反映されるよう振れ幅を約6割に圧縮
  return Math.max(0.90, Math.min(1.12, 1.0 + (mult - 1.0) * 0.6))
}

// 区間の推奨ポジション（recommended）と選手の特性が一致したときの+5%を掛ける唯一の場所。
// calcAffinity自体は変えない。他の呼び出し箇所を増やさず、必ずここを経由すること。
export function calcSegmentAffinity(specialty: Specialty, seg: Pick<Segment, 'uphillPct' | 'downhillPct' | 'distanceKm' | 'recommended'>): number {
  const base = calcAffinity(specialty, seg.uphillPct, seg.downhillPct, seg.distanceKm)
  if (specialty !== seg.recommended) return base
  // 推奨と一致したときの上乗せ。エースだけ大きいのは、エースが地形で強くならない代わりに
  // 「その区間を任される選手」だから。どの区間をエースに任せるかはコースが決める
  return base * (specialty === 'ace' ? 1.09 : 1.05)
}

export function calcClubModifier(team: Pick<Team, 'city'>, raceLocation: string): number {
  let mod = 1.00
  if (raceLocation && team.city && raceLocation.includes(team.city)) mod += 0.02
  return mod
}

export function calcConditionModifier(fatigue: number, morale: number, form: number): number {
  const fatigueMod = 1.0 - Math.max(0, (fatigue - 25) / 75) * 0.16
  const moraleMod = morale <= 70 ? 0.95 + (morale / 70) * 0.05 : 1.0 + ((morale - 70) / 30) * 0.03
  const formMod = 1.0 + form * 0.03
  return fatigueMod * moraleMod * formMod
}

export function calcRandomFactor(traits?: TraitId[]): number {
  // ブレ幅を縮小（±8%→±4%）。OVR差が結果に素直に出るようにし、弱い選手が強い選手に勝つ番狂わせを減らす。
  const range = traits?.includes('consistent') ? 0.02 : traits?.includes('volatile') ? 0.07 : 0.04
  return (1.0 - range) + Math.random() * (range * 2)
}

export function calcTraitModifier(
  traits: TraitId[],
  uphillPct: number,
  downhillPct: number,
  distanceKm: number,
  segIndex: number,
  totalSegs: number,
): number {
  const flatPct = Math.max(0, 100 - uphillPct - downhillPct)
  let mod = 1.0
  const isLast = segIndex === totalSegs   // seg.index は1始まりなので最終区は totalSegs
  const isLate = segIndex >= Math.floor(totalSegs / 2)
  for (const t of traits) {
    if (t === 'clutch'        && isLast)                                mod *= 1.05
    if (t === 'fade'          && isLate)                                mod *= 0.96
    if (t === 'mountain_ace'  && uphillPct >= 30)                       mod *= 1.06
    if (t === 'sprint_burst'  && flatPct >= 60 && distanceKm <= 10)    mod *= 1.06
    if (t === 'iron_will'     && distanceKm >= 15)                      mod *= 1.03
    if (t === 'big_stage'     && (segIndex === 0 || isLast))            mod *= 1.02
    if (t === 'pressure_weak' && isLast)                                mod *= 0.97
  }
  return mod
}

// score → 平地基準ペース(秒/km) の対応表
// OVR95前後で世界記録級ペースになるよう設計。補正は控えめにしてOVRが素直に出るようにする。
const PACE_TABLE: [number, number][] = [
  [0,   252],
  [30,  230],
  [40,  218],
  [50,  206],
  [60,  194],
  [70,  184],
  [80,  174],
  [85,  168],
  [90,  163],
  [95,  158],
  [99,  154],
]

function scoreToBasePace(score: number): number {
  const t = PACE_TABLE
  if (score <= t[0][0]) return t[0][1]
  if (score >= t[t.length - 1][0]) return t[t.length - 1][1]
  for (let i = 0; i < t.length - 1; i++) {
    const [s0, p0] = t[i], [s1, p1] = t[i + 1]
    if (score >= s0 && score <= s1) return p0 + (score - s0) / (s1 - s0) * (p1 - p0)
  }
  return t[t.length - 1][1]
}

export function scoreToTime(score: number, distanceKm: number, uphillPct = 0, downhillPct = 0): number {
  const gradePenalty = uphillPct * 0.4 - downhillPct * 0.35
  const basePaceSec = Math.max(50, scoreToBasePace(score) + gradePenalty)
  const distCoeff = distanceKm <= 5 ? 1.0
    : distanceKm <= 10 ? 1.038
    : distanceKm <= 16 ? 1.06
    : distanceKm <= 21 ? 1.077
    : 1.10
  return Math.round(basePaceSec * distanceKm * distCoeff)
}

// タイム表示は utils/eventTime.ts の formatRaceTime に一本化した（同じ処理が3つ手書き
// されていたうちの1つ。fmtTime だけ Math.round が無いバグがあったため統合時に揃えた）。

export function formatDiff(diffSec: number): string {
  const rounded = Math.round(diffSec)
  if (rounded === 0) return '+-0'
  const sign = rounded > 0 ? '+' : '-'
  const abs = Math.abs(rounded)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  if (m > 0) return `${sign}${m}分${s}秒`
  return `${sign}${s}秒`
}

// 出場可能な選手リストを地形（登坂/下りの急な区間を優先）に応じて各区間へ貪欲割当する汎用版。
// buildAILineup のチーム非依存版で、ECL・海外リーグの配置でも共用する。
export function assignLineupByTerrain(roster: Player[], race: Race): Record<number, string> {
  const sortedSegs = [...race.segments].sort((a, b) => Math.max(b.uphillPct, b.downhillPct) - Math.max(a.uphillPct, a.downhillPct))
  const used = new Set<string>()
  const lineup: Record<number, string> = {}
  for (const seg of sortedSegs) {
    if (roster.length === used.size) break
    const candidates = roster
      .filter(p => !used.has(p.id))
      .map(p => ({
        id: p.id,
        score: calcBaseAbility(p.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
             * calcSegmentAffinity(p.specialty, seg)
             * calcConditionModifier(p.fatigue ?? 0, p.morale ?? 70, p.form ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
    if (candidates.length === 0) continue
    lineup[seg.index] = candidates[0].id
    used.add(candidates[0].id)
  }
  return lineup
}

// ※ buildAILineup（チームIDから配置を組む関数）はここにあったが消した。
//   中身が下の bgLineup とまったく同じ判断で、置き場所が2つある状態だった。
/**
 * 区間に走者を並べる。**並べ方はここ1本。**
 * 1. 監督が組んだ配置があればそれを先に確定
 * 2. 地形の起伏が大きい区間から、適性の高い選手を置く（assignLineupByTerrain）
 * 3. それでも空いた区間を、残った選手 → 控え（reserve）の順で一番速い人で埋める
 *
 * 3が要るのは、走者が区間数より少ないと assignLineupByTerrain が途中で止まるため。
 * 空区間のまま走らせると総合タイムが短くなり、再生と結果画面で順位が食い違う。
 * 埋めきれない（人が足りない）ときだけ空区間が残る。
 */
export function bgLineup(roster: Player[], race: Race, base?: Record<number, string>, reserve: Player[] = []): Record<number, string> {
  const byId = new Map([...roster, ...reserve].map(p => [p.id, p]))
  const lineup: Record<number, string> = {}
  const used = new Set<string>()
  // 監督が組んだぶんを先に確定させる（同じ選手を2区間に置かない）
  for (const [seg, pid] of Object.entries(base ?? {})) {
    if (!pid || used.has(pid) || !byId.has(pid)) continue
    lineup[Number(seg)] = pid
    used.add(pid)
  }
  const rest = roster.filter(p => !used.has(p.id))
  const openSegs = race.segments.filter(s => !lineup[s.index])
  const auto = assignLineupByTerrain(rest, { ...race, segments: openSegs })
  for (const [seg, pid] of Object.entries(auto)) { lineup[Number(seg)] = pid; used.add(pid) }

  for (const seg of race.segments) {
    if (lineup[seg.index]) continue
    const left = [...roster, ...reserve].filter(p => !used.has(p.id))
    if (left.length === 0) continue
    const best = left.reduce((a, b) =>
      calcBaseAbility(b.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights) >
      calcBaseAbility(a.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights) ? b : a)
    lineup[seg.index] = best.id
    used.add(best.id)
  }
  return lineup
}

const TACTIC_MODS: Record<string, number> = {
  normal: 1.0,
  aggressive: 1.08,
  conservative: 0.95,
  pacemaker: 0.85,
}

export function calcWeatherModifier(
  weather: 'sunny' | 'cloudy' | 'rainy' | 'windy',
  specialty: Specialty,
  stamina: number,
  mental: number,
): number {
  let mod = 1.0
  switch (weather) {
    case 'rainy':
      // 雨は基本的に遅くなる。高スタミナ・粘り型はダメージを軽減できるが、速くはならない。
      mod -= 0.035
      mod += Math.min(0.03, Math.max(0, (stamina - 60) * 0.0006))
      if (specialty === 'grinder' || specialty === 'long') mod += 0.01
      else if (specialty === 'sprinter') mod -= 0.015
      break
    case 'windy':
      mod -= 0.015
      mod += (mental - 70) * 0.001
      break
    case 'sunny':
      if (specialty === 'sprinter' || specialty === 'kick') mod += 0.015
      break
    case 'cloudy':
      break
  }
  return Math.max(0.90, Math.min(1.10, mod))
}

function resolveSegmentEvents(ratings: Player['ratings'], isLastSeg: boolean): number {
  const nEvents = Math.floor(Math.random() * 2) + 1
  let timeMult = 1.0
  for (let i = 0; i < nEvents; i++) {
    const type = Math.floor(Math.random() * 5)
    const roll = Math.floor(Math.random() * 100)
    if (type === 0) {          // 集団追走: 速力
      if (ratings.speed > roll) timeMult *= 0.98
    } else if (type === 1) {   // 被追走: 精神
      if (ratings.mental <= roll) timeMult *= 1.01
    } else if (type === 2) {   // 勾配対応: (登坂+下り)/2
      if ((ratings.mountainUp + ratings.mountainDown) / 2 > roll) timeMult *= 0.97
    } else if (type === 3) {   // 給水: 回復
      if (ratings.recovery > roll) timeMult *= 0.99
    } else if (isLastSeg) {    // 終盤スパート: (持久+速力)/2
      const ab = (ratings.stamina + ratings.speed) / 2
      timeMult *= ab > roll ? 0.97 : 1.01
    }
  }
  return timeMult
}

/**
 * そのレースに出るCPUチームの区間割り当てをまとめて組む。
 *
 * ★「誰が走るか」はここ1本。**自分と同じ部のチームだけ**が出走する。
 *   以前は gameStore.runRace（スキップ進行）と RacePage（中継つき）の2箇所で
 *   lineups を手書きしていて、RacePage 側だけ部で絞っていなかった。
 *   その結果、中継で走ると52チーム全員が参加し、3部のチームが1部の相手に混ざって
 *   「3部なのに48位」になっていた。順位ポイントも参加チーム数から出すので全部ずれる。
 */
export function buildCpuLineups(
  teams: readonly Team[],
  players: Player[],
  race: Race,
  playerTeamId: string,
): Record<string, Record<number, string>> {
  const myDivision = divisionOf(teams.find(t => t.id === playerTeamId))
  const out: Record<string, Record<number, string>> = {}
  for (const team of teamsInDivision(teams, myDivision)) {
    if (team.id === playerTeamId) continue
    out[team.id] = bgLineup(players.filter(p => p.teamId === team.id && p.status === 'active'), race)
  }
  return out
}

export function simulateRace(
  race: Race,
  lineups: Record<string, Record<number, string>>,
  teams: Team[],
  players: Player[],
  _seasonProgress: number,
  playerTeamId?: string,
  segmentTactics?: Record<number, string>,
): RaceResults {
  const teamIds = Object.keys(lineups)
  const teamMap = new Map(teams.map(t => [t.id, t]))
  const playerMap = new Map(players.map(p => [p.id, p]))
  const cumTime: Record<string, number> = {}
  teamIds.forEach(id => { cumTime[id] = 0 })
  const segPts: Record<string, number> = {}
  teamIds.forEach(id => { segPts[id] = 0 })
  const segmentResults: RaceResults['segmentResults'] = []
  const totalSegs = race.segments.length
  for (const seg of race.segments) {
    const runners: { playerId: string; teamId: string; timeSec: number; rank: number }[] = []
    for (const teamId of teamIds) {
      const playerId = lineups[teamId]?.[seg.index]
      if (!playerId) continue
      const player = playerMap.get(playerId)
      if (!player) continue
      const team = teamMap.get(teamId)
      const traits = player.traits ?? []
      const effectiveRatings = player.ratings
      const base     = calcBaseAbility(effectiveRatings, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.statWeights)
      const aff      = calcSegmentAffinity(player.specialty, seg)
      const clubMod  = team ? calcClubModifier(team, race.location) : 1.0
      const rand     = calcRandomFactor(traits)
      const fatigue  = player.specialty === 'grinder' ? Math.min(player.fatigue ?? 0, 40) : (player.fatigue ?? 0)
      const condMod  = calcConditionModifier(fatigue, player.morale ?? 70, player.form ?? 0)
      const traitMod = calcTraitModifier(traits, seg.uphillPct, seg.downhillPct, seg.distanceKm, seg.index, totalSegs)
      const isLastThird = seg.index >= Math.floor(totalSegs * 2 / 3)
      const isFirstThird = seg.index < Math.floor(totalSegs / 3)
      const kickMod  = player.specialty === 'kick'
        ? (isLastThird ? 1.08 : isFirstThird ? 0.96 : 1.0)
        : 1.0
      const tacticMod = (playerTeamId && teamId === playerTeamId && segmentTactics)
        ? (TACTIC_MODS[segmentTactics[seg.index] ?? 'normal'] ?? 1.0) : 1.0
      const weatherMod = race.conditions
        ? calcWeatherModifier(race.conditions.weather, player.specialty, effectiveRatings.stamina, effectiveRatings.mental)
        : 1.0
      const score    = base * aff * clubMod * rand * condMod * traitMod * kickMod * tacticMod * weatherMod
      const isLastSeg = seg.index === totalSegs   // seg.index は1始まりなので最終区は totalSegs
      const eventMult = resolveSegmentEvents(effectiveRatings, isLastSeg)
      runners.push({ playerId, teamId, timeSec: Math.round(scoreToTime(score, seg.distanceKm, seg.uphillPct, seg.downhillPct) * eventMult), rank: 0 })
    }
    runners.sort((a, b) => a.timeSec - b.timeSec)
    runners.forEach((r, i) => {
      r.rank = i + 1
      if (i === 0) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + 3
      else if (i === 1) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + 2
      else if (i === 2) segPts[r.teamId] = (segPts[r.teamId] ?? 0) + 1
      cumTime[r.teamId] = (cumTime[r.teamId] ?? 0) + r.timeSec
    })
    segmentResults.push({ segmentIndex: seg.index, runners })
  }
  const teamRankings = buildTeamRankings({
    teamIds,
    cumTime,
    segCountByTeam: countSegmentsByTeam(segmentResults),
    segPts,
    totalSegs,
  })
  return { teamRankings, segmentResults }
}

/** 区間結果から「各チームが実際に走った区間数」を数える */
export function countSegmentsByTeam(segments: readonly { runners: readonly { teamId: string }[] }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const sr of segments) for (const r of sr.runners) out[r.teamId] = (out[r.teamId] ?? 0) + 1
  return out
}

/**
 * 最終順位の唯一の決まり。
 *
 * 全区間を走り切ったチームを上位（累積タイムの昇順）、走り切れなかったチームを下位に置く。
 * 走った区間数が少ないほど下。人員不足で空のオーダーを出したチームは累積タイムが0になるので、
 * この並べ替えが無いと最速で1位になってしまう。
 *
 * 以前は同じ処理が raceEngine（シミュレーション）と RacePage（中継つきレース）に
 * 別々に書かれていた。ズレると「中継で見た順位と結果画面の順位が違う」が起きる。
 */
export function buildTeamRankings(args: {
  /** そのレースに出たチーム。走者が1人もいないチームも含める */
  teamIds: readonly string[]
  cumTime: Record<string, number>
  segCountByTeam: Record<string, number>
  segPts: Record<string, number>
  totalSegs: number
}): RaceResults['teamRankings'] {
  const { teamIds, cumTime, segCountByTeam, segPts, totalSegs } = args
  const complete = teamIds.filter(id => (segCountByTeam[id] ?? 0) >= totalSegs)
    .sort((a, b) => cumTime[a] - cumTime[b])
  const incomplete = teamIds.filter(id => (segCountByTeam[id] ?? 0) < totalSegs)
    .sort((a, b) => (segCountByTeam[b] ?? 0) - (segCountByTeam[a] ?? 0) || cumTime[a] - cumTime[b])
  return [...complete, ...incomplete].map((teamId, i) => ({
    teamId,
    totalTimeSec: cumTime[teamId],
    rank: i + 1,
    positionPoints: positionPointsFor(teamIds.length, i + 1),
    segmentPoints: segPts[teamId] ?? 0,
  }))
}
