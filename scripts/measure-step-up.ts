/**
 * 「移籍の大きさ」を格1本にした影響を測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-step-up.ts --outfile=/tmp/msu.cjs && node /tmp/msu.cjs
 *
 * 旧：同じ問いに3つの物差しがあった
 *   ・4大リーグのID（手書き4件）… 自チームが送り出したときの見出しと実績
 *   ・格1〜4（DOMESTIC_TOP_TIER より上）… 裏で動いた日本→海外の見出し
 *   ・格1 … ニュースの大扱い（major）
 * 新：絶対＝isBigClub（格2以上）／相対＝isStepUp（行き先の格 < 今のクラブの格）の2本。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { allForeignClubs } from '../src/utils/clubs'
import { tierOf, isBigClub, isStepUp, BIG_CLUB_TIER } from '../src/utils/clubTier'
import { leaguesOfRegion, regionOfLeague } from '../src/utils/transferDecision'
import { divisionOf } from '../src/utils/league'
import { transferCapOf } from '../src/data/economy'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr, calcTransferValue } from '../src/utils/playerUtils'
import { tierBudget } from '../src/utils/clubTier'
import type { Team } from '../src/types'

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const clubs = allForeignClubs(FOREIGN_LEAGUES)
const leagueIdOf = (id: string) => FOREIGN_LEAGUES.find(l => l.clubs.some(c => c.id === id))?.id ?? ''

// 旧の物差し（比較用にここだけ残す）
const OLD_ELITE = new Set(['africa_east', 'africa_ns', 'europe_ws', 'north_america'])
const OLD_ELITE_BY_REGION: Record<string, string[]> = {
  africa: ['africa_east', 'africa_ns'], europe: ['europe_ws'], america: ['north_america'],
}
const OLD_STRONG = (id: string) => tierOf(clubs.find(c => c.id === id)) < 5

console.log('[1] ビッグクラブの線（海外180クラブ・初期値）')
{
  const byTier = new Map<number, number>()
  for (const c of clubs) byTier.set(tierOf(c), (byTier.get(tierOf(c)) ?? 0) + 1)
  const n1 = byTier.get(1) ?? 0
  const n2 = byTier.get(2) ?? 0
  const strong = clubs.filter(c => OLD_STRONG(c.id)).length
  console.log(`  格1        ${String(n1).padStart(3)}クラブ  ← 旧 isBigClub（major の判定）`)
  console.log(`  格1〜2     ${String(n1 + n2).padStart(3)}クラブ  ← 新 isBigClub（格${BIG_CLUB_TIER}以上）`)
  console.log(`  格1〜4     ${String(strong).padStart(3)}クラブ  ← 旧 isStrongDest（裏の日本→海外の見出し）`)
  const oldEliteClubs = clubs.filter(c => OLD_ELITE.has(leagueIdOf(c.id)))
  console.log(`  4大リーグ  ${String(oldEliteClubs.length).padStart(3)}クラブ  ← 旧 isEliteLeague（自チームの見出しと実績）`)
  const et = oldEliteClubs.map(c => tierOf(c)).sort((a, b) => a - b)
  console.log(`             （その格の幅は ${et[0]}〜${et[et.length - 1]}。格9のクラブまで「世界最高峰」だった）`)
  const missed = clubs.filter(c => !OLD_ELITE.has(leagueIdOf(c.id)) && tierOf(c) <= BIG_CLUB_TIER)
  console.log(`  → 4大リーグ外なのに格${BIG_CLUB_TIER}以上のクラブ ${missed.length}件（旧は最高峰扱いされなかった）`)
}

console.log('')
console.log('[2] 憧れの地域からオファーが来る発生源')
{
  for (const region of ['africa', 'europe', 'america'] as const) {
    const oldLeagues = OLD_ELITE_BY_REGION[region]
    const newLeagues = leaguesOfRegion(region)
    const oldN = clubs.filter(c => oldLeagues.includes(leagueIdOf(c.id))).length
    const newN = clubs.filter(c => newLeagues.includes(leagueIdOf(c.id))).length
    const added = newLeagues.filter(l => !oldLeagues.includes(l))
    console.log(`  ${region.padEnd(7)} ${String(oldN).padStart(3)}クラブ → ${String(newN).padStart(3)}クラブ` +
      (added.length ? `（+${added.join(' / ')}）` : '（変わらず）'))
  }
  // 「憧れは満たすのに声が掛からない」リーグが消えたか
  const orphan = FOREIGN_LEAGUES.filter(l => {
    const r = regionOfLeague(l.id)
    return r && !OLD_ELITE_BY_REGION[r].includes(l.id)
  })
  console.log(`  → 旧は「移籍すれば憧れが満たされるのに、発生源ではない」リーグが ${orphan.length}件あった：${orphan.map(l => l.id).join(' / ')}`)
}

console.log('')
console.log('[3] 発生源が増えたぶん、格下からも声が掛かるようになるか')
{
  // 1部の中位（格8）の選手が海外挑戦に登録した場合で見る
  const me = teams.find(t => tierOf(t) === 8) ?? teams[0]
  console.log(`  自チーム ${me.shortName}（${divisionOf(me)}部・格${tierOf(me)}）から見て`)
  // 夢のオファーは市場価値の1.1倍以上を出せるクラブしか出せない（gameStore の 1a と同じ式）
  const capOf = (c: { id: string; tier?: number }) => transferCapOf(tierBudget(c as never), tierBudget(c as never))
  // 実際の選手で測る（推測の金額を使わない）
  const { cpuPlayers } = generateCpuRosters(teams, 2030)
  const pick = (lo: number, hi: number) => cpuPlayers.filter(p => ovr(p) >= lo && ovr(p) <= hi && p.age >= 25 && p.age <= 28)[0]
  for (const sample of [pick(84, 88), pick(76, 79)].filter(Boolean)) {
    const need = calcTransferValue(sample) * 1.1
    console.log(`  ── OVR${ovr(sample)}・${sample.age}歳（移籍金のめやす ${(calcTransferValue(sample) / 100_000_000).toFixed(2)}億／夢の最低提示 ${(need / 100_000_000).toFixed(2)}億）`)
    for (const region of ['africa', 'europe', 'america'] as const) {
      const src = clubs.filter(c => leaguesOfRegion(region).includes(leagueIdOf(c.id)))
      const up = src.filter(c => isStepUp(me, c)).length
      const big = src.filter(c => isBigClub(c)).length
      const pay = src.filter(c => capOf(c) >= need)
      const payUp = pay.filter(c => isStepUp(me, c)).length
      console.log(`  ${region.padEnd(7)} 発生源${String(src.length).padStart(3)}  ステップアップ ${String(up).padStart(3)}  ビッグ ${String(big).padStart(2)}  格下 ${String(src.length - up).padStart(2)}  → 実際に払える ${String(pay.length).padStart(2)}（うち格上 ${payUp}）`)
    }
  }
  console.log('  ※格下からのオファーは来るが、本人の同意（appraiseMove の tier_down）で止まる')
  console.log('  ※発生源はどこも払える（格1〜10のリーグしか入らない）ので、金額でオファーが消えることはない')
}

console.log('')
console.log('[4] 見出しが3段階に分かれるか（自チームが海外へ売ったとき）')
{
  for (const myTier of [5, 8, 11, 16, 20]) {
    const me = { id: 'x', tier: myTier as never }
    const big = clubs.filter(c => isBigClub(c)).length
    const step = clubs.filter(c => !isBigClub(c) && isStepUp(me, c)).length
    console.log(`  自チーム格${String(myTier).padStart(2)}  世界へ挑戦 ${String(big).padStart(2)}  ステップアップ ${String(step).padStart(3)}  ただの海外移籍 ${String(clubs.length - big - step).padStart(3)}`)
  }
  console.log('  （旧は「4大リーグの80クラブ＝世界へ挑戦／残り100＝ただの海外移籍」の2段階で、自チームの格を見ていなかった）')
}

console.log('')
console.log('[5] 裏で動いた日本→海外（52クラブそれぞれから見た「格上の海外クラブ」）')
{
  let oldTotal = 0, newTotal = 0
  const rows: string[] = []
  for (const t of teams) {
    const oldN = clubs.filter(c => OLD_STRONG(c.id)).length
    const newN = clubs.filter(c => isStepUp(t, c)).length
    oldTotal += oldN; newTotal += newN
    if ([5, 11, 16, 20].includes(tierOf(t)) && rows.length < 5) rows.push(`  ${t.shortName.padEnd(6)} ${divisionOf(t)}部 格${String(tierOf(t)).padStart(2)}  旧 ${String(oldN).padStart(3)} → 新 ${String(newN).padStart(3)}`)
  }
  rows.forEach(r => console.log(r))
  console.log(`  合計（52クラブ）  旧 ${oldTotal} → 新 ${newTotal}`)
  console.log('  → 旧は全クラブ一律。3部（格20）の選手が格12のクラブへ渡っても「格上」と書かれなかった')
}

console.log('')
console.log('✓ 絶対＝isBigClub（格2以上）／相対＝isStepUp。憧れの行き先は leaguesOfRegion 1本')
