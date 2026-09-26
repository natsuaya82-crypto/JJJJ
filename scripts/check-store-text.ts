/**
 * 【ストアの「最新情報」】いまの版の CHANGELOG の本文を、そのまま App Store に出せるか。
 *
 * ■なぜ要るのか
 *   審査に出す文は `scripts/store-submit.ts` が CHANGELOG から取る（写しを持たない）。
 *   Apple は長すぎる文と一部の文字（記号・絵文字・罫線）を 409 で断るので、
 *   お知らせを書き足した時点で気づけるようにする（提出の当日に落ちると、その場で文を直すことになる）。
 *
 * ■壊して確かめたこと
 *   本文に ✓ を足す → ②が落ちる／本文を 4001 文字にする → ②が落ちる／
 *   APP_VERSION のエントリを消す → ①が落ちる
 */
import { APP_VERSION } from '../src/data/appMeta'
import { storeTextProblems, whatsNewText } from './storeText'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

let text = ''
try { text = whatsNewText() } catch (e) { text = '' ; console.log(`  ${String(e)}`) }
check(`① CHANGELOG に ${APP_VERSION} の本文がある`, text.length > 0)
const bad = text ? storeTextProblems(text) : []
check('② Apple が断らない文（長さ・文字）', bad.length === 0, bad.join(' / '))
console.log(`     ${text.length} 文字`)

if (problems.length > 0) process.exit(1)
