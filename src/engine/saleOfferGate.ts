// 「他クラブから届いた買い取り打診に、いま返事をしていいか」の関門。marketSlice から切り出した（挙動不変）。
//
// ■なぜ1本にするのか
//   返事の入口は2つ（承諾 acceptIncomingOffer ／ 逆提示 counterIncomingOffer）あって、
//   どちらも同じ関門を同じ順で通す必要がある。以前はそれぞれに手書きされていて、
//   実際に食い違っていた：
//     ・承諾には判定が1つも無く、引退の話が決まっている選手でもそのまま移籍が成立していた
//     ・同じ「ロスター下限」なのに、承諾は札を残し、逆提示は札を消して再交渉できなくなっていた
//   関門の**順番**にも意味があるので（下）、順番ごとここに置く。
//
// ■通す順番と、落ちたときの札の扱い
//   1. その選手を出していいか（canAcceptOfferFor）
//        → だめなら invalid。**札は取り下げる**（もう成立しようが無いので、押しても
//          何も起きない札を残さない）
//   2. 出すとロスター下限(ROSTER_MIN)を割らないか（canReleaseFromRoster）
//        → だめなら roster_min。**札は残す**。相手が金を出せなかったわけではなく、
//          こちらの都合なので、補強してから改めて返事ができる
//
//   「札を落とすかどうか」は関門の答えの一部なので、呼ぶ側で決めないこと（決めさせると
//   また2箇所に分かれる）。返り値の dropOffer をそのまま使う。
//
// ■ここでやらないこと
//   ・本人が行くかどうか（consentToLeave）… store の他のアクションを呼ぶ必要があり、
//     しかも承諾では「1レース待つ(pending)」を挟んだ**あと**に判定する。関門2つとは
//     位置が違うのでここには入れない
//   ・移籍金に応じるかどうか（willingFeeFor）… 逆提示にしか無い判定
import { canReleaseFromRoster } from '../data/rosterRules'
import type { GameState, Player } from '../types'
import { canAcceptOfferFor, eligibilityCtx } from '../utils/transferEligibility'

export type SaleGate =
  /** 関門を通った。player は探し直さずこれを使う */
  | { ok: true; player: Player }
  /** 対象外になった。札は取り下げる */
  | { ok: false; outcome: 'invalid'; dropOffer: true }
  /** ロスター下限。札は残す */
  | { ok: false; outcome: 'roster_min'; dropOffer: false }

export function judgeSaleOffer(
  state: Pick<GameState, 'players' | 'playerTeamId' | 'currentSeason'>,
  offer: { playerId: string; fromForeign?: boolean },
): SaleGate {
  const player = state.players.find(p => p.id === offer.playerId)
  // 借りている選手の売却は canAcceptOfferFor の中の isOwnedBy が弾く
  if (!player || !canAcceptOfferFor(player, eligibilityCtx(state.currentSeason, state.playerTeamId), offer.fromForeign)) {
    return { ok: false, outcome: 'invalid', dropOffer: true }
  }
  if (!canReleaseFromRoster(state.players, state.playerTeamId)) {
    return { ok: false, outcome: 'roster_min', dropOffer: false }
  }
  return { ok: true, player }
}

/**
 * 本人が「行かない」と決めたことを控える。
 *
 * ★**断られたクラブだけ**を今季止める。全クラブを止めると「格下を蹴って、あとから来る
 *   格上へ行く」ができなくなる（判定は utils/transferEligibility の canClubApproachAgain）。
 */
export function withSaleRefused(players: Player[], playerId: string, clubId: string, year: number): Player[] {
  return players.map(p => p.id === playerId
    ? { ...p, saleRefused: { ...(p.saleRefused ?? {}), [clubId]: year } }
    : p)
}
