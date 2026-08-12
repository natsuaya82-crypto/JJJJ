/**
 * 【計測】移籍の量と「同じクラブにどれだけ居続けるか」。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error scripts/measure-transfer-rate.ts --outfile=/tmp/mt.cjs && node /tmp/mt.cjs
 *
 * ■なぜ測るのか
 *   「移籍が多いのは嬉しいけど、全員1シーズンでチームを移っている。平均3シーズンにしたい。
 *     フランチャイズプレイヤーが居たっていい」（オーナー）
 *
 *   件数（1クラブ5人／年）は `scripts/check-market-rate.ts` が見張っている。
 *   足りないのは**在籍の長さ**のほうなので、ここでは何年も回して
 *   「1人の選手が同じクラブに何年続けて居るか」を数える。
 *
 * ■測る範囲（ここが大事）
 *   `engine/transferMarket.ts` の `runTransferMarket` を、1年ぶんの日程で
 *   `cpuMarketRounds`（21日ごと）にしたがって回す。**移籍の唯一の経路**なので、
 *   移籍による移動はここで全部拾える。
 *
 *   **含んでいないもの**：契約満了によるFA・解雇・引退・成長・年齢。
 *   `endSeason` を通していないため。これらを入れると所属はさらに動くので、
 *   ここで出る在籍年数は**実際より長め**に出る（＝甘い側の見積もり）。
 *   「1シーズンで移る」がここでも再現されるなら、原因は移籍市場側だと言い切れる。
 *
 * ■案を比べるとき
 *   `utils/transferDecision.ts` の定数はモジュールに焼き込まれているので、
 *   このスクリプトからは差し替えられない。**src を書き換えて → 測って → 戻す**で比べること
 *   （CLAUDE.md「変更前後で計算結果をダンプして差分を見る」の手順）。触るのは
 *     CONSENT_LINE                    … 承諾の線
 *     appraiseMove の tier の重み      … 格上への加点
 *     appraiseMove の personality      … 愛着
 *   の3つだけ。**関門（ハード制限）は足さない**（オーナー明言）。
 */
let sd = 20260812
const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
Math.random = rnd

import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { runTransferMarket } from '../src/engine/transferMarket'
import { CPU_TICK_TRANSFERS, cpuMarketRounds } from '../src/engine/cpuOffseason'
import { generateSeasonRaces } from '../src/data/races'
import { allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../src/utils/clubTier'
import { buildDestination, regionOfLeague, CONSENT_LINE } from '../src/utils/transferDecision'
import { allForeignClubs, leagueOfClub } from '../src/utils/clubs'
import { ROSTER_MAX } from '../src/data/rosterRules'
import { ovr } from '../src/utils/playerUtils'
import type { Player, Season, Team } from '../src/types'

const YEARS = Number(process.env.YEARS ?? 8)
const START = 2030
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

/** 年の初めの所属。ここを毎年ためて、続けて何年同じところに居たかを数える */
const homeByYear: Record<string, string>[] = []
let totalMoves = 0

for (let y = 0; y < YEARS; y++) {
  const year = START + y
  homeByYear.push(Object.fromEntries(players.map(p => [p.id, p.teamId])))
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
}
homeByYear.push(Object.fromEntries(players.map(p => [p.id, p.teamId])))

const clubCount = teams.length - 1 + allForeignClubs(leagues).length
const fmt = (n: number, d = 2) => n.toFixed(d)

console.log(`\n════ 移籍の量と在籍の長さ（${YEARS}年ぶん・${clubCount}クラブ）════`)
console.log(`CONSENT_LINE = ${CONSENT_LINE} ／ CPU_TICK_TRANSFERS = ${CPU_TICK_TRANSFERS}\n`)

// ── ① 量 ────────────────────────────────────────────────────
console.log('① 量')
console.log(`   移籍 ${totalMoves}件 ／ ${YEARS}年 ＝ 1年 ${fmt(totalMoves / YEARS, 0)}件`)
console.log(`   1クラブあたり ${fmt(totalMoves / YEARS / clubCount)}人／年（check-market-rate の目安は5±1.5）`)

// ── ② 在籍の長さ ─────────────────────────────────────────────
// 全期間いた選手だけを見る（途中で生成された海外の若手などは、窓が短くて不利になる）
console.log('\n② 在籍の長さ')
{
  const ids = Object.keys(homeByYear[0]).filter(id => homeByYear.every(h => h[id] != null))
  let moves = 0
  const runLens: number[] = []      // 「同じクラブに続けて居た年数」を全部ためる
  let never = 0                     // 一度も動かなかった選手
  for (const id of ids) {
    let cur = homeByYear[0][id]
    let run = 1
    let mv = 0
    for (let y = 1; y <= YEARS; y++) {
      if (homeByYear[y][id] === cur) { run++; continue }
      runLens.push(run)
      cur = homeByYear[y][id]; run = 1; mv++
    }
    runLens.push(run)
    moves += mv
    if (mv === 0) never++
  }
  const avgRun = runLens.reduce((s, n) => s + n, 0) / runLens.length
  console.log(`   対象 ${ids.length}人（${YEARS}年ずっと居た選手）`)
  console.log(`   1人あたりの移籍回数 ${fmt(moves / ids.length)}回／${YEARS}年`)
  console.log(`   **平均在籍年数 ${fmt(avgRun)}年**（オーナーの目安は3年）`)
  console.log(`   一度も動かなかった選手 ${never}人（${fmt(never / ids.length * 100, 1)}%）＝フランチャイズプレイヤー`)
  const hist = new Map<number, number>()
  for (const n of runLens) hist.set(n, (hist.get(n) ?? 0) + 1)
  console.log('   在籍年数の分布')
  for (const n of [...hist.keys()].sort((a, b) => a - b)) {
    const c = hist.get(n)!
    console.log(`     ${String(n).padStart(2)}年 ${String(c).padStart(5)}件 ${fmt(c / runLens.length * 100, 1).padStart(5)}% ${'█'.repeat(Math.round(c / runLens.length * 60))}`)
  }
}

// ── ③ 誰が動いているか ───────────────────────────────────────
console.log('\n③ 動いているのは誰か（最後の年の名簿で見る）')
{
  const ids = Object.keys(homeByYear[0]).filter(id => homeByYear.every(h => h[id] != null))
  const byId = new Map(players.map(p => [p.id, p]))
  const movesOf = (id: string) => {
    let mv = 0
    for (let y = 1; y <= YEARS; y++) if (homeByYear[y][id] !== homeByYear[y - 1][id]) mv++
    return mv
  }
  const band = (o: number) => o >= 85 ? 'OVR85+' : o >= 80 ? 'OVR80-84' : o >= 75 ? 'OVR75-79' : o >= 70 ? 'OVR70-74' : 'OVR69-'
  const agg = new Map<string, { n: number; mv: number }>()
  for (const id of ids) {
    const p = byId.get(id)
    if (!p) continue
    const k = band(ovr(p))
    const a = agg.get(k) ?? { n: 0, mv: 0 }
    a.n++; a.mv += movesOf(id)
    agg.set(k, a)
  }
  console.log('   強さべつの移籍回数（1人あたり／' + YEARS + '年）')
  for (const k of ['OVR85+', 'OVR80-84', 'OVR75-79', 'OVR70-74', 'OVR69-']) {
    const a = agg.get(k)
    if (!a) continue
    console.log(`     ${k.padEnd(9)} ${String(a.n).padStart(5)}人  ${fmt(a.mv / a.n)}回  → 平均在籍 ${fmt(YEARS / (a.mv / a.n + 1))}年`)
  }
}

console.log('\n※ 契約満了によるFA・解雇・引退・成長は含んでいません（endSeason を通していない）。')
console.log('   入れると所属はさらに動くので、ここの在籍年数は**実際より長め**に出ます。')
console.log('※ 定数は1つも変えていません。案を比べるときは src を書き換えて測り、戻すこと。\n')
