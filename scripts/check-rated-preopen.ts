/**
 * 【ランクマッチの画面は、始まる前でも中身がある】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「9/1からのレート戦の画面なにもないけど？いきなり現れんの？
 *     参加するとかのボタンもないしなに？」
 *
 *   `RatedPage` は `fetchToday()` しか見ていませんでした。これは
 *
 *     ・その日の 10:00 前
 *     ・大会が始まっていない（9/1 より前）
 *     ・大会そのものが無い
 *
 *   の**どれでも null** を返します。中身（今日のコース・締め切り・参加するボタン）が
 *   まるごと `{today && …}` の中にあったので、開始前はレートの数字しか出ません。
 *
 *   `fetchEvent()` は**始まる前でも**大会名・開始日・日数を返します
 *   （`rated_today` が `{open:false, name, startsOn, totalDays}` を返す）。
 *   イベント一覧はこれを使っているのに、肝心のランクマッチの画面が使っていませんでした。
 *
 * ■この点検が守るもの
 *   ①ランクマッチの画面が `fetchEvent` を読む
 *   ②「今日のぶん」が無くても状態を出す枝がある
 *   ③参加ボタンは `{today && …}` の中に戻っていない（開始前でも出る）
 *   ④押せないときは理由がボタンの見出しに出る
 *   ⑤殿堂入りの警告を「受付が開いているか」で出さない（開始前に嘘が出る）
 */
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const page = readFileSync('src/components/rated/RatedPage.tsx', 'utf8')
const api = readFileSync('src/lib/ratedApi.ts', 'utf8')

console.log('[1] 大会の情報は fetchEvent 1本（始まる前でも返る）')
{
  check('fetchEvent が開始前も返す形になっている',
    /始まる前でも返る/.test(api) && /startsOn/.test(api))
  check('ランクマッチの画面が fetchEvent を読む', /fetchEvent\(\)/.test(page))
  // ★大会の情報を2か所から引かないこと（ratedApi のコメントの決まり）
  check('画面が rpc を直接叩いていない', !/supabase\.rpc\(/.test(page))
}

console.log('\n[2] 「今日のぶん」が無くても状態を出す')
{
  check('today が無いときの枝がある', /\{!today && evLoaded &&/.test(page))
  check('開始日を出している', /startLabel/.test(page))
  check('大会が無いときの文言がある', page.includes('開催予定なし') || page.includes('NO EVENT'))
}

console.log('\n[3] 参加ボタンは開始前でも画面に出る')
{
  // ★ここが本体。ボタンが `{today && …}` の中に戻ったら落とす。
  //   today ブロックの終わり（`</>`）より後ろに参加ボタンがあることを見る
  const endOfToday = page.indexOf('</>')
  const joinAt = page.indexOf('{/* ── 参加する ── */}')
  check('参加ボタンが today ブロックの外にある', joinAt > endOfToday && endOfToday > 0,
    `today の終わり ${endOfToday} / 参加 ${joinAt}`)
  check('受付が開いていないと押せない', /const openable = !!today/.test(page))
  check('押せるかの判定に受付の状態が入っている', /canJoin\(hof\) && \(openable/.test(page))
}

console.log('\n[3b] 開催前でも「参加する」は押せる（申し込みと提出は別）')
{
  // ★オーナー・2026-08-19「参加するボタン欲しくね。そしたら参加者一覧出る」
  //   「9/1にロスター提出するんだよ？」＝申し込みは先、メンバーは当日。
  check('開催前の参加の枝がある', /const canEnter = /.test(page))
  check('押せるかの判定に入っている', /\(openable \|\| canEnter\)/.test(page))
  check('もう入っている人は押せない', /&& !joined/.test(page))
  // 申し込んだだけで編成画面へ飛ばさない（当日まで組めない）
  check('開催前は編成へ飛ばさない', /if \(!openable\) \{[\s\S]{0,120}return \}/.test(page))
  check('申し込んだあと、次に何が起きるかを出す', /メンバーは .*から組みます/.test(page))
  check('開催前は一覧の見出しが「参加者」', /startsLater \? '参加者'/.test(page))
}

console.log('\n[3c] 大会を選ぶのはサーバーの1本（rated_current_event）')
{
  const sql = readFileSync('supabase/all.sql', 'utf8')
  check('rated_current_event がある', /create function public\.rated_current_event\(\)/.test(sql))
  // ★以前は3つ（join / me / standings）が「今日が期間の中か」を手書きしていて、
  //   開催前は「大会が無い」扱いだった＝参加も一覧も出せない
  const calls = (sql.match(/public\.rated_current_event\(\)/g) ?? []).length
  check('3つの関数がそこを通っている（定義＋drop＋3呼び出し）', calls === 5, `${calls}`)
  check('期間の手書きが残っていない',
    !/rated_today_jst\(\) between starts_on/.test(sql))
}

console.log('\n[4] 押せないときは理由がボタンに出る')
{
  check('ボタンの見出しが状態で変わる', /openable[\s\S]{0,300}から`/.test(page))
  // ★時刻は `lib/ratedApi` の `RESULT_HHMM` 1本（サーバーの `rated_open_round` と同じ 10:00）。
  //   ここに `const OPEN_HHMM = '10:00'` と2本目を書いていた（2026-08-18 の監査で発見）。
  //   同じファイルが ratedApi から他の定数を import しているのに、これだけ手書きだった
  check('受付の開始時刻を ratedApi から引いている',
    /RESULT_HHMM/.test(page) && !/const OPEN_HHMM/.test(page))
}

console.log('\n[5] 殿堂入りの警告を「受付が開いているか」で出さない')
{
  // eligible は受付の状態も見ているので、そのまま使うと開始前に「殿堂入り 0/7」と嘘が出る
  check('警告は canJoin だけを見る', /\{!canJoin\(hof\) && \(/.test(page))
  check('eligible では出していない', !/\{!eligible && \(/.test(page))
}

console.log('')
if (failed > 0) { console.log(`✗ 始まる前のランクマッチが空っぽになります（${failed}件）`); process.exit(1) }
console.log('✓ 始まる前でも、いつ始まるか・押せるかが画面に出る')
