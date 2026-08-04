// 通知（ベルの中身）の集計を、ここ1箇所にまとめたもの。
//
// もともとは同じ80行ほどの数え方が NotificationsPage.tsx と NotificationPanel.tsx の
// 両方に手書きでコピーされていて、コード中にも「片方だけ変えるとズレる」と注意書きが
// 残っていた。実際にベルの数字と通知ページの件数が食い違う原因になっていたので、
// 数え方はこのファイルだけに置く。
//
// ここは画面から切り離した素の関数にしてある（フックを使わない）ので、
// 呼び出し側でストアから値を取って渡すこと。
import type { Season, Player, Team } from '../types'
import { ROSTER_MAX } from '../data/rosterRules'
import { loginTodayKey } from './loginDate'
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
  myPlayerCreated: boolean
  /** 運営から届いたプレゼントの数 */
  pendingGiftsCount: number
  /** 走友会のなかまから届いたカードの数 */
  clubGiftsCount: number
}

/**
 * 通知の中身を全部数える。
 * 返す total が、そのままベルの数字であり通知ページの「N件」になる
 */
export function collectNotifications(input: NotifInput) {
  const { currentSeason, players, teams, playerTeamId, lastLoginDate, seenJoinIds, seenInjuryIds, myPlayerCreated, pendingGiftsCount, clubGiftsCount } = input

  // 自チームの現役選手か。退団・引退した選手あての通知（幽霊通知）を数から外すのに使う。
  // ケガ中(status === 'injured')も現役。ここを 'active' だけで見ていたので、
  // 選手がケガをした瞬間にその選手あてのオファーや直訴がベルから消えて、
  // 通知ページには出ているのに数字が合わない、ということが起きていた
  const isMine = (id: string) => players.some(p => p.id === id && p.teamId === playerTeamId && p.status !== 'retired')

  // 移籍金つきのオファーと、フリー移籍の接触（金額0＝GMは関与できない情報通知）は別扱い
  const allIncoming = currentSeason.incomingOffers ?? []
  const seenFreeContactIds = currentSeason.seenFreeContactIds ?? []
  const incomingOffers = allIncoming.filter(o => o.offeredPrice > 0 && isMine(o.playerId))
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
  const canCreateMyPlayer = !myPlayerCreated

  // ここの合計が、そのままベルの数字であり通知ページの「N件」になる。
  // 数え方の決まりは「通知ページに出るカードの枚数と必ず同じにする」こと。
  //  ・1人ずつカードが並ぶもの（負傷者・新加入・契約更新など）はその人数
  //  ・まとめて1枚のカードにしているもの（ロスター超過・スポンサー・補強禁止）は
  //    中身が何件でも1（節の見出しに出す数字は中身の件数のまま）
  // 以前は負傷者だけカードが人数分並ぶのに1と数え、契約交渉は1枚しか出ないのに
  // 人数分数えていたので、ベルの数字と見えているカードの枚数がズレていた
  const total = incomingOffers.length
    + (canCreateMyPlayer ? 1 : 0)
    + tradeOffers.length
    + chatReplies.length
    + retirementRequests.length + transferReqs.length + overseasReqs.length + counteredBids.length + feeAcceptedBids.length
    + renewalPlayers.length
    + (signingBanned ? 1 : 0)
    + (rosterOver > 0 ? 1 : 0)
    + injuredPlayers.length
    + (loginUnclaimed ? 1 : 0)
    + (sponsorOffers.length > 0 ? 1 : 0)
    + pendingGiftsCount
    + clubGiftsCount
    + joinNotices.length
    + expiredNegotiations.length
    + loanResponses.length
    + freeContacts.length
    + freeTransferNotices.length
    + departureNotices.length

  return {
    incomingOffers, freeContacts, freeTransferNotices, departureNotices,
    retirementRequests, transferReqs, overseasReqs, counteredBids, feeAcceptedBids,
    pendingContracts, sponsorOffers, tradeOffers, chatReplies, joinNotices,
    renewalPlayers, rosterOver, signingBanned, injuredPlayers,
    loginUnclaimed, canCreateMyPlayer, expiredNegotiations, loanResponses,
    contactedPlayerIds: ctCtx.freeContactIds, injuryKey,
    total,
  }
}
