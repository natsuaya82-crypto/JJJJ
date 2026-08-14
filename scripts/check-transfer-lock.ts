/**
 * 【移籍したら2年は動かせない。ただしレンタルは別】
 * 【レンタルの相手は主力ではない】
 *
 * ■なぜ要るのか（オーナー・2026-08-14）
 *   「移籍して2年は動かせなくしよう。レンタルのみ」
 *   「レンタルも、主力の90とかをレンタルしようとしてくるのなに？」
 *
 *   2回目以降の移籍のうち**70.1%が「前の年に移ったばかり」**でした
 *   （間隔 1年70.1% / 2年22.4% / 3年6.3%）。契約年数の坂だけでは 67.7% → 60.6% までしか
 *   下がりません。市場が1年に動かす件数（約1,200件）のほうが、その回に出せる選手
 *   （1回あたり288人）より多いので、**供給を絞っても同じ人がまた選ばれる**ためです。
 *
 * ■レンタルが主力を狙っていた理由
 *   「試合に出ていない」を**出場率だけ**で見ていました。**シーズンの頭は全員が出場率0**
 *   なので、そこだけを見るとU23で一番強い選手＝主力が候補に入ります。
 *   レース結果に依らない**序列**（走れる7人に入るか）を先に見るようにしました。
 */
import { isTransferLocked, TRANSFER_LOCK_YEARS } from '../src/utils/transferEligibility'
import { generateLoanOffers, LOAN_BENCH_PLAY_RATE } from '../src/engine/cpuMarket'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { comparePlayers } from '../src/utils/playerSort'
import { wouldMakeLineup } from '../src/utils/squadNeeds'
import { ovr } from '../src/utils/playerUtils'
import { readFileSync } from 'node:fs'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log(`[1] 移籍したら ${TRANSFER_LOCK_YEARS} 年は動かせない`)
{
  const p = (joinedYear: number) => ({ id: 'x', joinedYear } as unknown as Player)
  check('加入した年は動かせない', isTransferLocked(p(2030), 2030))
  check('その翌年もまだ動かせない', isTransferLocked(p(2030), 2031))
  check(`${TRANSFER_LOCK_YEARS}年経ったら動かせる`, !isTransferLocked(p(2030), 2030 + TRANSFER_LOCK_YEARS))
  check('もっと経てば当然動かせる', !isTransferLocked(p(2030), 2040))
  // ★joinedYear が無い選手（初期ロスター・古いセーブ）を止めると世界が丸ごと凍る
  check('joinedYear が無い選手は止めない',
    !isTransferLocked({ id: 'y' } as unknown as Player, 2030))
  check('年が分からないときも止めない', !isTransferLocked(p(2030), undefined))
}

console.log('\n[2] 市場とトレードは関門を通す。レンタルは通さない')
{
  const src = (f: string) => readFileSync(f, 'utf8')
  const market = src('src/engine/transferMarket.ts')
  const off = src('src/engine/cpuOffseason.ts')
  check('移籍市場の売り候補が isTransferLocked を通る', /isTransferLocked\(p, ctx\.year\)/.test(market))
  check('移籍市場に joinedYear の手書きが残っていない', !/joinedYear !== ctx\.year/.test(market))
  check('CPUトレードの出し手・受け手が通る', (off.match(/isTransferLocked\(p, ctx\.year\)/g) ?? []).length >= 2)
  // ★レンタルだけは1年のまま（オーナー「レンタルのみ」）
  check('レンタルは関門を通さない（1年のまま）', /!loanedIds\.has\(p\.id\) && p\.joinedYear !== ctx\.year/.test(off))
}

console.log('\n[3] レンタルの相手は主力ではない（世界を作って実際に打診させる）')
{
  const YEAR = 2034, MY = 'tokyo'
  const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  let sd = 20260814
  const real = Math.random
  Math.random = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296 }
  const players = generateCpuRosters(teams, YEAR).cpuPlayers
    .map(p => ({ ...p, teamId: p.teamId, joinedYear: YEAR - 5 }))
  // ★**走り終わったレースがある状態**にすること。1本も走っていない世界だと
  //   `playRateOf` が「分からない」＝0.5 を返すので**候補が1人も出ず、打診が0件**になり、
  //   下の「主力に来ない」が**空振りの緑**になります（実際にこの形で一度書いてしまった）。
  //   ここでは全レースを消化済みにし、自チームからは誰も走らなかったことにする
  //   ＝**全員が出場率0**。それでも主力（走れる7人）には話が来ないことを見る
  const races = generateSeasonRaces(YEAR, 1)
    .map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }))
  const season = { year: YEAR, currentRaceIndex: races.length, races } as unknown as Season
  const myRoster = players.filter(p => p.teamId === MY && p.status === 'active').sort(comparePlayers('ovr'))
  const best = myRoster[0]
  console.log(`      自チームの名簿 ${myRoster.length}人 / 最強 OVR${ovr(best)}（${best.age}歳）`)

  let lendOut = 0, starters = 0, borrowIn = 0
  for (let raceIndex = 0; raceIndex < 40; raceIndex++) {
    const { loanOffers } = generateLoanOffers({
      players, teams, foreignClubs: [], playerTeamId: MY, raceIndex,
      existingLoans: [], races, season, retiringIds: new Set<string>(), currentYear: YEAR,
    })
    for (const o of loanOffers) {
      const p = players.find(x => x.id === o.playerId)!
      if (o.direction === 'lend_out') {
        lendOut++
        if (wouldMakeLineup(myRoster, p)) starters++
      } else borrowIn++
    }
  }
  Math.random = real
  console.log(`      貸出の打診 ${lendOut}件（うち走れる7人に入る選手 ${starters}件）／借入の打診 ${borrowIn}件`)
  // ★ここが本体。序列を見ずに出場率だけで判定すると、シーズン頭は全員0なので主力が並ぶ
  check('貸出の打診が来ている（判定が空振りしていない）', lendOut > 0, `${lendOut}件`)
  check('主力（走れる7人）に貸出の打診が来ない', starters === 0, `${starters}件`)
  check(`借りる/貸すの線は1本（${LOAN_BENCH_PLAY_RATE}）`, LOAN_BENCH_PLAY_RATE > 0 && LOAN_BENCH_PLAY_RATE < 1)
}

console.log('')
if (failed > 0) { console.log(`✗ 移籍の間隔かレンタルの相手選びが崩れています（${failed}件）`); process.exit(1) }
console.log(`✓ 移籍したら${TRANSFER_LOCK_YEARS}年動かせない（レンタルは別）。レンタルの相手は主力ではない`)
