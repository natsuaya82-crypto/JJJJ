/**
 * 【計測】代表候補の枠（NATIONAL_POOL）を決めるための材料を1枚に出す。
 *   npx esbuild --bundle --platform=node --format=cjs --log-level=error scripts/measure-national-pool.ts --outfile=/tmp/mn.cjs && node /tmp/mn.cjs
 *
 * ■なぜ測るのか
 *   「アジア予選に参加できない人がいる」という指摘。
 *   `engine/worldAthletics.ts` の `ekidenCandidates` は日本人を **OVR上位
 *   NATIONAL_POOL(=100) 人**で切っていて、101位以下は選考画面に**そもそも出ない**。
 *   日本人は1000人以上いるので、大半の選手は代表候補にすらならない。
 *
 *   枠をいくつにするかはオーナーが決める。決めるための材料を出すのがここ。
 *   オーナー指定の5項目： 日本人総数 / OVR分布 / 代表20人 / 選外 / 年代別分布
 *
 * ■npm run check には繋がない（数を主張する点検ではなく、材料を見る道具）。
 *   世界の作り方は scripts/check-national-pool.ts と同じ。
 */
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import {
  ekidenCandidates, autoSelectEkiden, individualStarIds, NATIONAL_POOL,
} from '../src/engine/worldAthletics'
import { HOME_NATION } from '../src/data/nationalities'
import { ovr } from '../src/utils/playerUtils'
import { divisionOf } from '../src/utils/league'
import { tierOf } from '../src/utils/clubTier'
import type { Player, Team } from '../src/types'

const YEAR = 2039   // 奇数年＝アジア予選の年
const SQUAD = 20

const teams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const domestic = generateCpuRosters(teams, YEAR).cpuPlayers
const { players: foreign } = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const players: Player[] = [...domestic, ...foreign]

const jp = players.filter(p => p.nationality === HOME_NATION && p.status !== 'retired')
const jpSorted = [...jp].sort((a, b) => ovr(b) - ovr(a))
const pct = (n: number, d: number) => `${(n / d * 100).toFixed(1)}%`
const bar = (n: number, max: number, w = 28) => '█'.repeat(Math.max(0, Math.round(n / max * w)))

const teamById = new Map(teams.map(t => [t.id, t]))
const foreignClubIds = new Set(FOREIGN_LEAGUES.flatMap(l => l.clubs).map(c => c.id))
const whereOf = (p: Player) =>
  foreignClubIds.has(p.teamId) ? '海外'
  : teamById.has(p.teamId) ? `${divisionOf(teamById.get(p.teamId))}部`
  : '無所属'

console.log(`\n════ 代表候補の枠を決めるための材料（${YEAR}年・生成直後の世界）════`)
console.log(`いまの NATIONAL_POOL = ${NATIONAL_POOL}\n`)

// ── ① 日本人総数 ────────────────────────────────────────────
console.log('① 日本人（引退を除く）の総数と居場所')
{
  const byWhere = new Map<string, number>()
  for (const p of jp) byWhere.set(whereOf(p), (byWhere.get(whereOf(p)) ?? 0) + 1)
  console.log(`   合計 ${jp.length}人`)
  for (const k of ['1部', '2部', '3部', '海外', '無所属']) {
    const n = byWhere.get(k) ?? 0
    if (n > 0) console.log(`     ${k.padEnd(4)} ${String(n).padStart(5)}人  ${pct(n, jp.length)}`)
  }
  console.log(`   → いまの枠 ${NATIONAL_POOL} 人は、日本人全体の ${pct(NATIONAL_POOL, jp.length)}`)
}

// ── ② OVR分布 ──────────────────────────────────────────────
console.log('\n② OVRの分布（5刻み）と、枠がどこで切れているか')
{
  const cut = ovr(jpSorted[Math.min(NATIONAL_POOL, jpSorted.length) - 1])
  const buckets = new Map<number, number>()
  for (const p of jp) {
    const b = Math.floor(ovr(p) / 5) * 5
    buckets.set(b, (buckets.get(b) ?? 0) + 1)
  }
  const max = Math.max(...buckets.values())
  for (const b of [...buckets.keys()].sort((a, b2) => b2 - a)) {
    const n = buckets.get(b)!
    const mark = b <= cut && cut < b + 5 ? `  ← ここで ${NATIONAL_POOL} 人目（OVR${cut}）` : ''
    console.log(`   ${b}〜${b + 4}  ${String(n).padStart(5)}人 ${bar(n, max)}${mark}`)
  }
  console.log(`   → 枠 ${NATIONAL_POOL} 人の境目は OVR${cut}。これ未満は選考画面に出ない`)
  for (const n of [20, 50, 100, 200, 300, 500, jp.length]) {
    const k = Math.min(n, jpSorted.length)
    console.log(`     枠を ${String(n).padStart(4)} 人にすると 境目 OVR${ovr(jpSorted[k - 1])}（全体の ${pct(k, jp.length)}）`)
  }
}

// ── ③ 代表20人 ─────────────────────────────────────────────
console.log('\n③ いまの枠で選ばれる代表20人（おまかせ＝autoSelectEkiden）')
{
  const cands = ekidenCandidates(players, HOME_NATION, YEAR)
  const stars = individualStarIds(players, HOME_NATION, YEAR)
  const squad = autoSelectEkiden(cands, stars, SQUAD)
  const os = squad.map(ovr)
  console.log(`   OVR ${Math.max(...os)} 〜 ${Math.min(...os)}（中央 ${os.sort((a, b) => b - a)[Math.floor(os.length / 2)]}）`)
  const byWhere = new Map<string, number>()
  const byAge = new Map<number, number>()
  for (const p of squad) {
    byWhere.set(whereOf(p), (byWhere.get(whereOf(p)) ?? 0) + 1)
    byAge.set(p.age, (byAge.get(p.age) ?? 0) + 1)
  }
  console.log(`   居場所 ${[...byWhere.entries()].map(([k, v]) => `${k}${v}人`).join(' / ')}`)
  console.log(`   年齢   ${[...byAge.entries()].sort((a, b) => a[0] - b[0]).map(([a, v]) => `${a}歳${v}`).join(' ')}`)
  console.log(`   個人種目の代表として除いた人数 ${stars.size}人`)
  // 枠を広げたら20人の顔ぶれは変わるのか
  for (const limit of [100, 300, 1000]) {
    const s2 = autoSelectEkiden(ekidenCandidates(players, HOME_NATION, YEAR, limit), stars, SQUAD)
    const same = s2.filter(p => squad.some(q => q.id === p.id)).length
    console.log(`     枠 ${String(limit).padStart(4)} 人だと 20人中 ${same} 人が同じ顔ぶれ`)
  }
}

// ── ④ 選外 ─────────────────────────────────────────────────
console.log('\n④ 選外（枠に入れない選手）はどんな人か')
{
  const inPool = new Set(ekidenCandidates(players, HOME_NATION, YEAR).map(c => c.player.id))
  const out = jp.filter(p => !inPool.has(p.id))
  const os = [...out].map(ovr).sort((a, b) => b - a)
  console.log(`   ${out.length}人（日本人の ${pct(out.length, jp.length)}）`)
  console.log(`   OVR 最高 ${os[0]} / 中央 ${os[Math.floor(os.length / 2)]} / 最低 ${os[os.length - 1]}`)
  const byWhere = new Map<string, number>()
  for (const p of out) byWhere.set(whereOf(p), (byWhere.get(whereOf(p)) ?? 0) + 1)
  console.log(`   居場所 ${[...byWhere.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${v}人`).join(' / ')}`)
  // 選外なのに「1部のレギュラー級」が居るか＝遊ぶ側が納得しにくいところ
  const top1 = out.filter(p => whereOf(p) === '1部' && ovr(p) >= 75)
  console.log(`   うち「1部所属でOVR75以上」なのに選外 … ${top1.length}人`)
  if (top1.length > 0) {
    console.log(`     例: ${top1.sort((a, b) => ovr(b) - ovr(a)).slice(0, 5).map(p => `${p.name}(${p.age}歳 OVR${ovr(p)} 格${tierOf(teamById.get(p.teamId))})`).join(' / ')}`)
  }
}

// ── ⑤ 年代別 ───────────────────────────────────────────────
console.log('\n⑤ 年代別の分布（全体 と 枠の中）')
{
  const inPool = new Set(ekidenCandidates(players, HOME_NATION, YEAR).map(c => c.player.id))
  const band = (a: number) => a <= 21 ? '〜21' : a <= 24 ? '22-24' : a <= 27 ? '25-27' : a <= 30 ? '28-30' : a <= 33 ? '31-33' : '34〜'
  const all = new Map<string, number>()
  const inn = new Map<string, number>()
  for (const p of jp) {
    all.set(band(p.age), (all.get(band(p.age)) ?? 0) + 1)
    if (inPool.has(p.id)) inn.set(band(p.age), (inn.get(band(p.age)) ?? 0) + 1)
  }
  console.log('   年代     全体        枠の中      枠に入る割合')
  for (const b of ['〜21', '22-24', '25-27', '28-30', '31-33', '34〜']) {
    const a = all.get(b) ?? 0
    const i = inn.get(b) ?? 0
    if (a === 0) continue
    console.log(`   ${b.padEnd(6)} ${String(a).padStart(5)}人   ${String(i).padStart(4)}人      ${pct(i, a)}`)
  }
}

console.log('\n※ NATIONAL_POOL の値は変えていません。数字はオーナーが決めます。')
console.log('※ 別件：選考画面(NationalSquadSelectPage.tsx:53-58)は、去年選んだ選手が')
console.log('   枠から落ちると黙って枠から消えます。枠の数字とは無関係の話なので BACKLOG へ。\n')
