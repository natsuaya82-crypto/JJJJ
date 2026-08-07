/**
 * チャットの同じ文面が2か所以上に書かれていないか／用件の目印（kind）が付いているかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-chat-dup.ts --outfile=/tmp/ccd.cjs && node /tmp/ccd.cjs
 *
 * ■チャットのバグはほぼ全部「同じ話を別の場所で書き直している」ことから出ている
 *   発言は2系統から積まれる。
 *     ・組み立て（buildMessages）… いまの状態から作り直す
 *     ・ボタン（append）        … 押した瞬間にその場で足す
 *   同じ用件を両方が別々に書いていると、**片方の書き方が変わった瞬間に2行並ぶ**。
 *
 * ■前のこの見張りは役に立っていなかった
 *   ソースの文字列をそのまま比べていたので、
 *     ・片方がバッククォート／片方がシングルクォート → 別物とみなす
 *     ・埋め込みの変数名が違う（contractReq.counterSalary と updated.counterSalary）→ 別物
 *   実際に重なっていた4件を1件も見つけられず「重複0種類」と出していた。
 *   **描画後の形に正規化して比べる**（クォートを外し、${...} を1文字に潰す）。
 *
 * ■kind も見る
 *   kind が無い発言は、突き合わせ（utils/chatLog の mergeChatMessages）が
 *   文字列の完全一致でしか重複を潰せない。1文字でも変われば2行になる。
 *   だから**発言には必ず kind を付ける**。
 */
import { readFileSync } from 'fs'

const FILES = ['src/components/team/ChatPage.tsx']
const problems: string[] = []

/** 描画後に同じ見た目になるかどうかで比べる形にする */
function normalize(quoted: string): string {
  const body = quoted.slice(1, -1)
  return body.replace(/\$\{[^}]*\}/g, '§').replace(/\s+/g, '')
}

const TEXT = /text:\s*(`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*')/g
const MSG = /\{\s*from:\s*'(?:player|gm)'((?:[^{}]|\{[^{}]*\})*?)text:/gs

for (const f of FILES) {
  const src = readFileSync(f, 'utf8')

  // ① 描画後が同じになる文面
  const at = new Map<string, number[]>()
  for (const m of src.matchAll(TEXT)) {
    const key = normalize(m[1])
    if (key.length === 0) continue
    const line = src.slice(0, m.index).split('\n').length
    const l = at.get(key)
    if (l) l.push(line); else at.set(key, [line])
  }
  const dup = [...at.entries()].filter(([, l]) => l.length >= 2)
  console.log(`${f}  文面 ${[...at.values()].reduce((a, b) => a + b.length, 0)}件 / 描画後が同じ ${dup.length}種類`)
  for (const [k, l] of dup) {
    problems.push(`${f}:${l.join(',')} 同じ文面が${l.length}か所`)
    console.log(`  NG  L${l.join(',')}  ${k.slice(0, 56)}`)
  }

  // ② kind の付いていない発言
  const noKind: number[] = []
  let total = 0
  for (const m of src.matchAll(MSG)) {
    total++
    if (!/kind:/.test(m[1])) noKind.push(src.slice(0, m.index).split('\n').length)
  }
  console.log(`${f}  発言 ${total}件 / kind なし ${noKind.length}件`)
  for (const l of noKind) {
    problems.push(`${f}:${l} kind が無い`)
    console.log(`  NG  L${l}  用件の目印（kind）が無い`)
  }
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 同じ文面の二重書きは無く、発言には全部 kind が付いている')
  process.exit(0)
}
console.log(`✗ ${problems.length}件。文面は utils/chatLines.ts に出して両方からそれを呼ぶ／発言には kind を付ける`)
process.exit(1)
