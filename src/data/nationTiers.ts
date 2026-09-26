import type { Nationality } from '../types'

// ============================================================================
// **国の格**（1〜5）。海外の選手が「どの強さの席に入りやすいか」を決める（utils/nationTier）。
// クラブの格（data/clubTiers・1〜20）とは別の表で、**クラブの強さは一切動かさない**。
//
// ■決め方（オーナー・2026-09-26「ケニアとインドが同レベルのガチャはおかしいやん」
//   「クラブの格は変えずに代表のバランス調整したい」）
//   現実の長距離の勢力図に寄せた5段。以前の手書きの人数表（data/nationTalent・ケニア300…）の段を
//   そのまま国の格にした。
//
// ■日本はこの表に入れない（オーナー・2026-09-26「日本だけクラブの格そのままで行こう」「ここは仕方ない」）
//   日本のクラブは日本人中心（外国籍5〜6人）なので、日本人は日本のクラブの席にほぼ全員が入る。
//   日本の1部には S 以上の席が約290あり、国の格をいくつに付けても日本代表は1部の強さ（OVR88前後）になる
//   ＝付けても効かない数字になる（試算で確かめた）。日本人の強さはクラブの格から出るままにする
// ============================================================================

export type NationTier = 1 | 2 | 3 | 4 | 5

const TIER_1: Nationality[] = ['KEN', 'ETH']
const TIER_2: Nationality[] = ['UGA', 'ERI', 'MAR', 'TAN', 'BRN']
const TIER_3: Nationality[] = ['BDI', 'RWA', 'DJI', 'ALG', 'TUN', 'USA', 'GBR', 'GER', 'ESP', 'ITA', 'NED', 'NOR']
const TIER_4: Nationality[] = ['FRA', 'CAN', 'AUS', 'BEL', 'POR', 'SUI', 'FIN', 'IRL', 'POL', 'RSA', 'NGA', 'MEX', 'BRA', 'CHN', 'KOR']
/** 上に無い国（海外クラブのある国）は全部5 */
export const NATION_TIER_DEFAULT: NationTier = 5

export const NATION_TIER: Readonly<Partial<Record<Nationality, NationTier>>> = Object.fromEntries([
  ...TIER_1.map(n => [n, 1]), ...TIER_2.map(n => [n, 2]), ...TIER_3.map(n => [n, 3]), ...TIER_4.map(n => [n, 4]),
])
