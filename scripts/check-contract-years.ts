/**
 * 【移籍履歴に出る契約年数は、実際に結んだ契約と同じ】
 *
 * ■何が起きていたか（2026-08-18 の監査）
 *   `movePlayer` に渡す `years`（＝クラブ詳細の「加入・放出」に出る年数）だけが
 *   **`years: 2` の手書き**で、実際に結ぶ契約は `newContractYears`（1〜5年）だった。
 *   手書きは2か所（CPUの移籍市場・シーズン中のFA）。1年を実際に回して数えると
 *
 *     移籍 1,232件 ／ 画面は全部「2年」 ／ 実際は 1年16・2年261・3年415・4年394・5年146
 *     食い違い 971件（**78.8%**）
 *
 *   CLAUDE.md が「動いた選手が全員 残り2年に揃っていた」を潰したのは**契約の実体だけ**で、
 *   **表示側に 2 が残っていた**。契約年数を見る仕組み（移籍金の係数）は直っているのに、
 *   遊ぶ側から見える数字は嘘のままだった。
 *
 * ■いまの形
 *   `movePlayer` が**結んだ契約から出す**（`shownYears`）。呼ぶ側は数字を書けない。
 *   `years` はレンタルの期間（何年借りるか）専用。
 *
 * ■この点検が守るもの
 *   ① 1年を実際に回して、履歴の年数と選手の契約が1件残らず一致すること
 *      （字面ではなく結果を見る。`years: 2` を書き戻すとここが落ちる）
 *   ② 移籍（レンタルでない）の呼び出しに `years:` が書かれていないこと
 */
let sd = 20260811
const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
Math.random = rnd

import { readFileSync } from 'node:fs'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { runTransferMarket } from '../src/engine/transferMarket'
import { CPU_TICK_TRANSFERS, cpuMarketRounds } from '../src/engine/cpuOffseason'
import { generateSeasonRaces } from '../src/data/races'
import { allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../src/utils/clubTier'
import { buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import { leagueOfClub } from '../src/utils/clubs'
import { ROSTER_MAX } from '../src/data/rosterRules'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 1年まわして、履歴の年数と実際の契約を突き合わせる')
{
  const YEAR = 2030, MY = 'tokyo'
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  let teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  let leagues = fgen.updatedLeagues
  const CLUBS = allTieredClubs(teams, leagues)
  const destinationOf = (clubId: string, player: Player) => {
    const team = teams.find(t => t.id === clubId)
    const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, CLUBS) ?? tierOfClubId(clubId))
    const lg = team ? undefined : leagueOfClub(leagues, clubId)
    return buildDestination(clubId, tier, players, { isForeign: !team, region: regionOfLeague(lg?.id), player })
  }
  const races = generateSeasonRaces(YEAR, 1)
  const season = {
    year: YEAR, currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
  } as unknown as Season

  let last: string | undefined
  const dist = new Map<number, number>()
  let moves = 0, mismatch = 0, missing = 0
  for (const date of [...races.map(r => r.date), `${YEAR + 1}-02-01`]) {
    const step = cpuMarketRounds(last, date)
    if (step.rounds <= 0) continue
    last = step.nextDate
    for (const roundDate of step.dates) {
      const r = runTransferMarket({ players, teams, foreignLeagues: leagues }, {
        playerTeamId: MY, year: YEAR, season, pastSeasons: [],
        rosterCapFor: () => ROSTER_MAX, destinationOf,
        excludeIds: new Set<string>(), maxMoves: CPU_TICK_TRANSFERS, date: roundDate })
      for (const rec of r.records) {
        const p = r.players.find(x => x.id === rec.playerId)
        if (!p) continue
        moves++
        if (rec.years == null) missing++
        else if (rec.years !== p.contract.yearsLeft) mismatch++
        dist.set(p.contract.yearsLeft, (dist.get(p.contract.yearsLeft) ?? 0) + 1)
      }
      players = r.players; teams = r.teams; leagues = r.foreignLeagues
    }
  }

  console.log(`  移籍 ${moves}件 ／ 契約年数の内訳 ` +
    [...dist.entries()].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}年${n}`).join(' '))
  check('移籍が起きている（世界が動かないと何も見ていない）', moves > 100, `${moves}件`)
  check('履歴の年数が入っている', missing === 0, `${missing}件が空`)
  check('履歴の年数＝実際の契約年数', mismatch === 0, `${mismatch}件が食い違い`)
  // ★**1つの値に潰れていないこと。** 全部2年でも「一致」はしてしまうので、
  //   契約年数そのものが散らばっているかも一緒に見る（`newContractYears` を通っている印）
  check('契約年数が1つに潰れていない', dist.size >= 4, `${dist.size}種類`)
}

console.log('\n[2] 移籍の呼び出しに years を書いていない（レンタルの期間だけ）')
{
  // ★`years` はレンタル専用。移籍で渡すと、契約と別の数字を画面に出せてしまう。
  //   レンタルは `until:` を必ず一緒に渡すので、それで見分ける。
  const FILES = [
    'src/engine/transferMarket.ts', 'src/engine/inSeasonFa.ts', 'src/engine/applyTransfers.ts',
    'src/engine/tradeExecution.ts', 'src/store/slices/marketSlice.ts',
    'src/store/slices/draftSlice.ts', 'src/store/slices/seasonSlice.ts', 'src/store/marketOps.ts',
  ]
  const hits: string[] = []
  for (const f of FILES) {
    const src = readFileSync(f, 'utf8')
    // movePlayer( から閉じ括弧までのかたまりを見る
    for (const m of src.matchAll(/movePlayer\([\s\S]{0,700}?\}\)/g)) {
      const block = m[0]
      if (/\buntil:/.test(block)) continue          // レンタルは対象外
      if (!/\byears:/.test(block)) continue
      hits.push(`${f}:${src.slice(0, m.index!).split('\n').length}`)
    }
  }
  check('移籍の呼び出しに years が無い', hits.length === 0, hits.join(' / '))

  const mp = readFileSync('src/utils/movePlayer.ts', 'utf8')
  check('movePlayer が結んだ契約から年数を出している',
    /const shownYears = onLoan[\s\S]{0,160}contract\.yearsLeft/.test(mp))
  check('履歴も退団のお知らせも同じ shownYears を使う',
    (mp.match(/shownYears != null \? \{ years: shownYears \}/g) ?? []).length === 2,
    `${(mp.match(/shownYears != null \? \{ years: shownYears \}/g) ?? []).length}件`)
}

if (failed > 0) { console.log(`\n  → NG ${failed}件`); process.exit(1) }
console.log('\n  → OK')
