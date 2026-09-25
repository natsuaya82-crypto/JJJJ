/**
 * 【開幕の床】開幕したとき、どのクラブにも `SEASON_START_ROSTER`(20) 人いる
 *
 * ■なぜ要るのか（オーナー・2026-09-25）
 *   「チーム人数が開幕できないのを防ぐために20人以下の場合は20人になるまで自動補填」
 *   「格によって初期値が違う」
 *
 *   ドラフトで獲れるのは1部だけ（`joinsDraft`）で、2部・3部はFAと移籍しか無く、
 *   FAが尽きると詰む（2026-08-16 に実際に起きた）。出口（引退・満了・移籍）は
 *   232クラブ全部にあるので、床も全部に要る。
 *
 * ■足すのは**開幕の直前**（`startRegularSeason`）1か所
 *   `endSeason` の中で満了前の名簿を見て足していたころは、「16人のうち5人が満了」の
 *   ときに16人あると見て1人も足さず、そのあと11人になっていた。⑤が世界を1つ作って
 *   実際に endSeason → 開幕 を通す（関数を単体で叩くだけの点検は、繋ぎ込みが壊れていても緑）。
 *
 * ■わざと壊して落ちることを確かめた
 *   ・`fillRostersForSeason` の足す人数を `0` にする                → ①⑤
 *   ・足す人数を `ROSTER_MIN` までにする（旧い線）                  → ①⑤
 *   ・ランクを格から引かず `['D']` に戻す                          → ②
 *   ・20人ちょうどでも入れる                                        → ①
 *   ・`startRegularSeason` の救済を消す                             → ⑤
 *   ・救済に `state.players` ではなく満了前の名簿を渡す               → ⑤
 */
// ── 乱数の種を固定（他の import より先に効かせる）──
//   世界を作って回す点検は種を固定すること（check-domestic-youth と同じ）
let rngSeed = 20260915
Math.random = () => { rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0; return rngSeed / 4294967296 }

import { readFileSync } from 'node:fs'
import { fillRostersForSeason, generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUE_DEFS, INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { SEASON_START_ROSTER } from '../src/data/rosterRules'
import { canStartSeason } from '../src/utils/seasonStart'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { useGameStore } from '../src/store/gameStore'
import { ovr } from '../src/utils/playerUtils'
import type { Player, SeasonStanding, Team, WorldClub } from '../src/types'
import { clubsInLeague, clubsWhere, isJpelLeague, jpelClubs, jpelClubById } from '../src/utils/world'
import { seasonLeaguesFixture } from './seasonFixture'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const team = INITIAL_TEAMS[0]
// そのクラブの選手を n 人だけ持つ世界を作る（中身は本物の生成器から）
const madeAll = generateCpuRosters([{ id: team.id, tier: 5 }], 2030).cpuPlayers
const worldOf = (n: number): Player[] => madeAll.slice(0, n).map(p => ({ ...p, teamId: team.id }))

console.log(`[1] 足りないぶんだけ入れて、ちょうど ${SEASON_START_ROSTER} 人にする`)
{
  for (const have of [0, 3, 10, 14, 15, 16, 19]) {
    const add = fillRostersForSeason([team], 2030, worldOf(have))
    check(`${have}人 → ${add.length}人足して ${have + add.length}人`,
      have + add.length === SEASON_START_ROSTER, `${have + add.length}人`)
  }
  // ★入れすぎない
  for (const have of [20, 21, 25]) {
    const add = fillRostersForSeason([team], 2030, worldOf(have))
    check(`${have}人なら1人も足さない`, add.length === 0, `${add.length}人足した`)
  }
}

console.log('\n[1-b] 選手の作り方は1本（ベタ書きしていない）')
{
  const src = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  // ★**若手の補充と救済が同じ幹から分岐しているか。** 片方だけ手組みに戻すと落ちる
  check('幹（makeNewPlayersFor）がある', /function makeNewPlayersFor\(/.test(src))
  const uses = (src.match(/makeNewPlayersFor\(/g) ?? []).length
  check('幹を使っているのは2か所（若手の補充・開幕の床）＋定義', uses === 3, `${uses} か所`)
  // ★`buildRatingsForRank` は初期ロスター・ドラフト・海外も通る**世界共通の幹**なので、
  //   ここで数を縛らない（縛ると関係ない生成を足しただけで落ちる）。
  //   見るのは「補充と救済が同じ幹から出ているか」だけ。
  check('年俸は faMarketSalary（手で決めていない）', /fresh\.contract\.annualSalary = faMarketSalary\(fresh\)/.test(src))
}

console.log(`\n[2] 入る選手の強さは格から（格が高いクラブほど強い選手が入る）`)
{
  // 同じクラブの格だけを変えて、空の名簿を20人まで埋める。**格を見ていなければ差が出ない**
  const meanOvr = (ps: Player[]) => ps.reduce((a, p) => a + ovr(p), 0) / ps.length
  const fillAt = (tier: number) => {
    const out: Player[] = []
    for (let k = 0; k < 10; k++) out.push(...fillRostersForSeason([{ ...team, id: `${team.id}-t${tier}-${k}`, tier } as WorldClub], 2030, []))
    return out
  }
  const top = fillAt(1), mid = fillAt(10), bottom = fillAt(20)
  console.log(`      格1 平均${meanOvr(top).toFixed(1)} ／ 格10 平均${meanOvr(mid).toFixed(1)} ／ 格20 平均${meanOvr(bottom).toFixed(1)}`)
  check('格1 > 格10 > 格20 の順に強い', meanOvr(top) > meanOvr(mid) && meanOvr(mid) > meanOvr(bottom))
  check('格1と格20の差がはっきりある（10以上）', meanOvr(top) - meanOvr(bottom) >= 10,
    `${(meanOvr(top) - meanOvr(bottom)).toFixed(1)}`)
  const add = fillRostersForSeason([team], 2030, worldOf(10))
  check('ちゃんと選手になっている（年俸・所属・IDがある）',
    add.every(p => p.teamId === team.id && p.contract.annualSalary > 0 && !!p.id))
  check('IDが重ならない', new Set(add.map(p => p.id)).size === add.length)
  check('若手として入る（19〜22歳）', [...add, ...top, ...bottom].every(p => p.age >= 19 && p.age <= 22))
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
  const add = fillRostersForSeason([team], 2030, worldOf(11))
  check(`埋めると ${SEASON_START_ROSTER} 人に届く`, 11 + add.length === SEASON_START_ROSTER, `${11 + add.length}人`)
}

console.log(`\n[5] 世界を1つ作って endSeason → 開幕 を実際に通す`)
{
  // ★**ここが本体。** ①〜④は関数を単体で叩くだけなので、繋ぎ込みが壊れていても緑になる。
  //   「16人・うち5人が今季で契約満了」＝下限を割るいちばん普通の形を作って通す。
  const YEAR = 2027
  const MY = 'tokyo'
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, YEAR)
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
  for (const l of FOREIGN_LEAGUE_DEFS) foreignStandings[l.id] = clubsInLeague(INITIAL_FOREIGN_CLUBS, l.id).map(c => ({ teamId: c.id, totalPoints: 0, raceResults: [] }))
  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const clubs: WorldClub[] = [...teams, ...INITIAL_FOREIGN_CLUBS]
  const races = generateSeasonRaces(YEAR, divisionOf(jpelClubById(clubs, MY)!))
  useGameStore.setState({
    isInitialized: true, playerTeamId: MY, clubs, players: ps,
    currentSeason: { year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
      leagues: seasonLeaguesFixture({
        myDivision: divisionOf(jpelClubById(clubs, MY)!),
        races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as never),
        standings, foreignStandings }),
      newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
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
  check(`契約満了で実際に ${SEASON_START_ROSTER} 人を割っている（空振りではない）`, afterEnd < SEASON_START_ROSTER, `${afterEnd}人`)
  check(`開幕したときに ${SEASON_START_ROSTER} 人に届いている`, afterStart >= SEASON_START_ROSTER, `${afterStart}人`)
  check(`足しすぎていない（${SEASON_START_ROSTER} 人ちょうど）`, afterStart === SEASON_START_ROSTER, `${afterStart}人`)
  // 人数で開幕を止めると、救済にたどり着けない
  check('人数は開幕を止めない（止めると救済に永久に届かない）',
    canStartSeason({ campDone: true, draftDone: true, rosterCount: 1 }))

  // ★**自チームだけを特別扱いしていないか**（オーナー・2026-09-15
  //   「そもそも人によって違うとかおかしいよね」）。出口（引退・満了・移籍）は
  //   232クラブ全部にあるので、床も全部に要る。CPUのクラブを1つわざと減らして、
  //   開幕したときに埋まっているかを見る
  const st = useGameStore.getState()
  const victim = jpelClubs(st.clubs).find(t => t.id !== MY)!
  const vIds = st.players.filter(p => p.teamId === victim.id && p.status !== 'retired').map(p => p.id)
  const drop = new Set(vIds.slice(0, Math.max(0, vIds.length - 9)))   // 9人まで減らす
  useGameStore.setState({ players: st.players.filter(p => !drop.has(p.id)) } as never)
  const vBefore = useGameStore.getState().players.filter(p => p.teamId === victim.id && p.status !== 'retired').length
  useGameStore.getState().startRegularSeason()
  const vAfter = useGameStore.getState().players.filter(p => p.teamId === victim.id && p.status !== 'retired').length
  console.log(`      CPUのクラブ（${victim.shortName}）を ${vBefore}人に減らす → 開幕 ${vAfter}人`)
  check('減らした世界になっている（空振りではない）', vBefore < SEASON_START_ROSTER, `${vBefore}人`)
  check(`自チーム以外のクラブも ${SEASON_START_ROSTER} 人まで埋まる`, vAfter === SEASON_START_ROSTER, `${vAfter}人`)

  // 海外クラブも同じ（国内だけに絞っていないか）
  const st2 = useGameStore.getState()
  const fClub = clubsWhere(st2.clubs, c => !isJpelLeague(c.leagueId))[0]
  const fIds = st2.players.filter(p => p.teamId === fClub.id && p.status !== 'retired').map(p => p.id)
  const fDrop = new Set(fIds.slice(0, Math.max(0, fIds.length - 8)))
  useGameStore.setState({ players: st2.players.filter(p => !fDrop.has(p.id)) } as never)
  const fBefore = useGameStore.getState().players.filter(p => p.teamId === fClub.id && p.status !== 'retired').length
  useGameStore.getState().startRegularSeason()
  const fAfter = useGameStore.getState().players.filter(p => p.teamId === fClub.id && p.status !== 'retired').length
  console.log(`      海外クラブ（${fClub.shortName}）を ${fBefore}人に減らす → 開幕 ${fAfter}人`)
  check(`海外クラブも ${SEASON_START_ROSTER} 人まで埋まる（国内だけに絞っていない）`, fAfter === SEASON_START_ROSTER, `${fAfter}人`)
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
