/**
 * 【Edge Function に載せているぶんが古くなっていないか】
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-edge-bundle.ts \
 *     --outfile=node_modules/.cache/check-eb.cjs --log-level=error && node node_modules/.cache/check-eb.cjs
 *
 * ■なぜ要るか
 *   レート戦の計算は**アプリとサーバーで同じ1本**（`src/engine/ratedTick.ts`）です。
 *   ところが Supabase の Edge Function は Deno で動き、`src` の中の拡張子なしの相対 import を
 *   解決できないので、`npm run build:edge` で1枚にまとめたもの（`engine.js`）を置いています。
 *
 *   **まとめたものは自動では作り直りません。** `src/engine` を直して build:edge を忘れると、
 *   アプリだけが新しくなり**サーバーは古い計算のまま**動きます。画面に出るコースと
 *   実際に走るコースが食い違う——という、いちばん見つけにくい壊れ方です。
 *   だから毎回「いま作り直したものと同じか」を突き合わせます。
 *
 * ■壊して確かめたこと（両方落ちた）
 *   ・`src/engine/rating.ts` の RATED_K を変えて build:edge を流さない → [1]
 *   ・`engine.js` を手で1行書き換える                                   → [1]
 *   ・Edge Function から `src/…` を直接 import する                     → [2]
 */
import { readFileSync, existsSync } from 'node:fs'
import { bundleEdgeText, OUT, ENTRY } from './build-edge.mjs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] まとめたものが最新か')
{
  check(`${OUT} がある`, existsSync(OUT), 'npm run build:edge を流すこと')
  if (existsSync(OUT)) {
    const now = bundleEdgeText()
    const have = readFileSync(OUT, 'utf8')
    check(`${ENTRY} と一致している`, now === have,
      `古いか手で書き換えられています。**npm run build:edge を流してから commit すること**\n` +
      `      （いま ${have.length} バイト / 作り直すと ${now.length} バイト）`)
  }
}

console.log('\n[2] Edge Function は src を直接読まない')
{
  const fn = readFileSync('supabase/functions/rated-tick/index.ts', 'utf8')
  // Deno は拡張子なしの相対 import を解決できないので、src を直接読むと**デプロイして初めて**落ちる
  check('src/ を import していない', !/from\s+['"][^'"]*\/src\//.test(fn),
    'engine.js（build:edge の出来上がり）から読むこと')
  check('engine.js から読んでいる', /from\s+['"]\.\/engine\.js['"]/.test(fn))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
