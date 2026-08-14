/**
 * 【市場は強さと格を揃える方向に働く】
 *
 * ■なぜ要るのか（オーナー指摘・2026-08-14「なんで格下に流れるの？意味わからないやろ」）
 *   移籍市場は、強さと格の対応を**強めるどころか崩していました**。
 *   OVRと所属クラブの格の相関（-1に近いほど「強い選手ほど格上」）が
 *
 *       開幕 -0.637 → 1年 -0.568 → 2年 -0.531 → 3年 -0.521
 *
 *   と年々バラける。原因は次の2つで、どちらも1行でした。
 *
 *   | | 何が起きていたか |
 *   |---|---|
 *   | 買う順番が**格下のクラブから**だった | 買う側は候補をOVRの高い順に取るので、**毎回いちばん弱いクラブが市場でいちばん強い選手を最初に選ぶ**。OVR85+の76%が格下へ流れ、平均の格が 6.7 → 8.9 とずり落ちていた |
 *   | 出す側と買う側で**線が違った** | 出す側は15番手以降を余剰として出すのに、買う側は「走れる7人」に入る選手しか獲らない。**8〜14番手は誰もが売るが誰も買わない**層になり、OVR70以下の1,208人（全体の21%）が232クラブ全部から「要らない」＝3年で移籍1件だった |
 *
 *   直したあと：相関 -0.637 → **-0.648**（締まる）。OVR85+ は 4.3 → 4.2 でその場に留まる。
 *
 * ■空振りの緑にしないために
 *   定数を見るだけの点検は、市場がそれを使っていなくても緑になります。[3] で
 *   232クラブの市場を実際に3年ぶん回し、**OVR帯ごとの行き先の格**を数えます。
 *   どちらの1行を元に戻しても落ちることを確かめてあること。
 */
let sd = 20260814
Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }

import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { runTransferMarket } from '../src/engine/transferMarket'
import { allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../src/utils/clubTier'
import { buildDestination, regionOfLeague, hasNoPlayingTime } from '../src/utils/transferDecision'
import { allForeignClubs, leagueOfClub } from '../src/utils/clubs'
import { needsPlayer } from '../src/utils/squadNeeds'
import { clubIndexOf } from '../src/utils/rosterSync'
import { newContractYears, ovr } from '../src/utils/playerUtils'
import { ROSTER_MAX, RUNNING_SLOTS, SQUAD_DEPTH_SLOTS } from '../src/data/rosterRules'
import { CPU_TICK_TRANSFERS } from '../src/engine/cpuOffseason'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 出す側の線と買う側の線が同じ')
{
  check(`戦力の線は走れる人数の2倍（${RUNNING_SLOTS} × 2 = ${SQUAD_DEPTH_SLOTS}）`,
    SQUAD_DEPTH_SLOTS === RUNNING_SLOTS * 2)
  check(`${SQUAD_DEPTH_SLOTS}番手は余剰でない`, !hasNoPlayingTime(SQUAD_DEPTH_SLOTS))
  check(`${SQUAD_DEPTH_SLOTS + 1}番手からが余剰`, hasNoPlayingTime(SQUAD_DEPTH_SLOTS + 1))
}

const YEAR = 2034, MY = 'chiba'
const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(teams, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const leagues = fgen.updatedLeagues
const clubs = [...teams, ...allForeignClubs(leagues)]
const CLUBS = allTieredClubs(teams, leagues)
const tierByClub = new Map(clubs.map(c => [c.id, tierOf(c as never)]))
let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  .filter(p => p.status === 'active')
  .map(p => ({ ...p, contract: { ...p.contract, yearsLeft: newContractYears(p, YEAR) } }))

console.log('\n[2] 弱い選手にも行き先がある。ただし線は買う側の名簿に対する相対')
{
  const idx = clubIndexOf(players)
  const rosterOf = (id: string) => (idx.get(id) ?? []).filter(p => p.status === 'active')
  const nearest = (t: number) => players.map(p => ({ p, d: Math.abs(ovr(p) - t) })).sort((a, b) => a.d - b.d)[0].p
  const wanters = (p: Player) => clubs.filter(c => c.id !== p.teamId && needsPlayer(rosterOf(c.id), p))
    .map(c => tierByClub.get(c.id)!)
  const w70 = wanters(nearest(70)), w64 = wanters(nearest(64)), w85 = wanters(nearest(85))
  const span = (a: number[]) => a.length ? `格${Math.min(...a)}〜${Math.max(...a)}` : '—'
  console.log(`      OVR64 ${w64.length}クラブ ${span(w64)} / OVR70 ${w70.length}クラブ ${span(w70)} / OVR85 ${w85.length}クラブ ${span(w85)}`)
  // ★線を「走れる7人」に戻すと OVR70 が 0 クラブになる（＝ここが落ちる）
  check('OVR70前後の選手を欲しがるクラブがある', w70.length > 0, `${w70.length}クラブ`)
  check('ただしそれは格下のクラブだけ（格上は欲しがらない）', w70.every(t => t >= 12), span(w70))
  // ★線を緩めすぎると、格上のクラブまで OVR64 を「必要」と言い出す（CLAUDE.md の警告）
  check('OVR64前後は誰も欲しがらない（緩めすぎていない）', w64.length === 0, `${w64.length}クラブ`)
  check('強い選手はほぼ全クラブが欲しがる', w85.length > clubs.length / 3, `${w85.length}クラブ`)
}

console.log('\n[3] 市場を3年まわして、強い選手が格下へ流れないこと')
{
  const BANDS: [string, (v: number) => boolean][] = [
    ['OVR85+', v => v >= 85], ['OVR78-84', v => v >= 78 && v < 85], ['OVR71-77', v => v >= 71 && v < 78],
  ]
  const rows = new Map<string, { n: number; from: number; to: number }>()
  for (let y = 0; y < 3; y++) {
    const year = YEAR + y
    const races = generateSeasonRaces(year)
    const season = { year, currentRaceIndex: races.length,
      races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })) } as unknown as Season
    for (let round = 0; round < 16; round++) {
      const before = new Map(players.map(p => [p.id, p.teamId]))
      const snapshot = players
      const out = runTransferMarket({ players, teams, foreignLeagues: leagues }, {
        playerTeamId: MY, year, season, pastSeasons: [],
        rosterCapFor: () => ROSTER_MAX,
        destinationOf: (clubId: string, player: Player) => {
          const team = teams.find(x => x.id === clubId)
          const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, CLUBS) ?? tierOfClubId(clubId))
          const lg = team ? undefined : leagueOfClub(leagues, clubId)
          return buildDestination(clubId, tier, snapshot, { isForeign: !team, region: regionOfLeague(lg?.id), player })
        },
        excludeIds: new Set<string>(), maxMoves: CPU_TICK_TRANSFERS,
        date: `${year}-${String(3 + round).padStart(2, '0')}-15`,
      })
      players = out.players
      for (const p of players) {
        const was = before.get(p.id)
        if (!was || was === p.teamId || !p.teamId) continue
        const ft = tierByClub.get(was), tt = tierByClub.get(p.teamId)
        if (ft == null || tt == null) continue
        const band = BANDS.find(([, f]) => f(ovr(p)))
        if (!band) continue
        const r = rows.get(band[0]) ?? { n: 0, from: 0, to: 0 }
        r.n++; r.from += ft; r.to += tt
        rows.set(band[0], r)
      }
    }
    players = players.map(p => {
      const left = p.contract.yearsLeft - 1
      return left > 0 ? { ...p, contract: { ...p.contract, yearsLeft: left } }
        : { ...p, contract: { ...p.contract, yearsLeft: newContractYears(p, year + 1) } }
    })
  }
  console.log('      帯          件数   平均の格（移る前 → 移った後）')
  for (const [name] of BANDS) {
    const r = rows.get(name); if (!r) continue
    console.log(`      ${name.padEnd(10)}${String(r.n).padStart(5)}   ${(r.from / r.n).toFixed(1)} → ${(r.to / r.n).toFixed(1)}`)
  }
  // ★★ここが本体。買う順番を「格下から」に戻すと 6.7 → 8.9 になって落ちる。
  //    **「格下へ行く件数」で見ないこと**——格下のクラブのほうが数が多いので、
  //    正しく動いていても件数の4割は格下行きになります。見るのは**平均の格のずれ**。
  const top = rows.get('OVR85+')!
  const drift = top.to / top.n - top.from / top.n
  check('OVR85+ は移っても格がずり落ちない', drift < 0.5,
    `${(top.from / top.n).toFixed(1)} → ${(top.to / top.n).toFixed(1)}（買う順番を格下からに戻すと 6.7 → 8.9）`)
  check('OVR85+ が居るのは格上（平均が格6より上）', top.from / top.n < 6,
    `平均 格${(top.from / top.n).toFixed(1)}`)
}

console.log('')
if (failed > 0) { console.log(`✗ 市場が強さと格を揃えていません（${failed}件）`); process.exit(1) }
console.log('✓ 強い選手は格上に留まり、弱い選手にも格下という行き先がある')
