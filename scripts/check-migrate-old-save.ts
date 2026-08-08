/**
 * 2.0.1 のセーブ（persist v29）を読み込んでも壊れないことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-migrate-old-save.ts --outfile=/tmp/cmo.cjs && node /tmp/cmo.cjs
 *
 * 2.0.1 は persist v29。いまは v37 なので、読み込むと30〜37の変換が順に走る。
 * この間に入れた変更のうち、**セーブの形が変わったもの**は次のとおり。
 *   v31 部（ディビジョン）を足した          … 既存チームは全員1部
 *   v32 予算をクラブの格1本にした            … 残高を格の年間予算で入れ直す
 *   v36 順位表を部ごとに分けて持つ            … 平らな配列 → 部ごとのRecord
 *   v37 世界大会の走行記録をシーズン側へ移す  … worldAthleticsResults[].races → Season.waRaces
 *
 * 変換が1つでも抜けると、読み込んだ瞬間に順位が全部おかしくなったり、
 * 過去の大会の記録が消えたりする。ここでは変換後に
 *   ・順位表が部ごとの形になっているか（今季・過去シーズンとも）
 *   ・過去の走行記録が1本も消えていないか（読み口 utils/raceHistory を通して数える）
 *   ・下部リーグが無い状態でも表示側が落ちないか
 * を見る。
 */
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { LEAGUE_COURSE_POOL } from '../src/data/races'
import { ranRaces } from '../src/utils/raceHistory'
import { waRaceRows } from '../src/utils/waRaces'
import { buildCareerCounts } from '../src/utils/careerStats'
import { divisionStandings, DIVISIONS } from '../src/utils/league'
import { clubSeasonRank, clubWonLeague } from '../src/utils/clubStanding'
import type { Race } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
// v39 までのセーブはクラブ側にも名簿（roster.main）を持っていた。v40 で落とす
const teams = INITIAL_TEAMS.map((t, i) => {
  const { division: _d, ...rest } = t as Record<string, unknown>
  return { ...rest, roster: { main: [`ghost-${i}`] } }
})
const players = generateCpuRosters(INITIAL_TEAMS as never, YEAR).cpuPlayers

// v29 当時のレース（結果つき）。走者は各チームの先頭8人
const mkRace = (i: number): Race => {
  const c = LEAGUE_COURSE_POOL[i]
  const runners = teams.flatMap(t => players.filter(p => p.teamId === t.id).slice(0, 1).map(p => ({
    playerId: p.id, teamId: t.id as string, timeSec: 1800 + i, rank: 1,
  })))
  return {
    id: `r${i}`, name: c.name, date: `${YEAR}-04-0${i + 1}`, location: c.location ?? '', type: 'league',
    segments: c.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
    results: { teamRankings: [], segmentResults: [{ segmentIndex: 1, runners }] },
  }
}
const races = [mkRace(0), mkRace(1)]
// v29 の順位表は「全チームを1本の配列」で持っていた
const flatStandings = teams.map((t, i) => ({
  teamId: t.id as string, leaguePoints: 40 - i, segmentPoints: 0, totalPoints: 40 - i,
  raceResults: [{ raceId: 'r0', rank: i + 1, points: 20 - i }],
}))
const waRace: Race = { ...mkRace(2), id: 'wa-2029-r1', name: '2029 世界選手権アジア予選 東京 第1戦' }

const oldSave: Record<string, unknown> = {
  isInitialized: true,
  playerTeamId: teams[0].id,
  teams,
  players,
  // 海外リーグの順位表は v38 まで行のキーが clubId だった（v39 で teamId に統一）
  currentSeason: {
    year: YEAR, races, standings: flatStandings, newsFeed: [], objectives: [],
    foreignStandings: { africa_east: [
      { clubId: 'ken_1', totalPoints: 42, raceResults: [{ raceId: 'fr0', rank: 1, points: 20 }] },
      { clubId: 'eth_1', totalPoints: 31, raceResults: [{ raceId: 'fr0', rank: 2, points: 16 }] },
    ] },
  },
  pastSeasons: [{
    year: YEAR - 1, races: [mkRace(3)], standings: flatStandings,
    foreignStandings: { africa_east: [
      { clubId: 'eth_1', totalPoints: 55, raceResults: [{ raceId: 'pfr0', rank: 1, points: 20 }] },
      { clubId: 'ken_1', totalPoints: 12, raceResults: [{ raceId: 'pfr0', rank: 2, points: 16 }] },
    ] },
  }],
  worldAthleticsResults: [{ year: YEAR - 1, kind: 'qualifier', host: 'JPN', standings: [], advanced: [], races: [waRace] }],
  worldRepresentatives: [],
}
const before = {
  raceRows: 1 + races.length + 1,   // 過去1本 + 今季2本 + 世界大会1本
}

console.log('2.0.1（persist v29）のセーブを読み込む')
const migrate = (useGameStore.persist.getOptions() as { migrate?: (s: unknown, v: number) => Record<string, unknown> }).migrate
if (!migrate) { console.log('✗ migrate が取り出せない'); process.exit(1) }
let after: Record<string, unknown>
try {
  after = migrate(JSON.parse(JSON.stringify(oldSave)), 29)
} catch (e) {
  console.log(`✗ 変換で例外: ${(e as Error).message}`)
  process.exit(1)
}
check('例外なく読み込める', true)

// ── 部（v31）──
console.log('')
console.log('[部]')
const tAfter = after.teams as { id: string; division?: number }[]
check('全チームに部が入る', tAfter.every(t => t.division != null), `${tAfter.filter(t => t.division == null).length}件が未設定`)
check('既存チームは1部', tAfter.every(t => t.division === 1))
console.log(`  ※ 2部・3部の32クラブはここでは増えない。シーズンを1回終えたときに入る（utils/domesticClubs）`)

// ── 順位表（v36）──
console.log('')
console.log('[順位表]')
const cs = after.currentSeason as { standings?: unknown }
check('今季が部ごとの形になっている', !Array.isArray(cs.standings) && typeof cs.standings === 'object')
const d1 = divisionStandings(cs as Parameters<typeof divisionStandings>[0], 1)
check('1部に20チーム全部いる', d1.length === teams.length, `${d1.length}チーム`)
check('2部・3部は空', DIVISIONS.slice(1).every(d => divisionStandings(cs as Parameters<typeof divisionStandings>[0], d).length === 0))
const ps = (after.pastSeasons as { standings?: unknown }[])[0]
check('過去シーズンも部ごとの形', !Array.isArray(ps.standings) && typeof ps.standings === 'object')

// ── 走行記録（v37 と読み口）──
console.log('')
console.log('[走行記録]')
const seasons = [...(after.pastSeasons as never[]), after.currentSeason as never]
const rows = ranRaces({
  seasons,
  waResults: after.worldAthleticsResults as never,
  playerTeamId: after.playerTeamId as string,
})
check('走ったレースが1本も消えていない', rows.length === before.raceRows, `${rows.length}本（${before.raceRows}本のはず）`)
check('世界大会が読める', waRaceRows(seasons, after.worldAthleticsResults as never).length === 1)
const leagues = [...new Set(rows.map(r => r.league))].sort()
console.log(`  大会: ${leagues.join(' / ')}`)
check('自分の部として読める', leagues.some(l => l.startsWith('JPEL')))

// ── 通算成績 ──
console.log('')
console.log('[通算成績]')
let counts: Map<string, { totalRaces: number }> | undefined
try {
  counts = buildCareerCounts(after.pastSeasons as never, after.currentSeason as never) as never
  check('数え直しで例外が出ない', true)
} catch (e) {
  check('数え直しで例外が出ない', false, (e as Error).message)
}
if (counts) check('出走が数えられている', [...counts.values()].some(c => c.totalRaces > 0))

// ── 残高（v32）──
console.log('')
console.log('[予算]')
const fin = (after.teams as { finance?: { budget?: number; deficitStreak?: number } }[])[0].finance
check('残高が格の年間予算で入り直している', (fin?.budget ?? 0) > 0, `${fin?.budget}`)
check('連続赤字が0に戻る', fin?.deficitStreak === 0)

// ── クラブ側の名簿の廃止（v40）──
console.log('')
console.log('[クラブ側の名簿]')
{
  const tA = after.teams as Record<string, unknown>[]
  check('team.roster が落ちている', !tA.some(t => 'roster' in t),
    `${tA.filter(t => 'roster' in t).length}件残っている`)
  check('チームの他の項目は残っている', tA.every(t => typeof t.id === 'string' && t.finance != null))
}

// ── 海外リーグの順位表（v39）──
// 行のキーが clubId → teamId に変わった。均し損ねると海外の順位が全部0になり、
// 優勝回数も格の更新も止まる（最下位を続けても格が動かない状態に戻る）
console.log('')
console.log('[海外リーグの順位表]')
{
  const csAfter = after.currentSeason as { foreignStandings?: Record<string, Record<string, unknown>[]> }
  const psAfter = (after.pastSeasons as { foreignStandings?: Record<string, Record<string, unknown>[]> }[])[0]
  const cur = csAfter.foreignStandings?.africa_east ?? []
  const past = psAfter?.foreignStandings?.africa_east ?? []
  check('今季ぶんが teamId になっている', cur.length === 2 && cur.every(r => typeof r.teamId === 'string' && r.teamId !== ''),
    JSON.stringify(cur.map(r => r.teamId)))
  check('過去シーズンぶんも teamId になっている', past.length === 2 && past.every(r => typeof r.teamId === 'string' && r.teamId !== ''),
    JSON.stringify(past.map(r => r.teamId)))
  check('clubId は残っていない', ![...cur, ...past].some(r => 'clubId' in r))
  check('勝ち点と走行結果は消えていない', cur[0]?.totalPoints === 42 && (cur[0]?.raceResults as unknown[])?.length === 1)
  // 均したあとの順位表を読み口に通す（画面が見るのと同じ経路）
  const rank = clubSeasonRank(after.currentSeason as never, 'ken_1')
  const pastRank = clubSeasonRank(psAfter as never, 'eth_1')
  check('読み口から今季の順位が引ける', rank.rank === 1 && rank.total === 2, JSON.stringify(rank))
  check('読み口から過去の順位が引ける', pastRank.rank === 1, JSON.stringify(pastRank))
  check('過去のリーグ優勝が数えられる', clubWonLeague(psAfter as never, 'eth_1') && !clubWonLeague(psAfter as never, 'ken_1'))
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 2.0.1のセーブを読み込んでも、順位表も走行記録も通算成績も壊れない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
for (const p of problems) console.log(`  ${p}`)
process.exit(1)
