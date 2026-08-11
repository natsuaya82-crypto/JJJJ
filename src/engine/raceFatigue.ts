// レース1本ぶんの疲労の増減（store/slices/raceSlice の runRace から切り出し）。
//
// 走った選手は溜まり、走らなかった選手は抜ける。溜まり方は
//   区間数 × 作戦（攻め1.4／守り0.65）× 医療センターのレベル × 本人の回復力
// で決まる。**医療センターはCPUクラブにも効く**（自チームだけの特典ではない）。
//
// 0〜100に収めるのは utils/condition の withFatigue 1本（ここでは幅だけ決める）。
// 乱数は使わない。
import type { Player, Team } from '../types'
import { withFatigue } from '../utils/condition'

export type RaceStrategy = 'aggressive' | 'conservative' | 'balanced'

export function applyRaceFatigue(params: {
  players: Player[]
  /** そのレースを走った選手 */
  racingIds: Set<string>
  teams: Team[]
  raceStrategy: RaceStrategy | undefined
  /** そのレースの区間数（長いレースほど溜まる） */
  segmentCount: number
}): Player[] {
  const { players, racingIds, teams, raceStrategy, segmentCount } = params
  const stratMult = raceStrategy === 'aggressive' ? 1.4 : raceStrategy === 'conservative' ? 0.65 : 1.0
  const medLvByTeam = new Map(teams.map(t => [t.id, t.facilities?.medicalCenter ?? 0]))
  const baseFatigueGain = Math.min(14, 4 + segmentCount * 1.5) * stratMult

  return players.map(p => {
    // 引退選手は能力値を消してセーブを軽くしてあるので、疲労計算の対象外
    if (!p.ratings || p.status === 'retired') return p
    if (racingIds.has(p.id)) {
      const medMult = 1 - (medLvByTeam.get(p.teamId) ?? 0) * 0.08
      // 回復力が高いほど溜まりにくい（50で標準・90で-12%）
      const recoveryMult = 1.0 - (p.ratings.recovery - 50) * 0.003
      const fatigueGain = Math.round(baseFatigueGain * medMult * Math.max(0.7, recoveryMult))
      // 自然回復: 出場選手は毎レース疲労が6減る
      return withFatigue(withFatigue(p, fatigueGain), -6)
    } else if (p.status === 'injured') {
      // 負傷者は1レースにつき18回復し、40を切ったら復帰できる状態に戻る
      const rested = withFatigue(p, -18)
      return { ...rested, status: rested.fatigue < 40 ? 'active' as const : p.status }
    } else {
      // 休養中は16＋回復力ぶん回復する
      const recoveryBonus = Math.round((p.ratings.recovery - 50) * 0.08)
      return withFatigue(p, -16 - recoveryBonus)
    }
  })
}
