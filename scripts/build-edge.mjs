// 【Edge Function に載せるぶんを1枚にまとめる】
//
//   npm run build:edge              … 置き場所に書き出す
//   node scripts/build-edge.mjs 別の場所.js … そこへ書き出す（点検が使う）
//
// ■なぜ要るか
//   レート戦の計算（コース・グループ分け・レース・レート）は**アプリとサーバーで同じ1本**です
//   （`src/lib/ratedTick.ts`）。ところが Supabase の Edge Function は Deno で動くので、
//   `src` の中の `import './rating'`（拡張子なし）をそのままでは解決できません。
//   拡張子を全部書き足すのは本末転倒なので、**esbuild で1枚にまとめて置きます。**
//
// ■まとめたものは commit します
//   デプロイを `supabase functions deploy rated-tick` だけで済ませたいので、出来上がりを
//   リポジトリに入れておきます。**古いまま気づかない**のが唯一の危険なので、
//   `npm run check` の `edge-bundle` が「いま作り直したものと同じか」を毎回見張ります。
//   中身を変えたら `npm run build:edge` を流してから commit すること。
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'

export const ENTRY = 'src/lib/ratedTick.ts'
export const OUT = 'supabase/functions/rated-tick/engine.js'

const BANNER = `// ⚠️ 自動生成。直接編集しないこと。
// もと: ${ENTRY} → npm run build:edge（scripts/build-edge.mjs）
// 古くなっていないかは npm run check の edge-bundle が見張ります。`

/** 1枚にまとめて `out` へ書き出す。失敗したら例外 */
export function buildEdge(out) {
  const r = spawnSync('npx', ['esbuild',
    '--bundle', '--format=esm', '--platform=neutral', '--target=es2022',
    '--legal-comments=none', '--log-level=error',
    `--banner:js=${BANNER}`,
    ENTRY, `--outfile=${out}`,
  ], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(r.stderr || 'esbuild が失敗しました')
  return readFileSync(out, 'utf8')
}

/** まとめた中身を文字列で返す（点検用。置き場所は書き換えない） */
export function bundleEdgeText() {
  const tmp = 'node_modules/.cache/edge-bundle-check.js'
  try { return buildEdge(tmp) } finally { rmSync(tmp, { force: true }) }
}

if (process.argv[1]?.endsWith('build-edge.mjs')) {
  const out = process.argv[2] ?? OUT
  const code = buildEdge(out)
  writeFileSync(out, code)
  console.log(`  ${out} — ${(code.length / 1024).toFixed(1)} KB`)
}
