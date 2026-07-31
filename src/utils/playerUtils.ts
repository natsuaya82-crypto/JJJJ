import type { Player, Specialty, Ratings, CardStatKey, Nationality } from '../types'
import { calcBaseAbility, calcAffinity, calcConditionModifier, safeRatings } from '../engine/raceEngine'

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
// 2046調整: 90以上を寝かせた（旧 90→5000万 / 95→8000万 / 99→1億）。
// ここに実績倍率(salaryPerfFactor・上限1.45)が掛かるので、素体を据え置くと実額が1億超になってしまう。
// 圧縮後は実額でリーグ最高が8000万前後、理論上限(OVR99×上限倍率)でちょうど1億に収まる。
// 80以下は国内初期ロスターの年俸配分がこの帯に較正されているので触らない。
const SALARY_ANCHORS: [number, number][] = [
  [45, 3_000_000], [50, 4_000_000], [60, 6_000_000], [70, 10_000_000],
  [80, 30_000_000], [90, 45_000_000], [95, 55_000_000], [99, 70_000_000],
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
  const age = p.age
  const ageFactor = age <= 23 ? 1.08 : age <= 27 ? 1.0 : age <= 30 ? 0.9 : age <= 33 ? 0.72 : 0.55
  return Math.round(ovrSalary(ovr(p)) * ageFactor * salaryPerfFactor(p, perf) / 500000) * 500000
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
export function isDataKeyPlayer(_p: Player, playFraction: number, teamRaces: number): boolean {
  // 主力かどうかは「出場数」だけで判断する。
  // ・OVRの高さでは判断しない（高OVRでもあまり出ていないなら主力ではない＝普通に引き抜ける）
  // ・1軍/2軍の区分は廃止済み（ロスターはフラット）なので在籍区分では判断しない
  // 3戦以降で出場割合5.5割以上を主力とみなす（序盤は出場データが無いので主力扱いしない）。
  return teamRaces >= 3 && playFraction >= 0.55
}

// ── リザーブリーグの出場資格：「1軍の主力」判定 ──
// 引き抜き耐性(keyPlayerStatus)と同じ「複数年の出場率」で決める。ただし契約残・士気による
// 抜け道（引き抜き専用のルール）は入れないので、契約最終年の主力もリザーブには出せない。
// 数えるのは本編リーグと海外リーグだけ。ECL・リザーブ・世界選手権・大学は分母にも分子にも入れない
// （ECLは出場枠が狭くて率が暴れる／リザーブを数えると若手が出ただけで主力になってしまう）。
// 出場歴のあるシーズンが無い＝1年目・新人は主力扱いしない（自由にリザーブへ出せる）。
export const RESERVE_MAIN_RATE = 0.60      // この率以上で1軍の主力＝リザーブ不可
const RESERVE_MIN_SAMPLE = 5               // 判定に必要な最低消化レース数（1戦だけ出て主力扱いを防ぐ）

type SquadSeasonLike = ForeignAppSeasonLike & {
  year: number
  races?: readonly RaceLike[]
  foreignRaceIndex?: number
}

// そのシーズンの「リーグ出場数 / リーグ開催数」。海外在籍の年は海外リーグの数字を使う
// （海外は国内レースに出ないので races からは拾えない。foreignRaceIndex＝消化マッチデー数が分母）。
function leagueAppearanceRate(playerId: string, s: SquadSeasonLike): { apps: number; total: number } {
  const fa = foreignAppsOf(s)[playerId]
  if (fa && fa.races > 0) return { apps: fa.races, total: Math.max(fa.races, s.foreignRaceIndex ?? fa.races) }
  return { apps: seasonAppearances(playerId, s.races ?? []), total: (s.races ?? []).filter(r => r.results).length }
}

export function isMainSquadRegular(playerId: string, currentSeason: SquadSeasonLike, pastSeasons: readonly SquadSeasonLike[]): boolean {
  // 出場歴のあるシーズンを新しい順に最大3年ぶん合算する
  const seasons = [...pastSeasons, currentSeason]
    .filter(s => leagueAppearanceRate(playerId, s).apps > 0)
    .sort((a, b) => b.year - a.year)
    .slice(0, 3)
  let apps = 0, total = 0
  for (const s of seasons) { const r = leagueAppearanceRate(playerId, s); apps += r.apps; total += r.total }
  if (total < RESERVE_MIN_SAMPLE) return false
  return apps / total >= RESERVE_MAIN_RATE
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
  // 出場データによる移籍意欲：出場が少ない選手は出たがる。主力は残りたい。
  const key = isDataKeyPlayer(p, playFraction, teamRaces) && !clubBlessed
  if (teamRaces >= 3 && playFraction < 0.4) score += 0.25        // ほぼ出ていない＝出場機会を求める
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

