/**
 * チャットの同じ文面が2か所以上に書かれていないかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-chat-dup.ts --outfile=/tmp/ccd.cjs && node /tmp/ccd.cjs
 *
 * チャットのバグはほぼ全部「同じ話を別の場所で書き直している」ことから出ている。
 *   ・承諾の礼が、ボタン側と作り直し側で別の文面 → 2回並ぶ
 *   ・契約の提示が3か所にあり、片方だけ金額の書き方が違う
 * 文字列そのものを見張れば、同じものを2度書いた時点で落ちる。
 * 共通の文面は utils/chatLines.ts に置いて、呼ぶ側は組み立てないこと。
 */
import { readFileSync } from 'fs'

const FILES = ['src/components/team/ChatPage.tsx']
const problems: string[] = []

for (const f of FILES) {
  const src = readFileSync(f, 'utf8')
  const counts = new Map<string, number>()
  // text: に続く文字列（テンプレート or シングルクォート）
  for (const m of src.matchAll(/text:\s*(`[^`]*`|'[^']*')/g)) {
    const t = m[1]
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const dup = [...counts.entries()].filter(([, n]) => n >= 2)
  console.log(`${f}  文面 ${[...counts.values()].reduce((a, b) => a + b, 0)}件 / 重複 ${dup.length}種類`)
  for (const [t, n] of dup) {
    problems.push(`${f}: ${n}回 ${t.slice(0, 50)}`)
    console.log(`  NG  ${n}回  ${t.slice(0, 60)}`)
  }
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 同じ文面を2か所に書いている場所は無い')
  process.exit(0)
}
console.log(`✗ ${problems.length}件。utils/chatLines.ts に出して、両方からそれを呼ぶこと`)
process.exit(1)
