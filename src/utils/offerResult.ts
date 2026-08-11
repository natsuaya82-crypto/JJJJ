// 「他クラブから来た買い取りオファー」に返事をしたときの結果を、1つの言葉で表すためのファイル。
//
// もともとは承諾(acceptIncomingOffer)が true/false、逆提示(counterIncomingOffer)が
// 'sold'|'refused'|'invalid' と別々の返り値で、しかも結果の文章がチャット画面と移籍画面の
// 合計4箇所に手書きされていた。そのせいで、
//   ・自チームが15人ちょうどで放出できなかっただけなのに
//     「相手が金を払えず決裂しました」という嘘の理由が出る
//   ・同じ15人下限なのに、承諾は札が残る／逆提示は札が消えて再交渉できない
// という食い違いが起きていた。
//
// 返り値の種類と、その文章はここ1箇所で決める。処理側は種類を返すだけ、画面側は
// 受け取った種類を渡すだけにすること。
import { ROSTER_MIN } from '../data/rosterRules'

import { fmtYen } from './money'

export type OfferOutcome =
  | 'sold'        // 成立。選手は移籍した
  | 'refused'     // 相手クラブがその額に応じなかった（逆提示でのみ起きる）
  | 'refused_by_player'  // クラブは合意したが、本人が行くことを断った。今季はこの選手への打診が来なくなる
  | 'roster_min'  // 自チームが下限人数。放出できない。オファーの札は残す
  | 'invalid'     // 選手が対象外になった（引退の話が決まった等）。札は取り下げる
  | 'pending'     // 譲ると返事はした。決着は次のレース（その間に他クラブが上乗せしてくる）


// 結果の見せ方。ok が true のときだけ緑（成功）で出す
export function offerResultText(
  outcome: OfferOutcome,
  // reason: 本人が断ったときの理由（utils/transferDecision の Appraisal.reason）。
  // 「断りました」だけだと何が引っかかったのか分からないので、渡された場合は続けて出す
  a: { playerName: string; teamName: string; price: number; reason?: string },
): { text: string; ok: boolean } {
  switch (outcome) {
    case 'sold':
      return a.price > 0
        ? { text: `${a.playerName}を${a.teamName}へ売却しました（移籍金${fmtYen(a.price)}を獲得）`, ok: true }
        : { text: `${a.playerName}を${a.teamName}へフリー移籍で放出しました`, ok: true }
    case 'refused':
      return { text: `${a.teamName}は${fmtYen(a.price)}を支払えず、交渉は決裂しました`, ok: false }
    case 'refused_by_player':
      return { text: `${a.playerName}が${a.teamName}への移籍を断りました。${a.reason ? `${a.reason}とのことです。` : ''}今季はこの話は進みません`, ok: false }
    case 'roster_min':
      return { text: `ロスターが下限の${ROSTER_MIN}人のため、${a.playerName}を放出できません。補強してから改めて返事をしてください（オファーはそのまま残っています）`, ok: false }
    case 'pending':
      return { text: `${a.teamName}へ譲ると返事をしました。次のレースまでに他クラブが上乗せしてくることがあります。最終的な移籍先は${a.playerName}が選びます`, ok: true }
    case 'invalid':
      return { text: `${a.playerName}は移籍の対象外になったため、${a.teamName}のオファーは取り下げられました`, ok: false }
  }
}
