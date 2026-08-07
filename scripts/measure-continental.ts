/**
 * 大陸予選（欧州・アフリカ・アメリカ）の通過国が、どのくらい固定されているかを測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-continental.ts --outfile=/tmp/mc.cjs && node /tmp/mc.cjs
 *
 * オーナーから「ずっと遊んでいるがアメリカが本戦に出てきたことがない」という報告があった。
 * いまの大陸予選はレースをせず、国力（上位7人の持ちタイム合計）＋当日ブレ±8% で
 * 順位を決め打ちしている。国力が離れていればブレでは順位が入れ替わらないので、
 * 「毎年同じ4か国が通過する」状態になっていないかを見る。
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { simulateContinentalQualifiers, nationStrength, REGION_QUOTA, ekidenCandidates, autoSelectEkiden } from '../src/engine/worldAthletics'
import { ovr } from '../src/utils/playerUtils'
import { NATIONALITY_META, natGeoRegion } from '../src/data/nationalities'
import type { Nationality, Player, Team } from '../src/types'

const YEAR = 2028
const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...domestic, ...foreign]

const label = (n: Nationality) => NATIONALITY_META[n as keyof typeof NATIONALITY_META]?.label ?? n
const region = (n: Nationality) => {
  const g = natGeoRegion(n)
  return g === 'アジア' || g === 'オセアニア' ? 'アジア+オセアニア' : g
}

console.log(`選手 ${players.length}人（国内 ${domestic.length} / 海外 ${foreign.length}）`)
console.log('')

// ── 国力の並び（これが順位のほぼすべてを決めている）──
const nats = [...new Set(players.filter(p => p.status !== 'retired').map(p => p.nationality))] as Nationality[]
const strength = new Map<Nationality, number>()
for (const n of nats) strength.set(n, nationStrength(players, n, YEAR))

for (const { region: rg, slots } of REGION_QUOTA) {
  if (rg === 'アジア+オセアニア') continue
  const rows = nats.filter(n => region(n) === rg && (strength.get(n) ?? 0) > 0)
    .sort((a, b) => (strength.get(b) ?? 0) - (strength.get(a) ?? 0))
  console.log(`【${rg}】${rows.length}か国 / 通過${slots}`)
  rows.forEach((n, i) => {
    const s = strength.get(n) ?? 0
    console.log(`  ${String(i + 1).padStart(2)}. ${label(n).padEnd(10, '　')} ${s.toFixed(3)}${i + 1 === slots ? '   ← ここまで通過' : ''}`)
  })
  console.log('')
}

// ── 100回まわして通過率を見る ──
const TRIES = 100
const advCount = new Map<Nationality, number>()
for (let i = 0; i < TRIES; i++) {
  for (const c of simulateContinentalQualifiers(players, YEAR)) {
    for (const n of c.advanced) advCount.set(n, (advCount.get(n) ?? 0) + 1)
  }
}
console.log(`同じ選手のまま ${TRIES}回まわしたときの通過率`)
for (const { region: rg, slots } of REGION_QUOTA) {
  if (rg === 'アジア+オセアニア') continue
  const rows = [...advCount.entries()].filter(([n]) => region(n) === rg).sort((a, b) => b[1] - a[1])
  const always = rows.filter(([, c]) => c === TRIES).length
  console.log(`  【${rg}】通過${slots} / 100%通過が${always}か国`)
  for (const [n, c] of rows) console.log(`     ${label(n).padEnd(10, '　')} ${(c / TRIES * 100).toFixed(0)}%`)
}

// ── 実際に走らせたら差が付くのか（代表20人の強さ）──
// 上の国力は 6.73〜6.90 に潰れていて、当日ブレ±8% のほうがはるかに大きい。
// レースは選手の能力そのもので決まるので、代表20人の強さに差があるなら races は効く。
console.log('')
console.log('代表20人の平均OVR（レースはこれで決まる）')
for (const { region: rg, slots } of REGION_QUOTA) {
  if (rg === 'アジア+オセアニア') continue
  const rows = nats.filter(n => region(n) === rg && (strength.get(n) ?? 0) > 0).map(n => {
    const squad = autoSelectEkiden(ekidenCandidates(players, n, YEAR), new Set<string>(), 20)
    return { n, avg: squad.reduce((s, p) => s + ovr(p), 0) / Math.max(1, squad.length), size: squad.length }
  }).sort((a, b) => b.avg - a.avg)
  console.log(`  【${rg}】通過${slots}`)
  rows.forEach((r, i) => console.log(`     ${String(i + 1).padStart(2)}. ${label(r.n).padEnd(10, '\u3000')} ${r.avg.toFixed(1)}  (${r.size}人)${i + 1 === slots ? '  ← ここまで' : ''}`))
}
