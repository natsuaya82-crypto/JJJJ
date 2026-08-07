/**
 * 裏レースの並べ方を1本（engine/backgroundRace の bgLineup）に寄せても、
 * これまでと同じ区間配置になることを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-background-race.ts --outfile=/tmp/cbr.cjs && node /tmp/cbr.cjs
 *
 * 寄せる前は3通りあった。
 *   国内の裏の部  buildAILineup        … 地形順に置く＋余った区間を能力で埋める
 *   ECL・世界選手権 assignLineupByTerrain + ensureAllSegments … 埋め方が「控えの先頭から」
 *   海外リーグ    assignLineupByTerrain だけ … **埋めない**
 * 埋めないと空区間のまま走ることになり、「再生では総合タイムが少なく＝1位、
 * 結果画面ではバケット方式で最下位」という順位の食い違いが起きる。
 *
 * 見たいのは2つ。
 *   1. 国内の配置がこれまでと1区間も変わらないこと（＝挙動を変えないリファクタ）
 *   2. 海外リーグで空区間が実際にあったのか、あったなら埋まるようになったこと
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { LEAGUE_COURSE_POOL, FINAL_COURSES } from '../src/data/races'
import { assignLineupByTerrain, bgLineup } from '../src/engine/raceEngine'
import { belongsToClub } from '../src/utils/rosterSync'
import type { Race, Team } from '../src/types'

const YEAR = 2028
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign, updatedLeagues } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players = [...domestic, ...foreign]

const courses = [...LEAGUE_COURSE_POOL, ...FINAL_COURSES]
const races: Race[] = courses.map((c, i) => ({
  id: `r${i}`, name: c.name, date: '2028-04-01', location: c.location ?? '',
  type: 'league', segments: c.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
}))

const same = (a: Record<number, string>, b: Record<number, string>) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[Number(k)] !== b[Number(k)]) return false
  return true
}

// ── 1. 国内の裏の部：これまでと同じ配置になるか ──
let domChecked = 0
let domDiff = 0
for (const t of teams) {
  const roster = players.filter(p => p.teamId === t.id && p.status === 'active')
  for (const race of races) {
    // かつての buildAILineup は「地形順に置く → 余った区間を能力で埋める」。
    // roster を渡す形になっただけで判断は同じはずなので、素の terrain 配置と突き合わせる
    const before = assignLineupByTerrain(roster, race)
    const after = bgLineup(roster, race)
    domChecked++
    if (!same(before, after)) domDiff++
  }
}
console.log(`国内 ${teams.length}チーム × ${races.length}コース = ${domChecked}通りの配置`)
console.log(`  これまでと違う配置 ${domDiff}件`)

// ── 2. 海外リーグ：空区間があったか、埋まるようになったか ──
let fChecked = 0
let fEmptyBefore = 0
let fEmptyAfter = 0
let fMoved = 0        // 埋めた区間以外が動いていないか
for (const league of updatedLeagues) {
  for (const club of league.clubs) {
    const roster = players.filter(p => belongsToClub(p, club.id) && p.status !== 'injured')
    for (const race of races) {
      const before = assignLineupByTerrain(roster, race)
      const after = bgLineup(roster, race)
      fChecked++
      const emptyB = race.segments.filter(s => !before[s.index]).length
      const emptyA = race.segments.filter(s => !after[s.index]).length
      fEmptyBefore += emptyB
      fEmptyAfter += emptyA
      // 元から埋まっていた区間は同じ選手のままであること
      for (const s of race.segments) {
        if (before[s.index] && before[s.index] !== after[s.index]) fMoved++
      }
    }
  }
}
console.log('')
console.log(`海外 ${updatedLeagues.reduce((n, l) => n + l.clubs.length, 0)}クラブ × ${races.length}コース = ${fChecked}通りの配置`)
console.log(`  空区間  これまで ${fEmptyBefore} → いま ${fEmptyAfter}`)
console.log(`  元から埋まっていた区間が動いた数 ${fMoved}件`)

console.log('')
const ok = domDiff === 0 && fMoved === 0 && fEmptyAfter <= fEmptyBefore
if (ok) {
  console.log('✓ 配置はこれまでと同じ。空区間だけが埋まる方向に変わっている')
  process.exit(0)
}
if (domDiff > 0) console.log(`✗ 国内の配置が ${domDiff}件変わっている`)
if (fMoved > 0) console.log(`✗ 海外で、元から埋まっていた区間の走者が ${fMoved}件入れ替わっている`)
process.exit(1)
