// 通知（ベルの中身）の集計を、ここ1箇所にまとめたもの。
//
// もともとは同じ80行ほどの数え方が NotificationsPage.tsx と NotificationPanel.tsx の
// 両方に手書きでコピーされていて、コード中にも「片方だけ変えるとズレる」と注意書きが
// 残っていた。実際にベルの数字と通知ページの件数が食い違う原因になっていたので、
// 数え方はこのファイルだけに置く。
//
// ここは画面から切り離した素の関数にしてある（フックを使わない）ので、
// 呼び出し側でストアから値を取って渡すこと。
import type { Season, Player, Team, ExpiredNegKind } from '../types'
import { ROSTER_MAX } from '../data/rosterRules'
import { loginTodayKey } from './loginDate'
import { saleAnsweredIds } from './saleAnswer'

// 「交渉期限切れ」の通知に出す文言。
// この箱には3種類（入札・獲得オファー・契約更新）が入るのに、通知ページ側が
// 「移籍を拒否しました／来季まで交渉できません」で決め打ちしていたため、
// 契約更新の期限切れなのに移籍の話として出る＝嘘になっていた。
// 種類ごとに箱を分けるのではなく、この表1つから文言を出す。
export const EXPIRED_NEG_TEXT: Record<ExpiredNegKind, { title: (name: string) => string; note: string }> = {
  // こちらが出した入札が流れた（費用合意の放置／主力ガードで門前払い）
  bid: { title: n => `${n}選手の移籍交渉が流れました`, note: '来季まで交渉できません' },
  // ★**額が足りずに断られた。** ここは長いあいだ**何も出していませんでした**——
  //   入札は1レースで必ず決着する（pending は必ず fee_accepted/countered/rejected/failed の
  //   どれかになる）のに、rejected だけ通知を出していなかったので、
  //   遊ぶ側からは「オファーを送ったのに何週経っても返事が来ない」に見えていました
  //   （オーナー・2026-08-15）。主力ガード（locked）のときだけは
  //   「黙って却下すると入札が消えたようにしか見えない」と気づいて通知していたのに、
  //   同じことが起きる**額不足の枝が2つとも漏れて**いました。
  //   ★**来季まで交渉できません**（オーナー・2026-08-19「そんな額では移籍できません。
  //   交渉決裂で終わりでしょ」）。ここを「もう一度出せます」にしたのは前のセッションの
  //   勝手な判断でした
  bid_rejected: { title: n => `${n}選手の移籍金の提示が断られました`, note: '提示額が足りませんでした。来季まで交渉できません' },
  // ★**話している最中に、その選手が他のクラブへ移った。** これも黙って消えていて、
  //   「勝手に選手が移籍している」に見えていました（同・オーナー）
  bid_gone: { title: n => `${n}選手は他のクラブへ移籍しました`, note: '交渉していた相手が移籍したため、この話は終わりです' },
  // 他クラブに競り負けた。金額の問題なので「来季まで交渉できません」ではない
  outbid: { title: n => `${n}選手の獲得を他クラブに競り負けました`, note: 'より高い移籍金を出したクラブが獲得しました' },
  // 他クラブから来た獲得オファーを放置して失効した
  offer: { title: n => `${n}選手へのオファーが期限切れになりました`, note: '来季まで交渉できません' },
  // 契約更新の話し合いが期限切れ。移籍ではないし、交渉禁止にもならない
  contract: { title: n => `${n}選手の契約更新が期限切れになりました`, note: 'もう一度話し合えます' },
  // トレードの打診を飲もうとしたが、打診後に前提が崩れていた（引退承認・非売・その選手が既に動いた等）。
  // 以前はここで何も出さずカードだけ消していたので、押したのに無反応に見えていた
  trade: { title: n => `${n}のトレードは成立しませんでした`, note: '打診のあとで状況が変わりました' },
  // 同じくトレードだが、こちらは今の評価だと釣り合わなくなっていた場合
  trade_unfair: { title: n => `${n}のトレードは成立しませんでした`, note: '今の評価では釣り合いません' },
  // 「譲る」と返事をしたのに、次のレースまでに本人が翻意した（他クラブの上乗せを含めても納得しなかった）。
  // 以前は決着のときに何も出さずオファーだけ消していたので、返事をしたのに音沙汰なしに見えていた
  sale_refused: { title: n => `${n}選手の移籍は成立しませんでした`, note: '本人が移籍を望まなかったため、残留します' },
  // 同じく決着時。放出するとロスター下限を割るので成立しなかった
  sale_roster_min: { title: n => `${n}選手の移籍は成立しませんでした`, note: '在籍人数が下限を下回るため放出できません' },
}
// 古いセーブには種類が入っていない。元々この箱は入札ぶんだけだったので入札として扱う
export function expiredNegText(kind: ExpiredNegKind | undefined) {
  return EXPIRED_NEG_TEXT[kind ?? 'bid']
}

/**
 * **まとめて1枚のカードで出す用件の数え方。** 中身が何件でもカードは1枚なので 1。
 *
 * ★ここが「唯一の決まり」。呼ぶ側で `x.length > 0 ? 1 : 0` と書かないこと。
 *   ベルの数字は「通知ページに出るカードの枚数と必ず同じにする」という決まりなのに、
 *   チャット一覧（ChatPage）だけがレンタルの申し込みを**件数ぶん**足していた。
 *   その結果、2件目以降はベルが増えないのにチャットの数字だけ増える、という
 *   「通知に来ていないのにチャットが増える」状態になっていた。
 */
export function asCardCount(items: readonly unknown[]): number {
  return items.length > 0 ? 1 : 0
}

/**
 * 「返事待ち」カードの本文。**中身は1枚にまとめて出す**ので、
 * 何を待っているのかは枚数ではなく文で伝える。
 *
 * カードが1枚しか出ない以上、「3件があなたの返事待ち」だけでは
 * それがレンタルの話なのか獲得の話なのか分からない（実際に分からなかった）。
 * 画面に直書きしないこと。
 */
export function chatReplyLine(replies: readonly { kind: 'acquisition' | 'loan' }[]): string {
  const n = (k: 'acquisition' | 'loan') => replies.filter(r => r.kind === k).length
  const parts: string[] = []
  if (n('loan') > 0) parts.push(`レンタルの申し込み ${n('loan')}件`)
  if (n('acquisition') > 0) parts.push(`獲得オファーの返答 ${n('acquisition')}件`)
  return parts.length > 0 ? parts.join('・') : 'チャットで対応してください'
}
import { contractTalkCtx, contractMonthsLeft, isLiveContract, needsRenewalAttention } from './contractTalk'

// 契約更新まわりの数え方は utils/contractTalk.ts の1本だけを使う。
// ここに条件を書き足さないこと（ベルとチャットとホームで数が食い違う原因になる）
export { contractMonthsLeft }

export type NotifInput = {
  currentSeason: Season
  players: Player[]
  teams: Team[]
  playerTeamId: string
  lastLoginDate?: string
  seenJoinIds: string[]
  seenInjuryIds: string[]
  /** 運営から届いたプレゼントの数 */
  pendingGiftsCount: number
  /** 「選手を1人つくる」が何人ぶん残っているか（通知の「アップデート記念」の枠） */
  playerCreateCount: number
  /** 走友会のなかまから届いたカードの数 */
  clubGiftsCount: number
  /**
   * **届いているフレンド申請の数**（オーナー・2026-08-15
   * 「フレンド申請来てたのに1ってついてなかったから気づかなかった」）。
   * 走友会のカードと同じで、サーバーから読んだ数をここへ渡す。
   */
  friendRequestsCount: number
}

/**
 * **チャットの用件を数えるのに要るぶんだけ**（`chatTopicIds` / `chatUnseenCount`）。
 *
 * ベルにしか要らないもの（加入・故障を見た記録、もらい物とフレンド申請の数）は入っていません。
 * ★呼ぶ側で `as never` を付けて `NotifInput` を騙らせないこと。**足りない口はこの型に足す。**
 */
export type ChatTopicInput = Omit<NotifInput,
  'seenJoinIds' | 'seenInjuryIds' | 'pendingGiftsCount' | 'playerCreateCount' | 'clubGiftsCount' | 'friendRequestsCount'>

/**
 * 通知の中身を全部数える。
 * 返す total が、そのままベルの数字であり通知ページの「N件」になる
 */
/**
 * 買い取り打診を選手ごとにまとめる。**用件は「選手1人＝1件」**。
 *
 * 取り合いで5クラブから同じ選手に来ても、GMが返事をするのは1回（会話も1本）。
 * オファーの件数で数えると、ベルは5なのにチャットの行は1つ、という数のズレになる。
 * ベルの数字・通知ページ・チャットの一覧は全部これを通すこと。
 */
/**
 * GMの返事を待っている買い取り打診。**「返事が要るオファー」はここ1本。**
 *
 * ■なぜ要るのか
 *   「譲ります」と返事をしても、オファーの札は次のレースまで残る（他クラブの上乗せを
 *   受けるため）。それを未返事として数えていた場所が4つあり、返事をしたのに
 *     ・ベルが減らない（押すと同じチャットに戻る）
 *     ・チャット一覧に「◯◯が獲得を打診」が残る
 *     ・移籍ページに「他クラブからのオファー N件 — 要確認」が残る
 *   という状態になっていた。返事済みかどうかの記録は utils/saleAnswer 1本。
 *
 * ■フリー移籍の接触（金額0）は含めない
 *   GMが返事をする話ではない（情報通知）。呼ぶ側でそれぞれ分けていたので、ここで落とす。
 */
export function offersAwaitingReply(
  season: Pick<Season, 'incomingOffers' | 'pendingSales' | 'pendingSale'>,
): NonNullable<Season['incomingOffers']> {
  // ★返事済みは**選手ごと**に落とす。1件枠だったころは2人目に返事をした瞬間に
  //   1人目がまた「返事待ち」に戻り、ベルが減らなかった
  const answered = saleAnsweredIds(season)
  return (season.incomingOffers ?? []).filter(o => o.offeredPrice > 0 && !answered.has(o.playerId))
}

export function offersByPlayer<T extends { playerId: string }>(offers: readonly T[]): { playerId: string; offers: T[] }[] {
  const out: { playerId: string; offers: T[] }[] = []
  for (const o of offers) {
    const hit = out.find(x => x.playerId === o.playerId)
    if (hit) hit.offers.push(o)
    else out.push({ playerId: o.playerId, offers: [o] })
  }
  return out
}

/**
 * 【チャットにいま出ている用件の id】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「チャットに通知機能つけて欲しい。チャット見ないとその数字消えないみたいな。
 *     フレンド横にあった3みたいな感じ」
 *
 *   ホームの「チャット」に出す数字と、チャットの画面に並ぶ用件は**同じものを数える**
 *   こと。別々に数えると「数字は3なのに開いたら1件」というズレが必ず出ます
 *   （ベルとチャットで実際に起きて直した）。
 *
 * ★数え方は `collectNotifications` の結果から取るだけ。**ここで条件を書き足さない**こと。
 * ★返す id は「見たかどうか」の記録に使うので、**用件ごとに安定していること**
 *   （同じ用件は同じ id、別の用件は別の id）。
 */
export function chatTopicIds(input: ChatTopicInput): string[] {
  // ★ここで埋めてよいのは**チャットの用件に関係しない項目だけ**（加入・故障の既読、もらい物の数）。
  //   以前は呼ぶ側（ホームとチャット）が `as never` で丸ごと型を黙らせて渡していたので、
  //   `seenJoinIds` が undefined のまま `collectNotifications` に入り、
  //   **その年に加入した選手が1人でもいると `o.includes` で落ちて**いました
  //   （オーナー・2026-08-19。実機の v2.0.4 で発生）。空の名簿では `filter` の中身が
  //   一度も走らないので、加入者が出るまで誰も気づけない形でした。
  const n = collectNotifications({
    ...input,
    seenJoinIds: [], seenInjuryIds: [],
    pendingGiftsCount: 0, playerCreateCount: 0, clubGiftsCount: 0, friendRequestsCount: 0,
  })
  return [
    // 相手から来た買い取り打診（選手ごとに1件）
    ...n.incomingOfferPlayers.map(x => `buy:${x.playerId}`),
    // 行き先が決まらなかった退団予定（残す／FAで出す の返事待ち）
    ...n.stayOrLeave.map(x => `stay:${x.playerId}`),
    // 選手からの直訴
    ...n.retirementRequests.map(r => `retire:${r.playerId}`),
    ...n.transferReqs.map(r => `wish:${r.playerId}`),
    ...n.overseasReqs.map(r => `overseas:${r.playerId}`),
    // 相手が返事をしてきて、こちらの返事で止まっているもの
    ...n.chatReplies.map(r => `reply:${r.id}`),
    // 契約更新で要対応
    ...n.renewalPlayers.map(x => `contract:${x.p.id}`),
    // 出した入札の逆提示・費用合意（どちらもチャット／通知から返事をする）
    ...n.counteredBids.map(b => `bid:${b.id}`),
    ...n.feeAcceptedBids.map(b => `fee:${b.id}`),
    // フリー移籍の接触（引き留めの相談）
    ...n.freeContacts.map(o => `free:${o.id}`),
    // ★**終わった交渉も用件に入れる。** 入札が断られる・競り負ける・相手が他所へ移ると、
    //   チャットの「出したオファー」の行は**status が変わって黙って消える**だけで、
    //   結末はベルにしか出ていなかった（オーナー・2026-08-23「入札して断られた時に
    //   チャットが来ない」）。ベルとチャットは同じものを数える決まりなので、ここにも入れる。
    ...n.expiredNegotiations.map(x => `negend:${x.id}`),
  ]
}

/**
 * ホームの「チャット」に出す数字。**まだ開いていない用件の数**。
 * チャットを開くと `markChatSeen` で今ある用件を見た扱いにするので0になり、
 * 新しい用件が来るとまた出ます（オーナー「チャット見ないとその数字消えない」）。
 */
export function chatUnseenCount(input: ChatTopicInput, seenIds: readonly string[]): number {
  const seen = new Set(seenIds)
  return chatTopicIds(input).filter(id => !seen.has(id)).length
}

export function collectNotifications(input: NotifInput) {
  const { currentSeason, players, teams, playerTeamId, lastLoginDate, seenJoinIds, seenInjuryIds, pendingGiftsCount, playerCreateCount, clubGiftsCount, friendRequestsCount } = input

  // 自チームの現役選手か。退団・引退した選手あての通知（幽霊通知）を数から外すのに使う。
  // ケガ中(status === 'injured')も現役。ここを 'active' だけで見ていたので、
  // 選手がケガをした瞬間にその選手あてのオファーや直訴がベルから消えて、
  // 通知ページには出ているのに数字が合わない、ということが起きていた
  const isMine = (id: string) => players.some(p => p.id === id && p.teamId === playerTeamId && p.status !== 'retired')

  // 移籍金つきのオファーと、フリー移籍の接触（金額0＝GMは関与できない情報通知）は別扱い
  const allIncoming = currentSeason.incomingOffers ?? []
  const seenFreeContactIds = currentSeason.seenFreeContactIds ?? []
  // 返事が要るオファーの判定は offersAwaitingReply 1本（返事済み＝pendingSale を除く）
  const incomingOffers = offersAwaitingReply(currentSeason).filter(o => isMine(o.playerId))
  // 数えるのは選手の数。5クラブが1人を取り合っても返事は1回なので1件
  const incomingOfferPlayers = offersByPlayer(incomingOffers)
  // 行き先が決まらなかった退団予定の選手（FAで出すか残留させるかの返事待ち）。
  // チャットには用件が出るのにベルに出ていなかった
  const stayOrLeave = (currentSeason.stayOrLeave ?? []).filter(x => isMine(x.playerId))
  const freeContacts = allIncoming.filter(o => o.offeredPrice === 0 && !seenFreeContactIds.includes(o.id) && isMine(o.playerId))
  // 契約更新まわりの判定に使う材料（フリー接触中・引退希望・札の一覧）を1回で取り出す
  const ctCtx = contractTalkCtx(currentSeason, playerTeamId)

  const freeTransferNotices = currentSeason.freeTransferNotices ?? []
  const departureNotices = currentSeason.departureNotices ?? []
  const expiredNegotiations = currentSeason.expiredNegotiations ?? []
  const loanResponses = currentSeason.loanResponses ?? []

  const retirementRequests = (currentSeason.retirementRequests ?? []).filter(r => isMine(r.playerId))
  const transferReqs = (currentSeason.transferRequests ?? []).filter(r => isMine(r.playerId))
  // 海外挑戦の直訴。チャットには返事のボタンが出るのに、ベルにも通知ページにも
  // 一度も出ていなかった（数え漏れ）
  const overseasReqs = (currentSeason.overseasRequests ?? []).filter(r => isMine(r.playerId))
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered' && players.some(p => p.id === b.playerId))
  const feeAcceptedBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'fee_accepted' && players.some(p => p.id === b.playerId))

  // GMの応対を待っている契約交渉。進行中(pending_gm/countered)の判定は contractTalk の1本。
  // ケガ中(status === 'injured')の選手も対象に入れる。以前は active しか数えていなかったので、
  // 交渉中にケガをした瞬間、通知からもチャットからも用件が消えて放置され、期限切れになっていた
  // 引退したいと言ってきていてGMがまだ返事をしていない選手は、引退の用件へ一本化する
  // （ベルに「引退申請」と「契約交渉」の2件が出るのに、画面には引退のカードしか無かった）
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r =>
    isLiveContract(r) && !ctCtx.freeContactIds.has(r.playerId) && !ctCtx.retiringIds.has(r.playerId)
    && players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status !== 'retired' && !p.transferListed && !p.loan))

  // スポンサー枠（3）が満杯なら、これ以上契約できないのでオファー通知は出さない
  const myTeam = teams.find(t => t.id === playerTeamId)
  const sponsorSlotsLeft = 3 - (myTeam?.sponsors?.length ?? 0)
  const sponsorOffers = sponsorSlotsLeft > 0 ? (currentSeason.sponsorOffers ?? []) : []

  // CPUからのトレード打診。対象選手が移籍・引退した古い打診は出さない。
  // 相手クラブが分からない打診と、選手が片側に1人も居ない打診は通知ページでカードを
  // 作れずに消えるので、ベルにも数えない（ベル+1・カード0枚のズレの原因だった）
  const tradeOffers = (currentSeason.pendingTradeOffers ?? []).filter(o =>
    teams.some(t => t.id === o.fromTeamId)
    && o.offeredPlayerIds.length > 0 && o.requestedPlayerIds.length > 0
    && o.offeredPlayerIds.every(pid => players.some(p => p.id === pid && p.teamId === o.fromTeamId && p.status !== 'retired'))
    && o.requestedPlayerIds.every(pid => isMine(pid)))

  // チャットには返事のボタンが出るのに、ベルにも通知ページにも一度も出ていなかったもの。
  // 「相手が返事をしてきて、こちらの返事待ちで止まっている」という同じ1つの用件なので、
  // 種類ごとに節を足さず、この1本で数える（移籍要望・海外挑戦と同じ形）。
  //  ・獲得オファーの逆提示（countered＝選手が条件を出し直してきた）
  //  ・レンタルの申し込み（貸してくれ／借りてくれ）
  // 獲得オファーの pending は選手の返事待ちなのでこちらの用件ではない。
  // レンタルの loanRequests もこちらから出して相手の返事待ちなので数えない。
  // 選手やクラブが見つからないものはチャットにもカードが出ないので数から外す。
  // トレードの逆提示(tradeNegotiations)はここに入れない。相手クラブとのトレード画面は
  // 移籍ページのクラブ一覧からしか開けず、チャットの一覧には行が出ないので、
  // 数だけ足すと「ベルは1件なのにチャットには何も無い」というズレになる
  const chatReplies: { id: string; kind: 'acquisition' | 'loan' }[] = [
    ...(currentSeason.acquisitionOffers ?? [])
      .filter(o => o.status === 'countered' && players.some(p => p.id === o.playerId))
      .map(o => ({ id: o.id, kind: 'acquisition' as const })),
    // レンタルの申し込みは海外クラブからも来る（fromTeamId が国内チーム一覧に無い）。
    // チャット側は相手クラブ名が引けなくても「他クラブ」としてカードを出すので、
    // ここでクラブの実在を条件にすると海外ぶんだけベルに出ない
    ...(currentSeason.incomingLoanOffers ?? [])
      .filter(o => players.some(p => p.id === o.playerId))
      .map(o => ({ id: o.id, kind: 'loan' as const })),
  ]

  // 加入通知（FA・移籍・レンタル・トレード・ドラフトの全経路）。今季加入で未確認の選手
  const joinNotices = players
    .filter(p => p.teamId === playerTeamId && p.joinedYear === currentSeason.year)
    .map(p => ({ p, key: `${p.id}-${p.joinedYear}` }))
    .filter(x => !seenJoinIds.includes(x.key))

  // 契約更新のリマインダーは「残り半年（6ヶ月）を切った選手」だけ。チャットの「要対応」と同じ基準
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const totalRaces = currentSeason.races.length
  // 判定は needsRenewalAttention の1本（チャット一覧の赤札・ホームの警告・レース後の
  // 強制遷移と同じもの）。以前はこの4箇所が別々の条件を書いていたので、
  // ホームが「契約未解決が3人」と言うのにベルは0、レース後に飛ばされた先には何も無い、
  // ということが起きていた
  // 「まだ話していない（契約満了間近）」と「札があって応対待ち」は同じ用件なので
  // 1つのリストにまとめて、人数で数える。
  // 以前は前者を人数・後者をまとめて1件と別々に数えていたので、チャットを開いて
  // 札が作られた瞬間に、こちらが何もしていないのに**ベルの数字が勝手に減っていた**
  const renewalPlayers = players
    .map(p => ({
      p,
      seasonsLeft: p.contract.yearsLeft,
      months: contractMonthsLeft(p.contract.yearsLeft, raceIndex, totalRaces),
      req: pendingContracts.find(r => r.playerId === p.id),
    }))
    .filter(({ p, months, req }) => !!req || needsRenewalAttention(p, months, ctCtx))
    .sort((a, b) => a.months - b.months)

  // ロスター超過警告（旧セーブ救済。強制解雇はせず整理を促すだけ）
  const myRosterCount = players.filter(p => p.teamId === playerTeamId && p.status === 'active').length
  const rosterOver = Math.max(0, myRosterCount - ROSTER_MAX)

  // 補強禁止（3シーズン連続赤字、または残高マイナス＝reinforcementBanned と同基準）
  const signingBanned = ((myTeam?.finance?.deficitStreak ?? 0) >= 3) || ((myTeam?.finance?.budget ?? 0) < 0)

  // 負傷者情報（OKで確認済みにでき、復帰でも自動で消える）
  const injuryKey = (p: { id: string; injuredUntilRace?: number }) => `${p.id}-${p.injuredUntilRace ?? 0}`
  const injuredPlayers = players.filter(p => p.teamId === playerTeamId && p.status === 'injured' && !seenInjuryIds.includes(injuryKey(p)))

  const loginUnclaimed = lastLoginDate !== loginTodayKey()

  // ここの合計が、そのままベルの数字であり通知ページの「N件」になる。
  // 数え方の決まりは「通知ページに出るカードの枚数と必ず同じにする」こと。
  //  ・1人ずつカードが並ぶもの（負傷者・新加入・契約更新など）はその人数
  //  ・まとめて1枚のカードにしているもの（ロスター超過・スポンサー・補強禁止）は
  //    中身が何件でも1（節の見出しに出す数字は中身の件数のまま）
  // 以前は負傷者だけカードが人数分並ぶのに1と数え、契約交渉は1枚しか出ないのに
  // 人数分数えていたので、ベルの数字と見えているカードの枚数がズレていた
  // ★**買い取りの打診も通知に出す**（2026-08-14・オーナー「全部通知通して行くようにして」）。
  //   2026-08-12 にいったん外した判断（「受信箱はいいけど通知に来なければいい」）を戻したもの。
  //   外した理由は**常時8〜11件**が並び続けることだったが、そのあと打診の生成を1本化して
  //   上限を1レース1件にしたので、受信箱は**平均2.50件・最多5件**（1部）まで減っている。
  //   数えるのは**選手の数**（5クラブが1人を取り合っても返事は1回なのでカード1枚）。
  const total = 0
    + incomingOfferPlayers.length
    + stayOrLeave.length
    + tradeOffers.length
    // 「返事待ち」「移籍要望」「海外挑戦希望」は中身が何人でもカード1枚にまとめて出しているので1。
    // 人数分足すと、ベルは3なのに通知ページにはカードが1枚、という数のズレになる
    + asCardCount(chatReplies)
    + retirementRequests.length
    + asCardCount(transferReqs)
    + asCardCount(overseasReqs)
    + counteredBids.length + feeAcceptedBids.length
    + renewalPlayers.length
    + (signingBanned ? 1 : 0)
    + (rosterOver > 0 ? 1 : 0)
    + injuredPlayers.length
    + (loginUnclaimed ? 1 : 0)
    + asCardCount(sponsorOffers)
    + pendingGiftsCount
    + playerCreateCount
    + clubGiftsCount
    + friendRequestsCount
    + joinNotices.length
    + expiredNegotiations.length
    + loanResponses.length
    + freeContacts.length
    + freeTransferNotices.length
    + departureNotices.length

  return {
    incomingOffers, incomingOfferPlayers, stayOrLeave,
    freeContacts, freeTransferNotices, departureNotices,
    retirementRequests, transferReqs, overseasReqs, counteredBids, feeAcceptedBids,
    pendingContracts, sponsorOffers, tradeOffers, chatReplies, joinNotices,
    renewalPlayers, rosterOver, signingBanned, injuredPlayers,
    loginUnclaimed, expiredNegotiations, loanResponses,
    contactedPlayerIds: ctCtx.freeContactIds, injuryKey,
    total,
  }
}


/**
 * **プレゼントの中身の書き方。** 通知の一覧と、受け取ったときの画面が同じ文字を使う。
 *
 * ★以前ここが画面に直書きで、しかも `jewels ? 'ジュエル◯個' : 'カード◯枚'` の
 *   **2択**でした。`trophies` を足したときにどちらの画面も直していなかったので、
 *   トロフィーのプレゼントが**「カード0枚」**と出ていました（オーナー・2026-08-20
 *   「まずこれ、カードじゃないし。優勝トロフィーだし」）。中身を増やしたら
 *   ここだけ直せば両方に出ます。
 */
export function giftContents(gift: { cards?: unknown[]; jewels?: number; trophies?: number; playerCreates?: number }): string {
  const parts: string[] = []
  if (gift.playerCreates) parts.push(`選手作成${gift.playerCreates}回`)
  if (gift.trophies) parts.push(`優勝トロフィー${gift.trophies}個`)
  if (gift.jewels) parts.push(`ジュエル${gift.jewels}個`)
  if (gift.cards?.length) parts.push(`カード${gift.cards.length}枚`)
  return parts.join('・')
}
