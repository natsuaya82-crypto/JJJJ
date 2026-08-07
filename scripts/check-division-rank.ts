/**
 * 「順位が全52チームで並んでいた」問題が直ったかを、順位表を作って確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-division-rank.ts --outfile=/tmp/cdr.cjs && node /tmp/cdr.cjs
 *
 * 部ごとにレース数が違う（1部10戦 / 2部8戦 / 3部7戦）ので、得点で52チームを
 * まとめて並べると走った数の多い部がそのまま上に来る。
 * 焼き込み（SeasonStanding.division）が無い古い年でも、その年の駅伝に
 * 一緒に出ていた面々から復元できることも一緒に見る。
 */
import { rankedStandings, rankOfTeam, seasonDivisionStandings, DIVISIONS, DIVISION_SIZE, DIVISION_RACES, DIVISION_LABEL } from '../src/utils/league'
import type { Division } from '../src/types'

type Row = { teamId: string; division?: Division; totalPoints: number }

// 52クラブぶんの順位表を作る。1レースあたりの得点は部によらず同じ（＝走った数だけ差が付く）
const PER_RACE = 12
const teams: { id: string; division: Division }[] = []
const rows: Row[] = []
for (const d of DIVISIONS) {
  for (let i = 0; i < DIVISION_SIZE[d]; i++) {
    const id = `d${d}-${String(i).padStart(2, '0')}`
    teams.push({ id, division: d })
    // 部内i番目は「i個ぶん取りこぼした」とする
    rows.push({ teamId: id, division: d, totalPoints: (DIVISION_RACES[d] * PER_RACE) - i * 3 })
  }
}

const me = 'd1-09'          // 1部の10番手（＝本当は10位）
const season = { standings: rows }

const before = rankOfTeam(rankedStandings(rows), me)
const after = rankOfTeam(seasonDivisionStandings(season, teams, me), me)

console.log('■ 直る前と後')
console.log(`  ${me}（1部の10番手）`)
console.log(`    52チームをまとめて並べた場合 : ${before}位   ← ホームに出ていた数字`)
console.log(`    部で絞った場合               : ${after}位`)
console.log('')

console.log('■ 部ごとの人数と、混ぜたときに何位に化けるか')
for (const d of DIVISIONS) {
  const top = `d${d}-00`
  const mixed = rankOfTeam(rankedStandings(rows), top)
  const own = rankOfTeam(seasonDivisionStandings(season, teams, top), top)
  console.log(`  ${DIVISION_LABEL[d].padEnd(3)}（${DIVISION_SIZE[d]}クラブ / ${DIVISION_RACES[d]}戦）の首位  混ぜると${String(mixed).padStart(2)}位 → 部で絞ると${own}位`)
}
console.log('')

// 焼き込みが無い古い年。その年の駅伝（自分の部のぶんだけ残っている）から復元できるか
const oldRows: Row[] = rows.map(r => ({ teamId: r.teamId, totalPoints: r.totalPoints }))
const myDivIds = teams.filter(t => t.division === 1).map(t => t.id)
const oldSeason = {
  standings: oldRows,
  races: [{ results: { teamRankings: myDivIds.map(teamId => ({ teamId })) } }],
}
// teams は「昇降格して今は別の部にいる」状態を模す（今の部で絞ると間違える）
const movedTeams = teams.map(t => (t.id === me ? { ...t, division: 3 as Division } : t))
const recovered = rankOfTeam(seasonDivisionStandings(oldSeason, movedTeams, me), me)
console.log('■ 焼き込みが無い古い年（そのあと3部へ降格した想定）')
console.log(`    今の部だけで絞ると          : ${rankOfTeam(seasonDivisionStandings({ standings: oldRows }, movedTeams, me), me)}位  ← 3部の面々と比べてしまう`)
console.log(`    その年の駅伝の面々から復元  : ${recovered}位`)
console.log('')
console.log(recovered === after ? '✓ 焼き込みが無くても、その年の駅伝が残っていれば同じ順位が出る' : '✗ 復元に失敗している')
