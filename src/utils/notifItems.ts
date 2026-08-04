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

/** 契約残りの月数（ChatPage の contractMonths と同じ式） */
export function contractMonthsLeft(yearsLeft: number, raceIndex: number, totalRaces: number): number {
  return Math.round((yearsLeft - 1 + Math.max(0, totalRaces - raceIndex) / Math.max(1, totalRaces)) * 12)
}

/**
 * 通知の中身を全部数える。
 * 返す total が、そのままベルの数字であり通知ページの「N件」になる
 */
export function collectNotifications(input: NotifInput) {
  const { currentSeason, players, teams, playerTeamId, lastLoginDate, seenJoinIds, seenInjuryIds, myPlayerCreated, pendingGiftsCount, clubGiftsCount } = input

  // 自チームの現役選手か。退団・引退した選手あての通知（幽霊通知）を数から外すのに使う
  const isMine = (id: string) => players.some(p => p.id === id && p.teamId === playerTeamId && p.status === 'active')

  // 移籍金つきのオファーと、フリー移籍の接触（金額0＝GMは関与できない情報通知）は別扱い
  const allIncoming = currentSeason.incomingOffers ?? []
  const seenFreeContactIds = currentSeason.seenFreeContactIds ?? []
  const incomingOffers = allIncoming.filter(o => o.offeredPrice > 0 && isMine(o.playerId))
  const freeContacts = allIncoming.filter(o => o.offeredPrice === 0 && !seenFreeContactIds.includes(o.id) && isMine(o.playerId))
  // フリー移籍で接触中の選手の契約更新は出さない（接触カードに一本化して用件の二重表示を防ぐ）
  const contactedPlayerIds = new Set(allIncoming.filter(o => o.offeredPrice === 0).map(o => o.playerId))

  const freeTransferNotices = currentSeason.freeTransferNotices ?? []
  const departureNotices = currentSeason.departureNotices ?? []
  const expiredNegotiations = currentSeason.expiredNegotiations ?? []
  const loanResponses = currentSeason.loanResponses ?? []

  const retirementRequests = (currentSeason.retirementRequests ?? []).filter(r => isMine(r.playerId))
  const transferReqs = (currentSeason.transferRequests ?? []).filter(r => isMine(r.playerId))
  const counteredBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'countered' && players.some(p => p.id === b.playerId))
  const feeAcceptedBids = (currentSeason.transferBids ?? []).filter(b => b.status === 'fee_accepted' && players.some(p => p.id === b.playerId))

  // 退団予定（移籍リスト入り）の選手は契約更新の対象外
  const pendingContracts = (currentSeason.contractRequests ?? []).filter(r =>
    r.status === 'pending_gm' && !contactedPlayerIds.has(r.playerId)
    && players.some(p => p.id === r.playerId && p.teamId === playerTeamId && p.status === 'active' && !p.transferListed))

  // スポンサー枠（3）が満杯なら、これ以上契約できないのでオファー通知は出さない
  const myTeam = teams.find(t => t.id === playerTeamId)
  const sponsorSlotsLeft = 3 - (myTeam?.sponsors?.length ?? 0)
  const sponsorOffers = sponsorSlotsLeft > 0 ? (currentSeason.sponsorOffers ?? []) : []

  // CPUからのトレード打診。対象選手が移籍・引退した古い打診は出さない
  const tradeOffers = (currentSeason.pendingTradeOffers ?? []).filter(o =>
    o.offeredPlayerIds.every(pid => players.some(p => p.id === pid && p.teamId === o.fromTeamId && p.status === 'active'))
    && o.requestedPlayerIds.every(pid => isMine(pid)))

  // 加入通知（FA・移籍・レンタル・トレード・ドラフトの全経路）。今季加入で未確認の選手
  const joinNotices = players
    .filter(p => p.teamId === playerTeamId && p.joinedYear === currentSeason.year)
    .map(p => ({ p, key: `${p.id}-${p.joinedYear}` }))
    .filter(x => !seenJoinIds.includes(x.key))

  // 契約更新のリマインダーは「残り半年（6ヶ月）を切った選手」だけ。チャットの「要対応」と同じ基準
  const raceIndex = currentSeason.currentRaceIndex ?? 0
  const totalRaces = currentSeason.races.length
  const renewalPlayers = players
    .filter(p => p.teamId === playerTeamId && p.status === 'active')
    .map(p => ({ p, seasonsLeft: p.contract.yearsLeft, months: contractMonthsLeft(p.contract.yearsLeft, raceIndex, totalRaces) }))
    .filter(({ p, seasonsLeft, months }) =>
      seasonsLeft <= 1 && months < 6
      && !p.transferListed
      && !contactedPlayerIds.has(p.id)
      && !(currentSeason.contractRequests ?? []).some(r => r.playerId === p.id))
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

  const total = incomingOffers.length
    + (canCreateMyPlayer ? 1 : 0)
    + tradeOffers.length
    + retirementRequests.length + transferReqs.length + counteredBids.length + feeAcceptedBids.length + pendingContracts.length
    + renewalPlayers.length
    + (signingBanned ? 1 : 0)
    + (rosterOver > 0 ? 1 : 0)
    + (injuredPlayers.length > 0 ? 1 : 0)
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
    retirementRequests, transferReqs, counteredBids, feeAcceptedBids,
    pendingContracts, sponsorOffers, tradeOffers, joinNotices,
    renewalPlayers, rosterOver, signingBanned, injuredPlayers,
    loginUnclaimed, canCreateMyPlayer, expiredNegotiations, loanResponses,
    contactedPlayerIds, injuryKey,
    total,
  }
}
