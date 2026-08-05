// バージョンを1箇所から書き込む。
//
// バージョンは src/data/appMeta.ts の APP_VERSION が唯一の出どころ。
// そこから
//   ・ios/App/App.xcodeproj/project.pbxproj の MARKETING_VERSION
//   ・package.json の version
//   ・package-lock.json の version（2箇所。npm ci が読む）
// を書き込む。手で3箇所を揃える運用だと必ずどれかを上げ忘れ、
// 「最新版なのにアップデートしてくださいが出る」事故（強制アップデートの誤表示）になる。
//
// ビルド番号(CFBundleVersion / CURRENT_PROJECT_VERSION)はここでは扱わない。
// git タグ build-NN の NN が唯一の正で、CI（.github/workflows/ios-deploy.yml）が書き込む。
//
// 使い方:
//   npm run sync:version          書き込む
//   npm run sync:version -- --check   ズレていたら異常終了する（CI用）

import { readFileSync, writeFileSync } from 'node:fs'

const META = 'src/data/appMeta.ts'
const PBX = 'ios/App/App.xcodeproj/project.pbxproj'
const PKG = 'package.json'
const LOCK = 'package-lock.json'
const check = process.argv.includes('--check')

const metaSrc = readFileSync(META, 'utf8')
const m = metaSrc.match(/export const APP_VERSION = 'v([^']+)'/)
if (!m) {
  console.error(`::error::${META} から APP_VERSION を読み取れません`)
  process.exit(1)
}
const version = m[1]

let changed = false
const report = (file, from, to) => {
  if (from === to) return
  changed = true
  console.log(`${check ? 'ズレ' : '更新'}: ${file}  ${from} -> ${to}`)
}

// ── iOS MARKETING_VERSION（Debug/Release の2箇所）──
const pbx = readFileSync(PBX, 'utf8')
const cur = pbx.match(/MARKETING_VERSION = ([^;]+);/)?.[1]
report(PBX, cur, version)
if (!check) writeFileSync(PBX, pbx.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`))

// ── package.json ──
const pkg = JSON.parse(readFileSync(PKG, 'utf8'))
report(PKG, pkg.version, version)
if (!check && pkg.version !== version) {
  pkg.version = version
  writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n')
}

// ── package-lock.json ──
// version は2箇所（ルートと packages[""]）に入っている。片方だけ直すと食い違う。
const lock = JSON.parse(readFileSync(LOCK, 'utf8'))
report(LOCK, lock.version, version)
if (!check && lock.version !== version) {
  lock.version = version
  if (lock.packages?.['']) lock.packages[''].version = version
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n')
}

if (check && changed) {
  console.error(`::error::バージョンがズレています。npm run sync:version を実行してコミットしてください（正: appMeta APP_VERSION = v${version}）`)
  process.exit(1)
}
console.log(check ? `OK: すべて v${version} で揃っています` : `完了: v${version} に揃えました`)
