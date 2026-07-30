// お知らせ（jpel-news.json）を、アプリ本体の CHANGELOG から機械的に作るだけのスクリプト。
//
// お知らせの中身はアプリの src/data/appMeta.ts が本命。
// ここで作る JSON は「アプリを更新していない人にも同じ内容を見せる」ためのコピーで、
// 手で書き写すと必ず食い違うので、必ずこのスクリプトで作る。
//
// 使い方:  npm run news
// できるもの:  web/jpel-news.json  → これを tokinets.com の直下に置く
//
// なお TypeScript をそのまま node で読めないので、esbuild で一度 JS に変換して読み込む。

import { execFileSync } from 'child_process'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'src/data/appMeta.ts')
const tmp = join(root, 'node_modules/.cache/appMeta.news.mjs')
const outDir = join(root, 'web')
const out = join(outDir, 'jpel-news.json')

mkdirSync(dirname(tmp), { recursive: true })
execFileSync('npx', ['esbuild', src, '--format=esm', `--outfile=${tmp}`], { cwd: root, stdio: 'inherit' })

const { CHANGELOG } = await import(`file://${tmp}?t=${process.hrtime.bigint()}`)
rmSync(tmp, { force: true })

if (!Array.isArray(CHANGELOG) || CHANGELOG.length === 0) {
  console.error('CHANGELOG が読めなかった。src/data/appMeta.ts を確認して。')
  process.exit(1)
}

// アプリ側の型（NewsItem）と同じ形にそろえる。version は Web では使わないので落とす。
const news = CHANGELOG.map(c => ({ date: c.date, title: c.title, body: c.body }))

// 中身の見張り。名前を変えた大会名が残っていたら気づけるようにする。
const banned = ['世界陸上', 'WORLD ATHLETICS']
const hits = banned.filter(w => JSON.stringify(news).includes(w))
if (hits.length > 0) {
  console.error(`旧名称が残っている: ${hits.join(' / ')} → appMeta.ts を直してからもう一度`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })
writeFileSync(out, JSON.stringify(news, null, 2) + '\n', 'utf8')
console.log(`できた: web/jpel-news.json（${news.length}件 / ${news[0].date} が最新）`)
console.log('このファイルを tokinets.com/jpel-news.json として置けば完了。')
