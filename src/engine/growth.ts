import type { Player, CardStatKey } from '../types'
import { getStatPotentials } from '../utils/playerUtils'

// ── EXP システム（設計書準拠） ─────────────────────────────────────────────

/** L→L+1 に必要なEXP。L<80: ×1 / 80≤L<90: ×2 / 90≤L: ×4（設計書どおり。緩和版1.5/2は廃止） */
export function requiredExpForLevel(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : 4
  return Math.floor(0.5 * level * level * dull)
}

/** ポテンシャル数値 → EXP倍率（設計書: S≥87→1.4 / A≥75→1.2 / B≥58→1.0 / C→0.75） */
export function potMultiplier(potential: number): number {
  if (potential >= 87) return 1.4
  if (potential >= 75) return 1.2
  if (potential >= 58) return 1.0
  return 0.75
}

/** 年齢 × 成長曲線 → EXP倍率（成長期×2.5 / 下降期0 / その他×1） */
export function ageMultiplier(p: Player): number {
  const peakAge = p.growthCurve === 'early' ? 24 : p.growthCurve === 'normal' ? 27 : 30
  const growthStart = peakAge - 5
  if (p.age >= growthStart && p.age < peakAge) return 2.5
  if (p.age >= peakAge + 4) return 0  // 下降期: EXP成長なし
  return 1.0
}

/** 区間の地形情報 → 区間タイプ */
export type SegType = 'flat' | 'mountain_up' | 'mountain_down' | 'long' | 'technical'
export function segmentType(uphillPct: number, downhillPct: number, distanceKm: number): SegType {
  if (uphillPct >= 40) return 'mountain_up'
  if (downhillPct >= 40) return 'mountain_down'
  if (distanceKm >= 15) return 'long'
  if (uphillPct + downhillPct >= 15) return 'technical'
  return 'flat'
}

/** 区間タイプ → 基本EXP配分（主400 / 副A200 / 副B150） */
export function segTypeExpGain(type: SegType): Partial<Record<CardStatKey, number>> {
  switch (type) {
    case 'flat':          return { speed: 400, pacing: 200, stamina: 150 }
    case 'mountain_up':   return { mountainUp: 400, stamina: 200, mental: 150 }
    case 'mountain_down': return { mountainDown: 400, pacing: 200, speed: 150 }
    case 'long':          return { stamina: 400, mental: 200, recovery: 150 }
    case 'technical':     return { pacing: 400, mental: 200, stamina: 150 }
  }
}

/** EXP付与 → レベルアップ処理（カードはageMult=1固定で呼ぶ） */
export function processExpGains(
  ratings: Player['ratings'],
  exp: Partial<Record<CardStatKey, number>>,
  gains: Partial<Record<CardStatKey, number>>,
  potMult: number,
  ageMult: number,
  caps: Partial<Record<CardStatKey, number>>,
): { ratings: Player['ratings']; exp: Partial<Record<CardStatKey, number>> } {
  const newRatings = { ...ratings }
  const newExp = { ...exp }
  const capOf = (stat: CardStatKey) => Math.min(99, caps[stat] ?? 99)
  for (const [stat, baseGain] of Object.entries(gains) as [CardStatKey, number][]) {
    // 既に能力別ポテンシャル上限に達している能力はEXPを加算しない（カード・EXPの無駄を防ぐ）。
    const cur0 = (newRatings as Record<string, number>)[stat] ?? 0
    if (cur0 >= capOf(stat)) continue
    const gain = Math.round(baseGain * potMult * ageMult)
    if (gain <= 0) continue
    newExp[stat] = (newExp[stat] ?? 0) + gain
  }
  const STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
  for (const stat of STAT_KEYS) {
    const cap = capOf(stat)
    let cur = (newRatings as Record<string, number>)[stat] ?? 0
    let acc = newExp[stat] ?? 0
    while (cur < cap && acc > 0) {
      const req = requiredExpForLevel(cur)
      if (acc < req) break
      acc -= req
      cur++
    }
    ;(newRatings as Record<string, number>)[stat] = cur
    // 上限到達時は余剰EXPを残さない（無駄に溜め込まない）
    newExp[stat] = cur >= cap ? 0 : acc
  }
  return { ratings: newRatings, exp: newExp }
}

// ── 成長倍率の枝（年齢・ポテンシャル・施設・国籍） ─────────────────────────

/** 年齢 × 成長曲線のプロフィール。ageMultiplier/growPlayer/bakeAgeGrowth で共通の peakAge 式。 */
export function ageProfile(p: Pick<Player, 'growthCurve'>): { peakAge: number; growthStart: number; declineStart: number } {
  const peakAge = p.growthCurve === 'early' ? 24 : p.growthCurve === 'normal' ? 27 : 30
  return { peakAge, growthStart: peakAge - 5, declineStart: peakAge + 4 }
}

/** 年齢 × 成長曲線 → EXP倍率（既存 ageMultiplier と同じ値） */
export function ageExpMultiplier(p: Player): number {
  const { peakAge, growthStart, declineStart } = ageProfile(p)
  if (p.age >= growthStart && p.age < peakAge) return 2.5
  if (p.age >= declineStart) return 0  // 下降期: EXP成長なし
  return 1.0
}

/** ポテンシャル数値 → EXP倍率（既存 potMultiplier のリネーム） */
export function potentialExpMultiplier(potential: number): number {
  return potMultiplier(potential)
}

/** 強化合宿レベル → EXP倍率 */
export function facilityExpMultiplier(campLv: number): number {
  return 1 + campLv * 0.06
}

/** 国籍 → EXP倍率。現状は国籍によるEXP差はなく、常に1.0を返す将来のフック。 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function nationalityExpMultiplier(_p: Player): number {
  return 1.0
}

// ── 成長の幹（applyGrowth） ─────────────────────────────────────────────

export type GrowthSource = 'race' | 'bench' | 'plan' | 'card'

/** どの経路にどの倍率が掛かるか。経路ごとの差は、この表だけで表現する。
 *  （現状の呼び出し元の引数の渡し方をそのまま表に写したもの。値を変えないこと） */
const SOURCE_RULES: Record<GrowthSource, { age: boolean; potential: boolean; facility: boolean }> = {
  race:  { age: true,  potential: true,  facility: true  },
  bench: { age: true,  potential: true,  facility: true  },
  plan:  { age: false, potential: true,  facility: true  },
  card:  { age: false, potential: false, facility: false },
}

export interface GrowthInput {
  player: Player
  source: GrowthSource
  baseGains: Partial<Record<CardStatKey, number>>
  campLv?: number
  bonusMultiplier?: number   // カードの大成功倍率
}

export interface GrowthOutcome {
  ratings: Player['ratings']
  exp: Partial<Record<CardStatKey, number>>
  gained: Partial<Record<CardStatKey, number>>  // 表示用：実際に入ったEXP（上限到達済みは0）
  breakdown: { age: number; potential: number; facility: number; nationality: number; bonus: number }
}

export function applyGrowth(input: GrowthInput): GrowthOutcome {
  const { player, source, baseGains, campLv, bonusMultiplier } = input
  const rules = SOURCE_RULES[source]
  const ageM  = rules.age      ? ageExpMultiplier(player)                : 1.0
  const potM  = rules.potential? potentialExpMultiplier(player.potential): 1.0
  const facM  = rules.facility ? facilityExpMultiplier(campLv ?? 0)      : 1.0
  const natM  = nationalityExpMultiplier(player)
  const bonM  = bonusMultiplier ?? 1.0

  const breakdown = { age: ageM, potential: potM, facility: facM, nationality: natM, bonus: bonM }

  if (ageM === 0) {
    return { ratings: player.ratings, exp: player.exp ?? {}, gained: {}, breakdown }
  }

  const potArg = potM * facM * natM * bonM      // ← この順序を崩さない
  const caps = getStatPotentials(player)
  const r = processExpGains(player.ratings, player.exp ?? {}, baseGains, potArg, ageM, caps)

  const gained: Partial<Record<CardStatKey, number>> = {}
  ;(Object.keys(baseGains) as CardStatKey[]).forEach(k => {
    const capped = ((player.ratings as Record<string, number>)[k] ?? 0) >= Math.min(99, (caps as Record<string, number>)[k] ?? 99)
    const v = capped ? 0 : Math.round((baseGains[k] ?? 0) * potArg * ageM)
    if (v > 0) gained[k] = v
  })

  return { ratings: r.ratings, exp: r.exp, gained, breakdown }
}
