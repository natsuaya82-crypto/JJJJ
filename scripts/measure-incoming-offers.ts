/**
 * 【計測】自チームに来る買い取りの打診が、1年で何件・受信箱に何件たまるか。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error scripts/measure-incoming-offers.ts --outfile=/tmp/mi.cjs && node /tmp/mi.cjs
 *
 * ■なぜ測るのか
 *   「1レースに4人くらいオファー来てるけど」（オーナー）。
 *   生成が国内と海外の2本に割れていて、上限も2つあった（国内2件／海外は上限なし）。
 *   1本にまとめたあと、**1レースあたり・1年あたり・受信箱の常時件数**がどうなるかを見る。
 *
 * ■国内／海外の内訳も出す
 *   「一本化した」は、**海外クラブにも順番が回っている**ことまで見て初めて言える。
 *   国内52を先に並べて上限2件で打ち切ると、海外180は一度も声を掛けられない。
 */
import { generateTransferActivity } from '../src/engine/cpuMarket'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { drawSeasonSchedules } from '../src/data/races'
import { divisionOf } from '../src/utils/league'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import { buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import type { ForeignClub, IncomingOffer, Player, Team } from '../src/types'

const MY = 'tokyo'
const YEAR = 2030
const RUNS = 60

const teams: Team[] = ([...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[])
  .map(t => ({ ...t, finance: { ...t.finance, budget: tierBudget(t) } }))
// ★海外クラブは**名簿ごと**用意する。名簿が空だと「穴も序列も出せない」ので
//   1クラブも打診してこない＝海外の枝を測っていない世界になる（最初に書いた版がこれ）
const fg = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const foreignClubs: ForeignClub[] = fg.updatedLeagues.flatMap(l =>
  l.clubs.map(c => ({ ...c, leagueId: l.id, finance: { budget: tierBudget(c as never) } }))) as ForeignClub[]
const foreignPlayers: Player[] = fg.players
// ★部によってレース数が違う（1部10戦・2部8戦・3部7戦・`DIVISION_RACE_DATES`）。
//   **上限は必ず埋まる**ので「打診が来るレース数 × 1レースの上限」がそのまま1年の件数になる。
//   1つの部だけ測ると自分の部の答えしか出ない（**プレイヤーは3部から始まる**）。
//   `generateSeasonRaces` は部を受け取らない10戦の予備なので、ここで使わないこと
const DIV = Number(process.env.DIV ?? divisionOf(teams.find(t => t.id === MY)))
const races = drawSeasonSchedules(YEAR)[DIV]

const foreignIds = new Set(foreignClubs.map(c => c.id))
const teamById = new Map(teams.map(t => [t.id, t]))
const foreignById = new Map(foreignClubs.map(c => [c.id, c]))
// 行き先の姿。store の destinationOf と同じ材料（この世界は順位表を持たない）
const destOf = (all: Player[]) => (clubId: string, player: Player) => {
  const c = foreignById.get(clubId)
  const t = c ? tierOf(c as never) : tierOf(teamById.get(clubId)!)
  return buildDestination(clubId, t, all,
    { isForeign: !!c, region: c ? regionOfLeague(c.leagueId) : undefined, player })
}

/** 1年ぶん回す。打診は expiresAtRace = raceIndex + 5 で切れる */
function runOneYear(players: Player[]) {
  let live: IncomingOffer[] = []
  const arrived: IncomingOffer[] = []
  const inboxPerRace: number[] = []
  const newPerRace: number[] = []
  for (let i = 0; i < races.length; i++) {
    const r = generateTransferActivity(
      players, teams, MY, i, [], live, [], new Set(), YEAR, races.length, foreignClubs,
      () => ({ fraction: 0, teamRaces: 0 }), destOf(players))
    const fresh = r.incomingOffers.filter(o => !live.some(l => l.id === o.id))
    arrived.push(...fresh)
    newPerRace.push(fresh.length)
    live = r.incomingOffers
    inboxPerRace.push(live.length)
  }
  return { arrived, inboxPerRace, newPerRace }
}

let total = 0
let inboxSum = 0, inboxMax = 0, raceCount = 0
let maxNew = 0
let dom = 0, fgn = 0
const perYear: number[] = []
for (let run = 0; run < RUNS; run++) {
  const { cpuPlayers } = generateCpuRosters(teams, YEAR - run)
  const { arrived, inboxPerRace, newPerRace } = runOneYear([...cpuPlayers, ...foreignPlayers])
  total += arrived.length
  perYear.push(arrived.length)
  for (const o of arrived) (foreignIds.has(o.fromTeamId) ? fgn++ : dom++)
  for (const n of inboxPerRace) { inboxSum += n; inboxMax = Math.max(inboxMax, n); raceCount++ }
  for (const n of newPerRace) maxNew = Math.max(maxNew, n)
}

const f = (n: number) => n.toFixed(2)
console.log(`${DIV}部  レース数/年 ${races.length}   ${RUNS}年ぶん`)
console.log('')
console.log(`1年に来る打診       ${f(total / RUNS)}件   （最少 ${Math.min(...perYear)} / 最多 ${Math.max(...perYear)}）`)
console.log(`1レースあたり       ${f(total / RUNS / races.length)}件   （1レースの最多 ${maxNew}件）`)
console.log(`受信箱の常時件数     ${f(inboxSum / raceCount)}件   （最多 ${inboxMax}件）`)
console.log('')
console.log(`内訳  国内 ${f(dom / RUNS)}件/年   海外 ${f(fgn / RUNS)}件/年` +
  `   （海外の割合 ${f(100 * fgn / Math.max(1, dom + fgn))}%）`)
