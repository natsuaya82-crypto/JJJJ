/**
 * 【オンライン対戦の通算得点】数え方が1本であること。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-online-series.ts \
 *     --outfile=node_modules/.cache/check-os.cjs --log-level=error && node node_modules/.cache/check-os.cjs
 *
 * ■なぜ要るのか
 *   同じ「これまでの通算得点」の数え方が**3か所**にありました。
 *
 *     ① 結果が届くたびに「1つ前のレースぶん」を足す（画面・ref で前回を覚える）
 *     ② 再入室したときに `races.slice(0, -1)` を合計する（同じ画面の別の場所）
 *     ③ 最終結果は `seriesStandings` が全レースを合計する
 *
 *   ①だけ**受け取った順に依存**します。再接続で1戦ぶん取りこぼすと、その回の得点が
 *   永久に入らないまま進み、②③とだけ静かに食い違います。走行中の画面に出る
 *   「ここまでの合計」と、最終結果の表が合わない、という形で出ます。
 *
 *   いまは `lib/matchSim` の `seriesPointsBefore` 1本で、**配列から毎回数え直します**。
 *
 * ■ここで見ること
 *   1. 順番に依存しないこと（並べ替えても同じ）
 *   2. 今走っているレースは含まないこと
 *   3. 抜けがあっても、届いているぶんは正しく入ること
 *   4. 最後のレースまで足したものが `seriesStandings` の合計と一致すること
 *   5. 画面が自分で足し算していないこと
 */
import { readFileSync } from 'node:fs'
import { seriesPointsBefore, seriesStandings, type MatchRacePayload } from '../src/lib/matchSim'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** 3チーム・3レース。得点は回ごとに変える（合計を取り違えたら必ず数字が変わるように） */
const race = (n: number, pts: [number, number, number]): MatchRacePayload => ({
  race: n, courseId: `c${n}`, startAt: 0,
  teams: [], runners: [], segments: [], forfeits: [],
  standings: (['a', 'b', 'c'] as const).map((id, i) => ({
    teamId: id, totalTimeSec: 3000 + i, rank: i + 1, segPts: 0, points: pts[i],
  })),
} as unknown as MatchRacePayload)

const R0 = race(0, [10, 6, 3])
const R1 = race(1, [5, 9, 2])
const R2 = race(2, [4, 1, 8])
const all = [R0, R1, R2]

console.log('[1] 順番に依存しない')
{
  const a = seriesPointsBefore([R0, R1, R2], 2)
  const b = seriesPointsBefore([R2, R0, R1], 2)
  const c = seriesPointsBefore([R1, R2, R0], 2)
  check('並べ替えても同じ', JSON.stringify(a) === JSON.stringify(b) && JSON.stringify(a) === JSON.stringify(c),
    `${JSON.stringify(a)} / ${JSON.stringify(b)} / ${JSON.stringify(c)}`)
  check('中身も合っている（R0+R1）', a.a === 15 && a.b === 15 && a.c === 5, JSON.stringify(a))
}

console.log('')
console.log('[2] いま走っているレースは含まない')
{
  check('1戦目の最中は0点', Object.keys(seriesPointsBefore(all, 0)).length === 0,
    JSON.stringify(seriesPointsBefore(all, 0)))
  const p1 = seriesPointsBefore(all, 1)
  check('2戦目の最中は1戦目まで', p1.a === 10 && p1.b === 6 && p1.c === 3, JSON.stringify(p1))
}

console.log('')
console.log('[3] 途中が抜けていても、届いているぶんは入る')
{
  // ★ここが「1つ前だけ足す」やり方との違い。R1 を取りこぼしても R0 は消えない
  const p = seriesPointsBefore([R0, R2], 2)
  check('抜けた回だけが欠ける（残りは正しい）', p.a === 10 && p.b === 6 && p.c === 3, JSON.stringify(p))
}

console.log('')
console.log('[4] 最終結果（seriesStandings）と地続き')
{
  const before = seriesPointsBefore(all, 2)
  const totals = Object.fromEntries(seriesStandings(all).map(s => [s.teamId, s.points]))
  const sum = Object.fromEntries((['a', 'b', 'c'] as const).map(id => {
    const last = R2.standings.find(s => s.teamId === id)!.points
    return [id, (before[id] ?? 0) + last]
  }))
  check('「前まで」＋「今回」＝ 通算', JSON.stringify(sum) === JSON.stringify(totals),
    `${JSON.stringify(sum)} / ${JSON.stringify(totals)}`)
}

console.log('')
console.log('[5] 画面が自分で足し算していない')
{
  const view = readFileSync('src/components/online/RoomLobbyPage.tsx', 'utf-8')
  check('RoomLobbyPage は seriesPointsBefore を通す', /seriesPointsBefore\(/.test(view))
  check('通算得点を状態として持っていない', !/setSeriesPts/.test(view))
  // ★「前回の結果を ref で覚えて足す」形に戻っていないか
  check('前回の結果を覚える ref が無い', !/lastResultRef/.test(view))
  check('画面の中で standings を足し込んでいない',
    !/out\[s\.teamId\]\s*=\s*\(out\[s\.teamId\]\s*\?\?\s*0\)\s*\+\s*s\.points/.test(view))
}

console.log('')
console.log(failed === 0 ? '\n✓ オンライン対戦の通算得点は seriesPointsBefore 1本\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
