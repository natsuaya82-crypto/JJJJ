/**
 * レイヤーの依存ルールの見張り番。**下から上への import を機械的に見つけて落とす。**
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-layers.ts --outfile=node_modules/.cache/check-ly.cjs --log-level=error && node node_modules/.cache/check-ly.cjs
 *
 * ■なぜ要るのか
 *   このリポジトリは層が決まっている。
 *     components/  ← 画面
 *     store/       ← 状態（slices / persistence）
 *     engine/ utils/  ← 純粋な計算
 *     data/ types/ ← 定数・型
 *   下の層が上の層を import すると、計算の中に画面や状態の都合が紛れ込み、
 *   純粋な関数のはずが実は store が無いと動かない、という事故につながる。
 *   いまは人が気をつけているだけなので、`scripts/check-single-source.ts` と同じ発想で
 *   機械的に見つける。
 *
 * ■書き方（check-single-source.ts を真似ている）
 *   「探すパターン」と「居ていい場所（許可リスト）」だけを並べる。
 *   型だけの import（`import type ...`）は実行時には残らないので、
 *   slices 同士・slices→gameStore のルールだけ許可する（型は循環しない）。
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

const SKIP_DIRS = new Set(['node_modules', 'dist', 'ios', '.git', 'public'])

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(e)) out.push(full)
  }
  return out
}

type Hit = { file: string; line: number; text: string }
type ImportRef = { spec: string; typeOnly: boolean }

/**
 * その行に出てくる相対import指定子を全部拾う。型だけの参照は実行時には残らないので
 * typeOnly を付けて返し、呼び出し側で違反から外す。
 *   - `from '...'`     → 行全体が `import type ...` かどうかで typeOnly が決まる
 *   - `import('...')`  → `import('mod').Type` という「型の位置に書くインライン import」は
 *     TS の構文として常にコンパイル時だけの表記（実行時の import() 呼び出しではない）なので、
 *     常に typeOnly 扱いにする。このリポジトリで相対パスの動的 import()（値としての呼び出し）は
 *     使っていない（動的 import は @capacitor 系パッケージのみで、非相対パスなので対象外）。
 */
function specifiersOf(line: string): ImportRef[] {
  const lineTypeOnly = isTypeOnlyImportLine(line)
  const refs: ImportRef[] = []
  const fromRe = /from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = fromRe.exec(line))) refs.push({ spec: m[1], typeOnly: lineTypeOnly })
  const callRe = /import\(['"]([^'"]+)['"]\)/g
  while ((m = callRe.exec(line))) refs.push({ spec: m[1], typeOnly: true })
  return refs
}

/** `import type { ... } from '...'` の行かどうか。型だけなら実行時には残らない */
function isTypeOnlyImportLine(line: string): boolean {
  return /^\s*import\s+type\b/.test(line)
}

/** 相対specifierを解決して、src/ からの相対パスにする（存在チェックはしない＝拡張子は無視） */
function resolveSrcRelative(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null   // パッケージimportは対象外
  const abs = resolve(dirname(fromFile), spec)
  const rel = relative(SRC, abs)
  if (rel.startsWith('..')) return null    // src/ の外
  return rel.split('\\').join('/')         // Windows対策（このリポジトリは使わないはずだが念のため）
}

const SRC = resolve('src')

/** allow に載っている file かどうか（末尾一致・完全一致どちらでもよい） */
function isAllowed(file: string, allow: string[]): boolean {
  return allow.some(a => file === a || file.endsWith(a))
}

function scanFiles(dirs: string[]): { file: string; lines: string[] }[] {
  const files = dirs.flatMap(d => walk(resolve(d)))
  return files.map(file => ({ file: relative('.', file).split('\\').join('/'), lines: readFileSync(file, 'utf8').split('\n') }))
}

let violations = 0
function report(name: string, fix: string, hits: Hit[]) {
  if (hits.length === 0) return
  violations += hits.length
  console.log(`\n✗ ${name}（${hits.length}件）`)
  console.log(`  → ${fix}`)
  for (const h of hits) console.log(`  ${h.file}:${h.line}  ${h.text.slice(0, 100)}`)
}

// ── ルール1: engine/ utils/ data/ から store/ components/ lib/ を import しない ──
//
// 既知の例外が1つある: utils/ads.ts が store/loadingStore を import している
// （広告の表示可否を loadingStore の起動フラグで見ている。解消は別途）。
{
  const ALLOW = ['src/utils/ads.ts']
  const hits: Hit[] = []
  for (const { file, lines } of scanFiles(['src/engine', 'src/utils', 'src/data'])) {
    if (isAllowed(file, ALLOW)) continue
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      for (const { spec, typeOnly } of specifiersOf(line)) {
        if (typeOnly) continue
        const rel = resolveSrcRelative(file, spec)
        if (!rel) continue
        if (rel.startsWith('store/') || rel.startsWith('components/') || rel.startsWith('lib/')) {
          hits.push({ file, line: i + 1, text: t })
        }
      }
    })
  }
  report(
    'engine/utils/data が store/components/lib を import している',
    '計算は engine/utils/data だけで完結させる。画面や状態が要るなら呼び出す側（store・components）に置く',
    hits,
  )
}

// ── ルール2: store/slices/ の中から他の slices/ を import しない（import type だけは許可） ──
{
  const hits: Hit[] = []
  for (const { file, lines } of scanFiles(['src/store/slices'])) {
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      for (const { spec, typeOnly } of specifiersOf(line)) {
        if (typeOnly) continue
        const rel = resolveSrcRelative(file, spec)
        if (!rel) continue
        if (rel.startsWith('store/slices/')) hits.push({ file, line: i + 1, text: t })
      }
    })
  }
  report(
    'slices が他の slices を値として import している',
    'slice 同士を直接呼ばない。共有したい処理は utils/engine か store/marketOps のような slices の外へ出す。型だけなら import type で',
    hits,
  )
}

// ── ルール3: store/slices/ の中から ../gameStore を値として import しない ──
//
// `import type { GameStore, SetGame } from '../gameStore'` は正しい形（許可）。
// 値の import（useGameStore など）は循環の元になるので禁止。
{
  const hits: Hit[] = []
  for (const { file, lines } of scanFiles(['src/store/slices'])) {
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      for (const { spec, typeOnly } of specifiersOf(line)) {
        if (typeOnly) continue
        const rel = resolveSrcRelative(file, spec)
        if (!rel) continue
        if (rel === 'store/gameStore') hits.push({ file, line: i + 1, text: t })
      }
    })
  }
  report(
    'slices が ../gameStore を値として import している',
    'GameStore / SetGame は import type で受ける（値の import は循環する）',
    hits,
  )
}

// ── ルール4: data/ types/ の中から engine/ utils/ を import しない ──
//
// 既知の例外が4つある。data から utils への値の参照が残っている。
// 解消は別途（utils/clubTier の一本化に関わるので、勝手に動かすと崩れる。オーナー確認の上で）。
{
  const ALLOW = [
    'src/data/cardShop.ts',    // RARITY_EXP を utils/cardCombo から
    'src/data/economy.ts',     // operatingCostOf / OPERATING_COST_RATE を utils/clubTier から
    'src/data/logoPresets.ts', // strHash を utils/hash から
    'src/data/sponsors.ts',    // tierSponsorIncome を utils/clubTier から
  ]
  const hits: Hit[] = []
  for (const { file, lines } of scanFiles(['src/data', 'src/types'])) {
    if (isAllowed(file, ALLOW)) continue
    lines.forEach((line, i) => {
      const t = line.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      for (const { spec, typeOnly } of specifiersOf(line)) {
        if (typeOnly) continue
        const rel = resolveSrcRelative(file, spec)
        if (!rel) continue
        if (rel.startsWith('engine/') || rel.startsWith('utils/')) {
          hits.push({ file, line: i + 1, text: t })
        }
      }
    })
  }
  report(
    'data/types が engine/utils を import している',
    'data/types は定数・型だけにする。計算は engine/utils 側から data/types を参照する向きにする',
    hits,
  )
}

if (violations === 0) {
  console.log('レイヤーの点検：4件のルール、違反なし')
  process.exit(0)
}
console.log(`\nレイヤーの点検：合計 ${violations} 件の下から上への import が見つかりました`)
process.exit(1)
