/**
 * 【セーブ移行のスナップショット検査】旧セーブ（fixture）を migrate + merge に通した結果の
 * 「形」が、前回確認した形（snapshot-v29.json）から変わっていないことを見る。
 *
 *   npm run check の一部として実行される。単体では:
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-migrate-snapshot.ts \
 *     --outfile=node_modules/.cache/check-ms.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-ms.cjs
 *
 * ■ なぜ「形」なのか
 *   migrate の中には選手生成など乱数を含む段があるため、値そのものは毎回変わる。
 *   ここでは キー構成・型・配列の要素数 だけを写し取って比べる。
 *   「移行で配列が丸ごと消えた」「フィールドが undefined のままになった」を捕まえるのが目的。
 *
 * ■ 意図してセーブの形を変えたとき（migrate に新しい段を足したとき）は
 *   UPDATE_SNAPSHOT=1 を付けて実行するとスナップショットを引き直す。
 *   差分をレビューしてからコミットすること。
 *
 * ■ fixture（scripts/fixtures/save-v29.json）は gen-migrate-fixture.ts が生成した
 *   2.0.1（persist v29）相当の合成セーブ。原則作り直さない（基準が動くため）。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { useGameStore } from '../src/store/gameStore'
import { stripEphemeral } from '../src/store/ephemeralState'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const FIXTURE = 'scripts/fixtures/save-v29.json'
const SNAPSHOT = 'scripts/fixtures/snapshot-v29.json'

// ── 形を写し取る ─────────────────────────────────────
// プリミティブ → typeof。配列 → 要素数と、全要素のキーを合流させた形
// （「一部の要素にだけあるキー」は '?': を付ける）。オブジェクト → キーごとの形。
type Shape = unknown
function shapeOf(v: unknown): Shape {
  if (v === null) return 'null'
  if (Array.isArray(v)) {
    if (v.length === 0) return { $len: 0 }
    const elems = v.map(shapeOf)
    return { $len: v.length, $item: unionShapes(elems) }
  }
  if (typeof v === 'object') {
    const out: Record<string, Shape> = {}
    for (const k of Object.keys(v as object).sort()) out[k] = shapeOf((v as Record<string, unknown>)[k])
    return out
  }
  return typeof v
}
function unionShapes(shapes: Shape[]): Shape {
  const first = shapes[0]
  if (typeof first === 'string') {
    const set = new Set(shapes.map(s => (typeof s === 'string' ? s : 'object')))
    return [...set].sort().join('|')
  }
  // オブジェクト同士: キーを合流し、全要素に無いキーは "key?" にする
  const objs = shapes.filter((s): s is Record<string, Shape> => typeof s === 'object' && s !== null && !Array.isArray(s))
  if (objs.length !== shapes.length) return 'mixed'
  const allKeys = new Set(objs.flatMap(o => Object.keys(o)))
  const out: Record<string, Shape> = {}
  for (const k of [...allKeys].sort()) {
    if (k.startsWith('$')) continue
    const present = objs.filter(o => k in o)
    const key = present.length === objs.length ? k : `${k}?`
    out[key] = present[0][k]   // 形の代表として最初の1つ（値の違いは追わない）
  }
  // 配列側のメタ（$len は要素間で比べない。要素数の分布までは固定しない）
  if (objs.some(o => '$len' in o)) return { $array: out }
  return out
}

// 形同士の差分パスを列挙（レビュー用に最初の20件だけ）
function diffPaths(a: Shape, b: Shape, path = '', out: string[] = []): string[] {
  if (out.length >= 20) return out
  if (typeof a !== typeof b || typeof a === 'string' || typeof b === 'string') {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${path || '(root)'}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
    return out
  }
  const ao = a as Record<string, Shape>, bo = b as Record<string, Shape>
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) {
    if (!(k in ao)) { out.push(`${path}.${k}: (無し) → 追加`); continue }
    if (!(k in bo)) { out.push(`${path}.${k}: 削除`); continue }
    if (k === '$len') {
      // 要素数は「0か・0でないか」だけ固定する（乱数で数が揺れる配列があるため）
      const az = ao[k] === 0, bz = bo[k] === 0
      if (az !== bz) out.push(`${path}.$len: ${String(ao[k])} → ${String(bo[k])}（空/非空が変わった）`)
      continue
    }
    diffPaths(ao[k], bo[k], `${path}.${k}`, out)
  }
  return out
}

console.log('セーブ移行スナップショット（v29 fixture → 現行 migrate + merge）')

const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { version: number; state: Record<string, unknown> }
const opts = useGameStore.persist.getOptions() as {
  version?: number
  migrate?: (s: unknown, v: number) => Record<string, unknown>
  merge?: (p: unknown, c: unknown) => Record<string, unknown>
}
if (!opts.migrate || !opts.merge) { console.log('✗ migrate/merge が取り出せない'); process.exit(1) }

// migrate → merge（実際のロードと同じ順）。merge の currentState は新規起動直後の store
let migrated: Record<string, unknown>
try {
  migrated = opts.migrate(JSON.parse(JSON.stringify(fixture.state)), fixture.version)
} catch (e) {
  console.log(`✗ migrate で例外: ${(e as Error).message}`)
  process.exit(1)
}
check('migrate が例外なく通る', true)

let merged: Record<string, unknown>
try {
  merged = opts.merge(migrated, useGameStore.getState())
} catch (e) {
  console.log(`✗ merge で例外: ${(e as Error).message}`)
  process.exit(1)
}
check('merge が例外なく通る', true)

// ── 中身の不変条件（形とは別に、消えてはいけない数を直接見る）──
const fp = fixture.state.players as unknown[]
const mp = merged.players as unknown[]
check('選手が消えていない', Array.isArray(mp) && mp.length >= fp.length, `${fp.length} → ${Array.isArray(mp) ? mp.length : '無し'}`)
const ft = fixture.state.teams as unknown[]
const mt = merged.teams as unknown[]
check('チームが消えていない', Array.isArray(mt) && mt.length >= ft.length, `${ft.length} → ${Array.isArray(mt) ? mt.length : '無し'}`)
check('過去シーズンが消えていない', Array.isArray(merged.pastSeasons) && (merged.pastSeasons as unknown[]).length
  === (fixture.state.pastSeasons as unknown[]).length)

// ── 形のスナップショット照合 ──
// アクション（関数）と保存されない一時状態を落とし、保存対象の形だけを見る
const persistedLike: Record<string, unknown> = {}
for (const [k, v] of Object.entries(stripEphemeral(merged))) {
  if (typeof v !== 'function') persistedLike[k] = v
}
const snap = shapeOf(persistedLike)

if (process.env.UPDATE_SNAPSHOT === '1') {
  writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 1))
  console.log(`  スナップショットを引き直した → ${SNAPSHOT}（差分をレビューしてからコミットすること）`)
} else {
  let golden: Shape
  try {
    golden = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))
  } catch {
    console.log(`✗ ${SNAPSHOT} が無い。UPDATE_SNAPSHOT=1 で生成してコミットすること`)
    process.exit(1)
  }
  const diffs = diffPaths(golden, snap)
  check('移行後のセーブの形が前回確認から変わっていない', diffs.length === 0)
  if (diffs.length > 0) {
    console.log('    形が変わった場所（意図した変更なら UPDATE_SNAPSHOT=1 で引き直す）:')
    for (const d of diffs) console.log(`      ${d}`)
  }
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 旧セーブの移行で、形も数も壊れていない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
for (const p of problems) console.log(`  ${p}`)
process.exit(1)
