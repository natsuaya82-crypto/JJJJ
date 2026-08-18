// シーズン中のFA補強（store/slices/raceSlice の runRace から切り出し）。
//
// **クラブがFAを獲る理由は「必要か」「そこで走れるか」だけ**。オフシーズンとまったく同じ
// engine/cpuMarket の pickCpuFreeAgents 1本を通し、国内クラブも海外クラブも同じ入口。
//
// ここが無かった頃は**シーズン中のFA市場が自チームの独占**で、17クラブが欲しがっている
// OVR83のFAが誰にも獲られず市場に残り、前年俸のまま即加入できていた。
// 頭数合わせはオフシーズンだけ・1クラブ1レース1人までなので、1レースで市場は空にならない。
//
// ★自チームが交渉中だったFAを先に獲られたときは、黙って消さず理由を残す
//   （札の片付けそのものは utils/talkSync の reconcileTalks の仕事）。
import type { ExpiredNegotiation, ForeignClub, ForeignLeague, Player, Race, Season, Team, TransferRecord } from '../types'
import { ROSTER_MAX, rosterCapOf } from '../data/rosterRules'
import { pickCpuFreeAgents } from './cpuMarket'
import { findClub } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { type NewsItem, cpuSignedHeadline } from '../utils/newsItems'
import { faMarketSalary, ovr, perfOf, newContractYears } from '../utils/playerUtils'

export function signInSeasonFreeAgents(params: {
  players: Player[]
  teams: Team[]
  foreignClubs: ForeignClub[]
  foreignLeagues: ForeignLeague[]
  currentSeason: Season
  /** 今季の日程（結果入り）。実績の参照に使う */
  races: Race[]
  playerTeamId: string
  /** ④本人が行くか。呼び出し側（store）が destinationOf を持っているので渡してもらう */
  consents?: (player: Player, clubId: string) => boolean
  raceDate: string
  /** レース通算数（先を越された通知のIDに使う） */
  nextClock: number
}): { players: Player[]; teams: Team[]; records: TransferRecord[]; news: NewsItem[]; snipedNegs: ExpiredNegotiation[] } {
  const { foreignClubs, foreignLeagues, currentSeason, races, playerTeamId, raceDate, nextClock } = params
  let players = params.players
  let teams = params.teams
  const records: TransferRecord[] = []
  // ── シーズン中のFA補強 ─────────────────────────────────
  // ★クラブがFAを獲るのは「必要か」「そこで走れるか」だけ。オフシーズンと同じ
  //   pickCpuFreeAgents 1本で、国内クラブも海外クラブも同じ入口を通る。
  //
  //   ここが無かったので、**シーズン中のFA市場は自チームの独占**だった。
  //   17クラブが欲しがっているOVR83のFAが誰にも獲られず市場に残り続け、
  //   前年俸のまま即加入できていた（「必要な選手ならFAでも取るだろ」）。
  //   頭数合わせ（③）はオフシーズンだけ・1クラブ1レース1人までなので、
  //   1レースで市場が空になることはない。
  const inSeasonForeignIds = new Set(foreignClubs.map(c => c.id))
  const faSignings = pickCpuFreeAgents({
    players: players,
    clubs: [...teams, ...foreignClubs],
    playerTeamId,
    season: { ...currentSeason, races: races },
    capFor: (id) => (inSeasonForeignIds.has(id) ? ROSTER_MAX : rosterCapOf(0)),
    // ④本人が行くか（オフの一括処理とまったく同じ関門）
    consents: params.consents })
  const faSignNews: NewsItem[] = []
  // 自チームが交渉中だったFAを先に獲られたら、黙って消さずに理由を残す
  // （札の片付けそのものは reconcileTalks の仕事）
  const faSnipedNegs: ExpiredNegotiation[] = []
  const negotiatingFaIds = new Set(
    (currentSeason.acquisitionOffers ?? [])
      .filter(o => o.status === 'pending' || o.status === 'countered')
      .map(o => o.playerId))
  for (const sg of faSignings) {
    const before = players.find(x => x.id === sg.playerId)
    if (!before) continue
    const m = movePlayer({ players: players, teams: teams }, sg.playerId, sg.clubId, {
      year: currentSeason.year,
      date: raceDate,
      kind: 'free',
      myTeamId: playerTeamId,
      contract: { yearsLeft: newContractYears(before, currentSeason.year), annualSalary: faMarketSalary(before, perfOf(currentSeason, sg.playerId)), contractType: 'standard' } })
    if (!m.ok) continue
    players = m.players
    teams = m.teams
    if (m.record) records.push(m.record)
    const club = findClub(teams, foreignLeagues, sg.clubId)
    if (ovr(before) >= 65) {
      faSignNews.push({
        date: raceDate,
        headline: cpuSignedHeadline({ clubShort: club?.shortName ?? '', playerName: before.name, playerOvr: ovr(before) }),
        category: 'fa' as const,
        relatedIds: [before.id] })
    }
    if (negotiatingFaIds.has(sg.playerId)) {
      faSnipedNegs.push({
        id: `fa_sniped_${sg.playerId}_${nextClock}`,
        playerId: before.id, playerName: before.name, kind: 'outbid',
        detail: `${club?.shortName ?? '他クラブ'}が先に契約しました` })
    }
  }
  return { players, teams, records, news: faSignNews, snipedNegs: faSnipedNegs }
}
