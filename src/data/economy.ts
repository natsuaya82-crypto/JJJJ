// 予算モデルの唯一の情報源。store(endSeason) と 財務画面の見込み表示で共有し、ズレを防ぐ。
//
// ■ 収入は「クラブの格」1本
//   前はここに 順位グラント(RANK_BUDGET) / レース賞金 / 観客収入 / CPUへの10%補填 が並んでいて、
//   さらに 連続赤字ペナルティ と 育成義務ペナルティ がグラントを削っていた。
//   同じ「そのクラブがいくら使えるか」を6つの表が別々に決めていて、
//   RANK_BUDGET は1〜20位ぶんしか無いので52チーム制では2部と3部が同額になっていた。
//   いまは utils/clubTier.ts の tierBudget(team) だけが収入の元。順位は「翌年の格」を通してのみ効く。
//
// ■ 支出は 年俸 ＋ 運営費（年俸の1割）だけ
//   施設維持費は廃止（施設レベル自体は残る）。
//
// 収入: 格の年間予算 ＋ スポンサー ＋ 目標達成ボーナス
// 支出: 総年俸 ＋ 運営費(総年俸×10%) ＋ 出来高ボーナス

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
export function computeNextSeasonBudget(args: {
  baseGrant: number        // そのクラブの格の年間予算（utils/clubTier.ts の tierBudget(team)）
  prevBalance: number      // 今季終了時点の残高（繰り越し）
  sponsorAnnual: number
  raceIncome?: number      // 今季の区間賞賞金（レース賞金・観客収入は廃止）
  objBudgetBonus: number
  bonusPayout: number      // 出来高ボーナスの支払い
  salaryTotal: number      // ロスター総年俸
}): number {
  const income = args.baseGrant + args.sponsorAnnual + (args.raceIncome ?? 0) + args.objBudgetBonus
  const expenses = args.bonusPayout + args.salaryTotal + operatingCostOf(args.salaryTotal)
  return Math.max(DEFICIT_LIMIT, args.prevBalance + income - expenses)
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

// 主力の引き抜き割増。余剰の売買は市場価値どおりだが、使われている選手を
// 引き剥がすには上乗せが要る。国内CPU間と、海外クラブによるスター強奪の2通り
export const POACH_PREMIUM = 1.4
export const FOREIGN_STAR_PREMIUM = 1.25

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
