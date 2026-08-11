/**
 * 大きさの歯止め。**「今日より大きくなったら落ちる」だけを見る。**
 *
 * ■なぜ「上限は何行」と決めないのか
 *   「1ファイル300行まで」のような線は、決めた瞬間に**93ファイルが違反**になる。
 *   全部が赤いルールは誰も直さず、そのうち外される。このリポジトリは
 *   `pending: <件数>` で「いま何件落ちるか」を書く形を既に持っているので、それに揃える。
 *
 *   ここが見るのは**増えたかどうか**だけ。
 *     増えた   → 落ちる（意図した増加なら fixture を引き直してコミット＝差分がレビューに乗る）
 *     減った   → 通すが「減りました」と言って引き直しを促す
 *     新しく大きいものができた → 落ちる（黙って大きな塊が生まれるのを止める）
 *
 * ■何を見るか
 *   ・`src/store` と `src/engine` のファイルの行数（`FILE_FLOOR` 行を超えるものだけ）
 *   ・`src/store/slices/*.ts` のアクション1本ずつの行数（`ACTION_FLOOR` 行を超えるものだけ）
 *
 *   画面（`src/components`）はまだ入れていない。ビューの分解が別で進行中なので、
 *   終わってから同じやり方で足すこと。
 */
import { writeFileSync, readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const FILE = 'scripts/fixtures/size-budget.json'
/** これを超えるファイルだけ数える（小さいものまで並べても読めないため） */
const FILE_FLOOR = 200
/** これを超えるアクションだけ数える */
const ACTION_FLOOR = 60

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const measured: Record<string, number> = {}

// ── ファイルの行数 ──
for (const dir of ['src/store', 'src/engine']) {
  for (const f of walk(dir)) {
    const n = readFileSync(f, 'utf8').split('\n').length
    if (n > FILE_FLOOR) measured[f] = n
  }
}

// ── スライスのアクション1本ずつ ──
// `  name: (…) => {` で始まり、**括弧の深さが0に戻る行**まで。
// 行の見た目（`  },`）で終わりを探すと、1行で終わるアクション
// （`clearRaceLineup: () => set({...}),`）が次の塊の終わりまで飲み込む。
// 実際それで runRace の468行が clearRaceLineup の471行として数えられていた。
const depthDelta = (line: string) => {
  // 文字列・コメントの中の括弧は数えない（雑だが、この用途には足りる）
  const code = line.replace(/'(\\.|[^'\\])*'|"(\\.|[^"\\])*"|`(\\.|[^`\\])*`/g, "''").replace(/\/\/.*$/, '')
  let d = 0
  for (const ch of code) {
    if (ch === '{' || ch === '(' || ch === '[') d++
    if (ch === '}' || ch === ')' || ch === ']') d--
  }
  return d
}
for (const f of walk('src/store/slices')) {
  const lines = readFileSync(f, 'utf8').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {2}([a-zA-Z][a-zA-Z0-9_]*): (\(|async )/.exec(lines[i])
    if (!m) continue
    let depth = 0
    let j = i
    for (; j < lines.length; j++) {
      depth += depthDelta(lines[j])
      if (depth <= 0) break
    }
    const n = j - i + 1
    if (n > ACTION_FLOOR) measured[`${f}::${m[1]}`] = n
    i = j
  }
}

const keys = Object.keys(measured).sort()
console.log(`[1] ${keys.length}件を測った（ファイル ${FILE_FLOOR}行超 / アクション ${ACTION_FLOOR}行超）`)

if (process.env.UPDATE_GOLDEN === '1') {
  mkdirSync('scripts/fixtures', { recursive: true })
  const sorted: Record<string, number> = {}
  for (const k of keys) sorted[k] = measured[k]
  writeFileSync(FILE, JSON.stringify(sorted, null, 1))
  console.log(`  引き直した → ${FILE}（差分をレビューしてからコミット）`)
  process.exit(0)
}

let budget: Record<string, number> = {}
try { budget = JSON.parse(readFileSync(FILE, 'utf8')) } catch {
  console.log(`✗ ${FILE} が無い。この点検だけを UPDATE_GOLDEN=1 で走らせて生成し、コミットすること`)
  process.exit(1)
}

const grew = keys.filter(k => budget[k] !== undefined && measured[k] > budget[k])
  .map(k => `${k} ${budget[k]}→${measured[k]}行`)
const born = keys.filter(k => budget[k] === undefined)
  .map(k => `${k} ${measured[k]}行`)
const shrank = keys.filter(k => budget[k] !== undefined && measured[k] < budget[k])
  .map(k => `${k} ${budget[k]}→${measured[k]}行`)
const gone = Object.keys(budget).filter(k => measured[k] === undefined)

check('大きくなったものは無い', grew.length === 0, grew.join(' ／ '))
check(`新しく大きいもの（ファイル${FILE_FLOOR}行超・アクション${ACTION_FLOOR}行超）はできていない`,
  born.length === 0, born.join(' ／ '))

if (shrank.length > 0 || gone.length > 0) {
  console.log('')
  console.log(`  減りました（${shrank.length + gone.length}件）。${FILE} を引き直してください：`)
  console.log('    npx esbuild --bundle --platform=node --format=cjs scripts/check-size.ts --outfile=/tmp/sz.cjs && UPDATE_GOLDEN=1 node /tmp/sz.cjs')
  console.log('    （npm run check ごと UPDATE_GOLDEN=1 で走らせないこと。**他の golden まで引き直される**）')
  for (const s of [...shrank, ...gone.map(k => `${k} ${budget[k]}行 → 対象外`)].slice(0, 12)) console.log(`    ${s}`)
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
