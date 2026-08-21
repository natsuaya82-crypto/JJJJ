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
import { readFileSync, readdirSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

/** 上に並ぶ切り替えを持つ画面（見出し・ファイル・状態の名前） */
const SCREENS: [string, string, string][] = []

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
  //
  // ★**上に並ぶ切り替えを新しく作ったら、ここへ1行足すこと。**
  //   足さないと「その画面だけ左端に戻る」が黙って戻ってくる。
  SCREENS.push(
    ['順位表の部（1部/2部/3部）', 'src/components/teams/StandingsPage.tsx', 'division'],
    ['走友会のタブ（メンバー/カード/掲示板）', 'src/components/friends/FriendClubPage.tsx', 'tab'],
    ['マイチーム（1軍/レンタル）', 'src/components/team/TeamManagement.tsx', 'activeTab'],
    ['記録室のセクション', 'src/components/records/RecordsPage.tsx', 'idx'],
    ['スポンサー（契約中/オファー）', 'src/components/sponsors/SponsorPage.tsx', 'tab'],
    ['クラブ詳細のページャ', 'src/components/teams/TeamDetailPage.tsx', 'activePage'],
    ['クラブ詳細の出入り（加入/放出）', 'src/components/teams/TeamDetailPage.tsx', 'moveTab'],
    ['チャット（自チーム/移籍・獲得）', 'src/components/team/ChatPage.tsx', 'activeTab'],
    ['フレンド詳細のページャ（ロスター/殿堂入り）', 'src/components/friends/FriendDetailPage.tsx', 'page'],
  )
  for (const [label, file, name] of SCREENS) {
    const src = readFileSync(file, 'utf8')
    check(`${label} が useStickyTab を通している`, new RegExp(`\\[${name}, set\\w+\\] = useStickyTab`).test(src),
      `${file}`)
    // 同じ名前で useState に戻したら落とす
    check(`${label} が useState に戻っていない`, !new RegExp(`\\[${name}, set\\w+\\] = useState`).test(src))
  }
}

console.log('\n[2-b] 一覧に載っていないタブが増えていないか（画面を数える）')
{
  // ★**上の SCREENS は手で書いた名簿。** 足し忘れたら「その画面だけ左端に戻る」が
  //   黙って戻ってくる。`run-checks.mjs` が点検のファイルを**実際に数えて**いるのと
  //   同じ形にして、画面のほうも数える。
  //
  //   タブらしい `useState` ＝ **文字の選択肢を持つ状態**（`useState<'a' | 'b'>`）で、
  //   名前が tab / page / view / division / section のもの。並び替え・フィルタ・
  //   その場かぎりの流れ（レース結果の中の切り替えなど）は対象外なので、
  //   **理由を書いて `NOT_A_TAB` に入れる**（「漏れた」と「あえて」を区別するため）。
  const NOT_A_TAB: Record<string, string> = {
    'src/components/race/ResultsPhase.tsx:view':
      'レース結果の中のドリルダウン。詳細ページへ出ていかないので戻る話が起きない',
    'src/components/rated/RatedResultPage.tsx:view':
      '見る→走る→結果、の一本道。切り替えではない',
    'src/components/online/FinishPanel.tsx:tab':
      'オンライン対戦の結果パネル。その対戦の中だけで、開き直すと最初から',
  }
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.tsx')) files.push(p)
    }
  }
  walk('src/components')
  const registered = new Set(SCREENS.map(([, f, n]) => `${f}:${n}`))
  const missed: string[] = []
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/const \[(\w+), set\w+\] = useState<'[^>]*\|[^>]*>/g)) {
      const key = `${f}:${m[1]}`
      if (!/tab|page|view|division|section/i.test(m[1])) continue
      if (registered.has(key) || NOT_A_TAB[key]) continue
      missed.push(key)
    }
  }
  check('一覧に無いタブが増えていない', missed.length === 0,
    `${missed.join(' / ')}\n      → useStickyTab に寄せて SCREENS に足すか、タブでない理由を NOT_A_TAB に書くこと`)
  // ★**除外の名簿が腐っていないか**も見る（消した画面の言い訳が残ると、
  //   次に同じ名前で作ったタブが黙って通る）
  const stale = Object.keys(NOT_A_TAB).filter(k => {
    const [f, n] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)]
    return !files.includes(f) || !new RegExp(`const \\[${n}, set\\w+\\] = useState<'`).test(readFileSync(f, 'utf8'))
  })
  check('「タブではない」の言い訳が全部いまも当たっている', stale.length === 0, stale.join(' / '))
}

console.log('\n[3] スワイプで動くページャは、覚えていた位置へ寄せ直す')
{
  // ★横スワイプのページャは**位置を覚えるだけでは足りない**。開いたときに
  //   実際にそこへ寄せ直さないと、タブの見た目だけ右で中身は左端のまま、になる。
  //   `behavior: 'smooth'` にしないこと（開いた瞬間に横へ流れて見える）
  for (const [label, file, ref] of [
    ['クラブ詳細', 'src/components/teams/TeamDetailPage.tsx', 'scrollRef'],
    ['フレンド詳細', 'src/components/friends/FriendDetailPage.tsx', 'pagerRef'],
  ] as const) {
    const src = readFileSync(file, 'utf8')
    check(`${label} が覚えていた位置へ寄せ直す`,
      new RegExp(`${ref}\\.current[\\s\\S]{0,400}?el\\.scrollLeft = want`).test(src), file)
    check(`${label} の寄せ直しはなめらかにしない`,
      !/scrollLeft = want[\s\S]{0,40}smooth/.test(src))
  }
}

console.log('\n[4] パスに埋め込む形へ戻っていない')
{
  // 出現アニメは location.pathname で動く（App.tsx）。パスを書き換えると
  // タブを押すたびにページごと出直す
  const app = readFileSync('src/App.tsx', 'utf8')
  check('出現アニメが見ているのは pathname のまま', /\[location\.pathname\]/.test(app))
  const stand = readFileSync('src/components/teams/StandingsPage.tsx', 'utf8')
  check('順位表がタブでパスを書き換えていない', !/navigate\(`\/standings\/d\$\{/.test(stand))
}

console.log('\n[5] 開いている会話も URL 1本（チャット）')
{
  // ★タブと同じ話。**誰との会話を開いているか**を `useState` に持っていたので、
  //   会話の中から相手クラブのページへ飛んで戻ると `/team/chat` が作り直され、
  //   会話ではなく**チャット一覧**が出ていた（オーナー・2026-08-21
  //   「ここからチーム見たら戻るとチャット画面まで戻るのは何故？」）。
  //   戻るボタン（navigate(-1)）は1つ前へ戻っていて、**1つ前が会話でなかった**。
  const src = readFileSync('src/components/team/ChatPage.tsx', 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')  // 経緯の説明文に当てない
  check('会話の相手は URL から読む', /const chatPlayerId = searchParams\.get\('player'\)/.test(src))
  check('トレードの相手も URL から読む', /const tradeTeamId = searchParams\.get\('trade'\)/.test(src))
  check('会話の相手を useState に戻していない',
    !/\[(chatPlayerId|tradeTeamId)(,\s*set\w+)?\] = useState/.test(src))  // setter 無しの形も見る
  // ★ここが本体。入った直後に消していたので、`?player=` で来ても履歴に残らなかった
  check('**URLのパラメータを消す replace を書いていない**',
    !/navigate\('\/team\/chat[^']*',\s*\{\s*replace: true/.test(src))
  check('location.state で会話の相手を渡す道が無い', !/location\.state as \{ tradeTeamId/.test(src))
  check('閉じるのは navigate(-1) 1本', /const closeConversation = \(\) => navigate\(-1\)/.test(src))
}

console.log('')
if (failed > 0) { console.log(`✗ タブが戻ったときに先頭へ戻ります（${failed}件）`); process.exit(1) }
console.log('✓ タブはURLに覚えている。詳細から戻っても見ていたところのまま')
