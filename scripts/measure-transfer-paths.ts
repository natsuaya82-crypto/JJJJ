/**
 * **A-9 の答え合わせ。** 選手がクラブ間を動く経路ごとに
 *   ・1年に何件動くか
 *   ・そのうち海外クラブが絡むのは何件か
 * を、232クラブ5800人の本物の世界で数える。
 *
 *   npx esbuild --bundle --platform=node --format=esm scripts/measure-transfer-paths.ts --outfile=/tmp/mtp.mjs && node /tmp/mtp.mjs
 *
 * ■なぜ要るのか
 *   CLAUDE.md は「国内か海外かは、獲る理由にも本人の理由にも一切関係しない」と書いている。
 *   守れているかは**件数を数えないと分からない**。関数を読んで「通っている」と言うだけでは、
 *   その経路が0件なら何も確かめたことにならない（A-7 がまさにそれだった）。
 *
 * ★`transferHistory` の長さの差で数えないこと（`engine/savePruning` が古いものから落とす）。
 *   見えている記録を毎回ぜんぶ拾って集合に足す。
 */
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
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

// 海外クラブのIDを集めておく（`'leagueId' in club` では国内と区別できない）
const foreignIds = new Set(fgen.updatedLeagues.flatMap(l => l.clubs.map(c => c.id)))
const isForeign = (id: string) => foreignIds.has(id)

const seen = new Set<string>()
type Row = { kind: string; from: string; to: string }
const collect = (): Row[] => {
  const out: Row[] = []
  for (const r of useGameStore.getState().transferHistory ?? []) {
    const key = `${r.year}|${r.date ?? ''}|${r.playerId}|${r.fromTeamId}|${r.toTeamId}|${r.kind ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    // kind が無いものは移籍金つきの移籍（現金）
    out.push({ kind: r.kind ?? 'cash', from: r.fromTeamId, to: r.toTeamId })
  }
  return out
}

const all: Row[] = []
useGameStore.getState().endSeason(); all.push(...collect())
useGameStore.getState().beginSeasonDraft(); all.push(...collect())

useGameStore.setState({ currentSeason: { ...useGameStore.getState().currentSeason, phase: 'regular', currentRaceIndex: 0 } } as never)
const D0 = Date.UTC(YEAR + 1, 2, 1)
for (let i = 0; i < 12; i++) {
  const d = new Date(D0 + i * 21 * 86400000).toISOString().slice(0, 10)
  useGameStore.getState().runCpuMarketRound(d)
  all.push(...collect())
  useGameStore.setState({ currentSeason: {
    ...useGameStore.getState().currentSeason, currentRaceIndex: i + 1 } } as never)
}

const LABEL: Record<string, string> = { cash: '現金の移籍', trade: 'トレード', free: 'FA・レンタル' }
console.log(`世界：国内 ${teams.length} ／ 海外 ${foreignIds.size} クラブ\n`)
console.log('経路ごとの件数（1年ぶん：オフ1回＋シーズン中12回）')
console.log('  経路              件数    海外が絡む   うち海外↔海外')
const kinds = [...new Set(all.map(r => r.kind))]
for (const k of kinds) {
  const rows = all.filter(r => r.kind === k)
  const withF = rows.filter(r => isForeign(r.from) || isForeign(r.to))
  const bothF = rows.filter(r => isForeign(r.from) && isForeign(r.to))
  console.log(`  ${(LABEL[k] ?? k).padEnd(16)}${String(rows.length).padStart(5)}${String(withF.length).padStart(11)}${String(bothF.length).padStart(13)}`)
}
console.log(`  ${'合計'.padEnd(16)}${String(all.length).padStart(5)}`)

// レンタルは transferHistory に残らないので、選手の loan から数える
const loans = useGameStore.getState().players.filter(p => p.loan)
const loanF = loans.filter(p => isForeign(p.teamId) || isForeign(p.loan!.ownerTeamId))
const loanBoth = loans.filter(p => isForeign(p.teamId) && isForeign(p.loan!.ownerTeamId))
console.log(`  ${'レンタル(在籍中)'.padEnd(14)}${String(loans.length).padStart(5)}${String(loanF.length).padStart(11)}${String(loanBoth.length).padStart(13)}`)

console.log('\n★「国内／国外」の考えが残っていないかの目安')
console.log('  海外クラブが1件も絡まない経路があれば、その経路は国内だけで回っている')
for (const k of kinds) {
  const rows = all.filter(r => r.kind === k)
  const withF = rows.filter(r => isForeign(r.from) || isForeign(r.to))
  if (withF.length === 0) console.log(`  ⚠ ${LABEL[k] ?? k} … ${rows.length}件すべて国内だけ`)
}
if (loans.length > 0 && loanF.length === 0) console.log(`  ⚠ レンタル … ${loans.length}件すべて国内だけ`)
if (loans.length === 0) console.log('  ⚠ レンタルが1件も起きていない')
