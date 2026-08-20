// CPUクラブ同士の移籍の成立（store/slices/raceSlice の runRace から切り出し）。
//
// 出品（transferListings）に名乗りを上げているクラブがいるとき、レースごとに
// 半々の確率で1件ずつ話をまとめる。**誰が買うかは需要（competingTeams）で既に
// 決まっている**ので、ここでやるのは成立させてよいかの確認だけ:
//   ・その選手を動かしてよいか（utils/transferEligibility の canBePoached）
//   ・買い手に空きと金があるか（ROSTER_MAX・予算）
//   ・**本人が行き先に納得するか**（utils/transferDecision の appraiseMove）
// 自動成立なので、断られても札は消さない（別のクラブ・別のレースで話が来る）。
//
// 兄弟: engine/cpuMarket.ts（FA獲得・引き抜きの発生源）／engine/aiTradeOffer.ts（GMへの打診）。
//
// ★乱数は引数で受ける（既定は Math.random）。1件につき「成立させるか」1回、
//   成立させるなら「どのクラブが買うか」1回。順序は切り出し前と同じ。
import type { ForeignLeague, Player, Season, Team } from '../types'
import type { ClubTier } from '../utils/clubTier'
import { ROSTER_MAX } from '../data/rosterRules'
import { MAJOR_NEWS_OVR, allTieredClubs, tierOfPlayerClub } from '../utils/clubTier'
import { bigClub } from '../utils/clubs'
import { type NewsItem, clubLabel, transferHeadline } from '../utils/newsItems'
import { ovr } from '../utils/playerUtils'
import { appraiseMove, type Destination } from '../utils/transferDecision'
import { canBePoached } from '../utils/transferEligibility'
import { playRateOf, prevSeasonOf, type PlayRateSeason } from '../utils/playRate'

export type CpuTx = { playerId: string; fromTeamId: string; toTeamId: string; playerName: string; playerOvr: number; fromShort: string; toShort: string; fee: number }

export function settleCpuTransfers(params: {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  currentSeason: Season
  /** 前シーズン。出場率が浅いうちはこちらを見る（utils/playRate） */
  pastSeasons?: readonly ({ year: number } & PlayRateSeason)[]
  playerTeamId: string
  raceDate: string
  /** 引退の話がついている選手（移籍の話は持ちかけない） */
  retiringWishIds: Set<string>
  /** 行き先の情報を作る（store の destinationOf をそのまま渡す） */
  destinationOf: (clubId: string, player: Player) => Destination
  /** 選手の格（utils/playerTier）。store の playerTierOf をそのまま渡すこと */
  playerTierOf: (player: Player) => ClubTier
  rng?: () => number
}): { txList: CpuTx[]; settledListingIds: Set<string>; news: NewsItem[] } {
  const { players, teams, foreignLeagues, currentSeason, pastSeasons, playerTeamId, raceDate, retiringWishIds, destinationOf, playerTierOf, rng = Math.random } = params
    type CpuTx = { playerId: string; fromTeamId: string; toTeamId: string; playerName: string; playerOvr: number; fromShort: string; toShort: string; fee: number }
  const cpuTxList: CpuTx[] = []
  const cpuTxListingIds = new Set<string>()
  {
    const movedThisRace = new Set<string>()
    // 買い手の総在籍数（引退除く）。30人以上のチームは補強不可＝ロスター肥大を止める
    const rosterCount = new Map<string, number>()
    for (const pl of players) {
      if (pl.status === 'active' && pl.teamId) rosterCount.set(pl.teamId, (rosterCount.get(pl.teamId) ?? 0) + 1)
    }
    for (const listing of (currentSeason.transferListings ?? [])) {
      // 自チームの出品は原則対象外だが、「移籍を認めた」選手（lst-allow-）はCPUが直接買い取れる
      const isMyAllowListing = listing.fromTeamId === playerTeamId && listing.id.startsWith('lst-allow-')
      if ((listing.fromTeamId === playerTeamId && !isMyAllowListing) || listing.competingTeams.length === 0) continue
      if (rng() >= 0.5) continue
      const buyerTeamId = listing.competingTeams[Math.floor(rng() * listing.competingTeams.length)]
      const p = players.find(pl => pl.id === listing.playerId)
      const seller = teams.find(t => t.id === listing.fromTeamId)
      const buyer = teams.find(t => t.id === buyerTeamId)
      if (!p || !seller || !buyer) continue
      // 出品後に選手が移籍していた古い出品は成立させない（現所属と出品元が一致するときのみ）。
      // レンタル中・非売品・海外挑戦を承認済み・今季加入の除外は canBePoached が見る。
      // 同一レース内で同じ選手が二重に動くのと、買い手が現所属と同じ場合はここで弾く
      if (!canBePoached(p, { teamId: listing.fromTeamId, currentYear: currentSeason.year, retiringIds: retiringWishIds }) || movedThisRace.has(p.id) || buyerTeamId === p.teamId) {
        cpuTxListingIds.add(listing.id)  // 無効な出品は掃除する
        continue
      }
      // 買い手が満杯（30人以上）または予算不足なら今回は見送り（出品は残す）
      if ((rosterCount.get(buyerTeamId) ?? 0) >= ROSTER_MAX || buyer.finance.budget < listing.askingPrice) continue
      // 出品していても、行き先に納得しなければ本人は行かない（承諾・逆提示・買う側と同じゲート）。
      // ここは自動成立なので断られても札は消さず、別のクラブ・別のレースで話が来るのを待つ
      // ★出場率は `utils/playRate` 1本。ベタ書きの 0.5 / 0戦 に戻さないこと——
      //   teamRaces が 0 だと `appraiseMove` の関門（走れている選手は格下へ行かない・
      //   1戦も走っていない選手は格上へ行かない）が**一度も発火しません**
      const { fraction, teamRaces } = playRateOf(p.id, listing.fromTeamId, currentSeason,
        teams, foreignLeagues, prevSeasonOf(pastSeasons, currentSeason.year))
      if (!appraiseMove(p, destinationOf(buyerTeamId, p), {
        srcTier: tierOfPlayerClub(listing.fromTeamId, allTieredClubs(teams, foreignLeagues)),
        playFraction: fraction, teamRaces, clubBlessed: true, playerTier: playerTierOf(p) }).ok) continue
      movedThisRace.add(p.id)
      rosterCount.set(buyerTeamId, (rosterCount.get(buyerTeamId) ?? 0) + 1)
      rosterCount.set(listing.fromTeamId, Math.max(0, (rosterCount.get(listing.fromTeamId) ?? 1) - 1))
      cpuTxList.push({ playerId: p.id, fromTeamId: listing.fromTeamId, toTeamId: buyerTeamId, playerName: p.name, playerOvr: ovr(p), fromShort: seller.shortName, toShort: buyer.shortName, fee: listing.askingPrice })
      cpuTxListingIds.add(listing.id)
    }
  }
  const news: NewsItem[] = cpuTxList.map(tx => ({
    date: raceDate,
    // どの部からどの部へ動いたかを出す。市場の流れ（1部の控え→2部・3部）が
    // ニュースだけで追えるようにする
    headline: transferHeadline({
      playerName: tx.playerName, playerOvr: tx.playerOvr, fee: tx.fee,
      fromLabel: clubLabel(tx.fromTeamId, teams), toLabel: clubLabel(tx.toTeamId, teams) }),
    category: 'trade' as const,
    relatedIds: [tx.playerId],
    // 大ニュースはOVR85以上か格1のクラブが絡んだとき（utils/clubTier 1本）
    major: tx.playerOvr >= MAJOR_NEWS_OVR || bigClub({ teams, foreignLeagues }, tx.fromTeamId) || bigClub({ teams, foreignLeagues }, tx.toTeamId),
    fromTeamId: tx.fromTeamId,
    toTeamId: tx.toTeamId }))
  return { txList: cpuTxList, settledListingIds: cpuTxListingIds, news }
}
