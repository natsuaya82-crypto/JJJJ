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
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { ROSTER_MIN, ROSTER_MAX, RUNNING_SLOTS, CPU_SELL_FLOOR } from '../src/data/rosterRules'
import { isSurplus } from '../src/utils/transferDecision'
import { tierOf } from '../src/utils/clubTier'
import { ovr, retirementAgeOf, calcTransferValue, perfOf } from '../src/utils/playerUtils'
import { POACH_PREMIUM } from '../src/data/economy'
import type { SeasonStanding, Team, Player } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
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
for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))

const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))

const before = new Map(teams.map(t => [t.id, players.filter(p => p.teamId === t.id && p.status === 'active').length]))
console.log(`開始：選手 ${players.length}人 / 国内 ${teams.length}クラブ / 海外 ${fgen.updatedLeagues.reduce((s, l) => s + l.clubs.length, 0)}クラブ`)
console.log('')

useGameStore.setState({
  isInitialized: true,
  playerTeamId: MY,
  teams,
  players,
  foreignLeagues: fgen.updatedLeagues,
  currentSeason: {
    year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
    standings, foreignStandings, newsFeed: [], objectives: [],
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
const roster = (id: string) => after.players.filter(p => p.teamId === id && p.status === 'active')

console.log('')
console.log('[2] ロスターが溶けていないか（国内52クラブ）')
{
  const sizes = after.teams.map(t => roster(t.id).length)
  const under = after.teams.filter(t => roster(t.id).length < ROSTER_MIN)
  const over = after.teams.filter(t => roster(t.id).length > ROSTER_MAX)
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
  const thin = after.teams.filter(t => roster(t.id).length < CPU_SELL_FLOOR)
  check(`売って ${CPU_SELL_FLOOR}人を下回ったクラブが無い`, thin.length === 0,
    thin.map(t => `${t.shortName} ${roster(t.id).length}人`).join(' , '))
}

console.log('')
console.log('[3] 海外クラブ（180）も同じ')
{
  const fClubs = after.foreignLeagues.flatMap(l => l.clubs)
  const sizes = fClubs.map(c => roster(c.id).length)
  const under = fClubs.filter(c => roster(c.id).length < ROSTER_MIN)
  console.log(`  在籍  最少 ${Math.min(...sizes)}人 / 中央 ${sizes.slice().sort((a, b) => a - b)[90]}人 / 最多 ${Math.max(...sizes)}人`)
  check(`下限(${ROSTER_MIN}人)を割ったクラブが無い`, under.length === 0, `${under.length}クラブ`)
}

console.log('')
console.log('[4] 格が高いクラブほど名簿が強いか（格が効いているか）')
{
  const rows = after.teams.map(t => {
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
  const rows = after.teams.map(t => ({ t, b: before.get(t.id) ?? 0, a: roster(t.id).length })).sort((x, y) => (y.a - y.b) - (x.a - x.b))
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
  const teamRaces = (done?.races ?? []).filter(r => r.results).length
  let plain = 0, premium = 0, other = 0
  for (const r of recs) {
    const p = byId.get(r.playerId); if (!p) continue
    const v = done ? calcTransferValue(p, perfOf(done, p.id, teamRaces)) : calcTransferValue(p)
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
if (problems.length === 0) {
  console.log('✓ オフシーズンを1回通してもロスターは壊れない。格が名簿の強さに効いている')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
