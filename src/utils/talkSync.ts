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
  ChatMessage,
} from '../types'
import { belongsToClub } from './rosterSync'
import { isLeavingClub } from './transferEligibility'
import { isLiveContract } from './contractTalk'
import { keepSaleAnswers, type SaleAnswerSeason } from './saleAnswer'

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
  chatLogs?: Record<string, ChatMessage[]>
} & SaleAnswerSeason

// 前提が崩れたトレード交渉に出す文言。押した瞬間に弾く側（acceptTradeCounter）でも同じ文言を使う
export const STALE_TRADE_MSG = '対象の選手はすでに別のクラブへ移っている。この話は白紙だ。'
// 引退・海外挑戦の話が決まった選手をトレードに出そうとしていたとき
export const SETTLED_TRADE_MSG = '対象の選手はすでに進路が決まっている。この話は白紙だ。'

/**
 * その選手の進路がもう決まっているか。決まっていれば移籍まわりの札は全部たたむ。
 *
 *   'retiring' … 引退を承認した（今季限りで引退。ロスターから外れるのはシーズン終わり）
 *   'overseas' … 海外挑戦を承認した（海外からの話だけ待つ。国内の話は受けない）
 *
 * この2つは承認しても選手がロスターに残るので、belongsToClub では「前提が崩れた」と
 * 判定できない。承認処理の側で消していたのは引退希望と契約更新の2つだけで、
 * 買い取りオファー・レンタル打診・トレード・移籍希望・売出は残ったままだった。
 * **「引退します」と言った選手がそのままよそへ移籍する**のがこれ。
 */
export function settledPath(p: Player | undefined): 'retiring' | 'overseas' | null {
  if (!p) return null
  if (p.pendingRetirementYear != null) return 'retiring'
  if (p.overseasListed) return 'overseas'
  return null
}

/**
 * その選手が今「直訴の札」を持っているか調べるための一覧。
 *
 * 直訴（引退したい・移籍したい・海外に行きたい）は1人につき同時に1つだけ、が決まり。
 * 3つのリストを別々に抽選していたので、同じ選手が「移籍したい」と「海外に行きたい」を
 * 同時に持ててしまい、ベルは2件なのにチャットには1行、という数のズレになっていた。
 * 抽選する側はここを見て「もう何か言っている選手」を外す。
 */
export function openWishIds(talks: TalkLists): Set<string> {
  const s = new Set<string>()
  for (const r of talks.retirementRequests ?? []) s.add(r.playerId)
  for (const r of talks.overseasRequests ?? []) s.add(r.playerId)
  for (const r of talks.transferRequests ?? []) s.add(r.playerId)
  return s
}

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
  // 進路がもう決まっている（引退を承認した／海外挑戦を承認した）
  const settled = (playerId: string) => settledPath(byId.get(playerId))
  // 国内の移籍話を持ちかけていい相手か。進路が決まっていたら一切だめ
  const openToDomestic = (playerId: string): boolean => settled(playerId) === null
  // もうこのクラブで来季を迎えないと決まっている（上の2つ＋退団予定）。
  // 新しい用件（契約更新・引退したい・移籍したい・海外に行きたい）はこの選手に出さない。
  // 売出そのものは openToDomestic 側で見る（退団予定の選手の出品を消してはいけない）
  const leaving = (playerId: string): boolean => {
    const p = byId.get(playerId)
    return !!p && isLeavingClub(p)
  }

  const changed: TalkLists = {}
  // 同じ中身なら差し替えない
  const put = <K extends keyof TalkLists>(key: K, before: TalkLists[K], after: NonNullable<TalkLists[K]>) => {
    if (!before) return
    const b = before as unknown[]
    const a = after as unknown[]
    if (b.length === a.length && a.every((x, i) => x === b[i])) return
    changed[key] = after as TalkLists[K]
  }

  // 出品：出しているクラブに今も居ること。自チームだけでなくCPUの出品もあるので fromTeamId で見る。
  // 進路が決まった選手（引退承認・海外承認）は国内の売出から下げる
  put('transferListings', talks.transferListings,
    (talks.transferListings ?? []).filter(l => at(l.playerId, l.fromTeamId) && openToDomestic(l.playerId)))

  // 他クラブから自チームの選手への購入オファー：その選手が自チームに居ること。
  // 引退を承認したら海外からのぶんも含めて全部たたむ。
  // 海外挑戦を承認した選手は、海外クラブからのオファーだけ残す（本人が望んだ話なので）
  put('incomingOffers', talks.incomingOffers,
    (talks.incomingOffers ?? []).filter(o => {
      if (!at(o.playerId, myTeamId)) return false
      const s = settled(o.playerId)
      if (s === 'retiring') return false
      if (s === 'overseas') return !!o.fromForeign
      return true
    }))

  // 「譲ります」と返事をした記録は、この関数の最後にまとめて片付ける（saleKeep）

  // レンタル打診：貸してほしい＝自チームの選手／借りませんか＝相手クラブの選手。
  // 貸してほしい側は、進路が決まった選手なら断るまでもなく取り下げ
  put('incomingLoanOffers', talks.incomingLoanOffers,
    (talks.incomingLoanOffers ?? []).filter(o =>
      at(o.playerId, o.direction === 'lend_out' ? myTeamId : o.fromTeamId)
      && (o.direction !== 'lend_out' || openToDomestic(o.playerId))))

  // 自分から出したレンタル要請：相手クラブに今も居ること
  put('loanRequests', talks.loanRequests,
    (talks.loanRequests ?? []).filter(r => at(r.playerId, r.targetTeamId)))

  // トレード交渉：出す選手が自チームに、もらう選手が相手クラブに居ること。
  // 崩れていたら消さずに破談にする（成立ボタンを押せなくする）
  put('tradeNegotiations', talks.tradeNegotiations,
    (talks.tradeNegotiations ?? []).map(n => {
      if (n.status !== 'countered') return n
      const ids = [...n.giveIds, ...(n.demandAddIds ?? []), ...n.getIds]
      if (ids.some(id => settled(id) !== null)) return { ...n, status: 'rejected' as const, message: SETTLED_TRADE_MSG }
      const okGive = [...n.giveIds, ...(n.demandAddIds ?? [])].every(id => at(id, myTeamId))
      const okGet = n.getIds.every(id => at(id, n.targetTeamId))
      return okGive && okGet ? n : { ...n, status: 'rejected' as const, message: STALE_TRADE_MSG }
    }))

  // 契約更新：まだ応対できる状態のものだけ。決着済み(accepted/rejected)は履歴として残す。
  // 進路が決まった選手・退団予定の選手と来季の年俸の話をしても仕方がないので取り下げる。
  // 移籍を容認したときに札を「拒否」で残していたせいで、容認を取り消しても
  // その選手には二度と契約更新の話が出てこなくなっていた。ここで消せばその跡は残らない
  put('contractRequests', talks.contractRequests,
    (talks.contractRequests ?? []).filter(r =>
      !isLiveContract(r) || (at(r.playerId, myTeamId) && !leaving(r.playerId))))

  // 獲得交渉：まだ応対できるものだけ見る。
  //   fa   … トレードで加入した選手の契約詰めもここに乗るので「自チームに居る」も正。
  //          よそのクラブへ入ったときだけ話が消える
  //   scout… 他クラブからの引き抜き。移った先で続けても話は成り立つので、引退・消失のみ
  put('acquisitionOffers', talks.acquisitionOffers,
    (talks.acquisitionOffers ?? []).filter(o => {
      if (o.status !== 'pending' && o.status !== 'countered') return true
      if (gone(o.playerId)) return false
      if (settled(o.playerId) !== null) return false
      if (o.source === 'scout') return true
      const teamId = byId.get(o.playerId)?.teamId ?? ''
      return teamId === '' || teamId === myTeamId
    }))

  // 選手からの直訴（引退したい・移籍したい・海外に行きたい）は自チームの選手のものだけ。
  // 進路が決まったら（退団予定を含む）その選手の直訴は全部たたむ。
  //
  // そのうえで、1人が持てる直訴は1つだけにする。強い順は 引退＞海外＞移籍
  // （あとから引き返しにくい話を上に置く）。抽選する側も openWishIds で重複を避けているが、
  // 古いセーブには両方持ったままの選手が居るので、最後にここで必ず1つに揃える。
  // 揃えないと、ベルは2件なのにチャットには1行、という数のズレになる
  const wishOk = (playerId: string) => at(playerId, myTeamId) && !leaving(playerId)
  const retKeep = (talks.retirementRequests ?? []).filter(r => wishOk(r.playerId))
  const retIds = new Set(retKeep.map(r => r.playerId))
  const ovKeep = (talks.overseasRequests ?? []).filter(r => wishOk(r.playerId) && !retIds.has(r.playerId))
  const ovIds = new Set(ovKeep.map(r => r.playerId))
  put('retirementRequests', talks.retirementRequests, retKeep)
  put('overseasRequests', talks.overseasRequests, ovKeep)
  put('transferRequests', talks.transferRequests,
    (talks.transferRequests ?? []).filter(r => wishOk(r.playerId) && !retIds.has(r.playerId) && !ovIds.has(r.playerId)))

  // チャットのログ：引退した・データから消えた選手のぶんは片付ける。
  // 残していても開く道が無く、セーブの中で膨らみ続けるだけ
  const logs = talks.chatLogs
  if (logs) {
    const keep = Object.keys(logs).filter(id => !gone(id))
    if (keep.length !== Object.keys(logs).length) {
      const next: Record<string, ChatMessage[]> = {}
      for (const id of keep) next[id] = logs[id]
      changed.chatLogs = next
    }
  }

  const out = Object.keys(changed).length === 0 ? talks : { ...talks, ...changed }

  // 「譲ります」と返事をした記録。相手の札と同じ前提で立っているので、その選手が
  // 自チームから居なくなった／引退の話が決まったら一緒にたたむ。
  // 残ると、決着のときに相手の居ない話を成立させようとする（＝黙って消える）。
  // **返事は選手ごとに1件**なので、前提が崩れたものだけを落とす（utils/saleAnswer）
  return keepSaleAnswers(out, a => at(a.playerId, myTeamId) && settled(a.playerId) !== 'retiring')
}
