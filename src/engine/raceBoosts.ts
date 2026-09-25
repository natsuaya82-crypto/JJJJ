// レース勝利ボーナス等の一時ブースト適用（gameStore から移設）。RacePage と store の両方から使う。

import { type Facilities, type Player, type WorldClub } from '../types'
import { clubMap } from '../utils/world'
import { withMorale } from '../utils/condition'
import { facilitiesOf, facilityTacticsStatBonus } from '../utils/facilities'
import { type TieredTeam } from '../utils/clubTier'
import { statCapOf } from '../utils/playerUtils'

/**
 * **戦術室のぶんを能力に乗せる。ここ1本。**
 *
 * ★自分が走るレース（`applyRaceBoosts`）も、裏で走るレース
 *   （`engine/backgroundRace` の `runBackgroundRace`）も**同じここを通す**。
 *   自分の部だけに乗せると、同じコースを分け合っている他の部との差が付き、
 *   **区間記録が自分の部に偏る**（実測で優勝タイムが1〜2分ちがう）。
 * ★施設のレベルは `utils/facilities` の `facilitiesOf` 1本
 *   （格から出る土台＋自分で建てたぶん）。`facilities` を直接読まないこと。
 * ★クラブが分からない走者（代表チームなど）は素通り。持っていないものは効かない。
 */
export function withFacilityBoost(
  players: Player[],
  clubs: readonly (TieredTeam & { id: string; facilities?: Facilities })[],
): Player[] {
  const lvById = clubMap(clubs, c => facilitiesOf(c).tacticsRoom)
  if (lvById.size === 0) return players
  return players.map(p => {
    const boost = facilityTacticsStatBonus(lvById.get(p.teamId) ?? 0)
    if (boost <= 0 || !p.ratings) return p
    return { ...p, ratings: {
      ...p.ratings,
      pacing: Math.min(statCapOf(p, 'pacing'), p.ratings.pacing + boost),
      mental: Math.min(statCapOf(p, 'mental'), p.ratings.mental + boost) }}
  })
}

/**
 * **国籍のそろい具合（士気のボーナス）。ここ1本。**
 *
 * 同じ国籍が `CHEMISTRY_TIERS` の人数そろうと、その国籍の走者だけ士気が上がります。
 *
 * ★**実際に掛ける側（`applyRaceBoosts`）と、画面に出す側（`components/race/LineupPhase`）が
 *   同じここを通すこと。** 以前は `maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0` が
 *   両方に手書きされていて、**数を変えると画面の表示だけが嘘になる**形でした
 *   （「日本 士気+6」と出しているのに、掛かるのは別の値）。
 * ★人数と効き目は `CHEMISTRY_TIERS` の表1つ。**条件式を書き足さないこと。**
 */
export const CHEMISTRY_TIERS: readonly { count: number; bonus: number }[] = [
  { count: 9, bonus: 10 },
  { count: 7, bonus: 6 },
]

export function lineupChemistry(
  lineupPlayers: readonly (Pick<Player, 'nationality'> | undefined)[],
): { nat: string; bonus: number } {
  const counts: Record<string, number> = {}
  for (const p of lineupPlayers) {
    if (!p) continue
    counts[p.nationality] = (counts[p.nationality] ?? 0) + 1
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  if (!top) return { nat: '', bonus: 0 }
  const [nat, n] = top
  return { nat, bonus: CHEMISTRY_TIERS.find(t => n >= t.count)?.bonus ?? 0 }
}

export function applyRaceBoosts(
  players: Player[], raceClubs: readonly WorldClub[], playerTeamId: string, lineup: Record<number, string>,
): Player[] {
  const boosted = withFacilityBoost(players, raceClubs)

  const lineupPlayerIds = Object.values(lineup).filter(Boolean)
  if (lineupPlayerIds.length === 0) return boosted
  const lineupIdSet = new Set(lineupPlayerIds)
  const { nat: dominantNat, bonus: chemBonus } =
    lineupChemistry(lineupPlayerIds.map(id => boosted.find(p => p.id === id)))
  if (chemBonus <= 0) return boosted

  return boosted.map(p => {
    if (p.teamId !== playerTeamId || !lineupIdSet.has(p.id) || p.nationality !== dominantNat) return p
    return withMorale(p, chemBonus)
  })
}
