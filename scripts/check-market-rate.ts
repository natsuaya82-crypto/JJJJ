/**
 * **1年でどれだけ移籍が起きるか。** 目安は「1クラブが1年に5人」（オーナー・2026-08-12）。
 *
 * ■オフシーズンという考えはありません
 *   以前は「ドラフトの直前に上限なしで1回」＋「シーズン中は21日ごとに3人」で、
 *   実測 **413件 対 39件**。同じ市場を年に一度だけ10倍の勢いで回していました。
 *   塊があったのは「解雇で枠が空くのがそこだから」で、遊びの決まりではありません。
 *   いまはどの回も同じ件数（`CPU_TICK_TRANSFERS`）で、ドラフトの直前もただの1回です。
 *
 * ■なぜ点検が要るのか
 *   件数は `CPU_TICK_TRANSFERS` × 1年の回数で決まります。**回数のほうは日程から
 *   自動的に出る**（21日ごと）ので、日程を1本増やしただけで年間の総数が動きます。
 *   片方だけ見ていても気づけないので、**1年を実際に回して1クラブあたりの人数を数えます。**
 */
let sd = 20260811
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
import { buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import { allForeignClubs, leagueOfClub } from '../src/utils/clubs'
import { ROSTER_MAX, ROSTER_MIN } from '../src/data/rosterRules'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** オーナーの目安。ここを外れたら「そういうつもりだったか」を確かめる */
const TARGET_PER_CLUB = 5
const TOLERANCE = 1.5

const YEAR = 2030, MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
// ★自チームと、赤字のCPUを1クラブ仕込む（下の「赤字は消えない」で見る）
const RED_CPU = base.find(t => t.id !== MY)!.id
const MY_DEBT = -120_000_000
let teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}),
  budget: t.id === MY ? MY_DEBT : t.id === RED_CPU ? -80_000_000 : 400_000_000 } })) as Team[]
let leagues = fgen.updatedLeagues
const CLUBS = allTieredClubs(teams, leagues)
const destinationOf = (clubId: string, player: Player) => {
  const team = teams.find(t => t.id === clubId)
  const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, CLUBS) ?? tierOfClubId(clubId))
  const lg = team ? undefined : leagueOfClub(leagues, clubId)
  return buildDestination(clubId, tier, players, { isForeign: !team, region: regionOfLeague(lg?.id), player })
}

// 1部の日程（03/15〜12/27）＋ ドラフトの直前（翌年2/1）。回数は cpuMarketRounds 任せ
const races = generateSeasonRaces(YEAR, 1)
const season = {
  year: YEAR, currentRaceIndex: races.length,
  races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
} as unknown as Season
const dates = [...races.map(r => r.date), `${YEAR + 1}-02-01`]

let last: string | undefined
let rounds = 0, total = 0
const perRound: number[] = []
for (const date of dates) {
  const step = cpuMarketRounds(last, date)
  if (step.rounds <= 0) continue
  last = step.nextDate
  // ★1回ごとに違う日付を渡す（同じ日付を使い回すと2回目以降が空振りする）
  for (const roundDate of step.dates) {
    rounds++
    const r = runTransferMarket({ players, teams, foreignLeagues: leagues }, {
      playerTeamId: MY, year: YEAR, season, pastSeasons: [],
      rosterCapFor: () => ROSTER_MAX, destinationOf,
      excludeIds: new Set<string>(), maxMoves: CPU_TICK_TRANSFERS, date: roundDate })
    players = r.players; teams = r.teams; leagues = r.foreignLeagues
    total += r.records.length
    perRound.push(r.records.length)
  }
}

const clubCount = teams.length - 1 + allForeignClubs(leagues).length
const perClub = total / clubCount
console.log(`  1年で ${rounds}回まわり、移籍 ${total}件`)
console.log(`  1回あたり ${perRound.map(n => n).join(' ')}（上限 ${CPU_TICK_TRANSFERS}）`)
console.log(`  1クラブあたり ${perClub.toFixed(1)}人／年（全${clubCount}クラブ）`)

check(`1クラブあたり ${TARGET_PER_CLUB}人／年くらい`,
  Math.abs(perClub - TARGET_PER_CLUB) <= TOLERANCE,
  `${perClub.toFixed(1)}人。CPU_TICK_TRANSFERS(${CPU_TICK_TRANSFERS}) か日程の本数が変わった`)

// ★塊が戻っていないこと。どの回も同じ件数のはず（差が2倍以内）
const mx = Math.max(...perRound), mn = Math.min(...perRound)
check('どの回もだいたい同じ件数（年に一度の塊が戻っていない）', mx <= mn * 2 || mx <= 5,
  `最少${mn}件 / 最多${mx}件`)

// 1年回しても名簿が壊れない
const sizes = teams.filter(t => t.id !== MY)
  .map(t => players.filter(p => p.teamId === t.id && p.status === 'active').length)
console.log(`  1年後の国内の在籍 最少${Math.min(...sizes)} 中央${[...sizes].sort((a, b) => a - b)[25]} 最多${Math.max(...sizes)}`)
check(`下限(${ROSTER_MIN}人)を割ったクラブが無い`, Math.min(...sizes) >= ROSTER_MIN, `最少 ${Math.min(...sizes)}人`)
check(`上限(${ROSTER_MAX}人)を超えたクラブが無い`, Math.max(...sizes) <= ROSTER_MAX, `最多 ${Math.max(...sizes)}人`)

// ── 赤字は消えない ────────────────────────────────────────────────
// ★市場は自前の帳簿（`budget[]`）を持ち、**最後に全クラブへ書き戻します**。
//   その帳簿を `Math.max(0, …)` で作っていたため、**市場に一度も参加していない
//   自チームのマイナス残高まで 0 に**なっていました（2026-08-12 の監査で発見）。
//   `finance.budget < 0` は補強禁止の条件（`data/economy.ts` の `reinforcementBanned`）で、
//   `computeNextSeasonBudget` には「赤字側は DEFICIT_LIMIT まで持ち越す（借金は消えない）」
//   と書いてあります。レースを1つ進めるだけで、その決まりが破れていました。
//
//   自チームは市場に並ばない（買いも売りもしない）ので、**1円も動かないのが正しい**。
//   赤字のCPUは売れば増えるので「そのまま」ではなく「勝手に0にならない」を見ます。
const myAfter = teams.find(t => t.id === MY)!.finance.budget
const redAfter = teams.find(t => t.id === RED_CPU)!.finance.budget
console.log(`  1年後の残高 自チーム ${(myAfter / 1e8).toFixed(2)}億 / 赤字CPU ${(redAfter / 1e8).toFixed(2)}億`)
check('自チームの残高は市場を回しても1円も動かない（赤字が消えない）',
  myAfter === MY_DEBT, `${MY_DEBT.toLocaleString()} → ${myAfter.toLocaleString()}`)
check('赤字のCPUの残高が勝手に0へ丸められていない', redAfter !== 0, `${redAfter.toLocaleString()}`)

console.log(failed === 0 ? '\n✓ 1年の移籍の量は狙いどおり\n' : `\n✗ ${failed}件\n`)
if (failed > 0) process.exit(1)
