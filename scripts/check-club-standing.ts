/**
 * 「そのクラブは今どこにいるか」の引き方を1本にした（utils/clubStanding）ことで
 * 表示が変わらない／変わったところは直っている、を確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-club-standing.ts --outfile=/tmp/ccs.cjs && node /tmp/ccs.cjs
 *
 * 順位表の置き場所は国内(standings: 部ごと)と海外(foreignStandings: リーグごと)で分かれている。
 * もとは行のキーが teamId / clubId で違うだけだったので、読む側は必ず if (isForeign) を
 * 書かされていた。チーム詳細ページだけで6か所が二重になっていた。
 *
 * ここで見るのは
 *   1. 国内クラブの順位・勝ち点・行が、これまでの引き方（league.ts）と1件も違わない
 *   2. 海外クラブの順位・勝ち点・行が、これまでの引き方（foreignStandings 直読み）と違わない
 *   3. 消化試合数が「そのクラブが走った数」になっている
 *      （旧：自分の部のレース数を全チームに使い回していたので、2部・3部のクラブを見ると
 *        10と出ていた。部ごとにレース数は10/8/7と違う）
 */
import { clubStandingRow, clubSeasonRank, clubRacesDone, clubWonLeague, normalizeStandingRows, normalizeForeignStandings } from '../src/utils/clubStanding'
import {
  DIVISIONS, DIVISION_SIZE, DIVISION_RACES, divisionOf,
  standingRowOf, rankedStandings, newSeasonStandings,
  divisionInSeason, divisionStandings, rankOfTeam,
} from '../src/utils/league'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import type { Division, ForeignStanding, SeasonStanding, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
let seed = 20260807
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

// 部ごとに規定数だけ走らせた順位表を作る（部でレース数が違うのが要点：10 / 8 / 7）
const standings = newSeasonStandings<SeasonStanding>(teams, id => ({
  teamId: id, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [],
}))
for (const d of DIVISIONS) {
  for (let r = 0; r < DIVISION_RACES[d]; r++) {
    for (const row of standings[d]) {
      const pts = Math.round(rnd() * 20)
      row.totalPoints += pts
      row.leaguePoints += pts
      row.raceResults.push({ raceId: `d${d}-r${r}`, rank: 1 + Math.floor(rnd() * DIVISION_SIZE[d]), points: pts })
    }
  }
}

// 海外は各リーグ6戦
const foreignStandings: Record<string, ForeignStanding[]> = {}
for (const l of FOREIGN_LEAGUES) {
  foreignStandings[l.id] = l.clubs.map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
  for (let r = 0; r < 6; r++) {
    for (const row of foreignStandings[l.id]) {
      const pts = Math.round(rnd() * 20)
      row.totalPoints += pts
      row.raceResults.push({ raceId: `${l.id}-r${r}`, rank: 1 + Math.floor(rnd() * l.clubs.length), points: pts })
    }
  }
}

const season = { standings: standings as Partial<Record<Division, SeasonStanding[]>>, foreignStandings }

// ★順位は「その集団の中での順位」1本。国内は部内順位（1部1〜20／2部・3部1〜16）。
//   通し順位（1〜52）は格を決めるためだけの内部の数で、画面には出さない。
//   「47位」「52位」は遊ぶ側にとって意味が無く、部をまたいだ順位という考え方も無い。
console.log('[1] 国内クラブ：順位はその部の中での順位（通し順位を返さない）')
{
  let rankDiff = 0, rowDiff = 0, totalDiff = 0, divDiff = 0, over = 0
  for (const t of teams) {
    const div = divisionInSeason(season, t.id)!
    const want = rankOfTeam(divisionStandings(season, div), t.id)
    const oldRow = standingRowOf(season, t.id)
    const got = clubSeasonRank(season, t.id)
    if (got.rank !== want) rankDiff++
    if (got.total !== DIVISION_SIZE[div]) totalDiff++
    if (got.division !== div) divDiff++
    // 通し順位が漏れていれば、その部の人数を超える数が出る
    if (got.rank > DIVISION_SIZE[div]) over++
    if (clubStandingRow(season, t.id)?.totalPoints !== oldRow?.totalPoints) rowDiff++
  }
  console.log(`  ${teams.length}クラブを突き合わせ`)
  check('順位はその部の中での順位', rankDiff === 0, `${rankDiff}件ズレ`)
  check('比べる相手の数はその部の人数', totalDiff === 0, `${totalDiff}件ズレ`)
  check('どの部かも一緒に返る', divDiff === 0, `${divDiff}件ズレ`)
  check('部の人数を超える順位は出ない（通し順位が漏れていない）', over === 0, `${over}件`)
  check('順位表の行（勝ち点）が同じ', rowDiff === 0, `${rowDiff}件ズレ`)
}

console.log('')
console.log('[2] 海外クラブ：これまでの引き方と1件も違わない')
{
  let rankDiff = 0, rowDiff = 0, totalDiff = 0, n = 0
  for (const l of FOREIGN_LEAGUES) {
    const sorted = rankedStandings(foreignStandings[l.id])
    for (const c of l.clubs) {
      n++
      const oldRank = sorted.findIndex(x => x.teamId === c.id) + 1
      const oldRow = foreignStandings[l.id].find(x => x.teamId === c.id)
      const got = clubSeasonRank(season, c.id)
      if (got.rank !== oldRank) rankDiff++
      if (got.total !== l.clubs.length) totalDiff++
      if (clubStandingRow(season, c.id)?.totalPoints !== oldRow?.totalPoints) rowDiff++
    }
  }
  console.log(`  ${n}クラブを突き合わせ`)
  check('リーグ内順位が同じ', rankDiff === 0, `${rankDiff}件ズレ`)
  check('比べる相手の数がそのリーグのクラブ数', totalDiff === 0, `${totalDiff}件ズレ`)
  check('順位表の行（勝ち点）が同じ', rowDiff === 0, `${rowDiff}件ズレ`)
}

console.log('')
console.log('[3] 消化試合数は「そのクラブが走った数」')
{
  // 旧：自分の部のレース数を全チームに使い回していた（1部を見ているときは全部10と出る）
  const OLD_FOR_EVERYONE = DIVISION_RACES[1]
  const wrongBefore = teams.filter(t => DIVISION_RACES[divisionOf(t)] !== OLD_FOR_EVERYONE).length
  let ok = 0, ng = 0
  for (const t of teams) {
    if (clubRacesDone(season, t.id) === DIVISION_RACES[divisionOf(t)]) ok++; else ng++
  }
  for (const l of FOREIGN_LEAGUES) for (const c of l.clubs) {
    if (clubRacesDone(season, c.id) === 6) ok++; else ng++
  }
  console.log(`  1部から見たとき、旧の数え方だと ${wrongBefore}クラブ（2部・3部）が10と出ていた`)
  console.log(`  いま：${ok}クラブが自分の走った数、${ng}クラブがズレ`)
  check('全クラブが自分の走った数になっている', ng === 0, `${ng}件ズレ`)
  check('2部・3部のクラブは10ではない', teams.filter(t => divisionOf(t) !== 1).every(t => clubRacesDone(season, t.id) !== 10))
}

console.log('')
console.log('[4] 優勝の判定（国内＝部の1位／海外＝リーグの1位）')
{
  const champs = teams.filter(t => clubWonLeague(season, t.id))
  const fChamps = FOREIGN_LEAGUES.flatMap(l => l.clubs).filter(c => clubWonLeague(season, c.id))
  console.log(`  国内 ${champs.length}クラブ（3部あるので3件）／海外 ${fChamps.length}クラブ（9リーグなので9件）`)
  check('国内は部の数だけ1位が出る', champs.length === DIVISIONS.length, `${champs.length}件`)
  check('海外はリーグの数だけ1位が出る', fChamps.length === FOREIGN_LEAGUES.length, `${fChamps.length}件`)
}

console.log('')
console.log('[5] 旧セーブ（行のキーが clubId）を均せる')
{
  const legacy = FOREIGN_LEAGUES[0].clubs.map((c, i) => ({ clubId: c.id, totalPoints: 100 - i, raceResults: [] }))
  const normalized = normalizeStandingRows(legacy)
  check('全部 teamId になる', normalized.every(r => r.teamId !== ''), JSON.stringify(normalized.slice(0, 2)))
  check('clubId は消える', !normalized.some(r => 'clubId' in r))
  check('勝ち点は変わらない', normalized[0].totalPoints === 100)
  const wrapped = normalizeForeignStandings({ [FOREIGN_LEAGUES[0].id]: legacy })
  check('リーグ単位でも均せる', (wrapped?.[FOREIGN_LEAGUES[0].id] ?? []).every(r => r.teamId !== ''))
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 国内も海外も同じ入口で引けて、これまでの表示と変わらない（消化試合だけ直っている）')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
