// クラブの「格」。国内(JPEL)・海外の区別なく、全232クラブを同じ物差しで並べる唯一の場所。
//
// ■ 何を決めるか
//   格 → 年間予算 / ロスターのランク構成 / 成長の上限 / スポンサー。
//   「格が高いクラブは金があり、良い選手がいて、選手がより上まで伸びる」を1本でつなぐ。
//
// ■ なぜ全クラブを1本にするのか
//   移籍が成立するかは「行き先が今より格上か格下か」で決まる。国内と海外で別々の物差しを
//   持つと、4大リーグへ進む・3部の原石を奪い合う・古巣に戻る、が全部比べられない。
//   もとは国内が data/economy.ts の RANK_BUDGET（前年順位）、海外が playerGenerator の
//   REGION.budget という別々の表だった。同じ「格」で2つの体系があった。
//
// ■ 「配分年俸」は無い
//   以前は 予算 → 25人へ年俸を配る → その額からランクを逆算、という中間の仕組みがあり、
//   さらに実際に払う年俸は OVR から計算し直していた。年俸が2つあって互いを見ておらず、
//   予算1.5億のクラブの実年俸が8億、という矛盾が起きていた。
//   いまは 格 → ランク構成 → 年齢カーブ → OVR → 年俸（1本）で、予算と実額が必ず一致する。
//
// ■ ここでやらないこと
//   移籍の可否そのもの。ここは「格がいくつか・いくら払えるか・どこまで伸びるか」だけ。

import type { Division, Team, Rank } from '../types'
import { CLUB_TIER_BY_ID } from '../data/clubTiers'
import { DIVISIONS, DIVISION_SIZE } from './league'

/** 1が世界の頂点、20が最下層。20段階 */
export type ClubTier =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20

export const CLUB_TIERS: readonly ClubTier[] =
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]

/** 初期ロスターの人数。国内・海外とも同じ（前は国内28・海外22でズレていた） */
export const INITIAL_ROSTER_SIZE = 25


/**
 * 格 → 年間予算（円）。
 *
 * 決め方は「その格のロスター構成を年齢18〜32でばらけさせたときの総年俸 ÷ 0.6」。
 * つまり初期ロスターの年俸が必ず予算の6割になる。手元の4割が補強の原資。
 * ★ここの数字を勝手に丸めないこと。構成・年齢カーブ・年俸表から出た値。
 */
export const TIER_BUDGET: Record<ClubTier, number> = {
  1:  2_110_000_000,
  2:  2_010_000_000,
  3:  1_940_000_000,
  4:  1_770_000_000,
  5:  1_680_000_000,
  6:  1_570_000_000,
  7:  1_460_000_000,
  8:  1_310_000_000,
  9:  1_260_000_000,
  10: 1_170_000_000,
  11: 1_040_000_000,
  12:   920_000_000,
  13:   860_000_000,
  14:   810_000_000,
  15:   710_000_000,
  16:   650_000_000,
  17:   620_000_000,
  18:   570_000_000,
  19:   480_000_000,
  20:   420_000_000,
}

/**
 * 格 → 成長の上限（総合OVRの上限）。
 * 個別の能力ではなく OVR の上限。格の高いクラブにいるほど上まで伸びる。
 * ★格下へ移っても下がらない（上限は一度上がったら本人のもの）。
 */
export const TIER_POTENTIAL_CAP: Record<ClubTier, number> = {
  1: 99, 2: 98, 3: 97, 4: 95, 5: 93, 6: 90, 7: 88, 8: 87, 9: 86, 10: 85,
  11: 85, 12: 85, 13: 85, 14: 85, 15: 85, 16: 83, 17: 83, 18: 83, 19: 83, 20: 83,
}

/**
 * 格 → 成長の速さ（CPU・海外クラブ）。格が高いクラブほど伸びやすい。
 *
 * 自チームは 1.0 ＋ 練習カード。CPU・海外はカードが無いぶんをこの倍率で埋める。
 * 格11以下を1.5で止めてあるのは、そのまま下ろすと下位クラブで誰も育たなくなるため。
 */
const TIER_GROWTH_RATE: Record<ClubTier, number> = {
  1: 3.0, 2: 2.85, 3: 2.7, 4: 2.55, 5: 2.4, 6: 2.25, 7: 2.1, 8: 1.95, 9: 1.8, 10: 1.65,
  11: 1.5, 12: 1.5, 13: 1.5, 14: 1.5, 15: 1.5, 16: 1.5, 17: 1.5, 18: 1.5, 19: 1.5, 20: 1.5,
}
export function tierGrowthRate(tier: ClubTier): number {
  return TIER_GROWTH_RATE[tier]
}

/**
 * 格 → 0〜1（格1が1.0、格20が0.0）。**「格が高いほど◯◯」を作るときは必ずこれを通す。**
 *
 * ■なぜ要るのか
 *   「そのクラブがどれだけ大きいか」を、格とは別に**ロスターの平均OVR**で決める
 *   `cpuTeamTier`（elite/mid/weak）という第2の物差しが国内側にあり、そこから
 *   OVRの下限表が6つぶら下がっていた（74/67/60・74/67/58・72/65/58 …）。
 *   ・格が既に同じ仕事をしている（海外側は格1本で動いている）
 *   ・平均OVRは循環する（強い名簿だから強い選手を買える → だから強い名簿のまま）。
 *     格は「前年どこにいたか」で外から決まるので循環しない
 *   ・6つの表が微妙に食い違っていて、どれが正なのか分からなかった
 */
export function tierStrength(tier: ClubTier): number {
  return (DOMESTIC_BOTTOM_TIER - tier) / (DOMESTIC_BOTTOM_TIER - 1)
}

/**
 * 全員に毎年入る一律EXP。所属していればレースに出ていなくても同じだけ入る。
 * （前は「走った選手＝地形別EXP／走らなかった選手＝全能力50EXP」と分かれていた）
 *
 * 量はこの形になるよう決めた（SSS・普通型・格1で実測）:
 *   18歳82 → 22歳87 → 27歳95（ピーク） → 30歳95 → 33歳90 → 35歳86
 * 世界最高がOVR95。上限99は能力別の上限（得意+12/苦手-5）を通すと平均95前後になるため、
 * 99という数字がそのまま出ることはない。
 */
export const ANNUAL_BASE_EXP = 10_591

/**
 * 格 → スポンサー収入（円/年）。3社ぶんの合計。
 * 格5で約5000万、格20で約300万。上位ほど急に増える。
 */
export function tierSponsorIncome(tier: ClubTier): number {
  // 格5=5000万・格20=300万 を通る指数カーブ。格1はその延長で約8600万
  const v = 50_000_000 * Math.pow(300 / 5000, (tier - 5) / 15)
  return Math.round(v / 100_000) * 100_000
}

/** 運営費＝ロスター総年俸の1割 */
export const OPERATING_COST_RATE = 0.1
export function operatingCostOf(salaryTotal: number): number {
  return Math.round(salaryTotal * OPERATING_COST_RATE)
}

// ── ロスターのランク構成 ─────────────────────────────────────────
//
// 格ごとに「25人のうち各ランクが何人か」。格が上がるほど構成の中心が上のランクへ動く。
// 格1にDは1人もいないし、格20にSSSは1人もいない。
const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']

/**
 * その格のロスター構成。返り値はランク→人数（合計25）。
 * 中心を格で動かした正規分布で配る。手書きの表を20段ぶん持つより、
 * 格を増減したときにズレない。
 */
export function tierRankComposition(tier: ClubTier): Record<Rank, number> {
  const center = 5.6 - (tier - 1) * (5.6 - 0.6) / 19
  const w = RANK_ORDER.map((_, i) => Math.exp(-((i - center) ** 2) / (2 * 1.2 ** 2)))
  const sum = w.reduce((s, x) => s + x, 0)
  const n = w.map(x => Math.round(INITIAL_ROSTER_SIZE * x / sum))
  // 丸めのぶんを一番多いところで吸収して合計を25に合わせる
  while (n.reduce((s, x) => s + x, 0) > INITIAL_ROSTER_SIZE) n[n.indexOf(Math.max(...n))]--
  while (n.reduce((s, x) => s + x, 0) < INITIAL_ROSTER_SIZE) n[n.indexOf(Math.max(...n))]++
  const out = {} as Record<Rank, number>
  RANK_ORDER.forEach((r, i) => { out[r] = n[i] })
  return out
}

/**
 * そのクラブに配るランクを、名簿1人につき1つの並びにしてシャッフルして返す。
 *
 * ロスターを作る3つの経路（国内CPU生成・汎用生成・海外リーグ生成）が
 * 同じ「構成 → 25個の並びへ展開 → シャッフル」を別々に書いていた。
 * シャッフルするのは、先頭から数人を新加入として拾う処理（refreshForeignLeagues）が
 * 常にスターばかり拾わないようにするため。**展開の仕方はここ1本。**
 */
export function tierRankSlots(tier: ClubTier): Rank[] {
  const comp = tierRankComposition(tier)
  const slots: Rank[] = []
  for (const [r, n] of Object.entries(comp)) for (let k = 0; k < n; k++) slots.push(r as Rank)
  slots.sort(() => Math.random() - 0.5)
  return slots
}

// ── 国内（JPEL 52クラブ）─────────────────────────────────────────
//
// 国内の格は前年の通し順位（1〜52位）で決まる。1位＝格5、52位＝格20。
// 昇降格も順位で決まるので、格の上下を別に持つ必要がない。
//
// ★国内の頭打ちは格5。格4以上は海外クラブだけ。
//   3部最下位（格20・4.2億）から1部優勝（格5・16.8億）まで4倍。

/** 国内の最上位の格。1部優勝でここに到達し、これ以上は上がらない */
export const DOMESTIC_TOP_TIER: ClubTier = 5
/** 国内の最下位の格。3部最下位 */
export const DOMESTIC_BOTTOM_TIER: ClubTier = 20
/** 国内の総クラブ数（1部20＋2部16＋3部16）。部の構成が変わっても自動で追随する */
export const DOMESTIC_CLUB_COUNT = DIVISIONS.reduce((s, d) => s + DIVISION_SIZE[d], 0)

/**
 * 部ごとの格の帯。**格の帯はここが唯一の決まり**。
 *
 * 初期値（data/clubTiers.ts の国内52件）も、毎年の更新（tierFromDomesticRank）も、
 * どちらもこの帯から出す。以前は初期値が手振りで 1部5〜12 / 2部10〜17 / 3部14〜20、
 * 更新側が等間隔で 1部5〜11 / 2部11〜15 / 3部16〜20 と食い違っていて、
 * **1シーズン終えた瞬間に初期値が全部上書きされて消えていた**（52クラブ中36件がズレていた）。
 *
 * 境目は重ねてある（1部の最下位＝2部の首位＝格11、2部の最下位＝3部の首位＝格16）。
 * ここを重ねないと「昇格したのに格が下がる」が起きる。
 */
export const DOMESTIC_TIER_BAND: Record<Division, readonly [ClubTier, ClubTier]> = {
  1: [5, 11],
  2: [11, 16],
  3: [16, 20],
}

/** 国内の通し順位（1〜52）→ 格。部ごとの帯の中で、部内順位に応じて配る */
export function tierFromDomesticRank(rank: number): ClubTier {
  const r = Math.max(1, Math.min(DOMESTIC_CLUB_COUNT, Math.round(rank)))
  let offset = 0
  for (const d of DIVISIONS) {
    const size = DIVISION_SIZE[d]
    if (r <= offset + size) {
      const [lo, hi] = DOMESTIC_TIER_BAND[d]
      const inDiv = r - offset
      return (lo + Math.round((inDiv - 1) * (hi - lo) / Math.max(1, size - 1))) as ClubTier
    }
    offset += size
  }
  return DOMESTIC_BOTTOM_TIER
}

// ── 海外（9リーグ×20クラブ）─────────────────────────────────────
//
// 海外クラブの格も毎年動く。国内と扱いを分けない（いずれこちらのクラブを指揮することがある）。
// 違うのは「どの順位表で決まるか」だけで、国内は国内通し順位、海外は所属リーグの順位。
//
// リーグごとに帯があり、クラブはその中を上下する。リーグ同士の入れ替えは無いので、
// 東アフリカの最下位がアジアの首位より格上、という関係は保たれる。
// ★この帯が唯一の決まり。scripts/draft-club-tiers.ts もここを読む（数字を持たない）。

/**
 * 海外リーグごとの格。**帯（どこからどこまで）と配り方（帯の中でどう散らすか）の両方**。
 *
 * ★配り方も格の一部。ここに無いと初期値と毎年の更新で食い違う。
 *   実際、配り方だけが初期値を作るスクリプト（draft-club-tiers.ts）にしか無く、
 *   実行時は常に 'heavy' で計算していた。アジアと中米・カリブは初期値が 'flat' なので、
 *   **1シーズン終えた瞬間に40クラブの格が別の分布へ塗り替わっていた**（中位が1段下がる）。
 *
 *   heavy … 下に寄せる（指数0.7）。上位が薄く下位が厚い。帯が狭いリーグ向き
 *   flat  … 等間隔。帯が広い（10〜20）リーグで、全員が最下位付近に固まるのを避ける
 */
export type TierSpread = 'heavy' | 'flat'
export const FOREIGN_TIER_BAND: Record<string, readonly [ClubTier, ClubTier, TierSpread]> = {
  africa_east:     [1, 7, 'heavy'],
  europe_ws:       [1, 7, 'heavy'],
  north_america:   [1, 8, 'heavy'],
  africa_ns:       [3, 9, 'heavy'],
  europe_ne:       [3, 10, 'heavy'],
  oceania:         [5, 12, 'heavy'],
  south_america:   [7, 15, 'heavy'],
  asia_league:     [10, 20, 'flat'],
  central_america: [10, 20, 'flat'],
}

/**
 * 帯の中の何番目か（0..1）から格を出す。**初期値も毎年の更新もここを通る。**
 * scripts/draft-club-tiers.ts もこれを呼ぶ（あちらに配り方の式を持たせない）。
 */
export function tierInBand(band: readonly [ClubTier, ClubTier, TierSpread], i: number, n: number): ClubTier {
  const [top, bottom, spread] = band
  if (n <= 1) return top
  const at = Math.max(0, Math.min(n - 1, i)) / (n - 1)
  const span = bottom - top
  const t = top + Math.round(span * (spread === 'flat' ? at : Math.pow(at, 0.7)))
  return Math.min(20, Math.max(1, t)) as ClubTier
}

/**
 * 海外リーグの順位 → 格。配り方はそのリーグの格の定義（FOREIGN_TIER_BAND）から出す。
 */
export function tierFromForeignRank(leagueId: string, rank: number, clubCount: number): ClubTier {
  const band = FOREIGN_TIER_BAND[leagueId]
  if (!band) return DOMESTIC_BOTTOM_TIER
  const t = tierInBand(band, Math.round(rank) - 1, Math.max(1, clubCount))
  // 格1は世界の数クラブだけ。順位で1に上がってくることはさせない（初期値と同じ扱い）
  return Math.max(2, t) as ClubTier
}

// ── 読み口 ───────────────────────────────────────────────────────

export type TieredTeam = { id?: string; tier?: ClubTier; initialRank?: Team['initialRank'] }

/**
 * そのクラブの格。国内クラブも海外クラブも同じ入口。
 *
 * 優先順位:
 *   1. Team.tier（前年の順位で毎年書き換わる。国内クラブはこれが正）
 *   2. data/clubTiers.ts の初期値（全232クラブぶん）
 *   3. initialRank からの推定（古いセーブの保険）
 *
 * ★格を読むときは必ずこれを通すこと。team.tier を直接見ないこと。
 * ★格はプレイヤーに見せない内部データ。画面に出さないこと。
 */
export function tierOf(team: TieredTeam | undefined): ClubTier {
  if (!team) return DOMESTIC_BOTTOM_TIER
  if (team.tier) return team.tier
  const seeded = team.id ? CLUB_TIER_BY_ID[team.id] : undefined
  if (seeded) return seeded as ClubTier
  return tierFromDomesticRank(team.initialRank ?? DOMESTIC_CLUB_COUNT)
}

/**
 * 「世界レベルの選手」の線。**ここ1本で決める。**
 *   ・移籍が大ニュースになるか
 *   ・海外の最上位クラブが放っておかないか
 *   ・日本から海外へ渡ったのが「世界へ挑戦」の見出しになるか
 * 以前はこの3つが 85 / 85 / 76 と別々の数字で、さらに引き抜きの「スター」だけ 82 だった。
 * 移籍金いくら以上、という基準は使わない（クラブの規模で額が変わるので、
 * 同じ1億でも格1では小さく格20では巨額になり、意味が揃わない）。
 */
export const MAJOR_NEWS_OVR = 85

/**
 * ビッグクラブの線（格2以上＝格1と格2）。**「世界最高峰か」はここ1本。**
 *
 * 以前は同じ問いに3つの物差しがあった：
 *   ・`isEliteLeague`（4大リーグのIDを手書き）… 自チームが送り出したときの見出しと実績
 *   ・`tierOf(c) < DOMESTIC_TOP_TIER`（格1〜4）… 裏で動いた日本→海外の見出し
 *   ・`isBigClub`（格1のみ）… ニュースの大扱い（major）
 * リーグで判定すると、格3まで上がった欧州北東のクラブが「最高峰ではない」のに
 * 格9まで落ちた北南アフリカのクラブが「最高峰」のまま、という逆転が起きる。
 * リーグは動かないがクラブの格は毎年動くので、**クラブの格で言う**。
 */
export const BIG_CLUB_TIER: ClubTier = 2

/**
 * そのクラブはビッグクラブ（格2以上）か。大ニュースと「世界最高峰へ」の見出しに使う。
 *
 * ★クラブの実体を渡すこと（tierOf と同じ引き方）。以前はクラブIDだけを受け取って
 *   clubTiers.ts の**初期値**を見ていたので、格9まで落ちた海外クラブが
 *   いつまでも「世界的名門」として大ニュース扱いのままだった。
 */
export function isBigClub(club: TieredTeam | undefined): boolean {
  return tierOf(club) <= BIG_CLUB_TIER
}

/**
 * 「ステップアップか」＝行き先の格が今のクラブより上か。**相対の判定はここ1本。**
 *
 * ビッグクラブ（絶対の線）と対になる。3部（格18）の選手が格12のクラブへ渡るのは
 * 世界最高峰ではないがステップアップで、以前はどちらの見出しにもならず
 * ただの移籍として流れていた。国内・海外の区別はしない（格は同じ物差し）。
 */
export function isStepUp(from: TieredTeam | undefined, to: TieredTeam | undefined): boolean {
  return tierOf(to) < tierOf(from)
}

export function tierOfClubId(clubId: string): ClubTier {
  return (CLUB_TIER_BY_ID[clubId] as ClubTier) ?? DOMESTIC_BOTTOM_TIER
}

/**
 * 国内チームと海外クラブを1つの配列にまとめる。格を引くときの「クラブ一覧」はこれ。
 *
 * 国内・海外で別の引き方をしないための入口。どちらも `{ id, tier }` を持つので、
 * tierOf から見れば区別が要らない（いずれ海外のクラブを指揮することがあるので、
 * ここで分けてしまうとその時に全部書き直しになる）。
 */
export function allTieredClubs(
  teams: readonly TieredTeam[] | undefined,
  foreignLeagues?: readonly { clubs: readonly TieredTeam[] }[],
): TieredTeam[] {
  return [...(teams ?? []), ...(foreignLeagues ?? []).flatMap(l => [...l.clubs])]
}

/**
 * その選手の所属クラブの格。国内クラブ・海外クラブ・無所属（FA）のどれでも通る入口。
 * 無所属は undefined を返す。
 *
 * clubs には allTieredClubs で国内＋海外をまとめて渡すこと。渡さなかったクラブは
 * data/clubTiers.ts の初期値になる（＝毎年動いたぶんが反映されない）。
 */
export function tierOfPlayerClub(
  teamId: string | undefined, clubs?: readonly TieredTeam[],
): ClubTier | undefined {
  if (!teamId) return undefined
  const t = clubs?.find(x => x.id === teamId)
  if (t) return tierOf(t)
  return CLUB_TIER_BY_ID[teamId] as ClubTier | undefined
}

/** そのクラブの年間予算（円） */
export function tierBudget(team: TieredTeam | undefined): number {
  return TIER_BUDGET[tierOf(team)]
}

/** そのクラブの成長上限（OVR） */
