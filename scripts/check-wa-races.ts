/**
 * 世界大会の走行記録を worldAthleticsResults からシーズン側（waRaces）へ移しても、
 * 記録が1本も消えず、二重にも数えられないことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-wa-races.ts --outfile=/tmp/cwr.cjs && node /tmp/cwr.cjs
 *
 * worldAthleticsResults は普段のセーブに入りっぱなしで、状態が変わるたび丸ごと書き直される。
 * そこに走行記録を置くと大会のたびに数十KBずつ増え続けるので、他のレースと同じく
 * シーズン側へ置いて1年に1回だけ別ファイルへ出す。
 * ただし**いま遊んでいるセーブには古い置き場所のまま記録が入っている**ので、
 * 読む側（utils/waRaces）は新旧どちらも見る。ここではその3点を見る。
 *   1. 古いセーブ（結果側に記録がある）でも全部読めるか
 *   2. 移したあと（シーズン側にある）でも同じ数だけ読めるか
 *   3. 両方に入っている年を二重に数えないか
 */
import { waRaceRows, WA_LABEL_BY_CODE } from '../src/utils/waRaces'
import type { Race } from '../src/types'

const race = (id: string, pid: string): Race => ({
  id, name: `${id}大会`, date: '2029-01-09', location: '', type: 'league',
  segments: [{ index: 1, distanceKm: 10, uphillPct: 0, downhillPct: 0 }],
  results: {
    teamRankings: [{ teamId: 'nat_USA', totalTimeSec: 1800, rank: 1, positionPoints: 16, segmentPoints: 3 }],
    segmentResults: [{ segmentIndex: 1, runners: [{ playerId: pid, teamId: 'nat_USA', timeSec: 1800, rank: 1 }] }],
  },
})

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

// ── 1. 古いセーブ：結果の側にだけ記録がある ──
console.log('[1] 古いセーブ（worldAthleticsResults[].races）')
{
  const seasons = [{ year: 2028 }, { year: 2029 }]
  const results = [
    { year: 2028, kind: 'main' as const, races: [race('m1', 'p1'), race('m2', 'p1')] },
    { year: 2029, kind: 'qualifier' as const, races: [race('q1', 'p1')] },
  ]
  const rows = waRaceRows(seasons, results)
  check('3戦とも読める', rows.length === 3, `${rows.length}戦`)
  check('本戦の大会名が付く', rows.some(r => r.label === WA_LABEL_BY_CODE.main))
  check('アジア予選の大会名が付く', rows.some(r => r.label === WA_LABEL_BY_CODE.asia))
}

// ── 2. 移したあと：シーズンの側にある ──
console.log('[2] 移したあと（Season.waRaces）')
{
  const seasons = [
    { year: 2028, waRaces: { main: [race('m1', 'p1'), race('m2', 'p1')] } },
    { year: 2029, waRaces: { asia: [race('q1', 'p1')], ame: [race('a1', 'p1'), race('a2', 'p1')] } },
  ]
  const results = [
    { year: 2028, kind: 'main' as const },
    { year: 2029, kind: 'qualifier' as const },
  ]
  const rows = waRaceRows(seasons, results)
  check('本戦とアジア予選が読める', rows.filter(r => r.code === 'main' || r.code === 'asia').length === 3)
  check('大陸予選も同じ入口から読める', rows.filter(r => r.code === 'ame').length === 2)
  check('大陸予選に大会名が付く', rows.some(r => r.label === WA_LABEL_BY_CODE.ame), rows.map(r => r.label).join('/'))
}

// ── 3. 両方に入っている年（移行の途中）を二重に数えない ──
console.log('[3] 新旧の両方に入っている年')
{
  const seasons = [{ year: 2028, waRaces: { main: [race('m1', 'p1'), race('m2', 'p1')] } }]
  const results = [{ year: 2028, kind: 'main' as const, races: [race('m1', 'p1'), race('m2', 'p1')] }]
  const rows = waRaceRows(seasons, results)
  check('2戦のまま（二重に数えない）', rows.length === 2, `${rows.length}戦`)
}

// ── 4. 結果が入っていないレースは返さない ──
console.log('[4] 走っていないレース')
{
  const empty: Race = { ...race('x1', 'p1'), results: undefined }
  const rows = waRaceRows([{ year: 2030, waRaces: { asia: [empty] } }], [])
  check('走っていないレースは履歴に出さない', rows.length === 0, `${rows.length}戦`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 新旧どちらの置き場所からも同じだけ読め、二重にも数えない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
