/**
 * 【md が指しているファイルが、本当にあるか】
 *
 * ■なぜ要るのか（オーナー・2026-08-18）
 *   「古いmd系とか全部新しくしないと直すのが古い場所とかになっちゃうよ」
 *
 *   md は誰も動かさないので**コードだけが先に進みます**。実際に 2026-08-18 の点検で、
 *   `docs/AUDIT_MOVEPLAYER.md` が `engine/foreignTransfers.ts`（6日前に削除済み）を
 *   「いまこうなっている」の形で説明していました。読んだ人はもう無いファイルを探しに行きます。
 *
 * ■見るもの
 *   ① md の中でバッククォートに囲まれた**ファイルらしき字**（`src/engine/growth.ts` /
 *      `marketSlice.ts` など）が、実際に存在するか
 *   ② 実装前の設計・草案・監査のメモに、**いつの話かの断り**が頭にあるか
 *
 * ★**消したファイルの話を書いてはいけない、ではありません。**「もう無い」と分かる形
 *   （削除した・廃止した・戻さないこと…）で書いてあれば通します。困るのは
 *   **在るかのように**書いてあることだけ。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** リポジトリの中のファイル（名前だけの集合と、フルパスの集合） */
const names = new Set<string>()
const paths = new Set<string>()
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue
    const p = `${dir}/${e.name}`.replace(/^\.\//, '')
    if (e.isDirectory()) walk(p)
    else { names.add(e.name); paths.add(p) }
  }
}
walk('.')

const mds: string[] = []
const walkMd = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'ios' || e.name === 'dist') continue
    const p = `${dir}/${e.name}`.replace(/^\.\//, '')
    if (e.isDirectory()) walkMd(p)
    else if (e.name.endsWith('.md')) mds.push(p)
  }
}
walkMd('.')

/** 「もう無い」と分かる形で書いてある行か（削除・廃止・当時の話…） */
const GONE = /削除|廃止|もうありません|もう存在しません|戻さないこと|当たりません|旧|かつて|以前|消した|消しました|無くなり|やめました/

/**
 * **`docs/` に置いてよいのは2種類だけ**（オーナー・2026-08-23「古い記載とか使ってない
 * コードはいらん。特にmd周りの一回だかわからん古い文字とか」）。
 *
 *   `docs/BACKLOG.md`      … 生きている一覧
 *   `docs/appstore-v*.md`  … 出したものの記録。書き換えない
 *
 * ★**終わった作業の設計書・草案・監査を残さないこと。** 実装前の計画や「その日の世界」を
 *   書いたメモは、コードが先に進んだ瞬間に嘘になります。以前はここに8本並べて
 *   「頭に『いつの話か』と断ってあれば通す」という**逃がし方**をしていましたが、
 *   断りを読むより先に中身を読んだ人が**もう無いファイルを直しに行きました**。
 *   2026-08-23 に7本（リファクタリング設計書・ランクマッチ設計・伏せ字の草案・
 *   世界選手権の仕様・監査3本）を消し、残す価値のある決まりは**それが効いている場所の
 *   コメントへ書き写しました**（例：セーブの段の欠番 → `store/persistence/migrateSave.ts`）。
 *
 * ★一覧を手で持たないこと。**`docs/` を実際に数えます**（`run-checks.mjs` が
 *   `scripts/check-*.ts` を数えるのと同じ形）。手書きの一覧は、新しく置かれた md を
 *   黙って見逃します。
 */
const isRecord = (f: string) => /^docs\/appstore-v[0-9.]+\.md$/.test(f)
const DOCS_ALLOWED = (f: string) => f === 'docs/BACKLOG.md' || isRecord(f)

console.log('[1] md が指しているファイルが実在する')
{
  // ★**頭に「いつの話か」と断ってある文書は、丸ごと対象外。** 2026-08-11 の監査が
  //   その日の世界を書くのは正しく、そこを直させると調査の記録が嘘になる。
  //   見たいのは**いま読まれる文書**（CLAUDE.md・README・BACKLOG の生きた項目・
  //   supabase/README）が、もう無いファイルを在るように書いていないか。
  const RECORDS = { has: isRecord }
  const dead: string[] = []
  for (const md of mds) {
    if (RECORDS.has(md)) continue
    const lines = readFileSync(md, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/`([a-zA-Z0-9_./-]+\.(?:ts|tsx|mjs|sql|json|yml|css|png))`/g)) {
        const ref = m[1]
        if (ref.startsWith('/') || ref.startsWith('@')) continue        // 絶対パス・パッケージ名
        const base = ref.split('/').pop()!
        if (paths.has(ref) || names.has(base)) continue
        // 「もう無い」は前後の行に書いてあることが多いので、その窓で見る
        if (lines.slice(Math.max(0, i - 2), i + 3).some(l => GONE.test(l))) continue
        dead.push(`${md}:${i + 1}  ${ref}`)
      }
    })
  }
  check('もう無いファイルを「在る」ように書いていない', dead.length === 0,
    `\n      ${dead.join('\n      ')}\n      → 消したなら「削除した」と分かる形で書くこと（そのまま消してもよい）`)
}

console.log('\n[2] docs/ に置いてよいのは「生きている一覧」と「出したものの記録」だけ')
{
  // ★**ディレクトリを実際に数える。** 手で一覧を持つと、新しく置かれた md を見逃す。
  const inDocs = mds.filter(f => f.startsWith('docs/'))
  const extra = inDocs.filter(f => !DOCS_ALLOWED(f))
  check('終わった設計書・草案・監査が残っていない', extra.length === 0,
    `${extra.join(' / ')}\n      → 残す価値のある決まりは、それが効いている場所のコメントへ書き写して md は消すこと`)

  // 記録のほうは、いつ何を出したものか頭で分かること
  for (const f of inDocs.filter(isRecord)) {
    const head = readFileSync(f, 'utf8').split('\n').slice(0, 14).join('\n')
    check(`${f.split('/').pop()} に「いつの話か」がある`, /2026-\d\d-\d\d/.test(head),
      '頭の数行に日付とビルド番号を書くこと')
  }
  check('docs/BACKLOG.md がある', existsSync('docs/BACKLOG.md'))
}

console.log('\n[3] 終わった作業指示が残っていない')
{
  // ★**その場かぎりの指示書を置きっぱなしにしないこと。** 2026-08-11 の3セッション並行
  //   リファクタの指示書（`COORDINATION` / `HANDOFF_P5-P7` / `TASK_SONNET*`）が1週間残り、
  //   「`src/store/` と `src/engine/` を触ってはいけない」「3セッションが同時に動いている」と
  //   書いてありました。**読んだ人は手を止めます。** 終わったら消すこと（git に残ります）。
  const GHOSTS = ['docs/COORDINATION.md', 'docs/HANDOFF_P5-P7.md', 'docs/TASK_SONNET.md', 'docs/TASK_SONNET_2.md']
  const alive = GHOSTS.filter(f => existsSync(f))
  check('終わった並行作業の指示書が消えている', alive.length === 0, alive.join(' / '))

  // 「触ってはいけない」の類が docs に残っていないか（新しく作った指示書も拾う）
  const bossy = mds.filter(f => f.startsWith('docs/') && /触ってはいけないファイル|並行作業中/.test(readFileSync(f, 'utf8')))
  check('「触ってはいけない」が残っていない', bossy.length === 0,
    `${bossy.join(' / ')}\n      → その作業が終わったら消すこと`)
}

console.log('\n[4] CLAUDE.md に書いた数字が、コードの定数と合っている')
{
  // ★**数字は必ずズレます。** オーナーが値を変えたときに直すのはコードだけで、
  //   説明のほうは誰も直しません。実際に `CARRYOVER_CAP_SHARE` は 0.5 → 0.30 に
  //   変わったのに（オーナー判断・2026-08-13）、CLAUDE.md も economy.ts のコメントも
  //   「50%」のままでした（2026-08-18 の点検で発見）。
  //
  //   見るのは「定数の名前が出てくる行に、その値が書いてあるか」。
  //   **書き方は問いません**（0.30 を「30%」と書いてよい）。値を変えたら説明も直す、だけ。
  const claude = readFileSync('CLAUDE.md', 'utf8').split('\n')
  const NUMS: { name: string; as?: (v: number) => string[] }[] = [
    { name: 'CARRYOVER_CAP_SHARE', as: v => [`${v * 100}%`, String(v)] },
    { name: 'CPU_SELL_FLOOR' },
    { name: 'RETIRE_AGE_MIN' },
    { name: 'RETIRE_AGE_MAX' },
    { name: 'DOMESTIC_YOUTH_PER_CLUB' },
    { name: 'MAX_OFFERS_PER_PLAYER' },
    { name: 'THIN_DEPTH' },
    { name: 'MAJOR_NEWS_OVR' },
    { name: 'RUNNING_SLOTS' },
    { name: 'HOF_MAX' },
    { name: 'FACILITY_UPKEEP_PER_LEVEL', as: v => [`${v / 10000}万`, `${v / 10000000}千万`] },
  ]
  const src: string[] = []
  const walkTs = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walkTs(p)
      else if (e.name.endsWith('.ts')) src.push(readFileSync(p, 'utf8'))
    }
  }
  walkTs('src')
  const all = src.join('\n')
  // ★**何件突き合わせたかを数えること。** ここは CLAUDE.md からその定数名を1語消すだけで
  //   黙ってスキップする形で、**12件全部が対象外になっても `→ OK`** と出ていました。
  let matched = 0
  const skipped: string[] = []
  for (const { name, as } of NUMS) {
    const m = all.match(new RegExp(`export const ${name}\\s*(?::[^=]+)?=\\s*([0-9_.]+)`))
    if (!m) { check(`${name} が src にある`, false, '定数が見つからない（名前が変わった？）'); continue }
    const v = Number(m[1].replace(/_/g, ''))
    const want = as ? as(v) : [String(v)]
    const lines = claude.filter(l => l.includes(name))
    if (lines.length === 0) { skipped.push(name); continue }
    matched++
    const ok = lines.some(l => want.some(w => l.includes(w)))
    check(`${name} = ${m[1]}`, ok, `CLAUDE.md の説明に ${want.join(' か ')} が出てこない（値を変えたら説明も直すこと）`)
  }
  check(`CLAUDE.md と突き合わせた定数が ${NUMS.length} 件中 ${matched} 件`, skipped.length === 0,
    `CLAUDE.md がこの名前に触れていないので素通りしました: ${skipped.join(' / ')}（触れるか、NUMS から外すこと）`)
}

if (failed > 0) { console.log(`\n  → NG ${failed}件`); process.exit(1) }
console.log('\n  → OK')
