// こちらから出したレンタル要請への、相手クラブの返事（store/slices/raceSlice の runRace から切り出し）。
//
// 承諾されるのは「相手が手放してよい選手（keyPlayerStatus が open）」かつ
// **こちらの借用枠（3人）が空いているとき**だけ。成立も utils/movePlayer を通すので、
// 保有元を残したまま貸した側の名簿から外れる形になる。
//
// 断られたぶんもニュースと通知に残す（黙って消えると「返事が来ない」ように見える）。
// 乱数は使わない。
import type { ForeignLeague, LoanResponse, Player, Race, Season, Team } from '../types'
import { findClub } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { loanReplyHeadline } from '../utils/newsItems'
import { keyPlayerStatus } from '../utils/playerUtils'

type PastArg = Parameters<typeof keyPlayerStatus>[2]

export function resolveLoanRequests(params: {
  players: Player[]
  teams: Team[]
  foreignLeagues: ForeignLeague[]
  currentSeason: Season
  pastSeasons: PastArg
  races: Race[]
  playerTeamId: string
  raceIndex: number
  raceDate: string
}): {
  players: Player[]
  teams: Team[]
  news: { date: string; headline: string; category: 'trade'; relatedIds: string[] }[]
  responses: LoanResponse[]
} {
  const { teams: teams0, foreignLeagues, currentSeason, pastSeasons, races, playerTeamId, raceIndex, raceDate } = params
  const players0 = params.players
  // レンタル要請（移籍市場から出したもの）の応答。相手が承諾なら借用成立、拒否ならニュース。
  const pendingLoanReqs = currentSeason.loanRequests ?? []
  let playersAfterLoan: Player[] = players0
  let teamsAfterLoan = teams0
  const loanRespNews: { date: string; headline: string; category: 'trade'; relatedIds: string[] }[] = []
  const newLoanResponses: LoanResponse[] = []
  if (pendingLoanReqs.length > 0) {
    let freeSlots = Math.max(0, 3 - players0.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length)
    const accepted: { playerId: string; ownerId: string; years: number }[] = []
    for (const req of pendingLoanReqs) {
      const pl = players0.find(p => p.id === req.playerId)
      if (!pl || pl.teamId !== req.targetTeamId || pl.loan) { continue }
      const loanable = keyPlayerStatus(pl, { year: currentSeason.year, races: races, eclSeries: currentSeason.eclSeries }, pastSeasons) === 'open'
      const ownerShort = findClub(teams0, foreignLeagues, pl.teamId)?.shortName
        ?? '相手クラブ'
      if (loanable && freeSlots > 0) {
        accepted.push({ playerId: pl.id, ownerId: pl.teamId, years: req.years }); freeSlots--
        loanRespNews.push({ date: raceDate, headline: loanReplyHeadline({ ownerLabel: ownerShort, playerName: pl.name, years: req.years, accepted: true }), category: 'trade', relatedIds: [pl.id] })
        newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: true, years: req.years })
      } else {
        loanRespNews.push({ date: raceDate, headline: loanReplyHeadline({ ownerLabel: ownerShort, playerName: pl.name, years: req.years, accepted: false }), category: 'trade', relatedIds: [pl.id] })
        newLoanResponses.push({ id: `lresp_${pl.id}_${raceIndex}`, playerId: pl.id, playerName: pl.name, ownerShort, accepted: false, years: req.years })
      }
    }
    // 借用成立も movePlayer に通す（保有元を残して、貸した側の名簿から外す）
    for (const a of accepted) {
      const m = movePlayer({ players: playersAfterLoan, teams: teamsAfterLoan }, a.playerId, playerTeamId, {
        year: currentSeason.year,
        until: currentSeason.year + a.years,
        raceIndex: raceIndex + 1,
        years: a.years,
        myTeamId: playerTeamId })
      if (!m.ok) continue
      playersAfterLoan = m.players
      teamsAfterLoan = m.teams
    }
  }
  return { players: playersAfterLoan, teams: teamsAfterLoan, news: loanRespNews, responses: newLoanResponses }
}
