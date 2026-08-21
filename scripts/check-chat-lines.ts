/**
 * チャットの「承諾したあとの本人の返事」が二重に並ばないことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-chat-lines.ts --outfile=/tmp/ccl.cjs && node /tmp/ccl.cjs
 *
 * ログは2つの経路で積まれる。
 *   ・ボタンを押したときにその場で足す（append）
 *   ・次に開いたときに、いまの状態から作り直して足す（mergeChatMessages）
 * 同じ用件を両方が別の文で書いていたので、礼が2回並んでいた。
 *
 *   ありがとうございます！絶対に結果を出します。オファーが来たらよろしくお願いします！
 *   海外挑戦を認めていただき、ありがとうございます。ヨーロッパのクラブからの話を待ちます。
 *
 * 重複を潰す仕組みは kind が同じものを1つにまとめる。文面を utils/chatLines の1本から
 * 取れば、ボタン側にも同じ kind が付くので並ばない。
 */
import { overseasApprovedLine, retireApprovedLine, settledLineOf } from '../src/utils/chatLines'
import { buildIncomingOfferMessages } from '../src/utils/chatTalk'
import { readFileSync } from 'node:fs'
import { mergeChatMessages } from '../src/utils/chatLog'
import type { ChatMessage, Player } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const gm = (text: string): ChatMessage => ({ from: 'gm', text })

console.log('[海外挑戦を認める]')
{
  // ボタンを押した直後のログ
  const afterClick: ChatMessage[] = [
    { from: 'player', kind: 'overseas_wish', text: '監督、真剣な話があります。海外挑戦を認めてもらえませんか？' },
    gm('わかりました。あなたの走りはもう世界レベルです。夢を応援します。良いオファーを待ちましょう。'),
    overseasApprovedLine('europe'),
  ]
  // 次に開いたとき：状態から作り直したぶん
  const player = { overseasListed: 'europe' } as unknown as Player
  const fresh = [settledLineOf(player)!]
  const merged = mergeChatMessages(afterClick, fresh)
  const thanks = merged.filter(m => m.kind === 'overseas_ok')
  check('礼は1つだけ', thanks.length === 1, `${thanks.length}件`)
  check('ログが伸びない', merged.length === afterClick.length, `${merged.length}件（${afterClick.length}件のはず）`)
  console.log(`     ${merged.map(m => `${m.from}:${(m.text ?? '').slice(0, 18)}…`).join('\n     ')}`)
}

console.log('')
console.log('[引退を承認する]')
{
  const afterClick: ChatMessage[] = [
    { from: 'player', kind: 'retire', text: '正直、そろそろ引退を考えています。' },
    gm('わかりました。今シーズン限り、ですね。最後まで頼みます。'),
    retireApprovedLine(),
  ]
  const player = { pendingRetirementYear: 2054 } as unknown as Player
  const merged = mergeChatMessages(afterClick, [settledLineOf(player)!])
  check('礼は1つだけ', merged.filter(m => m.kind === 'retire_ok').length === 1)
  check('ログが伸びない', merged.length === afterClick.length, `${merged.length}件`)
}

console.log('')
console.log('[進路が決まっていない選手]')
check('返事は作られない', settledLineOf({} as Player) === null)

console.log('')
console.log('[何度開いても増えない]')
{
  const player = { overseasListed: 'africa' } as unknown as Player
  let log: ChatMessage[] = [gm('わかりました。'), settledLineOf(player)!]
  const before = log.length
  for (let i = 0; i < 5; i++) log = mergeChatMessages(log, [settledLineOf(player)!])
  check('5回開いても件数が変わらない', log.length === before, `${log.length}件（${before}件のはず）`)
}

console.log('')
console.log('[買い取り打診の返事は、行くか行かないかを必ず言う]')
{
  // ★1クラブのときだけ**理由しか出していなかった**（オーナー・2026-08-21
  //   「出場機会が見込めるからなに？」）。理由の文字列は appraiseMove の
  //   REASON_YES / SHORT_NO を並べただけなので、「見込める」と「見込めない」の
  //   2文字を読み落とすと意味が逆になる。結論は moveVerdictText 1本から出す。
  const p = { name: 'イム・ハヌル' } as unknown as Player
  const one = (ok: boolean, reason: string) => buildIncomingOfferMessages(
    p, [{ id: 'o1', name: 'ポートランド', price: 219_000_000, ok, reason }])
    .map(m => m.text ?? '').join('\n')

  const yes = one(true, '出場機会が見込める')
  check('1クラブ・乗り気 … 「行きたい」と言う', yes.includes('ポートランドへは行きたい'), yes)
  const no = one(false, '出場機会が見込めない')
  check('1クラブ・断り … 「行かない」と言う', no.includes('ポートランドへは行かない'), no)
  check('1クラブでも理由は残る', yes.includes('（出場機会が見込める）') && no.includes('（出場機会が見込めない）'))

  // 取り合いのときと**同じ文字**であること（片方だけ書き換わっていたら落ちる）
  const many = buildIncomingOfferMessages(p, [
    { id: 'o1', name: 'ポートランド', price: 219_000_000, ok: true, reason: '出場機会が見込める' },
    { id: 'o2', name: '札幌', price: 180_000_000, ok: false, reason: '出場機会が見込めない' },
  ]).map(m => m.text ?? '').join('\n')
  check('取り合いでも同じ文字', many.includes('ポートランドへは行きたい（出場機会が見込める）')
    && many.includes('札幌へは行かない（出場機会が見込めない）'), many)

  // ★否定：結論の文字を chatTalk 側に書き戻したら落とす（2か所目ができる）
  const talk = readFileSync('src/utils/chatTalk.ts', 'utf8')
  check('結論の文字を chatTalk に手書きしていない', !/へは\$\{|行きたい' : '行かない/.test(talk))
  check('通っているのは moveVerdictText 1本（入口は2つ）',
    (talk.match(/moveVerdictText\(/g) ?? []).length === 2)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 承諾の返事は1つだけ。何度開いても増えない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
