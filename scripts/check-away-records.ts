/**
 * ほかのリーグ（国内の他の部・海外）を**日付の順に**走らせたとき、
 *   ・走行記録から数え直した通算成績が、走らせながらためた集計と一致する
 *   ・自チームのリーグは1本も走らせない（本編で走るので二重になる）
 *   ・どのリーグの記録にも、そのリーグの順位表に載っているクラブしか混ざらない
 *   ・その日までの開催が全部走り、その日より後は1本も走らない
 * を確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-away-records.ts --outfile=/tmp/car.cjs && node /tmp/car.cjs
 *
 * 走らせるのは engine/leagueDay の runLeaguesThrough 1本（本番と同じ入口）。
 * 通算成績は走行記録から数え直す（utils/careerStats）ので、数が変わると年俸も移籍金も動く。
 */
import { runLeaguesThrough } from '../src/engine/leagueDay'
import { buildCareerCounts } from '../src/utils/careerStats'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUE_DEFS, INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { drawSeasonSchedules } from '../src/data/races'
import { DIVISIONS, divisionLeagueId, newSeasonStandings } from '../src/utils/league'
import { seasonLeaguesFixture } from './seasonFixture'
import type { Season, SeasonStanding, Team, WorldClub } from '../src/types'

let seed = 20260925
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

const YEAR = 2028
const MY = 'yonago'   // 3部（7戦）。ほかのリーグのほうが戦数が多い側で見る
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const fgen = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, YEAR)
const clubs: WorldClub[] = [...teams, ...INITIAL_FOREIGN_CLUBS]
const players = [...generateCpuRosters(teams, YEAR).cpuPlayers, ...fgen.players]
const schedules = drawSeasonSchedules(YEAR, Math.random)
const standings = newSeasonStandings<SeasonStanding>(clubs, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
const season = {
  year: YEAR, currentRaceIndex: 0,
  leagues: seasonLeaguesFixture({ schedules, standings }),
} as unknown as Season
const myLeague = divisionLeagueId(3)

// 6月末まで（途中の日付で止まることも見る）
const THROUGH = `${YEAR}-06-30`
const out = runLeaguesThrough({ season, players, clubs, through: THROUGH, skip: myLeague })
if (!out) { console.log('✗ 空振り（1本も走らなかった）'); process.exit(1) }
const L = out.season.leagues

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

console.log('[1] その日までの開催が全部走り、その日より後は走らない')
{
  let early = 0, late = 0, ran = 0
  for (const [id, lg] of Object.entries(L)) {
    if (id === myLeague) continue
    for (const r of lg.races) {
      if (r.date <= THROUGH && !r.results) early++
      if (r.date > THROUGH && r.results) late++
      if (r.results) ran++
    }
  }
  console.log(`      走った ${ran}本`)
  check('その日までの開催に走り残しが無い', early === 0, `${early}本`)
  check('その日より後の開催は走っていない', late === 0, `${late}本`)
  check('自チームのリーグは1本も走らせていない', L[myLeague].races.every(r => !r.results))
  const fl = L[FOREIGN_LEAGUE_DEFS[0].id]
  check('海外リーグの日程は日本1部と同じ10日', fl.races.length === 10
    && fl.races.every((r, i) => r.date === L[divisionLeagueId(1)].races[i].date))
}

console.log('[1b] 開催日ちょうどまで走らせると、その日の開催も走る（「その日を含む」）')
{
  // 1部の開幕日。海外9リーグも同じ日に開幕する
  const day = season.leagues[divisionLeagueId(1)].races[0].date
  const o = runLeaguesThrough({ season, players, clubs, through: day, skip: myLeague })
  const onDay = Object.entries(o?.season.leagues ?? {}).filter(([id]) => id !== myLeague)
    .flatMap(([, lg]) => lg.races.filter(r => r.date === day))
  check('その日の開催が全部走っている', onDay.length > 0 && onDay.every(r => !!r.results), `${onDay.filter(r => !r.results).length}本残り／${onDay.length}本`)
}

console.log('[2] どのリーグの記録にも、そのリーグのクラブしか混ざらない')
{
  const mixed: string[] = []
  for (const [id, lg] of Object.entries(L)) {
    const members = new Set(lg.standings.map(s => s.teamId))
    const ok = lg.races.every(r => (r.results?.teamRankings ?? []).every(tr => members.has(tr.teamId)))
    if (!ok) mixed.push(id)
  }
  check('混ざっていない', mixed.length === 0, mixed.join('・'))
}

console.log('[3] 順位表は走行記録から数え直したものと同じ')
{
  let bad = 0
  for (const lg of Object.values(L)) {
    for (const s of lg.standings) {
      let pts = 0
      for (const r of lg.races) {
        const tr = r.results?.teamRankings?.find(x => x.teamId === s.teamId)
        if (tr) pts += tr.positionPoints + tr.segmentPoints
      }
      if (pts !== s.totalPoints) bad++
    }
  }
  check('全クラブの勝ち点が走行記録と一致', bad === 0, `${bad}クラブ`)
}

console.log('[4] 走行記録から数え直した通算成績 ＝ 走らせながらためた集計')
{
  const fromRecords = buildCareerCounts([out.season])
  const agg = new Map<string, { races: number; wins: number }>()
  for (const [pid, a] of Object.entries(out.season.awayAppearances ?? {})) agg.set(pid, { races: a.races, wins: a.wins })
  for (const [pid, a] of Object.entries(out.season.foreignAppearances ?? {})) {
    const cur = agg.get(pid) ?? { races: 0, wins: 0 }
    agg.set(pid, { races: cur.races + a.races, wins: cur.wins + a.wins })
  }
  const ids = new Set([...agg.keys(), ...fromRecords.keys()])
  const diffs: string[] = []
  for (const id of ids) {
    const a = agg.get(id) ?? { races: 0, wins: 0 }
    const b = fromRecords.get(id) ?? { totalRaces: 0, segmentWins: 0 }
    if (a.races !== b.totalRaces || a.wins !== b.segmentWins) diffs.push(`${id}: 集計 ${a.races}/${a.wins} ／ 記録 ${b.totalRaces}/${b.segmentWins}`)
  }
  console.log(`      走った選手 ${ids.size}人`)
  // ★空振り除け。走った選手が0人だと食い違いも0件になって緑になる
  check('空振りしていない（走った選手がいる）', ids.size > 0)
  check('出走・区間賞が1人も食い違わない', diffs.length === 0, diffs.slice(0, 3).join(' ／ '))
  // 通算成績（選手に持たせている数）も同じだけ増えている
  const before = new Map(players.map(p => [p.id, p.career.totalRaces]))
  const grew = out.players.filter(p => (p.career.totalRaces - (before.get(p.id) ?? 0)) !== (fromRecords.get(p.id)?.totalRaces ?? 0)).length
  check('選手の通算出走も走行記録と同じだけ増えている', grew === 0, `${grew}人`)
}

console.log('[5] 日付の順に走る（同じリーグの2戦目は1戦目のあと）')
{
  // 走る順は結果の中に残らないので、同じリーグの中で「後の日付だけ走って前が残る」が無いことで見る
  let bad = 0
  for (const lg of Object.values(L)) {
    let seenUnrun = false
    for (const r of [...lg.races].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!r.results) seenUnrun = true
      else if (seenUnrun && r.date <= THROUGH) bad++
    }
  }
  check('前の日付を飛ばして走ったレースが無い', bad === 0, `${bad}本`)
  // 同じ日付にもう一度呼んでも何も走らない（二重に走らせない）
  const again = runLeaguesThrough({ season: out.season, players: out.players, clubs, through: THROUGH, skip: myLeague })
  check('同じ日まで2回呼んでも2回目は何も走らない', again === null)
}

console.log('')
if (problems.length === 0) {
  console.log(`✓ ほかのリーグは日付の順に走り、記録と集計は1つも食い違わない（${DIVISIONS.length}部＋海外${FOREIGN_LEAGUE_DEFS.length}リーグ）`)
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
