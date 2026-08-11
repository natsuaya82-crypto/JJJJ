// レース勝利ボーナス等の一時ブースト適用（gameStore から移設）。RacePage と store の両方から使う。

import { type Player, type Team } from '../types'
import { withMorale } from '../utils/condition'

export function applyRaceBoosts(
  players: Player[], teams: Team[], playerTeamId: string, lineup: Record<number, string>,
): Player[] {
  const tacticsLvByTeam = new Map(teams.map(t => [t.id, t.facilities?.tacticsRoom ?? 0]))
  const boosted = players.map(p => {
    const boost = tacticsLvByTeam.get(p.teamId) ?? 0
    if (boost <= 0) return p
    return { ...p, ratings: {
      ...p.ratings,
      pacing: Math.min(99, p.ratings.pacing + boost),
      mental: Math.min(99, p.ratings.mental + boost) }}
  })

  const lineupPlayerIds = Object.values(lineup).filter(Boolean)
  if (lineupPlayerIds.length === 0) return boosted
  const lineupIdSet = new Set(lineupPlayerIds)
  const natCounts: Record<string, number> = {}
  for (const id of lineupPlayerIds) {
    const lp = boosted.find(p => p.id === id)
    if (lp) natCounts[lp.nationality] = (natCounts[lp.nationality] ?? 0) + 1
  }
  const maxNatCount = Math.max(0, ...Object.values(natCounts))
  const chemBonus = maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0
  if (chemBonus <= 0) return boosted

  const dominantNat = Object.entries(natCounts).sort((a, b) => b[1] - a[1])[0]?.[0]
  return boosted.map(p => {
    if (p.teamId !== playerTeamId || !lineupIdSet.has(p.id) || p.nationality !== dominantNat) return p
    return withMorale(p, chemBonus)
  })
}

// 自クラブの選手を売る（承諾でも逆提示でも、国内でも海外でも）ときの移動。
// 移籍金の受け取り・名簿からの除外・移籍履歴・退団のお知らせ・1年間の再交渉禁止まで、
// 全部 movePlayer に任せて同じ後始末になるようにする。
// 海外クラブは teams に居ないので、買い手側の出金は自動的に起きない（そのままでいい）。
/**
 * そのクラブが移籍金の逆提示に応じられる上限。
 * 上限そのものは data/economy.ts の counterCeiling（市場価値×1.15 か 提示額×1.3 の高い方）。
 * 国内クラブはさらに手元の予算で頭打ち。海外クラブは teams に居ないので予算を見ない。
 * ★単発の逆提示と全クラブへの一斉提示で同じ判定を使う（片方だけ緩いと辻褄が合わない）
 */
