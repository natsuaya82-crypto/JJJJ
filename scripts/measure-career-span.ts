/**
 * 【計測】**成長・加齢・引退・新人の補充まで入れた**在籍の長さ。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error scripts/measure-career-span.ts --outfile=/tmp/mcs.cjs && node /tmp/mcs.cjs
 *
 * ■なぜ別に作ったのか（`measure-transfer-rate.ts` との違い）
 *   あちらは移籍市場だけを回すので、**OVRが8年間ずっと同じ**で、**誰も引退しません**。
 *   その世界で「最後の年のOVRで選手を分けて、8年ぶんの移籍を足す」と、
 *   22歳でOVR85だった選手が30歳でOVR75になっていても「75-79の枠」に入り、
 *   若い頃の移籍まで一緒に数えられます。**成長と衰えがある以上、その分け方では何も言えません。**
 *   （オーナー指摘・2026-08-12）
 *
 *   ここでは毎年きちんと
 *     ・1歳とる（`engine/growth` の `growPlayer`。CPU・海外は年次成長も入る）
 *     ・引退年齢に届いたら引退する（`utils/playerUtils` の `retirementAgeOf` 1本）
 *     ・空いたぶんを新人で埋める（`generateDraftPool`）
 *   を通し、**移籍したその時点のOVRと年齢**で数えます。
 *
 * ■ここでも入っていないもの
 *   契約満了によるFA・解雇・レンタル・トレード（`endSeason` を通していないため）。
 *   所属が動く経路はまだ他にあるので、ここで出る在籍年数は**実際より長め**に出ます。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { runTransferMarket } from '../src/engine/transferMarket'
import { cpuMarketRounds, CPU_TICK_TRANSFERS } from '../src/engine/cpuOffseason'
import { growPlayer } from '../src/engine/growth'
import { ovr, retirementAgeOf } from '../src/utils/playerUtils'
import { allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../src/utils/clubTier'
import { buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import { allForeignClubs, leagueOfClub } from '../src/utils/clubs'
import { ROSTER_MAX } from '../src/data/rosterRules'
import type { Player, Season, Team } from '../src/types'

const START = 2030
const YEARS = 12
const MY = 'tokyo'

const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, START)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, START)
let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
let teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
let leagues = fgen.updatedLeagues

const CLUBS = allTieredClubs(teams, leagues)
const destinationOf = (clubId: string, player: Player) => {
  const team = teams.find(t => t.id === clubId)
  const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, CLUBS) ?? tierOfClubId(clubId))
  const lg = team ? undefined : leagueOfClub(leagues, clubId)
  return buildDestination(clubId, tier, players, { isForeign: !team, region: regionOfLeague(lg?.id), player })
}
const domesticIds = new Set(teams.map(t => t.id).filter(id => id !== MY))

/** 1件の在籍（同じクラブに続けて居た期間）。終わり方も残す */
type Spell = { years: number; endedBy: 'move' | 'retire' | 'still'; ovrAtEnd: number; ageAtEnd: number }
const spells: Spell[] = []
/** 移籍1件ごとの「そのときの姿」 */
const moves: { ovr: number; age: number }[] = []
/** 引退1件ごとの「そのときの姿」 */
const retires: { ovr: number; age: number; movesInCareer: number }[] = []

const home = new Map<string, { club: string; since: number }>()
const moveCount = new Map<string, number>()
for (const p of players) home.set(p.id, { club: p.teamId, since: 0 })

let totalMoves = 0
for (let y = 0; y < YEARS; y++) {
  const year = START + y
  const races = generateSeasonRaces(year, 1)
  const season = {
    year, currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
  } as unknown as Season
  const dates = [...races.map(r => r.date), `${year + 1}-02-01`]
  let last: string | undefined
  for (const date of dates) {
    const step = cpuMarketRounds(last, date)
    if (step.rounds <= 0) continue
    last = step.nextDate
    for (let i = 0; i < step.rounds; i++) {
      const r = runTransferMarket({ players, teams, foreignLeagues: leagues }, {
        playerTeamId: MY, year, season, pastSeasons: [],
        rosterCapFor: () => ROSTER_MAX, destinationOf,
        excludeIds: new Set<string>(), maxMoves: CPU_TICK_TRANSFERS, date })
      players = r.players; teams = r.teams; leagues = r.foreignLeagues
      totalMoves += r.records.length
    }
  }

  // ── 年の終わり：所属が変わった人を拾う（そのときのOVRと年齢で数える）
  const byId = new Map(players.map(p => [p.id, p]))
  for (const [id, h] of home) {
    const p = byId.get(id)
    if (!p || p.status === 'retired') continue
    if (p.teamId === h.club) continue
    spells.push({ years: y + 1 - h.since, endedBy: 'move', ovrAtEnd: ovr(p), ageAtEnd: p.age })
    moves.push({ ovr: ovr(p), age: p.age })
    moveCount.set(id, (moveCount.get(id) ?? 0) + 1)
    home.set(id, { club: p.teamId, since: y + 1 })
  }

  // ── 1歳とる・成長する・引退する
  players = players.map(p => {
    if (p.status === 'retired') return p
    const tier = tierOfPlayerClub(p.teamId, CLUBS) ?? 20
    const grown = growPlayer(p, true, tier)
    if (grown.age >= retirementAgeOf(grown)) {
      const h = home.get(p.id)
      if (h) {
        spells.push({ years: y + 1 - h.since, endedBy: 'retire', ovrAtEnd: ovr(grown), ageAtEnd: grown.age })
        home.delete(p.id)
      }
      retires.push({ ovr: ovr(grown), age: grown.age, movesInCareer: moveCount.get(p.id) ?? 0 })
      return { ...grown, status: 'retired', teamId: '' } as Player
    }
    return grown
  })

  // ── 空いたぶんを新人で埋める（人数を保たないと市場が動かなくなる）
  const sizeOf = (id: string) => players.filter(p => p.teamId === id && p.status !== 'retired').length
  const pool = generateDraftPool(year + 1)
  let k = 0
  for (const id of domesticIds) {
    while (sizeOf(id) < 23 && k < pool.length) {
      const rookie = { ...pool[k++], teamId: id, joinedYear: year + 1 } as Player
      players = [...players, rookie]
      home.set(rookie.id, { club: id, since: y + 1 })
    }
  }
}
for (const [, h] of home) spells.push({ years: YEARS - h.since, endedBy: 'still', ovrAtEnd: 0, ageAtEnd: 0 })

const fmt = (n: number, d = 2) => n.toFixed(d)
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const band = (o: number) => o >= 85 ? 'OVR85+' : o >= 80 ? 'OVR80-84' : o >= 75 ? 'OVR75-79' : o >= 70 ? 'OVR70-74' : 'OVR69-'
const BANDS = ['OVR85+', 'OVR80-84', 'OVR75-79', 'OVR70-74', 'OVR69-']

console.log(`\n════ 成長・引退まで入れた ${YEARS}年 ════`)
console.log(`移籍 ${totalMoves}件 ／ 1年 ${fmt(totalMoves / YEARS, 0)}件`)
console.log(`引退 ${retires.length}人 ／ 在籍の区切り ${spells.length}件`)

console.log('\n① 1つのクラブに続けて居る年数')
{
  const ended = spells.filter(s => s.endedBy !== 'still')
  console.log(`   平均 ${fmt(avg(ended.map(s => s.years)))}年（終わった在籍 ${ended.length}件）`)
  for (const k of ['move', 'retire'] as const) {
    const g = spells.filter(s => s.endedBy === k)
    console.log(`     ${k === 'move' ? '移籍で終わった' : '引退で終わった'} ${g.length}件・平均 ${fmt(avg(g.map(s => s.years)))}年`)
  }
}

console.log('\n② 移籍したのは「そのとき」どういう選手か（最後の姿ではなく移籍時点）')
{
  console.log('   帯          移籍の件数   その帯が全移籍に占める割合   移籍時の平均年齢')
  for (const b of BANDS) {
    const g = moves.filter(m => band(m.ovr) === b)
    console.log(`   ${b.padEnd(10)} ${String(g.length).padStart(7)}件 ${fmt(100 * g.length / moves.length, 1).padStart(12)}% ${fmt(avg(g.map(m => m.age)), 1).padStart(14)}歳`)
  }
}

console.log('\n③ 引退した選手は、生涯で何回移籍したか')
{
  console.log(`   平均 ${fmt(avg(retires.map(r => r.movesInCareer)))}回 ／ 引退時の平均年齢 ${fmt(avg(retires.map(r => r.age)), 1)}歳`)
  console.log('   引退時のOVR帯べつ')
  for (const b of BANDS) {
    const g = retires.filter(r => band(r.ovr) === b)
    if (!g.length) continue
    console.log(`     ${b.padEnd(10)} ${String(g.length).padStart(5)}人・生涯 ${fmt(avg(g.map(r => r.movesInCareer)))}回・引退 ${fmt(avg(g.map(r => r.age)), 1)}歳`)
  }
}

console.log('\n④ OVR70以下は本当に「すぐ引退するから動かない」のか')
{
  const low = retires.filter(r => r.ovr < 70)
  const high = retires.filter(r => r.ovr >= 80)
  console.log(`   引退時OVR70未満 ${low.length}人 … 生涯 ${fmt(avg(low.map(r => r.movesInCareer)))}回・引退 ${fmt(avg(low.map(r => r.age)), 1)}歳`)
  console.log(`   引退時OVR80以上 ${high.length}人 … 生涯 ${fmt(avg(high.map(r => r.movesInCareer)))}回・引退 ${fmt(avg(high.map(r => r.age)), 1)}歳`)
}
console.log('')
