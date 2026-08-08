/**
 * レースの得点（順位ポイント・区間賞ポイント）が1本になっていて、
 * **本編の点はこれまでと1点も変わらない**ことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-race-points.ts --outfile=/tmp/crp.cjs && node /tmp/crp.cjs
 *
 * ■何が2つあったか
 *   順位ポイント  engine/raceEngine → utils/league の positionPointsFor（下限0）
 *                 lib/matchSim      → 自前の rankPoints（下限1）。式は同じで下限だけ違う
 *   区間賞ポイント engine/raceEngine → 常に 3/2/1 を直書き（出走数を見ない）
 *                 lib/matchSim      → 出走数で 3/2/1 → 2/1 → 1 と変える表を自前で持つ
 *   さらに matchSim は simulateRace が返した点を捨てて両方とも計算し直していた。
 *
 * ■決めたこと（オーナー）
 *   ・順位ポイントは 1位＝出走数、2位＝出走数-1、…、最下位＝1点。本編もオンラインも同じ
 *   ・区間賞ポイントは出走数で変える。2チームしかいないのに1位3点はおかしい
 *   ・本編の点は変えない
 *
 * ■なぜ本編が変わらないか
 *   本編で1レースに出る数は全部15以上なので、出走数で変える表でも必ず 3/2/1 になる。
 *   ここではその「全部15以上」を実データから数えて確かめる。
 */
import { positionPointsFor, segmentAwardPoints, DIVISION_SIZE, DIVISIONS } from '../src/utils/league'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

// 本編で1レースに出る数（実データから）
const FIELDS: { name: string; n: number }[] = [
  ...DIVISIONS.map(d => ({ name: `${d}部`, n: DIVISION_SIZE[d] })),
  ...FOREIGN_LEAGUES.map(l => ({ name: l.name, n: l.clubs.length })),
  { name: 'ECL', n: 16 },
  { name: '世界選手権', n: 16 },
  { name: 'アジア予選', n: 21 },
  { name: '大陸予選（アフリカ・欧州・アメリカ）', n: 16 },
]

console.log('[1] 本編の出走数（区間賞が 3/2/1 のままである条件）')
{
  const under15 = FIELDS.filter(f => f.n < 15)
  for (const f of FIELDS) console.log(`  ${f.n >= 15 ? 'ok' : 'NG'}  ${f.name.padEnd(22, '　')} ${f.n}`)
  check('本編のレースはすべて15以上', under15.length === 0,
    under15.map(f => `${f.name}=${f.n}`).join(', '))
}

console.log('')
console.log('[2] 本編の区間賞は これまでと同じ 3/2/1')
{
  let ng = 0
  for (const f of FIELDS) {
    // これまで raceEngine が直書きしていた値
    const before = (rank: number) => rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0
    for (let rank = 1; rank <= f.n; rank++) {
      if (segmentAwardPoints(f.n, rank) !== before(rank)) ng++
    }
  }
  check('全レース・全着順で1点も変わらない', ng === 0, `${ng}件ズレ`)
}

console.log('')
console.log('[3] 順位ポイントは「1位＝出走数、最下位＝1点」')
{
  let ng = 0
  const rows: string[] = []
  for (const n of [2, 4, 8, 16, 20]) {
    const top = positionPointsFor(n, 1)
    const second = positionPointsFor(n, 2)
    const last = positionPointsFor(n, n)
    rows.push(`  ${String(n).padStart(2)}チーム：1位${top} / 2位${second} / 最下位${last}`)
    if (top !== n || second !== n - 1 || last !== 1) ng++
  }
  for (const r of rows) console.log(r)
  check('1位＝出走数、2位＝出走数-1、最下位＝1点', ng === 0, `${ng}件ズレ`)
  check('0点は出ない', [1, 2, 5, 20].every(r => positionPointsFor(20, r) >= 1))
}

console.log('')
console.log('[4] オンラインは人数で区間賞が減る（オーナーの決め）')
{
  const rows = [2, 4, 8, 9, 14, 15].map(n => ({ n, pts: [1, 2, 3].map(r => segmentAwardPoints(n, r)) }))
  for (const r of rows) console.log(`  ${String(r.n).padStart(2)}チーム：${r.pts.join(' / ')}`)
  check('2チームなら1位に1点だけ', segmentAwardPoints(2, 1) === 1 && segmentAwardPoints(2, 2) === 0)
  check('9〜14チームは 2/1', segmentAwardPoints(9, 1) === 2 && segmentAwardPoints(9, 2) === 1 && segmentAwardPoints(9, 3) === 0)
  check('15チーム以上は 3/2/1', segmentAwardPoints(15, 1) === 3 && segmentAwardPoints(15, 2) === 2 && segmentAwardPoints(15, 3) === 1)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 得点のルールは1本。本編の点は変わらず、少人数のときだけ区間賞が減る')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
