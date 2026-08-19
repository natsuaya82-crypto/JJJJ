/**
 * **レート戦を1か月ぶん回して、レートがどこまで伸びるかを数える。**
 *   npx esbuild --bundle --platform=node --format=esm scripts/measure-rated-season.ts --outfile=/tmp/mrs.mjs && node /tmp/mrs.mjs
 *
 * ■なぜ要るのか
 *   段位の区切り（`RANK_BANDS`）を当てずっぽうで置くと、
 *   **1か月やっても誰もシルバーに届かない**か、**初日で全員マスター**になる。
 *   K と回数から実際に出る幅を見てから決める。
 *
 * ■ここではレースを走らせない
 *   見たいのは「レートがどう散らばるか」なので、参加者に**本当の強さ**を持たせて、
 *   その順にタイムが出る（多少のブレつき）とみなす。レースの中身は `simulateRace` の
 *   仕事で、ここでは関係しない。
 */
import { applyElo, splitGroups, rankOf, clampRating, RATED_K, RANK_BANDS, RATING_START } from '../src/engine/rating'

let seed = 20260813
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }

const ROUNDS = 30

function run(n: number, label: string) {
  // 本当の強さ。0〜100で散らす（実際の殿堂入りの差もこのくらいの幅になる想定）
  const truth = new Map<string, number>()
  const rating = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    truth.set(`u${i}`, rnd() * 100)
    rating.set(`u${i}`, RATING_START)
  }
  for (let round = 0; round < ROUNDS; round++) {
    const entries = [...rating].map(([id, r]) => ({ id, rating: r }))
    for (const g of splitGroups(entries)) {
      // 本当の強さ＋当日のブレ（±15）でタイム順が決まるとみなす
      const order = [...g]
        .map(e => ({ id: e.id, score: (truth.get(e.id) ?? 0) + (rnd() - 0.5) * 30 }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.id)
      const delta = applyElo(g, order)
      // ★下限0で止める（本番と同じ `clampRating` を通す。通さないとマイナスの幅を測ってしまう）
      for (const [id, d] of Object.entries(delta)) rating.set(id, clampRating((rating.get(id) ?? 0) + d))
    }
  }
  const rows = [...rating].map(([id, r]) => ({ id, r, t: truth.get(id) ?? 0 })).sort((a, b) => b.r - a.r)
  console.log(`\n■ ${label}（${n}人・${ROUNDS}回戦・K=${RATED_K}）`)
  console.log(`  レートの幅  ${Math.round(rows[rows.length - 1].r)} 〜 ${Math.round(rows[0].r)}`)
  console.log(`  1位 ${Math.round(rows[0].r)}（強さ${rows[0].t.toFixed(0)}） / 中位 ${Math.round(rows[Math.floor(n / 2)].r)} / 最下位 ${Math.round(rows[n - 1].r)}（強さ${rows[n - 1].t.toFixed(0)}）`)
  // 強さの順とレートの順がどれだけ合っているか（順位の相関）
  const byTruth = [...rows].sort((a, b) => b.t - a.t).map(x => x.id)
  const byRating = rows.map(x => x.id)
  const gap = byTruth.reduce((s, id, i) => s + Math.abs(i - byRating.indexOf(id)), 0) / n
  console.log(`  強さの順位とレートの順位のズレ  平均 ${gap.toFixed(1)}人ぶん`)
  const cnt: Record<string, number> = {}
  for (const x of rows) cnt[rankOf(x.r)] = (cnt[rankOf(x.r)] ?? 0) + 1
  console.log('  段位の分かれ方： ' + RANK_BANDS.map(b => `${b.name} ${cnt[b.name] ?? 0}`).join(' / '))
}

run(20, '20人')
run(43, '43人')
run(100, '100人')
