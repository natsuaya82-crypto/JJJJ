import type { ForeignLeague, Player } from '../types'
import { ovr } from '../utils/playerUtils'

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
