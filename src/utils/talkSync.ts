import type {
  AcquisitionOffer,
  ContractRequest,
  IncomingLoanOffer,
  IncomingOffer,
  LoanRequest,
  OverseasRegion,
  Player,
  TradeNegotiation,
  TransferListing,
} from '../types'
import { belongsToClub } from './rosterSync'

// ============================================================================
// 「選手が動いたら、その選手についての話は全部たたむ」を扱う唯一の場所。
//
// ■なぜ要るのか
//   交渉ごと（オファー・レンタル打診・トレード・契約更新・移籍希望・海外挑戦…）は
//   シーズンのデータに札として積まれる。ところが選手が別のクラブへ移ったり引退したりしても、
//   その札を片付ける処理が話ごとに手書きで、付いている所と付いていない所があった。
//     ・契約更新の要求は「期限切れ」でしか消えず、選手が退団しても残っていた
//     ・逆提示で売れたときだけ移籍リストの掃除が抜けていた
//     ・トレード交渉は一度も見直されず、対象がよそへ移ったあとでも「条件を飲んで成立」が押せた
//       （押すと、その選手を今のクラブから引き抜いて、こちらの選手は最初の相手へ送ってしまう）
//   チャットのおかしな挙動は、だいたいこの「古い札」が原因。
//
// ■考え方
//   所属の唯一の決まり（rosterSync の belongsToClub）だけを見て、
//   「その話の前提になっているクラブに、今もその選手が居るか」で判定する。
//   前提が崩れている札だけを片付ける。判断の中身（値段が妥当かなど）には一切触らない。
//
// ■ここでやること / やらないこと
//   やる   … 前提が崩れた札を消す。トレード交渉だけは消さずに「破談」にして理由を出す
//            （黙って消えると、出した提案がどこへ行ったのか分からなくなるため）
//   やらない… まだ動ける札の中身を変えること、期限切れの判定（各処理のまま）、
//            決着済み（成立・拒否）の札の片付け（履歴として残す）
// ============================================================================

// 片付けの対象になる、シーズンの交渉リスト。currentSeason をそのまま渡せる形にしてある
export type TalkLists = {
  transferListings?: TransferListing[]
  incomingOffers?: IncomingOffer[]
  incomingLoanOffers?: IncomingLoanOffer[]
  loanRequests?: LoanRequest[]
  tradeNegotiations?: TradeNegotiation[]
  contractRequests?: ContractRequest[]
  acquisitionOffers?: AcquisitionOffer[]
  retirementRequests?: { playerId: string; age: number }[]
  transferRequests?: { playerId: string; reason: 'playing_time' | 'team_performance' | 'unhappy' }[]
  overseasRequests?: { playerId: string; region: OverseasRegion }[]
}

// 前提が崩れたトレード交渉に出す文言。押した瞬間に弾く側（acceptTradeCounter）でも同じ文言を使う
export const STALE_TRADE_MSG = '対象の選手はすでに別のクラブへ移っている。この話は白紙だ。'

/**
 * 交渉リストを今の所属と突き合わせ、前提が崩れた札を片付けて返す。
 * 何も変わらなければ渡されたオブジェクトをそのまま返す（無駄な再描画とセーブ書き込みを避ける）。
 */
export function reconcileTalks<T extends TalkLists>(talks: T, players: Player[], myTeamId: string): T {
  const byId = new Map<string, Player>()
  for (const p of players) byId.set(p.id, p)

  // そのクラブに今も居るか。居ない・引退・そもそも見つからない、は全部「前提が崩れた」
  const at = (playerId: string, clubId: string): boolean => {
    const p = byId.get(playerId)
    return !!p && !!clubId && belongsToClub(p, clubId)
  }
  // 引退した／データから消えた
  const gone = (playerId: string): boolean => {
    const p = byId.get(playerId)
    return !p || p.status === 'retired'
  }

  const changed: TalkLists = {}
  // 同じ中身なら差し替えない
  const put = <K extends keyof TalkLists>(key: K, before: TalkLists[K], after: NonNullable<TalkLists[K]>) => {
    if (!before) return
    const b = before as unknown[]
    if (b.length === after.length && (after as unknown[]).every((x, i) => x === b[i])) return
    changed[key] = after as TalkLists[K]
  }

  // 出品：出しているクラブに今も居ること。自チームだけでなくCPUの出品もあるので fromTeamId で見る
  put('transferListings', talks.transferListings,
    (talks.transferListings ?? []).filter(l => at(l.playerId, l.fromTeamId)))

  // 他クラブから自チームの選手への購入オファー：その選手が自チームに居ること
  put('incomingOffers', talks.incomingOffers,
    (talks.incomingOffers ?? []).filter(o => at(o.playerId, myTeamId)))

  // レンタル打診：貸してほしい＝自チームの選手／借りませんか＝相手クラブの選手
  put('incomingLoanOffers', talks.incomingLoanOffers,
    (talks.incomingLoanOffers ?? []).filter(o =>
      at(o.playerId, o.direction === 'lend_out' ? myTeamId : o.fromTeamId)))

  // 自分から出したレンタル要請：相手クラブに今も居ること
  put('loanRequests', talks.loanRequests,
    (talks.loanRequests ?? []).filter(r => at(r.playerId, r.targetTeamId)))

  // トレード交渉：出す選手が自チームに、もらう選手が相手クラブに居ること。
  // 崩れていたら消さずに破談にする（成立ボタンを押せなくする）
  put('tradeNegotiations', talks.tradeNegotiations,
    (talks.tradeNegotiations ?? []).map(n => {
      if (n.status !== 'countered') return n
      const okGive = [...n.giveIds, ...(n.demandAddIds ?? [])].every(id => at(id, myTeamId))
      const okGet = n.getIds.every(id => at(id, n.targetTeamId))
      return okGive && okGet ? n : { ...n, status: 'rejected' as const, message: STALE_TRADE_MSG }
    }))

  // 契約更新：まだ応対できる状態のものだけ。決着済み(accepted/rejected)は履歴として残す
  put('contractRequests', talks.contractRequests,
    (talks.contractRequests ?? []).filter(r =>
      (r.status !== 'pending_gm' && r.status !== 'countered') || at(r.playerId, myTeamId)))

  // 獲得交渉：まだ応対できるものだけ見る。
  //   fa   … トレードで加入した選手の契約詰めもここに乗るので「自チームに居る」も正。
  //          よそのクラブへ入ったときだけ話が消える
  //   scout… 他クラブからの引き抜き。移った先で続けても話は成り立つので、引退・消失のみ
  put('acquisitionOffers', talks.acquisitionOffers,
    (talks.acquisitionOffers ?? []).filter(o => {
      if (o.status !== 'pending' && o.status !== 'countered') return true
      if (gone(o.playerId)) return false
      if (o.source === 'scout') return true
      const teamId = byId.get(o.playerId)?.teamId ?? ''
      return teamId === '' || teamId === myTeamId
    }))

  // 選手からの直訴（引退したい・移籍したい・海外に行きたい）は自チームの選手のものだけ
  put('retirementRequests', talks.retirementRequests,
    (talks.retirementRequests ?? []).filter(r => at(r.playerId, myTeamId)))
  put('transferRequests', talks.transferRequests,
    (talks.transferRequests ?? []).filter(r => at(r.playerId, myTeamId)))
  put('overseasRequests', talks.overseasRequests,
    (talks.overseasRequests ?? []).filter(r => at(r.playerId, myTeamId)))

  return Object.keys(changed).length === 0 ? talks : { ...talks, ...changed }
}
