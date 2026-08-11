// 届いている話の「期限が来たとき」の処理（store/slices/raceSlice の runRace から切り出し）。
//
// incomingOffers には2種類が混ざっている。**期限の切れ方が違う**ので分けて見る。
//   ・移籍金つきの打診（offeredPrice > 0）… GMが答えるもの。期限切れ＝失効通知＋1年ロック
//   ・フリー移籍の接触（offeredPrice === 0）… **GMは関与できない**。期限が来たら本人が決める
//
// ★2つを見る順番を変えないこと（先に有料の失効、次にフリーの決断）。
// ★本人が行くかの判定は utils/playerUtils の freeContactConsent 1本
//   （中身は playerConsentToMove ＝ 移籍の同意と同じ式。ここで別の理屈を書かない）。
import type { ExpiredNegotiation, ForeignLeague, Player, Race, Season, Team } from '../types'
import { allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import { type NewsItem, freeTransferHeadline } from '../utils/newsItems'
import { freeContactConsent, seasonAppearances } from '../utils/playerUtils'
import type { Destination } from '../utils/transferDecision'

export function resolveExpiredOffers(params: {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  currentSeason: Season
  playerTeamId: string
  /** レース通算数（racesConsumed + 1）。期限はこれで測る */
  nextClock: number
  /** 自分の部で消化した本数（出場率の分母） */
  nextRaceIndex: number
  /** 出場実績を数えるための今季の日程（結果入り） */
  ranRaces: Race[]
  raceDate: string
  destinationOf: (clubId: string, player: Player) => Destination
}): {
  expiredNegs: ExpiredNegotiation[]
  expiredPlayerIds: string[]
  freeDecisionNotices: { id: string; playerId: string; playerName: string; toTeamName: string; left: boolean }[]
  freeMoves: { playerId: string; toTeamId: string }[]
  freeMoveNews: NewsItem[]
} {
  const { players, teams, foreignLeagues, currentSeason, playerTeamId, nextClock, nextRaceIndex, ranRaces, raceDate, destinationOf } = params
  // incomingOffer期限切れ（5試合）→ 失効通知＋1年交渉ロック
  // ※フリー移籍の接触（offeredPrice=0）は対象外：下の「本人決断」で処理する
  const offerExpiredNegs: ExpiredNegotiation[] = []
  const offerExpiredPlayerIds: string[] = [];
  (currentSeason.incomingOffers ?? []).forEach(o => {
    if (o.offeredPrice === 0) return
    if (o.expiresAtRace <= nextClock) {
      const pl = players.find(p => p.id === o.playerId)
      if (pl) {
        offerExpiredNegs.push({ id: o.id, playerId: o.playerId, playerName: pl.name, kind: 'offer' })
        offerExpiredPlayerIds.push(o.playerId)
      }
    }
  })

  // フリー移籍の接触：期限が来たら選手本人が決断する（GMは関与できない）。
  // 移籍するかは本人の納得度（やる気・移籍先の順位・出場状況）で決まる
  const freeDecisionNotices: { id: string; playerId: string; playerName: string; toTeamName: string; left: boolean }[] = []
  const freeMoves: { playerId: string; toTeamId: string }[] = []
  ;(currentSeason.incomingOffers ?? []).forEach(o => {
    if (o.offeredPrice !== 0 || o.expiresAtRace > nextClock) return
    const pl = players.find(p => p.id === o.playerId)
    const suitor = teams.find(t => t.id === o.fromTeamId)
    if (!pl || pl.teamId !== playerTeamId || pl.status !== 'active' || !suitor) return
    // 決断までに契約を更新できていれば残留確定（引き留め成功）。
    // 判定は出場実績込みの freeContactConsent（よく走っている選手・愛着のある選手は残留に傾く）
    const flApps = seasonAppearances(pl.id, ranRaces)
    const flFrac = flApps / Math.max(1, nextRaceIndex)
    // 受け手が総在籍上限（30人）なら移籍は成立しない＝残留（31人化の防止）。
    // 引退希望中の選手は移籍しない（引退か引き留めかの話であって、他クラブへは行かない）
    const suitorSize = players.filter(p => p.teamId === suitor.id && p.status === 'active').length
    const isRetiringFl = (currentSeason.retirementRequests ?? []).some(r => r.playerId === pl.id)
    const leaves = suitorSize >= 30 || isRetiringFl ? false
      : pl.contract.yearsLeft > 1 ? false
      : freeContactConsent(pl, destinationOf(suitor.id, pl), tierOfPlayerClub(pl.teamId, allTieredClubs(teams, foreignLeagues)), flFrac, nextRaceIndex)
    freeDecisionNotices.push({ id: o.id, playerId: pl.id, playerName: pl.name, toTeamName: suitor.shortName, left: leaves })
    if (leaves) freeMoves.push({ playerId: pl.id, toTeamId: suitor.id })
  })
  const freeMoveNews = freeDecisionNotices.filter(n => n.left).map(n => ({
    date: raceDate,
    headline: freeTransferHeadline({ playerName: n.playerName, toLabel: n.toTeamName }),
    category: 'trade' as const,
    relatedIds: [n.playerId] }))
  return { expiredNegs: offerExpiredNegs, expiredPlayerIds: offerExpiredPlayerIds, freeDecisionNotices, freeMoves, freeMoveNews }
}
