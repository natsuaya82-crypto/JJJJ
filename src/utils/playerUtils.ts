import type { Player, Specialty, GrowthCurve } from '../types'
import { calcBaseAbility, calcAffinity, calcConditionModifier } from '../engine/raceEngine'

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

export function faMarketSalary(p: Player): number {
  const base = ovr(p) * 140000
  const age = p.age
  const ageFactor = age < 24 ? 1.1 : age < 28 ? 1.0 : age < 31 ? 0.85 : 0.65
  return Math.round(base * ageFactor / 500000) * 500000
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
  return p.rosterTier === 'main' && teamRaces >= 3 && playFraction >= 0.6
}

// 移籍・トレードで動く選手本人が「移籍先チームに行くことに納得するか」。
// チーム同士が合意しても、選手が納得しなければ成立しない。年俸ではなく出場データ・順位で判断。
// destRank=移籍先の現順位, totalTeams=全チーム数, playFraction=現チームでの出場割合, teamRaces=消化レース数。
export function playerConsentToMove(
  p: Player, destRank: number, totalTeams: number, playFraction = 0.5, teamRaces = 0,
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
  // 出場データによる移籍意欲：2軍・出場が少ない選手は出たがる。主力は残りたい。
  const key = isDataKeyPlayer(p, playFraction, teamRaces)
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

  // 係数80000で OVR70/28歳 ≈ 5000万（OVR80/24 ≈ 1.2億、OVR56 ≈ 1000万台）
  const raw = base * ageFactor * potFactor * careerFactor * ctFactor * 80000
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

export type ScoutReport = {
  bestTerrain: string
  growthOutlook: string
  valueTrend: 'up' | 'flat' | 'down'
  buyWindow: string
}

export function buildScoutReport(p: { ratings: { speed: number; stamina: number; mountainUp: number; mountainDown: number; pacing: number; mental: number }; specialty: Specialty; growthCurve: GrowthCurve; age: number }): ScoutReport {
  const r = p.ratings
  const uphillScore   = r.mountainUp * 0.55 + r.stamina * 0.45
  const downhillScore = r.mountainDown * 0.55 + r.speed * 0.45
  const flatScore     = r.speed * 0.5 + r.stamina * 0.5
  const maxScore      = Math.max(uphillScore, downhillScore, flatScore)
  const bestTerrain   = maxScore === uphillScore ? '上り坂' : maxScore === downhillScore ? '下り坂' : '平坦'

  const growthOutlook = p.growthCurve === 'early'
    ? '早熟型 — 現在の能力が安定。即戦力だが伸び代は限定的'
    : p.growthCurve === 'late_bloomer'
    ? '晩成型 — 現在は発展途上。数年後に大きく開花する可能性'
    : '標準型 — 2〜3年で安定したパフォーマンスに到達見込み'

  const peakStart   = p.specialty === 'sprinter' ? 22 : p.specialty === 'grinder' ? 26 : 24
  const yearsToPeak = Math.max(0, peakStart - p.age)
  const buyWindow   = yearsToPeak === 0
    ? 'ピーク到達済み。即戦力として今すぐ起用可'
    : `約${yearsToPeak}年後にパフォーマンスのピークを迎える見込み`

  const valueTrend: 'up' | 'flat' | 'down' = p.age < peakStart - 1 ? 'up' : p.age <= peakStart + 3 ? 'flat' : 'down'
  return { bestTerrain, growthOutlook, valueTrend, buyWindow }
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
export function isOpponentScouted(playerId: string, season: ScoutSeasonLike): boolean {
  const entry = (season.scoutedOpponents ?? []).find(s => s.playerId === playerId)
  if (!entry) return false
  return entry.reqAt === undefined || racesConsumed(season) > entry.reqAt
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

export function formLabel(form: number): string {
  return FORM_LABELS[Math.round(form)] ?? '普通'
}

export function ratingColor(v: number): string {
  if (v >= 82) return '#FFD700'
  if (v >= 76) return '#C9A84C'
  if (v >= 69) return '#4CAF50'
  if (v >= 58) return '#7986CB'
  return '#5C5870'
}

