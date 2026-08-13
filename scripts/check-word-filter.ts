/**
 * 掲示板の伏せ字（※）の網。
 *
 * ■何を守るか
 *   ① **判定は `utils/wordFilter` 1本。** 画面や lib に語の一覧を書かない
 *   ② **表示のときだけ伏せる。** 送る側で伏せると、通報が来ても何が書かれたのか分からない
 *   ③ **すり抜けの形を潰す。** `し ね` `シネ` `ｼﾈ` `ＬＩＮＥ` が素通しにならない
 *   ④ **巻き込まない。** 「おいしねぇ」「バカだなあ」は伏せない（オーナー判断で
 *      バカ・アホ・うざいの類は入れない）
 *
 * ■壊して確かめたこと（8通り。全部落ちた）
 *   ・半角カナの変換をやめる                         → [2] が落ちる
 *   ・全角英数のあとの小文字化をやめる               → [2] が落ちる
 *   ・`AMBIGUOUS` を「かな3文字以下は全部」に戻す    → [2] が3件落ちる
 *   ・`PATTERNS` の4本を1本ずつ消す                  → [2] がそれぞれ落ちる
 *   ・`FriendClubPage` の `maskText(p.body)` を外す  → [3] が落ちる
 *
 * ■「※が含まれる」だけで見てはいけない（実際に踏んだ）
 *   語の表に `http` が入っているので、URLの網を丸ごと消しても
 *   `※※※※※://foo.xyz/a` になって「※が含まれる」は通る。
 *   **URLと電話番号は「全部が※か」を見る**（`WHOLE`）。
 *   ここを緩くしていたあいだ、網を2本消しても緑のままだった。
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { maskText, hasMaskedWord, MASK_CHAR } from '../src/utils/wordFilter'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 伏せ方')
{
  check('当たった部分だけを ※ に置き換える（長さは変わらない）',
    maskText('しねよ').length === 'しねよ'.length)
  check('前後は残る', maskText('もう消えろよ') === `もう${MASK_CHAR.repeat(3)}よ`, maskText('もう消えろよ'))
  check('何も当たらなければ元の文のまま', maskText('また明日走りましょう') === 'また明日走りましょう')
  check('空文字でも落ちない', maskText('') === '')
  check('hasMaskedWord は maskText と同じ判定',
    hasMaskedWord('しね') && !hasMaskedWord('がんばろう'))
}

console.log('\n[2] すり抜けと巻き込み')
{
  // ★ここはリテラルで留める。表を読んで表と比べても何も守れない
  const HIT = [
    ['しねよ', '直接'], ['し ね', '空白ではさむ'], ['し・ね', '記号ではさむ'],
    ['シネ', 'カタカナ'], ['ｼﾈ', '半角カナ'], ['死ね', '漢字'], ['氏ね', '当て字'],
    ['ころすぞ', 'かな＋助詞'], ['殺すぞ', '漢字＋助詞'],
    ['LINE教えて', '外部への誘導'], ['ＬＩＮＥやろう', '全角'],
    ['ラインのスタンプ', 'カタカナの誘導'], ['discord来て', '英字'],
    ['09012345678', '電話番号'], ['090-1234-5678', '区切りつき電話番号'],
    ['えっちだね', '性的'], ['きちがい', '差別'],
  ]
  for (const [text, why] of HIT) {
    const out = maskText(text)
    check(`伏せる（${why}）: ${text}`, out.includes(MASK_CHAR), `→ ${out}`)
  }

  const PASS = [
    ['おいしねぇ', 'しね が語の中に埋まっている'],
    ['まぶしねー', '同上'],
    ['バカだなあ', 'バカは入れない（オーナー判断）'],
    ['アホやん', 'アホは入れない'],
    ['うざいけど好き', 'うざいは入れない'],
    ['優勝しました！', 'ふつうの書き込み'],
    ['また明日走りましょう', '同上'],
    ['カードありがとう', '同上'],
  ]
  for (const [text, why] of PASS) {
    const out = maskText(text)
    check(`伏せない（${why}）: ${text}`, out === text, `→ ${out}`)
  }

  // ★URLは**丸ごと**消えないと意味がない。
  //   語の表に 'http' が入っているので「※※※※://foo.xyz/a」でも
  //   「※が含まれる」だけの判定は通ってしまう。**全部が※か**を見る。
  const WHOLE = [
    ['https://example.com/a', 'よくあるURL'],
    ['https://foo.xyz/a', '知らない末尾（scheme の網でしか拾えない）'],
    ['tokinets.com', 'scheme なし（末尾の網でしか拾えない）'],
    ['www.foo.jp', 'www'],
    ['09012345678', '電話番号'],
    ['090-1234-5678', '区切りつき電話番号'],
  ]
  for (const [text, why] of WHOLE) {
    const out = maskText(text)
    check(`丸ごと伏せる（${why}）: ${text}`, out === MASK_CHAR.repeat(text.length), `→ ${out}`)
  }
}

console.log('\n[3] 掲示板の本文は必ず maskText を通している')
{
  const src = readFileSync('src/components/friends/FriendClubPage.tsx', 'utf8')
  check('本文を maskText に通している', /maskText\(p\.body\)/.test(src))
  check('素の p.body を直接描いていない',
    !/\{p\.body\}/.test(src) && !/>\s*\{\s*p\.body\s*\}/.test(src))
}

console.log('\n[4] 送るときは伏せない（保存は書かれたそのまま）')
{
  const api = readFileSync('src/lib/clubsApi.ts', 'utf8')
  // コメントで触れるのは構わない。**import して送る前に伏せていないか**を見る
  check('clubsApi は wordFilter を import していない',
    !/^\s*import[^\n]*wordFilter/m.test(api))
  check('送る本文に maskText をかけていない', !/maskText\(/.test(api))
  check('postClubText がある', /export async function postClubText/.test(api))
}

console.log('\n[5] 語の一覧は wordFilter 1本')
{
  // 他所に同じ判定が生えていないか。**src 全部を数える**（除外表は置かない）
  const out = execSync(
    `grep -rln "しね\\|ころす\\|きちがい" src/ --include=*.ts --include=*.tsx || true`,
    { encoding: 'utf8' },
  ).trim()
  const files = out ? out.split('\n') : []
  const extra = files.filter(f => f !== 'src/utils/wordFilter.ts')
  check('語の一覧を持っているのは wordFilter だけ', extra.length === 0, extra.join(' '))
}

console.log('')
if (failed > 0) { console.log(`✗ ${failed}件 NG`); process.exit(1) }
console.log('OK')
