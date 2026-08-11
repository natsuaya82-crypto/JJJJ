/**
 * 世界選手権のコースが本編と同じものになり、年をまたいで同じコースが再登場することを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-world-courses.ts --outfile=/tmp/cwc.cjs && node /tmp/cwc.cjs
 *
 * 以前は開催国の地形に合わせて毎年その場で区間をランダムに作っていた。
 * コースが二度と同じにならないので、区間記録（大会名＋区番号で貯まる）が1年で使い捨てだった。
 * 本編のコースを使えば、コースの数は増えないのに記録だけが貯まる。
 */
import { worldRacePlans, worldRaceName } from '../src/utils/worldCourses'
import { LEAGUE_COURSE_POOL, FINAL_COURSES } from '../src/data/races'

const ALL = [...LEAGUE_COURSE_POOL, ...FINAL_COURSES]
const byName = new Map(ALL.map(c => [c.name, c]))
const YEARS = 20
const problems: string[] = []

console.log(`本編のコース ${ALL.length}本（プール${LEAGUE_COURSE_POOL.length} + ファイナル${FINAL_COURSES.length}）`)
console.log('')

const nameCount = new Map<string, number>()
for (let y = 2028; y < 2028 + YEARS; y++) {
  const isMain = (y - 2028) % 2 === 0
  const plans = worldRacePlans(y, isMain ? 'mixed' : 'mixed')
  if (plans.length !== 3) problems.push(`${y}年: 3戦ぶん出ていない（${plans.length}）`)
  const names = plans.map(p => p.courseName ?? '(名前なし)')
  if (new Set(names).size !== names.length) problems.push(`${y}年: 同じコースを2回引いている ${names.join(' / ')}`)
  for (const p of plans) {
    const c = p.courseName ? byName.get(p.courseName) : undefined
    if (!c) { problems.push(`${y}年: 本編に無いコース ${p.courseName}`); continue }
    // 区間が本編とぴったり同じか（地形が違えばタイムも比べられない）
    if (c.segments.length !== p.segments.length) problems.push(`${y}年 ${c.name}: 区間数が違う`)
    c.segments.forEach((s, i) => {
      const q = p.segments[i]
      if (!q || s.distanceKm !== q.distanceKm || s.uphillPct !== q.uphillPct || s.downhillPct !== q.downhillPct) {
        problems.push(`${y}年 ${c.name} 第${i + 1}区: 地形が本編と違う`)
      }
    })
    // worldRaceName は (下書き, 大会名, 名前なしのときの代わり, 地域) の4つ。
    // 地域を渡さないと NAMES[undefined] を引いて落ちる（3つで呼んでいて落ちていた）。
    // ここで見たいのは「同じコースが同じ名前で貯まるか」なので、地域は国内で固定する
    const key = worldRaceName(p, isMain ? '世界選手権' : '世界選手権アジア予選', 'fallback', 'domestic')
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1)
  }
  // 同じ年なら何度呼んでも同じ組
  const again = worldRacePlans(y, 'mixed').map(p => p.courseName).join('|')
  if (again !== names.join('|')) problems.push(`${y}年: 呼ぶたびに違う組になる`)
}

// 記録が貯まるか＝同じレース名が複数の年に出てくるか
const repeated = [...nameCount.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1])
console.log(`${YEARS}年ぶんで出た大会名 ${nameCount.size}種類`)
console.log(`  うち2回以上出たもの ${repeated.length}種類（＝区間記録が貯まる）`)
for (const [name, n] of repeated.slice(0, 6)) console.log(`    ${name}  ${n}回`)
console.log('')
console.log('名前に年と開催地が入っていないか')
const hasYear = [...nameCount.keys()].some(n => /\d{4}/.test(n))
console.log(`  ${hasYear ? '✗ 年が入っている（毎年別の記録表になる）' : 'OK（年は入っていない）'}`)
console.log('')

if (problems.length === 0 && repeated.length > 0 && !hasYear) {
  console.log('✓ 本編とまったく同じコースを使い、同じ大会名が年をまたいで再登場する')
  process.exit(0)
}
if (problems.length > 0) {
  console.log(`✗ ${problems.length}件の問題`)
  for (const p of problems.slice(0, 20)) console.log(`  ${p}`)
}
if (repeated.length === 0) console.log('✗ 同じ大会名が二度と出てこない（記録が貯まらない）')
process.exit(1)
