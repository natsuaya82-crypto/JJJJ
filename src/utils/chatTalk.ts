import type { ChatMessage, Player, ContractRequest, AcquisitionOffer, TransferBid, IncomingLoanOffer } from '../types'
import { settledLineOf, offerTermsLine, contractAcceptLine, contractCounterLine } from './chatLines'
import { rivalCountLine } from './newsItems'
import { fmtYen } from './money'

// 会話の「組み立て」を置く場所。ChatPage.tsx から移設。
//
// ■ chatLines.ts との違い
//   ・chatLines.ts … 2か所以上に出る**1つの発言**の文面（「ありがとうございます」など）
//   ・chatTalk.ts  … その発言を**どういう順で並べるか**（会話の組み立て）
//   買い取り打診が来た・契約更新の話が来た、といった「いまの状態」から
//   会話の配列（ChatMessage[]）を作るのはこちら。1発言ぶんの文言はchatLines.tsを呼ぶ。

// ── 会話の決まり ─────────────────────────────────────────────
//
// 話し手は3人。誰が喋っているかを頭の括弧で必ず区別する。
//   ・自チームの選手本人 … 括弧なし。監督に直接話す
//   ・相手クラブのGM     … （◯◯GM）。買い取り・レンタルの打診と、その返事
//   ・代理人             … （代理人）。他クラブの選手・FA・売却の窓口
// 括弧を付けたり付けなかったりすると、誰の発言か分からなくなる。**付けるなら全部に付ける。**
//
// 監督（プレイヤー）の発言は**常に丁寧語**で統一する。
// 以前は「わかりました／お譲りします」と「わかった。お前の走りは世界レベルだ」が
// 同じ画面に混ざっていた。

// 海外挑戦の直訴メッセージ（夢の行き先はタイプで変わる）
const OVERSEAS_DREAM: Record<string, string> = {
  africa: 'ケニアやエチオピアの高地で、世界のトップと毎日走ってみたいんです。',
  europe: 'ヨーロッパのトラックで、自分のスピードがどこまで通用するか試したいんです。',
  america: '北米の大きな舞台で走ってみたいんです。',
}
// 地域の呼び名は transferDecision の DREAM_LABEL 1本（ここに表を持たない）。
// 以前はこの表が chatLines.ts と丸写しで、さらに DREAM_LABEL だけ america が
// 「北米・南米」になっていて、同じ選手の希望が画面によって別の名前で出ていた

export function buildMessages(
  player: Player,
  contractReq: ContractRequest | undefined,
  months: number,
  hasRetirement: boolean,
  hasTransfer: boolean,
  transferReason?: string,
  overseasRegion?: string,
): ChatMessage[] {
  const msgs: ChatMessage[] = []

  // 進路が決まった選手（引退を承認した・海外挑戦を承認した）は、ここで会話を閉じる。
  // 判定は talkSync の settledPath 1本。ここは分岐の書き足しになっていて海外挑戦のぶんしか無く、
  // **引退を承認した選手は次に開くと来季契約の話に戻っていた**（そこから移籍にも進めた）
  // 文面は utils/chatLines の1本（ボタンで足すときと同じものを使う）。
  // 別々に書いていたので、承諾したときとその次に開いたときで礼が2回並んでいた
  const settledLine = settledLineOf(player)
  if (settledLine) {
    msgs.push(settledLine)
    return msgs
  }

  if (hasRetirement) {
    msgs.push({ from: 'player', kind: 'retire', text: `${player.age}歳になりました。正直、そろそろ引退を考えています。監督はどうお思いですか？` })
    return msgs
  }

  if (overseasRegion) {
    msgs.push({ from: 'player', kind: 'overseas_wish', text: `監督、真剣な話があります。${OVERSEAS_DREAM[overseasRegion] ?? '海外で走ってみたいんです。'}海外挑戦を認めてもらえませんか？` })
    return msgs
  }

  if (hasTransfer) {
    const reason = transferReason === 'playing_time'
      ? '最近、出場機会が思ったより少なくて...'
      : 'チームの成績のことを考えると、'
    msgs.push({ from: 'player', kind: 'transfer_wish', text: `${reason}他のクラブへの移籍を考えています。` })
    return msgs
  }

  if (!contractReq) {
    if (months < 12) {
      // 満了済み（yearsLeft=0）だと months が負になる。「残り-1ヶ月」と出るバグの修正
      // 残り月数はレースごとに変わる。kind を付けて「同じ催促」として扱い、増やさず書き換える
      msgs.push({ from: 'player', kind: 'contract_remind', text: months <= 0
        ? `契約が切れたままになっています。今後どうなるのか気になっています。`
        : `来シーズンの契約についてなのですが、まだ何も連絡がなくて。残り${months}ヶ月が気になっています。` })
    }
    return msgs
  }

  if (contractReq.initiatedBy === 'player' && contractReq.status === 'pending_gm') {
    msgs.push({ from: 'player', kind: 'contract_demand', text: `来シーズンの契約についてお話があります。年俸${fmtYen(contractReq.demandSalary)}、${contractReq.demandYears}年契約での更新を希望します。いかがでしょうか？` })
    return msgs
  }

  if (contractReq.initiatedBy === 'gm') {
    msgs.push({ from: 'gm', kind: 'contract_gm_open', text: `来シーズンの契約について話し合いたい。` })
    if (contractReq.status === 'pending_gm') {
      msgs.push({ from: 'player', kind: 'contract_ask_terms', text: `わかりました。どのような条件をお考えですか？` })
      return msgs
    }
  }

  if (contractReq.offerSalary > 0) {
    msgs.push({ from: 'gm', kind: 'contract_offer', text: `年俸${fmtYen(contractReq.offerSalary)}、${contractReq.offerYears}年契約でいかがでしょうか。` })
  }

  if (contractReq.status === 'accepted') {
    msgs.push(contractAcceptLine())
    return msgs
  }

  if (contractReq.status === 'countered') {
    msgs.push(contractCounterLine(fmtYen(contractReq.counterSalary ?? 0), contractReq.counterYears))
    return msgs
  }

  if (contractReq.status === 'rejected') {
    msgs.push({ from: 'player', kind: 'contract_reject', text: `申し訳ありませんが、その条件では受け入れられません。` })
    return msgs
  }

  return msgs
}

// 獲得オファー（FA・他チーム選手）のチャット初期メッセージ
export function buildAcqMessages(player: Player, offer: AcquisitionOffer, teamName?: string, rivalCount?: number): ChatMessage[] {
  const msgs: ChatMessage[] = []
  msgs.push({
    from: 'player',
    kind: 'agent_intro',
    text: offer.source === 'fa'
      ? `（代理人）${player.name}への関心ありがとうございます。良い条件を提示いただければ前向きに検討します。`
      : `（代理人）${player.name}は現在${teamName ?? '他クラブ'}に在籍中ですが、話は伺います。条件次第です。`,
  })
  // 取り合いの件数（クラブ名は出さない）。文面は utils/newsItems の rivalCountLine 1本。
  // 数え方は rivalClubsFor（必要か・そこで走れるか・本人が行くか）で、移籍金つきの入札と同じ。
  // シーズン中もクラブがFAを獲るようになったので、もたつけば先に契約される
  const rivals = rivalCountLine(rivalCount)
  if (rivals) msgs.push({ from: 'player', kind: 'rival_count', text: rivals })
  if (offer.offerSalary > 0 && offer.status === 'countered') {
    msgs.push(offerTermsLine(fmtYen(offer.offerSalary), offer.offerYears))
    msgs.push({ from: 'player', kind: 'agent_counter', text: `（代理人）その条件では即断できません。年俸${fmtYen(offer.counterSalary ?? 0)}、${offer.counterYears}年であれば合意します。` })
  }
  return msgs
}

// 移籍金合意後の契約交渉（他チームとの移籍金合意が済んだ選手）
export function buildTransferMessages(player: Player, bid: TransferBid, fromTeamName?: string): ChatMessage[] {
  const msgs: ChatMessage[] = [{
    from: 'player',
    kind: 'agent_fee_agreed',
    text: `（代理人）移籍金${fmtYen(bid.offeredFee)}で${fromTeamName ?? '所属クラブ'}との合意が取れました。あとは${player.name}本人との契約条件次第です。ご提示ください。`,
  }]
  // 取り合いの件数（クラブ名は出さない）。FAの獲得オファーと同じ文面
  const rivals = rivalCountLine(bid.rivalCount)
  if (rivals) msgs.push({ from: 'player', kind: 'rival_count', text: rivals })
  return msgs
}

// 相手クラブから来た買い取りオファーを会話にする。
// 以前はチャットを通さず、一覧の中のカードに 承諾／カウンター／拒否 のボタンを直接置いていた。
// 同じ「相手からの打診に返事をする」なのに、契約更新・獲得交渉・トレードは会話、
// 買い取りとレンタルだけボタン、と2つの作りが混ざっていた。会話1本に寄せる。
/**
 * 打診の用件キー。**どのクラブから来ている話か**までを含める。
 *
 * ここを 'incoming_offer' の決め打ちにしていたため、mergeChatMessages が
 * 「同じ用件がもうある」と判断して、**新しいクラブからの打診が古い打診の行を
 * 上書きしていた**。会話の末尾には何も増えないので、通知には出ているのに
 * 「チャットが来ない」状態になる。相手が変われば別の用件として下に積む。
 * 同じ相手が金額を上げただけなら、キーは変わらないので文面だけ差し替わる（意図どおり）。
 */
const offerTopicKey = (ids: readonly string[]) => `incoming_offer:${[...ids].sort().join(',')}`

export function buildIncomingOfferMessages(
  player: Player, offers: { id: string; name: string; price: number; ok?: boolean; reason?: string }[], wish?: { name: string; reason: string },
): ChatMessage[] {
  if (offers.length === 0) return []
  const key = offerTopicKey(offers.map(o => o.id))
  if (offers.length === 1) {
    const o = offers[0]
    return [
      { from: 'player', kind: key,
        text: `（${o.name}GM）${player.name}選手を移籍金${fmtYen(o.price)}でお譲りいただけないでしょうか。ご検討をお願いします。` },
      ...(o.ok === false && o.reason
        ? [{ from: 'player' as const, kind: `incoming_wish:${o.id}`, text: `（代理人）本人に確認しました。${o.reason}とのことです。` }]
        : []),
    ]
  }
  // 取り合いになっているときは、まとめて出して本人の希望を言わせる。
  //
  // ★理由は**全部のクラブに1行ずつ**、クラブ名を添えて付けること。
  //   断る相手にだけ付けていたので、2クラブ来ているのに矢印が1行しか出ず、
  //   「23番手なのはアムステルダムなのか札幌なのか」が読み取れなかった。
  const list = offers.map(o =>
    `・${o.name}（移籍金${fmtYen(o.price)}）`
    + `\n\u3000→ ${o.name}へは${o.ok ? '行きたい' : '行かない'}${o.reason ? `（${o.reason}）` : ''}`,
  ).join('\n')
  return [
    { from: 'player', kind: key,
      text: `（代理人）${offers.length}クラブから${player.name}選手の獲得の打診が来ています。\n${list}` },
    // 「行きたい」先が2つ以上あるときだけ、本命を言わせる。
    // 1つしか無いときは上の一覧で言い切っているので繰り返さない
    ...(wish ? [{ from: 'player' as const, kind: `incoming_wish:${key}`,
      text: `（代理人）本人に希望を聞きました。「${wish.name}へ行きたい。${wish.reason}から」とのことです。` }] : []),
  ]
}

// 相手クラブから来たレンタル打診を会話にする（貸す／借りるの両方向）。
export function buildIncomingLoanMessages(player: Player, offer: IncomingLoanOffer, teamName: string): ChatMessage[] {
  return [{
    from: 'player',
    // 買い取りと同じ理由で、どの打診かまでをキーにする（別の相手の話が古い行を上書きしない）
    kind: `incoming_loan:${offer.id}`,
    text: offer.direction === 'lend_out'
      ? `（${teamName}GM）${player.name}選手を${offer.years}年のレンタルでお借りできませんか。出場機会はこちらで用意します。`
      : `（${teamName}GM）${player.name}選手を${offer.years}年のレンタルでお預かりいただけませんか。`,
  }]
}

// 行き先が決まらなかった退団予定の選手。FAで出すか残留させるかをGMが選ぶ。
// 以前はシーズン終了時に問答無用で強制FAだった（移籍金0で流出）
export function buildStayOrLeaveMessages(): ChatMessage[] {
  return [{
    from: 'player', kind: 'stay_or_leave',
    text: `（代理人）移籍先が見つかりませんでした。このままチームに残るか、契約を解除して自分で移籍先を探すか、決めていただけますか。`,
  }]
}
