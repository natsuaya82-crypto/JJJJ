// 世界選手権：代表選出エンジン（OVRではなく持ちタイム=eventBests基準）。
// 国籍で選手を集め、5000/10000/マラソンの持ちタイムで候補を作る。
// 駅伝優先：まず駅伝代表20人（監督 or AI）→ 個人種目は駅伝に入らなかった選手から
// 実物方式で選考（標準突破優先＋ランキング補充・国別3人・マラソン専任）。
import type { Player, Nationality, Race, WECRacePlan } from '../types'
import { natGeoRegion, NATIONALITY_META, type GeoRegion } from '../data/nationalities'
import { formatRaceTime, individualEventAbility, individualBaseTime } from '../utils/eventTime'
import { calcBaseAbility, calcAffinity } from './raceEngine'
import { runBackgroundRace } from './backgroundRace'
import { worldRace, worldRaceName } from '../utils/worldCourses'

export type WAEvent = 'd5000' | 'd10000' | 'marathon'
export const WA_EVENTS: WAEvent[] = ['d5000', 'd10000', 'marathon']
export const WA_EVENT_LABEL: Record<WAEvent, string> = { d5000: '5000m', d10000: '10000m', marathon: 'マラソン' }

// 参加標準記録（秒）。実際の世界選手権（東京2025）と同じ値。
// 突破者が優先で、余った枠は持ちタイム（ランキング）順で補充する（実物と同じ選考方式）。
export const WA_STANDARD: Record<WAEvent, number> = {
  d5000: 13 * 60 + 1,               // 13:01.00
  d10000: 27 * 60,                  // 27:00.00
  marathon: 2 * 3600 + 6 * 60 + 30, // 2:06:30
}

// 種目ごとの出場枠（ターゲットナンバー）。実物と同じ値（20カ国・国別3人以内なので実際はもっと絞られる）
export const WA_TARGET: Record<WAEvent, number> = { d5000: 42, d10000: 27, marathon: 100 }
// 1カ国から出せるのは1種目につき最大3人（実物と同じ）
export const WA_MAX_PER_NATION = 3

// 世界選手権／アジア予選の開催日（3戦）。
// JPELグランドファイナル(12/27)が終わったあとのオフシーズン開催なので、
// シーズン年の「翌年」1月に週1ペースで置く。日付を作るときは必ず year + 1 と組み合わせること。
export const WA_RACE_DATES = ['-01-09', '-01-16', '-01-23']
// 大会閉幕（結果ニュース）の日付。最終戦の翌日。
export const WA_CLOSING_DATE = '-01-24'
/** 第i戦の日付。year はシーズン年（＝大会の呼び名の年）。 */
export function waRaceDate(year: number, i: number): string {
  return `${year + 1}${WA_RACE_DATES[i] ?? WA_RACE_DATES[0]}`
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
// 種目 → 距離(m)。推定タイムの換算に使う
const WA_DIST: Record<WAEvent, 5000 | 10000 | 42195> = { d5000: 5000, d10000: 10000, marathon: 42195 }

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
    if (!has) {
      // 直近2年の持ちタイムが無い選手は、能力からの推定タイムで候補に入れる。
      // 海外クラブの日本人は出られる記録会が少なく eventBests がほぼ残らないため、
      // タイム必須のままだと日本最強クラス（OVR91等）が候補50人にすら入れない。
      // 推定は基準タイム+2%として、実測の持ちタイムを持つ選手より少しだけ弱く扱う
      for (const ev of WA_EVENTS) {
        const dist = WA_DIST[ev]
        bests[ev] = Math.round(individualBaseTime(individualEventAbility(p, dist), dist) * 1.02)
      }
    }
    // スコアは組み上げた bests から計算する（推定タイムの選手も同じ土俵で並べるため）。
    // 実測の選手は distanceScore(p) と同じ値になる
    let score = 0
    for (const ev of WA_EVENTS) {
      const t = bests[ev]
      if (t == null) continue
      const v = WA_REF[ev] / t
      if (v > score) score = v
    }
    out.push({ player: p, score, bests })
  }
  out.sort((a, b) => b.score - a.score)
  return out.slice(0, limit)
}

// 日本代表の候補50人＝持ちタイム上位40＋大会適性上位10。
// 持ちタイムだけだと登り屋・下り屋（平地タイムが平凡）が候補にすら入らないため、
// その年の3戦のコース地形への適性（能力×特性相性）上位を必ず混ぜる。山型の年は登り屋が入る
export function ekidenCandidatesWithFit(
  players: Player[], nat: Nationality, year: number, plans: WECRacePlan[], limit = 50, fitSlots = 10,
): Candidate[] {
  const all = ekidenCandidates(players, nat, year, Number.MAX_SAFE_INTEGER)
  if (plans.length === 0 || all.length <= limit) return all.slice(0, limit)
  const timePick = all.slice(0, limit - fitSlots)
  const picked = new Set(timePick.map(c => c.player.id))
  const segs = plans.flatMap(p => p.segments)
  const fit = (c: Candidate) => segs.reduce((s, seg) =>
    s + calcBaseAbility(c.player.ratings, seg.uphillPct, seg.downhillPct, seg.distanceKm)
      * calcAffinity(c.player.specialty, seg.uphillPct, seg.downhillPct, seg.distanceKm), 0)
  const fitPick = all.filter(c => !picked.has(c.player.id))
    .sort((a, b) => fit(b) - fit(a))
    .slice(0, fitSlots)
  return [...timePick, ...fitPick].sort((a, b) => b.score - a.score)
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

// ───────────────────────────────────────────────────────────────
// 個人種目の出場者選考（実物の世界選手権方式）
//   ・標準突破者をタイム順で優先し、枠（ターゲットナンバー）が余ればランキング＝持ちタイム順で補充
//   ・1カ国1種目 最大3人
//   ・マラソンはマラソン専任（一番得意な種目がマラソンの選手だけ）。5000mと10000mの掛け持ちは可
// ───────────────────────────────────────────────────────────────
export type FieldEntry = { nat: Nationality; player: Player; timeSec: number; byStandard: boolean }

// 一番得意な種目（WA_REF比のスコア最大）がマラソンかどうか。トラックとの掛け持ち禁止の判定に使う
function isMarathonPrimary(p: Player, year: number): boolean {
  let bestEv: WAEvent | null = null
  let bestS = 0
  for (const ev of WA_EVENTS) {
    const t = recentBest(p, ev, year)
    if (t == null) continue
    const s = WA_REF[ev] / t
    if (s > bestS) { bestS = s; bestEv = ev }
  }
  return bestEv === 'marathon'
}

// 出場国全体から各種目の出場者リスト（フィールド）を確定する。
// excludeIds は駅伝に専念させたい選手（日本の手動代表など）で、個人種目からは外す
export function selectIndividualFields(players: Player[], nats: Nationality[], year: number, excludeIds?: Set<string>): Record<WAEvent, FieldEntry[]> {
  const natSet = new Set(nats)
  const out = {} as Record<WAEvent, FieldEntry[]>
  for (const ev of WA_EVENTS) {
    const cands: FieldEntry[] = []
    for (const p of players) {
      if (p.status === 'retired' || !natSet.has(p.nationality)) continue
      if (excludeIds?.has(p.id)) continue
      const t = recentBest(p, ev, year)
      if (t == null) continue
      const marPrimary = isMarathonPrimary(p, year)
      if (ev === 'marathon' ? !marPrimary : marPrimary) continue
      cands.push({ nat: p.nationality, player: p, timeSec: t, byStandard: t <= WA_STANDARD[ev] })
    }
    // 標準突破者（タイム順）→ ランキング補充（タイム順）
    cands.sort((a, b) => (Number(b.byStandard) - Number(a.byStandard)) || a.timeSec - b.timeSec)
    const perNat = new Map<Nationality, number>()
    const field: FieldEntry[] = []
    for (const c of cands) {
      if (field.length >= WA_TARGET[ev]) break
      const n = perNat.get(c.nat) ?? 0
      if (n >= WA_MAX_PER_NATION) continue
      perNat.set(c.nat, n + 1)
      field.push(c)
    }
    out[ev] = field
  }
  return out
}

// フィールド全種目の出場選手ID（駅伝メンバーからの除外用）
export function entrantIdSet(fields: Record<WAEvent, FieldEntry[]>): Set<string> {
  const ids = new Set<string>()
  for (const ev of WA_EVENTS) for (const e of fields[ev]) ids.add(e.player.id)
  return ids
}

// ある国の「個人種目で選考圏内」の選手ID（標準突破・国別上位3・マラソン専任適用後）。
// ランキング補充分は他国が揃わないと確定しないため含めない（代表ページの選考バッジ用の近似）
export function individualStarIds(players: Player[], nat: Nationality, currentYear: number): Set<string> {
  const fields = selectIndividualFields(players, [nat], currentYear)
  const ids = new Set<string>()
  for (const ev of WA_EVENTS) for (const e of fields[ev]) if (e.byStandard) ids.add(e.player.id)
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
// 世界選手権の選考地域（アジアとオセアニアは1枠グループに統合）
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
export function qualifyNations(players: Player[], year: number, hostNat: Nationality, prevAdvanced?: Nationality[], continentals?: { region: string; advanced: Nationality[] }[]): Nationality[] {
  const allNats = ([...new Set(players.filter(p => p.status !== 'retired').map(p => p.nationality))] as Nationality[])
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
    // 前年に裏で回した大陸予選の結果があればそれを使う（欧州・アフリカ・アメリカ）
    const cont = continentals?.find(c => c.region === region)
    if (cont && cont.advanced.length > 0) {
      picked.push(...cont.advanced.filter(n => n !== hostNat && !picked.includes(n)).slice(0, slots))
      // 大陸予選通過国が開催国重複等で不足したら国力順で補充
      const shortfall = slots - cont.advanced.filter(n => n !== hostNat).length
      if (shortfall > 0) {
        const fill = allNats.filter(n => n !== hostNat && !picked.includes(n) && meetRegion(n) === region && (strengthByNat.get(n) ?? 0) > 0)
          .sort((a, b) => (strengthByNat.get(b) ?? 0) - (strengthByNat.get(a) ?? 0))
        picked.push(...fill.slice(0, shortfall))
      }
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

// 大陸予選の呼称（本戦=世界選手権、アジア=世界選手権アジア予選 に合わせた地域別の予選名）
export const CONT_QUAL_LABEL: Record<'アフリカ' | 'ヨーロッパ' | 'アメリカ大陸', string> = {
  ヨーロッパ: 'ユーロ予選',
  アフリカ: 'アフリカ予選',
  アメリカ大陸: 'アメリカ予選',
}

/** レースIDに使う地域の記号（同じコースを同じ日に4地域が走るのでIDを分ける） */
export const CONT_REGION_CODE: Record<'アフリカ' | 'ヨーロッパ' | 'アメリカ大陸', string> = {
  アフリカ: 'afr',
  ヨーロッパ: 'eur',
  アメリカ大陸: 'ame',
}

/** 地域の記号（Season.waRaces のキー）→ 大会名。走行記録から大会名を出すのはここ1本 */
export const CONT_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  (Object.keys(CONT_QUAL_LABEL) as (keyof typeof CONT_QUAL_LABEL)[]).map(r => [CONT_REGION_CODE[r], CONT_QUAL_LABEL[r]]),
)

export type ContinentalQualResult = {
  region: 'アフリカ' | 'ヨーロッパ' | 'アメリカ大陸'
  standings: { nat: Nationality; rank: number; points?: number }[]
  advanced: Nationality[]
  squads: Record<string, string[]>   // nat_XXX → 選出された駅伝代表20人（パッチ・代表履歴の元）
  /**
   * 開催中の3戦。**大会が終わったら外して Season.waRaces へ移す**（stripContRaces）。
   * 走行記録をこちら側に残すと worldAthleticsResults ＝普段のセーブに入りっぱなしになり、
   * 予選年ごとに121KBずつ増え続ける。記録の置き場所は他の大会と同じくシーズンの側。
   */
  races?: Race[]
  /** 3戦の合計得点（nat_XXX → 得点）。決着したら standings に落とす */
  points?: Record<string, number>
}

// ───────────────────────────────────────────────────────────────
// 大陸予選（欧州・アフリカ・アメリカ）
//
// ■ 昔どうだったか
//   レースをせず、国力（上位7人の持ちタイム合計）× 当日ブレ±8% で順位を決め打ちしていた。
//   ところが国力は全16か国が 6.73〜6.90 に潰れており（幅2.5%）、ブレのほうが3倍大きい。
//   結果、通過国は**実質くじ引き**になっていた。実測（scripts/measure-continental.ts）で
//     ケニアの通過率45% / エチオピア46%、アメリカ大陸ではジャマイカが通過率トップ
//   という状態。代表20人の平均OVRで並べるとケニア88.8〜ナイジェリア82.3と6.5点の差が
//   あるので、**走らせれば差が出る**。だからアジア予選と同じく実レースにした。
//
// ■ アジア予選との違いは「プレイヤーが見るかどうか」だけ
//   同じ年・同じコース・同じ3戦・同じ得点で決まる。地域をまたいでタイムを比べられる。
//   走らせ方は engine/backgroundRace の1本（裏の部・海外リーグ・ECLと同じ）。
// ───────────────────────────────────────────────────────────────

/** その地域で予選に出る国（その国籍の選手が居る国だけ） */
function contNations(players: Player[], region: string, year: number): Nationality[] {
  const allNats = ([...new Set(players.filter(p => p.status !== 'retired').map(p => p.nationality))] as Nationality[])
  return allNats.filter(n => meetRegion(n) === region && nationStrength(players, n, year) > 0)
}

/**
 * 大陸予選を開幕させる：参加国・代表20人・3戦のコースを決める（まだ走らない）。
 * コースはアジア予選と同じ plans を渡すこと（地域をまたいでタイムを比べるため）。
 */
export function startContinentalQualifiers(players: Player[], year: number, plans: WECRacePlan[]): ContinentalQualResult[] {
  const out: ContinentalQualResult[] = []
  for (const { region } of REGION_QUOTA) {
    if (region === 'アジア+オセアニア') continue
    const nats = contNations(players, region, year)
    // 各国の駅伝代表20人。個人種目スターは除外せず駅伝に全振り（予選は駅伝のみ）。
    // アジア予選と同じく「持ちタイム14人＋コース適性6人」で選ぶ（山のコースで登り屋が居ない代表を防ぐ）
    const squads: Record<string, string[]> = {}
    for (const n of nats) {
      const cands = ekidenCandidatesWithFit(players, n, year, plans, 20, 6)
      squads[`nat_${n}`] = autoSelectEkiden(cands, new Set<string>(), 20).map(p => p.id)
    }
    const races = plans.map((plan, i) => worldRace(plan, {
      id: `wa-${year}-r${i + 1}@${CONT_REGION_CODE[region]}`,
      name: worldRaceName(plan, CONT_QUAL_LABEL[region], `${year} ${CONT_QUAL_LABEL[region]} 第${i + 1}戦`),
      date: waRaceDate(year, i),
    }))
    out.push({ region, standings: [], advanced: [], squads, races, points: {} })
  }
  return out
}

/** 大陸予選を1戦進める。アジア予選の第i戦と同じタイミングで呼ぶ */
export function advanceContinentalQualifiers(
  conts: ContinentalQualResult[], raceIndex: number, players: Player[],
): ContinentalQualResult[] {
  return conts.map(c => {
    const race = c.races?.[raceIndex]
    if (!race) return c
    const byId = new Map(players.map(p => [p.id, p]))
    const out = runBackgroundRace({
      race, players, seasonProgress: 0.7,
      entrants: Object.entries(c.squads).map(([natId, ids]) => ({
        id: natId,
        roster: ids.map(id => byId.get(id)).filter((p): p is Player => !!p && p.status !== 'retired'),
      })),
    })
    const points = { ...(c.points ?? {}) }
    for (const [id, pt] of Object.entries(out.points)) points[id] = (points[id] ?? 0) + pt
    return { ...c, points, races: c.races!.map((r, i) => (i === raceIndex ? out.race : r)) }
  })
}

/** 3戦の合計得点で順位と通過国を確定する */
export function finishContinentalQualifiers(conts: ContinentalQualResult[]): ContinentalQualResult[] {
  return conts.map(c => {
    // 走っていないのに通過国が決まっているのは、実レースにする前のセーブで開幕した大会。
    // その年はもう決着しているので、得点0で並べ直して塗り替えてはいけない
    if (!(c.races ?? []).some(r => r.results) && c.advanced.length > 0) return c
    const slots = REGION_QUOTA.find(q => q.region === c.region)?.slots ?? 0
    const standings = Object.keys(c.squads)
      .map(natId => ({ nat: natId.slice(4) as Nationality, points: c.points?.[natId] ?? 0 }))
      .sort((a, b) => b.points - a.points)
      .map((r, i) => ({ ...r, rank: i + 1 }))
    return { ...c, standings, advanced: standings.slice(0, slots).map(s => s.nat) }
  })
}

/** 走り終えた3戦を、シーズンへ移すための形（地域の記号 → レース）で取り出す */
export function contRacesOf(conts: ContinentalQualResult[]): Record<string, Race[]> {
  const out: Record<string, Race[]> = {}
  for (const c of conts) {
    const done = (c.races ?? []).filter(r => r.results)
    if (done.length > 0) out[CONT_REGION_CODE[c.region]] = done
  }
  return out
}

/** 恒久保存する側から走行記録を外す（記録は Season.waRaces にある） */
export function stripContRaces(conts: ContinentalQualResult[]): ContinentalQualResult[] {
  return conts.map(({ races: _races, points: _points, ...rest }) => rest)
}

/**
 * 開幕から決着までを一度に回す。**判定は上の3本と同じ**（合成しているだけ）。
 * 大陸予選を持っていない古いセーブが本戦の枠を決めるときの保険用。
 */
export function runContinentalQualifiers(players: Player[], year: number, plans: WECRacePlan[]): ContinentalQualResult[] {
  let conts = startContinentalQualifiers(players, year, plans)
  for (let i = 0; i < plans.length; i++) conts = advanceContinentalQualifiers(conts, i, players)
  return finishContinentalQualifiers(conts)
}

// ───────────────────────────────────────────────────────────────
// ミート（本番）シミュレーション：個人種目＋駅伝を実選手・持ちタイムで走らせ、
// メダル・得点・国別総合を出す。得点＝金5/銀3/銅2/入賞(8位以内)1。
// ───────────────────────────────────────────────────────────────
export const MEDAL_POINTS = { gold: 5, silver: 3, bronze: 2, finalist: 1 }
// 駅伝は花形＝個人1種目より重い。「区間ポイント（各区間の区間順位）」＋「総合順位ボーナス」の合算。
//  区間ポイント: 各区間の区間賞=3 / 2位=2 / 3位=1（全3戦の全区間で加算）
//  総合ボーナス: 駅伝総合1位=10 / 2位=6 / 3位=4 / 4〜8位=2
export const EKIDEN_SEG_POINTS = [0, 3, 2, 1]  // index=区間順位（1..3）
export const EKIDEN_TOTAL_POINTS = { first: 10, second: 6, third: 4, finalist: 2 }

// 全3戦の各区間で区間順位に応じたポイントを国別に合算する
export function ekidenSegmentPoints(races: { results?: { segmentResults: { runners: { teamId: string; rank?: number }[] }[] } }[]): Map<Nationality, number> {
  const pts = new Map<Nationality, number>()
  for (const race of races) {
    for (const sr of race.results?.segmentResults ?? []) {
      for (const run of sr.runners) {
        if (!run.teamId.startsWith('nat_')) continue
        const p = EKIDEN_SEG_POINTS[run.rank ?? 99] ?? 0
        if (p > 0) { const nat = run.teamId.slice(4) as Nationality; pts.set(nat, (pts.get(nat) ?? 0) + p) }
      }
    }
  }
  return pts
}

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

// 個人種目3種（5000/10000/マラソン）の結果だけを出す（駅伝は実レースで別途走らせる）。
// 出場者は selectIndividualFields で確定済みのフィールドを使う（標準突破優先＋ランキング補充・国別3・マラソン専任）
export function simulateIndividuals(fields: Record<WAEvent, FieldEntry[]>): WAIndividualResult[] {
  return WA_EVENTS.map(ev => {
    const entries = fields[ev].map(e => ({ nat: e.nat, p: e.player, t: raceTime(e.timeSec) }))
    entries.sort((a, b) => a.t - b.t)
    const placings: EventPlacing[] = entries.map((e, i) => ({ nat: e.nat, playerId: e.p.id, playerName: e.p.name, timeSec: e.t, rank: i + 1 }))
    return { event: ev, placings }
  })
}

// 駅伝3戦の合計ポイントから予選の最終結果を組む（上位 advance カ国が通過）
export function composeQualifierResult(year: number, rows: { nat: Nationality; points: number }[], advance = 3, host?: Nationality): WAQualifierResult {
  const sorted = [...rows].sort((a, b) => b.points - a.points)
  const standings: QualStanding[] = sorted.map((r, i) => ({ nat: r.nat, strength: r.points, rank: i + 1, advanced: i < advance }))
  return { year, kind: 'qualifier', region: 'アジア＋オセアニア', host, standings, advanced: standings.filter(s => s.advanced).map(s => s.nat) }
}

// 個人種目の結果＋駅伝3戦の合計ポイントから本番の最終結果（メダル・総合）を組む
export function composeMainResult(
  year: number, host: Nationality, nations: Nationality[],
  individuals: WAIndividualResult[],
  ekidenRows: { nat: Nationality; points: number; runnerIds: string[] }[],
  ekidenSegPts?: Map<Nationality, number>,   // 各国の駅伝区間ポイント合計（無ければ0）
): WAMainResult {
  const sorted = [...ekidenRows].sort((a, b) => b.points - a.points)
  const ekiden: WAEkidenPlacing[] = sorted.map((r, i) => ({ nat: r.nat, timeScore: r.points, rank: i + 1, runnerIds: r.runnerIds }))
  const totals = new Map<Nationality, WANationTotal>()
  for (const nat of nations) totals.set(nat, { nat, points: 0, golds: 0, silvers: 0, bronzes: 0, rank: 0 })
  // 個人種目：金5/銀3/銅2/入賞1（メダルもカウント）
  for (const ir of individuals) for (const pl of ir.placings) addPoints(totals, pl.nat, pl.rank)
  // 駅伝：総合順位ボーナス（メダルもカウント）＋区間ポイント合計
  for (const ek of ekiden) {
    const cur = totals.get(ek.nat)
    if (!cur) continue
    if (ek.rank === 1) { cur.points += EKIDEN_TOTAL_POINTS.first; cur.golds += 1 }
    else if (ek.rank === 2) { cur.points += EKIDEN_TOTAL_POINTS.second; cur.silvers += 1 }
    else if (ek.rank === 3) { cur.points += EKIDEN_TOTAL_POINTS.third; cur.bronzes += 1 }
    else if (ek.rank <= 8) { cur.points += EKIDEN_TOTAL_POINTS.finalist }
    cur.points += ekidenSegPts?.get(ek.nat) ?? 0
  }
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
// races: 駅伝3戦の実レース結果。ECLのeclSeriesと同じ扱いで保持し、選手詳細の駅伝データ等に使う
// squads: 選出された駅伝代表20人（participantId nat_XXX → playerId[]）。チームタブの代表表示・0走代表の履歴用
// bestPlayer: 年間アジア最優秀選手（予選3戦すべてに出走し区間順位平均が最良の選手。パッチの元）
export type WAQualifierResult = { year: number; kind: 'qualifier'; region: 'アジア＋オセアニア'; host?: Nationality; standings: QualStanding[]; advanced: Nationality[]; races?: import('../types').Race[]; squads?: Record<string, string[]>; bestPlayer?: { playerId: string; nat: Nationality; avgRank: number }; continentals?: ContinentalQualResult[] }
export type WAMainResult = { year: number; kind: 'main'; host: Nationality; nations: Nationality[]; meet: WAMeetResult; japanRank: number | null; races?: import('../types').Race[]; squads?: Record<string, string[]> }
export type WAYearResult = WAQualifierResult | WAMainResult

// 開催国ローテ（2年ごと）。日本も入れてドラマを作る。
// 開催国は全実在国で持ち回り。
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
  const all = (Object.keys(NATIONALITY_META) as Nationality[])
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

// 予選（世界選手権アジア予選）の開催国ローテ：アジア＋オセアニアの国で持ち回り。
// 本番と同じ固定シードの決定的シャッフルで順番を決める（2027が初回）。
// 2028本番が日本開催なので、予選初回が日本だと連続開催になり不自然→日本が先頭なら後ろへずらす
export const QUAL_HOSTS: Nationality[] = (() => {
  const list = seededShuffle(
    (Object.keys(NATIONALITY_META) as Nationality[])
      .filter(n => { const g = natGeoRegion(n); return g === 'アジア' || g === 'オセアニア' }),
    4210,
  )
  const jpnIdx = list.indexOf('JPN')
  if (jpnIdx === 0) { list.splice(0, 1); list.splice(3, 0, 'JPN') }
  return list
})()
export function qualHostForYear(year: number): Nationality {
  const idx = Math.max(0, Math.floor((year - 2027) / 2)) % QUAL_HOSTS.length
  return QUAL_HOSTS[idx]
}

// 開催国の地形プロファイル。コース生成に反映して「山の国＝起伏の激しいコース、平坦な国＝スピードコース」にする
export type HostTerrain = 'mountain' | 'flat' | 'mixed'
export const WA_HOST_TERRAIN: Partial<Record<Nationality, HostTerrain>> = {
  // 山岳・高地の国
  NEP: 'mountain', MGL: 'mountain', KAZ: 'mountain', SUI: 'mountain', AUT: 'mountain', NOR: 'mountain',
  ETH: 'mountain', KEN: 'mountain', UGA: 'mountain', ERI: 'mountain', RWA: 'mountain', BDI: 'mountain',
  ZIM: 'mountain', RSA: 'mountain', MEX: 'mountain', COL: 'mountain', ECU: 'mountain', PER: 'mountain',
  BOL: 'mountain', GUA: 'mountain',
  // 平坦・都市型コースの国
  SGP: 'flat', HKG: 'flat', THA: 'flat', VIE: 'flat', MAS: 'flat', IND: 'flat', SRI: 'flat',
  BRN: 'flat', QAT: 'flat', KSA: 'flat', NED: 'flat', DEN: 'flat', BEL: 'flat', POL: 'flat',
  GER: 'flat', FRA: 'flat', GBR: 'flat', IRL: 'flat', FIN: 'flat', SWE: 'flat', URU: 'flat',
  ARG: 'flat', JAM: 'flat', CUB: 'flat', CRC: 'flat', PHI: 'flat', TWN: 'flat',
  // それ以外は mixed（従来のランダム）
}
export function hostTerrain(nat: Nationality): HostTerrain {
  return WA_HOST_TERRAIN[nat] ?? 'mixed'
}

// 開催都市（レース名「2030 世界選手権 テグ 第1戦」用）。各国の代表的な陸上開催都市
export const WA_HOST_CITY: Partial<Record<Nationality, string>> = {
  JPN: '東京', KOR: 'テグ', CHN: '北京', TWN: '台北', HKG: '香港', MGL: 'ウランバートル',
  THA: 'バンコク', VIE: 'ハノイ', INA: 'ジャカルタ', MAS: 'クアラルンプール', PHI: 'マニラ', SGP: 'シンガポール',
  IND: 'ニューデリー', SRI: 'コロンボ', NEP: 'カトマンズ', KAZ: 'アスタナ',
  BRN: 'マナーマ', QAT: 'ドーハ', KSA: 'リヤド',
  AUS: 'シドニー', NZL: 'オークランド',
  ETH: 'アディスアベバ', KEN: 'ナイロビ', UGA: 'カンパラ', TAN: 'ダルエスサラーム', MAR: 'ラバト',
  ERI: 'アスマラ', RSA: 'ケープタウン', RWA: 'キガリ', BDI: 'ブジュンブラ', ALG: 'アルジェ',
  DJI: 'ジブチ', SOM: 'モガディシュ', SDN: 'ハルツーム', TUN: 'チュニス', ZIM: 'ハラレ', NGA: 'ラゴス',
  GBR: 'ロンドン', GER: 'ベルリン', FRA: 'パリ', ITA: 'ローマ', ESP: 'バルセロナ', NED: 'アムステルダム',
  SWE: 'ストックホルム', DEN: 'コペンハーゲン', AUT: 'ウィーン', POR: 'リスボン', NOR: 'オスロ',
  BEL: 'ブリュッセル', SUI: 'チューリッヒ', POL: 'ワルシャワ', IRL: 'ダブリン', FIN: 'ヘルシンキ',
  USA: 'ユージーン', CAN: 'トロント', MEX: 'メキシコシティ', BRA: 'リオデジャネイロ', COL: 'ボゴタ',
  ARG: 'ブエノスアイレス', ECU: 'キト', PER: 'リマ', CHI: 'サンティアゴ', URU: 'モンテビデオ',
  VEN: 'カラカス', GUA: 'グアテマラシティ', BOL: 'ラパス', CRC: 'サンホセ', CUB: 'ハバナ', JAM: 'キングストン',
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

// その年の世界選手権を実行。偶数年＝本番、奇数年＝予選。
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
