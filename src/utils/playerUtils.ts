import type { Player, Specialty, Ratings, CardStatKey, Nationality } from '../types'
import { calcBaseAbility, calcAffinity, calcConditionModifier, safeRatings } from '../engine/raceEngine'
import { peakAgeOfCurve } from '../engine/ageCurve'
import { type ClubTier } from './clubTier'
import { appraiseMove, buildDestination, CONSENT_LINE } from './transferDecision'

/**
 * 記録や結果に「焼き込まれた名前」ではなく、いまの名前を返す。
 *
 * 記録を作った時点の名前を文字として保存しているため、選手の名前を変更すると
 * 過去の記録だけ古い名前のまま残ってしまう。表示のたびに選手IDから引き直せば、
 * すでに保存済みの記録もさかのぼって新しい名前で表示できる（保存データは触らない）。
 *
 * 選手データが見つからないとき（長期整理で消えた・引退した・海外選手・旧セーブでIDが無い）は、
 * 焼き込まれた名前をそのまま使う。記録が名無しになるのを防ぐため、ここは必ず残す。
 */
export function liveName(
  players: readonly { id: string; name: string }[],
  playerId: string | undefined,
  baked?: string,
): string {
  if (playerId) {
    const p = players.find(x => x.id === playerId)
    if (p) return p.name
  }
  return baked ?? ''
}

/**
 * 過去レースの区間配置・移籍履歴などで選手IDから「名前と国籍」を引く。
 *
 * 長期整理（シーズン終了時のセーブ整理）で削除された選手は players に居ないが、
 * removedPlayers に名前と国籍だけ残してある。顔は選手IDと国籍から自動生成しているので、
 * この2つがあれば名前も顔も従来どおり表示できる（選手詳細だけ開けない）。
 * 戻り値の isRemoved が true のときは長押しでの詳細表示を無効にする。
 */
export type PlayerLabel = { id: string; name: string; nationality: Nationality; isRemoved: boolean }
export function playerLabel(
  players: readonly Player[],
  removedPlayers: Record<string, [string, Nationality]> | undefined,
  playerId: string | undefined,
): PlayerLabel | undefined {
  if (!playerId) return undefined
  const p = players.find(x => x.id === playerId)
  if (p) return { id: p.id, name: p.name, nationality: p.nationality, isRemoved: false }
  const r = removedPlayers?.[playerId]
  if (r) return { id: playerId, name: r[0], nationality: r[1], isRemoved: true }
  return undefined
}

// ── 能力別ポテンシャル（各能力ごとの成長上限）──
// 単一の potential と特性から各能力の上限を導出する（保存はせず都度算出＝既存セーブもそのまま動く）。
// 得意能力は potential+α まで、苦手能力は低め。現在値を下回らない（既に高い能力は据え置き）。
export const SPEC_STRONG_STATS: Record<Specialty, CardStatKey[]> = {
  ace:           ['pacing', 'mental', 'stamina'],
  sprinter:      ['speed', 'pacing'],
  long:          ['stamina', 'mental', 'recovery'],
  mountain_up:   ['mountainUp', 'stamina'],
  mountain_down: ['mountainDown', 'speed'],
  // 起伏型は登りも下りもこなす。平坦の速さは伸びない
  undulating:    ['mountainUp', 'mountainDown', 'stamina'],
  allrounder:    ['speed', 'stamina', 'pacing'],
  kick:          ['speed', 'mental'],
  grinder:       ['stamina', 'recovery', 'mental'],
}
const ALL_STAT_KEYS: CardStatKey[] = ['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']

// 各能力の成長上限（内部の正確値）。得意 potential+9(最大99) / 苦手 potential-8、現在値未満にはしない。
// 得意と苦手の差を広げ、選手を尖らせる（例：スプリンターは速さ99・登り80台）。
// 平均は概ね potential 付近に収まるので OVR(=7能力平均)は potential 前後を維持。
// 文字列→安定な数値ハッシュ（選手ごと・能力ごとに固定のゆらぎを作る）。
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function getStatPotentials(p: Player): Ratings {
  const ratings = safeRatings(p.ratings) as Record<string, number>
  // マイプレイヤーは能力別の成長上限を明示指定（現在値未満にはしない・99天井）。ジュエル解放分は加算
  if (p.customCaps) {
    const out = {} as Ratings
    for (const stat of ALL_STAT_KEYS) {
      const boost = p.potentialBoosts?.[stat as CardStatKey] ?? 0
      const cap = (p.customCaps as Record<string, number>)[stat] ?? 0
      const cur = ratings[stat] ?? 0
      ;(out as Record<string, number>)[stat] = Math.min(99, Math.max(cur, cap + boost))
    }
    return out
  }
  const strong = new Set(SPEC_STRONG_STATS[p.specialty] ?? [])
  const out = {} as Ratings
  for (const stat of ALL_STAT_KEYS) {
    // 頭打ちを能力ごとに固定でずらす（同じ選手でも非得意が全部同じ値に揃わない）。id+statで決定的。
    const jitter = (hashStr(p.id + stat) % 9) - 6   // -6〜+2
    const boost = p.potentialBoosts?.[stat as CardStatKey] ?? 0   // ジュエルの上限解放分
    const ceil = (strong.has(stat) ? p.potential + 12 : p.potential - 5) + jitter + boost
    const cur = ratings[stat] ?? 0
    ;(out as Record<string, number>)[stat] = Math.min(99, Math.max(cur, Math.round(ceil)))
  }
  return out
}

// 上限解放のジュエルコスト（「現在の上限値」の帯で段階制）。99が天井。
// 79→80=100 / 80〜89→300 / 90〜94→1000 / 95以上→3000（X9→X0の境界で高くならない）
export function limitBreakCost(nextCap: number): number {
  const cur = nextCap - 1 // 現在の上限値基準で判定
  return cur >= 95 ? 3000 : cur >= 90 ? 1000 : cur >= 80 ? 300 : 100
}

// その能力が上限に達しているか（カード合成のブロック・表示用）。
export function isStatMaxed(p: Player, stat: CardStatKey): boolean {
  const cur = (safeRatings(p.ratings) as Record<string, number>)[stat] ?? 0
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
  undulating: '#66BB6A',
  sprinter: '#EC407A',
  long: '#7986CB',
  allrounder: '#9B97A8',
  kick: '#FF6B35',
  grinder: '#AB8ED6',
}

export function ovr(p: Player): number {
  // 引退選手は能力値を消してセーブを軽くしているので、保存してある引退時OVRを返す
  if (!p.ratings && p.finalOvr != null) return p.finalOvr
  // ratings が欠けたデータでも落とさない（欠損は0扱い＝OVRが下がるので気づける）
  const r = safeRatings(p.ratings)
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

// OVR→市場給与の「素体」(円)。非線形（スターほど跳ね上がる）。区分線形で下記アンカーを通す。
//
// 80以下は据え置き、80超だけ引き上げてある（90→7000万 / 95→1億 / 99→1.5億）。
// スターとその他の差を開かせるため。80以下を動かすと下位クラブがロスターを組めなくなる。
//
// ★年齢による割引はここには無い。年齢はカーブでOVRが下がることだけで効く
//   （前は年齢係数 0.55〜1.08 が別に掛かっていて、衰えが二重に効いていた）。
//   掛かるのは実績倍率(salaryPerfFactor・0.55〜1.45)だけ。
const SALARY_ANCHORS: [number, number][] = [
  [45, 3_000_000], [50, 4_000_000], [60, 6_000_000], [70, 10_000_000],
  [80, 30_000_000], [90, 70_000_000], [95, 100_000_000], [99, 150_000_000],
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

// ── 海外リーグ出場記録の圧縮 ──
// 選手ごとに { clubId, races, wins, rankSum, rankedRaces } と項目名を毎回書くと
// 1シーズンあたり約380KB、10年で約4MBになる。過去シーズンに送るときだけ
// 「クラブID → 選手ID → [出場, 区間賞, 順位合計, 順位カウント]」の形に詰め替えて約半分にする。
// 今季ぶん（毎レース書き足す）は今までどおりの形のまま。
// 読む側は必ず foreignAppsOf() を通すこと。旧セーブの古い形もそのまま読める。
export type ForeignApp = { clubId: string; races: number; wins: number; rankSum?: number; rankedRaces?: number }
export type ForeignAppsPacked = Record<string, Record<string, [number, number, number, number]>>
export type ForeignAppSeasonLike = {
  foreignAppearances?: Record<string, ForeignApp>
  foreignAppsC?: ForeignAppsPacked
}

const foreignAppsCache = new WeakMap<object, Record<string, ForeignApp>>()

/**
 * その年、誰がどの海外クラブにいたか。**在籍履歴の表示はこれを使う。**
 *
 * 出走数を数えるのは careerStats の仕事で、そちらは走行記録（Season.foreignRaces）から
 * 数え直す。表示側が出走数の集計に触ると、走行記録がある年と無い年で答えが食い違う。
 * ここは「どのクラブにいたか」だけを返すので、その心配がない。
 */
export function foreignClubsOf(s: ForeignAppSeasonLike | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [pid, a] of Object.entries(foreignAppsOf(s))) if (a.clubId) out[pid] = a.clubId
  return out
}

export function foreignAppsOf(s: ForeignAppSeasonLike | undefined): Record<string, ForeignApp> {
  if (!s) return {}
  if (s.foreignAppearances) return s.foreignAppearances
  const packed = s.foreignAppsC
  if (!packed) return {}
  const cached = foreignAppsCache.get(s as object)
  if (cached) return cached
  const out: Record<string, ForeignApp> = {}
  for (const [clubId, byPlayer] of Object.entries(packed)) {
    for (const [pid, v] of Object.entries(byPlayer)) {
      out[pid] = { clubId, races: v[0], wins: v[1], rankSum: v[2], rankedRaces: v[3] }
    }
  }
  foreignAppsCache.set(s as object, out)
  return out
}

export function packForeignApps(m: Record<string, ForeignApp>): ForeignAppsPacked {
  const out: ForeignAppsPacked = {}
  for (const [pid, a] of Object.entries(m)) {
    ;(out[a.clubId ?? ''] ??= {})[pid] = [a.races, a.wins, a.rankSum ?? 0, a.rankedRaces ?? 0]
  }
  return out
}

// ── 活躍データ（年俸と移籍金が共通で見る素材）──
// 出場割合・平均区間順位・今季の区間賞。国内リーグは races から、海外リーグは
// currentSeason.foreignAppearances から作る（どちらも同じ物差しで評価するため）。
// 区間順位は1区間につき1チーム1人なので 1〜20位。リーグ平均はちょうど10.5。
export type PerfProfile = {
  playFraction: number    // 今季の出場割合 0..1（チームの消化レース数に対する出走数）
  avgSegRank?: number     // 今季の平均区間順位。1度も走っていなければ undefined
  seasonSegWins: number   // 今季の区間賞
}

type SegRaceLike = { results?: { segmentResults: { runners: { playerId: string; rank: number }[] }[] } }

// 国内リーグの今季成績から活躍データを作る（MVP選考 utils/awards.ts と同じ集計軸）
export function seasonPerfProfile(playerId: string, races: readonly SegRaceLike[], teamRaces: number): PerfProfile {
  let apps = 0, rankSum = 0, segWins = 0
  for (const r of races) {
    if (!r.results) continue
    for (const seg of r.results.segmentResults) {
      const run = seg.runners.find(rn => rn.playerId === playerId)
      if (!run) continue
      apps++; rankSum += run.rank
      if (run.rank === 1) segWins++
    }
  }
  return {
    playFraction: teamRaces > 0 ? Math.min(1, apps / teamRaces) : 0,
    avgSegRank: apps > 0 ? rankSum / apps : undefined,
    seasonSegWins: segWins,
  }
}

// 海外リーグの今季成績（foreignAppearances の1件）から同じ形の活躍データを作る
export function foreignPerfProfile(
  entry: { races: number; wins: number; rankSum?: number; rankedRaces?: number } | undefined,
  teamRaces: number,
): PerfProfile | undefined {
  if (!entry) return undefined
  const ranked = entry.rankedRaces ?? 0
  return {
    playFraction: teamRaces > 0 ? Math.min(1, entry.races / teamRaces) : 0,
    avgSegRank: ranked > 0 ? (entry.rankSum ?? 0) / ranked : undefined,
    seasonSegWins: entry.wins,
  }
}

// 実績倍率（年俸用）。移籍金 calcTransferValue より意図的に弱く効かせる。
// 「値札(移籍金)は実績で大きく動いてよいが、給料はそこまで動かさない」という住み分け。
// 通算のカウントは移籍金側のおよそ半分の効きにし、合計を 0.55〜1.45 に収める。
export function salaryPerfFactor(p: Player, perf?: PerfProfile): number {
  const c = p.career
  // 通算実績（移籍金側は 出走+25% / 区間賞+15% / 優勝+8%回 / MVP+6%回）
  const appF   = 1 + Math.min((c?.totalRaces   ?? 0) * 0.002, 0.12)
  const segF   = 1 + Math.min((c?.segmentWins  ?? 0) * 0.007, 0.07)
  const champF = 1 + (c?.championships ?? 0) * 0.04
  const mvpF   = 1 + (c?.mvpAwards     ?? 0) * 0.03
  let f = appF * segF * champF * mvpF
  if (perf) {
    // 出場割合：出場0で0.6倍、6割以上出場で1.0倍
    f *= 0.6 + 0.4 * Math.min(1, perf.playFraction / 0.6)
    // 平均区間順位：1位で+15%、リーグ平均(10.5位)で±0、最下位(20位)で-15%
    if (perf.avgSegRank != null) {
      f *= 1 + 0.15 * Math.max(-1, Math.min(1, (10.5 - perf.avgSegRank) / 9.5))
    }
    // 今季の区間賞：1回+1%（上限+8%）
    f *= 1 + Math.min(perf.seasonSegWins * 0.01, 0.08)
  }
  return Math.max(0.55, Math.min(1.45, f))
}

// 市場給与＝素体(OVR×年齢)×実績倍率。
// 能力が落ちれば下がり（衰えを反映）、走って結果を出していれば上がる。
// perf を渡さない経路（CPUの更新・ドラフト・FA一括処理など）は通算実績だけで評価する。
export function faMarketSalary(p: Player, perf?: PerfProfile): number {
  // 年齢係数は廃止。衰えは年齢カーブでOVRが下がることだけで表す（二重に効かせない）
  return Math.round(ovrSalary(ovr(p)) * salaryPerfFactor(p, perf) / 500000) * 500000
}

// 選手がそのシーズンに何レース出場したか（データ判定用）
export type RaceLike = { results?: { segmentResults: { runners: { playerId: string }[] }[] } }
export function seasonAppearances(playerId: string, races: readonly RaceLike[]): number {
  let c = 0
  for (const r of races) {
    if (r.results?.segmentResults.some(s => s.runners.some(rn => rn.playerId === playerId))) c++
  }
  return c
}

// 主力かどうかを「データ」で判定（年俸ではなく、よく出場しているか）。
// playFraction=そのチームの消化レースに対する出場割合(0..1), teamRaces=消化レース数。
export function isDataKeyPlayer(_p: Player, playFraction: number, teamRaces: number): boolean {
  // 主力かどうかは「出場数」だけで判断する。
  // ・OVRの高さでは判断しない（高OVRでもあまり出ていないなら主力ではない＝普通に引き抜ける）
  // ・1軍/2軍の区分は廃止済み（ロスターはフラット）なので在籍区分では判断しない
  // 3戦以降で出場割合5.5割以上を主力とみなす（序盤は出場データが無いので主力扱いしない）。
  return teamRaces >= 3 && playFraction >= 0.55
}

type SeasonLike = { year: number; races?: readonly RaceLike[]; eclSeries?: { races?: readonly RaceLike[] } }

// 引き抜き耐性ステータス（複数年の本編駅伝 出場データ＋ECL経験で判定）。
//   'locked' = 完全に取れない（1年未満で本編3戦以下＝新人・データ不足を保護。いくら積んでも不可）
//   'key'    = 主力（引き抜きに割増1.8倍が必要／レンタル・トレードでも保護）
//   'open'   = 普通に動かせる
// P = その選手が本編に1度でも出場した過去シーズン数。
//   P>=3 : 直近3年の本編出場率 >= 60%
//   P=1〜2: 直近1年の出場率     >= 70%
//   P=0  : 在籍1年以上で本編出場ゼロ（リザーブのみ／出番なし）は主力外＝ open で動かしやすくする。
//          ドラフト当年の新人だけ、今季3戦以下の間は locked（データ不足で保護）。
//          4戦目以降は「直近3戦で2回以上出場」で主力。
//   ECL出場経験あり → 率の閾値を-0.10緩和 / P=0の必要回数を2→1に緩和。
// ・契約残1年以下 or 士気45未満は保護しない（不満・満了間近は普通に動く）。
export function keyPlayerStatus(player: Player, currentSeason: SeasonLike, pastSeasons: readonly SeasonLike[]): 'locked' | 'key' | 'open' {
  if (player.contract.yearsLeft <= 1 || (player.morale ?? 60) < 45) return 'open'

  // ECL出場経験（過去＋今季）→ 閾値を10%緩和
  const eclRaces: RaceLike[] = [
    ...pastSeasons.flatMap(s => [...(s.eclSeries?.races ?? [])]),
    ...(currentSeason.eclSeries?.races ?? []),
  ]
  const relief = seasonAppearances(player.id, eclRaces) > 0 ? 0.10 : 0

  // その選手が本編に1度でも出た過去シーズン（新しい順）
  const activePast = pastSeasons
    .filter(s => (s.races?.length ?? 0) > 0 && seasonAppearances(player.id, s.races ?? []) > 0)
    .slice()
    .sort((a, b) => b.year - a.year)
  const P = activePast.length

  const rateOver = (seasons: readonly SeasonLike[]) => {
    let apps = 0, total = 0
    for (const s of seasons) {
      apps += seasonAppearances(player.id, s.races ?? [])
      total += (s.races ?? []).filter(r => r.results).length
    }
    return total > 0 ? apps / total : 0
  }

  if (P >= 3) return rateOver(activePast.slice(0, 3)) >= (0.60 - relief) ? 'key' : 'open'
  if (P >= 1) return rateOver(activePast.slice(0, 1)) >= (0.70 - relief) ? 'key' : 'open'

  // P === 0：過去シーズンに本編出場が1度もない
  // 在籍1年以上でこれ＝リザーブ止まり or 出番なし。主力ではないので普通に動かせる（保護しない）。
  const tenure = currentSeason.year - (player.draftYear ?? currentSeason.year)
  if (tenure >= 1) return 'open'

  // ここから下はドラフト当年の新人のみ
  const done = (currentSeason.races ?? []).filter(r => r.results)
  if (done.length <= 3) return 'locked'   // 本編3戦以下＝データ不足で守る（いくら積んでも取れない）
  const last3 = done.slice(-3)
  const recentApps = last3.filter(r => (r.results?.segmentResults.some(sg => sg.runners.some(rn => rn.playerId === player.id))) ?? false).length
  const need = relief > 0 ? 1 : 2   // ECL経験ありなら1回でも主力
  return recentApps >= need ? 'key' : 'open'
}

/**
 * 移籍・トレードで動く選手本人が「移籍先クラブに行くことに納得するか」。
 *
 * ★判断の本体は utils/transferDecision.ts の appraiseMove 1本。ここはその窓口。
 *   行き先の姿（そのクラブで何番手か・ECLに出ているか・順位）が分かる呼び出し側は
 *   appraiseMove を直接使うこと。ここは「格しか分からない」古い経路のための入口で、
 *   序列が分からないぶんだけ判定が甘くなる。
 *
 * @param destTier 行き先クラブの格
 * @param srcTier  今の所属クラブの格。無所属（FA）は undefined ＝ 格差なしとして扱う
 * @param clubBlessed クラブ間で移籍金が合意済みの公認移籍。「主力だから残りたい」の減点が働かない
 */
export function playerConsentToMove(
  p: Player, destTier: ClubTier, srcTier: ClubTier | undefined,
  playFraction = 0.5, teamRaces = 0, consentBonus = 0, clubBlessed = false,
): { ok: boolean; reason: string } {
  const dest = buildDestination(String(destTier), destTier, [], {})
  const a = appraiseMove(p, dest, { srcTier, playFraction, teamRaces, bonus: consentBonus, clubBlessed })
  // 「主力だから残りたい」は行き先の情報とは別軸。ここだけ従来どおり残す
  const key = isDataKeyPlayer(p, playFraction, teamRaces) && !clubBlessed
  if (key && a.score - 0.3 < CONSENT_LINE) {
    return { ok: false, reason: `${p.name}は主力として起用されており、移籍を望んでいない` }
  }
  return { ok: a.ok, reason: a.ok ? '' : a.reason }
}

// フリー移籍の勧誘に本人が乗るか（接触の決断・接触中の契約更新拒否の判定を共有）。
// 通常の移籍同意より腰が重い（-0.2）＋現チームでの出場実績を必ず加味する。
// 出場している選手・愛着のある選手は基本残留し、干されている選手だけが出て行きやすい。
export function freeContactConsent(
  p: Player, suitorTier: ClubTier, srcTier: ClubTier | undefined, playFraction = 0.5, teamRaces = 0,
): boolean {
  return playerConsentToMove(p, suitorTier, srcTier, playFraction, teamRaces, -0.2).ok
}

/**
 * その選手のピーク年齢。**値段の判定はここを通す**。
 *
 * 中身は engine/ageCurve.ts の PEAK_AGE 1本（早熟22 / 普通27 / 晩成30）。
 * 以前ここに 24/27/30 という別の表を持っていたが、成長カーブ側は 22/27/30 なので
 * 早熟型だけ「実力はもう落ちているのに値段の下降が2年遅れる」ズレが出ていた。
 */
export function peakAgeOf(p: Pick<Player, 'growthCurve'>): number {
  return peakAgeOfCurve(p.growthCurve ?? 'normal')
}

/**
 * 移籍金の年齢倍率。移籍金＝市場年俸×これ。若いほど高く、伸びしろの値段になる。
 *   〜22歳 ×5 ／ 23〜27歳 ×4 ／ 28〜31歳 ×3 ／ 32歳〜 ×2
 */
export function transferFeeAgeMultiplier(age: number): number {
  return age <= 22 ? 5 : age <= 27 ? 4 : age <= 31 ? 3 : 2
}

/**
 * 移籍金（市場価値）。**移籍金を出すところは必ずこれを通すこと**。
 *
 *   移籍金 ＝ 市場年俸(faMarketSalary) × 年齢倍率 × 契約年数の係数
 *
 * ■ なぜ年俸を土台にするのか
 *   以前は OVR を2乗した独自の式で、年齢・ポテンシャル・実績の係数を年俸とは
 *   別に掛けていた。同じ選手の「値段」が年俸と移籍金で別々の式から出ていて、
 *   年俸を上げると移籍金は動かない、という食い違いが起きていた。
 *   いまは 年齢カーブ → OVR → 年俸 → 移籍金 の1本。年俸が上がれば移籍金も上がる。
 *
 * ■ 実績とポテンシャル
 *   実績倍率(0.55〜1.45)は faMarketSalary の中で既に効いているので、ここでは掛けない。
 *   ポテンシャル係数は廃止した。伸びしろは「若さ」で表す（年齢倍率がその役割）。
 *
 * ■ 契約年数
 *   残り契約が長いほど高い（最大+18%）。切れかけの選手は安く買える。
 */
export function calcTransferValue(p: Player, perf?: PerfProfile): number {
  const ctFactor = 1.0 + Math.min((p.contract.yearsLeft - 1) * 0.06, 0.18)
  const raw = faMarketSalary(p, perf) * transferFeeAgeMultiplier(p.age) * ctFactor
  return Math.round(raw / 1_000_000) * 1_000_000
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
  individualEvents?: { results?: unknown }[]
  eclSeries?: { races?: { results?: unknown }[] }
  scoutedOpponents?: { playerId: string; reqAt?: number; year: number }[]
}

// そのシーズンに消化したレース総数（リーグ戦＋記録会）。
// リザーブ（2軍リーグ）を廃止したので、その分は数えない。
/**
 * 今季これまでに「レースが何本済んだか」。**時間の進み方はここ1本。**
 *
 * ■なぜ要るのか
 *   交渉の期限・負傷の回復といった「あと何レース」を、全部 currentRaceIndex で数えていた。
 *   currentRaceIndex はリーグ戦の日程の何番目かなので、ECLを走っても記録会を走っても増えない。
 *   その結果、ECLと記録会のあいだは**時間が止まって**いた（打診の期限が減らない・ケガが治らない）。
 *   走ったのはレースなのだから、どれも1本と数える。
 *
 * ■currentRaceIndex と役割を分ける
 *   currentRaceIndex … 日程の何番目か（次にどのリーグ戦を走るか）
 *   racesConsumed    … 何本走ったか（期限・回復などの時間）
 *   同じ変数で兼ねていたのが原因なので、時間を数えるところは必ずこちらを使う。
 */
export function racesConsumed(season: ScoutSeasonLike): number {
  const ecl = (season.eclSeries?.races ?? []).filter(r => r.results).length
  return (season.currentRaceIndex ?? 0)
    + ecl
    + ((season.individualEvents ?? []).filter(e => e.results).length)
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

