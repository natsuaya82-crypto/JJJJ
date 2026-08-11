// 一本化の見張り番を、まとめて走らせる唯一の入口。
//
// ■なぜこのファイルがあるのか
//   以前は package.json の "check" に
//     npx esbuild --bundle ... scripts/check-A.ts --outfile=... && node ... && npx esbuild ... check-B.ts && ...
//   という2,500文字のシェル文字列が入っていた。**1本足すのに200文字の呪文を書き足す**作りなので、
//   誰も足さなくなり、実際に **51本のうち34本が繋がっていない**状態になっていた。
//   （うち20本はそのまま通り、8本は旧仕様のまま、6本は削除済みAPIを読んでいてビルドすら通らない）
//
//   見張り番が見張られていない、という一番まずい形だったので、**一覧をここ1本にする。**
//   足すときは下の CHECKS に名前を1行足すだけ。
//
// ■速さ
//   esbuild を1本ごとに npx で起動すると、それだけで1本あたり1秒近く食う（17本で20秒）。
//   esbuild はこのリポジトリの node_modules には居らず npx が取ってくるので、
//   モジュールとしては読めない。**CLI をまとめて1回だけ呼ぶ**（51回 → 2回）。
//
// ■出し方
//   通ったものは1行。落ちたものだけ中身を全部出す。
//   全部の中身を見たいときは `npm run check -- --verbose`。
import { spawnSync } from 'node:child_process'
import { mkdirSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'node_modules/.cache/checks')

// ── 点検の一覧 ──────────────────────────────────────────────
// 文字列だけなら「そのまま組んでそのまま走らせる」。特別な事情があるものだけ object にする。
//   shim    … localStorage を持たない Node で保存層を通すための差し込み（scripts/ls-shim.cjs）
//   nativeFakes … @capacitor/* を偽物に差し替えて「実機扱い」でファイル保存の経路を通す
const CHECKS = [
  // 一本化そのものの見張り
  'single-source',
  // チャット・交渉
  'chat-dup', 'chat-lines', 'chat-log?', 'contract-talk?', 'demand-gates', 'sale-answer',
  'consent-single', 'move-reason', 'offer-result', 'gm-offer',
  // 移籍・市場
  'fa-market', 'transfer-eligibility', 'transfer-bid?', 'trade-value?', 'foreign-suitors?',
  // クラブ・格・お金
  'club-tiers', 'club-standing', 'foreign-money', 'clubs', 'offseason',
  // レース・順位・記録
  'race-points', 'race-record', 'background-race', 'round-robin', 'division-rank',
  'division-sync', 'away-records', 'domestic-records', 'segment-recommend', 'play-rate',
  // 世界大会・コース
  'national-pool', 'wa-races', 'course-names', 'world-courses?', 'continental?',
  // セーブ・起動
  { name: 'save-guard', shim: true },
  { name: 'boot-gate', shim: true },
  { name: 'save-backups', shim: true, nativeFakes: true },
  { name: 'load-v39', shim: true },
  'boot-repair', 'archive-season', 'migrate-old-save',
  // その他
  'card-exchange', 'notif-count?', 'talk-sync?',
]

// ── 意図して走らせないもの ──────────────────────────────────
// **「一覧から漏れた」と「わざと外した」を区別できるようにする。**
// 34本が黙って抜け落ちたのは、この区別が無かったのが原因。理由なしで外すことはできない。
const SKIP = {
  'club-roster':  'v40 で team.roster を廃止し rebuildRosters を削除した。見張る対象そのものが無い',
  'flat-roster':  '同上（rebuildRosters）',
  'move-player':  '同上（rebuildRosters）',
  'roster-sync':  '同上（rebuildRosters）。所属が player.teamId 1本かは check-single-source が見ている',
  'reserve-squad': 'utils/reserveSquad は削除済み（2軍は secondTeamRaces を読むだけになった）',
}

// 名前の末尾 "?" は「まだ通っていないので、落ちても全体は止めない」印。
// 直したら "?" を外すこと。**"?" を増やすのは禁止**（増やせるなら見張りの意味が無い）。
const entries = CHECKS.map(c => {
  const o = typeof c === 'string' ? { name: c } : { ...c }
  if (o.name.endsWith('?')) { o.name = o.name.slice(0, -1); o.pending = true }
  return o
})

// @capacitor/* を偽物に差し替える指定。**必要な点検にだけ当てること。**
// 全部に当てると、偽物に無い export（registerPlugin など）を使っている経路が
// ビルドできなくなる（実際に check-offseason がそれで落ちた）。
const FAKE_ARGS = [
  `--alias:@capacitor/core=${join(ROOT, 'scripts/fakes/capacitor-core.ts')}`,
  `--alias:@capacitor/filesystem=${join(ROOT, 'scripts/fakes/capacitor-filesystem.ts')}`,
]
const BUILD_ARGS = ['--bundle', '--platform=node', '--format=cjs', '--out-extension:.js=.cjs', `--outdir=${OUT}`, '--log-level=error']

const verbose = process.argv.includes('--verbose')
const t0 = Date.now()
mkdirSync(OUT, { recursive: true })

// ── 取りこぼしの見張り（これ自体が一番大事）──
// scripts/check-*.ts が増えたのに一覧へ足し忘れる、が34本ぶん起きた。
// 上の CHECKS にも SKIP にも無いものがあれば、走らせる前にここで止める。
{
  const known = new Set([...entries.map(e => e.name), ...Object.keys(SKIP)])
  const onDisk = readdirSync(join(ROOT, 'scripts'))
    .filter(f => f.startsWith('check-') && f.endsWith('.ts'))
    .map(f => f.slice('check-'.length, -'.ts'.length))
  const missing = onDisk.filter(n => !known.has(n))
  const ghosts = [...known].filter(n => !onDisk.includes(n))
  if (missing.length > 0 || ghosts.length > 0) {
    if (missing.length > 0) console.log(`✗ 一覧に載っていない点検があります: ${missing.join(', ')}\n  scripts/run-checks.mjs の CHECKS に足すか、外す理由を SKIP に書いてください。`)
    if (ghosts.length > 0) console.log(`✗ 一覧にあるのに実体が無い点検があります: ${ghosts.join(', ')}`)
    process.exit(1)
  }
}

// ── 組む（差し替えの有無で2群に分けて、それぞれ1回だけ呼ぶ）──
// まとめて組むと、1本でも壊れていれば群ごと失敗する。そのときだけ1本ずつ組み直して、
// **どれが壊れているのかを名指しできる**ようにする（まとめ失敗で全部が巻き添えにならない）
const srcOf = e => join(ROOT, `scripts/check-${e.name}.ts`)
const esbuild = (args) => spawnSync('npx', ['esbuild', ...args], { encoding: 'utf8', cwd: ROOT })
const buildErrors = new Map()

for (const group of [entries.filter(e => !e.nativeFakes), entries.filter(e => e.nativeFakes)]) {
  if (group.length === 0) continue
  const extra = group[0].nativeFakes ? FAKE_ARGS : []
  if (esbuild([...group.map(srcOf), ...BUILD_ARGS, ...extra]).status === 0) continue
  for (const e of group) {
    const r = esbuild([srcOf(e), ...BUILD_ARGS, ...extra])
    if (r.status !== 0) buildErrors.set(e.name, (r.stderr || r.stdout || '').trim())
  }
}

const built = entries.map(e => {
  const outfile = join(OUT, `check-${e.name}.cjs`)
  const buildError = buildErrors.get(e.name) ?? (existsSync(outfile) ? undefined : '出力が作られませんでした')
  return { ...e, outfile, buildError }
})

// ── 走らせる ──
const failed = []
const pendingFailed = []
for (const e of built) {
  const st = Date.now()
  let ok, out
  if (e.buildError) {
    ok = false
    out = `ビルドできませんでした（消したAPIを読んでいる可能性があります）\n${e.buildError}`
  } else {
    const args = e.shim ? ['-r', join(ROOT, 'scripts/ls-shim.cjs'), e.outfile] : [e.outfile]
    const r = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: ROOT })
    ok = r.status === 0
    out = (r.stdout ?? '') + (r.stderr ?? '')
  }
  const ms = Date.now() - st
  const mark = ok ? 'ok  ' : e.pending ? 'todo' : 'NG  '
  console.log(`${mark} ${e.name}${verbose ? '' : `  (${ms}ms)`}`)
  if (verbose && out) console.log(out.replace(/^/gm, '    '))
  if (!ok) {
    if (!verbose) console.log(out.replace(/^/gm, '    '))
    ;(e.pending ? pendingFailed : failed).push(e.name)
  }
}

console.log('')
console.log(`点検 ${built.length}本 / ${((Date.now() - t0) / 1000).toFixed(1)}秒（意図して外した ${Object.keys(SKIP).length}本）`)
if (failed.length > 0) {
  console.log(`✗ 落ちました: ${failed.join(', ')}`)
  process.exit(1)
}
if (pendingFailed.length > 0) {
  console.log(`✓ 見張りは通りました（todo ${pendingFailed.length}本は未修理: ${pendingFailed.join(', ')}）`)
} else {
  console.log('✓ すべて通りました')
}
