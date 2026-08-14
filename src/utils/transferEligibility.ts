// 移籍まわりの「この選手を対象にしていいか」の判定を、ここ1箇所にまとめたもの。
//
// もともとは同じ条件（引退希望中は除く／非売品は除く／海外挑戦を承認済みは除く／
// 加入1年目は除く／レンタルで借りている選手は保有権が無いので除く）が、オファー生成・
// 入札・CPUの自動購入・売出・レンタル打診と、10箇所近くに手書きでコピーされていた。
// その結果、条件を1つ足しても入れ忘れた場所だけ素通りする、という不具合が起きていた。
// 実際に「海外挑戦を承認したのに国内チームに売られる」のがこれで、除外している場所が
// 3箇所しか無く、売出への入札とCPUの自動購入が素通りしていた。
//
// 新しい条件を足すときは、必ずこのファイルの関数に足すこと。
// 呼び出し側に直接 p.noSale や p.overseasListed を書かないこと（scripts/check-transfer-eligibility.ts が検出する）。
import type { Player } from '../types'
import { saleAnsweredIds, type SaleAnswerSeason } from './saleAnswer'

export type EligibilityCtx = {
  /** 判定の基準になる所属チームID。この選手が「そのチームの持ち物か」を見る */
  teamId: string
  /** 今のシーズン年。0や未指定なら「加入1年目」の判定をしない */
  currentYear?: number
  /**
   * 引退したいと言ってきていて、まだGMが返事をしていない選手のID。
   * currentSeason.retirementRequests から作る（承認するとこのリストからは消える）
   */
  retiringIds?: Set<string>
  /**
   * 買い取り打診に「譲ります」と返事をして、決着（次のレース）を待っている選手のID。
   * utils/saleAnswer から作る。**GM側の処分（トレード・貸出・売出）だけを止める。**
   */
  saleAnsweredIds?: Set<string>
}

/** ここに渡す用の、シーズンから読むもの */
type EligibilitySeason = {
  year?: number
  retirementRequests?: { playerId: string }[]
} & SaleAnswerSeason

/**
 * ★判定に渡す材料は、シーズンからここ1本で作ること。★
 *
 * 以前は呼ぶ側が `{ teamId, currentYear, retiringIds: new Set(...) }` を毎回手書きしていて、
 * 14箇所に散っていた。材料を1つ足すたびに入れ忘れた場所だけが素通りする
 * （実際、返事済みの選手をトレードに出せる穴がこれで残っていた）。
 */
export function eligibilityCtx(season: EligibilitySeason, teamId: string): EligibilityCtx {
  return {
    teamId,
    currentYear: season.year,
    retiringIds: new Set((season.retirementRequests ?? []).map(r => r.playerId)),
    saleAnsweredIds: saleAnsweredIds(season),
  }
}

/**
 * **移籍したあと、次の移籍まで動かせない年数。**（オーナー・2026-08-14「移籍して2年は動かせなくしよう。レンタルのみ」）
 *
 * ■なぜ要るのか
 *   1年おきに同じ選手が動き続けていました。2回目以降の移籍のうち**70.1%が
 *   「前の年に移ったばかり」**（間隔 1年70.1% / 2年22.4% / 3年6.3%）。
 *   契約年数の坂（`transferDecision.willRelease`）でも 67.7% → 60.6% までしか下がりません。
 *   市場が1年に動かす件数（約1,200件）のほうが、その回に出せる選手（1回あたり288人）より
 *   多いので、**供給を絞っても同じ人がまた選ばれる**ためです。
 *
 * ■**レンタルは止めません。** 動かせないのは保有権が移る形（移籍・トレード）だけで、
 *   出番を作るためのレンタルは今までどおり。
 */
export const TRANSFER_LOCK_YEARS = 2

/** 今季加入した選手か。1シーズンに何度も移籍させないための判定 */
export function isNewJoin(p: Player, currentYear?: number): boolean {
  return (currentYear ?? 0) > 0 && p.joinedYear === currentYear
}

/**
 * **移籍したばかりで、まだ次の移籍に出せない選手か。**（保有権が移る形すべての唯一の関門）
 *
 * `joinedYear` からの経過年で見ます。加入年を含めて `TRANSFER_LOCK_YEARS` 年。
 * 2年なら「加入した年」と「その翌年」が対象で、翌々年から動けます。
 *
 * ★`joinedYear` が無い選手（初期ロスター・古いセーブ）は**止めません**。
 *   止めると開幕直後の世界が丸ごと凍ります。
 * ★**レンタルはこの関門を通しません**（`canLoanOut` は見ない）。
 */
export function isTransferLocked(p: Player, currentYear?: number): boolean {
  const y = currentYear ?? 0
  if (y <= 0 || !p.joinedYear) return false
  return y - p.joinedYear < TRANSFER_LOCK_YEARS
}

/**
 * 引退の話をしている選手か。
 *
 * 引退は2段階ある。
 *   ①「引退したい」と言ってきた（currentSeason.retirementRequests に載る＝ retiringIds）
 *   ② GMが承認した（retirementRequests からは消え、pendingRetirementYear が立つ。
 *      実際にロスターから外れるのはシーズン終わり）
 * ここが①しか見ていなかったせいで、**承認した瞬間に引退の札が消えて、また普通に
 * 売れる・貸せる・トレードできる選手に戻っていた**。「引退します」と言った選手が
 * よそへ移籍する不具合はこれ。②も同じ「引退の話をしている」として扱う。
 */
export function isRetiring(p: Player, retiringIds?: Set<string>): boolean {
  if (p.pendingRetirementYear != null) return true
  return !!retiringIds?.has(p.id)
}

/**
 * そのチームが保有権を持っている選手か。
 * レンタルで借りている選手は teamId が借り手になっているが持ち物ではないので false
 */
export function isOwnedBy(p: Player, teamId: string): boolean {
  return p.teamId === teamId && p.status !== 'retired' && !p.loan
}

/**
 * ★ここが全部の土台★
 * その選手が今ほかの話を抱えていないか（＝新しい話を始めていい状態か）。
 *
 * 進路が決まっている選手＝
 *   ・引退の話をしている（言ってきた／承認した の両方）
 *   ・海外挑戦を承認した（海外からの話だけ待っている）
 * この2つに当てはまる選手は、移籍・トレード・レンタル・売出・契約更新・移籍希望を
 * すべてここで止める。1人の選手が同時に2つの話を抱えることが無くなる。
 *
 * 下の can〜 はこれに用途ごとの一言を足しただけ。入口がいくら増えても、
 * 判断の本体はこの関数1つしかない状態を保つこと
 */
export function isTalkFree(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  if (p.overseasListed) return false
  return true
}

/**
 * 「譲ります」と返事をして、決着（次のレース）を待っている選手か。
 *
 * ★この状態の選手を**GMが別の形で処分できてはいけない**。
 *   返事は出したが選手はまだ在籍しているので、トレード・貸出・売出の候補に出てしまい、
 *   1人の選手を二重に処分できた（トレードを成立させたあとに移籍も承諾できる、の正体）。
 *   他クラブからの上乗せは受けたいので、止めるのはGM側の処分だけ（canBePoached は通す）
 */
function saleAnswered(p: Player, ctx: EligibilityCtx): boolean {
  return !!ctx.saleAnsweredIds?.has(p.id)
}

/** 他クラブが移籍の話を持ちかけていい選手か（引き抜き・フリー接触の共通の土台） */
function canBeApproached(p: Player, ctx: EligibilityCtx): boolean {
  // 加入から `TRANSFER_LOCK_YEARS` 年は、他クラブからの話だけ止める（レンタルは通る）
  return isTalkFree(p, ctx) && !isTransferLocked(p, ctx.currentYear)
}

/**
 * 他クラブが移籍金を払って引き抜きに来ていい選手か。
 * 国内オファー・売出への入札・CPUの自動購入・海外からの飛び込みオファー、すべてこれ
 */
export function canBePoached(p: Player, ctx: EligibilityCtx): boolean {
  return canBeApproached(p, ctx) && !p.noSale
}

/**
 * そのクラブは、この選手にもう一度話を持ちかけていいか。
 *
 * 本人が「あのクラブへは行かない」と断った相手は、今季それ以上打診してこない。
 * ★止めるのは断られたクラブだけ。全クラブを止めると、格下を蹴ったせいで
 *   あとから来るはずの格上の話まで消えて、「待つか諦めるか」のせめぎ合いが成立しない
 */
export function canClubApproachAgain(p: Player, clubId: string, currentYear?: number): boolean {
  const y = currentYear ?? 0
  return y <= 0 || (p.saleRefused?.[clubId] ?? 0) !== y
}

/**
 * 契約切れ間近の選手に、他クラブがフリー移籍の接触をしていいか。
 * 非売品の設定は「移籍金を払っての売却を断る」という意味なので、契約が切れる選手には効かない
 */
export function canReceiveFreeContact(p: Player, ctx: EligibilityCtx): boolean {
  return canBeApproached(p, ctx)
}

/**
 * 海外挑戦を承認した選手に、希望地域のクラブから指名オファーが来ていいか。
 * これは本人とGMが望んだ移籍なので、加入1年目でも止めない。
 * isTalkFree は overseasListed で false になるので、ここだけ土台を使わず自前で書く
 */
export function canGoOverseasDream(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  if (p.noSale) return false
  return !!p.overseasListed
}

/**
 * GMがこの選手を売りに出していいか（売出リストへの出品・移籍の容認）。
 * ここだけ引退を見ていなかったので、「引退します」と言っている選手を移籍容認でき、
 * そのあとCPUが勝手に買っていた
 */
export function canListForSale(p: Player, ctx: EligibilityCtx): boolean {
  return isTalkFree(p, ctx) && !saleAnswered(p, ctx)
}

/**
 * GMが「来た買い取りオファー」を受けて、この選手を放出していいか。
 * 受ける処理（acceptIncomingOffer / counterIncomingOffer）は判定を一つも通しておらず、
 * 引退の話が決まっている選手でもそのまま移籍が成立していた。
 * 海外挑戦を承認した選手だけは、海外クラブからのオファーが本人の望んだ話なので通す
 */
export function canAcceptOfferFor(p: Player, ctx: EligibilityCtx, fromForeign?: boolean): boolean {
  if (isTalkFree(p, ctx)) return true
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  return !!p.overseasListed && !!fromForeign
}

/**
 * GMがこの選手をトレードで放出していいか。
 * 相手クラブから受け取る側は canBePoached（引き抜きと同じ条件）を使う
 */
export function canTradeAway(p: Player, ctx: EligibilityCtx): boolean {
  return isTalkFree(p, ctx) && !saleAnswered(p, ctx)
}

/**
 * もうこのクラブで来季を迎えないと決まっている選手か。
 *   ・引退を承認した（pendingRetirementYear）
 *   ・海外挑戦を承認した（overseasListed）
 *   ・退団予定＝売出に出した／移籍を容認した（transferListed）
 *
 * 「新しい用件をこの選手に出さない」ための判定。isTalkFree に transferListed を
 * 入れなかったのは、退団予定の選手こそオファーを受けたりトレードに出したりする
 * 相手だから。**新しい話を始めるか**と**来た話を受けるか**は別物として分けてある
 */
export function isLeavingClub(p: Player): boolean {
  return p.pendingRetirementYear != null || !!p.overseasListed || !!p.transferListed
}

/**
 * この選手と来季の契約の話を始めていいか。
 * ここが引退を見ていなかったので、同じ選手から「引退したい」と「契約を更新したい」が
 * 同時に来ていた。退団予定（移籍を容認した）の選手にも出さない。
 * ここを見ていなかったせいで、移籍を認めた直後に引き留めの条件が出ていた
 */
export function canStartContractTalk(p: Player, ctx: EligibilityCtx): boolean {
  return isTalkFree(p, ctx) && !p.transferListed
}

/**
 * この選手が「移籍したい」と言い出していいか。
 * 引退を承認した選手が数レース後に移籍を直訴してくるのを止める。
 * すでに売出に出している選手も、いまさら直訴させない
 */
export function canWishTransfer(p: Player, ctx: EligibilityCtx): boolean {
  return isTalkFree(p, ctx) && !p.transferListed
}

/**
 * GMがこの選手をレンタルに出していいか（売出と貸出は排他）。
 *
 * ★**非売（noSale）はレンタルも止めます**（2026-08-12・オーナー判断）。
 *   「レンタル歓迎（loanListed）」という別のボタンがあるので、**そちらが opt-in**。
 *   非売＝「この選手の話は持ってくるな」であって、買い取りだけを断る印ではない。
 *
 *   一時期「noSale は買い取りだけを止める」で運用していたが、実測で
 *   **全員を非売にしても打診は 2.56件／年 → 2.50件／年 でほとんど減らなかった**。
 *   オーナーの「非売にしてるのにレンタルが来る」はこれ。
 */
export function canLoanOut(p: Player, ctx: EligibilityCtx): boolean {
  return isTalkFree(p, ctx) && !p.transferListed && !saleAnswered(p, ctx) && !p.noSale
}
