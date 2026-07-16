import type { ForeignLeague, Player, Team, Specialty } from '../types'
import { SPECIALTY_LABELS } from '../types'
import { ovr, calcTransferValue } from '../utils/playerUtils'
import { ROSTER_MAX, ROSTER_MIN } from '../data/rosterRules'

const FOREIGN_ROSTER_MIN = 18  // 海外クラブのロスター下限（絶対固定）。上限は ROSTER_MAX(30)

type NewsItem = { date: string; headline: string; category: 'trade'; relatedIds: string[]; major?: boolean }
// 移籍履歴（transferHistory）に積む成立記録。チーム詳細の移籍ページで日付・移籍金を表示するために返す
type TxRecord = { year: number; date: string; playerId: string; fromTeamId: string; toTeamId: string; fee: number; kind?: 'free' | 'trade' }

// シーズンオフに海外クラブ間の移籍（引き抜き）を発生させる。強いクラブが他クラブの
// 主力を引き抜き、選手が国境・リーグを越えて移動する。プレイヤーは干渉しない（結果のみ）。
export function simulateForeignTransferMarket(params: {
  foreignLeagues: ForeignLeague[]
  players: Player[]
  year: number
}): { foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TxRecord[] } {
  const { foreignLeagues, players, year } = params
  const allClubs = foreignLeagues.flatMap(l => l.clubs)
  if (allClubs.length < 2) return { foreignLeagues, players, news: [], records: [] }

  const clubById = new Map(allClubs.map(c => [c.id, c]))
  const nameById = new Map(allClubs.map(c => [c.id, c.name]))
  const playerById = new Map(players.map(p => [p.id, p]))

  // 各クラブの現在の在籍（可変コピー）
  const roster: Record<string, string[]> = {}
  for (const club of allClubs) roster[club.id] = [...club.playerIds]

  // クラブ平均OVR（引き抜きの向き付けに使う）
  const clubAvg: Record<string, number> = {}
  for (const club of allClubs) {
    const ps = roster[club.id].map(id => playerById.get(id)).filter((p): p is Player => !!p)
    clubAvg[club.id] = ps.length > 0 ? ps.reduce((s, p) => s + ovr(p), 0) / ps.length : 0
  }

  const moves: { playerId: string; fromClubId: string; toClubId: string }[] = []
  const movedPlayers = new Set<string>()
  const MOVE_COUNT = 14 + Math.floor(Math.random() * 8)  // 14〜21件/年

  for (let i = 0; i < MOVE_COUNT; i++) {
    // 引き抜く側：ランダムなクラブ（枠に余裕がない超大所帯は避ける程度）
    // 引き抜く側は上限(30)未満のクラブのみ
    const buyerPool = allClubs.filter(c => roster[c.id].length < ROSTER_MAX)
    if (buyerPool.length === 0) continue
    const buyer = buyerPool[Math.floor(Math.random() * buyerPool.length)]
    // 売る側：buyer 以外で下限(18)超のクラブから、buyerより平均が低い相手を優先（放出しても18で止まる）
    const sellers = allClubs.filter(c => c.id !== buyer.id && roster[c.id].length > FOREIGN_ROSTER_MIN)
    if (sellers.length === 0) continue
    const weaker = sellers.filter(c => clubAvg[c.id] <= clubAvg[buyer.id])
    const seller = (weaker.length > 0 ? weaker : sellers)[Math.floor(Math.random() * (weaker.length > 0 ? weaker.length : sellers.length))]

    // 引き抜く選手：seller の中位〜上位（未移動）から1人
    const candidates = roster[seller.id]
      .map(id => playerById.get(id))
      .filter((p): p is Player => !!p && !movedPlayers.has(p.id) && p.status === 'active')
      .sort((a, b) => ovr(b) - ovr(a))
      .slice(0, 10)   // 上位10人が引き抜き対象
    if (candidates.length === 0) continue
    const target = candidates[Math.floor(Math.random() * candidates.length)]

    // 実行
    roster[seller.id] = roster[seller.id].filter(id => id !== target.id)
    roster[buyer.id] = [...roster[buyer.id], target.id]
    movedPlayers.add(target.id)
    moves.push({ playerId: target.id, fromClubId: seller.id, toClubId: buyer.id })
  }

  if (moves.length === 0) return { foreignLeagues, players, news: [], records: [] }

  // players の teamId を更新
  const moveDest = new Map(moves.map(m => [m.playerId, m.toClubId]))
  const updatedPlayers = players.map(p => {
    const dest = moveDest.get(p.id)
    return dest ? { ...p, teamId: dest, joinedYear: year } : p
  })

  // foreignLeagues の playerIds を更新
  const updatedLeagues = foreignLeagues.map(l => ({
    ...l,
    clubs: l.clubs.map(c => ({ ...c, playerIds: roster[c.id] ?? c.playerIds })),
  }))

  // 目立つ移籍（OVR高め）をニュース化（最大6件）
  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 6)
    .map(({ m, p }) => ({
      date: `${year}-01-20`,
      headline: `【海外移籍】${p.name}（OVR${ovr(p)}）が${nameById.get(m.fromClubId) ?? ''}から${nameById.get(m.toClubId) ?? ''}へ移籍`,
      category: 'trade' as const,
      relatedIds: [p.id],
    }))

  const records: TxRecord[] = moves.map(m => ({ year, date: `${year}-01-20`, playerId: m.playerId, fromTeamId: m.fromClubId, toTeamId: m.toClubId, fee: 0, kind: 'free' as const }))
  return { foreignLeagues: updatedLeagues, players: updatedPlayers, news, records }
}

// シーズンオフの日本↔海外クロスボーダー移籍（CPU同士）。
// 海外→日本CPU（獲得）と 日本CPU→海外（引き抜き）を数件ずつ発生させる。
// プレイヤーのチームは対象外（プレイヤーの選手は「海外クラブからのオファー」で来る）。
export function simulateCrossBorderTransfers<T extends Team>(params: {
  teams: T[]
  foreignLeagues: ForeignLeague[]
  players: Player[]
  playerTeamId: string
  year: number
  maxIn?: number   // 海外→日本の件数（省略時はオフシーズン想定で2〜4）
  maxOut?: number  // 日本→海外の件数（省略時はオフシーズン想定で2〜4）
}): { teams: T[]; foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[]; records: TxRecord[] } {
  const { teams, foreignLeagues, players, playerTeamId, year } = params
  const foreignClubs = foreignLeagues.flatMap(l => l.clubs)
  const cpuTeams = teams.filter(t => t.id !== playerTeamId)
  if (foreignClubs.length === 0 || cpuTeams.length === 0) return { teams, foreignLeagues, players, news: [], records: [] }

  // 上限・下限はフラットロスターの共通定数（30/20）。旧40のハードコードは
  // 総在籍31人・名簿残存（secondに居る選手の除去漏れ）の原因だった
  const MIN_BUY_BUDGET = 30_000_000   // これ未満の予算では獲得に動かない
  const SPECS = Object.keys(SPECIALTY_LABELS) as Specialty[]
  const playerById = new Map(players.map(p => [p.id, p]))
  const runnable = (p: Player | undefined): p is Player =>
    !!p && p.status !== 'retired' && p.status !== 'injured' && !p.loan

  // main/secondを別々に持ち、人数はその合計で判定・除去は両方から行う
  const jpnRoster: Record<string, string[]> = {}
  const jpnSecond: Record<string, string[]> = {}
  const budget: Record<string, number> = {}
  for (const t of cpuTeams) {
    jpnRoster[t.id] = [...(t.roster?.main ?? [])]
    jpnSecond[t.id] = [...(t.roster?.second ?? [])]
    budget[t.id] = t.finance?.budget ?? 0
  }
  const jpnSize = (teamId: string) => jpnRoster[teamId].length + jpnSecond[teamId].length
  const fRoster: Record<string, string[]> = {}
  for (const c of foreignClubs) fRoster[c.id] = [...c.playerIds]

  const nameById = new Map<string, string>()
  for (const t of teams) nameById.set(t.id, t.shortName)
  for (const c of foreignClubs) nameById.set(c.id, c.name)

  const pick = <U,>(arr: U[]): U => arr[Math.floor(Math.random() * arr.length)]
  const weightedPick = <U,>(arr: U[], w: (x: U) => number): U => {
    const total = arr.reduce((s, x) => s + Math.max(1, w(x)), 0)
    let r = Math.random() * total
    for (const x of arr) { r -= Math.max(1, w(x)); if (r <= 0) return x }
    return arr[arr.length - 1]
  }
  const rosterPlayers = (ids: string[]) => ids.map(id => playerById.get(id)).filter(runnable)
  // チームが最も弱いタイプ（そのタイプの最高OVRが最小＝穴）
  const weakestSpec = (ids: string[]): Specialty => {
    const best: Record<string, number> = {}
    for (const s of SPECS) best[s] = 0
    for (const p of rosterPlayers(ids)) best[p.specialty] = Math.max(best[p.specialty] ?? 0, ovr(p))
    return SPECS.reduce((w, s) => ((best[s] ?? 0) < (best[w] ?? 0) ? s : w), SPECS[0])
  }
  const bestOvrInSpec = (ids: string[], spec: Specialty): number =>
    rosterPlayers(ids).filter(p => p.specialty === spec).reduce((m, p) => Math.max(m, ovr(p)), 0)
  // 余剰＝人数の多いタイプの中位選手（エース級は保護）を1人放出候補に
  const surplusTarget = (ids: string[]): Player | null => {
    const ps = rosterPlayers(ids).sort((a, b) => ovr(b) - ovr(a))
    if (ps.length <= ROSTER_MIN) return null
    const protectedIds = new Set(ps.slice(0, 2).map(p => p.id))   // 全体トップ2＝エース級は保護
    const cnt: Record<string, number> = {}
    for (const p of ps) cnt[p.specialty] = (cnt[p.specialty] ?? 0) + 1
    const deep = ps.filter(p => !protectedIds.has(p.id) && (cnt[p.specialty] ?? 0) >= 3)   // 層が厚いタイプ
    const pool = deep.length > 0 ? deep : ps.filter(p => !protectedIds.has(p.id))
    if (pool.length === 0) return null
    const mid = pool.slice(Math.floor(pool.length * 0.25))   // 上澄みは避け中位〜下位から
    return pick(mid.length > 0 ? mid : pool)
  }

  const moves: { playerId: string; fromId: string; toId: string; dir: 'in' | 'out'; fee: number }[] = []
  const moved = new Set<string>()

  const N_IN = params.maxIn ?? (2 + Math.floor(Math.random() * 3))   // 海外→日本CPU（省略時2〜4件）
  const N_OUT = params.maxOut ?? (2 + Math.floor(Math.random() * 3))  // 日本CPU→海外（省略時2〜4件）

  // 海外→日本CPU：予算に余裕のあるチームが、自分の弱いタイプ（穴）を海外から補強。移籍金を支払う。
  for (let i = 0; i < N_IN; i++) {
    const buyers = cpuTeams.filter(t => jpnSize(t.id) < ROSTER_MAX && budget[t.id] >= MIN_BUY_BUDGET)
    const sellers = foreignClubs.filter(c => fRoster[c.id].length > FOREIGN_ROSTER_MIN)
    if (buyers.length === 0 || sellers.length === 0) break
    const buyer = weightedPick(buyers, t => budget[t.id])   // 予算が多いほど動く
    const spec = weakestSpec(jpnRoster[buyer.id])
    const threshold = bestOvrInSpec(jpnRoster[buyer.id], spec)
    // 全海外クラブから、その穴タイプ・現有戦力超・予算内の候補
    const cands = sellers.flatMap(c => fRoster[c.id].map(id => playerById.get(id)).filter(runnable)
        .filter(p => !moved.has(p.id) && p.specialty === spec && ovr(p) > threshold && calcTransferValue(p) <= budget[buyer.id])
        .map(p => ({ p, clubId: c.id })))
      .sort((a, b) => ovr(b.p) - ovr(a.p))
      .slice(0, 8)
    if (cands.length === 0) continue
    const { p: target, clubId } = pick(cands)
    const fee = calcTransferValue(target)
    fRoster[clubId] = fRoster[clubId].filter(id => id !== target.id)
    jpnRoster[buyer.id] = [...jpnRoster[buyer.id], target.id]
    budget[buyer.id] -= fee
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: clubId, toId: buyer.id, dir: 'in', fee })
  }

  // 日本CPU→海外：海外クラブが、最低人数超のCPUチームの余剰・準主力を引き抜く。売り手は移籍金を得る。
  for (let i = 0; i < N_OUT; i++) {
    const sellers = cpuTeams.filter(t => jpnSize(t.id) > ROSTER_MIN)
    if (sellers.length === 0) break
    const seller = pick(sellers)
    // 候補はmain/second合わせた全在籍から（除去漏れ防止のため両方から外す）
    const target = surplusTarget([...jpnRoster[seller.id], ...jpnSecond[seller.id]])
    if (!target || moved.has(target.id)) continue
    // 買う側（海外クラブ）は上限(30)未満のみ
    const buyerPool = foreignClubs.filter(c => fRoster[c.id].length < ROSTER_MAX)
    if (buyerPool.length === 0) continue
    const buyer = pick(buyerPool)
    const fee = calcTransferValue(target)
    jpnRoster[seller.id] = jpnRoster[seller.id].filter(id => id !== target.id)
    jpnSecond[seller.id] = jpnSecond[seller.id].filter(id => id !== target.id)
    fRoster[buyer.id] = [...fRoster[buyer.id], target.id]
    budget[seller.id] += fee
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: seller.id, toId: buyer.id, dir: 'out', fee })
  }

  if (moves.length === 0) return { teams, foreignLeagues, players, news: [], records: [] }

  const dest = new Map(moves.map(m => [m.playerId, m.toId]))
  const updatedPlayers = players.map(p => {
    const d = dest.get(p.id)
    return d ? { ...p, teamId: d, joinedYear: year, rosterTier: 'main' as const } : p
  })
  const updatedTeams: T[] = teams.map(t =>
    (t.id === playerTeamId || !jpnRoster[t.id]) ? t
      : ({ ...t, roster: { ...t.roster, main: jpnRoster[t.id], second: jpnSecond[t.id] }, finance: { ...t.finance, budget: budget[t.id] } } as T))
  const updatedLeagues = foreignLeagues.map(l => ({
    ...l, clubs: l.clubs.map(c => ({ ...c, playerIds: fRoster[c.id] ?? c.playerIds })),
  }))

  const feeStr = (v: number) => v >= 100_000_000 ? `${(v / 100_000_000).toFixed(1)}億` : `${Math.round(v / 10_000)}万`
  // 日本より格上のリーグ（アフリカ・欧州・USA）への移籍は「日本人が世界最高峰へ挑む」大ニュースにする
  const STRONG_COUNTRIES = new Set(['ETH', 'KEN', 'UGA', 'TAN', 'EUR', 'USA'])
  const clubCountry = new Map(foreignLeagues.flatMap(l => l.clubs.map(c => [c.id, c.country as string])))
  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 6)
    .map(({ m, p }) => {
      const toStrongLeague = m.dir === 'out' && STRONG_COUNTRIES.has(clubCountry.get(m.toId) ?? '')
      if (toStrongLeague && ovr(p) >= 76) {
        return {
          date: `${year}-01-25`,
          headline: `【世界へ挑戦】${p.name}（OVR${ovr(p)}）が世界最高峰・${nameById.get(m.toId) ?? ''}へ電撃移籍！日本人ランナーの歴史的な挑戦に列島が沸く（移籍金${feeStr(m.fee)}）`,
          category: 'trade' as const,
          relatedIds: [p.id],
          major: true,
        }
      }
      return {
        date: `${year}-01-25`,
        headline: m.dir === 'in'
          ? `【海外→日本】${p.name}（OVR${ovr(p)}）が${nameById.get(m.fromId) ?? ''}から${nameById.get(m.toId) ?? ''}へ移籍（移籍金${feeStr(m.fee)}）`
          : toStrongLeague
          ? `【日本→海外】${p.name}（OVR${ovr(p)}）が格上の${nameById.get(m.toId) ?? ''}へ移籍。世界の舞台で腕試し（移籍金${feeStr(m.fee)}）`
          : `【日本→海外】${p.name}（OVR${ovr(p)}）が${nameById.get(m.fromId) ?? ''}から${nameById.get(m.toId) ?? ''}へ移籍（移籍金${feeStr(m.fee)}）`,
        category: 'trade' as const,
        relatedIds: [p.id],
      }
    })

  const records: TxRecord[] = moves.map(m => ({ year, date: `${year}-01-25`, playerId: m.playerId, fromTeamId: m.fromId, toTeamId: m.toId, fee: m.fee }))
  return { teams: updatedTeams, foreignLeagues: updatedLeagues, players: updatedPlayers, news, records }
}
