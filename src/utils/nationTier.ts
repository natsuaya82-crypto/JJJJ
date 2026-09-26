import type { Nationality, Rank } from '../types'
import { INITIAL_FOREIGN_CLUBS } from '../data/leagues'
import { NATION_TIER, NATION_TIER_DEFAULT, type NationTier } from '../data/nationTiers'

// ============================================================================
// **選手の国籍の決まり（1本）**。どのクラブの席でも、国籍は「その席の強さ（ランク）」から引く。
//
//   P(国籍 | 席のランク) ∝ その国の格で、そのランクが出る割合
//
// 国の格ごとのランクの出方は、クラブの格のランク構成（utils/clubTier の tierRankComposition）と同じ形
// （中心と広がり）。格1の国は S〜SS の席に、格5の国は C〜D の席に入りやすい（オーナー・2026-09-26 の試算 R2）。
// ★**席の強さはクラブの格のまま**＝クラブの強さは一切変わらない。国の格が決めるのは「その席に誰が座るか」だけ。
//   試算：代表20人の平均が 国の格1 90.4／2 88.8／3 86.3／4 82.7／5 78.0、大陸予選の通過率 92%／53%／61%／28%／8%、
//   クラブの格ごとの走る7人は今と同じ。
//
// ■1本にしたもの（全232クラブ・全経路が通る）
//   海外クラブの初期ロスター・海外の毎年の補充・開幕の床・若手の補充・日本のクラブの外国籍の席・自チームの外国籍の席。
//   どれも「席のランク → この関数で国籍」。
// ■分けたもの（オーナーが決めた1点だけ・`data/leagueRules` の `rosterNationality`）
//   日本の部のクラブは日本人中心で外国籍は1クラブ5〜6人（`HOME_FOREIGN_RANGE`）。日本人の席は日本人。
//   日本には国の格を付けない（`data/nationTiers` の冒頭に理由）。
// ============================================================================

const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
/** 国の格ごとのランクの出方の中心（D=0 … SSS=6）と広がり */
const TIER_CENTER: Record<NationTier, number> = { 1: 4.5, 2: 3.8, 3: 3.0, 4: 2.2, 5: 1.5 }
const TIER_SIGMA = 1.2

/** 日本のような「自国中心」のクラブに入る外国籍の人数（1クラブ・初期ロスター） */
export const HOME_FOREIGN_RANGE: readonly [number, number] = [5, 6]
/** 25人のロスター。自国中心のクラブで、あとから入る選手が外国籍になる確率（初期ロスターの割合と同じ） */
export const HOME_FOREIGN_SHARE = (HOME_FOREIGN_RANGE[0] + HOME_FOREIGN_RANGE[1]) / 2 / 25

export function nationTierOf(nat: Nationality | string): NationTier {
  return NATION_TIER[nat as Nationality] ?? NATION_TIER_DEFAULT
}

/** 国の格ごとに、そのランクが出る割合 */
export function rankShareOf(tier: NationTier, rank: Rank): number {
  const c = TIER_CENTER[tier]
  const w = RANKS.map((_, i) => Math.exp(-((i - c) ** 2) / (2 * TIER_SIGMA ** 2)))
  return w[RANKS.indexOf(rank)] / w.reduce((a, b) => a + b, 0)
}

let nations: Nationality[] | null = null
/** 国籍の候補＝海外クラブのある国（68か国） */
export function worldNations(): Nationality[] {
  return nations ??= [...new Set(INITIAL_FOREIGN_CLUBS.map(c => c.country))] as Nationality[]
}

/** その強さの席に入る国籍を1つ引く（`except` の国は引かない＝自国中心のクラブの外国籍の席） */
export function drawNationalityForRank(rank: Rank, rand: () => number, except?: Nationality): Nationality {
  const cands = worldNations().filter(n => n !== except)
  const w = cands.map(n => rankShareOf(nationTierOf(n), rank))
  let x = rand() * w.reduce((a, b) => a + b, 0)
  for (let i = 0; i < cands.length; i++) { x -= w[i]; if (x < 0) return cands[i] }
  return cands[cands.length - 1]
}
