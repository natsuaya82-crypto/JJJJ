// 契約更新の話まわりの判断を、ここ1箇所にまとめたもの。
//
// ■なぜ要るのか
//   「この選手と契約更新の話をしていいか」「今その話は進行中か」「残り何ヶ月か」を、
//   ストア(generateContractRequests)・チャット(ChatPage)・通知(notifItems)・
//   ホーム(Dashboard)・レース後(ResultsPhase) がそれぞれ手書きで数えていた。
//   条件が少しずつ違うので、次のような食い違いが実際に起きていた。
//     ・チャットには出ないのにホームだけ「契約未解決の選手が3人います」と言う
//     ・レース後に通知へ強制で飛ばされるが、その通知ページには何も出ていない
//     ・ケガをした瞬間、契約更新の用件がチャットからも通知からも消える
//       （どこも status === 'active' で数えていて、'injured' が抜け落ちていた）
//
// ■一番大きかった不具合（契約更新のチャットが出てこない）
//   契約更新の札(ContractRequest)は、放置すると自動で status:'rejected' になる。
//   ところが「今季もう話しかけた選手か」の判定が status を見ずに札の有無だけを見ていたので、
//   一度も応対していない選手が、期限切れになった瞬間から**そのシーズン二度と
//   契約更新の話に出てこなくなっていた**。移籍を容認してから取り消した場合も同じ。
//   なので札の状態は次の2つしか無い、と決める。
//     進行中 (pending_gm / countered) … まだGMが応対できる
//     決着   (accepted / rejected)     … GMが応対した結果。履歴として残す
//   期限切れや状況の変化で閉じるものは「決着」にせず**札ごと消す**（履歴に残さない）。
//   そうすれば「札がある＝もう話しかけた」が常に正しくなる。
//
// 新しい条件を足すときは必ずこのファイルの関数に足すこと。
// 呼び出し側に直接 r.status や p.transferListed を書かないこと
// （scripts/check-contract-talk.ts が検出する）。
import type { ContractRequest, IncomingOffer, Player } from '../types'
import { canStartContractTalk } from './transferEligibility'
import { saleAnsweredIds, type SaleAnswerSeason } from './saleAnswer'

/** 交渉は最大3ラウンド。ここを見ずに round を進めない */
export const MAX_CONTRACT_ROUNDS = 3

/** 「要対応」として通知・ホーム・チャット一覧に載せ始める、契約残りの月数 */
export const RENEWAL_ATTENTION_MONTHS = 6
/**
 * レース後に通知ページへ強制で飛ばす、契約残りの月数。
 * 「要対応」より切迫したものだけ。以前はここが3ヶ月だったのを、判定を1本化したときに
 * うっかり要対応と同じ6ヶ月へ広げてしまい、**レースのたびに通知へ飛ばされる**ようになっていた
 */
export const RENEWAL_URGENT_MONTHS = 3

/**
 * いま選手が求めている年俸。**要求額はここ1本。**
 *
 * ラウンドが進むほど選手は強気になる（1ラウンドにつき+3%）。50万円刻みに丸める。
 *
 * ■なぜ1本にしたのか
 *   同じ式が4か所にあった。チャットで**見せる**側が3か所（ChatPage）、
 *   実際に**承諾するか判定する**側が1か所（gameStore）。別々に書いてあるので、
 *   +3% や刻みを片方だけ触ると「提示した額どおりに払ったのに蹴られる」が起きる。
 */
export function effectiveDemandSalary(r: Pick<ContractRequest, 'demandSalary' | 'round'>): number {
  const roundFactor = 1 + (r.round - 1) * 0.03
  return Math.round(r.demandSalary * roundFactor / 500000) * 500000
}

/** 契約残りの月数。チャットの表示・通知のリマインダー・ホームの警告が全部この式を使う */
export function contractMonthsLeft(yearsLeft: number, raceIndex: number, totalRaces: number): number {
  return Math.round((yearsLeft - 1 + Math.max(0, totalRaces - raceIndex) / Math.max(1, totalRaces)) * 12)
}

/** まだGMが応対できる札か。これ以外(accepted/rejected)は決着済みの履歴 */
export function isLiveContract(r: ContractRequest): boolean {
  return r.status === 'pending_gm' || r.status === 'countered'
}

/** その選手の進行中の札。チャットのボタンも通知の件数もこれだけを見る */
export function liveContractOf(reqs: ContractRequest[] | undefined, playerId: string): ContractRequest | undefined {
  return (reqs ?? []).find(r => r.playerId === playerId && isLiveContract(r))
}

/**
 * その選手について今季すでに札があるか（＝もう契約の話をした）。
 * 進行中でも決着済みでも「もう話した」。期限切れの札は消えている前提なので、
 * これが true なら本当にGMが応対した話がある
 */
export function hasContractTalk(reqs: ContractRequest[] | undefined, playerId: string): boolean {
  return (reqs ?? []).some(r => r.playerId === playerId)
}

/** フリー移籍（移籍金0円）で他クラブが接触中の選手ID */
export function freeContactIdsOf(offers: IncomingOffer[] | undefined): Set<string> {
  return new Set((offers ?? []).filter(o => o.offeredPrice === 0).map(o => o.playerId))
}

export type ContractTalkCtx = {
  teamId: string
  year: number
  /** 引退したいと言ってきていて、まだGMが返事をしていない選手のID */
  retiringIds: Set<string>
  /** フリー移籍で他クラブが接触中の選手ID */
  freeContactIds: Set<string>
  /** 売却の返事をして、行き先が決まるのを待っている選手ID（utils/saleAnswer） */
  saleAnsweredIds: Set<string>
  contractRequests: ContractRequest[]
}

type SeasonLike = {
  year: number
  contractRequests?: ContractRequest[]
  incomingOffers?: IncomingOffer[]
  retirementRequests?: { playerId: string }[]
} & SaleAnswerSeason

/** currentSeason から判定に必要なものを1回で取り出す。呼び出し側で組み立て直さないこと */
export function contractTalkCtx(season: SeasonLike, teamId: string): ContractTalkCtx {
  return {
    teamId,
    year: season.year,
    retiringIds: new Set((season.retirementRequests ?? []).map(r => r.playerId)),
    freeContactIds: freeContactIdsOf(season.incomingOffers),
    saleAnsweredIds: saleAnsweredIds(season),
    contractRequests: season.contractRequests ?? [],
  }
}

/**
 * ★ここが土台★ GMのほうから契約の話を持ちかけていい選手か。
 *
 * canStartContractTalk（借り物でない・引退の話をしていない・海外挑戦を承認していない・
 * 退団予定でない）に、「最終ラウンドで決裂した選手は来年まで持ちかけない」を足しただけ。
 * フリー移籍で他クラブが接触中でも**GMからの引き留めは通す**。ここを止めていたせいで、
 * 「引き留めの条件を提示する」を押しても札が作られず、選手が何も返さない空振りになっていた
 */
/**
 * 売ると返事をして、行き先が決まるのを待っている選手か。
 *
 * **契約の話を止めるかどうかは、必ずこれで見ること。**
 * 以前はここの判定が canOfferRenewal（＝札を作るとき）の中にだけ書いてあった。
 * そのため「まだ札が無い選手」には出なくなったが、**売ると返事をする前から
 * 出ていた札のボタンはそのまま残っていた**。
 * 「ジュネーブに1.9億でお譲りします」の下に「要求を飲む（3800万/2年）」が並ぶ状態。
 */
export function isSaleAnswerPending(p: Player, ctx: ContractTalkCtx): boolean {
  return ctx.saleAnsweredIds.has(p.id)
}

export function canOfferRenewal(p: Player, ctx: ContractTalkCtx): boolean {
  if (!canStartContractTalk(p, { teamId: ctx.teamId, currentYear: ctx.year, retiringIds: ctx.retiringIds })) return false
  if ((p.renewalLockedUntilYear ?? 0) > ctx.year) return false
  if (isSaleAnswerPending(p, ctx)) return false
  return true
}

/**
 * 選手のほうから契約更新を言い出していい状態か（札の自動生成用）。
 * 他クラブと接触中の選手は用件が二重になるので、本人からは言い出さない
 */
export function canRequestRenewal(p: Player, ctx: ContractTalkCtx): boolean {
  return canOfferRenewal(p, ctx) && !ctx.freeContactIds.has(p.id)
}

/**
 * 契約更新の「要対応」を出す相手か。
 * 通知のリマインダー・チャット一覧の赤札・ホームの警告・レース後の強制遷移が、
 * 全部この1つを見る。以前はこの4つが別々の条件だったので数字も行き先も食い違っていた
 */
export function needsRenewalAttention(p: Player, months: number, ctx: ContractTalkCtx): boolean {
  if (!canRequestRenewal(p, ctx)) return false
  if (p.contract.yearsLeft > 1) return false
  if (months >= RENEWAL_ATTENTION_MONTHS) return false
  // まだ一度も話していない
  if (!hasContractTalk(ctx.contractRequests, p.id)) return true
  // 一度断られたが、まだ条件を変えて出し直せる。
  // ここを見ていなかったので、1回目で断られた選手が通知からもホームからも消えて、
  // GMが気づかないまま契約満了になっていた（チャットを開けば出し直せる状態のまま）
  return ctx.contractRequests.some(r => r.playerId === p.id && canReNegotiate(r, p, ctx))
}

/**
 * レース後に通知ページへ強制で飛ばす相手か。
 * 「要対応」の中でも本当に切迫したものだけに絞る（飛ばされる回数を増やさないため）
 */
export function isUrgentRenewal(p: Player, months: number, ctx: ContractTalkCtx): boolean {
  return months < RENEWAL_URGENT_MONTHS && needsRenewalAttention(p, months, ctx)
}

/** 条件を変えてもう一度提示していいか（ラウンド上限と更新ロックをここで見る） */
export function canReNegotiate(r: ContractRequest, p: Player | undefined, ctx: ContractTalkCtx): boolean {
  if (r.status !== 'countered' && r.status !== 'rejected') return false
  if (r.round >= MAX_CONTRACT_ROUNDS) return false
  if (!p) return false
  return canOfferRenewal(p, ctx)
}
