/**
 * 【Xcode のプロジェクト定義】足した Swift が本当にビルドに入っているか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-xcode-project.ts \
 *     --outfile=node_modules/.cache/check-xc.cjs --log-level=error && node node_modules/.cache/check-xc.cjs
 *
 * ■なぜ要るか（実際に起きたこと・2026-08-20）
 *   下タブのガラス（GlassTabBarPlugin.swift）を足したとき、project.pbxproj へ
 *   4行を手で入れた。ところが**既にある MainViewController.swift と同じIDを振って**
 *   いたので、Xcode はそのIDの持ち主を1つしか見ず、新しいファイルは
 *   **1行もコンパイルされなかった**。
 *
 *       error: cannot find 'GlassTabBarPlugin' in scope
 *       warning: Skipping duplicate build file in Compile Sources build phase:
 *                MainViewController.swift
 *
 *   ローカルには Xcode が無いので、落ちるのは CI（ビルド20分待ち）だけ。
 *   ID の衝突も「Sources に入れ忘れ」も、pbxproj を読めばその場で分かる。
 *
 * ■見張るのは3つ
 *   ① オブジェクトのIDが重複していない（＝後勝ちで消えるファイルが無い）
 *   ② ios/App/App/*.swift が全部 Sources ビルドフェーズに入っている
 *   ③ MainViewController が登録しているプラグインの実体が全部ある
 */
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const PBX = 'ios/App/App.xcodeproj/project.pbxproj'
const SWIFT_DIR = 'ios/App/App'
const pbx = readFileSync(PBX, 'utf8')

// ── ① IDの重複 ─────────────────────────────────────────
// 定義の行（`\t\tID /* 名前 */ = {isa = …`）だけを数える。参照側は同じIDが何度も出る
const defs = [...pbx.matchAll(/^\t\t([0-9A-F]{24}) \/\* (.+?) \*\/ = \{isa = (\w+)/gm)]
const seen = new Map<string, string>()
const dupes: string[] = []
for (const [, id, label] of defs) {
  const prev = seen.get(id)
  if (prev !== undefined) dupes.push(`${id}（${prev} と ${label}）`)
  else seen.set(id, label)
}
check(`オブジェクトのIDが重複していない（${defs.length}件）`, dupes.length === 0,
  `${dupes.join(' / ')} — 同じIDだと片方しかビルドに入りません`)

// ── ② Swift が全部 Sources に入っているか ────────────────
const swifts = readdirSync(SWIFT_DIR).filter(f => f.endsWith('.swift'))
const sources = pbx.match(/isa = PBXSourcesBuildPhase;[\s\S]*?files = \(([\s\S]*?)\);/)?.[1] ?? ''
const missing = swifts.filter(f => !sources.includes(`${f} in Sources`))
check(`ios/App/App の .swift が全部ビルドに入っている（${swifts.length}件）`, missing.length === 0,
  `${missing.join(', ')} が Sources に入っていません（cannot find … in scope になります）`)

// PBXFileReference と PBXBuildFile の両方があるか（片方だけだと Xcode が開けない）
for (const f of swifts) {
  const hasRef = new RegExp(`PBXFileReference;[^}]*path = ${f};`).test(pbx)
  const hasBuild = pbx.includes(`${f} in Sources */ = {isa = PBXBuildFile`)
  check(`${f} の file/build 両方の定義がある`, hasRef && hasBuild,
    `${hasRef ? '' : 'PBXFileReference '}${hasBuild ? '' : 'PBXBuildFile '}が足りません`)
}

// ── ③ 登録しているプラグインの実体があるか ────────────────
const mvc = readFileSync(`${SWIFT_DIR}/MainViewController.swift`, 'utf8')
const registered = [...mvc.matchAll(/registerPluginInstance\((\w+)\(\)\)/g)].map(m => m[1])
const declared = new Set(swifts.flatMap(f =>
  [...readFileSync(`${SWIFT_DIR}/${f}`, 'utf8').matchAll(/class (\w+): CAPPlugin/g)].map(m => m[1])))
const noImpl = registered.filter(p => !declared.has(p))
check(`登録しているプラグインの実体が全部ある（${registered.length}件）`, noImpl.length === 0,
  `${noImpl.join(', ')} の class が ios/App/App にありません`)

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
