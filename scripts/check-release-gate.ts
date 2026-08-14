/**
 * 【契約が長い選手は出す側が渋る】`transferDecision.willRelease` が効いているか。
 *
 * ■なぜ要るのか（オーナー指摘・2026-08-14「1年でぽんぽんチーム変えるのはなあ」）
 *   `runTransferMarket` は `yearsLeft` を**一度も見ていません**でした。効いていたのは
 *   移籍金の係数（残り1年1.1倍〜）だけですが、**これに移籍を止める力はありません**。
 *   実測で残り年数ごとの移籍率は 16.41 / 16.48 / 15.52 / 15.31%（1〜4年）、
 *   **残り4年を3.0倍にしても14.90%**。関門ごとに数えても「金が足りない」で落ちるのは0件。
 *
 * ■**壁ではなく坂**にしてある
 *   壁（「残り2年を切るまで動けない」）にすると、動けるのが残り1〜2年の選手だけになり、
 *   移籍金の係数の 1.3・1.4・1.5 が誰にも当たらなくなります（係数はオーナー判断で残す）。
 *
 * ■空振りの緑にしないために
 *   `willRelease` を単体で叩くだけだと、**市場がそれを呼んでいなくても緑になります**
 *   （実際にこの形の穴が過去4回見つかっている）。[3] で市場を実際に1回まわして、
 *   長い契約の選手が動きにくいことを数えます。
 */
import { RELEASE_CHANCE, willRelease, buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import { newContractYears, calcTransferValue } from '../src/utils/playerUtils'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { runTransferMarket } from '../src/engine/transferMarket'
import { allTieredClubs, tierOf, tierOfClubId, tierOfPlayerClub } from '../src/utils/clubTier'
import { leagueOfClub } from '../src/utils/clubs'
import { ROSTER_MAX } from '../src/data/rosterRules'
import { CPU_TICK_TRANSFERS } from '../src/engine/cpuOffseason'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const mk = (id: string, yearsLeft: number) =>
  ({ id, contract: { yearsLeft } }) as unknown as Player

console.log('[1] 坂になっている（長いほど渋る。ただし0にはしない）')
{
  check('残り1年は必ず出せる', willRelease(mk('a', 1), '2030-05-03') && willRelease(mk('a', 0), '2030-05-03'))
  let prev = 1.1
  let monotone = true
  for (let yl = 2; yl < RELEASE_CHANCE.length; yl++) {
    if (RELEASE_CHANCE[yl] >= prev) monotone = false
    prev = RELEASE_CHANCE[yl]
  }
  check('残り年数が増えるほど応じる割合が下がる', monotone, RELEASE_CHANCE.join(' / '))
  check('いちばん長くても0ではない（壁ではなく坂）', RELEASE_CHANCE[RELEASE_CHANCE.length - 1] > 0)
  // ★`RELEASE_CHANCE` は**1年ぶん**の確率。市場は1年に16回まわるので、1回ぶんへ
  //   割り戻してある（`1 - (1 - p)^(1/16)`）。ここではその**1回ぶん**が狙いどおりかを見る。
  //   1年ぶん（「一度でも出せる日があったか」）で数えると 75% の狙いに対し実測 83% と
  //   ずれます。同じ選手の16回が独立ではなく散る側に寄るためで、**1人が何日も出せる**より
  //   **多くの人が1日ずつ出せる**ほうへ寄っている＝市場としては望ましい向きです。
  //   割り戻しの式を変えたらここが落ちます。
  const DAYS = Array.from({ length: 16 }, (_, i) => `2030-${String(i + 1).padStart(2, '0')}-15`)
  for (let yl = 2; yl < RELEASE_CHANCE.length; yl++) {
    const want = 1 - Math.pow(1 - RELEASE_CHANCE[yl], 1 / 16)
    let ok = 0, n = 0
    for (let i = 0; i < 3000; i++) for (const d of DAYS) { n++; if (willRelease(mk(`p${i}`, yl), d)) ok++ }
    const got = ok / n
    check(`残り${yl}年は1回あたり ${(want * 100).toFixed(2)}%（1年ぶん ${(RELEASE_CHANCE[yl] * 100).toFixed(0)}% の割り戻し）`,
      Math.abs(got - want) < 0.005, `実測 ${(got * 100).toFixed(2)}%`)
  }
}

console.log('\n[2] 乱数を使っていない。ただし市場が回るたびに引き直す')
{
  const p = mk('same', 3)
  const first = willRelease(p, '2030-05-03')
  let stable = true
  for (let i = 0; i < 50; i++) if (willRelease(p, '2030-05-03') !== first) stable = false
  check('同じ選手・同じ日・同じ残り年数なら何度引いても同じ', stable)
  // ★日が変われば引き直す。**引き直さないと年の後半が空っぽになります**
  //   （その年に出せる人だけで回すので在庫が尽きる。実測 77…77 / 46 / 5 / 0）。
  //   これは2026-08-12 に均した「年に一度の塊」が形を変えて戻ってきたのと同じ。
  //   （1回あたりの確率は数%なので、日数を多めに取らないと全部 false になる）
  const days = Array.from({ length: 200 }, (_, i) => `2030-${String(i + 1).padStart(3, '0')}`)
  check('日が変われば引き直す', new Set(days.map(d => willRelease(p, d))).size > 1)
}

console.log('\n[3] 市場が実際に見ている（長い契約ほど動かない）')
{
  let sd = 20260814
  const realRandom = Math.random
  Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
  const YEAR = 2034, MY = 'chiba'
  const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(teams, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  const leagues = fgen.updatedLeagues
  const CLUBS = allTieredClubs(teams, leagues)
  // 契約年数は newContractYears で配る（生成直後は2〜4年に偏っていて5年が1人もいない）
  let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
    .map(p => ({ ...p, contract: { ...p.contract, yearsLeft: newContractYears(p, YEAR) } }))
  const races = generateSeasonRaces(YEAR)
  const season = {
    year: YEAR, currentRaceIndex: races.length,
    races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
  } as unknown as Season

  const pool = new Map<number, number>()
  const moved = new Map<number, number>()
  for (const p of players) pool.set(p.contract.yearsLeft, (pool.get(p.contract.yearsLeft) ?? 0) + 1)
  for (let round = 0; round < 8; round++) {
    const before = new Map(players.map(p => [p.id, { club: p.teamId, yl: p.contract.yearsLeft }]))
    const snapshot = players
    const out = runTransferMarket({ players, teams, foreignLeagues: leagues }, {
      playerTeamId: MY, year: YEAR, season, pastSeasons: [],
      rosterCapFor: () => ROSTER_MAX,
      destinationOf: (clubId: string, player: Player) => {
        const team = teams.find(x => x.id === clubId)
        const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, CLUBS) ?? tierOfClubId(clubId))
        const lg = team ? undefined : leagueOfClub(leagues, clubId)
        return buildDestination(clubId, tier, snapshot, { isForeign: !team, region: regionOfLeague(lg?.id), player })
      },
      // ★1回ごとに違う日付を渡すこと。同じ日付を使い回すと2回目以降が空振りする
      //   （`cpuMarketRounds` が1回ごとの日付を返すのはこのため）
      excludeIds: new Set<string>(), maxMoves: CPU_TICK_TRANSFERS,
      date: `${YEAR}-${String(3 + round).padStart(2, '0')}-15`,
    })
    players = out.players
    for (const p of players) {
      const b = before.get(p.id)
      if (b && b.club !== p.teamId && p.teamId) moved.set(b.yl, (moved.get(b.yl) ?? 0) + 1)
    }
  }
  Math.random = realRandom

  const rate = (yl: number) => (moved.get(yl) ?? 0) / Math.max(1, pool.get(yl) ?? 0)
  console.log('      残り  母数    動いた   割合')
  for (const yl of [1, 2, 3, 4, 5]) {
    console.log(`      ${yl}年 ${String(pool.get(yl) ?? 0).padStart(6)} ${String(moved.get(yl) ?? 0).padStart(7)}   ${(rate(yl) * 100).toFixed(2)}%`)
  }
  // ★★ここが本体。**「右肩下がりか」で見ないこと。**
  //   `newContractYears` は若いほど長い契約を結ぶので、**関門を外しても表は右肩下がり**
  //   になります（残り5年は23歳以下しかいない＝そもそも余剰になりにくい）。実際にこの
  //   点検を書いたとき、市場から `willRelease` を消しても緑のままでした。
  //
  //     関門あり  51.26 / 27.00 /  7.93 / 3.25 / 0.91 %（残り1〜5年）
  //     関門なし  27.73 / 18.17 / 10.22 / 9.69 / 3.65 %
  //
  //   見分けが付くのは**隣り合う年の落ち方**です。関門が無いと 3年と4年がほぼ並びます
  //   （0.95倍）が、関門があると坂のぶんだけ落ちます（0.41倍）。
  //   ここの数字を緩めるときは、必ず市場から `willRelease` を消して落ちることを確かめること。
  const drop = (a: number, b: number) => rate(a) / Math.max(1e-9, rate(b))
  check('残り3年は残り2年より目立って動きにくい', drop(3, 2) < 0.45,
    `${(drop(3, 2) * 100).toFixed(0)}%（関門なしだと56%）`)
  check('残り4年は残り3年より目立って動きにくい', drop(4, 3) < 0.75,
    `${(drop(4, 3) * 100).toFixed(0)}%（関門なしだと95%）`)
  check('残り5年は残り4年より目立って動きにくい', drop(5, 4) < 0.35,
    `${(drop(5, 4) * 100).toFixed(0)}%（関門なしだと38%）`)
  check('それでも残り4年が0件ではない（壁ではなく坂）', (moved.get(4) ?? 0) > 0)
}

console.log('\n[4] 移籍金の係数が、結ぶ契約の最長（5年）まで伸びている')
{
  const base = { id: 'fee', age: 25, ratings: { speed: 80, stamina: 80, power: 80, technique: 80, mental: 80 },
    contract: { annualSalary: 5000, yearsLeft: 1 } } as unknown as Player
  const fee = (yl: number) => calcTransferValue({ ...base, contract: { ...base.contract, yearsLeft: yl } })
  console.log(`      1年 ${(fee(1) / 1e8).toFixed(2)}億 → 5年 ${(fee(5) / 1e8).toFixed(2)}億`)
  check('残り5年は残り4年より高い（4年で頭打ちになっていない）', fee(5) > fee(4))
  check('残り6年は5年と同じ（そこで頭打ち）', fee(6) === fee(5))
  // newContractYears が結ぶ最長と、係数の頭打ちが揃っていること
  let maxYears = 0
  for (let i = 0; i < 3000; i++) {
    for (const age of [20, 25, 30, 35]) {
      maxYears = Math.max(maxYears, newContractYears({ id: `q${i}`, age } as Player, 2030))
    }
  }
  check('結ぶ契約の最長と、係数が頭打ちになる年数が揃っている',
    fee(maxYears) > fee(maxYears - 1) && fee(maxYears + 1) === fee(maxYears), `最長 ${maxYears}年`)
}

console.log('')
if (failed > 0) { console.log(`✗ 契約年数の坂が効いていません（${failed}件）`); process.exit(1) }
console.log('✓ 契約が長いほど出す側が渋る。壁ではなく坂で、移籍金の係数も5年まで伸びている')
