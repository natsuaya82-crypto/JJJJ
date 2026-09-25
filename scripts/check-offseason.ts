/**
 * オフシーズン（endSeason）を実際に走らせて、CPUクラブのロスターが壊れないかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-offseason.ts --outfile=/tmp/mos.cjs && node /tmp/mos.cjs
 *
 * ■なぜ要るのか
 *   「クラブの規模」を平均OVR（cpuTeamTier）から格へ寄せたとき、
 *   契約更新・売り出し・引き抜きの判定が全部 needsPlayer / hasNoPlayingTime に変わる。
 *   ここを間違えると **CPUが誰も更新せずロスターが溶ける**（下限15人を割る）。
 *   ブラウザは localStorage が5MBで1シーズン回せないので、ここで直接回す。
 */
import { useGameStore } from '../src/store/gameStore'
import { runCpuReleases } from '../src/engine/cpuOffseason'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUE_DEFS, INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { clubsInLeague, clubsWhere, isJpelLeague, jpelClubs } from '../src/utils/world'
import { generateSeasonRaces } from '../src/data/races'
import { ROSTER_MIN, ROSTER_MAX, RUNNING_SLOTS, CPU_SELL_FLOOR } from '../src/data/rosterRules'
import { isSurplus } from '../src/utils/transferDecision'
import { tierOf } from '../src/utils/clubTier'
import { ovr, retirementAgeOf, calcTransferValue, marketValueOf } from '../src/utils/playerUtils'
import { POACH_PREMIUM } from '../src/data/economy'
import type { SeasonStanding, Team, Player, WorldClub } from '../src/types'
import { seasonLeaguesFixture } from './seasonFixture'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, YEAR)
let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]

// 契約年数をばらけさせる（満了が出ないと契約更新の枝を通らない）
let sd = 11
const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff }
players = players.map(p => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + Math.floor(rnd() * 3) } }))

const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
for (const d of DIVISIONS) {
  const rows = standings[d]
  rows.forEach((row, i) => {
    row.totalPoints = (rows.length - i) * DIVISION_RACES[d]
    for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: rows.length - i })
  })
}
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const l of FOREIGN_LEAGUE_DEFS) foreignStandings[l.id] = clubsInLeague(INITIAL_FOREIGN_CLUBS, l.id).map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))

const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
// 世界のクラブは1つの並び（国内52 → 海外180）
const clubs: WorldClub[] = [...teams, ...INITIAL_FOREIGN_CLUBS]
const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))

const before = new Map(teams.map(t => [t.id, players.filter(p => p.teamId === t.id && p.status === 'active').length]))
console.log(`開始：選手 ${players.length}人 / 国内 ${teams.length}クラブ / 海外 ${INITIAL_FOREIGN_CLUBS.length}クラブ`)
console.log('')

useGameStore.setState({
  isInitialized: true,
  playerTeamId: MY,
  clubs,
  players,
  currentSeason: {
    year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    leagues: seasonLeaguesFixture({
      myDivision: divisionOf(teams.find(t => t.id === MY)!),
      races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as never),
      standings, foreignStandings }),
    newsFeed: [], objectives: [],
    incomingOffers: [], transferListings: [], contractRequests: [],
  },
  pastSeasons: [],
  worldAthleticsResults: [],
  worldRepresentatives: [],
} as never)

console.log('[1] endSeason を実行')
let threw: string | null = null
try {
  useGameStore.getState().endSeason()
} catch (e) {
  threw = (e as Error).message
}
check('endSeason が例外なく走り切る', threw === null, threw ?? '')
if (threw) { console.log(`✗ ${threw}`); process.exit(1) }

// ★**移籍市場はここで動きます**（`engine/transferMarket.ts` の1本を beginSeasonDraft が回す）。
//   endSeason だけを回して「オフシーズンを通した」と言うと、市場を1件も通りません。
//   実際、経路を1本にしたときに [7] が 0件 になって初めて気づきました。
try {
  useGameStore.getState().beginSeasonDraft()
} catch (e) {
  threw = (e as Error).message
}
check('beginSeasonDraft が例外なく走り切る', threw === null, threw ?? '')
if (threw) { console.log(`✗ ${threw}`); process.exit(1) }

const after = useGameStore.getState()
const afterTeams = jpelClubs(after.clubs)
const roster = (id: string) => after.players.filter(p => p.teamId === id && p.status === 'active')

console.log('')
console.log('[2] ロスターが溶けていないか（国内52クラブ）')
{
  const sizes = afterTeams.map(t => roster(t.id).length)
  const under = afterTeams.filter(t => roster(t.id).length < ROSTER_MIN)
  const over = afterTeams.filter(t => roster(t.id).length > ROSTER_MAX)
  console.log(`  在籍  最少 ${Math.min(...sizes)}人 / 中央 ${sizes.slice().sort((a, b) => a - b)[26]}人 / 最多 ${Math.max(...sizes)}人`)
  for (const t of under.slice(0, 5)) console.log(`    ${t.shortName} ${roster(t.id).length}人`)
  check(`下限(${ROSTER_MIN}人)を割ったクラブが無い`, under.length === 0, `${under.length}クラブ`)
  check(`上限(${ROSTER_MAX}人)を超えたクラブが無い`, over.length === 0, `${over.length}クラブ`)
  // ★「15人以下にはできない」（2026-08-12・オーナー判断）。
  //   下の2つはセットで意味を持ちます。**片方だけだと自己言及になって何も守りません**
  //   （定数を15に下げると、定数を読んでいる側の判定は当然通ってしまう）。
  //     1つ目 … 決まりそのものを数で留める（16人以上でなければならない）
  //     2つ目 … 実際にその決まりどおり動いているか
  check('「15人以下にはできない」＝ 出す側の下限は16人以上', CPU_SELL_FLOOR >= 16, `いま ${CPU_SELL_FLOOR}`)
  const thin = afterTeams.filter(t => roster(t.id).length < CPU_SELL_FLOOR)
  check(`売って ${CPU_SELL_FLOOR}人を下回ったクラブが無い`, thin.length === 0,
    thin.map(t => `${t.shortName} ${roster(t.id).length}人`).join(' , '))
}

console.log('')
console.log('[3] 海外クラブ（180）も同じ')
{
  const fClubs = clubsWhere(after.clubs, c => !isJpelLeague(c.leagueId))
  const sizes = fClubs.map(c => roster(c.id).length)
  const under = fClubs.filter(c => roster(c.id).length < ROSTER_MIN)
  console.log(`  在籍  最少 ${Math.min(...sizes)}人 / 中央 ${sizes.slice().sort((a, b) => a - b)[90]}人 / 最多 ${Math.max(...sizes)}人`)
  check(`下限(${ROSTER_MIN}人)を割ったクラブが無い`, under.length === 0, `${under.length}クラブ`)
}

console.log('')
console.log('[4] 格が高いクラブほど名簿が強いか（格が効いているか）')
{
  const rows = afterTeams.map(t => {
    const r = roster(t.id)
    return { tier: tierOf(t), avg: r.length ? r.reduce((s, p) => s + ovr(p), 0) / r.length : 0 }
  }).filter(x => x.avg > 0)
  const band = (lo: number, hi: number) => {
    const v = rows.filter(x => x.tier >= lo && x.tier <= hi)
    return v.length ? (v.reduce((s, x) => s + x.avg, 0) / v.length).toFixed(1) : '—'
  }
  console.log(`  格5〜8   平均OVR ${band(5, 8)}`)
  console.log(`  格9〜13  平均OVR ${band(9, 13)}`)
  console.log(`  格14〜20 平均OVR ${band(14, 20)}`)
  const top = Number(band(5, 8)), bot = Number(band(14, 20))
  check('格上のクラブのほうが名簿が強い', top > bot, `${top} vs ${bot}`)
}

console.log('')
console.log('[5] 選手が消えていないか')
{
  const active = after.players.filter(p => p.status === 'active').length
  const retired = after.players.filter(p => p.status === 'retired').length
  const freeAgents = after.players.filter(p => p.status === 'active' && (!p.teamId || p.teamId === '' || p.teamId === '__pool__')).length
  console.log(`  現役 ${active}人 / 引退 ${retired}人 / 無所属(FA) ${freeAgents}人`)
  check('現役が半分以上残っている', active > players.length * 0.5, `${active} / ${players.length}`)
  // 引退年齢は32〜40。生成直後の名簿は若いので、初回のオフでは出ないことがある。
  // 引退の式そのものは retirementAgeOf を直接見て確かめる
  const ages = after.players.filter(p => p.status === 'active').map(p => p.age)
  console.log(`  年齢  最少 ${Math.min(...ages)}歳 / 最多 ${Math.max(...ages)}歳`)
  const sample = after.players.filter(p => p.status === 'active').slice(0, 5)
  console.log(`  引退年齢の例  ${sample.map(p => `${p.age}歳→${retirementAgeOf(p)}`).join(' / ')}`)
  const willRetire = after.players.filter(p => p.status === 'active' && p.age + 1 >= retirementAgeOf(p)).length
  check('引退の式が効いている（来季引退に届く選手がいる）', willRetire > 0, `${willRetire}人`)
}

console.log('')
console.log('[6] 在籍の増減（国内・上位10クラブ）')
{
  const rows = afterTeams.map(t => ({ t, b: before.get(t.id) ?? 0, a: roster(t.id).length })).sort((x, y) => (y.a - y.b) - (x.a - x.b))
  for (const r of [...rows.slice(0, 3), ...rows.slice(-3)]) {
    console.log(`  ${r.t.shortName.padEnd(8)} 格${String(tierOf(r.t)).padStart(2)}  ${r.b} → ${r.a}`)
  }
}

console.log('')
console.log('[7] 「余剰か」の枝が両方とも生きているか')
{
  // ★ここが死んでいても、ロスターも格も golden も何も言いません。
  //   実際、`isSurplus` に「名簿が21人より多ければ余剰」が同居していたころは、
  //   全232クラブが23〜25人なので**恒真**——主力の引き抜き割増（POACH_PREMIUM）も
  //   そのときだけ聞く本人同意も、どの経路でも一度も発火していませんでした
  //   （`docs/BACKLOG.md` A-10）。「緑になった」は「通った」の証拠になりません。
  // まず線そのもの。走れる人数(7)の2倍が境目
  check('14番手は余剰でない', !isSurplus({ squadRank: RUNNING_SLOTS * 2 }))
  check('15番手からが余剰', isSurplus({ squadRank: RUNNING_SLOTS * 2 + 1 }))

  const recs = after.transferHistory.filter(r => (r.fee ?? 0) > 0 && r.year === YEAR + 1)
  const byId = new Map(after.players.map(p => [p.id, p]))
  // ★分母は**市場が使ったのと同じ材料**で出すこと。移籍金は「今季どれだけ走ったか」を
  //   見る（`calcTransferValue` の第2引数）ので、素の `calcTransferValue(p)` と比べると
  //   割増1.4倍が実績倍率0.7で打ち消されて「素の額」に見えます（実測で割増が0件になった）
  const done = after.pastSeasons[after.pastSeasons.length - 1]
  // ★**値段は `playerUtils.marketValueOf` 1本**（市場が使ったのとまったく同じ材料）。
  //   ここで `calcTransferValue(p, perfOf(...))` を組み立て直すと、材料が1つでも違った
  //   ときに「割増が0件」に見えて、直したのは点検のほうだった、が起きます
  const perfWorld = { players: after.players, clubs: after.clubs, currentSeason: done }
  let plain = 0, premium = 0, other = 0
  for (const r of recs) {
    const p = byId.get(r.playerId); if (!p) continue
    const v = done ? marketValueOf(p, perfWorld as never) : calcTransferValue(p)
    if (v <= 0) continue
    const ratio = (r.fee ?? 0) / v
    // 移籍後は年齢も契約年数も動くので、素の額とぴったりは一致しない。帯で見る
    if (ratio >= POACH_PREMIUM * 0.8) premium++
    else if (ratio >= 0.4) plain++
    else other++
  }
  console.log(`  移籍金つき ${recs.length}件 … 素の額あたり ${plain}件 / 割増(${POACH_PREMIUM}倍)あたり ${premium}件 / それ以外 ${other}件`)
  check(`主力の引き抜き（割増 ${POACH_PREMIUM}倍）が起きている`, premium > 0,
    '1件も無い＝isSurplus が恒真になっている（割増も本人同意も発火しない）')
  // ★「素の額」が0件なのは壊れではありません。**15番手以降の選手に移籍金を払う買い手は
  //   まず現れない**（要るのは「穴が埋まって、そこで走れる」選手だけ）ので、余剰の選手は
  //   解雇→FA（0円）かレンタルで動きます。実測でも国内97件・海外30件すべてが割増でした。
  //   ここは数を見張らず、出た数をそのまま書き出すだけにします（`docs/BACKLOG.md` A-10）。
  if (plain === 0) console.log('  （余剰の売買は0件。15番手以降に移籍金を払う買い手は現れない＝解雇かレンタルで動く）')
}

console.log('')
console.log('[9] 解雇の下限は1本（理由ごとに線を持たない）')
{
  // ★**世界を1つ作って流す形（上の [1]〜[8]）では、この枝は運まかせでした。**
  //   下限にぶつかるクラブが偶然できた回にしか当たらず、わざと壊しても
  //   6回に1回しか落ちません（＝ほとんど何も守っていない）。
  //   切る理由は2つ（衰えた選手／払える年俸に収まらない）ありますが、**下限は1つ**です。
  //   以前は「年俸」のループだけが `CPU_SELL_FLOOR` を見ていて、「衰えた選手」は
  //   何人でも切れました。ここは**そのための世界を1件だけ作って**確かめます。
  const THIN = 'thin-club'
  const thinTeam = { ...(base[0] as Team), id: THIN, shortName: '検証', name: '検証クラブ' } as Team
  // 在籍ちょうど CPU_SELL_FLOOR 人。うち5人は「平均より大きく劣り、契約も切れる」＝
  // 衰えた選手の枝に必ず当たる。年俸は0なので「払える年俸」の枝は1人も切らない
  const mk = (i: number, weak: boolean): Player => ({
    ...(players.find(x => x.status !== 'retired')!),
    id: `thin-${i}`, teamId: THIN, age: 25, status: 'active', loan: undefined,
    ratings: { speed: weak ? 40 : 80, stamina: weak ? 40 : 80, pacing: weak ? 40 : 80,
      climbing: weak ? 40 : 80, descending: weak ? 40 : 80, sprint: weak ? 40 : 80, mental: weak ? 40 : 80 },
    contract: { annualSalary: 0, yearsLeft: weak ? 1 : 3 },
  } as Player)
  const thinRoster = Array.from({ length: CPU_SELL_FLOOR }, (_, i) => mk(i, i < 5))
  const out = runCpuReleases(
    { players: thinRoster, clubs: [thinTeam] },
    { playerTeamId: MY, year: YEAR, rosterCapFor: () => ROSTER_MAX })
  const left = out.players.filter(p => p.teamId === THIN && p.status !== 'retired').length
  // 空振りの緑よけ：この世界で「衰えた選手」の枝が本当に当たることを先に確かめる
  const weakOnes = thinRoster.filter(p => ovr(p) < 60 && p.contract.yearsLeft <= 1).length
  check('衰えた満了選手がいる世界になっている（空振りの緑ではない）', weakOnes === 5, `${weakOnes}人`)
  check(`ちょうど ${CPU_SELL_FLOOR} 人のクラブからは1人も切らない`, left === CPU_SELL_FLOOR, `${left}人`)

  // もう1件：下限より1人多いクラブは、切れるのは1人だけ
  const oneOver = [...thinRoster, mk(99, true)]
  const out2 = runCpuReleases(
    { players: oneOver, clubs: [thinTeam] },
    { playerTeamId: MY, year: YEAR, rosterCapFor: () => ROSTER_MAX })
  const left2 = out2.players.filter(p => p.teamId === THIN && p.status !== 'retired').length
  check(`${CPU_SELL_FLOOR + 1} 人なら1人だけ切って下限で止まる`, left2 === CPU_SELL_FLOOR, `${left2}人`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ オフシーズンを1回通してもロスターは壊れない。格が名簿の強さに効いている')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
