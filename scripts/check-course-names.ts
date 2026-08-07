/**
 * コースの呼び名（地域ごと100本）が抜けていないか、かぶっていないかを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-course-names.ts --outfile=/tmp/ccn.cjs && node /tmp/ccn.cjs
 *
 * コースの中身（区間の距離・登り・下り）は25本のまま。呼び名だけを地域ごとに持つ。
 * 1本でも抜けると、そこだけ国内の名前のまま（「アメリカ予選 大阪カップ」）に戻るので、
 * 抜けは機械で見つける。あわせて
 *   ・同じ地域で2本のコースが同じ名前になっていないか（記録が混ざる）
 *   ・国内・ECLの名前とかぶっていないか（別の大会の記録に混ざる）
 *   ・地形の性格（山岳・スプリント・ファイナル）が名前と食い違っていないか
 * も見る。
 */
import { COURSE_NAME_TABLE, courseNameFor, courseRegionOfNation, localizeRace, type CourseRegion } from '../src/data/courseNames'
import { LEAGUE_COURSE_POOL, FINAL_COURSES } from '../src/data/races'
import { ECL_COURSES } from '../src/data/eclCourses'
import type { Race } from '../src/types'

const ALL = [...LEAGUE_COURSE_POOL, ...FINAL_COURSES]
const REGIONS = Object.keys(COURSE_NAME_TABLE) as Exclude<CourseRegion, 'domestic'>[]
const problems: string[] = []

console.log(`国内のコース ${ALL.length}本 × 地域${REGIONS.length} = ${ALL.length * REGIONS.length}本の呼び名`)
console.log('')

// ── 抜けとかぶり ──
const domesticNames = new Set(ALL.map(c => c.name))
const eclNames = new Set(ECL_COURSES.map(c => c.name))
const seenAll = new Map<string, string>()   // 呼び名 → どこで使ったか
for (const region of REGIONS) {
  const table = COURSE_NAME_TABLE[region]
  const missing = ALL.filter(c => !table[c.name])
  if (missing.length > 0) problems.push(`${region}: ${missing.length}本ぶんの呼び名が無い（${missing.map(c => c.name).join('/')}）`)
  const extra = Object.keys(table).filter(n => !domesticNames.has(n))
  if (extra.length > 0) problems.push(`${region}: 存在しないコースの行がある（${extra.join('/')}）`)

  const used = new Set<string>()
  for (const [from, to] of Object.entries(table)) {
    if (used.has(to)) problems.push(`${region}: 「${to}」が2本のコースに付いている`)
    used.add(to)
    if (domesticNames.has(to)) problems.push(`${region}: 「${to}」は国内のコース名と同じ`)
    if (eclNames.has(to)) problems.push(`${region}: 「${to}」はECLのコース名と同じ`)
    const prev = seenAll.get(to)
    if (prev) problems.push(`「${to}」が ${prev} と ${region} で重複`)
    seenAll.set(to, `${region}(${from})`)
  }
}
console.log(`呼び名の総数 ${seenAll.size}本（重複なしなら ${ALL.length * REGIONS.length}）`)

// ── 地形の性格と名前が合っているか ──
// 山岳（平均の登りが15%以上）は「山」「アルペン」「マウンテン」「アンデス」等が入っているべき。
// 逆に平坦（3%未満）に山の言葉が入っていないこと。
const MOUNTAIN_WORDS = /山|アルペン|マウンテン|アンデス|ロッキー|アトラス|モンブラン|ピレネー|ドロミテ|キリマンジャロ|シミエン|天山|カトマンズ|キト|アルマトイ/
const FLAT_WORDS = /スプリント|カップ/
console.log('')
console.log('地形と呼び名の食い違い')
let mism = 0
for (const c of ALL) {
  const up = c.segments.reduce((s, x) => s + x.uphillPct, 0) / c.segments.length
  for (const region of REGIONS) {
    const name = courseNameFor(c.name, region)
    if (up >= 15 && !MOUNTAIN_WORDS.test(name)) { problems.push(`${region}: 山岳コース「${c.name}」が「${name}」（山の言葉が無い）`); mism++ }
    if (up < 3 && MOUNTAIN_WORDS.test(name) && !FLAT_WORDS.test(name)) { problems.push(`${region}: 平坦コース「${c.name}」が「${name}」（山の言葉が入っている）`); mism++ }
  }
}
console.log(`  ${mism}件`)

// ── 引き当ての動き ──
console.log('')
console.log('国籍から地域を引く')
const cases: [string, CourseRegion][] = [['JPN', 'domestic'], ['KEN', 'africa'], ['GBR', 'europe'], ['USA', 'america'], ['KOR', 'asia'], ['AUS', 'asia']]
for (const [nat, want] of cases) {
  const got = courseRegionOfNation(nat as Parameters<typeof courseRegionOfNation>[0])
  console.log(`  ${nat} → ${got}${got === want ? '' : `  ✗ ${want} のはず`}`)
  if (got !== want) problems.push(`${nat} の地域が ${got}（${want} のはず）`)
}

const sample: Race = {
  id: 'r1', name: '富士山岳駅伝', date: '2029-04-01', location: '富士山', type: 'league',
  segments: [{ index: 1, distanceKm: 10, uphillPct: 30, downhillPct: 30 }],
  conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
}
console.log('')
console.log('レースの差し替え（中身は変えない）')
for (const region of REGIONS) {
  const r = localizeRace(sample, region)
  console.log(`  ${region}: ${r.name}`)
  if (r.segments !== sample.segments) problems.push(`${region}: 区間まで作り直している`)
  if (r.id !== sample.id) problems.push(`${region}: レースIDが変わっている`)
  if (r.location !== '') problems.push(`${region}: 国内の開催地が残っている（${r.location}）`)
}
if (localizeRace(sample, 'domestic') !== sample) problems.push('国内はそのまま返すべき')

console.log('')
if (problems.length === 0) {
  console.log('✓ 100本すべて埋まっていて、名前のかぶりも地形との食い違いも無い')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
for (const p of problems.slice(0, 30)) console.log(`  ${p}`)
process.exit(1)
