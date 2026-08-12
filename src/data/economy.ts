// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。
//
// ■ 収入は「クラブの格」1本
//   前はここに 順位グラント(RANK_BUDGET) / レース賞金 / 観客収入 / CPUへの10%補填 が並んでいて、
//   さらに 連続赤字ペナルティ と 育成義務ペナルティ がグラントを削っていた。
//   同じ「そのクラブがいくら使えるか」を6つの表が別々に決めていて、
//   RANK_BUDGET は1〜20位ぶんしか無いので52チーム制では2部と3部が同額になっていた。
//   いまは utils/clubTier.ts の tierBudget(team) だけが収入の元。順位は「翌年の格」を通してのみ効く。
//
// ■ 支出は 年俸 ＋ 運営費（年俸の1割） ＋ 施設の維持費
//   施設維持費は一度廃止したが戻した。無いと年俸が年間予算の54%しか使われず、
//   232クラブ全部が毎年「年間予算の4割」を貯め込む状態になっていた（半年で移籍金の上限に届く）。
//   維持費はレベルに比例するので、格の低いクラブは高い施設を維持できない。
//   額は utils/facilities の FACILITY_UPKEEP_PER_LEVEL 1本。
//
// 収入: 格の年間予算 ＋ スポンサー ＋ 目標達成ボーナス
// 支出: 総年俸 ＋ 運営費(総年俸×10%) ＋ 出来高ボーナス ＋ 施設の維持費

import { operatingCostOf } from '../utils/clubTier'
export { operatingCostOf, OPERATING_COST_RATE } from '../utils/clubTier'

// 指名権の市場価値：ドラ1級選手の実価値(約1.2億)×0.9^指名位置。
// 全体1位≈1.08億、5位≈7100万、10位≈4200万、20位≈1450万。2巡は500〜1000万。
// pickNumber は 1巡=1〜20。旧データの2巡(21〜40)でも2巡側はほぼ一律なので誤差は出ない。
export function draftPickValue(round: number, pickNumber: number): number {
  if (round === 1) {
    const v = 120_000_000 * Math.pow(0.90, Math.max(1, pickNumber))
    return Math.max(14_000_000, Math.round(v / 500_000) * 500_000)
  }
  const v = 10_000_000 - (Math.max(1, pickNumber) - 1) * 250_000
  return Math.max(5_000_000, Math.round(v / 500_000) * 500_000)
}

// 指名権キー "YYYY-R{round}-{pickNumber}" から市場価値を出す（位置連動）。解釈不能なら2巡相当。
// トレードの値付け(store)とチャットの提示画面が、同じ正規表現と同じ既定値を別々に手書きしていた。
// 片方だけキーの形を変えると値段が黙って8,000,000に落ちるので、読み取りごとここに置く
export function pickKeyValue(key: string): number {
  const m = key.match(/-R(\d+)-(\d+)$/)
  return m ? draftPickValue(Number(m[1]), Number(m[2])) : 8_000_000
}

/** 指名権のキーの束をまとめて値段にする。トレードの3つの入口が同じ数え方を通るように */
export function pickKeysValue(keys: readonly string[]): number {
  return keys.reduce((sum, k) => sum + pickKeyValue(k), 0)
}

// 移籍金の丸め。**画面に出る移籍金は必ずここを通す**。
// 出品の言い値・逆提示は50万単位、クラブ間のオファーは100万単位。
// 以前は Math.max(500000, Math.round(x / 500000) * 500000) が9箇所に手書きされていて、
// 下限を付け忘れた場所だけ「移籍金0円」の打診が出ていた
export function roundFee(v: number, unit = 500_000): number {
  return Math.max(unit, Math.round(v / unit) * unit)
}

// 赤字を許容する下限（借金の底）。これ以下は endSeason 側で指名権/選手の強制売却で補填する。
export const DEFICIT_LIMIT = -100_000_000  // 最大 -1億まで赤字を持ち越せる

// 旧仕様の判定バグで詰んだセーブの救済ライン（残高マイナスのチームをここまで戻す）。
export const DEFICIT_RESCUE_BUDGET = 50_000_000

/**
 * 来季予算 ＝ 前季の繰り越し ＋ 収入 － 支出。赤字は DEFICIT_LIMIT まで許容。
 *
 * 自チームもCPUも海外クラブもこの1本を通る。
 * ★連続赤字によるグラント減額は廃止した。減るのは収入なのに脱出手段は年俸削減しか無く、
 *   減額→さらに赤字、の一方通行だったため。赤字のペナルティは「補強禁止」だけにする。
 */
/**
 * 前季から持ち越せる上限 ＝ そのクラブの年間予算のこの割合。
 *
 * ■なぜ要るのか（実測）
 *   上限が無いと繰越が毎年積み上がる。10シーズン回すと「使えるお金」が年間予算の2.6倍になり、
 *   移籍金の上限（年間予算の20%）いっぱいの選手を**同時に13人**買える。
 *   1人あたりの上限は格で効いているのに、**回数が無制限**なので格の差が消える。
 *
 *   繰越上限   10年目の使えるお金   年間予算の何倍   同時に買える人数
 *   上限なし        31.7億             2.60倍           13人
 *   1.0倍           25.2億             2.00倍           10人
 *   0.4倍           17.6億             1.40倍            7人
 *   0.5倍                                               ← いまここ（施設維持費と合わせて効かせる）
 *   0.2倍           15.1億             1.20倍            6人
 *
 *   上限を付けると3年目で頭打ちになり、そこから増えない。
 *   貯めて大型補強、はできる（1年ぶんの繰越は残る）が、無限には貯まらない。
 */
export const CARRYOVER_CAP_SHARE = 0.50

export function computeNextSeasonBudget(args: {
  baseGrant: number        // そのクラブの格の年間予算（utils/clubTier.ts の tierBudget(team)）
  prevBalance: number      // 今季終了時点の残高（繰り越し）
  sponsorAnnual: number
  raceIncome?: number      // 今季の区間賞賞金（レース賞金・観客収入は廃止）
  objBudgetBonus: number
  bonusPayout: number      // 出来高ボーナスの支払い
  salaryTotal: number      // ロスター総年俸
  facilityUpkeep?: number  // 施設の維持費（utils/facilities の facilityUpkeepOf）。全クラブが払う
}): number {
  const income = args.baseGrant + args.sponsorAnnual + (args.raceIncome ?? 0) + args.objBudgetBonus
  const expenses = args.bonusPayout + args.salaryTotal + operatingCostOf(args.salaryTotal) + (args.facilityUpkeep ?? 0)
  // 前季の精算後に残ったぶん（＝繰越）。ここに上限をかける。
  // 赤字側は DEFICIT_LIMIT まで持ち越す（借金は消えない）
  const carryover = Math.min(args.prevBalance - expenses, args.baseGrant * CARRYOVER_CAP_SHARE)
  return Math.max(DEFICIT_LIMIT, carryover + income)
}

// 連続赤字の判定は computeNextSeasonBudget の結果（＝精算後の残高）がマイナスかどうかだけで行う。

// ── 移籍入札：相手が受けるかの判定基準（UI の成立確率表示と store の合否判定で共有）──
// 「受諾ライン」のベース額。実際の判定では threshold = base × (0.9〜1.1 の揺れ) となる。
export function transferBidBase(marketValue: number, isListed: boolean, isExpiring: boolean): number {
  return marketValue * (isListed ? 0.85 : isExpiring ? 0.92 : 1.05)
}

// 主力(key)を売らせるための割増。**この数字は3箇所に手書きされていた**
// （自チームへの入札処理2つ＋入札画面の成立確率表示）。画面が「80%で成立」と
// 出しているのに実際は割増が乗っていて拒否される、という食い違いの原因
export const BID_KEY_PREMIUM = 1.8
// 受諾ラインに届かなくても、この割合を超えていれば「もう少し積め」と逆提示する
export const BID_COUNTER_RATIO = 0.68

/**
 * 入札の受諾ライン（揺れを乗せる前のベース）。
 * 呼び出し側で transferBidBase と割増を組み立て直さないこと
 */
export function bidThreshold(marketValue: number, isExpiring: boolean, isKey: boolean): number {
  return transferBidBase(marketValue, false, isExpiring) * (isKey ? BID_KEY_PREMIUM : 1)
}

// 相手の逆提示に応じる上限。「市場価値の1.15倍」か「相手の提示額の1.3倍」の高い方。
// 海外クラブぶんと国内クラブぶんで同じ式が別々に書かれていた
export const COUNTER_VALUE_CAP = 1.15
export const COUNTER_OFFER_CAP = 1.3
export function counterCeiling(marketValue: number, offeredPrice: number): number {
  return Math.max(marketValue * COUNTER_VALUE_CAP, offeredPrice * COUNTER_OFFER_CAP)
}

// 給与ダイヤル（NumberDial）の刻み・下限・上限。
// 上限は用途で意図的に違う（オーナー確認済み・2026-08-11）:
// 交渉（契約更改・FA/引き抜きの獲得提示）は8000万、ドラフト新人は6000万。
// 値を変えるときはオーナー確認の上でここだけを変えること（画面に直書きしない）。
export const SALARY_DIAL_STEP = 1_000_000
export const SALARY_DIAL_MIN = 3_000_000
export const NEGOTIATION_SALARY_MAX = 80_000_000
export const DRAFT_SALARY_MAX = 60_000_000

/**
 * **主力の引き抜き割増（1本）。** 余剰の売買は市場価値どおりだが、使われている選手を
 * 引き剥がすには上乗せが要る。**国内も海外も同じ。**
 * 掛けるのは `utils/playerUtils` の `transferFeeFor` 1本。
 *
 * ★以前は `FOREIGN_STAR_PREMIUM`(1.25) という2つ目があり、海外クラブが日本のスターを
 *   強奪するときだけ国内CPU間(1.4)より**安く**買えた。
 */
export const POACH_PREMIUM = 1.4

// 取り合い（競売）で1人の選手に出せる上限＝そのクラブの年間予算のこの割合。
// 上限は「格」から降りてくる（年間予算は clubTier.TIER_BUDGET の1本）ので、
// 格1は格20の5倍出せる。誰が競売に参加するかは需要（utils/squadNeeds.ts）で決まり、
// 誰が勝つかはここで決まる。
//
// 以前は「市場価値×POACH_PREMIUM」の頭打ちだった。全クラブが同じ額を出すので
// 1.4倍積めば必ず勝ち、1.4倍未満なら必ず負ける固定の壁になっていて競売になっていなかった。
// 選手ごとの上限ではなくクラブごとの上限なので、必要としているクラブは高い選手にも手が届く。
export const TRANSFER_BUDGET_SHARE = 0.20

/**
 * そのクラブが1人の移籍金に出せる上限。**買う側の上限はここ1本。**
 *
 * 決まりは「格の年間予算の TRANSFER_BUDGET_SHARE まで。手元の資金がそれより少なければそちら」。
 * この式が store の中に3通り書かれていて、
 *   ・上乗せの判定は年間予算だけ見て手元の資金を見ていない
 *   ・打診の生成は手元の資金だけ見て年間予算の上限を見ていない（格の意味が消える）
 *   ・横取りの判定だけが正しい
 * という状態だった。海外クラブの打診にいたっては上限が一つも無かった。
 *
 * @param annualBudget 格から降りてくる年間予算（utils/clubTier の tierBudget）
 * @param cash 手元の資金。海外クラブのように持っていない場合は省略
 */
export function transferCapOf(annualBudget: number, cash?: number): number {
  const cap = Math.floor(annualBudget * TRANSFER_BUDGET_SHARE)
  return cash == null ? cap : Math.max(0, Math.min(cash, cap))
}

// 入札額 fee に対する受諾確率(0..1)。threshold = base×(0.9 + rand*0.2) の一様分布から算出。
export function transferAcceptChance(fee: number, base: number): number {
  if (base <= 0) return 1
  return Math.max(0, Math.min(1, (fee / base - 0.9) / 0.2))
}
// ── 出品中(移籍リスト掲載)の入札 ──
// クラブ自ら「この額なら売る」と出している希望額(askingPrice)が受諾ライン。
// 満額で必ず成立、この割合まで下がると0%。主力割増は乗せない。
export const LISTED_ACCEPT_MIN = 0.85
// 受諾ラインに届かなくても、この割合を超えていれば逆提示する
export const LISTED_COUNTER_RATIO = 0.7

// 出品中の受諾ライン。roll は 0..1 の乱数。判定側と確率表示側で同じ分布を使う
export function listedThreshold(askingPrice: number, roll: number): number {
  return askingPrice * (LISTED_ACCEPT_MIN + roll * (1 - LISTED_ACCEPT_MIN))
}

// 出品中の受諾確率(0..1)。listedThreshold と同じ定数から出すので
// 「100%表示なのに拒否された」というズレが起きない
export function listedAcceptChance(fee: number, askingPrice: number): number {
  if (askingPrice <= 0) return 1
  return Math.max(0, Math.min(1, (fee / askingPrice - LISTED_ACCEPT_MIN) / (1 - LISTED_ACCEPT_MIN)))
}

// 提示された移籍金が相場（市場価値）に対してどのくらいか、の線。
// 買う側は「高い／安い」、売る側は逆向きに読むが、線は同じ1組。
// 以前は NotificationsPage.tsx に同じ 0.95 / 0.75 の判定が2箇所（買う側・売る側）に
// 手書きされていて、片方だけ直すと食い違う状態だった。
export const FEE_FAIR_RATIO = 0.95   // これ以上なら「適正」
export const FEE_SOFT_RATIO = 0.75   // これ以上なら「やや高／やや安」、下回れば「高値／安値」

export type FeeRating = 'fair' | 'soft' | 'harsh'

/**
 * 提示額(ratio = 提示額 / 市場価値)が相場に対してどの区分か。
 * ラベルの文言・色は立場（買う側／売る側）で変わるので画面側が決める。ここは区分だけ返す。
 */
export function feeRatingOf(ratio: number): FeeRating {
  return ratio >= FEE_FAIR_RATIO ? 'fair' : ratio >= FEE_SOFT_RATIO ? 'soft' : 'harsh'
}

// 補強禁止判定：前季までの連続赤字ペナルティ中、または現在の残高がマイナスの間は
// 新規補強（FA・移籍金・引き抜き・レンタル・海外獲得）を止める。ドラフト・契約更新は可。
export function reinforcementBanned(team: { finance: { budget: number; deficitStreak?: number } } | undefined): boolean {
  if (!team) return false
  // 3シーズン連続赤字で補強禁止。または現在の残高がマイナスの間も禁止。
  return (team.finance.deficitStreak ?? 0) >= 3 || team.finance.budget < 0
}

