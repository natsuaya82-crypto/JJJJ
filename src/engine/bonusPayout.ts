// 出来高ボーナスの精算（store/slices/seasonSlice の endSeason から切り出し）。
//
// 契約に付いている出来高（優勝・区間賞・MVP）を、**シーズン終わりに1回だけ**払う。
// 区間賞は本数ぶん掛ける。
//
// ★数える対象は「今季の在籍」。**契約満了・引退を反映したあとの名簿**（squadIdsOf）を
//   渡すこと。シーズン開始時の名簿で数えると、退団が決まった選手にも払ってしまう。
// ★区間賞の集計はリーグ全体ぶんも一緒に返す（表彰・記録の集計で使う）。
//
// 乱数は使わない。
import type { Player, Season, SeasonAward } from '../types'
import { bonusPayoutHeadline } from '../utils/newsItems'

export function settleBonusClauses(params: {
  players: Player[]
  /** 契約満了・引退を反映したあとの自チームの在籍ID（utils/rosterSync の squadIdsOf） */
  rosterIds: string[]
  currentSeason: Season
  playerTeamId: string
  /** 自チームの今季の最終順位（部内）。優勝ボーナスの判定に使う */
  finalRank: number
  seasonAward: SeasonAward
}): {
  totalPayout: number
  news: { date: string; headline: string; category: 'race'; relatedIds: string[] }[]
  playerSegWins: Record<string, number>
  leagueMvpId: string | undefined
} {
  const { rosterIds: playerTeamRosterIds, currentSeason, playerTeamId, finalRank, seasonAward: newSeasonAward } = params
  const players = params.players
  // Count segment wins per player this season from race results
  const playerSegWinsSeason: Record<string, number> = {}
  for (const race of currentSeason.races) {
    if (!race.results) continue
    for (const seg of race.results.segmentResults) {
      const winner = seg.runners.find(r => r.rank === 1)
      if (winner) {
        if (winner.teamId === playerTeamId) {
          playerSegWinsSeason[winner.playerId] = (playerSegWinsSeason[winner.playerId] ?? 0) + 1
        }
      }
    }
  }

  let bonusTotalPayout = 0
  const bonusPayoutNews: { date: string; headline: string; category: 'race'; relatedIds: string[] }[] = []

  for (const pid of playerTeamRosterIds) {
    const p = players.find(x => x.id === pid)
    if (!p?.contract.bonusClauses?.length) continue
    for (const clause of p.contract.bonusClauses) {
      if (clause.type === 'champion' && finalRank === 1) {
        bonusTotalPayout += clause.amount
        bonusPayoutNews.push({ date: `${currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'champion', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
      } else if (clause.type === 'segment_win') {
        const wins = playerSegWinsSeason[p.id] ?? 0
        if (wins > 0) {
          const payout = clause.amount * wins
          bonusTotalPayout += payout
          bonusPayoutNews.push({ date: `${currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'segment_win', amount: payout, count: wins }), category: 'race', relatedIds: [p.id] })
        }
      } else if (clause.type === 'mvp' && p.career.mvpAwards > 0) {
        bonusTotalPayout += clause.amount
        bonusPayoutNews.push({ date: `${currentSeason.year}-10-26`, headline: bonusPayoutHeadline({ playerName: p.name, kind: 'mvp', amount: clause.amount }), category: 'race', relatedIds: [p.id] })
      }
    }
  }
  const leagueMvpId = newSeasonAward.mvpId
  return { totalPayout: bonusTotalPayout, news: bonusPayoutNews, playerSegWins: playerSegWinsSeason, leagueMvpId }
}
