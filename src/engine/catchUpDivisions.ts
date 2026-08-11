// 他の部の残り日程を消化する。endSeason から切り出した（挙動不変）。
//
// ■なぜ要るのか
//   裏の部（engine/domesticLeague）は「自分の部で何戦目か」で進むので、
//   自分の部のほうが戦数が少ないと他の部の日程が残ったままシーズンが終わる。
//   3部（7戦）で遊ぶと1部（10戦）は7戦しか走らず、順位表も昇降格も通算成績も
//   3戦ぶん足りない状態で確定していた。**残りをここで全部走らせる。**
//
// ■触るときの注意
//   - 順位表へ足すときの raceId は「その回に実際に走った部のコース」を使う
//   - 走らせるものが無ければ `null` を返す（呼び出し側は状態を変えない）
//   - **乱数を引く。** 呼ぶ位置と回数を動かすと世界が変わる
import { applyAwayDivisionRound, applyRacedToSchedule, simulateAwayDivisions } from './domesticLeague'
import { DIVISIONS, divisionOf } from '../utils/league'
import type { GameState, Player, Team } from '../types'

export function catchUpAwayDivisions(args: {
  currentSeason: GameState['currentSeason']
  teams: Team[]
  players: Player[]
  playerTeamId: string
}): { currentSeason: GameState['currentSeason']; players: Player[] } | null {
  const { currentSeason, teams, players, playerTeamId } = args

const divRaces = currentSeason.divisionRaces
if (!divRaces) return null
const myDivision = divisionOf(teams.find(t => t.id === playerTeamId))
const doneRounds = currentSeason.races.length
const maxRounds = Math.max(...Object.values(divRaces).map(rs => rs.length))
if (maxRounds <= doneRounds) return null
let standings = currentSeason.standings
let catchUpSchedule = currentSeason.divisionRaces
const careerAdd: Record<string, { races: number; segWins: number }> = {}
const segPrize: Record<string, number> = { ...(currentSeason.seasonSegPrize ?? {}) }
for (let r = doneRounds; r < maxRounds; r++) {
  const round = simulateAwayDivisions(
    currentSeason.races[currentSeason.races.length - 1],
    teams, players, myDivision, 1, divRaces, r,
  )
  // 順位表へ足すときの raceId は、その回に実際に走った部のコースを使う
  const anyRace = DIVISIONS.map(d => (d === myDivision ? undefined : divRaces[d]?.[r])).find(Boolean)
  if (!anyRace) continue
  standings = applyAwayDivisionRound(standings, myDivision, round, anyRace)
  // 走行記録も日程へ書き戻す（レース中の反映と同じ関数を通す）
  catchUpSchedule = applyRacedToSchedule(catchUpSchedule, round.raced)
  for (const [pid, v] of Object.entries(round.careerAdd)) {
    const cur = careerAdd[pid] ?? { races: 0, segWins: 0 }
    careerAdd[pid] = { races: cur.races + v.races, segWins: cur.segWins + v.segWins }
  }
  for (const [tid, v] of Object.entries(round.segPrize)) segPrize[tid] = (segPrize[tid] ?? 0) + v
}
const awayApps2: Record<string, { races: number; wins: number }> = { ...(currentSeason.awayAppearances ?? {}) }
for (const [pid, v] of Object.entries(careerAdd)) {
  const cur = awayApps2[pid] ?? { races: 0, wins: 0 }
  awayApps2[pid] = { races: cur.races + v.races, wins: cur.wins + v.segWins }
}

  return {
    currentSeason: { ...currentSeason, standings, divisionRaces: catchUpSchedule, seasonSegPrize: segPrize, awayAppearances: awayApps2 },
    players: players.map(p => {
      const add = careerAdd[p.id]
      return add
        ? { ...p, career: { ...p.career, totalRaces: p.career.totalRaces + add.races, segmentWins: p.career.segmentWins + add.segWins } }
        : p
    }) }
}
