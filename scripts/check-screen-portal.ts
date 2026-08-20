/**
 * 【画面いっぱい／下端に貼るもの】`<main>` の外へ出しているか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-screen-portal.ts \
 *     --outfile=node_modules/.cache/check-sp.cjs --log-level=error && node node_modules/.cache/check-sp.cjs
 *
 * ■なぜ要るか（`docs/BACKLOG.md` U-9）
 *   `Layout` の `<main>` は `-webkit-overflow-scrolling: touch` のスクロール領域で、
 *   iOS の WebView はこれを `position: fixed` の基準にしてしまう。main の中に書いた
 *   fixed は `inset: 0` でも画面全体を覆えず、`z-index` をいくつにしても外にいる
 *   下タブより上に来られない。**ブラウザのプレビューでは再現しない。**
 *   build 87 の走友会「反応する」シートが、これで見出しの一行しか見えなかった。
 *
 * ■決まり
 *   `position: 'fixed'` は **`ScreenPortal` か `createPortal` の中**に置くこと。
 *   `<main>` の外にいる画面（タイトル・ドラフト・オンボーディング…）は要らないので、
 *   **理由を `OUTSIDE_MAIN` に書く**（「漏れた」と「あえて」を区別するため）。
 *
 * ■ここも「画面のほうを実際に数える」形
 *   一覧に載っていないファイルが `position: 'fixed'` を書き始めたら落ちる。
 */
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** `<main>` の外にいるので包まなくてよいもの。**必ず理由を書くこと** */
const OUTSIDE_MAIN: Record<string, string> = {
  'src/App.tsx': 'Layout より前に出している（content を包む土台と、Layout 外のモーダル）',
  'src/components/layout/Layout.tsx': '<main> そのものと、その外に置くヘッダー・下タブ・広告',
  'src/components/onboarding/Onboarding.tsx': 'ゲーム開始前。Layout の外',
  'src/components/draft/DraftRoom.tsx': 'ドラフトは Layout の外（App.tsx が content を差し替える）',
}

const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : []
})

/** その行が ScreenPortal / createPortal の中にいるか */
function portaledLines(lines: string[]): boolean[] {
  const inPortal = new Array(lines.length).fill(false)
  // ① <ScreenPortal> … </ScreenPortal>
  const stack: number[] = []
  lines.forEach((ln, i) => {
    if (/<ScreenPortal>/.test(ln)) stack.push(i)
    if (/<\/ScreenPortal>/.test(ln)) {
      const st = stack.pop()
      if (st !== undefined) for (let k = st; k <= i; k++) inPortal[k] = true
    }
  })
  // ② createPortal( … document.body)
  //    ★閉じ方は1つではありません（`), document.body)` と、改行して `document.body,`）。
  //      片方だけを見る書き方にすると、もう片方が**素通りで NG になり続けます**
  //      （最初 `\), document\.body\)` だけを見ていて RankUpOverlay が落ちた）
  let open = -1
  lines.forEach((ln, i) => {
    if (open < 0 && /createPortal\(/.test(ln)) open = i
    else if (open >= 0 && /document\.body\b(?!\.)/.test(ln)) {
      for (let k = open; k <= i; k++) inPortal[k] = true
      open = -1
    }
  })
  return inPortal
}

const files = walk('src').filter(f =>
  f !== 'src/components/ui/ScreenPortal.tsx' && f !== 'src/components/ui/ScreenCover.tsx')
const naked: string[] = []
const unusedReasons = new Set(Object.keys(OUTSIDE_MAIN))
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n')
  const sites = lines.map((ln, i) => [ln, i] as const).filter(([ln]) => ln.includes("position: 'fixed'"))
  if (sites.length === 0) continue
  const inPortal = portaledLines(lines)
  const bad = sites.filter(([, i]) => !inPortal[i]).map(([, i]) => i + 1)
  if (OUTSIDE_MAIN[f] !== undefined) {
    // ★**免除が生きているかも見ること。** 「fixed を1つも書いていない」だけを見ていると、
    //   もう全部包んであるファイルが一覧に残り続けても緑のままになる
    if (bad.length > 0) unusedReasons.delete(f)
    continue
  }
  if (bad.length > 0) naked.push(`${f}:${bad.join(',')}`)
}
check('`position: fixed` は全部 ScreenPortal / createPortal の中', naked.length === 0,
  `${naked.join(' / ')} — <main> の中に書くと実機で下タブに食われます（理由があるなら OUTSIDE_MAIN に書くこと）`)

check('OUTSIDE_MAIN の免除が全部生きている', unusedReasons.size === 0,
  `${[...unusedReasons].join(', ')} — もう全部包んである（または fixed を書いていない）ので一覧から外すこと`)

// 入れもの自体は portal を通っていること（ここが素通りだと全部が無意味になる）
const sp = readFileSync('src/components/ui/ScreenPortal.tsx', 'utf8')
check('ScreenPortal が document.body へ出している', /createPortal\(children, document\.body\)/.test(sp))

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
