// 世界陸上：代表選出エンジン（OVRではなく持ちタイム=eventBests基準）。
// 国籍で選手を集め、5000/10000/マラソンの持ちタイムで候補を作る。
// 個人種目は参加標準記録の突破者。駅伝は候補から20人選抜（監督 or AI）。
import type { Player, Nationality } from '../types'
import { natGeoRegion, NATIONALITY_META, type GeoRegion } from '../data/nationalities'
import { formatRaceTime } from '../utils/eventTime'

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

// その選手の最速持ちタイムを「種目 時計」形式で（無ければnull）
export function bestPBLabel(p: Player, currentYear: number): string | null {
  let best: { ev: WAEvent; t: number } | null = null
  for (const ev of WA_EVENTS) {
    const t = recentBest(p, ev, currentYear)
    if (t == null) continue
    if (!best || t / WA_REF[ev] < best.t / WA_REF[best.ev]) best = { ev, t }
  }
  return best ? `${WA_EVENT_LABEL[best.ev]} ${formatRaceTime(best.t)}` : null
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

// ───────────────────────────────────────────────────────────────
// 本番20カ国の選出（地域枠）。アフリカ6/ヨーロッパ6/アメリカ4/アジア+オセアニア3/開催国1。
// 各地域は「国の距離力（持ちタイム候補上位7の合計）」が高い順。開催国は予選免除で自動枠。
// ───────────────────────────────────────────────────────────────
export const REGION_QUOTA: { region: 'アフリカ' | 'ヨーロッパ' | 'アメリカ大陸' | 'アジア+オセアニア'; slots: number }[] = [
  { region: 'アフリカ', slots: 6 },
  { region: 'ヨーロッパ', slots: 6 },
  { region: 'アメリカ大陸', slots: 4 },
  { region: 'アジア+オセアニア', slots: 3 },
]
// 世界陸上の選考地域（アジアとオセアニアは1枠グループに統合）
function meetRegion(nat: Nationality): typeof REGION_QUOTA[number]['region'] | 'その他' {
  const g: GeoRegion = natGeoRegion(nat)
  if (g === 'アジア' || g === 'オセアニア') return 'アジア+オセアニア'
  if (g === 'アフリカ' || g === 'ヨーロッパ' || g === 'アメリカ大陸') return g
  return 'その他'
}

// 国の距離力（候補上位7の距離スコア合計）。持ちタイムを持つ選手が居ない国は0。
export function nationStrength(players: Player[], nat: Nationality, year: number): number {
  return ekidenCandidates(players, nat, year, 7).reduce((s, c) => s + c.score, 0)
}

// 本番出場20カ国を決める。hostNat は予選免除で必ず入る（+1枠）。
// prevAdvanced＝前年のアジア＋オセアニア予選の通過国。ある場合、この地域の枠は予選結果で埋める
// （予選を通過していない国＝日本含む は本番に出られない）。他地域は簡易処理（距離力順）。
export function qualifyNations(players: Player[], year: number, hostNat: Nationality, prevAdvanced?: Nationality[]): Nationality[] {
  const allNats = [...new Set(players.filter(p => p.status !== 'retired').map(p => p.nationality))] as Nationality[]
  const strengthByNat = new Map<Nationality, number>()
  for (const nat of allNats) strengthByNat.set(nat, nationStrength(players, nat, year))
  const picked: Nationality[] = []
  // 開催国を先に確保
  if (hostNat) picked.push(hostNat)
  for (const { region, slots } of REGION_QUOTA) {
    if (region === 'アジア+オセアニア' && prevAdvanced && prevAdvanced.length > 0) {
      // 予選結果で決まった通過国のみ（開催国は別枠なので除外）
      picked.push(...prevAdvanced.filter(n => n !== hostNat && !picked.includes(n)).slice(0, slots))
      continue
    }
    const pool = allNats
      .filter(n => n !== hostNat && !picked.includes(n) && meetRegion(n) === region && (strengthByNat.get(n) ?? 0) > 0)
      .sort((a, b) => (strengthByNat.get(b) ?? 0) - (strengthByNat.get(a) ?? 0))
    // 開催国は地域枠を減らさない「+1」枠。各地域は定数どおり埋める。
    picked.push(...pool.slice(0, slots))
  }
  return picked
}

// ───────────────────────────────────────────────────────────────
// ミート（本番）シミュレーション：個人種目＋駅伝を実選手・持ちタイムで走らせ、
// メダル・得点・国別総合を出す。得点＝金5/銀3/銅2/入賞(8位以内)1。
// ───────────────────────────────────────────────────────────────
export const MEDAL_POINTS = { gold: 5, silver: 3, bronze: 2, finalist: 1 }

// メダル表記（金2 銀1 銅0）
export function formatMeetMedal(t: { golds: number; silvers: number; bronzes: number }): string {
  return `金${t.golds} 銀${t.silvers} 銅${t.bronzes}`
}

// 乱数（0..1）。Date/Math.randomはワークフローで禁止だが本番はアプリ実行時なので Math.random でOK。
const rnd = () => Math.random()
// レース当日のタイム：持ちタイムに-0.5%〜+3.5%の当日ブレ（PB更新は稀）
const raceTime = (pb: number) => pb * (1 + (rnd() * 0.04 - 0.005))

export type EventPlacing = { nat: Nationality; playerId: string; playerName: string; timeSec: number; rank: number }
export type WAIndividualResult = { event: WAEvent; placings: EventPlacing[] }
export type WAEkidenPlacing = { nat: Nationality; timeScore: number; rank: number; runnerIds: string[] }
export type WANationTotal = { nat: Nationality; points: number; golds: number; silvers: number; bronzes: number; rank: number }
export type WAMeetResult = {
  year: number
  individuals: WAIndividualResult[]
  ekiden: WAEkidenPlacing[]
  totals: WANationTotal[]
}

// 個人種目：参加標準を突破した各国の選手を集め、当日タイムで順位。
function runIndividual(players: Player[], nats: Nationality[], ev: WAEvent, year: number): WAIndividualResult {
  const entries: { nat: Nationality; p: Player; t: number }[] = []
  for (const nat of nats) {
    for (const e of individualEntrants(players, nat, ev, year)) {
      entries.push({ nat, p: e.player, t: raceTime(e.timeSec) })
    }
  }
  entries.sort((a, b) => a.t - b.t)
  const placings: EventPlacing[] = entries.map((e, i) => ({ nat: e.nat, playerId: e.p.id, playerName: e.p.name, timeSec: e.t, rank: i + 1 }))
  return { event: ev, placings }
}

// 駅伝：各国の駅伝代表（AI選抜20 or 手動）から上位7人の総合力で国別タイムスコア。個人種目スターは除外。
function runEkiden(players: Player[], nats: Nationality[], year: number, manual?: Partial<Record<Nationality, string[]>>): WAEkidenPlacing[] {
  const byId = new Map(players.map(p => [p.id, p]))
  const rows: WAEkidenPlacing[] = []
  for (const nat of nats) {
    const manualIds = manual?.[nat]
    let squad: Player[]
    if (manualIds && manualIds.length > 0) {
      squad = manualIds.map(id => byId.get(id)).filter((p): p is Player => !!p && p.status !== 'retired')
    } else {
      const cands = ekidenCandidates(players, nat, year)
      const stars = individualStarIds(players, nat, year)
      squad = autoSelectEkiden(cands, stars, 20)
    }
    const legs = squad.slice(0, 7)
    // 7人の距離スコア合計に当日ブレ。高いほど速い→順位は降順。
    const score = legs.reduce((s, p) => s + distanceScore(p, year) * (1 + (rnd() * 0.08 - 0.04)), 0)
    rows.push({ nat, timeScore: score, rank: 0, runnerIds: legs.map(p => p.id) })
  }
  rows.sort((a, b) => b.timeScore - a.timeScore)
  rows.forEach((r, i) => { r.rank = i + 1 })
  return rows
}

// メダル・入賞から得点を積む
function addPoints(totals: Map<Nationality, WANationTotal>, nat: Nationality, rank: number) {
  const cur = totals.get(nat) ?? { nat, points: 0, golds: 0, silvers: 0, bronzes: 0, rank: 0 }
  if (rank === 1) { cur.points += MEDAL_POINTS.gold; cur.golds += 1 }
  else if (rank === 2) { cur.points += MEDAL_POINTS.silver; cur.silvers += 1 }
  else if (rank === 3) { cur.points += MEDAL_POINTS.bronze; cur.bronzes += 1 }
  else if (rank <= 8) { cur.points += MEDAL_POINTS.finalist }
  totals.set(nat, cur)
}

// 個人種目3種（5000/10000/マラソン）の結果だけを出す（駅伝は実レースで別途走らせる）
export function simulateIndividuals(players: Player[], nats: Nationality[], year: number): WAIndividualResult[] {
  return WA_EVENTS.map(ev => runIndividual(players, nats, ev, year))
}

// 駅伝3戦の合計ポイントから予選の最終結果を組む（上位 advance カ国が通過）
export function composeQualifierResult(year: number, rows: { nat: Nationality; points: number }[], advance = 3): WAQualifierResult {
  const sorted = [...rows].sort((a, b) => b.points - a.points)
  const standings: QualStanding[] = sorted.map((r, i) => ({ nat: r.nat, strength: r.points, rank: i + 1, advanced: i < advance }))
  return { year, kind: 'qualifier', region: 'アジア＋オセアニア', standings, advanced: standings.filter(s => s.advanced).map(s => s.nat) }
}

// 個人種目の結果＋駅伝3戦の合計ポイントから本番の最終結果（メダル・総合）を組む
export function composeMainResult(
  year: number, host: Nationality, nations: Nationality[],
  individuals: WAIndividualResult[],
  ekidenRows: { nat: Nationality; points: number; runnerIds: string[] }[],
): WAMainResult {
  const sorted = [...ekidenRows].sort((a, b) => b.points - a.points)
  const ekiden: WAEkidenPlacing[] = sorted.map((r, i) => ({ nat: r.nat, timeScore: r.points, rank: i + 1, runnerIds: r.runnerIds }))
  const totals = new Map<Nationality, WANationTotal>()
  for (const nat of nations) totals.set(nat, { nat, points: 0, golds: 0, silvers: 0, bronzes: 0, rank: 0 })
  for (const ir of individuals) for (const pl of ir.placings) addPoints(totals, pl.nat, pl.rank)
  for (const ek of ekiden) addPoints(totals, ek.nat, ek.rank)
  const totalsArr = [...totals.values()].sort((a, b) => b.points - a.points || b.golds - a.golds || b.silvers - a.silvers)
  totalsArr.forEach((t, i) => { t.rank = i + 1 })
  const meet: WAMeetResult = { year, individuals, ekiden, totals: totalsArr }
  const japanRank = nations.includes('JPN') ? (totalsArr.find(t => t.nat === 'JPN')?.rank ?? null) : null
  return { year, kind: 'main', host, nations, meet, japanRank }
}

// 本番ミート全体（20カ国）。manual に国別の駅伝20人IDを渡すとその国はそれで走る（日本＝監督選抜）。
export function simulateWorldMeet(players: Player[], nats: Nationality[], year: number, manual?: Partial<Record<Nationality, string[]>>): WAMeetResult {
  const individuals = WA_EVENTS.map(ev => runIndividual(players, nats, ev, year))
  const ekiden = runEkiden(players, nats, year, manual)
  const totals = new Map<Nationality, WANationTotal>()
  for (const nat of nats) totals.set(nat, { nat, points: 0, golds: 0, silvers: 0, bronzes: 0, rank: 0 })
  for (const ir of individuals) for (const pl of ir.placings) addPoints(totals, pl.nat, pl.rank)
  for (const ek of ekiden) addPoints(totals, ek.nat, ek.rank)
  const totalsArr = [...totals.values()].sort((a, b) => b.points - a.points || b.golds - a.golds || b.silvers - a.silvers)
  totalsArr.forEach((t, i) => { t.rank = i + 1 })
  return { year, individuals, ekiden, totals: totalsArr }
}

// ───────────────────────────────────────────────────────────────
// 予選（アジア＋オセアニア）・2年周期の年次実行
// ───────────────────────────────────────────────────────────────
export type QualStanding = { nat: Nationality; strength: number; rank: number; advanced: boolean }
export type WAQualifierResult = { year: number; kind: 'qualifier'; region: 'アジア＋オセアニア'; standings: QualStanding[]; advanced: Nationality[] }
export type WAMainResult = { year: number; kind: 'main'; host: Nationality; nations: Nationality[]; meet: WAMeetResult; japanRank: number | null }
export type WAYearResult = WAQualifierResult | WAMainResult

// 開催国ローテ（2年ごと）。日本も入れてドラマを作る。
// 開催国は全実在国（バケツのEUR/FOREIGNを除く）で持ち回り。
// 定義順のままだとアジアの後にまたアジア…と同じ大陸が続いて不自然なので、
// 大陸をラウンドロビン（アジア→ヨーロッパ→アフリカ→アメリカ→オセアニア→…）で回しつつ、
// 各大陸内は固定シードの決定的シャッフルでバラす。初回2028年は日本開催。
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr]
  let s = seed >>> 0
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
export const WA_HOSTS: Nationality[] = (() => {
  const all = (Object.keys(NATIONALITY_META) as Nationality[]).filter(n => n !== 'EUR' && n !== 'FOREIGN')
  const order: GeoRegion[] = ['アジア', 'ヨーロッパ', 'アフリカ', 'アメリカ大陸', 'オセアニア']
  const byRegion = new Map<GeoRegion, Nationality[]>()
  for (const [i, region] of order.entries()) {
    const list = seededShuffle(all.filter(n => natGeoRegion(n) === region), 7770 + i * 131)
    byRegion.set(region, list)
  }
  // 日本を先頭へ（初回2028＝日本開催）
  const asia = byRegion.get('アジア')!
  byRegion.set('アジア', ['JPN', ...asia.filter(n => n !== 'JPN')])
  const out: Nationality[] = []
  let remaining = all.length
  let i = 0
  while (remaining > 0) {
    const region = order[i % order.length]
    const list = byRegion.get(region)!
    const nat = list.shift()
    if (nat) { out.push(nat); remaining-- }
    i++
    // 全リストが空になるまで回す（空の大陸はスキップ）
    if (i > 10000) break
  }
  return out
})()
export function hostForYear(year: number): Nationality {
  const idx = Math.max(0, Math.floor((year - 2028) / 2)) % WA_HOSTS.length
  return WA_HOSTS[idx]
}

// アジア＋オセアニア予選：国の距離力（当日ブレ込み）で並べ、上位 advance カ国が本番へ。
// 日本は選考した駅伝代表（japanSquadIds）の上位7人で戦う＝選考が予選の強さに直結する。
export function simulateQualifier(players: Player[], year: number, advance = 3, japanSquadIds?: string[]): WAQualifierResult {
  const nats = [...new Set(players.filter(p => p.status !== 'retired').map(p => p.nationality))] as Nationality[]
  const byId = new Map(players.map(p => [p.id, p]))
  const japanStrength = (): number => {
    if (!japanSquadIds || japanSquadIds.length === 0) return nationStrength(players, 'JPN', year)
    const squad = japanSquadIds.map(id => byId.get(id)).filter((p): p is Player => !!p && p.status !== 'retired')
    return squad.map(p => distanceScore(p, year)).sort((a, b) => b - a).slice(0, 7).reduce((s, v) => s + v, 0)
  }
  const rows = nats
    .filter(n => natGeoRegion(n) === 'アジア' || natGeoRegion(n) === 'オセアニア')
    .map(n => ({ nat: n, strength: (n === 'JPN' ? japanStrength() : nationStrength(players, n, year)) * (1 + (rnd() * 0.16 - 0.08)) }))
    .filter(r => r.strength > 0)
    .sort((a, b) => b.strength - a.strength)
  const standings: QualStanding[] = rows.map((r, i) => ({ nat: r.nat, strength: r.strength, rank: i + 1, advanced: i < advance }))
  return { year, kind: 'qualifier', region: 'アジア＋オセアニア', standings, advanced: standings.filter(s => s.advanced).map(s => s.nat) }
}

// その年の世界陸上を実行。偶数年＝本番、奇数年＝予選。
// japanSquadIds＝日本の駅伝代表（予選の強さ・本番の駅伝で使用）。
// prevAdvanced＝前年予選の通過国（本番のアジア＋オセ枠。通過してない国＝日本含む は出場できない）。
export function runWorldAthleticsYear(players: Player[], year: number, japanSquadIds?: string[], prevAdvanced?: Nationality[]): WAYearResult {
  const isMain = (year - 2028) % 2 === 0
  if (!isMain) return simulateQualifier(players, year, 3, japanSquadIds)
  const host = hostForYear(year)
  const nations = qualifyNations(players, year, host, prevAdvanced)
  const manual = japanSquadIds && japanSquadIds.length > 0 && nations.includes('JPN')
    ? { JPN: japanSquadIds } as Partial<Record<Nationality, string[]>>
    : undefined
  const meet = simulateWorldMeet(players, nations, year, manual)
  const japanRank = nations.includes('JPN') ? (meet.totals.find(t => t.nat === 'JPN')?.rank ?? null) : null
  return { year, kind: 'main', host, nations, meet, japanRank }
}
