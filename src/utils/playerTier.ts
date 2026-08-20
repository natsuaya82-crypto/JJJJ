import type { ClubTier } from './clubTier'
import { RUNNING_SLOTS } from '../data/rosterRules'
import { peakAgeOfCurve } from '../engine/ageCurve'
import { ovr } from './playerUtils'
import { effectiveOvr } from './foreignClubProfile'
import type { Player } from '../types'

// ============================================================================
// **選手の格。** クラブの格（`utils/clubTier`）とまったく同じ1〜20の目盛りで、
// 「その選手はどの格のクラブで走れるか」を表す。
//
// ■なぜ要るのか（2026-08-20・オーナー）
//   「どこでもエース級がわざわざ格下に行くの？別に移籍しないで止まったり、
//    上に行けばいいやん」
//
//   それまでの市場には「**この選手はどの格にいるべきか**」という考えが無く、
//   あるのは「そのクラブの名簿の中で何番手か」だけだった。だから OVR88 の選手は、
//   格5のクラブに 88〜90 が並んでいれば**そのクラブの中では8番手**になり、
//   「走れていない」→「出番を求めている」→**どこへでも行っていい**、になっていた。
//   行き先を決めていたのは「誰が声を掛けてきたか」だけなので、格20のクラブでも
//   買えた（実測：12段下が2件、10段下が10件）。
//
//   関門（`tooFarDown` / `unproven` / 打診の格差線）は全部その**後付けの蓋**で、
//   「どこまで落ちていいか」を誰も決めていない状態に蓋を3枚かぶせていた。
//   だから隙間から漏れるし、蓋を増やすほど食い違う。**3枚とも、これに置き換えた。**
//
// ■決まりは1行
//   **移籍先は「選手の格 + TIER_FALL_LIMIT」より下の格のクラブには行かない**（上へは制限なし）。
//     選手の格3（OVR88のエース）   → 格1〜6 へ。**格20には行けない**
//     選手の格12（35歳で衰えた）    → 格1〜15 へ。自然に下りる
//     選手の格15（格5で干されている） → 格1〜18 へ。出番を求めて落ちるのは止めない
//
// ■インフレに強い
//   線は**その時点の世界から引き直す**ので、成長で世界全体のOVRが上がっても
//   「選手の格」の意味は変わらない。実測で OVR85+ は6年で 713人 → 1594人に増えるが、
//   走れる椅子は 232クラブ × 7区間 = 1624 のまま。絶対値で「85以上はエース」と
//   決めているとここで壊れる。
// ============================================================================

/**
 * **どこまで格を落として移籍していいか。** 行き先のクラブの格が
 * 「選手の格 + これ」より下なら、その移籍は成立しない。
 *
 * ★**上へは制限を置きません。** 買う側が `needsPlayer` で
 *   「そのクラブで14番手以内に入れるか」を見ているので、際限なく上へは行けません。
 *   オーナーの不満はすべて**落ちすぎ**の話でした（「88が3部」「椅子を求めて20に行く」）。
 *
 * ★**「選手の格 ≒ クラブの格」ではありません。** 最初は上下1段の帯で組みましたが、
 *   初期世界で帯に収まる選手が**37.6%しかいませんでした**。世界は
 *   `tierRankComposition` で SSS〜D を混ぜて名簿を作るので、
 *   **1つのクラブの中に選手の格が10段ぶん同居している**のが正常です（実測）。
 *
 *       格 1のクラブ … 選手の格 1〜8
 *       格 5のクラブ … 選手の格 5〜15
 *       格15のクラブ … 選手の格 7〜20   ← 格15のクラブに「選手の格7」のエースがいる
 *       格20のクラブ … 選手の格 10〜20
 *
 *   ズレは常時あるのが普通なので、「ズレを埋める向きにだけ動く」は成立しません。
 *   限るのは**移籍で落ちる幅**だけです。
 *
 * ★バランスの数字です。変えるときはオーナーに確認すること（2026-08-20 の時点では
 *   仮置きの3で、オーナーの指定待ち）。
 */
export const TIER_FALL_LIMIT = 3

/**
 * **伸びしろをどれだけ格に織り込むか。** この考えの唯一のツマミ。
 *
 * 0 … 今の力だけで見る。**18歳のドラフト1位が全員格20になって破綻する**
 * 1 … 天井（potential）そのままで見る。18歳のOVR55が格2になり、
 *     ビッグクラブが即座に買いに来る
 *
 * 移籍金は既に `transferFeeAgeMultiplier` で 22歳以下を×5・32歳以上を×2 している
 * ＝「若い＝将来ぶんの価値がある」は**お金の側では既に効いていて、格の側にだけ無かった**。
 * ここはその揃え直し。**バランスの数字なので、変えるときはオーナーに確認すること。**
 */
export const YOUTH_POTENTIAL_WEIGHT = 0.5

/**
 * **年齢込みの実力。** 選手の格を出す唯一の材料。
 *
 *   ピーク前 … 今のOVRと天井（potential）を、ピークまでの距離で混ぜる
 *   ピーク後 … `effectiveOvr`（33歳から1歳ごとに-3）。天井はもう関係ない
 *
 * ★`ovr` を直に使わないこと。18歳と30歳の同じOVR70はまったく違う選手で、
 *   市場はそれを区別している（移籍金の年齢倍率）。
 */
export function careerOvr(p: Player): number {
  const peak = peakAgeOfCurve(p.growthCurve ?? 'normal')
  const now = effectiveOvr(p)
  if (p.age >= peak) return now
  // 18歳で最大、ピークで0になる重み
  const span = Math.max(1, peak - 18)
  const w = Math.min(1, Math.max(0, (peak - p.age) / span)) * YOUTH_POTENTIAL_WEIGHT
  return now + Math.max(0, (p.potential ?? now) - now) * w
}

/**
 * **各格の線。** 世界中の選手を強い順に並べ、世界中の在籍枠を格の高い順に並べて、
 * **順位どうしを突き合わせる**。格1のクラブの席が全部で300あるなら、
 * 上位300人が格1。次の席数ぶんが格2、という数え方。
 *
 * ■なぜ「走れる7人の線」ではないのか
 *   最初はそれで組んだが、**初期世界でズレが±1に収まるのが29.6%しかなかった**。
 *   世界は「格 → ランク構成（25人ぶん）→ 能力値」の順で作られるので、
 *   1クラブ25人のうち走れるのは7人＝**残り18人は自分のクラブの線に届かない**。
 *   つまり定義上、世界の7割が「いまのクラブに見合っていない」になってしまう。
 *   在籍枠で数えれば、**世界の作り方と同じ物差し**になる。
 *
 * ★**市場を回すたびに1回だけ組むこと。** 選手ごとに引き直すと232クラブ・6000人を
 *   毎回並べ替えることになる（`allTieredClubs` と同じ扱い）。
 * ★席の数は**実際の名簿の人数**から数える。格ごとのクラブ数も名簿の厚さも
 *   世界によって変わるので、固定の表を持たない。
 */
export function tierLines(
  players: readonly Player[],
  tierOfClub: (clubId: string) => ClubTier | undefined,
): number[] {
  const seats = new Array(21).fill(0)
  const vals: number[] = []
  for (const p of players) {
    if (p.status !== 'active' || !p.teamId) continue
    const t = tierOfClub(p.teamId)
    if (!t) continue
    seats[t]++
    vals.push(careerOvr(p))
  }
  vals.sort((a, b) => b - a)
  // index 0 は使わない（格は1〜20）
  const lines: number[] = new Array(21).fill(Number.NEGATIVE_INFINITY)
  let cum = 0
  for (let t = 1; t <= 20; t++) {
    cum += seats[t]
    if (cum === 0) continue
    lines[t] = vals[Math.min(cum, vals.length) - 1]
  }
  // クラブが1つも無い格は、すぐ上の格の線を引き継ぐ（国内の頭打ちは格5なので、
  // 海外リーグを渡し忘れた古い経路でも穴が空かないように）
  for (let t = 1; t <= 20; t++) {
    if (lines[t] === Number.NEGATIVE_INFINITY) lines[t] = t > 1 ? lines[t - 1] : Number.POSITIVE_INFINITY
  }
  return lines
}

/**
 * **選手の格。** 上の格から順に「その格で走れる7人の線に届くか」を見て、
 * 届く一番上の格を返す。どこにも届かなければ格20。
 */
export function playerTierOf(p: Player, lines: readonly number[]): ClubTier {
  const v = careerOvr(p)
  for (let t = 1; t <= 20; t++) if (v >= lines[t]) return t as ClubTier
  return 20
}

/**
 * 選手の格から見て、そのクラブへ移れるか。
 * **下へ落ちる幅だけを見る**（上へは制限なし。`TIER_FALL_LIMIT` のコメント）。
 */
export function inTierBand(playerTier: ClubTier, clubTier: ClubTier): boolean {
  return clubTier - playerTier <= TIER_FALL_LIMIT
}
