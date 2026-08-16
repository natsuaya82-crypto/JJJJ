import type { Player, CardStatKey, Ratings } from '../types'
import { peakAgeOf, getStatPotentials } from '../utils/playerUtils'
import { withMorale } from '../utils/condition'
import { tierGrowthRate, ANNUAL_BASE_EXP, type ClubTier } from '../utils/clubTier'

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
  const peakAge = peakAgeOf(p)
  const growthStart = peakAge - 5
  if (p.age >= growthStart && p.age < peakAge) return 2.5
  if (p.age >= peakAge + 4) return 0  // 下降期: EXP成長なし
  return 1.0
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

/** 年齢 × 成長曲線 → EXP倍率（既存 ageMultiplier のリネーム。値は同じ。内部の peakAgeOf 呼び出しもそのまま） */
export function ageExpMultiplier(p: Player): number {
  return ageMultiplier(p)
}

/** ポテンシャル数値 → EXP倍率（既存 potMultiplier のリネーム。値は同じ） */
export function potentialExpMultiplier(potential: number): number {
  return potMultiplier(potential)
}

/** 強化合宿レベル → EXP倍率 */
export function facilityExpMultiplier(campLv: number): number {
  return 1 + campLv * 0.06
}

/** 国籍 → EXP倍率。現状は国籍によるEXP差はなく、常に1.0を返す将来のフック。 */

export function nationalityExpMultiplier(_p: Player): number {
  return 1.0
}

// ── 成長の幹（applyGrowth） ─────────────────────────────────────────────

// 成長の経路。
//   season = 所属していれば毎年もらう一律EXP（レースに出たかどうかで分けない）
//   plan   = 練習方針
//   card   = 練習カード（自チームだけ。上乗せ）
//
// ★'race'（走った区間の地形別EXP）と 'bench'（見学EXP）は廃止した。
//   「レースに出た選手だけ地形に応じて伸びる」をやめて、所属していれば全員同じだけ
//   伸びる形にしたため（オーナー決定）。CPU・海外がカードを持たないぶんは
//   クラブの格ごとの倍率（utils/clubTier.ts の tierGrowthRate）で埋める。
export type GrowthSource = 'season' | 'plan' | 'card'

/** どの経路にどの倍率が掛かるか。経路ごとの差は、この表だけで表現する。 */
const SOURCE_RULES: Record<GrowthSource, { age: boolean; potential: boolean; facility: boolean }> = {
  season: { age: true,  potential: true,  facility: true  },
  plan:   { age: false, potential: true,  facility: true  },
  card:   { age: false, potential: false, facility: false },
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

// ── 年次成長・自然老化（CPU・海外。gameStore から移設） ─────────────────────

type RatingsKey = keyof Ratings

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function getPrimaryKey(specialty: string): RatingsKey {
  if (specialty === 'sprinter') return 'speed'
  if (specialty === 'mountain_up') return 'mountainUp'
  if (specialty === 'mountain_down') return 'mountainDown'
  if (specialty === 'ace') return 'pacing'
  return 'stamina'
}

// growPlayer: 年齢増加・自然老化（ピーク後の衰え）＋加齢によるポテンシャル上限の減衰。
// 自チームの成長はレース/カードEXPで行うため allowAnnualGrowth=false。
// CPU/海外は allowAnnualGrowth=true で毎年ポテンシャル上限へ向けて成長させる（高数値ほど鈍化）。
// 一律EXPを配る能力の一覧。自チーム（毎レース）とCPU（年1回）で同じものを使う。
// 2つ持つと「片方は7能力に配る・もう片方は各能力へ丸ごと」のようにズレる（実際にズレていた）
export const GROW_STAT_KEYS: RatingsKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
export function growPlayer(p: Player, allowAnnualGrowth = false, clubTierForGrowth: ClubTier = 20): Player {
  const peakAge = peakAgeOf(p)
  const nextAge = p.age + 1
  const ageDiff = nextAge - peakAge
  const ratings = { ...p.ratings }
  const primary = getPrimaryKey(p.specialty)

  // 加齢でポテンシャル上限自体が下がる。35歳以降は急に（37歳でエースが85のまま等を防ぐ）。
  let potential = p.potential
  if (nextAge >= 37) potential = Math.max(45, potential - 3)
  else if (nextAge >= 35) potential = Math.max(45, potential - 2)
  else if (ageDiff >= 1) potential = Math.max(50, potential - (ageDiff >= 6 ? 2 : 1))
  const caps = getStatPotentials({ ...p, potential })  // 減衰後の上限で頭打ち

  // CPU・海外の年次成長。自チームは毎レースの一律EXP＋カードで伸びるので、
  // ここはCPU・海外だけが通る（allowAnnualGrowth）。
  //
  // カードが無いぶんをクラブの格の倍率（utils/clubTier.ts の tierGrowthRate）で埋める。
  // 格1で3.0倍、格11以下は1.5倍。一律EXPは自チームと同じ ANNUAL_BASE_EXP。
  // ★係数を2箇所に書かないこと。年齢カーブ（engine/ageCurve.ts）と
  //   この倍率の2つだけで成長が決まる形にしてある。
  // ★**余ったEXPは持ち越すこと。**（オーナー・2026-08-16「成長してないから
  //   そんな弱いんじゃないの？普通に92とか見なくなった。格の高いチームでも」）
  //
  //   以前は `Math.floor(1年ぶん / 必要EXP)` で、**足りなかったぶんを毎年捨てて**
  //   いました。必要EXPは `0.5 × 能力² ×（80以上で2倍・90以上で4倍）`なので、
  //   1年ぶん（`ANNUAL_BASE_EXP × 格の倍率 ÷ 7`）を超えた時点で**永久に0**になります。
  //
  //     格1（3.0倍）… 1能力あたり4,539／年   → 能力80の必要EXP 6,400 で頭打ち
  //     格20（1.5倍）… 1能力あたり2,270／年  → 能力75の必要EXP 2,812 で**1度も伸びない**
  //
  //   実測で、19歳OVR75・ポテ99（上限まで育てばOVR95）の選手を格1で18年育てても
  //   **OVR80どまり**、格10・格20では**75のまま1も伸びません**でした。つまり
  //   **CPU・海外の選手は成長でOVR80を超えられない**＝世界にいるOVR85+は
  //   「最初からそう作られた選手」だけで、その世代が老けると二度と現れません
  //   （12年で OVR85+ が 702人 → 154人）。
  //
  //   自チーム側（`processExpGains`）は最初から貯めて使う形でした。**同じにします。**
  const expOut: Partial<Record<CardStatKey, number>> = { ...(p.exp ?? {}) }
  if (allowAnnualGrowth) {
    const rate = tierGrowthRate(clubTierForGrowth)
    const per = (ANNUAL_BASE_EXP * rate) / GROW_STAT_KEYS.length
    for (const stat of GROW_STAT_KEYS) {
      const cap = caps[stat]
      if (ratings[stat] >= cap) { expOut[stat as CardStatKey] = 0; continue }
      let acc = (expOut[stat as CardStatKey] ?? 0) + per
      let cur = ratings[stat]
      // 貯まったぶんだけ上げる。自チームと同じ数え方（processExpGains）
      while (cur < cap) {
        const need = requiredExpForLevel(cur)
        if (acc < need) break
        acc -= need
        cur++
      }
      ratings[stat] = cur
      // 上限に届いたら余りは残さない（自チームと同じ）
      expOut[stat as CardStatKey] = cur >= cap ? 0 : Math.round(acc)
    }
  }

  // 衰え。35歳以降は絶対年齢で急激に落とす（37歳で85バリバリを防ぐ）。身体系を大きく、経験系はやや。
  const PHYS: RatingsKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'recovery']
  if (nextAge >= 37) {
    for (const s of PHYS) ratings[s] = Math.max(20, ratings[s] - rnd(3, 6))
    ratings.mental = Math.max(20, ratings.mental - rnd(1, 3))
    ratings.pacing = Math.max(20, ratings.pacing - rnd(1, 3))
  } else if (nextAge >= 35) {
    for (const s of PHYS) ratings[s] = Math.max(20, ratings[s] - rnd(2, 4))
    ratings.mental = Math.max(20, ratings.mental - rnd(0, 2))
    ratings.pacing = Math.max(20, ratings.pacing - rnd(0, 2))
  } else if (ageDiff >= 4) {
    // ピーク超過（35歳未満）：中程度の衰え。ピークから離れるほど加速する
    // （33〜34歳の高OVRがほぼ落ちず「いつ衰えるねん」となる問題の対策）
    const sev = ageDiff >= 6 ? 2 : 1
    ratings[primary] = Math.max(20, ratings[primary] - rnd(1, 2) * sev)
    if (Math.random() < 0.70) ratings.stamina = Math.max(20, ratings.stamina - rnd(1, 2) * sev)
    if (Math.random() < 0.50) ratings.recovery = Math.max(20, ratings.recovery - sev)
    if (Math.random() < 0.40) ratings.speed = Math.max(20, ratings.speed - sev)
    if (Math.random() < 0.30) ratings.mountainUp = Math.max(20, ratings.mountainUp - sev)
    if (Math.random() < 0.30) ratings.mountainDown = Math.max(20, ratings.mountainDown - sev)
  } else if (ageDiff >= 1) {
    // 初期衰え: 身体系がわずかに落ちるが経験でカバー
    if (Math.random() < 0.30) ratings[primary] = Math.max(20, ratings[primary] - 1)
    if (Math.random() < 0.20) ratings.stamina = Math.max(20, ratings.stamina - 1)
    if (Math.random() < 0.35) ratings.mental = Math.min(caps.mental, ratings.mental + 1)
    if (Math.random() < 0.30) ratings.pacing = Math.min(caps.pacing, ratings.pacing + 1)
  }
  // 成長期・ピーク前後: レース/カードEXPに委ねる（growPlayerでは変化なし）

  return {
    ...withMorale(p, 5),
    age: nextAge,
    yearsPro: p.yearsPro + 1,
    ratings,
    // 使い切れなかったEXPを持ち越す（捨てるとOVR80で頭打ちになる。上のコメント）
    exp: expOut,
    potential,
    fatigue: 5,
    form: 0,
    contract: { ...p.contract, yearsLeft: Math.max(0, p.contract.yearsLeft - 1) },
  }
}
