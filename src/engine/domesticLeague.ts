// 自分の部以外（プレイヤーが走らない部）を裏で走らせる。
//
// ■ なぜ要るのか
//   レースに出るのは「自分と同じ部のチームだけ」（gameStore の runRace）。そのため
//   2部・3部の順位表はシーズンを通して 0pt のまま動かず、
//     ・順位表を開いても全チーム同点
//     ・昇降格の「上位2チーム」が決まらない
//     ・2部3部のCPU選手だけ通算成績が増えず、年俸・移籍金の実績倍率が上がらない
//   という状態だった。海外8リーグは engine/foreignLeague.ts で毎マッチデー裏実行して
//   いるので、国内の他の部だけが取り残されていた。ここを海外と同じ形にする。
//
// ■ 海外リーグ（simulateForeignLeagueRound）との違い
//   走らせる単位が「クラブの集まり(ForeignLeague)」ではなく「部(Division)」であることだけ。
//   使うレースは自分の部と同じ1本（同じ日に同じコースを別の部が走るイメージ）。

import type { Player, Race, SeasonStanding, Team } from '../types'
import { simulateRace, buildAILineup } from './raceEngine'
import { DIVISIONS, divisionOf, teamsInDivision, segmentPrizeByTeam } from '../utils/league'

export type AwayDivisionRound = {
  /** teamId → このレースで得た勝点 */
  points: Record<string, number>
  /** teamId → このレースの部内順位 */
  ranks: Record<string, number>
  /** playerId → { races, segWins } 通算成績への加算ぶん */
  careerAdd: Record<string, { races: number; segWins: number }>
  /** teamId → このレースの区間賞賞金。自チームの部と同じ数え方（utils/league.ts） */
  segPrize: Record<string, number>
}

/**
 * 自分の部以外を1レース分だけ進める。順位表・通算成績への反映は呼び出し側が行う。
 * @param myDivision プレイヤーの部（ここは本編で走るので対象外）
 */
export function simulateAwayDivisions(
  race: Race, teams: Team[], players: Player[], myDivision: number, seasonProgress: number,
): AwayDivisionRound {
  const points: Record<string, number> = {}
  const ranks: Record<string, number> = {}
  const careerAdd: Record<string, { races: number; segWins: number }> = {}
  const segPrize: Record<string, number> = {}

  for (const d of DIVISIONS) {
    if (d === myDivision) continue
    const divTeams = teamsInDivision(teams, d)
    if (divTeams.length < 2) continue

    const lineups: Record<string, Record<number, string>> = {}
    for (const t of divTeams) lineups[t.id] = buildAILineup(t.id, players, race)

    const results = simulateRace(race, lineups, teams, players, seasonProgress)

    for (const tr of results.teamRankings) {
      points[tr.teamId] = tr.positionPoints + tr.segmentPoints
      ranks[tr.teamId] = tr.rank
    }
    for (const [tid, v] of Object.entries(segmentPrizeByTeam(results.segmentResults))) {
      segPrize[tid] = (segPrize[tid] ?? 0) + v
    }
    for (const lineup of Object.values(lineups)) {
      for (const id of Object.values(lineup)) {
        const segWins = results.segmentResults.filter(sr => sr.runners[0]?.playerId === id).length
        const cur = careerAdd[id] ?? { races: 0, segWins: 0 }
        careerAdd[id] = { races: cur.races + 1, segWins: cur.segWins + segWins }
      }
    }
  }
  return { points, ranks, careerAdd, segPrize }
}

/**
 * 裏で走らせた結果を順位表へ足す。自分の部の行は触らない（本編の結果が入るため）。
 * 勝点の内訳（leaguePoints / segmentPoints）は本編と同じ形で持つ。
 */
export function applyAwayDivisionRound(
  standings: SeasonStanding[], teams: Team[], myDivision: number,
  round: AwayDivisionRound, race: Race,
): SeasonStanding[] {
  return standings.map(s => {
    const t = teams.find(x => x.id === s.teamId)
    if (!t || divisionOf(t) === myDivision) return s
    const earned = round.points[s.teamId]
    if (earned == null) return s
    return {
      ...s,
      // 内訳は持たず合計だけを動かす（裏の部は順位さえ出れば足りる）
      totalPoints: s.totalPoints + earned,
      leaguePoints: s.leaguePoints + earned,
      raceResults: [...s.raceResults, { raceId: race.id, rank: round.ranks[s.teamId] ?? 0, points: earned }],
    }
  })
}
