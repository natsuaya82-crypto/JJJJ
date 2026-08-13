/**
 * 【Supabase の SQL】1本であること・データを消さないこと・アプリと噛み合っていること
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-supabase-sql.ts \
 *     --outfile=node_modules/.cache/check-sb.cjs --log-level=error && node node_modules/.cache/check-sb.cjs
 *
 * ■なぜ要るか（実際に起きたこと）
 *   supabase/ に .sql が14本あり、「エラーが出たら流し直す」運用になっていた。
 *   ところが土台の3本（schema / clubs / rooms）は先頭で
 *       drop table if exists public.profiles cascade;
 *   と**表ごと落として**いたので、流すたびに**全ユーザーの**プロフィール
 *   （＝フレンドコード）・フレンド関係・走友会が消えていた。
 *   しかも cascade なので、他のファイルが profiles / rosters に足したポリシー
 *   （走友会のメンバーが見える・同じ部屋の相手が見える）も道連れで消え、
 *   「片方を直すともう片方が壊れる」＝永遠に流し続ける形になっていた。
 *
 *   さらに同じ関数が複数のファイルに書いてあった（club_feed は4か所）。
 *   どれが有効かは**流した順**で決まるのに、順番はどこにも書いていなかった。
 *
 * ■だから機械で見張るのは4つ
 *   ① supabase/ の .sql は all.sql ただ1本（増やしたら落ちる）
 *   ② all.sql に `drop table` が無い（データが消えない）
 *   ③ 同じ関数が2回定義されていない（順番で中身が変わらない）
 *   ④ アプリが呼ぶ rpc / 読む表が all.sql に全部ある（＝SQLの書き忘れ）
 *      ついでに、呼ぶ rpc は authenticated に grant されている（42501 除け）
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const SQL_DIR = 'supabase'
const ONLY = 'all.sql'
const sql = readFileSync(join(SQL_DIR, ONLY), 'utf8')

// ── ① 1本であること ────────────────────────────────────
console.log('① SQL は1本だけ')
{
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name))
  const found = walk(SQL_DIR).filter(f => f.endsWith('.sql'))
  check('supabase/ の .sql は all.sql だけ',
    found.length === 1 && found[0] === join(SQL_DIR, ONLY),
    `${found.join(' / ')}\n      → 新しい .sql を作らず all.sql に書き足すこと。` +
    '2本になると「後から流したものが前の定義を消す」が必ず起きます')
}

// ── ② データを消さないこと ────────────────────────────
console.log('\n② データを消さない')
{
  // 落として良いのは関数・ポリシー・トリガー・制約・既定値（＝決まりごと）だけ。
  // 表と列と索引を落としたら、その中身は戻らない。
  const banned: [string, RegExp][] = [
    ['drop table', /\bdrop\s+table\b/i],
    ['drop column', /\bdrop\s+column\b/i],
    ['drop schema', /\bdrop\s+schema\b/i],
    ['drop database', /\bdrop\s+database\b/i],
    ['truncate', /\btruncate\b/i],
  ]
  for (const [label, re] of banned) {
    const hit = sql.split('\n').findIndex(l => re.test(l) && !l.trimStart().startsWith('--'))
    check(`\`${label}\` が無い`, hit < 0,
      hit >= 0 ? `${ONLY}:${hit + 1} — ${sql.split('\n')[hit].trim()}` : '')
  }
  check('表は「無ければ作る」', !/create\s+table\s+(?!if\s+not\s+exists)/i.test(sql),
    'create table if not exists 以外があると、既にある表で落ちます')
  check('列は「無ければ足す」',
    !/add\s+column\s+(?!if\s+not\s+exists)/i.test(sql))
  // 最後に PostgREST のスキーマキャッシュを捨てさせる。
  // これが無いと、足したばかりの列や関数が「無い」と返ることがある（＝画面はオフライン表示）
  check('最後に PostgREST へ reload schema を送っている',
    /notify\s+pgrst,\s*'reload schema'/.test(sql))
}

// ── ③ 同じ関数が2回定義されていないこと ──────────────
console.log('\n③ 定義は1か所')
{
  const defs = [...sql.matchAll(/^create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gim)]
    .map(m => m[1])
  const dup = [...new Set(defs.filter((n, i) => defs.indexOf(n) !== i))]
  check(`関数の定義が重複していない（${defs.length}本）`, dup.length === 0,
    `${dup.join(', ')} が2回以上定義されています。` +
    '同じ関数を2か所に書くと、後の定義が前の列を消します（club_feed で実際に起きた）')

  // ポリシーは drop policy if exists → create policy の対で書く。
  // 対にしないと、2回目に流したときに「既にある」で落ちる。
  const pols = [...sql.matchAll(/^create\s+policy\s+(\w+)\s+on\s+(\S+)/gim)].map(m => `${m[1]} on ${m[2]}`)
  const dropped = new Set([...sql.matchAll(/^drop\s+policy\s+if\s+exists\s+(\w+)\s+on\s+(\S+);/gim)]
    .map(m => `${m[1]} on ${m[2]}`))
  const orphan = pols.filter(p => !dropped.has(p))
  check(`ポリシーは drop→create の対（${pols.length}本）`, orphan.length === 0,
    `${orphan.join(', ')} に drop policy if exists がありません（2回目に流すと落ちます）`)

  const trgs = [...sql.matchAll(/^create\s+trigger\s+(\w+)\s+\w+\s+.*?\son\s+(\S+)/gim)].map(m => `${m[1]} on ${m[2]}`)
  const trgDropped = new Set([...sql.matchAll(/^drop\s+trigger\s+if\s+exists\s+(\w+)\s+on\s+(\S+);/gim)]
    .map(m => `${m[1]} on ${m[2]}`))
  const trgOrphan = trgs.filter(t => !trgDropped.has(t))
  check(`トリガーも drop→create の対（${trgs.length}本）`, trgOrphan.length === 0, trgOrphan.join(', '))
}

// ── ④ アプリと噛み合っていること ──────────────────────
console.log('\n④ アプリが呼ぶものが全部ある')
{
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name))
  const srcFiles = walk('src').filter(f => /\.tsx?$/.test(f))
  const src = srcFiles.map(f => readFileSync(f, 'utf8')).join('\n')

  const rpcs = [...new Set([...src.matchAll(/\.rpc\(\s*'(\w+)'/g)].map(m => m[1]))].sort()
  const tables = [...new Set([...src.matchAll(/\.from\(\s*'(\w+)'/g)].map(m => m[1]))].sort()

  const defined = new Set([...sql.matchAll(/^create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gim)]
    .map(m => m[1]))
  const created = new Set([...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.(\w+)/gi)]
    .map(m => m[1]))

  const missingFn = rpcs.filter(r => !defined.has(r))
  check(`呼んでいる rpc が全部ある（${rpcs.length}件）`, missingFn.length === 0,
    `${missingFn.join(', ')} が all.sql にありません`)

  const missingTbl = tables.filter(t => !created.has(t))
  check(`読んでいる表が全部ある（${tables.length}件）`, missingTbl.length === 0,
    `${missingTbl.join(', ')} が all.sql にありません`)

  // 権限。RPC は authenticated にだけ実行を許している。
  // grant を書き忘れると、SQL は流したのにアプリだけ 42501 で落ちる。
  const granted = new Set([...sql.matchAll(/'(\w+)\([^)]*\)'/g)].map(m => m[1]))
  const noGrant = rpcs.filter(r => defined.has(r) && !granted.has(r))
  check('呼んでいる rpc は authenticated に grant してある', noGrant.length === 0,
    `${noGrant.join(', ')} が grant の一覧に入っていません（42501 permission denied になります）`)
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
