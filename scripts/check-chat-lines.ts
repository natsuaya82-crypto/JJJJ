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
if (problems.length === 0) {
  console.log('✓ 承諾の返事は1つだけ。何度開いても増えない')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
