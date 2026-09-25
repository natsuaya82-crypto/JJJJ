/**
 * 【世界の層（クラブを探す・書くのは1か所だけ）】
 *
 * ■なぜ要るのか（オーナー・2026-09-25）
 *   「コードが今がんじがらめやから、しっかりはルール作って今後誰がいじっても壊れないように」
 *
 *   クラブは国内の `teams`（52）と海外の `foreignLeagues[].clubs`（180）の2つの入れ物に分かれていて、
 *   自チームを引く `teams.find(t => t.id === playerTeamId)` が**約50か所に手書き**されていた。
 *   自チームが海外クラブになると全部が undefined になり、`divisionOf(undefined)` が1部に倒れる。
 *   引き方を1本（`utils/world.ts` の `myClub` / `withMyClub`）にして、ここで数える。
 *
 * ■何を見るか
 *   [1] 自チームを引く手書き（`.find(t => t.id === …playerTeamId)`）が層の外に**0件**
 *   [2] 自チームへの手書きの書き込み（`.map(t => t.id === …playerTeamId ? …`）が層の外に**0件**
 *   [3] 層の外で入れ物（`teams` / `foreignLeagues`）を直に find / filter / map … する数。
 *       **今日より増えたら落ちる**（`check-size` と同じ形・`scripts/fixtures/world-layer-budget.json`）。
 *       入れ物を1つにする段（clubs 232 / leagues 12）で0へ持っていく
 *   [0] 網が死んでいないか——上の正規表現が、わざと書いた違反の見本に**当たる**こと
 *
 * ■層の中
 *   `src/utils/world.ts`（入れ物の核。実行時の import を持たない）と
 *   `src/utils/clubs.ts`（画面用の見た目 Club・索引・海外リーグの引き場所）の2本。
 *   核を分けたのは循環 import のため（league.ts / clubTier.ts からも呼ばれる）。
 *
 * ■あえて外すもの（「漏れた」と「あえて」を区別する）
 *   `EXEMPT` に理由つきで書く。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const FILE = 'scripts/fixtures/world-layer-budget.json'
const LAYER = new Set(['src/utils/world.ts', 'src/utils/clubs.ts'])
const EXEMPT: Record<string, string> = {
  // 旧セーブの生の形（Record<string, unknown>）を読む凍結コード。
  // 当時の形のまま読むのが仕事なので、いまの層の型は通らない
  'src/store/persistence/migrateSave.ts': '旧セーブの生の形を読む移行コード（当時の形で凍結）',
}

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** コメントを外す（経緯の説明文に当たって落ちないため）。文字列の中の // は雑に残る */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// [1] 自チームを引く手書き。`t.id === playerTeamId` の向きも逆向きも見る
const SELF_FIND = /\.find\(\s*\(?(\w+)\)?\s*=>\s*(?:\1\.id\s*===\s*[\w.()]*\bplayerTeamId\b|[\w.()]*\bplayerTeamId\s*===\s*\1\.id)\s*\)/g
// [2] 自チームだけを書き換える三項
const SELF_WRITE = /\.map\(\s*\(?(\w+)\)?\s*=>\s*(?:\1\.id\s*===\s*[\w.()]*\bplayerTeamId\b|[\w.()]*\bplayerTeamId\s*===\s*\1\.id)\s*\?/g
// [3] 入れ物を直に触る
const RAW = /\b(?:teams|foreignLeagues)\s*(?:\?\.|\.)\s*(?:find|filter|map|some|every|flatMap|forEach|reduce|findIndex|length|slice|sort|includes)\b|\bof\s+(?:[\w.()]*\.)?(?:teams|foreignLeagues)\b/g

const count = (re: RegExp, s: string) => (s.match(re) ?? []).length

// ── [0] 網が生きているか ──
console.log('[0] 網が死んでいないか')
const samples = {
  find: [
    'const me = teams.find(t => t.id === playerTeamId)',
    'const me = state.teams.find(t => t.id === state.playerTeamId)',
    'useGameStore(s => s.teams.find((x) => x.id === s.playerTeamId))',
    'const me = teams.find(t => get().playerTeamId === t.id)',
  ],
  write: [
    'teams: s.teams.map(t => t.id === s.playerTeamId ? { ...t } : t)',
    'teams: state.teams.map(t =>\n  t.id === state.playerTeamId\n    ? { ...t } : t)',
  ],
  raw: ['state.teams.filter(x => x)', 'for (const c of s.foreignLeagues) {}', 'teams?.map(t => t)'],
}
check('自チームを引く手書きの見本に全部当たる', samples.find.every(s => count(SELF_FIND, s) === 1))
check('自チームへの書き込みの見本に全部当たる', samples.write.every(s => count(SELF_WRITE, s) === 1))
check('入れ物の直読みの見本に全部当たる', samples.raw.every(s => count(RAW, s) === 1))
check('ほかのクラブを引く形には当たらない',
  count(SELF_FIND, 'teams.find(t => t.id === teamId)') === 0
  && count(SELF_FIND, 'results.teamRankings.find(r => r.teamId === playerTeamId)') === 0)

// ── 数える ──
const selfFind: string[] = []
const selfWrite: string[] = []
const measured: Record<string, number> = {}
let layerHasMyClub = false
let myClubCalls = 0
let withMyClubCalls = 0
for (const f of walk('src')) {
  const code = stripComments(readFileSync(f, 'utf8'))
  if (f === 'src/utils/world.ts') {
    layerHasMyClub = /export function myClub\b/.test(code) && /export function withMyClub\b/.test(code)
    // 核は実行時の import を持たない（循環して最上位の定数が未初期化のまま読まれるため）
    check('world.ts は実行時の import を持たない', !/^import (?!type\b)/m.test(code))
  }
  if (LAYER.has(f)) continue
  myClubCalls += count(/\bmyClub\((?!\))/g, code)
  withMyClubCalls += count(/\bwithMyClub\(/g, code)
  if (EXEMPT[f]) continue
  const nf = count(SELF_FIND, code)
  const nw = count(SELF_WRITE, code)
  if (nf) selfFind.push(`${f} ${nf}件`)
  if (nw) selfWrite.push(`${f} ${nw}件`)
  const nr = count(RAW, code)
  if (nr) measured[f] = nr
}

console.log('[1][2] 自チーム')
check('層に myClub / withMyClub がある', layerHasMyClub)
// 空振り除け：置き換えた先が本当に使われているか（0なら網の前提が崩れている）
check('myClub が使われている', myClubCalls >= 40, `${myClubCalls}件`)
check('withMyClub が使われている', withMyClubCalls >= 9, `${withMyClubCalls}件`)
check('自チームを引く手書きが層の外に無い（myClub を使う）', selfFind.length === 0, selfFind.join(' ／ '))
check('自チームへの手書きの書き込みが層の外に無い（withMyClub を使う）', selfWrite.length === 0, selfWrite.join(' ／ '))

// ── [3] 入れ物の直読み（今日より増えたら落ちる）──
const keys = Object.keys(measured).sort()
const total = keys.reduce((a, k) => a + measured[k], 0)
console.log(`[3] 層の外で入れ物を直に触っている: ${keys.length}ファイル・${total}件`)

if (process.env.UPDATE_GOLDEN === '1') {
  mkdirSync('scripts/fixtures', { recursive: true })
  const sorted: Record<string, number> = {}
  for (const k of keys) sorted[k] = measured[k]
  writeFileSync(FILE, JSON.stringify(sorted, null, 1) + '\n')
  console.log(`  引き直した → ${FILE}（差分をレビューしてからコミット）`)
  process.exit(failed === 0 ? 0 : 1)
}

let budget: Record<string, number> = {}
try { budget = JSON.parse(readFileSync(FILE, 'utf8')) } catch {
  console.log(`✗ ${FILE} が無い。この点検だけを UPDATE_GOLDEN=1 で走らせて生成し、コミットすること`)
  process.exit(1)
}

const grew = keys.filter(k => budget[k] !== undefined && measured[k] > budget[k])
  .map(k => `${k} ${budget[k]}→${measured[k]}件`)
const born = keys.filter(k => budget[k] === undefined).map(k => `${k} ${measured[k]}件`)
const shrank = keys.filter(k => budget[k] !== undefined && measured[k] < budget[k])
const gone = Object.keys(budget).filter(k => measured[k] === undefined)

check('入れ物の直読みが増えていない', grew.length === 0, grew.join(' ／ '))
check('入れ物を直に触るファイルが新しく増えていない（utils/world.ts・utils/clubs.ts の関数を使う）', born.length === 0, born.join(' ／ '))

if (shrank.length > 0 || gone.length > 0) {
  console.log('')
  console.log(`  減りました（${shrank.length + gone.length}件）。${FILE} を引き直してください：`)
  console.log('    npx esbuild --bundle --platform=node --format=cjs scripts/check-world-layer.ts --outfile=/tmp/wl.cjs && UPDATE_GOLDEN=1 node /tmp/wl.cjs')
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
process.exit(failed === 0 ? 0 : 1)
