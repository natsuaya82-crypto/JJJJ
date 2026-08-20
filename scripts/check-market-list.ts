/**
 * 【移籍市場の検索結果を、全部いちどに描かないこと】
 *
 * ■なにが起きたか（テスターの報告・2026-08-20）
 *   「移籍市場で国籍や年齢など何も選ばずに検索を押した場合とても重くなって
 *     スクロールが上手くできなかったり、タイトルに戻ることがある」
 *
 *   何も選ばずに検索すると、条件に当たるのは**5,775人**（世界5,800人 − 自チーム）。
 *   それを1件残らず `PlayerRow` にして並べていた。上限も、画面に映っているぶんだけ
 *   描く仕組みも無い。実機ではメモリが尽きて **WebView ごと読み直され、
 *   タイトル画面に戻る**。ブラウザのプレビューでは再現しにくい。
 *
 * ■いまの決まり（オーナー判断・2026-08-20「aにしよう / 100件ずつ出るように」）
 *   先頭 `MARKET_PAGE` 件だけ描いて、「もっと見る」で100件ずつ増やす。
 *
 * ■この点検が守るもの
 *   ①描くのは `slice` したぶんだけ（`marketPlayers.map` に戻っていない）
 *   ②「もっと見る」がある（`slice` だけ入れて残りが見られない、を防ぐ）
 *   ③絞り込み・並べ替えを変えたら先頭に戻る（前の続きから100件、にしない）
 *   ④件数は定数1本（画面に 100 を手書きしない）
 */
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const page = readFileSync('src/components/transfer/TransferPage.tsx', 'utf8')

// ① 全部は描かない
check('検索結果は slice したぶんだけ描く',
  /marketPlayers\.slice\(0, mktShown\)\.map\(/.test(page))
check('marketPlayers をそのまま map していない',
  !/marketPlayers\.map\(/.test(page))

// ② 残りを見る道がある
check('「もっと見る」がある', /もっと見る/.test(page) && /setMktShown\(n => n \+ MARKET_PAGE\)/.test(page))
check('残りの件数を出している', /marketPlayers\.length - mktShown/.test(page))

// ③ 条件を変えたら先頭に戻る
check('絞り込み・並べ替えを変えたら先頭に戻る',
  /setMktShown\(MARKET_PAGE\)[\s\S]{0,80}\[location\.key, mktSortKey, mktSortDir\]/.test(page))

// ④ 件数は定数1本
check('1ページの件数は定数1本', /const MARKET_PAGE = \d+/.test(page))
const hardcoded = (page.match(/slice\(0, *\d+\)/g) ?? [])
check('画面に件数を手書きしていない', hardcoded.length === 0, hardcoded.join(' '))

console.log(failed === 0 ? '✓ 移籍市場の検索結果: OK' : `✗ ${failed}件`)
process.exit(failed === 0 ? 0 : 1)
