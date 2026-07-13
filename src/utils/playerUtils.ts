import type { Player, Specialty, Ratings, CardStatKey } from '../types'
import { calcBaseAbility, calcAffinity, calcConditionModifier } from '../engine/raceEngine'

// ── 能力別ポテンシャル（各能力ごとの成長上限）──
// 単一の potential と特性から各能力の上限を導出する（保存はせず都度算出＝既存セーブもそのまま動く）。
// 得意能力は potential+α まで、苦手能力は低め。現在値を下回らない（既に高い能力は据え置き）。
const SPEC_STRONG_STATS: Record<Specialty, CardStatKey[]> = {
  ace:           ['pacing', 'mental', 'stamina'],
  sprinter:      ['speed', 'pacing'],
  long:          ['stamina', 'mental', 'recovery'],
  mountain_up:   ['mountainUp', 'stamina'],
  mountain_down: ['mountainDown', 'speed'],
  allrounder:    ['speed', 'stamina', 'pacing'],
  kick:          ['speed', 'mental'],
  grinder:       ['stamina', 'recovery', 'mental'],
}
const ALL_STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

// 各能力の成長上限（内部の正確値）。得意 potential+9(最大99) / 苦手 potential-8、現在値未満にはしない。
// 得意と苦手の差を広げ、選手を尖らせる（例：スプリンターは速さ99・登り80台）。
// 平均は概ね potential 付近に収まるので OVR(=7能力平均)は potential 前後を維持。
export function getStatPotentials(p: Player): Ratings {
  const strong = new Set(SPEC_STRONG_STATS[p.specialty] ?? [])
  const out = {} as Ratings
  for (const stat of ALL_STAT_KEYS) {
    const ceil = strong.has(stat) ? p.potential + 9 : p.potential - 8
    const cur = (p.ratings as Record<string, number>)[stat] ?? 0
    ;(out as Record<string, number>)[stat] = Math.min(99, Math.max(cur, Math.round(ceil)))
  }
  return out
}

// その能力が上限に達しているか（カード合成のブロック・表示用）。
export function isStatMaxed(p: Player, stat: CardStatKey): boolean {
  const cur = (p.ratings as Record<string, number>)[stat] ?? 0
  return cur >= (getStatPotentials(p) as Record<string, number>)[stat]
}

// 表示用の上限バンド（正確値は隠して幅で示す）。cap を中心に ±3、1..99 にクランプ。
export function statCapBand(cap: number): { lo: number; hi: number } {
  return { lo: Math.max(1, cap - 3), hi: Math.min(99, cap + 3) }
}

export const SPEC_COLOR: Record<Specialty, string> = {
  ace: '#C9A84C',
  mountain_up: '#4CAF50',
  mountain_down: '#26C6DA',
  sprinter: '#EC407A',
  long: '#7986CB',
  allrounder: '#9B97A8',
  kick: '#FF6B35',
  grinder: '#AB8ED6',
}

export function ovr(p: Player): number {
  const r = p.ratings
  return Math.round((r.speed + r.stamina + r.mountainUp + r.mountainDown + r.pacing + r.mental + r.recovery) / 7)
}

export const FORM_LABELS: Record<number, string> = {
  2: '絶好調', 1: '好調', 0: '普通', [-1]: '不調', [-2]: '絶不調',
}

export const FORM_COLORS: Record<number, string> = {
  2: '#FFB800', 1: '#4CAF50', 0: '#5C5870', [-1]: '#FF9800', [-2]: '#E8462A',
}

// Segment-specific OVR: player's actual strength for a given terrain profile
// This is the "Winning Eleven position rating" equivalent
export function segOvr(p: Player, uphillPct: number, downhillPct: number, distanceKm: number, statWeights?: Partial<Record<keyof Player['ratings'], number>>): number {
  return Math.round(calcBaseAbility(p.ratings, uphillPct, downhillPct, distanceKm, statWeights) * calcAffinity(p.specialty, uphillPct, downhillPct, distanceKm))
}

// Segment OVR adjusted for current condition (fatigue/morale/form)
export function effSegOvr(p: Player, uphillPct: number, downhillPct: number, distanceKm: number, statWeights?: Partial<Record<keyof Player['ratings'], number>>): number {
  return Math.round(segOvr(p, uphillPct, downhillPct, distanceKm, statWeights) * calcConditionModifier(p.fatigue ?? 0, p.morale ?? 70, p.form ?? 0))
}

// OVR→市場給与(円)。非線形（スターほど跳ね上がる）。区分線形で下記アンカーを通す。
//  60→600万 / 70→1500万 / 80→3500万 / 90→7000万 / 95→1億 / 99→1.4億
const SALARY_ANCHORS: [number, number][] = [
  [45, 3_000_000], [50, 4_000_000], [60, 6_000_000], [70, 10_000_000],
  [80, 30_000_000], [90, 50_000_000], [95, 80_000_000], [99, 100_000_000],
]
function ovrSalary(o: number): number {
  const pts = SALARY_ANCHORS
  if (o <= pts[0][0]) return pts[0][1]
  if (o >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [o0, v0] = pts[i], [o1, v1] = pts[i + 1]
    if (o >= o0 && o <= o1) return v0 + (o - o0) * (v1 - v0) / (o1 - o0)
  }
  return pts[pts.length - 1][1]
}

// 市場給与＝OVRベース×年齢補正。能力が落ちれば下がる（衰えを反映）。
export function faMarketSalary(p: Player): number {
  const age = p.age
  const ageFactor = age <= 23 ? 1.08 : age <= 27 ? 1.0 : age <= 30 ? 0.9 : age <= 33 ? 0.72 : 0.55
  return Math.round(ovrSalary(ovr(p)) * ageFactor / 500000) * 500000
}

// 選手がそのシーズンに何レース出場したか（データ判定用）
type RaceLike = { results?: { segmentResults: { runners: { playerId: string }[] }[] } }
export function seasonAppearances(playerId: string, races: readonly RaceLike[]): number {
  let c = 0
  for (const r of races) {
    if (r.results?.segmentResults.some(s => s.runners.some(rn => rn.playerId === playerId))) c++
  }
  return c
}

// 主力かどうかを「データ」で判定（年俸ではなく、よく出場しているか）。
// playFraction=そのチームの消化レースに対する出場割合(0..1), teamRaces=消化レース数。
export function isDataKeyPlayer(p: Player, playFraction: number, teamRaces: number): boolean {
  if (p.rosterTier !== 'main') return false
  // 高OVRのスターは出場割合・シーズン序盤に関係なく常に主力扱い（簡単に引き抜けない）。
  if (ovr(p) >= 78) return true
  // それ以外は「3戦以降で出場5.5割以上」で主力判定。
  return teamRaces >= 3 && playFraction >= 0.55
}

// 移籍・トレードで動く選手本人が「移籍先チームに行くことに納得するか」。
// チーム同士が合意しても、選手が納得しなければ成立しない。年俸ではなく出場データ・順位で判断。
// destRank=移籍先の現順位, totalTeams=全チーム数, playFraction=現チームでの出場割合, teamRaces=消化レース数。
// clubBlessed=true はクラブ間で移籍金が合意済みの公認移籍：売る判断はクラブが済ませているので
// 「主力だから残りたい」の減点は働かず、本人は行き先の魅力・愛着だけで決める。
export function playerConsentToMove(
  p: Player, destRank: number, totalTeams: number, playFraction = 0.5, teamRaces = 0, consentBonus = 0, clubBlessed = false,
): { ok: boolean; reason: string } {
  const appeal = destRank > 0 ? (totalTeams - destRank + 1) / totalTeams : 0.5 // 1.0=首位級
  const personality = p.personality ?? 'salary'
  const morale = p.morale ?? 60
  let score: number
  if (personality === 'winning') score = appeal * 1.1
  else if (personality === 'loyalty') score = appeal * 0.65 + 0.05
  else score = 0.5 + appeal * 0.35
  if (morale < 40) score += 0.2
  else if (morale >= 75) score -= 0.1
  score += consentBonus  // スカウト拠点などの交渉成立ボーナス
  // 出場データによる移籍意欲：2軍・出場が少ない選手は出たがる。主力は残りたい。
  const key = isDataKeyPlayer(p, playFraction, teamRaces) && !clubBlessed
  if (p.rosterTier === 'second') score += 0.35
  else if (teamRaces >= 3 && playFraction < 0.4) score += 0.25   // 1軍でもほぼ出ていない＝出場機会を求める
  else if (key) score -= 0.3                                     // 主力（よく出ている）は動きにくい
  const ok = score >= 0.5
  const reason = ok ? ''
    : key ? `${p.name}は主力として起用されており、移籍を望んでいない`
    : personality === 'loyalty' ? `${p.name}は今のチームへの愛着が強く移籍を望んでいない`
    : appeal < 0.5 ? `${p.name}はチームの現状に不安があり移籍に前向きでない`
    : `${p.name}は移籍に納得していない`
  return { ok, reason }
}

// フリー移籍の勧誘に本人が乗るか（接触の決断・接触中の契約更新拒否の判定を共有）。
// 通常の移籍同意より腰が重い（-0.2）＋現チームでの出場実績を必ず加味する。
// 出場している選手・愛着のある選手は基本残留し、干されている選手だけが出て行きやすい。
export function freeContactConsent(
  p: Player, suitorRank: number, totalTeams: number, playFraction = 0.5, teamRaces = 0,
): boolean {
  return playerConsentToMove(p, suitorRank, totalTeams, playFraction, teamRaces, -0.2).ok
}

export function calcTransferValue(p: Player): number {
  const o = ovr(p)
  const age = p.age

  // OVRを主役にする。下限(45)を引いて2乗すると OVR差が大きく開き、
  // 年齢や将来性でOVRの上下が逆転しない（例: 80→(35)^2=1225 / 56→(11)^2=121 ＝約10倍差）。
  const base = Math.pow(Math.max(0, o - 45), 2)

  // 年齢は「補正」程度に抑える（OVRを覆さない範囲）。若手にやや上乗せ、高齢で減衰。
  const ageFactor =
    age <= 20 ? 1.30 :
    age <= 23 ? 1.20 :
    age <= 26 ? 1.05 :
    age <= 28 ? 1.00 :
    age <= 30 ? 0.80 :
    age <= 32 ? 0.60 :
    age <= 34 ? 0.40 :
    0.25

  const potFactor = p.potential >= 85 ? 1.15 : p.potential >= 75 ? 1.07 : 1.0

  // 実績プレミアム。初期生成(全て0)なら careerFactor=1.0 ＝ OVR＋年齢だけの素の価値。
  // プレイで出走・区間賞・優勝・MVPが溜まるほど上がる（変動する）。
  // 主軸は「出走回数」＝どれだけ起用されてきたか（区間賞ゼロの堅実な選手も評価される）。
  const appFactor   = 1 + Math.min(p.career.totalRaces * 0.004, 0.25)   // 出走で最大+25%
  const segFactor   = 1 + Math.min(p.career.segmentWins * 0.015, 0.15)  // 区間賞（点取り屋要素、控えめに残す）
  const champFactor = 1 + p.career.championships * 0.08
  const mvpFactor   = 1 + p.career.mvpAwards * 0.06
  const careerFactor = appFactor * segFactor * champFactor * mvpFactor

  const ctFactor = 1.0 + Math.min((p.contract.yearsLeft - 1) * 0.06, 0.18)

  // 係数70000で OVR70/28歳 ≈ 4600万（OVR80/24 ≈ 1.1億、OVR56 ≈ 1000万台）
  const raw = base * ageFactor * potFactor * careerFactor * ctFactor * 70000
  return Math.round(raw / 1000000) * 1000000
}

export type CareerStage = 'developing' | 'growing' | 'peak' | 'declining'

export function careerStage(p: Player): CareerStage {
  const peakStart = p.specialty === 'sprinter' ? 22 : p.specialty === 'grinder' ? 26 : 24
  const peakEnd   = p.specialty === 'grinder' ? 31 : p.specialty === 'long' ? 29 : 27
  if (p.age < peakStart - 2) return 'developing'
  if (p.age < peakStart)     return 'growing'
  if (p.age <= peakEnd)      return 'peak'
  return 'declining'
}

export const CAREER_STAGE_LABEL: Record<CareerStage, string> = {
  developing: '育成期', growing: '成長期', peak: 'ピーク', declining: '下降期',
}
export const CAREER_STAGE_COLOR: Record<CareerStage, string> = {
  developing: '#7986CB', growing: '#4CAF50', peak: '#FFD700', declining: '#9B97A8',
}

// 他チーム選手の視察（1レース待ち式）判定用の最小シーズン型。
// currentSeason 全体の循環参照を避けるため必要フィールドだけを受ける。
type ScoutSeasonLike = {
  currentRaceIndex?: number
  secondTeamRaceIndex?: number
  individualEvents?: { results?: unknown }[]
  scoutedOpponents?: { playerId: string; reqAt?: number; year: number }[]
}

// そのシーズンに消化したレース総数（リーグ戦＋リザーブ戦＋記録会）。
export function racesConsumed(season: ScoutSeasonLike): number {
  return (season.currentRaceIndex ?? 0)
    + (season.secondTeamRaceIndex ?? 0)
    + ((season.individualEvents ?? []).filter(e => e.results).length)
}

// 視察済み（＝能力/ポテンシャル開示）か。reqAt 無しの旧セーブは即開示扱い。
export function isOpponentScouted(_playerId: string, _season: ScoutSeasonLike): boolean {
  // スカウト（?で隠す）を廃止＝全選手のデータを最初から公開する。
  return true
}

// 視察中（依頼したがまだ1レース消化していない）か。
export function isScoutPending(playerId: string, season: ScoutSeasonLike): boolean {
  const entry = (season.scoutedOpponents ?? []).find(s => s.playerId === playerId)
  if (!entry) return false
  return entry.reqAt !== undefined && racesConsumed(season) <= entry.reqAt
}

export function formColor(form: number): string {
  return FORM_COLORS[Math.round(form)] ?? '#5C5870'
}


export function ratingColor(v: number, maxed = false): string {
  if (maxed) return '#E8462A'     // その選手のポテンシャル上限に到達＝MAX：赤
  if (v >= 90) return '#FFD700'   // 金
  if (v >= 80) return '#B87333'   // 金茶（ブロンズ寄りにして金と区別）
  if (v >= 70) return '#4CAF50'   // グリーン
  if (v >= 60) return '#5B9BD5'   // ブルー
  if (v >= 50) return '#9B97A8'   // グレー
  return '#4A4658'                // ブラック（40以下）
}

