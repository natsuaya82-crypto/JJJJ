/**
 * 【タブは URL に覚えさせる（戻ったとき先頭に戻らない）】
 *
 * ■なぜ要るのか（オーナー・2026-08-15）
 *   「3つに分かれてる1部2部3部とかもそうだけど、ここから詳細とか見ると
 *     別ページに飛ばされるの地味に嫌だ！」
 *   「3部の詳細見てて戻ったら1部になってるとか」
 *
 *   タブを `useState` に持たせていると、詳細ページへ行った時点で画面ごと作り直され、
 *   戻ったときに**必ず先頭のタブに戻ります**。走友会でカードを見ていたのに戻ると
 *   メンバー、3部の順位表を見ていたのに戻ると1部。
 *
 *   置き場所は URL（`?tab=cards`）。「戻る」は `navigate(-1)` なので、履歴に残った
 *   URLがそのまま戻ってきます（`src/lib/useStickyTab.ts`）。
 *
 * ■この点検が守るもの
 *   ① 入れものの中身（既定・URLにある値・知らない値・書き換えは replace か）
 *   ② **タブを持つ画面が実際に `useStickyTab` を通しているか**
 *      （関数を叩くだけだと、画面が `useState` に戻っても緑になる）
 *   ③ パスに埋め込む形へ戻っていないか（`location.pathname` が変わると
 *      ページの出現アニメが毎回走る）
 */
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 入れものの中身（URLの読み書き）')
{
  const src = readFileSync('src/lib/useStickyTab.ts', 'utf8')
  check('URLのクエリを読んでいる（useSearchParams）', /useSearchParams\(\)/.test(src))
  // ★ここが本体。push にすると、タブを3回押してから戻るとタブを1つずつ遡るだけになる
  check('**書き換えは replace**（履歴を積まない）', /setParams\(next, \{ replace: true \}\)/.test(src))
  check('知らない値は既定に落とす', /values\.find\(v => String\(v\) === raw\) \?\? fallback/.test(src))
  check('既定と同じときはURLに残さない', /next\.delete\(key\)/.test(src))
}

console.log('\n[2] タブを持つ画面が実際に通しているか')
{
  // ★**画面を名指しで見る**。関数を叩くだけの点検だと、画面が useState に戻っても緑になる
  const SCREENS: [string, string, string][] = [
    ['順位表の部（1部/2部/3部）', 'src/components/teams/StandingsPage.tsx', 'division'],
    ['走友会のタブ（メンバー/カード/掲示板）', 'src/components/friends/FriendClubPage.tsx', 'tab'],
    ['マイチーム（1軍/レンタル）', 'src/components/team/TeamManagement.tsx', 'activeTab'],
  ]
  for (const [label, file, name] of SCREENS) {
    const src = readFileSync(file, 'utf8')
    check(`${label} が useStickyTab を通している`, new RegExp(`\\[${name}, set\\w+\\] = useStickyTab`).test(src),
      `${file}`)
    // 同じ名前で useState に戻したら落とす
    check(`${label} が useState に戻っていない`, !new RegExp(`\\[${name}, set\\w+\\] = useState`).test(src))
  }
}

console.log('\n[3] パスに埋め込む形へ戻っていない')
{
  // 出現アニメは location.pathname で動く（App.tsx）。パスを書き換えると
  // タブを押すたびにページごと出直す
  const app = readFileSync('src/App.tsx', 'utf8')
  check('出現アニメが見ているのは pathname のまま', /\[location\.pathname\]/.test(app))
  const stand = readFileSync('src/components/teams/StandingsPage.tsx', 'utf8')
  check('順位表がタブでパスを書き換えていない', !/navigate\(`\/standings\/d\$\{/.test(stand))
}

console.log('')
if (failed > 0) { console.log(`✗ タブが戻ったときに先頭へ戻ります（${failed}件）`); process.exit(1) }
console.log('✓ タブはURLに覚えている。詳細から戻っても見ていたところのまま')
