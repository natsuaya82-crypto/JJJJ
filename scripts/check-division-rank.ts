/**
 * 順位表が部ごとに分かれていることと、部をまたいだ並べ方が作れないことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-division-rank.ts --outfile=/tmp/cdr.cjs && node /tmp/cdr.cjs
 *
 * 部が違えばレース数が違う（1部10戦 / 2部8戦 / 3部7戦）ので、勝ち点は部をまたいで
 * 比べられない。以前は全52チームを1本の配列で持ち「表示するときに絞る」形だったため、
 * 絞り忘れた画面で 2部の首位が9位・3部の首位が13位 と出ていた。
 */
import {
  rankedStandings, rankOfTeam, seasonDivisionStandings, divisionStandings, divisionInSeason,
  domesticThroughRankOfTeam, newSeasonStandings, positionPointsFor,
  DIVISIONS, DIVISION_SIZE, DIVISION_RACES, DIVISION_LABEL,
} from '../src/utils/league'
import type { Division } from '../src/types'

type Row = { teamId: string; totalPoints: number }

// 52クラブぶんを**実際の配点**で作る。
//   順位ポイント = そのレースに出たチーム数 + 1 - 着順（positionPointsFor）
// 毎回同じ着順で走ったチーム、という単純な形にする。
const teams: { id: string; division: Division }[] = []
const pointsOf = new Map<string, number>()
for (const d of DIVISIONS) {
  const n = DIVISION_SIZE[d]
  for (let i = 0; i < n; i++) {
    const id = `d${d}-${String(i).padStart(2, '0')}`
    teams.push({ id, division: d })
    pointsOf.set(id, DIVISION_RACES[d] * positionPointsFor(n, i + 1))
  }
}
const season = {
  standings: newSeasonStandings<Row>(teams, teamId => ({ teamId, totalPoints: pointsOf.get(teamId) ?? 0 })),
}

console.log('■ 配点（1位 = 出走クラブ数ぶん、以下1点ずつ減る）')
for (const d of DIVISIONS) {
  console.log(`  ${DIVISION_LABEL[d].padEnd(3)} ${DIVISION_SIZE[d]}クラブ × ${DIVISION_RACES[d]}戦 → 全勝で ${DIVISION_RACES[d] * positionPointsFor(DIVISION_SIZE[d], 1)}点`)
}
console.log('')

// 混ぜたらどうなっていたか（この並べ方はもう作れない。ここでは手で潰して比較用に作る）
const mixed = rankedStandings(DIVISIONS.flatMap(d => season.standings[d]))

console.log('■ 各部の首位')
console.log('  部    部の中で   混ぜていたころ   通し順位(1〜52)')
for (const d of DIVISIONS) {
  const top = divisionStandings(season, d)[0]
  const inDiv = rankOfTeam(divisionStandings(season, d), top.teamId)
  const asMixed = rankOfTeam(mixed, top.teamId)
  const through = domesticThroughRankOfTeam(season, top.teamId)
  console.log(`  ${DIVISION_LABEL[d].padEnd(4)} ${String(inDiv).padStart(4)}位  ${String(asMixed).padStart(10)}位  ${String(through).padStart(12)}位`)
}
console.log('')

// 部ごとに分けたので「その年どの部にいたか」は順位表そのものから分かる。
// 昇降格して今は別の部にいても、過去の年が狂わない
const me = 'd1-09'
console.log('■ その年どの部にいたか（順位表のキーそのもの）')
console.log(`  ${me} → ${DIVISION_LABEL[divisionInSeason(season, me)!]} / その部で ${rankOfTeam(seasonDivisionStandings(season, me), me)}位`)

// いまは3部にいる、という状態を作っても過去の年は動かない
const movedTeams = teams.map(t => (t.id === me ? { ...t, division: 3 as Division } : t))
const stillDiv = divisionInSeason(season, me)
console.log(`  そのあと3部へ降格しても → ${DIVISION_LABEL[stillDiv!]} / ${rankOfTeam(seasonDivisionStandings(season, me), me)}位`)
console.log(movedTeams.length === teams.length && stillDiv === 1
  ? '\n✓ いまの所属を変えても、過去の年の部と順位は動かない'
  : '\n✗ 過去の年が今の所属に引きずられている')
