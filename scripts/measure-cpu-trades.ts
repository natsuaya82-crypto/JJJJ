/**
 * **A-7 の答え合わせ。** CPU間トレードが実際に成立するようになったかを、本物の世界で数える。
 *   npx esbuild --bundle --platform=node --format=esm scripts/measure-cpu-trades.ts --outfile=/tmp/mct.mjs && node /tmp/mct.mjs
 *
 * ■なぜ「直したはず」では足りないのか
 *   `check-cpu-trade.ts` は**全員同じOVRの世界を手で組んで**成立側の処理を通している。
 *   これは「成立したあとに壊れないか」を見るための網で、
 *   **本物の世界で成立するかどうかは1件も見ていない**（A-7 の元の症状がまさにそれ：
 *   golden は緑のまま、成立が0件なので成立後の処理を1行も通っていなかった）。
 *
 *   ここでは 232クラブ・5800人の本物の世界でオフを回して、**件数を数えるだけ**。
 *
 * ■数えるもの
 *   ・オフ1回で何件成立したか（`beginSeasonDraft`）
 *   ・シーズン中の回（`runCpuMarketRound`）でも成立するか
 *   ・門の内訳（どこで何クラブ落ちているか）
 */
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { comparePlayers } from '../src/utils/playerSort'
import { hasNoPlayingTime } from '../src/utils/transferDecision'
import { domesticCpuTeamIds } from '../src/utils/clubs'
import { needsPlayer } from '../src/utils/squadNeeds'
import { ovr } from '../src/utils/playerUtils'
import type { SeasonStanding, Team, Player } from '../src/types'

const YEAR = 2030
const MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]

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

useGameStore.setState({
  isInitialized: true, playerTeamId: MY, teams, players,
  foreignLeagues: fgen.updatedLeagues,
  currentSeason: {
    year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
    standings, foreignStandings, newsFeed: [], objectives: [],
    incomingOffers: [], transferListings: [], contractRequests: [],
  },
  pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
} as never)

/**
 * 成立した CPU間トレードを数える。
 *
 * ★**`transferHistory` の長さの差で数えないこと。** この配列は `engine/savePruning` が
 *   古いものから落とすので、市場が動いた回ほど**長さが減る**ことがある。
 *   最初に書いた版は「12回まわして -2件」と出た。**見えている記録を毎回ぜんぶ拾って
 *   集合に足す**（同じ記録は1回しか数えない）。
 */
const seenTrades = new Set<string>()
const collect = (): number => {
  const before = seenTrades.size
  for (const r of useGameStore.getState().transferHistory ?? []) {
    if (r.kind !== 'trade') continue
    seenTrades.add(`${r.year}|${r.date ?? ''}|${r.playerId}|${r.fromTeamId}|${r.toTeamId}`)
  }
  return seenTrades.size - before
}
const tradeRecords = () =>
  (useGameStore.getState().transferHistory ?? []).filter(r => r.kind === 'trade')

console.log(`世界：国内 ${teams.length}クラブ / 海外 ${fgen.updatedLeagues.reduce((s, l) => s + l.clubs.length, 0)}クラブ / 選手 ${players.length}人\n`)

useGameStore.getState().endSeason()
collect()
const beforeOff = seenTrades.size
useGameStore.getState().beginSeasonDraft()
const offTrades = collect()
const nameOf = (id: string) => useGameStore.getState().players.find(p => p.id === id)?.name ?? id
const shortOf = (id: string) => useGameStore.getState().teams.find(t => t.id === id)?.shortName ?? id
console.log(`[1] オフ1回（beginSeasonDraft）で成立した CPU間トレード … ${offTrades}件`)
void beforeOff
for (const r of tradeRecords().slice(-8)) {
  console.log(`      ${shortOf(r.fromTeamId)} → ${shortOf(r.toTeamId)}  ${nameOf(r.playerId)} (OVR${ovr(useGameStore.getState().players.find(p => p.id === r.playerId) ?? ({ ratings: {} } as never))})`)
}

// ── 門の内訳。0件だったときに「どこで落ちているか」が分からないと直せない ──
const st = useGameStore.getState()
const cpuIds = domesticCpuTeamIds(st.players, st.teams, MY)
let withSurplus = 0, pairsChecked = 0, needOk = 0, bothOk = 0
for (const buyerId of cpuIds) {
  const buyRoster = st.players.filter(p => p.teamId === buyerId && p.status === 'active')
  const ranked = [...buyRoster].sort(comparePlayers('ovr'))
  const surplus = ranked.filter((p, i) => hasNoPlayingTime(i + 1) && p.joinedYear !== st.currentSeason.year)
  if (surplus.length === 0) continue
  withSurplus++
  for (const sellerId of cpuIds) {
    if (sellerId === buyerId) continue
    const sellRoster = st.players.filter(p => p.teamId === sellerId && p.status === 'active').sort(comparePlayers('ovr'))
    sellRoster.forEach((p, i) => {
      pairsChecked++
      const need = needsPlayer(buyRoster, p)
      const noTime = hasNoPlayingTime(i + 1)
      if (need) needOk++
      if (need && noTime) bothOk++
    })
  }
}
console.log(`\n[2] 門の内訳（オフ直後の世界で数え直し）`)
console.log(`      買い手になれるクラブ（出せる余剰がいる）  ${withSurplus} / ${cpuIds.length}`)
console.log(`      見た組み合わせ                            ${pairsChecked.toLocaleString()}通り`)
console.log(`      └ もらう側が「必要」と言う                ${needOk.toLocaleString()}`)
console.log(`      └ さらに出す側で出番が無い                ${bothOk.toLocaleString()}`)

// ── シーズン中の回でも成立するか ──
console.log(`\n[3] シーズン中の回（runCpuMarketRound）`)
useGameStore.setState({ currentSeason: { ...useGameStore.getState().currentSeason, phase: 'regular', currentRaceIndex: 0 } } as never)
let seasonTrades = 0
const D0 = Date.UTC(YEAR + 1, 2, 1)
for (let i = 0; i < 12; i++) {
  const d = new Date(D0 + i * 21 * 86400000).toISOString().slice(0, 10)
  useGameStore.getState().runCpuMarketRound(d)
  seasonTrades += collect()
  useGameStore.setState({ currentSeason: {
    ...useGameStore.getState().currentSeason, currentRaceIndex: i + 1 } } as never)
}
console.log(`      12回（21日ごと）まわして ${seasonTrades}件`)

const total = seenTrades.size
console.log(`\n合計 ${total}件`)
console.log(total > 0
  ? '→ 成立します（A-7 は解消）'
  : '→ **1件も成立していません**（A-7 は未解消。上の [2] でどこが詰まっているか見ること）')
