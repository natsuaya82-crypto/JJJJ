// 記録会（個人種目）のタイム計算（gameStore から移設）。
// 能力→持ちタイムは utils/eventTime の individualEventAbility / individualBaseTime。
// ここは天候・ぶれを乗せて「その日の1本」を作る。

import { type Player } from '../types'
import { individualBaseTime, individualEventAbility } from '../utils/eventTime'
import { calcWeatherModifier } from './raceEngine'
import { MORALE_DEFAULT } from '../utils/condition'

export function simulateIndividualTime(player: Player, distance: 5000 | 10000 | 21097 | 42195, weather?: 'sunny' | 'cloudy' | 'rainy' | 'windy'): number {
  const o = individualEventAbility(player, distance)
  const base = individualBaseTime(o, distance)  // コンディション最高でのベスト
  // 割合ペナルティは距離に比例して絶対秒が膨らむ（同じ2%でも5000mは+17秒、マラソンは+2.5分）。
  // ハーフ以上は影響を距離に応じて圧縮し、マラソンでも天候・ぶれによる遅れが最大1分程度に収まるようにする
  const distDamp = distance <= 10000 ? 1 : 10000 / distance
  // コンディション低下ペナルティ（最高で0＝アンカー通り）
  const formPen = (2 - (player.form ?? 0)) * 4
  const fatiguePen = base * ((player.fatigue ?? 0) / 100) * 0.05 * distDamp   // 疲労で最大+5%（長距離は圧縮）
  const moralePen = Math.max(0, 80 - (player.morale ?? MORALE_DEFAULT)) * 0.12
  const noise = Math.random() * base * 0.03 * distDamp                        // 毎回0〜+3%のぶらつき（長距離は圧縮）
  // 天気補正（レースと同じ関数）。performance倍率を時間係数(2-mod)に反転して適用し、長距離では圧縮
  const weatherExcess = weather
    ? (2 - calcWeatherModifier(weather, player.specialty, player.ratings.stamina, player.ratings.mental)) - 1
    : 0
  const weatherFactor = 1 + weatherExcess * distDamp
  const t = (base + formPen + fatiguePen + moralePen + noise) * weatherFactor
  return Math.max(400, Math.round(t))
}

// タイム表示は utils/eventTime.ts の formatRaceTime に一本化した（同じ処理が3つ手書き
// されていたうちの1つ。fmtTime だけ Math.round が無いバグがあったため統合時に揃えた）。

// ── CPU チーム戦略ヘルパー ───────────────────────────────────────────────
// CPUチームの今季の運用方針。前年順位と主力の平均年齢から決める。
// contend=勝ちにいく（ベテランでも即戦力を補強）, rebuild=若手刷新（今季は捨て若手中心）, balanced=中庸。
