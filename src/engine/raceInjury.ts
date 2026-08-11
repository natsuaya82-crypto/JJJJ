// レース後の負傷判定（store/slices/raceSlice の runRace から切り出し）。
//
// 疲労が溜まった走者ほど壊れる。CPUチームの選手も同じ確率で対象になるが、
// ニュースになるのは自チームだけ（CPUの故障はサイレントに起きる）。
//
// ★乱数は引数で受ける（既定は Math.random）。呼ぶ回数と順序は切り出し前と同じ:
//   走った選手を順に見て「抽選 → 当たったら 全治 → 部位」の3回。
import type { Player } from '../types'
import { injuryHeadline, type NewsItem } from '../utils/newsItems'

const INJURY_NAMES = ['ハムストリング肉離れ', 'ふくらはぎの肉離れ', '疲労骨折', 'アキレス腱炎', '足底筋膜炎', '膝の炎症', '腸脛靭帯炎', '股関節の炎症']

export function rollRaceInjuries(params: {
  players: Player[]
  /** そのレースを走った選手 */
  racingIds: Set<string>
  playerTeamId: string
  /** 復帰時期の基準になるレース通算数（racesConsumed + 1） */
  nextClock: number
  raceDate: string
  rng?: () => number
}): { players: Player[]; news: NewsItem[] } {
  const { players, racingIds, playerTeamId, nextClock, raceDate, rng = Math.random } = params
  const news: NewsItem[] = []
  const next = players.map(p => {
    if (!racingIds.has(p.id) || p.status !== 'active') return p
    const injuryChance = Math.max(0, (p.fatigue - 65) / 35 * 0.10)
    if (rng() < injuryChance) {
      const recoveryRaces = 2 + Math.floor(rng() * 2)
      const injuryName = INJURY_NAMES[Math.floor(rng() * INJURY_NAMES.length)]
      if (p.teamId === playerTeamId) {
        news.push({
          date: raceDate,
          headline: injuryHeadline({ playerName: p.name, injuryName, races: recoveryRaces }),
          category: 'injury' as const,
          relatedIds: [p.id] })
      }
      return { ...p, status: 'injured' as const, injuredUntilRace: nextClock + recoveryRaces, injuryName }
    }
    return p
  })
  return { players: next, news }
}
