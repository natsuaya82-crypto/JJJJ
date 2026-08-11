/**
 * 「チャットのログが開くたびに伸びていかない」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-chat-log.ts
 *
 * 直したのは、保存済みログと今の用件を「文字列が同じか」だけで見比べていたこと。
 * 契約残の催促は「残り5ヶ月」→「残り4ヶ月」と毎レース文面が変わるので、
 * 別の発言として毎回足されてしまい、同じ催促が何行も積み上がっていた。
 * 今は発言に kind（用件の目印）を付けて、同じ用件なら増やさず文面だけ差し替える。
 */
import { mergeChatMessages } from '../src/utils/chatLog'
import type { ChatMessage } from '../src/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const remind = (m: number): ChatMessage =>
  ({ from: 'player', kind: 'contract_remind', text: `来シーズンの契約についてなのですが、まだ何も連絡がなくて。残り${m}ヶ月が気になっています。` })

console.log('\n[1] 同じ用件は何度開いても1行のまま')
{
  let log: ChatMessage[] = []
  log = mergeChatMessages(log, [remind(5)])
  check('最初は1行', log.length === 1)
  log = mergeChatMessages(log, [remind(4)])
  log = mergeChatMessages(log, [remind(3)])
  log = mergeChatMessages(log, [remind(2)])
  check('レースを進めても1行のまま', log.length === 1, `${log.length}行`)
  check('文面は最新に差し替わる', log[0].text.includes('残り2ヶ月'), log[0].text)
}

console.log('\n[2] 用件が違えば足す')
{
  const log = mergeChatMessages([remind(5)], [
    remind(5),
    { from: 'player', kind: 'transfer_wish', text: '他のクラブへの移籍を考えています。' },
  ])
  check('別の用件は足される', log.length === 2, `${log.length}行`)
  check('元の発言は残る', log[0].kind === 'contract_remind')
}

console.log('\n[3] 変わっていないときは同じ配列をそのまま返す（無駄な保存を起こさない）')
{
  const log = [remind(5)]
  check('同じ用件・同じ文面なら元のまま', mergeChatMessages(log, [remind(5)]) === log)
  check('用件が来ていなければ元のまま', mergeChatMessages(log, []) === log)
  check('からっぽのログには作った分がそのまま入る', mergeChatMessages([], [remind(5)]).length === 1)
}

console.log('\n[4] 目印の無い発言（会話の返答など）はこれまで通り文字列で見比べる')
{
  const talk: ChatMessage[] = [
    { from: 'gm', text: '来シーズンの契約について話し合いたい。' },
    { from: 'player', text: 'わかりました。どのような条件をお考えですか？' },
  ]
  check('同じ文面は足さない', mergeChatMessages(talk, talk) === talk)
  const added = mergeChatMessages(talk, [{ from: 'gm', text: '年俸5000万、2年契約でいかがでしょうか。' }])
  check('違う文面は足す', added.length === 3)
}

console.log('\n[5] 古いセーブ（目印の無いログ）から始めても増え続けない')
{
  // 2.0.1 までのログには kind が無い。差し替えは効かないが、1回足したあとは
  // 目印が付くので、そこから先は積み上がらない
  const old: ChatMessage[] = [{ from: 'player', text: '来シーズンの契約についてなのですが、まだ何も連絡がなくて。残り9ヶ月が気になっています。' }]
  let log = mergeChatMessages(old, [remind(5)])
  check('古い1行に新しい1行が足されて2行', log.length === 2)
  log = mergeChatMessages(log, [remind(4)])
  log = mergeChatMessages(log, [remind(3)])
  check('そこから先は増えない', log.length === 2, `${log.length}行`)
}

console.log('\n[6] 突き合わせが画面側にコピーし直されていない')
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(n) ? [p] : [])
})
const self = join('src', 'utils', 'chatLog.ts')
const copies = walk('src').filter(f => f !== self && /initialMessages\.some\(/.test(readFileSync(f, 'utf-8')))
check('突き合わせているのは chatLog.ts だけ', copies.length === 0, copies.join(', '))
const chat = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')
check('チャット画面が mergeChatMessages を使っている', chat.includes('mergeChatMessages'))
// 用件の目印を付け忘れると、その用件だけ昔と同じように積み上がる。
// **2か所以上に出る文面は utils/chatLines へ移した**ので、画面と文面の両方を見る
// （retire_ok / overseas_ok は chatLines 側にある。片方だけ見ていて落ちていた）
const lines = readFileSync(join('src', 'utils', 'chatLines.ts'), 'utf-8')
for (const kind of ['contract_remind', 'contract_demand', 'transfer_wish', 'retire', 'retire_ok', 'overseas_wish', 'overseas_ok', 'free_contact'])
  check(`用件の目印がある（${kind}）`, chat.includes(`kind: '${kind}'`) || lines.includes(`kind: '${kind}'`))

console.log('\n[7] 進路が決まった選手との会話は、そこで閉じている')
// 引退を承認した選手は、次に開くと来季契約の話に戻っていた（そこから移籍にも進めた）。
// 会話の中身もボタンも、talkSync の settledPath 1本で閉じること
check('チャット画面が settledPath を使っている', chat.includes('settledPath'))
// 会話の中身は chatLines の settledLineOf（中で settledPath を呼ぶ）、ボタンは画面側で直接。
// 文面を chatLines へ寄せたぶん画面側の呼び出しは減ったので、**両方の入口があること**を見る
check('会話の中身が settledPath を通っている（settledLineOf 経由）',
  chat.includes('settledLineOf(player)') && /settledPath\(player\)/.test(lines))
check('ボタン側も settledPath で閉じている', (chat.match(/settledPath\(player\)/g) ?? []).length >= 2)

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
