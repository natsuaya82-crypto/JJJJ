/**
 * **A-15★ の測り直し（2026-08-20）。** 選手がクラブ間を動く経路ごとに
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
import { drawSeasonSchedules } from '../src/data/races'
import type { SeasonStanding, Team, Player } from '../src/types'
import { simulateRace, bgLineup } from '../src/engine/raceEngine'

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
// ★**出場記録を入れること。** 空の results で回すと playRate が全員0になり、
//   「いま走れている選手は格下へ行かない」の関門（tooFarDown）が一度も発火しない。
//   8/14 の計測はこれで、全員が「干されている」扱いだった。
const sched = drawSeasonSchedules(YEAR, rnd)
const myDiv = divisionOf(teams.find(t => t.id === MY)!)
const races = sched[myDiv]

// ★**全部の部と海外リーグを実際に走らせること。** 自分の部だけ走らせると、
//   他の 212 クラブは出場記録がゼロ＝`playRateOf` が「分からない(0.5 / 0戦)」を返し、
//   `appraiseMove` の関門（unproven / tooFarDown）が一度も発火しない世界になる。
const runDiv = (rs: typeof races, ts: Team[]) => rs.map(r => {
  const lineups: Record<string, Record<number, string>> = {}
  for (const t of ts) lineups[t.id] = bgLineup(players.filter(p => p.teamId === t.id && p.status === 'active'), r)
  return { ...r, results: simulateRace(r, lineups, teams, players, 0.5) }
})
const ranRaces = runDiv(races, teams.filter(t => divisionOf(t) === myDiv))
const divisionRaces: Record<number, typeof races> = {}
for (const d of DIVISIONS) {
  if (d === myDiv) continue
  divisionRaces[d] = runDiv(sched[d], teams.filter(t => divisionOf(t) === d))
}
const foreignRaces: Record<string, typeof races> = {}
for (const l of fgen.updatedLeagues) {
  const clubTeams = l.clubs.map(c => ({ id: c.id } as Team))
  foreignRaces[l.id] = sched[1].slice(0, 8).map((r, k) => {
    const lineups: Record<string, Record<number, string>> = {}
    for (const t of clubTeams) lineups[t.id] = bgLineup(players.filter(p => p.teamId === t.id && p.status === 'active'), r)
    return { ...r, id: `race-${l.id}-${k}`, results: simulateRace(r, lineups, teams, players, 0.5) }
  })
}

useGameStore.setState({
  isInitialized: true, playerTeamId: MY, teams, players,
  foreignLeagues: fgen.updatedLeagues,
  currentSeason: {
    year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
    races: ranRaces, divisionRaces, foreignRaces,
    standings, foreignStandings, newsFeed: [], objectives: [],
    incomingOffers: [], transferListings: [], contractRequests: [],
  },
  pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
} as never)

// 海外クラブのIDを集めておく（`'leagueId' in club` では国内と区別できない）
const foreignIds = new Set(fgen.updatedLeagues.flatMap(l => l.clubs.map(c => c.id)))
const isForeign = (id: string) => foreignIds.has(id)

const seen = new Set<string>()
type Row = { kind: string; from: string; to: string; playerId: string }
const collect = (): Row[] => {
  const out: Row[] = []
  for (const r of useGameStore.getState().transferHistory ?? []) {
    const key = `${r.year}|${r.date ?? ''}|${r.playerId}|${r.fromTeamId}|${r.toTeamId}|${r.kind ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    // kind が無いものは移籍金つきの移籍（現金）
    out.push({ kind: r.kind ?? 'cash', from: r.fromTeamId, to: r.toTeamId, playerId: r.playerId })
  }
  return out
}

const all: Row[] = []
// ★動かす前の姿を控える（動いたあとに読むと、所属も序列も変わっている）
const st0 = { players: useGameStore.getState().players, teams: useGameStore.getState().teams, foreignLeagues: useGameStore.getState().foreignLeagues }
const rosterOf = new Map<string, typeof st0.players>()
for (const p of st0.players) { if (!p.teamId) continue; const a = rosterOf.get(p.teamId) ?? []; a.push(p); rosterOf.set(p.teamId, a) }

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


// ── ここから A-15★ の集計 ────────────────────────────────
import { ovr } from '../src/utils/playerUtils'
import { tierOfPlayerClub, allTieredClubs } from '../src/utils/clubTier'
import { needsPlayer, squadRankOf } from '../src/utils/squadNeeds'

const clubsAll = allTieredClubs(st0.teams, st0.foreignLeagues)
const tierOf = (teamId: string) => tierOfPlayerClub(teamId, clubsAll)
const band = (o: number) => o >= 85 ? '85+' : o >= 78 ? '78-84' : o >= 71 ? '71-77' : '〜70'
const aband = (a: number) => a <= 23 ? '〜23' : a <= 28 ? '24-28' : a <= 32 ? '29-32' : '33〜'
const BANDS = ['85+', '78-84', '71-77', '〜70']
const ABANDS = ['〜23', '24-28', '29-32', '33〜']

console.log(`世界：国内 ${teams.length} ／ 海外 ${foreignIds.size} クラブ ／ 選手 ${st0.players.length}人`)
console.log(`1年ぶん（オフ1回＋シーズン中12回）に動いた件数：${all.length}`)

// (1) 需要
const active = st0.players.filter(p => p.status === 'active' && p.teamId)
const dem = new Map(BANDS.map(b => [b, [0, 0] as [number, number]]))
let wanted = 0
for (const p of active) {
  const cur = dem.get(band(ovr(p)))!
  const any = clubsAll.some(c => c.id !== p.teamId && needsPlayer(rosterOf.get(c.id) ?? [], p))
  cur[0]++; if (any) { cur[1]++; wanted++ }
}
console.log(`\n【(1) 需要】欲しがるクラブが1つでもある選手：${wanted} / ${active.length}人（${(wanted / active.length * 100).toFixed(1)}%）`)
for (const b of BANDS) { const [n, w] = dem.get(b)!; console.log(`  OVR ${b.padEnd(6)} ${String(n).padStart(5)}人中 ${String(w).padStart(5)}人（${n ? (w / n * 100).toFixed(1) : '0.0'}%）`) }

// (2)(3)(4) 動いた中身
const pmap = new Map(st0.players.map(p => [p.id, p]))
const rows = all.filter(r => pmap.has(r.playerId))
const dirOf = (r: Row) => {
  const a = tierOf(r.from), b = tierOf(r.to)
  // ★どちらかの格が引けない行（FA加入＝出す側が無い、消えたクラブ）は方向を言えない。
  //   NaN を混ぜると比較が全部 false になり、丸ごと「格下」に化ける（8/20 の 15.1%）。
  if (!Number.isFinite(a) || !Number.isFinite(b)) return '不明'
  return b < a ? '格上' : b === a ? '横' : '格下'
}
const unknown = rows.filter(r => dirOf(r) === '不明')
console.log(`\n格を引けない行：${unknown.length}件（FA加入など。以下の割合からは除く）`)

console.log(`\n【(2) OVR帯ごと】`)
console.log('  帯        件数   格上へ    横     格下へ')
for (const b of BANDS) {
  const rs = rows.filter(r => band(ovr(pmap.get(r.playerId)!)) === b && dirOf(r) !== '不明')
  if (rs.length === 0) { console.log(`  ${b.padEnd(8)}${String(0).padStart(5)}      —      —      —`); continue }
  const c = (d: string) => rs.filter(r => dirOf(r) === d).length
  console.log(`  ${b.padEnd(8)}${String(rs.length).padStart(5)}${(c('格上') / rs.length * 100).toFixed(0).padStart(7)}%${(c('横') / rs.length * 100).toFixed(0).padStart(6)}%${(c('格下') / rs.length * 100).toFixed(0).padStart(7)}%`)
}
// 格下へ行った移籍が、何段落ちているか
const downs = rows.filter(r => dirOf(r) === '格下').map(r => tierOf(r.to) - tierOf(r.from))
const dc = new Map<number, number>()
for (const d of downs) dc.set(d, (dc.get(d) ?? 0) + 1)
console.log(`\n【格下へ行った ${downs.length}件の落差】（MAX_TIER_DROP_FOR_STARTER = 2 なので、1段は関門を通る）`)
for (const d of [...dc.keys()].sort((a, b) => a - b)) {
  console.log(`  ${d}段下  ${String(dc.get(d)).padStart(4)}件（${(dc.get(d)! / downs.length * 100).toFixed(1)}%）`)
}
console.log(`\n【(3) 年齢帯ごと】`)
for (const b of ABANDS) {
  const rs = rows.filter(r => aband(pmap.get(r.playerId)!.age) === b && dirOf(r) !== '不明')
  const down = rs.length ? (rs.filter(r => dirOf(r) === '格下').length / rs.length * 100).toFixed(0) + '%' : '—'
  console.log(`  ${b.padEnd(6)} ${String(rs.length).padStart(5)}件   格下へ ${down}`)
}
console.log(`\n【(4) 出す側での序列】`)
const rk = (n: number) => n === 1 ? '1番手' : n <= 7 ? '2-7番手' : n <= 14 ? '8-14番手' : '15番手以降'
const rkc = new Map<string, number>()
for (const r of rows) { const p = pmap.get(r.playerId)!; const k = rk(squadRankOf(rosterOf.get(r.from) ?? [], p)); rkc.set(k, (rkc.get(k) ?? 0) + 1) }
for (const k of ['1番手', '2-7番手', '8-14番手', '15番手以降']) {
  const n = rkc.get(k) ?? 0
  console.log(`  ${k.padEnd(10)} ${String(n).padStart(5)}件（${rows.length ? (n / rows.length * 100).toFixed(1) : '0.0'}%）`)
}
// (5) OVRと格の相関
const corr = () => {
  const st = useGameStore.getState()
  const xs = st.players.filter(p => p.status === 'active' && p.teamId).map(p => [ovr(p), tierOf(p.teamId!)] as const)
  const n = xs.length, mx = xs.reduce((s, v) => s + v[0], 0) / n, my = xs.reduce((s, v) => s + v[1], 0) / n
  let sxy = 0, sx = 0, sy = 0
  for (const [x, y] of xs) { sxy += (x - mx) * (y - my); sx += (x - mx) ** 2; sy += (y - my) ** 2 }
  return sxy / Math.sqrt(sx * sy)
}
console.log(`\n【(5) OVRと格の相関】1年動かしたあと ${corr().toFixed(3)}（-1に近いほど「強い選手ほど格上」）`)

// ── (6) 関門は生きているか ─────────────────────────────
// `appraiseMove` の `tooFarDown`（いま走れている選手は2段以上下へ行かない）は
// `ctx.teamRaces` / `ctx.playFraction` を**呼ぶ側から渡されて初めて**働く。
// 渡していなければ races=0 / frac=0.5 の既定値になり、関門は一度も発火しない。
import { playRateOf } from '../src/utils/playRate'
import { isDeclining } from '../src/engine/ageCurve'
import { MAX_TIER_DROP_FOR_STARTER } from '../src/utils/transferDecision'

const season0 = { races: ranRaces, divisionRaces, foreignRaces }
let starters = 0, wouldBlock = 0, decl = 0
const blockedBand = new Map<string, number>()
for (const r of rows) {
  if (dirOf(r) !== '格下') continue
  const p = pmap.get(r.playerId)!
  const { fraction, teamRaces: tr } = playRateOf(p.id, r.from, season0, st0.teams, st0.foreignLeagues)
  const declining = isDeclining(p.growthCurve ?? 'normal', p.age)
  const starterNow = tr >= 3 && fraction >= 0.5
  if (starterNow) starters++
  if (declining) decl++
  if (!declining && starterNow && tierOf(r.to) - tierOf(r.from) >= MAX_TIER_DROP_FOR_STARTER) {
    wouldBlock++
    blockedBand.set(band(ovr(p)), (blockedBand.get(band(ovr(p))) ?? 0) + 1)
  }
}
const downRows = rows.filter(r => dirOf(r) === '格下')
console.log(`\n【(6) 関門 tooFarDown を本当の出場率で当てたら】`)
console.log(`  格下へ動いた ${downRows.length}件のうち`)
console.log(`    いま走れている（3戦以上＋出場率50%以上）   ${starters}件（${(starters / downRows.length * 100).toFixed(1)}%）`)
console.log(`    ピークを過ぎている（declining＝関門の対象外） ${decl}件（${(decl / downRows.length * 100).toFixed(1)}%）`)
console.log(`    → 関門で止まるはず                          ${wouldBlock}件（${(wouldBlock / downRows.length * 100).toFixed(1)}%）`)
for (const b of BANDS) console.log(`        OVR ${b.padEnd(6)} ${blockedBand.get(b) ?? 0}件`)

// declining（ピーク越え）で関門を外れている選手の年齢
const declAges = new Map<string, number>()
let declStarterDeep = 0
const declStarterDeepAges = new Map<string, number>()
for (const r of downRows) {
  const p = pmap.get(r.playerId)!
  if (!isDeclining(p.growthCurve ?? 'normal', p.age)) continue
  declAges.set(aband(p.age), (declAges.get(aband(p.age)) ?? 0) + 1)
  const { fraction, teamRaces: tr } = playRateOf(p.id, r.from, season0, st0.teams, st0.foreignLeagues)
  if (tr >= 3 && fraction >= 0.5 && tierOf(r.to) - tierOf(r.from) >= MAX_TIER_DROP_FOR_STARTER) {
    declStarterDeep++
    declStarterDeepAges.set(aband(p.age), (declStarterDeepAges.get(aband(p.age)) ?? 0) + 1)
  }
}
console.log(`\n  ピーク越えで関門を免れている ${[...declAges.values()].reduce((a, b) => a + b, 0)}件の年齢`)
for (const b of ABANDS) console.log(`    ${b.padEnd(6)} ${declAges.get(b) ?? 0}件`)
console.log(`  そのうち「いま走れていて2段以上下へ」＝免除が無ければ止まるもの ${declStarterDeep}件`)
for (const b of ABANDS) console.log(`    ${b.padEnd(6)} ${declStarterDeepAges.get(b) ?? 0}件`)
