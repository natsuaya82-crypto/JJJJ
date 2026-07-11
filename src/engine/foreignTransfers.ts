import type { ForeignLeague, Player, Team, Specialty } from '../types'
import { SPECIALTY_LABELS } from '../types'
import { ovr, calcTransferValue } from '../utils/playerUtils'

type NewsItem = { date: string; headline: string; category: 'trade'; relatedIds: string[] }

// シーズンオフに海外クラブ間の移籍（引き抜き）を発生させる。強いクラブが他クラブの
// 主力を引き抜き、選手が国境・リーグを越えて移動する。プレイヤーは干渉しない（結果のみ）。
export function simulateForeignTransferMarket(params: {
  foreignLeagues: ForeignLeague[]
  players: Player[]
  year: number
}): { foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[] } {
  const { foreignLeagues, players, year } = params
  const allClubs = foreignLeagues.flatMap(l => l.clubs)
  if (allClubs.length < 2) return { foreignLeagues, players, news: [] }

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
    const buyer = allClubs[Math.floor(Math.random() * allClubs.length)]
    // 売る側：buyer 以外で在籍18人以上のクラブから、buyerより平均が低い相手を優先
    const sellers = allClubs.filter(c => c.id !== buyer.id && roster[c.id].length >= 18)
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

  if (moves.length === 0) return { foreignLeagues, players, news: [] }

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

  return { foreignLeagues: updatedLeagues, players: updatedPlayers, news }
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
}): { teams: T[]; foreignLeagues: ForeignLeague[]; players: Player[]; news: NewsItem[] } {
  const { teams, foreignLeagues, players, playerTeamId, year } = params
  const foreignClubs = foreignLeagues.flatMap(l => l.clubs)
  const cpuTeams = teams.filter(t => t.id !== playerTeamId)
  if (foreignClubs.length === 0 || cpuTeams.length === 0) return { teams, foreignLeagues, players, news: [] }

  const ROSTER_MAX = 40, ROSTER_MIN = 20
  const playerById = new Map(players.map(p => [p.id, p]))
  const runnable = (p: Player | undefined): p is Player =>
    !!p && p.status !== 'retired' && p.status !== 'injured' && !p.loan

  const jpnRoster: Record<string, string[]> = {}
  for (const t of cpuTeams) jpnRoster[t.id] = [...(t.roster?.main ?? [])]
  const fRoster: Record<string, string[]> = {}
  for (const c of foreignClubs) fRoster[c.id] = [...c.playerIds]

  const nameById = new Map<string, string>()
  for (const t of teams) nameById.set(t.id, t.shortName)
  for (const c of foreignClubs) nameById.set(c.id, c.name)

  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
  const moves: { playerId: string; fromId: string; toId: string; dir: 'in' | 'out' }[] = []
  const moved = new Set<string>()

  const N_IN = 2 + Math.floor(Math.random() * 3)   // 海外→日本CPU 2〜4件
  const N_OUT = 2 + Math.floor(Math.random() * 3)  // 日本CPU→海外 2〜4件

  // 海外→日本CPU：枠に余裕のあるCPU国内チームが、海外クラブ(18人超)の準主力を獲得
  for (let i = 0; i < N_IN; i++) {
    const buyers = cpuTeams.filter(t => jpnRoster[t.id].length < ROSTER_MAX)
    const sellers = foreignClubs.filter(c => fRoster[c.id].length > 18)
    if (buyers.length === 0 || sellers.length === 0) break
    const seller = pick(sellers)
    const cands = fRoster[seller.id].map(id => playerById.get(id)).filter(runnable)
      .filter(p => !moved.has(p.id)).sort((a, b) => ovr(b) - ovr(a)).slice(1, 12)
    if (cands.length === 0) continue
    const buyer = pick(buyers)
    const target = pick(cands)
    fRoster[seller.id] = fRoster[seller.id].filter(id => id !== target.id)
    jpnRoster[buyer.id] = [...jpnRoster[buyer.id], target.id]
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: seller.id, toId: buyer.id, dir: 'in' })
  }

  // 日本CPU→海外：海外クラブが、最低人数を超えるCPU国内チームの準主力を引き抜く
  for (let i = 0; i < N_OUT; i++) {
    const sellers = cpuTeams.filter(t => jpnRoster[t.id].length > ROSTER_MIN)
    if (sellers.length === 0) break
    const seller = pick(sellers)
    const cands = jpnRoster[seller.id].map(id => playerById.get(id)).filter(runnable)
      .filter(p => !moved.has(p.id)).sort((a, b) => ovr(b) - ovr(a)).slice(2, 12)
    if (cands.length === 0) continue
    const buyer = pick(foreignClubs)
    const target = pick(cands)
    jpnRoster[seller.id] = jpnRoster[seller.id].filter(id => id !== target.id)
    fRoster[buyer.id] = [...fRoster[buyer.id], target.id]
    moved.add(target.id)
    moves.push({ playerId: target.id, fromId: seller.id, toId: buyer.id, dir: 'out' })
  }

  if (moves.length === 0) return { teams, foreignLeagues, players, news: [] }

  const dest = new Map(moves.map(m => [m.playerId, m.toId]))
  const updatedPlayers = players.map(p => {
    const d = dest.get(p.id)
    return d ? { ...p, teamId: d, joinedYear: year, rosterTier: 'main' as const } : p
  })
  const updatedTeams: T[] = teams.map(t =>
    (t.id === playerTeamId || !jpnRoster[t.id]) ? t : ({ ...t, roster: { ...t.roster, main: jpnRoster[t.id] } } as T))
  const updatedLeagues = foreignLeagues.map(l => ({
    ...l, clubs: l.clubs.map(c => ({ ...c, playerIds: fRoster[c.id] ?? c.playerIds })),
  }))

  const news: NewsItem[] = moves
    .map(m => ({ m, p: playerById.get(m.playerId) }))
    .filter((x): x is { m: typeof moves[0]; p: Player } => !!x.p)
    .sort((a, b) => ovr(b.p) - ovr(a.p))
    .slice(0, 6)
    .map(({ m, p }) => ({
      date: `${year}-01-25`,
      headline: m.dir === 'in'
        ? `【海外→日本】${p.name}（OVR${ovr(p)}）が${nameById.get(m.fromId) ?? ''}から${nameById.get(m.toId) ?? ''}へ移籍`
        : `【日本→海外】${p.name}（OVR${ovr(p)}）が${nameById.get(m.fromId) ?? ''}から${nameById.get(m.toId) ?? ''}へ移籍`,
      category: 'trade' as const,
      relatedIds: [p.id],
    }))

  return { teams: updatedTeams, foreignLeagues: updatedLeagues, players: updatedPlayers, news }
}
