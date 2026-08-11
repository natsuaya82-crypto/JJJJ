// 来季以降のドラフト指名権の発行・期限切れの掃除・赤字ペナルティ。
// endSeason から切り出した（挙動不変）。
//
// ■触るときの注意
//   - **指名順は国内通し順位（1〜52）で決める。** ここは部をまたいで1本に並べる必要がある
//     数少ない場所で、`domesticThroughRankOfTeam` を通す。下位ほど早い番号になる。
//     **この順位は画面に出さないこと**（格を決めるのと同じ内部の数）
//   - 同じ年・同じ巡の指名権を二重に発行しない。持ち主が移っていても数えるので、
//     判定は `pickExistsAnywhere`（自分の手元だけを見ると、トレードで出した枠が復活する）
//   - **赤字のペナルティは「補強禁止」と、この指名権の強制売却だけ。**
//     収入を減らす形（グラントの減額）は廃止済み。減るのは収入なのに脱出手段は年俸削減しか
//     無い一方通行になるため。復活させないこと
import { draftPickValue } from '../data/economy'
import { deficitPickPenaltyHeadline } from '../utils/newsItems'
import { domesticThroughRankOfTeam } from '../utils/league'
import { pickExistsAnywhere } from './draftOrder'
import type { GameState, Team } from '../types'

export type DraftPickResult = {
  teams: Team[]
  pickPenaltyNews: { date: string; headline: string; category: 'finance'; relatedIds: string[] }[]
}

export function issueDraftPicks(args: {
  /** 予算精算まで終わったクラブ一覧 */
  teams: Team[]
  /** 指名順を数えるときの母数（国内クラブの数） */
  numTeams: number
  currentSeason: GameState['currentSeason']
  playerTeamId: string
  /** 来季の年 */
  newYear: number
  /** 自チームの連続赤字年数（3年以上で指名権の強制売却） */
  deficitStreak: number
}): DraftPickResult {
  const { teams, numTeams, currentSeason, playerTeamId, newYear, deficitStreak } = args

  const teamsWithFuturePicks = teams.map(t => {
    // 部をまたいで並べるので国内通し順位（1〜52）。下位ほど早い番号になる
    const teamFinalRank = domesticThroughRankOfTeam(currentSeason, t.id)
    const pickNum = Math.max(1, numTeams - teamFinalRank + 1)
    const newPicks: typeof t.draftPicks = []
    for (const yr of [newYear, newYear + 1]) {
      for (const round of [1, 2]) {
        const alreadyHas = pickExistsAnywhere(teams, t.id, yr, round)
        if (!alreadyHas) newPicks.push({ year: yr, round, pickNumber: pickNum, originallyOwnedBy: t.id })
      }
    }
    return { ...t, draftPicks: [...(t.draftPicks ?? []), ...newPicks] }
  })

  // Remove expired draft picks (older than the upcoming draft year)
  let result = teamsWithFuturePicks.map(t => ({
    ...t,
    draftPicks: (t.draftPicks ?? []).filter(pk => pk.year >= newYear) }))

  // ── 赤字ペナルティ：3年以上連続赤字はドラフト制限 ──
  // 来季ドラフトの自チーム最上位指名権が、資金力のあるチームへ強制売却される（売却額は補填として入金）
  const pickPenaltyNews: DraftPickResult['pickPenaltyNews'] = []
  if (deficitStreak >= 3) {
    const meT = result.find(t => t.id === playerTeamId)
    const myNextPicks = (meT?.draftPicks ?? []).filter(pk => pk.year === newYear)
    const soldPick = [...myNextPicks].sort((a, b) => a.round - b.round || a.pickNumber - b.pickNumber)[0]
    const buyer = [...result].filter(t => t.id !== playerTeamId).sort((a, b) => b.finance.budget - a.finance.budget)[0]
    if (soldPick && buyer) {
      const price = draftPickValue(soldPick.round, soldPick.pickNumber)
      const samePick = (pk: typeof soldPick) => pk.year === soldPick.year && pk.round === soldPick.round && pk.originallyOwnedBy === soldPick.originallyOwnedBy
      result = result.map(t => {
        if (t.id === playerTeamId) return { ...t, finance: { ...t.finance, budget: t.finance.budget + price }, draftPicks: (t.draftPicks ?? []).filter(pk => !samePick(pk)) }
        if (t.id === buyer.id) return { ...t, finance: { ...t.finance, budget: t.finance.budget - price }, draftPicks: [...(t.draftPicks ?? []), soldPick] }
        return t
      })
      pickPenaltyNews.push({
        date: `${currentSeason.year}-10-31`,
        headline: deficitPickPenaltyHeadline({ streak: deficitStreak, year: newYear, round: soldPick.round, buyerShort: buyer.shortName, price }),
        category: 'finance' as const,
        relatedIds: [] })
    }
  }

  return { teams: result, pickPenaltyNews }
}
