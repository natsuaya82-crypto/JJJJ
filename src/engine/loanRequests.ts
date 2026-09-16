// こちらから出したレンタル要請への、相手クラブの返事（store/slices/raceSlice の runRace から切り出し）。
//
// 承諾されるのは「相手が手放してよい選手（keyPlayerStatus が open）」かつ
// **こちらの借用枠（3人）が空いているとき**だけ。成立も utils/movePlayer を通すので、
// 保有元を残したまま貸した側の名簿から外れる形になる。
//
// 断られたぶんもニュースと通知に残す（黙って消えると「返事が来ない」ように見える）。
// 乱数は使わない。
import type { ForeignLeague, LoanRequest, LoanResponse, Player, Race, Season, Team } from '../types'
import { LOAN_SLOTS } from '../utils/bidGate'
import { findClub } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { loanReplyHeadline } from '../utils/newsItems'
import { keyPlayerStatus } from '../utils/transferDecision'
import { loanedInCount } from '../utils/rosterSync'
import { ROSTER_MAX, teamRosterSize } from '../data/rosterRules'

type PastArg = Parameters<typeof keyPlayerStatus>[1]['pastSeasons']

/**
 * **出したレンタル要請のうち、どれを受けられるか。判定はここ1本。**
 *
 * 見るのは3つで、どれも既にある決まりを通します。
 *   ・枠の数 … `utils/bidGate` の `LOAN_SLOTS`（`3` を直書きしない）
 *   ・借りている人数 … `utils/rosterSync` の `loanedInCount`（`belongsToClub` を通る）
 *   ・在籍の空き … `data/rosterRules` の `ROSTER_MAX` と `teamRosterSize`
 *
 * ★**本編のレース（`resolveLoanRequests`）も、記録会・リザーブの回
 *   （`store/slices/competitionSlice`）も、同じここを通すこと。**
 *   以前は2本に割れていて、**本編の側だけ**
 *     ・枠を `3` で直書きし、借りている人数も自前で数えていた（引退した選手も数え得る）
 *     ・**在籍上限を1行も見ていなかった**
 *   ので、30人ちょうどのときに承諾されると31人になりました。
 *   **レンタルで借りた選手は解雇できない**ので、そうなると人数を戻せません。
 */
export function decideLoanRequests(
  players: readonly Player[],
  playerTeamId: string,
  requests: readonly LoanRequest[],
  /** その選手を相手が手放してよいか（`keyPlayerStatus` は季節の材料が要るので呼ぶ側から渡す） */
  loanable: (p: Player) => boolean,
): { player: Player; years: number; accepted: boolean }[] {
  let freeSlots = Math.max(0, LOAN_SLOTS - loanedInCount(players, playerTeamId))
  let roomLeft = Math.max(0, ROSTER_MAX - teamRosterSize(players as Player[], playerTeamId))
  const out: { player: Player; years: number; accepted: boolean }[] = []
  for (const req of requests) {
    const pl = players.find(p => p.id === req.playerId)
    // 要請を出したあとに選手が動いていたら、その札はもう意味が無い（返事も出さない）
    if (!pl || pl.teamId !== req.targetTeamId || pl.loan) continue
    const accepted = loanable(pl) && freeSlots > 0 && roomLeft > 0
    if (accepted) { freeSlots--; roomLeft-- }
    out.push({ player: pl, years: req.years, accepted })
  }
  return out
}

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
    // 受けるかどうかは `decideLoanRequests` 1本（枠の数・借りている人数・在籍の空き）
    const decided = decideLoanRequests(players0, playerTeamId, pendingLoanReqs, pl =>
      // ★**走り終わったぶんを載せたシーズンを渡すこと**（`currentSeason.races` はまだ
      //   このレースの結果を持っていないので、消化数が1戦ずれます）
      keyPlayerStatus(pl, { players: players0, teams: teams0, foreignLeagues,
        currentSeason: { ...currentSeason, races }, pastSeasons }) === 'open')
    for (const d of decided) {
      const ownerShort = findClub(teams0, foreignLeagues, d.player.teamId)?.shortName ?? '相手クラブ'
      loanRespNews.push({ date: raceDate, headline: loanReplyHeadline({ ownerLabel: ownerShort, playerName: d.player.name, years: d.years, accepted: d.accepted }), category: 'trade', relatedIds: [d.player.id] })
      newLoanResponses.push({ id: `lresp_${d.player.id}_${raceIndex}`, playerId: d.player.id, playerName: d.player.name, ownerShort, accepted: d.accepted, years: d.years })
    }
    // 借用成立も movePlayer に通す（保有元を残して、貸した側の名簿から外す）
    for (const a of decided.filter(d => d.accepted)) {
      const m = movePlayer({ players: playersAfterLoan, teams: teamsAfterLoan }, a.player.id, playerTeamId, {
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
