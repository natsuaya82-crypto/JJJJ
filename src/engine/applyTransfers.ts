// 決まった移籍を実際に選手へ反映する（store/slices/raceSlice の runRace から切り出し）。
//
// 対象は2種類。**どちらも utils/movePlayer の movePlayer 1本を通す**ので、
// 所属の付け替え・移籍金の授受・移籍履歴・退団のお知らせが自チームの操作と同じ形になる。
//   ・CPU同士で成立した売買（engine/cpuTransfers が決めたもの）
//   ・こちらが競り負けた入札（engine/bidResolution が返したもの）
//
// ★競り負けは「移す直前にもう一度本人の意思を見る」。**移籍の可否は appraiseMove 1本**。
//   他の入口（承諾・逆提示・トレード・引き抜き）は移す瞬間に本人へ聞いているのに、
//   ここだけ「競り勝ったクラブがいる＝確定」で、本人が断って残る道が無かった。
// ★自チームから出て行った選手とは1年間交渉不可（lockUntilYear）。
import type { ForeignLeague, Player, Season, Team, TransferListing, TransferRecord, ExpiredNegotiation } from '../types'
import type { ClubTier } from '../utils/clubTier'
import { MAJOR_NEWS_OVR, allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import { bigClub, findClub } from '../utils/clubs'
import { movePlayer, type DepartureNotice } from '../utils/movePlayer'
import { settleForeignFee } from '../utils/clubMoney'
import { type NewsItem, transferHeadline } from '../utils/newsItems'
import { ovr } from '../utils/playerUtils'
import { appraiseMove, type Destination } from '../utils/transferDecision'
import type { CpuTx } from './cpuTransfers'
import { playRateOf, prevSeasonOf, type PlayRateSeason } from '../utils/playRate'

export function applySettledTransfers(params: {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  /** ニュースのOVR表示に使う「動く前」の名簿 */
  origPlayers: Player[]
  currentSeason: Season
  /** 出場率の材料（utils/playRate）。今季が浅いときは前シーズンを見る */
  pastSeasons?: readonly ({ year: number } & PlayRateSeason)[]
  listings: TransferListing[]
  txList: CpuTx[]
  outbidMoves: { playerId: string; toTeamId: string; fee: number; playerName: string; clubName: string }[]
  playerTeamId: string
  raceDate: string
  raceClock: number
  destinationOf: (clubId: string, player: Player) => Destination
  /** 選手の格（utils/playerTier）。store の playerTierOf をそのまま渡すこと */
  playerTierOf: (player: Player) => ClubTier
}): {
  players: Player[]
  teams: Team[]
  records: TransferRecord[]
  /** 海外クラブの資金を動かしたあとのリーグ。**必ず state に戻すこと**（settleForeignFee） */
  foreignLeagues: ForeignLeague[]
  departureNotices: DepartureNotice[]
  income: number
  outbidNews: NewsItem[]
  /** 競り勝ったクラブを本人が断って残ったぶんの通知 */
  stayNegs: ExpiredNegotiation[]
} {
  const { origPlayers, teams, foreignLeagues, currentSeason, pastSeasons, listings, playerTierOf, txList: cpuTxList, outbidMoves, playerTeamId, raceDate, raceClock, destinationOf } = params
  const players = params.players
  const stayNegs: ExpiredNegotiation[] = []
  // CPUトレード反映 ＋ 移籍リスト入りフラグの同期（他チーム選手にも「移籍希望」が立つ）
  const listedIdSet = new Set(listings.map(l => l.playerId))
  // 移籍が決まった選手は下の movePlayer で動かすので、ここでは札の同期だけ
  const txIds = new Set(cpuTxList.map(t => t.playerId))
  const playersListedSynced = players.map(p => {
    if (txIds.has(p.id)) return p
    const listed = listedIdSet.has(p.id)
    const nextListed = listed ? true : (p.teamId === playerTeamId ? (p.transferListed ?? false) : false)
    return nextListed === (p.transferListed ?? false) ? p : { ...p, transferListed: nextListed }
  })
  // CPUの移籍成立を1件ずつ movePlayer に通す。
  // 所属・名簿の付け替え・移籍金の授受・移籍履歴・退団のお知らせが自チームの操作と同じ形になる。
  // 自チームから出て行った選手とは1年間交渉不可（transferLockedUntilYear）。
  let playersWithCpuTx: Player[] = playersListedSynced
  let teamsWithCpuTx = teams
  // ★**海外クラブが絡む移籍金の精算**（`utils/clubMoney` の settleForeignFee 1本）。
  //   `movePlayer` は `teams`（国内52クラブ）しか知らないので、相手が海外クラブだと
  //   片側しかお金が動きません。**`movePlayer` のすぐ外で必ず呼ぶこと**
  //   （国内同士なら何も起きないので、ここで分岐しない）。
  //   ★競り負けの道はここが抜けていて、**海外クラブが競り勝つと移籍金を払わずに
  //     選手を持っていけて**いました（オーナー・2026-08-16 の調べで発覚）。
  let leaguesAfterFees: ForeignLeague[] = foreignLeagues
  const cpuTxRecords: TransferRecord[] = []
  const myCpuSaleNotices: DepartureNotice[] = []
  let myCpuSaleIncome = 0
  for (const tx of cpuTxList) {
    const m = movePlayer({ players: playersWithCpuTx, teams: teamsWithCpuTx }, tx.playerId, tx.toTeamId, {
      year: currentSeason.year,
      date: raceDate,
      fee: tx.fee,
      toName: tx.toShort,
      myTeamId: playerTeamId,
      ...(tx.fromTeamId === playerTeamId ? { lockUntilYear: currentSeason.year + 1 } : {}) })
    if (!m.ok) continue
    playersWithCpuTx = m.players
    teamsWithCpuTx = m.teams
    if (m.record) cpuTxRecords.push(m.record)
    if (m.notice) myCpuSaleNotices.push(m.notice)
    myCpuSaleIncome += m.income
    leaguesAfterFees = settleForeignFee(leaguesAfterFees, tx.fromTeamId, tx.toTeamId, tx.fee)
  }

  // 競り負けた入札。上回ったクラブが実際にその選手を獲る（言うだけで選手が残ると、
  // 次の節にもう一度同じ額で出せてしまい「競り負け」が形だけになる）。
  // 通すのはCPU間売買と同じ movePlayer なので、名簿・移籍金・履歴の後始末も同じ形になる
  const outbidNewsItems: NewsItem[] = []
  for (const mv of outbidMoves) {
    const before = playersWithCpuTx.find(p => p.id === mv.playerId)
    const fromShort = before ? findClub(teamsWithCpuTx, foreignLeagues, before.teamId)?.shortName ?? '' : ''
    // ★移す直前に本人の意思をもう一度みる。**移籍の可否は appraiseMove 1本**。
    //   他の入口（承諾・逆提示・トレード・引き抜き）は移す瞬間に本人へ聞いているのに、
    //   ここだけ「競り勝ったクラブがいる＝確定」で、本人が断って残る道が無かった。
    //   競り上げの間に序列や状況が変わることもあるので、ここで聞き直す。
    if (before) {
      const dest = destinationOf(mv.toTeamId, before)
      const srcTier = tierOfPlayerClub(before.teamId, allTieredClubs(teams, foreignLeagues))
      // ★出場率は utils/playRate 1本。ベタ書きも省略もしないこと（関門が黙って死ぬ）
      const { fraction, teamRaces } = playRateOf(before.id, before.teamId, currentSeason,
        teams, foreignLeagues, prevSeasonOf(pastSeasons, currentSeason.year))
      if (!appraiseMove(before, dest, { srcTier, playFraction: fraction, teamRaces,
        playerTier: playerTierOf(before) }).ok) {
        // 本人が断った＝残留。誰の手にも渡らないので、理由を通知に残す
        stayNegs.push({
          id: `stay_${mv.playerId}_${raceClock}`, playerId: mv.playerId, playerName: mv.playerName,
          kind: 'outbid', detail: `${mv.clubName}の提示を${mv.playerName}が断り、残留しました` })
        continue
      }
    }
    const m = movePlayer({ players: playersWithCpuTx, teams: teamsWithCpuTx }, mv.playerId, mv.toTeamId, {
      year: currentSeason.year,
      date: raceDate,
      fee: mv.fee,
      toName: mv.clubName,
      myTeamId: playerTeamId })
    if (!m.ok) continue
    playersWithCpuTx = m.players
    teamsWithCpuTx = m.teams
    if (m.record) cpuTxRecords.push(m.record)
    leaguesAfterFees = settleForeignFee(leaguesAfterFees, before?.teamId ?? '', mv.toTeamId, mv.fee)
    outbidNewsItems.push({
      date: raceDate,
      headline: transferHeadline({
        playerName: mv.playerName,
        playerOvr: ovr(origPlayers.find(x => x.id === mv.playerId) ?? ({ ratings: {} } as Player)),
        fromLabel: fromShort, toLabel: mv.clubName, fee: mv.fee }),
      category: 'trade' as const,
      relatedIds: [mv.playerId],
      // 大ニュースはOVR85以上か格1のクラブが絡んだとき（utils/clubTier 1本）
      major: (ovr(origPlayers.find(x => x.id === mv.playerId) ?? ({ ratings: {} } as Player)) >= MAJOR_NEWS_OVR) || bigClub({ teams, foreignLeagues }, mv.toTeamId),
      toTeamId: mv.toTeamId })
  }
  return {
    players: playersWithCpuTx, teams: teamsWithCpuTx, records: cpuTxRecords,
    // 海外クラブの資金を動かしたぶん。呼ぶ側はこれを state に戻すこと
    foreignLeagues: leaguesAfterFees,
    departureNotices: myCpuSaleNotices, income: myCpuSaleIncome, outbidNews: outbidNewsItems, stayNegs,
  }
}
