/**
 * 【フックは早期リターンより上に書く】
 *
 * ■なぜ要るのか（オーナー・2026-08-15「フレンド見ようとするとこうなるなん回も」）
 *
 *     Minified React error #310
 *
 *   `FriendDetailPage` が**フックを早期リターンの後ろで呼んで**いました。
 *
 *       useEffect(...)                        ← ここまでフック6個
 *       if (head.loading) return (...)        ← 読み込み中はここで抜ける
 *       if (head.error)   return (...)
 *       if (!friend)      return (...)
 *       const rating = useRatedRank(friend?.id)   ← 7個目
 *
 *   読み込み中は6個・読み込めたら7個。React はフックを**呼ばれた順番**で数えるので、
 *   数が変わった瞬間に落ちます。**開くたび必ず**通る道なので、フレンド詳細は
 *   一度も開けませんでした。
 *
 * ■なぜ人の目と eslint では止まらなかったのか
 *   `react-hooks/rules-of-hooks` は入っていますが、`npm run lint` は
 *   「既存エラーが多数あります」の状態で、**新しい1件が埋もれます**（実際に埋もれた）。
 *   ここは**この1種類だけ**を見るので、出たら必ず気づきます。
 *
 * ■見方
 *   関数の本体の直下（インデント2）に `return` が出たあと、同じ深さで
 *   `use◯◯(` を呼んでいたら落とします。**中身の条件は見ません**——
 *   早期リターンの後ろにフックがある時点で、その道は通らない可能性があるためです。
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const files: string[] = []
const walk = (d: string) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(p)) files.push(p)
  }
}
walk('src')

const HOOK = /(?:^|[^.\w])(use[A-Z]\w*)\s*\(/

export type Hit = { file: string; line: number; text: string; fn: string; afterLine: number }

/**
 * 早期リターンの後ろでフックを呼んでいる場所を全部返す。
 *
 * ★**インデント2の `return` だけを見ないこと。** 実際の早期リターンはほとんどが
 *
 *     if (head.loading) {
 *       return (          ← インデント4
 *
 *   の形で、行頭2文字だけを見る書き方は**本物を1件も拾いません**（最初にそう書いて、
 *   壊し戻しても緑のままでした）。中括弧を数えて「本体の直下の `if` の中の `return`」
 *   まで拾います。
 */
export function hooksAfterReturn(list: string[]): Hit[] {
  const out: Hit[] = []
  for (const f of list) {
    const lines = readFileSync(f, 'utf8').split('\n')
    // depth … 部品の本体に入ってからの中括弧の深さ（本体の直下が 1）
    let depth = 0, inFn = false, returned = 0, fn = '', ifDepth = 0
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i]
      // 部品（コンポーネント）の始まり。小文字始まりのふつうの関数は見ない
      if (!inFn && (/^(export default )?function [A-Z$_]/.test(L) || /^(export )?const [A-Z]\w* = \(/.test(L))) {
        inFn = true; returned = 0; depth = 0; ifDepth = 0; fn = L.trim().slice(0, 60)
      }
      if (!inFn) continue
      const open = (L.match(/\{/g) ?? []).length
      const close = (L.match(/\}/g) ?? []).length

      // 本体の直下（depth 1）に書かれた `if (…) {` / `} else {`。この中の return が早期リターン
      if (depth === 1 && /^\s{2}(\}\s*)?(else\s+)?if\s*\(/.test(L) && open > close) ifDepth = depth + 1
      // 1行で書いた `if (x) return null`
      if (depth === 1 && /^\s{2}if\s*\(.*\)\s*return\b/.test(L)) returned = i + 1
      // 本体の直下そのものに書いた `return`
      if (depth === 1 && /^\s{2}return\b/.test(L)) returned = i + 1
      // 早期リターンの if の中の return（インデントは問わない）
      if (ifDepth > 0 && depth >= ifDepth && /(^|\s)return\b/.test(L)) returned = i + 1

      if (returned && depth === 1 && HOOK.test(L) && !/^\s*(\/\/|\*)/.test(L)) {
        out.push({ file: f, line: i + 1, text: L.trim().slice(0, 80), fn, afterLine: returned })
        returned = 0
      }
      depth += open - close
      if (ifDepth > 0 && depth < ifDepth) ifDepth = 0
      if (depth <= 0 && (open || close)) inFn = false
    }
  }
  return out
}

console.log(`[1] ${files.length}ファイルを見た`)
{
  const hits = hooksAfterReturn(files)
  for (const h of hits) {
    console.log(`      ${h.file}:${h.line}  ${h.text}`)
    console.log(`        └ ${h.afterLine}行目の return より後（${h.fn}）`)
  }
  check('早期リターンの後ろでフックを呼んでいる場所は無い', hits.length === 0, `${hits.length}件`)
}

console.log('\n[2] 見方そのものが働いているか（空振りの緑ではない）')
{
  // ★**この点検が何も見ていない**状態で緑になるのが一番まずい。
  //   壊れた形を1つ書いて、ちゃんと見つけることを確かめる
  mkdirSync(join('node_modules', '.cache'), { recursive: true })
  const bad = join('node_modules', '.cache', 'hook-order-bad.tsx')
  writeFileSync(bad, [
    'export default function BadPage() {',
    '  const a = useState(0)',
    '  if (!a) return null',
    '  const b = useMemo(() => 1, [])',
    '  return b',
    '}',
  ].join('\n'))
  check('1行の early return のあとを見つけられる', hooksAfterReturn([bad]).length === 1)
  // ★**本物はこの形**（`if (…) {` で改行して、中で `return (`）。
  //   ここを見ていない網は、壊し戻しても緑のままになる（実際に一度そうなった）
  const bad2 = join('node_modules', '.cache', 'hook-order-bad2.tsx')
  writeFileSync(bad2, [
    'export default function BadPage2() {',
    '  const a = useState(0)',
    '  if (!a) {',
    '    return (',
    '      <div>なし</div>',
    '    )',
    '  }',
    '  const b = useMemo(() => 1, [])',
    '  return b',
    '}',
  ].join('\n'))
  const hits = hooksAfterReturn([bad2])
  check('**複数行の early return のあとも見つけられる**（本物の形）', hits.length === 1, `${hits.length}件`)
  // 正しい形（フックが全部 return より上）は拾わない＝誤検知しない
  const good = join('node_modules', '.cache', 'hook-order-good.tsx')
  writeFileSync(good, [
    'export default function GoodPage() {',
    '  const a = useState(0)',
    '  const b = useMemo(() => 1, [])',
    '  if (!a) return null',
    '  return b',
    '}',
  ].join('\n'))
  check('正しい形は拾わない（誤検知しない）', hooksAfterReturn([good]).length === 0)
}

console.log('')
if (failed > 0) { console.log(`✗ フックが早期リターンの後ろにあります（${failed}件）`); process.exit(1) }
console.log('✓ フックは全部、早期リターンより上にある')
