/**
 * 【ネイティブの下タブ】判断が Web 側1本のままか・要らない画面で消えるか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-glass-tabbar.ts \
 *     --outfile=node_modules/.cache/check-gtb.cjs --log-level=error && node node_modules/.cache/check-gtb.cjs
 *
 * ■なぜ要るか（実際に起きたこと・2026-08-20）
 *   ネイティブの下タブは WebView の**外**（`viewController.view` の上）に居るので、
 *   React 側で `Layout` が消えても**勝手には消えません**。タイトル・オンボーディング・
 *   ドラフト・セーブ復旧は `Layout` の外（`App.tsx` の別の枝）なので、
 *   **下タブが要らない画面に出しっぱなし**になっていました
 *   （オーナー「下タブがいらないタイトル画面とかでも表示されてる」）。
 *
 *   Web の下タブは `Layout` が描くので、消えるときに一緒に消えていました。
 *   ネイティブにした瞬間だけ、この「一緒に消える」が無くなります。
 *
 * ■見張るのは3つ
 *   ① `Layout` が消えるときに隠している（＝出しっぱなしにならない）
 *   ② 下タブを触るのは `Layout` だけ（画面ごとに出し入れを書かない）
 *   ③ `lib/glassTabBar.ts` とネイティブ側が判断を持たない（渡すだけの管）
 */
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const layout = readFileSync('src/components/layout/Layout.tsx', 'utf8')
const lib = readFileSync('src/lib/glassTabBar.ts', 'utf8')
const swift = readFileSync('ios/App/App/GlassTabBarPlugin.swift', 'utf8')

// ── ① Layout が消えるときに隠す ────────────────────────────
// useEffect の**片付け**（return () => …）で visible:false を渡していること。
// 「どこかに visible があるか」では緑のままになる（出すほうの apply にも書いてある）
const cleanupHides = /return \(\) => \{[^}]*glassTabBar\.apply\(\{[^}]*visible: false/s.test(layout)
check('Layout が消えるときに下タブを隠している', cleanupHides,
  'useEffect の片付けで glassTabBar.apply({ visible: false }) を呼ぶこと' +
  '（タイトル・ドラフト・オンボーディングは Layout の外なので出しっぱなしになります）')

// 片付けの効果が消えないこと。deps に location.pathname のような
// 「画面が変わるたびに変わるもの」を入れると、**画面を移るたびに一瞬隠れて**ちらつく
// ★**読めなかったら緑にしないこと。** 最初 `?? ''` と書いていて、正規表現が
//   一度も当たっていないのに**必ず緑**だった（deps に pathname を足しても落ちない）
const cleanupDeps = layout.match(/visible: false[\s\S]*?\}, \[([^\]]*)\]/)?.[1]
check('隠す片付けは Layout の出入りだけで動く',
  cleanupDeps !== undefined && !/location|pathname|onlineCount|adH/.test(cleanupDeps),
  cleanupDeps === undefined
    ? '片付けの deps が読めませんでした（点検のほうが壊れています）'
    : `deps が [${cleanupDeps.trim()}] — 画面が変わるたびに隠れて出ます`)

// ── ② 触るのは Layout だけ ────────────────────────────────
// 画面ごとに「ここでは出す・ここでは隠す」を書き始めると、Web の下タブと
// ネイティブの下タブで答えが違う、という一番たちの悪い形になる
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []
})
const callers = walk('src').filter(p =>
  p !== 'src/lib/glassTabBar.ts' && /glassTabBar\.apply\(/.test(readFileSync(p, 'utf8')))
check('下タブを触るのは Layout だけ', callers.length === 1 && callers[0].endsWith('Layout.tsx'),
  `${callers.join(', ')} — 出し入れの判断は Layout 1本に置くこと`)

// ── ③ 管は判断を持たない ─────────────────────────────────
// Web と ネイティブに2つ目の「どのタブか」が生まれないこと
check('lib/glassTabBar.ts にタブの中身を書いていない',
  !/'\/(online|team|transfer|teams)'/.test(lib),
  'タブの一覧・どこにいるか・数字は Layout が決めます')
check('ネイティブ側にルーティングを書いていない',
  !/(pathname|navigate|webView\.load|evaluateJavaScript)/.test(swift),
  '押されたら tabTap を投げるだけ。行き先を決めるのは Web 側')

// 一部だけ渡せること（隠すのに項目を空で渡すと、ボタンを作り直してちらつく）
check('apply は渡したものだけを反映する', /call\.getBool\("visible"\)\s*$/m.test(swift) ||
  /let visible = call\.getBool\("visible"\)(?!\s*\?\?)/.test(swift),
  '既定値で埋めると `apply({ visible: false })` だけの更新ができません')

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
