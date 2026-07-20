// 世界陸上：代表選出エンジン（OVRではなく持ちタイム=eventBests基準）。
// 国籍で選手を集め、5000/10000/マラソンの持ちタイムで候補を作る。
// 個人種目は参加標準記録の突破者。駅伝は候補から20人選抜（監督 or AI）。
import type { Player, Nationality } from '../types'

export type WAEvent = 'd5000' | 'd10000' | 'marathon'
export const WA_EVENTS: WAEvent[] = ['d5000', 'd10000', 'marathon']
export const WA_EVENT_LABEL: Record<WAEvent, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }

// 参加標準記録（秒）。今年＋前年の持ちタイムがこれ未満なら個人種目に出場可。
export const WA_STANDARD: Record<WAEvent, number> = {
  d5000: 13 * 60 + 30,        // 13:30
  d10000: 28 * 60 + 20,       // 28:20
  marathon: 2 * 3600 + 13 * 60, // 2:13:00
}

// 総合スコア用の基準タイム（エリート≒1.0）。
const WA_REF: Record<WAEvent, number> = {
  d5000: 12 * 60 + 50,        // 12:50
  d10000: 26 * 60 + 40,       // 26:40
  marathon: 2 * 3600 + 3 * 60, // 2:03:00
}

// 選出に使える「今年＋前年」の持ちタイムを引く（無ければ null）
export function recentBest(p: Player, ev: WAEvent, currentYear: number): number | null {
  const b = p.eventBests?.[ev]
  if (!b) return null
  if (b.year < currentYear - 1) return null // 2年より前の記録は選考対象外
  return b.timeSec
}

// その選手の距離総合スコア（高いほど速い）。得意種目の質で見る。
export function distanceScore(p: Player, currentYear: number): number {
  let best = 0
  for (const ev of WA_EVENTS) {
    const t = recentBest(p, ev, currentYear)
    if (t == null) continue
    const s = WA_REF[ev] / t
    if (s > best) best = s
  }
  return best
}

export type Candidate = { player: Player; score: number; bests: Partial<Record<WAEvent, number>> }

// 駅伝代表の候補（持ちタイム順・約50人）。日本人は所属問わず nationality で集める。
export function ekidenCandidates(players: Player[], nat: Nationality, currentYear: number, limit = 50): Candidate[] {
  const out: Candidate[] = []
  for (const p of players) {
    if (p.status === 'retired') continue
    if (p.nationality !== nat) continue
    const bests: Partial<Record<WAEvent, number>> = {}
    let has = false
    for (const ev of WA_EVENTS) {
      const t = recentBest(p, ev, currentYear)
      if (t != null) { bests[ev] = t; has = true }
    }
    if (!has) continue
    out.push({ player: p, score: distanceScore(p, currentYear), bests })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

export type IndividualEntry = { player: Player; timeSec: number }

// 個人種目の出場者（参加標準記録を突破した選手をタイム順）。
export function individualEntrants(players: Player[], nat: Nationality, ev: WAEvent, currentYear: number): IndividualEntry[] {
  const std = WA_STANDARD[ev]
  const out: IndividualEntry[] = []
  for (const p of players) {
    if (p.status === 'retired' || p.nationality !== nat) continue
    const t = recentBest(p, ev, currentYear)
    if (t == null || t > std) continue
    out.push({ player: p, timeSec: t })
  }
  out.sort((a, b) => a.timeSec - b.timeSec)
  return out
}

// AIおまかせ／海外国の駅伝20人選抜：個人種目のスターを除いた候補の上位20。
export function autoSelectEkiden(candidates: Candidate[], individualStarIds: Set<string>, size = 20): Player[] {
  const picked: Player[] = []
  for (const c of candidates) {
    if (picked.length >= size) break
    if (individualStarIds.has(c.player.id)) continue // 個人種目の代表は基本駅伝に入らない
    picked.push(c.player)
  }
  // 個人種目スターを除いて20に満たなければ、スターも含めて埋める
  if (picked.length < size) {
    for (const c of candidates) {
      if (picked.length >= size) break
      if (picked.some(p => p.id === c.player.id)) continue
      picked.push(c.player)
    }
  }
  return picked
}

// ある国の個人種目代表（全種目）を集めて選手IDの集合を返す（駅伝除外用）。
export function individualStarIds(players: Player[], nat: Nationality, currentYear: number): Set<string> {
  const ids = new Set<string>()
  for (const ev of WA_EVENTS) {
    for (const e of individualEntrants(players, nat, ev, currentYear)) ids.add(e.player.id)
  }
  return ids
}
