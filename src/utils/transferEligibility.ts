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

export type EligibilityCtx = {
  /** 判定の基準になる所属チームID。この選手が「そのチームの持ち物か」を見る */
  teamId: string
  /** 今のシーズン年。0や未指定なら「加入1年目」の判定をしない */
  currentYear?: number
  /** 引退希望を受理済みの選手ID。引退の話をしている選手に移籍話は持ちかけない */
  retiringIds?: Set<string>
}

/** 今季加入した選手か。1シーズンに何度も移籍させないための判定 */
export function isNewJoin(p: Player, currentYear?: number): boolean {
  return (currentYear ?? 0) > 0 && p.joinedYear === currentYear
}

/** 引退希望を受理済みか */
export function isRetiring(p: Player, retiringIds?: Set<string>): boolean {
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
 * 他クラブが移籍の話を持ちかけていい選手か（共通の土台）。
 * 個別の用途では下の canBePoached / canReceiveFreeContact を使う
 */
function canBeApproached(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  // 海外挑戦を承認した選手は「海外からの話を待つ」と本人に言っているので、
  // 国内の移籍話（オファー・入札・CPUの買い取り）は一切来ない
  if (p.overseasListed) return false
  if (isNewJoin(p, ctx.currentYear)) return false
  return true
}

/**
 * 他クラブが移籍金を払って引き抜きに来ていい選手か。
 * 国内オファー・売出への入札・CPUの自動購入・海外からの飛び込みオファー、すべてこれ
 */
export function canBePoached(p: Player, ctx: EligibilityCtx): boolean {
  if (!canBeApproached(p, ctx)) return false
  if (p.noSale) return false
  return true
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
 * これは本人とGMが望んだ移籍なので、加入1年目でも止めない
 */
export function canGoOverseasDream(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  if (p.noSale) return false
  return !!p.overseasListed
}

/**
 * GMがこの選手を売りに出していいか（売出リストへの出品・移籍の容認）。
 * 海外挑戦を承認済みの選手を国内市場に出すと、承認した話と矛盾するので出せない
 */
export function canListForSale(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (p.overseasListed) return false
  return true
}

/**
 * GMがこの選手をトレードで放出していいか。
 * 相手クラブから受け取る側は canBePoached（引き抜きと同じ条件）を使う
 */
export function canTradeAway(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  if (p.overseasListed) return false
  return true
}

/** GMがこの選手をレンタルに出していいか */
export function canLoanOut(p: Player, ctx: EligibilityCtx): boolean {
  if (!isOwnedBy(p, ctx.teamId)) return false
  if (isRetiring(p, ctx.retiringIds)) return false
  if (p.overseasListed) return false
  return true
}
