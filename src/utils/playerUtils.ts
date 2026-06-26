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

export function calcTransferValue(p: Player): number {
  const o = ovr(p)
  const age = p.age

  // Younger players valued exponentially higher — same logic as soccer
  const ageFactor =
    age <= 18 ? 2.5 :
    age <= 20 ? 2.0 :
    age <= 22 ? 1.6 :
    age <= 24 ? 1.3 :
    age <= 26 ? 1.1 :
    age <= 28 ? 1.0 :
    age <= 30 ? 0.75 :
    age <= 32 ? 0.45 :
    age <= 34 ? 0.20 :
    0.05

  const potFactor = p.potential >= 85 ? 1.3 : p.potential >= 75 ? 1.1 : 1.0

  // Career track record adds market premium
  const segFactor   = 1 + Math.min(p.career.segmentWins * 0.03, 0.30)
  const champFactor = 1 + p.career.championships * 0.15
  const mvpFactor   = 1 + p.career.mvpAwards * 0.10
  const careerFactor = segFactor * champFactor * mvpFactor

  const ctFactor = 1.0 + Math.min((p.contract.yearsLeft - 1) * 0.08, 0.24)

  // OVR70/28yo base ≈ 4900万
  const raw = o * o * ageFactor * potFactor * careerFactor * ctFactor * 10000
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

