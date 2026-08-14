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
//   使うレースは**その部自身の日程**（data/races.ts の drawSeasonSchedules）。
//   部ごとにレース数もコースも違う（1部10戦 / 2部8戦 / 3部7戦）ので、
//   自分の部のレースを他の部にも走らせてはいけない。

import type { Division, Player, Race, SeasonStanding, Team } from '../types'
import { runBackgroundRace } from './backgroundRace'
import { playersByClub } from '../utils/rosterSync'
import { DIVISIONS, teamsInDivision } from '../utils/league'

export type AwayDivisionRound = {
  /** teamId → このレースで得た勝点 */
  points: Record<string, number>
  /** teamId → このレースの部内順位 */
  ranks: Record<string, number>
  /** playerId → { races, segWins } 通算成績への加算ぶん */
  careerAdd: Record<string, { races: number; segWins: number }>
  /** teamId → このレースの区間賞賞金。自チームの部と同じ数え方（utils/league.ts） */
  segPrize: Record<string, number>
  /**
   * 実際に走らせたレース（結果つき）。呼ぶ側が Season.divisionRaces へ書き戻す。
   * 以前はここを捨てて出走数だけ残していたので、区間タイムも順位も誰と競ったかも
   * 残らなかった。区間記録・移籍の判断材料・監督が海外へ移ったときの過去が作れない。
   */
  raced: { division: Division; roundIndex: number; race: Race }[]
}

/**
 * 自分の部以外を1レース分だけ進める。順位表・通算成績への反映は呼び出し側が行う。
 * @param myDivision プレイヤーの部（ここは本編で走るので対象外）
 */
export function simulateAwayDivisions(
  race: Race, teams: Team[], players: Player[], myDivision: number, seasonProgress: number,
  /** 部ごとの日程。渡さなければ従来どおり自分の部のレースを流用する（古いセーブの保険） */
  racesByDivision?: Record<number, Race[]>,
  /** 自分の部で何戦目か（0始まり）。その部の日程が尽きていればその部は走らない */
  roundIndex = 0,
): AwayDivisionRound {
  const points: Record<string, number> = {}
  const ranks: Record<string, number> = {}
  const careerAdd: Record<string, { races: number; segWins: number }> = {}
  const segPrize: Record<string, number> = {}
  // 走らせた結果そのもの。以前はここで捨てて出走数だけ残していたので、区間タイムも
  // 誰と競ったかも残らなかった（区間記録も移籍の判断材料も作れない）
  const raced: { division: Division; roundIndex: number; race: Race }[] = []
  // クラブごとの名簿は1回だけ作る（部×クラブの数だけ全選手を走査しない・utils/rosterSync）
  const byClub = playersByClub(players)

  for (const d of DIVISIONS) {
    if (d === myDivision) continue
    const divTeams = teamsInDivision(teams, d)
    if (divTeams.length < 2) continue

    // その部自身のコース。日程が尽きている部はこのラウンドは走らない（1部10戦・3部7戦など）
    const divRaces = racesByDivision?.[d]
    if (divRaces && roundIndex >= divRaces.length) continue
    const divRace = divRaces?.[roundIndex] ?? race

    // 走らせるのは engine/backgroundRace の1本（並べ方も数え方もそこ）。
    // 出られるのは active の選手だけ＝国内の決まり。ここが大会ごとに違うので呼ぶ側で絞る
    const out = runBackgroundRace({
      race: divRace, players, teams, seasonProgress,
      entrants: divTeams.map(t => ({ id: t.id, roster: (byClub.get(t.id) ?? []).filter(p => p.status === 'active') })),
    })

    Object.assign(points, out.points)
    Object.assign(ranks, out.ranks)
    for (const [tid, v] of Object.entries(out.segPrize)) segPrize[tid] = (segPrize[tid] ?? 0) + v
    for (const [id, add] of Object.entries(out.careerAdd)) {
      const cur = careerAdd[id] ?? { races: 0, segWins: 0 }
      careerAdd[id] = { races: cur.races + add.races, segWins: cur.segWins + add.segWins }
    }
    raced.push({ division: d, roundIndex, race: out.race })
  }
  return { points, ranks, careerAdd, segPrize, raced }
}

/**
 * 裏で走らせた結果を順位表へ足す。自分の部の行は触らない（本編の結果が入るため）。
 * 勝点の内訳（leaguePoints / segmentPoints）は本編と同じ形で持つ。
 */
export function applyAwayDivisionRound(
  standings: Record<Division, SeasonStanding[]>, myDivision: Division,
  round: AwayDivisionRound, race: Race,
): Record<Division, SeasonStanding[]> {
  const out = { ...standings }
  for (const d of DIVISIONS) {
    if (d === myDivision) continue          // 自分の部は本編のレースで動く
    out[d] = (standings[d] ?? []).map(s => {
      const earned = round.points[s.teamId]
      if (earned == null) return s
      return {
        ...s,
        // 内訳は持たず合計だけを動かす（裏の部は順位さえ出れば足りる）
        totalPoints: s.totalPoints + earned,
        leaguePoints: (s.leaguePoints ?? 0) + earned,
        raceResults: [...s.raceResults, { raceId: race.id, rank: round.ranks[s.teamId] ?? 0, points: earned }],
      }
    })
  }
  return out
}

/**
 * 走らせた結果を、部ごとの日程へ書き戻す。**書き戻しはここ1本。**
 * レース中の反映とシーズン終了時の追い上げの2か所から呼ぶので、
 * 別々に書くと片方だけ記録が残らない。
 */
export function applyRacedToSchedule(
  schedule: Record<number, Race[]> | undefined,
  raced: AwayDivisionRound['raced'],
): Record<number, Race[]> | undefined {
  if (!schedule || raced.length === 0) return schedule
  const out: Record<number, Race[]> = { ...schedule }
  for (const { division, roundIndex, race } of raced) {
    const list = out[division]
    if (!list || !list[roundIndex]) continue
    out[division] = list.map((r, i) => (i === roundIndex ? race : r))
  }
  return out
}
