/**
 * 【CPU の自動処理から、自チームは id で外す】（W6）
 *
 * ■なぜ要るのか
 *   オフのCPU処理（解雇・トレード・レンタル）が回すクラブの一覧は、
 *   「国内は選手のいるCPUクラブ（自チームを除く）＋海外は全クラブ」の2本をつないで作っていた。
 *   自チームを外しているのは国内の側だけなので、**自チームが海外クラブだと、
 *   自チームの選手がCPUの判断で解雇・放出される**形だった。
 *   ECL の出場チームも同じで、海外リーグから出たクラブは自チームでも `isPlayerTeam: false`。
 *
 * ■見るもの
 *   [1] 自チームを海外クラブに置いた世界で、解雇（在籍上限を小さくして大量に切らせる）・
 *       トレード・レンタルを回しても、自チームの選手が1人も動かない
 *       （同じ世界で、ほかのクラブは実際に動いている＝空振りの緑ではない）
 *   [2] 自チームが海外リーグから ECL に出ると `isPlayerTeam` になる
 */
let rngSeed = 20260925
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { runCpuReleases, runCpuTrades, runCpuLoans } from '../src/engine/cpuOffseason'
import { buildEclParticipants } from '../src/engine/eclSeries'
import { initialWorldClubs } from '../src/store/initialWorld'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { clubsWhere, isJpelLeague, jpelClubs } from '../src/utils/world'
import { FOREIGN_LEAGUE_DEFS } from '../src/data/leagues'
import { ROSTER_MAX } from '../src/data/rosterRules'
import type { Player, WorldClub } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2031
const clubs: WorldClub[] = initialWorldClubs()
const foreign = clubsWhere(clubs, c => !isJpelLeague(c.leagueId))
const players: Player[] = [
  ...generateCpuRosters(jpelClubs(clubs), YEAR).cpuPlayers,
  ...generateForeignLeaguePlayers(foreign as never, YEAR).players,
]
const ME = foreign[0].id
const mine = (ps: readonly Player[]) => new Map(ps.filter(p => p.teamId === ME).map(p => [p.id, p.teamId]))
const before = mine(players)
const teamOf = new Map(players.map(p => [p.id, p.teamId]))
const movedOthers = (ps: readonly Player[]) => ps.filter(p => p.teamId !== teamOf.get(p.id) && teamOf.get(p.id) !== ME).length

console.log(`[1] 自チームを海外クラブ（${ME}・${before.size}人）に置いて、オフのCPU処理を回す`)
{
  const released = runCpuReleases({ players, clubs }, { playerTeamId: ME, year: YEAR,
    // 自チームの上限超過ぶんだけは、プレイヤーへ警告したうえでオフに切る決まり（別の話）。
    // ここでは自チームを上限の内側に置いて、CPUの判断で切られないかだけを見る
    rosterCapFor: id => (id === ME ? ROSTER_MAX : 16) })
  const r = mine(released.players)
  check('解雇：自チームの選手が1人も動かない', r.size === before.size && [...before.keys()].every(id => r.get(id) === ME),
    `${before.size} → ${r.size}`)
  check('  ほかのクラブは実際に切られている（空振りではない）', movedOthers(released.players) > 0, `${movedOthers(released.players)}人`)

  const excludeIds = new Set<string>()
  const traded = runCpuTrades({ players, clubs }, { playerTeamId: ME, year: YEAR, excludeIds,
    tradeValueCtx: { races: [], teamRaces: 0, players } as never })
  check('トレード：自チームの選手が1人も動かない', [...before.keys()].every(id => mine(traded.players).get(id) === ME))
  check('  自チームが相手のトレードの記録も無い', traded.records.every(x => x.fromTeamId !== ME && x.toTeamId !== ME))

  const lent = runCpuLoans({ players, clubs }, { playerTeamId: ME, year: YEAR, excludeIds: new Set<string>() })
  check('レンタル：自チームの選手が1人も動かない', [...before.keys()].every(id => mine(lent.players).get(id) === ME))
  check('  自チームが借り手にもなっていない', lent.players.filter(p => p.teamId === ME).length === before.size)
}

console.log('\n[2] 自チームが海外リーグから ECL に出ると、自チームとして扱われる')
{
  const lg = FOREIGN_LEAGUE_DEFS.find(l => l.id === foreign[0].leagueId)!
  const lgClubs = clubsWhere(clubs, c => c.leagueId === lg.id)
  const seasonLeagues = { [lg.id]: { standings: lgClubs.map((c, i) => ({ teamId: c.id, totalPoints: c.id === ME ? 999 : 100 - i })) } }
  const parts = buildEclParticipants({ standings: [], clubs, playerTeamId: ME, seasonLeagues, players })
  const me = parts.find(p => p.id === ME)
  check('自チームが出場している', !!me)
  check('  isPlayerTeam が付いている', me?.isPlayerTeam === true)
  check('  ほかは付いていない', parts.filter(p => p.isPlayerTeam).length === 1)
}

if (failed > 0) { console.log(`\n✗ ${failed}件`); process.exit(1) }
console.log('\n✓ 自チームは id で外れている')
