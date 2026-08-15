/**
 * 【画面下から出るシート（BottomSheet）を勝手に増やさない】
 *
 * ■なぜ要るのか（オーナー・2026-08-15）
 *   「なにこれ？ゴミ画面つくんなや。
 *     俺がいつ下から出すやつにしろって言った？そのui嫌いだから一生禁止しろ。
 *     俺が許可した時だけ」
 *
 *   走友会の「入る前に中身を見る」を、**頼まれてもいないのにシートで作りました。**
 *   CLAUDE.md に「画面下から出るものは必ず `BottomSheet` を通すこと」と書いてあるのは
 *   **作ると決めたあとの作り方**の話で、「シートにしてよい」という意味ではありません。
 *   形を決めるのはオーナーです。
 *
 * ■この点検が守るもの
 *   `check-size` / `check-ui-tokens` と同じ形＝**上限を決めず、今日より増えたら落ちる。**
 *   増やすときは fixture を引き直してコミットするので、**増えたことが差分に残ります。**
 *   引き直してよいのは**オーナーが許可したとき**だけ。
 *
 *     UPDATE_GOLDEN=1 <この点検だけ> で引き直す
 *
 *   （`npm run check` ごと UPDATE_GOLDEN=1 にすると他の golden まで引き直されます）
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
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
    else if (/\.tsx$/.test(p)) files.push(p)
  }
}
walk('src/components')

// 入れもの自身（ui/BottomSheet.tsx）は数えない。数えるのは**使っている側**
const counts: Record<string, number> = {}
for (const f of files) {
  if (f.endsWith('ui/BottomSheet.tsx')) continue
  const n = [...readFileSync(f, 'utf8').matchAll(/<BottomSheet\b/g)].length
  if (n > 0) counts[f] = n
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)

const FIX = 'scripts/fixtures/bottom-sheet-budget.json'
if (process.env.UPDATE_GOLDEN === '1' || !existsSync(FIX)) {
  writeFileSync(FIX, JSON.stringify(counts, null, 1) + '\n')
  console.log(`  -- 引き直しました（${Object.keys(counts).length}ファイル / 合計 ${total}件）`)
  console.log('     ★オーナーの許可があるときだけ引き直すこと')
} else {
  const want = JSON.parse(readFileSync(FIX, 'utf8')) as Record<string, number>
  const wantTotal = Object.values(want).reduce((a, b) => a + b, 0)
  const grown: string[] = []
  for (const [f, n] of Object.entries(counts)) {
    if (n > (want[f] ?? 0)) grown.push(`${f} ${want[f] ?? 0} → ${n}`)
  }
  console.log(`[1] 画面下から出るシートが増えていない（いま ${total}件）`)
  check('増えていない', grown.length === 0,
    grown.join('\n      ') + '\n      → **オーナーの許可が要ります。** 許可が出たら UPDATE_GOLDEN=1 でこの点検だけ引き直すこと')
  if (total < wantTotal) {
    console.log(`  -- 減りました（${wantTotal} → ${total}件）。fixture を引き直してコミットしてください`)
  }
  // ★この点検が何も見ていない状態で緑になるのを防ぐ
  check('そもそも数えられている（空振りの緑ではない）', total > 0, `${total}件`)
}

console.log('')
if (failed > 0) { console.log(`✗ 画面下から出るシートが増えています（${failed}件）`); process.exit(1) }
console.log('✓ 画面下から出るシートは増えていない')
