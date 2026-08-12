/**
 * 【計測】自チームに来るレンタル打診（lend_out）が、1年で誰に何件来るか。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error scripts/measure-loan-offers.ts --outfile=/tmp/ml.cjs && node /tmp/ml.cjs
 *
 * ■なぜ測るのか
 *   「非売にしているのにレンタルの打診が1年に3〜4回来る。多すぎでは」という指摘。
 *
 *   まず事実を分けておく。**`canLoanOut` は `noSale` を見ていない**
 *   （`utils/transferEligibility.ts`。`noSale` で止めているのは `canBePoached` と
 *   `canGoOverseasDream` だけ）。移籍方針の画面にも
 *   「非売＝買い取りオファーを止める」と書いてある。つまり
 *   **いまの仕様では、非売にしてもレンタルの打診は止まらない。**
 *
 *   多さの出どころは別のところにある可能性が高い。`engine/cpuMarket.ts` の
 *   レンタル打診は2枠に分かれていて、
 *     L217 myLoanListed … 「貸出歓迎」を付けた選手（GMが望んだ話）
 *     L218 myYoung      … **23歳以下は、貸出歓迎を付けていなくても対象**
 *   さらに L345 が `youngCands[0]` ＝ その中の**OVR最上位1人に固定**。
 *   同じ選手にばかり来るのは、ランダムに選んでいないからではないか、を確かめる。
 *
 * ■係数（L343 の 0.70 / L345 の 0.25）は、この数字を見るまで触らない。
 */
import { generateForeignAndLoanOffers } from '../src/engine/cpuMarket'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateSeasonRaces } from '../src/data/races'
import { ovr } from '../src/utils/playerUtils'
import { divisionOf } from '../src/utils/league'
import { tierBudget } from '../src/utils/clubTier'
import type { ForeignClub, IncomingLoanOffer, Player, Team } from '../src/types'

const MY = 'tokyo'
const YEAR = 2030
const RUNS = 200   // 200年ぶん回して1年あたりに直す

const teams: Team[] = ([...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[])
  .map(t => ({ ...t, finance: { ...t.finance, budget: tierBudget(t) } }))
const foreignClubs: ForeignClub[] = FOREIGN_LEAGUES.flatMap(l =>
  l.clubs.map(c => ({ ...c, leagueId: l.id }))) as ForeignClub[]
const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)))

const fmt = (n: number, d = 2) => n.toFixed(d)

/**
 * 1年ぶん（レース数ぶん）回して、自チームに来た lend_out の打診を集める。
 * 打診は expiresAtRace = raceIndex + 3 で切れるので、そのぶんも再現する。
 */
function runOneYear(players: Player[]): IncomingLoanOffer[] {
  const got: IncomingLoanOffer[] = []
  let live: IncomingLoanOffer[] = []
  for (let i = 0; i < races.length; i++) {
    const r = generateForeignAndLoanOffers({
      players, teams, foreignClubs, playerTeamId: MY, raceIndex: i,
      existingIncoming: [], existingLoans: live,
      races, season: { year: YEAR, races }, currentYear: YEAR,
    })
    const lendOut = r.loanOffers.filter(o => o.direction === 'lend_out')
    got.push(...lendOut)
    live = [...live, ...r.loanOffers].filter(o => o.expiresAtRace > i + 1)
  }
  return got
}

/** 自チームの名簿に方針を当てて、1年ぶんの打診を数える */
function measure(label: string, tweak: (p: Player) => Player) {
  let total = 0
  const perYear: number[] = []
  const perPlayer = new Map<string, number>()
  let sameTopShare = 0
  for (let run = 0; run < RUNS; run++) {
    const { cpuPlayers } = generateCpuRosters(teams, YEAR - run)
    const players = cpuPlayers.map(p => (p.teamId === MY ? tweak(p) : p))
    const offers = runOneYear(players)
    total += offers.length
    perYear.push(offers.length)
    const byP = new Map<string, number>()
    for (const o of offers) {
      perPlayer.set(o.playerId, (perPlayer.get(o.playerId) ?? 0) + 1)
      byP.set(o.playerId, (byP.get(o.playerId) ?? 0) + 1)
    }
    // その年いちばん多く来た選手が、その年の打診の何割を占めたか
    const top = Math.max(0, ...byP.values())
    if (offers.length > 0) sameTopShare += top / offers.length
  }
  const avg = total / RUNS
  const hist = new Map<number, number>()
  for (const n of perYear) hist.set(n, (hist.get(n) ?? 0) + 1)
  const dist = [...hist.entries()].sort((a, b) => a[0] - b[0])
    .map(([n, c]) => `${n}件:${fmt(c / RUNS * 100, 0)}%`).join(' ')
  console.log(`  ${label}`)
  console.log(`    1年あたり ${fmt(avg)}件（最大 ${Math.max(...perYear)}件）  分布 ${dist}`)
  console.log(`    その年いちばん来た選手が占める割合 平均 ${fmt(sameTopShare / RUNS * 100, 0)}%`)
  return avg
}

console.log(`\n自チーム=${MY}（${races.length}戦／年）・${RUNS}年ぶんを回して1年あたりに直す\n`)

console.log('■ いまの状態（方針を何も付けない・非売も付けない）')
const plain = measure('方針なし', p => p)

console.log('\n■ 全員を「非売」にしてみる（オーナーの操作を再現）')
const noSale = measure('全員 noSale', p => ({ ...p, noSale: true }))
console.log(`    → 非売にしても件数は ${fmt(plain)} → ${fmt(noSale)}。`)
console.log('      canLoanOut は noSale を見ていないので、**止まらないのが今の仕様**')

console.log('\n■ 「貸出歓迎」をOVR上位3人に付けた場合（GMが望んだ話だけにしたときの水準）')
{
  // 上と同じ形で回すが、自チームのOVR上位3人に loanListed を立てる。
  // measure() は選手単位の tweak しか取れないので、ここは名簿を見てから付ける
  let total = 0
  const perYear: number[] = []
  let listedShare = 0
  for (let run = 0; run < RUNS; run++) {
    const { cpuPlayers } = generateCpuRosters(teams, YEAR - run)
    const top3 = new Set(cpuPlayers.filter(p => p.teamId === MY)
      .sort((a, b) => ovr(b) - ovr(a)).slice(0, 3).map(p => p.id))
    const players = cpuPlayers.map(p => (top3.has(p.id) ? { ...p, loanListed: true } : p))
    const offers = runOneYear(players)
    total += offers.length
    perYear.push(offers.length)
    if (offers.length > 0) listedShare += offers.filter(o => top3.has(o.playerId)).length / offers.length
  }
  console.log(`    1年あたり ${fmt(total / RUNS)}件（最大 ${Math.max(...perYear)}件）`)
  console.log(`    そのうち「貸出歓迎」を付けた選手あては ${fmt(listedShare / RUNS * 100, 0)}%`)
  console.log('    ＝残りは、付けていない23歳以下に来ているぶん（cpuMarket L218 の myYoung 枠）')
}

console.log('\n■ 誰に来ているか（200年ぶんを集計。23歳以下の中でのOVR順位べつ）')
{
  const byRank = new Map<number, number>()
  let n = 0
  const ages: number[] = []
  for (let run = 0; run < RUNS; run++) {
    const { cpuPlayers } = generateCpuRosters(teams, YEAR - run)
    const mine = cpuPlayers.filter(p => p.teamId === MY)
    const young = mine.filter(p => p.age <= 23).sort((a, b) => ovr(b) - ovr(a))
    const byId = new Map(cpuPlayers.map(p => [p.id, p]))
    for (const o of runOneYear(cpuPlayers)) {
      const r = young.findIndex(y => y.id === o.playerId)
      byRank.set(r, (byRank.get(r) ?? 0) + 1)
      n++
      const pl = byId.get(o.playerId)
      if (pl) ages.push(pl.age)
    }
  }
  const rows = [...byRank.entries()].sort((a, b) => b[1] - a[1])
  for (const [r, c] of rows.slice(0, 6)) {
    const label = r < 0 ? '23歳以下ではない（＝貸出歓迎の枠）' : `23歳以下のOVR ${r + 1}位`
    console.log(`    ${fmt(c / n * 100, 1).padStart(5)}%  ${label}`)
  }
  ages.sort((a, b) => a - b)
  console.log(`    打診を受けた選手の年齢: 中央 ${ages[Math.floor(ages.length / 2)]}歳 / 最年長 ${ages[ages.length - 1]}歳`)
}

console.log('\n※ 係数（cpuMarket L343 の 0.70 / L345 の 0.25）はまだ触っていません。')
console.log('   どこを変えるか（若手枠を消す／貸出歓迎だけにする／同じ選手への連続を抑える／係数）は')
console.log('   この数字を見てからオーナーが決めます。\n')
