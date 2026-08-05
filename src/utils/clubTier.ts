// クラブの「格」。国内(JPEL)・海外の区別なく、全232クラブを同じ物差しで並べる唯一の場所。
//
// ■ 何を決めるか
//   格 → 年間予算 / ロスターのランク構成 / 成長の上限 / スポンサー。
//   「格が高いクラブは金があり、良い選手がいて、選手がより上まで伸びる」を1本でつなぐ。
//
// ■ なぜ全クラブを1本にするのか
//   移籍が成立するかは「行き先が今より格上か格下か」で決まる。国内と海外で別々の物差しを
//   持つと、4大リーグへ進む・3部の原石を奪い合う・古巣に戻る、が全部比べられない。
//   もとは国内が data/economy.ts の RANK_BUDGET（前年順位）、海外が playerGenerator の
//   REGION.budget という別々の表だった。同じ「格」で2つの体系があった。
//
// ■ 「配分年俸」は無い
//   以前は 予算 → 25人へ年俸を配る → その額からランクを逆算、という中間の仕組みがあり、
//   さらに実際に払う年俸は OVR から計算し直していた。年俸が2つあって互いを見ておらず、
//   予算1.5億のクラブの実年俸が8億、という矛盾が起きていた。
//   いまは 格 → ランク構成 → 年齢カーブ → OVR → 年俸（1本）で、予算と実額が必ず一致する。
//
// ■ ここでやらないこと
//   移籍の可否そのもの。ここは「格がいくつか・いくら払えるか・どこまで伸びるか」だけ。

import type { Team } from '../types'
import type { Rank } from '../types'

/** 1が世界の頂点、20が最下層。20段階 */
export type ClubTier =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20

export const CLUB_TIERS: readonly ClubTier[] =
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

/** 初期ロスターの人数。国内・海外とも同じ（前は国内28・海外22でズレていた） */
export const INITIAL_ROSTER_SIZE = 25

/** 予算のうち年俸に回す割合。残りが補強・移籍金の原資になる */
export const SALARY_SHARE = 0.6

/**
 * 格 → 年間予算（円）。
 *
 * 決め方は「その格のロスター構成を年齢18〜32でばらけさせたときの総年俸 ÷ 0.6」。
 * つまり初期ロスターの年俸が必ず予算の6割になる。手元の4割が補強の原資。
 * ★ここの数字を勝手に丸めないこと。構成・年齢カーブ・年俸表から出た値。
 */
export const TIER_BUDGET: Record<ClubTier, number> = {
  1:  2_110_000_000,
  2:  2_010_000_000,
  3:  1_940_000_000,
  4:  1_770_000_000,
  5:  1_680_000_000,
  6:  1_570_000_000,
  7:  1_460_000_000,
  8:  1_310_000_000,
  9:  1_260_000_000,
  10: 1_170_000_000,
  11: 1_040_000_000,
  12:   920_000_000,
  13:   860_000_000,
  14:   810_000_000,
  15:   710_000_000,
  16:   650_000_000,
  17:   620_000_000,
  18:   570_000_000,
  19:   480_000_000,
  20:   420_000_000,
}

/**
 * 格 → 成長の上限（総合OVRの上限）。
 * 個別の能力ではなく OVR の上限。格の高いクラブにいるほど上まで伸びる。
 * ★格下へ移っても下がらない（上限は一度上がったら本人のもの）。
 */
export const TIER_POTENTIAL_CAP: Record<ClubTier, number> = {
  1: 99, 2: 98, 3: 97, 4: 95, 5: 93, 6: 90, 7: 88, 8: 87, 9: 86, 10: 85,
  11: 85, 12: 85, 13: 85, 14: 85, 15: 85, 16: 83, 17: 83, 18: 83, 19: 83, 20: 83,
}

/**
 * 格 → 成長の速さ（CPU・海外クラブ）。格が高いクラブほど伸びやすい。
 *
 * 自チームは 1.0 ＋ 練習カード。CPU・海外はカードが無いぶんをこの倍率で埋める。
 * 格1の4.0倍が「優勝した自チーム（1.0＋カード年158,872EXP）」と釣り合う。
 *
 * 格14以下を1.5で止めてあるのは、0.2刻みのまま下ろすと格20が0.2倍になり、
 * 上限83へ到達するのに37年かかって選手寿命（18〜35歳）で届かなくなるため。
 * 1.5あれば下位クラブでも4年で上限に届き、「3部で原石を育てて売る」が成立する。
 */
const TIER_GROWTH_RATE: Record<ClubTier, number> = {
  1: 4.0, 2: 3.8, 3: 3.6, 4: 3.4, 5: 3.2, 6: 3.0, 7: 2.8, 8: 2.6, 9: 2.4, 10: 2.2,
  11: 2.0, 12: 1.8, 13: 1.6,
  14: 1.5, 15: 1.5, 16: 1.5, 17: 1.5, 18: 1.5, 19: 1.5, 20: 1.5,
}
export function tierGrowthRate(tier: ClubTier): number {
  return TIER_GROWTH_RATE[tier]
}

/**
 * 全員に毎年入る一律EXP。所属していればレースに出ていなくても同じだけ入る。
 * （前は「走った選手＝地形別EXP／走らなかった選手＝全能力50EXP」と分かれていた）
 * この値と tierGrowthRate の組み合わせで、CPUと自チームの伸びが釣り合う。
 */
export const ANNUAL_BASE_EXP = 52_957

/**
 * 格 → スポンサー収入（円/年）。3社ぶんの合計。
 * 格5で約5000万、格20で約300万。上位ほど急に増える。
 */
export function tierSponsorIncome(tier: ClubTier): number {
  // 格5=5000万・格20=300万 を通る指数カーブ。格1はその延長で約8600万
  const v = 50_000_000 * Math.pow(300 / 5000, (tier - 5) / 15)
  return Math.round(v / 100_000) * 100_000
}

/** 運営費＝ロスター総年俸の1割 */
export const OPERATING_COST_RATE = 0.1
export function operatingCostOf(salaryTotal: number): number {
  return Math.round(salaryTotal * OPERATING_COST_RATE)
}

// ── ロスターのランク構成 ─────────────────────────────────────────
//
// 格ごとに「25人のうち各ランクが何人か」。格が上がるほど構成の中心が上のランクへ動く。
// 格1にDは1人もいないし、格20にSSSは1人もいない。
const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']

/**
 * その格のロスター構成。返り値はランク→人数（合計25）。
 * 中心を格で動かした正規分布で配る。手書きの表を20段ぶん持つより、
 * 格を増減したときにズレない。
 */
export function tierRankComposition(tier: ClubTier): Record<Rank, number> {
  const center = 5.6 - (tier - 1) * (5.6 - 0.6) / 19
  const w = RANK_ORDER.map((_, i) => Math.exp(-((i - center) ** 2) / (2 * 1.2 ** 2)))
  const sum = w.reduce((s, x) => s + x, 0)
  const n = w.map(x => Math.round(INITIAL_ROSTER_SIZE * x / sum))
  // 丸めのぶんを一番多いところで吸収して合計を25に合わせる
  while (n.reduce((s, x) => s + x, 0) > INITIAL_ROSTER_SIZE) n[n.indexOf(Math.max(...n))]--
  while (n.reduce((s, x) => s + x, 0) < INITIAL_ROSTER_SIZE) n[n.indexOf(Math.max(...n))]++
  const out = {} as Record<Rank, number>
  RANK_ORDER.forEach((r, i) => { out[r] = n[i] })
  return out
}

// ── 国内（JPEL 52クラブ）─────────────────────────────────────────
//
// 国内の格は前年の通し順位（1〜52位）で決まる。1位＝格5、52位＝格20。
// 昇降格も順位で決まるので、格の上下を別に持つ必要がない。
//
// ★国内の頭打ちは格5。格4以上は海外クラブだけ。
//   3部最下位（格20・4.2億）から1部優勝（格5・16.8億）まで4倍。

/** 国内の最上位の格。1部優勝でここに到達し、これ以上は上がらない */
export const DOMESTIC_TOP_TIER: ClubTier = 5
/** 国内の最下位の格。3部最下位 */
export const DOMESTIC_BOTTOM_TIER: ClubTier = 20
/** 国内の総クラブ数（1部20＋2部16＋3部16） */
export const DOMESTIC_CLUB_COUNT = 52

/** 国内の通し順位（1〜52）→ 格 */
export function tierFromDomesticRank(rank: number): ClubTier {
  const r = Math.max(1, Math.min(DOMESTIC_CLUB_COUNT, Math.round(rank)))
  const span = DOMESTIC_BOTTOM_TIER - DOMESTIC_TOP_TIER
  return (DOMESTIC_TOP_TIER + Math.round((r - 1) * span / (DOMESTIC_CLUB_COUNT - 1))) as ClubTier
}

// ── 読み口 ───────────────────────────────────────────────────────

type TieredTeam = { tier?: ClubTier; initialRank?: Team['initialRank'] }

/**
 * そのクラブの格。
 * Team.tier があればそれ。無ければ initialRank（通し順位）から引く。
 * ★格を読むときは必ずこれを通すこと。team.tier を直接見ないこと
 *   （古いセーブには tier が無く、undefined のクラブが生まれる）。
 * ★格はプレイヤーに見せない内部データ。画面に出さないこと。
 */
export function tierOf(team: TieredTeam | undefined): ClubTier {
  if (!team) return DOMESTIC_BOTTOM_TIER
  return team.tier ?? tierFromDomesticRank(team.initialRank ?? DOMESTIC_CLUB_COUNT)
}

/** そのクラブの年間予算（円） */
export function tierBudget(team: TieredTeam | undefined): number {
  return TIER_BUDGET[tierOf(team)]
}

/** そのクラブの成長上限（OVR） */
export function tierPotentialCap(team: TieredTeam | undefined): number {
  return TIER_POTENTIAL_CAP[tierOf(team)]
}
