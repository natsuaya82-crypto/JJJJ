/**
 * 【下限を割ったら埋める】開幕できない状態を残さない
 *
 * ■なぜ要るのか（オーナー・2026-08-23）
 *   「15人以下だと開幕できないけど、これって塞げてないけどどうなんの？」
 *   「開幕できないは防ぎたいからもし15人以下だった場合60くらいの弱い選手が
 *     足りない分追加されて15人になるのは？」
 *
 *   下限を割ると開幕が止まるのに、そこから抜ける道が画面に無い。
 *   ドラフトで獲れるのは1部だけ（`joinsDraft`）で、2部・3部はFAと移籍しか無く、
 *   FAが尽きると詰む（2026-08-16 に実際に起きた）。
 *
 * ■★足すのは**開幕の直前**（`startRegularSeason`）1か所（2026-09-15）
 *   以前は `endSeason` の中で足していましたが、渡していたのが**契約満了と引退を
 *   当てる前の名簿**だったので、「16人のうち5人が満了」のときに16人あると見て
 *   1人も足さず、そのあと11人になっていました。**下限を割るいちばん普通の経路が
 *   契約満了**なので、救済が要る場面でちょうど発火しませんでした。
 *
 *   ★**この点検は長いあいだ `fillRosterToMin` を単体で叩くだけで、`endSeason` も
 *     `startRegularSeason` も1度も呼んでいませんでした。** 関数は正しいので緑、
 *     繋ぎ込みは壊れたまま、という「空振りの緑」です。⑤が世界を1つ作って
 *     実際に endSeason → 開幕 を通します。
 *
 * ■わざと壊して落ちることを確かめた
 *   ・`fillRosterToMin` の `need` を `0` にする              → ①②
 *   ・ランクを 'A' にする（弱い選手にならない）              → ③
 *   ・15人ちょうどでも入れる（`need <= 0` を外す）           → ④
 *   ・`startRegularSeason` の救済を消す                      → ⑤
 *   ・救済に `state.players` ではなく満了前の名簿を渡す        → ⑤
 */
// ── 乱数の種を固定（他の import より先に効かせる）──
//   世界を作って回す点検は種を固定すること（check-domestic-youth と同じ）
let rngSeed = 20260915
Math.random = () => { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return rngSeed / 4294967296 }

import { readFileSync } from 'node:fs'
import { fillRosterToMin, generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { ROSTER_MIN } from '../src/data/rosterRules'
import { canStartSeason } from '../src/utils/seasonStart'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { useGameStore } from '../src/store/gameStore'
import { ovr } from '../src/utils/playerUtils'
import type { Player, SeasonStanding, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const team = INITIAL_TEAMS[0]
// そのクラブの選手を n 人だけ持つ世界を作る（中身は本物の生成器から）
const madeAll = generateCpuRosters([{ id: team.id, tier: 5 }], 2030).cpuPlayers
const worldOf = (n: number): Player[] => madeAll.slice(0, n).map(p => ({ ...p, teamId: team.id }))

console.log(`[1] 足りないぶんだけ入れて、ちょうど ${ROSTER_MIN} 人にする`)
{
  for (const have of [0, 3, 5, 10, 13, 14]) {
    const add = fillRosterToMin(team, 2030, worldOf(have))
    check(`${have}人 → ${add.length}人足して ${have + add.length}人`,
      have + add.length === ROSTER_MIN, `${have + add.length}人`)
  }
  // ★入れすぎない
  for (const have of [15, 16, 25]) {
    const add = fillRosterToMin(team, 2030, worldOf(have))
    check(`${have}人なら1人も足さない`, add.length === 0, `${add.length}人足した`)
  }
}

console.log('\n[1-b] 選手の作り方は1本（ベタ書きしていない）')
{
  const src = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  // ★**若手の補充と救済が同じ幹から分岐しているか。** 片方だけ手組みに戻すと落ちる
  check('幹（makeNewPlayersFor）がある', /function makeNewPlayersFor\(/.test(src))
  const uses = (src.match(/makeNewPlayersFor\(/g) ?? []).length
  check('幹を使っているのは2か所（若手の補充・下限の救済）＋定義', uses === 3, `${uses} か所`)
  // ★`buildRatingsForRank` は初期ロスター・ドラフト・海外も通る**世界共通の幹**なので、
  //   ここで数を縛らない（縛ると関係ない生成を足しただけで落ちる）。
  //   見るのは「補充と救済が同じ幹から出ているか」だけ。
  check('年俸は faMarketSalary（手で決めていない）', /fresh\.contract\.annualSalary = faMarketSalary\(fresh\)/.test(src))
}

console.log(`\n[2] 入るのは弱い選手（OVR60くらい）`)
{
  const add = fillRosterToMin(team, 2030, worldOf(10))
  const ovrs = add.map(p => ovr(p))
  const max = Math.max(...ovrs)
  console.log(`      OVR ${Math.min(...ovrs)}〜${max}（平均 ${(ovrs.reduce((a, b) => a + b, 0) / ovrs.length).toFixed(1)}）`)
  check('全員がOVR70未満', max < 70, `いちばん高い ${max}`)
  check('ちゃんと選手になっている（年俸・所属・IDがある）',
    add.every(p => p.teamId === team.id && p.contract.annualSalary > 0 && !!p.id))
  check('IDが重ならない', new Set(add.map(p => p.id)).size === add.length)
  check('若手として入る（19〜22歳）', add.every(p => p.age >= 19 && p.age <= 22))
}

console.log(`\n[3] 人数は開幕を止めない（止めると救済に届かない）`)
{
  // ★以前ここは「11人のままでは開幕できない」を見ていました。人数で止めていたころの話で、
  //   いまは止めません——止めると、下限を割った人は**ボタンが押せない＝
  //   `startRegularSeason` の救済に一生たどり着けない**（それが塞ぎたかった行き止まり）。
  //   人数以外の用件（カード・ドラフト）は今までどおり止めます。
  const before = { campDone: true, draftDone: true, rosterCount: 11 }
  check('11人でも開幕は押せる（救済が働く）', canStartSeason(before))
  check('ドラフトが残っていたら止まる', !canStartSeason({ ...before, draftDone: false }))
  check('カードを受け取っていなければ止まる', !canStartSeason({ ...before, campDone: false }))
  const add = fillRosterToMin(team, 2030, worldOf(11))
  check('埋めると下限に届く', 11 + add.length === ROSTER_MIN, `${11 + add.length}人`)
}

console.log(`\n[5] 世界を1つ作って endSeason → 開幕 を実際に通す`)
{
  // ★**ここが本体。** ①〜④は関数を単体で叩くだけなので、繋ぎ込みが壊れていても緑になる。
  //   「16人・うち5人が今季で契約満了」＝下限を割るいちばん普通の形を作って通す。
  const YEAR = 2027
  const MY = 'tokyo'
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  let ps: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  const mine = ps.filter(p => p.teamId === MY).slice(0, 16)
  const keep = new Set(mine.map(p => p.id))
  ps = ps.filter(p => p.teamId !== MY || keep.has(p.id))
  ps = ps.map(p => keep.has(p.id)
    ? { ...p, age: 24, contract: { ...p.contract, yearsLeft: mine.findIndex(m => m.id === p.id) < 5 ? 1 : 4 } }
    : p)
  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  for (const d of DIVISIONS) standings[d].forEach((row, i) => { row.totalPoints = (standings[d].length - i) * DIVISION_RACES[d] })
  const foreignStandings: Record<string, SeasonStanding[]> = {}
  for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))
  useGameStore.setState({
    isInitialized: true, playerTeamId: MY, teams, players: ps, foreignLeagues: fgen.updatedLeagues,
    currentSeason: { year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
      races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
      standings, foreignStandings, newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
    pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
  } as never)

  const sizeOfMine = () => useGameStore.getState().players.filter(p => p.teamId === MY && p.status !== 'retired').length
  const start = sizeOfMine()
  useGameStore.getState().endSeason()
  const afterEnd = sizeOfMine()
  useGameStore.getState().startRegularSeason()
  const afterStart = sizeOfMine()
  console.log(`      ${start}人（うち5人が満了） → endSeason ${afterEnd}人 → 開幕 ${afterStart}人`)
  // 満了で実際に減っていること（減っていない世界では救済の枝を1行も通らない＝空振りの緑）
  check('契約満了で実際に下限を割っている（空振りではない）', afterEnd < ROSTER_MIN, `${afterEnd}人`)
  check(`開幕したときに下限（${ROSTER_MIN}人）に届いている`, afterStart >= ROSTER_MIN, `${afterStart}人`)
  check('足しすぎていない（下限ちょうど）', afterStart === ROSTER_MIN, `${afterStart}人`)
  // 人数で開幕を止めると、救済にたどり着けない
  check('人数は開幕を止めない（止めると救済に永久に届かない）',
    canStartSeason({ campDone: true, draftDone: true, rosterCount: 1 }))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
