/**
 * 【set() に渡すものは作り直す】あとから状態の中身を書き換えないこと。
 *
 * ■なぜ要るのか
 *   セーブのJSON化は、書き込みと同じデバウンスの中でやる（saveStorage の jsonSaveStorage）。
 *   つまり persist は「状態の実体」を最大 WRITE_DELAY_MS のあいだ握っている。
 *   その間に**中身を直に書き換える**場所があると、set() したときの姿ではなく
 *   「あとの姿」が書かれる。書き換えの途中で挟まれば、半分だけ進んだ状態が保存される。
 *
 *   このリポジトリは set() に必ず新しいオブジェクトを渡しているので、いまは起きない。
 *   **その書き方が崩れたことに気づくための網がこれ。**
 *
 * ■どう見るか
 *   set() のたびに (a) その場でJSON化した文字列 と (b) 実体 の両方を控える。
 *   全部の操作が終わったあとに (b) をもう一度JSON化して (a) と突き合わせる。
 *   1件でも違えば、それは「set() のあとに中身を書き換えた」場所がある証拠。
 *
 *   ここで見るのは**保存される形（partialize を通したもの）**だけ。
 *   画面のためだけの値（ephemeralState）は保存されないので対象外。
 */
let rngSeed = 20260811
Math.random = () => { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return rngSeed / 4294967296 }

import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateIndividualEvents, generateSeasonRaces } from '../src/data/races'
import { newSeasonStandings } from '../src/utils/league'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import type { SeasonStanding, Team, Player } from '../src/types'

const YEAR = 2030, MY = 'tokyo'

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(teams, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
const races = generateSeasonRaces(YEAR)
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const l of fgen.updatedLeagues) {
  foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))
}
const standings = newSeasonStandings<SeasonStanding>(teams, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))

useGameStore.setState({
  isInitialized: true, playerTeamId: MY, teams, players, foreignLeagues: fgen.updatedLeagues,
  currentSeason: {
    year: YEAR, phase: 'season', currentRaceIndex: 0, races, standings, foreignStandings,
    individualEvents: generateIndividualEvents(YEAR),
    newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [],
  } as never,
  pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
} as never)

type Opts = { partialize: (s: unknown) => unknown }
const partialize = (useGameStore as unknown as { persist: { getOptions: () => Opts } })
  .persist.getOptions().partialize

// set() のたびに「その場のJSON」と「実体」を控える
const snaps: { at: string; json: string; live: unknown }[] = []
let label = ''
useGameStore.subscribe(() => {
  const live = partialize({ ...useGameStore.getState() })
  snaps.push({ at: label, json: JSON.stringify(live), live })
})

const st = () => useGameStore.getState()
const P = st().players.filter(p => p.teamId === MY)
const someoneElse = st().players.find(p => p.teamId && p.teamId !== MY)!

// 保存される物を触る操作を、広く通す。**通らなかった物は名前を出す**
// （「0件だった」が「1件も流れていなかった」の言い換えにならないように）
const acts: [string, () => void][] = [
  ['setRaceLineup', () => st().setRaceLineup(assignLineupByTerrain(P, races[0]) as never)],
  ['setRaceStrategy', () => st().setRaceStrategy?.('balanced' as never)],
  ['setTrainingFocus', () => st().setTrainingFocus?.(P[0].id, 'speed' as never)],
  ['setTrainingPlan', () => st().setTrainingPlan?.(P[1].id, 'speed' as never)],
  ['toggleNoSale', () => st().toggleNoSale?.(P[2].id)],
  ['toggleLoanListed', () => st().toggleLoanListed?.(P[3].id)],
  ['listMyPlayerForSale', () => st().listMyPlayerForSale?.(P[4].id, 100_000_000)],
  ['delistMyPlayer', () => st().delistMyPlayer?.(P[4].id)],
  ['renamePlayer', () => st().renamePlayer?.(P[5].id, 'テスト')],
  ['initiateContractRenewal', () => st().initiateContractRenewal?.(P[6].id)],
  ['initObjectivesIfEmpty', () => st().initObjectivesIfEmpty?.()],
  ['initScoutPool', () => st().initScoutPool?.()],
  ['ensureFuturePicks', () => st().ensureFuturePicks?.()],
  ['ensureIndividualEvents', () => st().ensureIndividualEvents?.()],
  ['ensureWorldRacePlans', () => st().ensureWorldRacePlans?.()],
  ['generateDevProspects', () => st().generateDevProspects?.()],
  ['startRegularSeason', () => st().startRegularSeason?.()],
  ['runRace', () => st().runRace(assignLineupByTerrain(P, races[0]) as never)],
  ['advanceForeignLeagues', () => st().advanceForeignLeagues?.()],
  ['advanceMarketOneRace', () => st().advanceMarketOneRace?.()],
  ['runCpuMarketRound', () => st().runCpuMarketRound?.()],
  ['advanceEclRace', () => st().advanceEclRace?.()],
  ['releasePlayer', () => st().releasePlayer?.(P[7].id)],
  ['allowPlayerTransfer', () => st().allowPlayerTransfer?.(P[8].id)],
  ['scoutOpponentPlayer', () => st().scoutOpponentPlayer?.(someoneElse.id)],
  ['simulateIndividualEvent', () => st().simulateIndividualEvent?.(0)],
  ['endSeason', () => st().endSeason()],
  ['beginSeasonDraft', () => st().beginSeasonDraft?.()],
]

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

console.log('[1] 保存される物を触る操作を流す')
const silent: string[] = []
for (const [name, f] of acts) {
  const before = snaps.length
  label = name
  try { f() } catch (e) { console.log(`    （${name} は流れなかった: ${(e as Error).message.slice(0, 60)}）`) }
  if (snaps.length === before) silent.push(name)
}
const ran = acts.length - silent.length
console.log(`    ${ran}/${acts.length} の操作で set() が動いた（set() 計 ${snaps.length}回）`)
if (silent.length) console.log(`    set() が動かなかった: ${silent.join(' ')}`)
// 世界が空だと「書き換えが0件」は当たり前になる。実際に流れていることを先に確かめる
check('じゅうぶんな数の set() を通っている', snaps.length >= 20, `${snaps.length}回しか通っていない`)
check('主要な操作が流れている', ran >= acts.length * 0.7, `${ran}/${acts.length}`)

console.log('[2] set() のあとに中身が書き換わっていないか')
const byAction = new Map<string, number>()
for (const s of snaps) {
  if (JSON.stringify(s.live) !== s.json) byAction.set(s.at, (byAction.get(s.at) ?? 0) + 1)
}
const diff = [...byAction.values()].reduce((a, b) => a + b, 0)
check('あとから書き換わったものは無い', diff === 0,
  [...byAction].map(([k, n]) => `${k} ${n}件`).join(' / '))

console.log('')
if (problems.length > 0) {
  console.log(`✗ set() のあとに状態の中身が書き換わっています（${problems.length}件）`)
  console.log('  遅らせたJSON化は「あとの姿」を書きます。set() には新しいオブジェクトを渡すこと')
  process.exit(1)
}
console.log('✓ どの操作も set() のあとに中身を書き換えない（JSON化を遅らせても同じものが書かれる）')
