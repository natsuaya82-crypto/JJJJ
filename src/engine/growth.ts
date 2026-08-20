import type { Player, CardStatKey, Ratings } from '../types'
import { peakAgeOf, getStatPotentials, STAT_CAP } from '../utils/playerUtils'
import { tierGrowthRate, ANNUAL_BASE_EXP, type ClubTier } from '../utils/clubTier'

// ── EXP システム（設計書準拠） ─────────────────────────────────────────────

/**
 * L→L+1 に必要なEXP。`0.5 × L² × 段の重さ`。
 *
 *   L<80 …×1 ／ 80≤L<90 …×2 ／ 90≤L<99 …×4
 *   **99≤L …×6 から1段ごとに+1**（99で×6、109→110 で×16）
 *
 * ★99 から先は**優勝トロフィーで上限を開けた選手だけ**が通る道
 *   （オーナー・2026-08-20「99からは育ちにくくしたいよね」）。
 *   上へ行くほど重くして、110 を到達点にする。
 *
 * ■レジェンド（10,000EXP）で何枚ぶんか
 *     99→100  2.9枚 ／ 104→105  5.9枚 ／ 109→110  9.5枚 ／ 99→110 の合計 67枚
 *   ★**カード合成には年齢・ポテンシャル・施設の倍率が掛かりません**
 *     （`SOURCE_RULES` の `card` は3つとも false）。掛かるのは大成功の1.5倍だけ。
 *     ここを勘違いすると必要枚数を3倍近く見誤ります（実際に誤った）。
 */
export function requiredExpForLevel(level: number): number {
  const dull = level < 80 ? 1 : level < 90 ? 2 : level < 99 ? 4 : 6 + (level - 99)
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
  // ★天井は渡ってきた `caps` がそのまま正（`getStatPotentials` が `statCapOf` を掛けている）。
  //   ここで `Math.min(99, …)` と2つ目の天井を書かないこと——トロフィーで 99 を超えた能力が
  //   そこで止まる（優勝トロフィーを入れたときに実際に踏んだ）
  const capOf = (stat: CardStatKey) => caps[stat] ?? STAT_CAP
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
//   world  = CPU・海外の1年ぶん（クラブの格ぶんの倍率は呼ぶ側が量に掛ける）
//
// ★'race'（走った区間の地形別EXP）と 'bench'（見学EXP）は廃止した。
//   「レースに出た選手だけ地形に応じて伸びる」をやめて、所属していれば全員同じだけ
//   伸びる形にしたため（オーナー決定）。CPU・海外がカードを持たないぶんは
//   クラブの格ごとの倍率（utils/clubTier.ts の tierGrowthRate）で埋める。
export type GrowthSource = 'season' | 'plan' | 'card' | 'world'

/** どの経路にどの倍率が掛かるか。経路ごとの差は、この表だけで表現する。 */
const SOURCE_RULES: Record<GrowthSource, { age: boolean; potential: boolean; facility: boolean }> = {
  season: { age: true,  potential: true,  facility: true  },
  plan:   { age: false, potential: true,  facility: true  },
  card:   { age: false, potential: false, facility: false },
  // ★CPU・海外には年齢・ポテンシャル・施設の倍率を掛けない。**元からそうでした**——
  //   `growPlayer` の年次成長は `ANNUAL_BASE_EXP × tierGrowthRate ÷ 能力数` を素で足すだけで、
  //   倍率は1つも通っていませんでした。レースごとに移すときに `season` を当てると
  //   **CPUだけ年+1.15 OVR 速くなります**（実測3000人）。差は表に置いて、量は変えない。
  world:  { age: false, potential: false, facility: false },
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
    const capped = ((player.ratings as Record<string, number>)[k] ?? 0) >= ((caps as Record<string, number>)[k] ?? STAT_CAP)
    const v = capped ? 0 : Math.round((baseGains[k] ?? 0) * potArg * ageM)
    if (v > 0) gained[k] = v
  })

  return { ratings: r.ratings, exp: r.exp, gained, breakdown }
}

/**
 * **CPU・海外の1レースぶんの成長。** レースを進める側（`engine/raceProgress`）と
 * 点検が**同じここを通ります**（呼ぶ側で量の式を書かないこと）。
 *
 * 量は「1年ぶん ÷ そのシーズンのレース数 ÷ 能力数 × クラブの格の倍率」。
 * 自チームは `ANNUAL_BASE_EXP` をそのまま（カードと施設で伸ばす）、CPU・海外は
 * カードが無いぶんを `tierGrowthRate` で埋める、という形は変えていません。
 *
 * ★倍率（年齢・ポテンシャル・施設）は掛けません（`SOURCE_RULES.world`）。
 *   `season` を当てるとCPUだけ年 +1.15 OVR 速くなります（実測3000人）。
 */
export function growWorldPlayer(p: Player, clubTier: ClubTier, seasonRaces: number): Player {
  if (p.status !== 'active') return p
  const per = Math.round(
    ANNUAL_BASE_EXP * tierGrowthRate(clubTier) / Math.max(1, seasonRaces) / GROW_STAT_KEYS.length)
  const baseGains: Partial<Record<CardStatKey, number>> = {}
  for (const k of GROW_STAT_KEYS) baseGains[k as CardStatKey] = per
  const out = applyGrowth({ player: p, source: 'world', baseGains })
  return { ...p, ratings: out.ratings, exp: out.exp }
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
// **成長（EXP）はここではやりません。** 自チームもCPU・海外も `engine/raceProgress` が
// レースごとに配ります（2026-08-20 に揃えました。下の★）。
// 一律EXPを配る能力の一覧。自チーム（毎レース）とCPU（年1回）で同じものを使う。
// 2つ持つと「片方は7能力に配る・もう片方は各能力へ丸ごと」のようにズレる（実際にズレていた）
export const GROW_STAT_KEYS: RatingsKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
export function growPlayer(p: Player): Player {
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

  // ★**年次成長（1年ぶんのEXPをまとめて配る）はここから出しました。**
  //   いまは `engine/raceProgress` が**レースごとに**「年間ぶん ÷ レース数」を配ります
  //   （自チームとまったく同じ形。オーナー・2026-08-20「レースごとだと嬉しいけど、
  //   重くなるようなら仕方ない」→ 実測 15ms/レース＝runRace の +3%、到達点は
  //   91.6%が完全一致・OVRの差の平均 0.02）。**ここに戻さないこと**——戻すと
  //   1年ぶんが二重に入ります。この関数がやるのは加齢と衰えだけです。
  const expOut: Partial<Record<CardStatKey, number>> = { ...(p.exp ?? {}) }

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
    ...p,
    // ★毎年 +5 していたのをやめた（オーナー・2026-08-19）。下がる口が1つも無かったので、
    //   CPU・海外の5,800人が2年で士気100に張り付き、士気がタイムに掛かる意味を失っていた。
    //   いまは走るたびに既定値へ戻る（`engine/raceMorale`）ので、ここで足す必要が無い
    age: nextAge,
    yearsPro: p.yearsPro + 1,
    ratings,
    // 使い切れなかったEXPを持ち越す（捨てるとOVR80で頭打ちになる。上のコメント）
    exp: expOut,
    potential,
    fatigue: 5,
    form: 0,
    // ★契約が切れたら「加入したときの契約」の印も消す。残すと、無所属になった選手が
    //   `isTransferLocked` で止まったまま誰にも獲られなくなる
    contract: {
      ...p.contract,
      yearsLeft: Math.max(0, p.contract.yearsLeft - 1),
      // ★契約が切れたら「加入したときの契約」の印も消す。残すと、無所属になった選手が
      //   `isTransferLocked` で止まったまま誰にも獲られなくなる
      ...(p.contract.yearsLeft <= 1 ? { signedOnJoin: false } : {}),
    },
  }
}
