/**
 * 【移籍の「理由」の文字は1本。序列（何番手か）を出さない】
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-move-reason.ts --outfile=/tmp/cmr.cjs && node /tmp/cmr.cjs
 *
 * ■なぜ要るのか（実際に起きていたこと）
 *   同じ `lead` に対する断り文句が**3つの表**に分かれていた。
 *     transferDecision の REASON_NO … 「◯◯は「23番手では出番がない」と考えている」
 *     transferDecision の SHORT_NO  … 「23番手で出番がない」
 *     chatLines の gmInviteNoLine   … 「出場機会が見込めない」
 *   決まりは「出場機会がない」に統一（オーナー・2026-08-14「19番手かどうかって
 *   わからんくね？」）だったのに、直したのは3つ目だけ。残る2つがチャットの代理人の
 *   セリフ・通知・入札シートに出ていて、**番手が画面に出続けていた**
 *   （オーナー・2026-08-21「何番手ってもう無くしたはずだよね？」）。
 *
 * ■この点検が守るもの
 *   ① どの理由でも、文字に序列（番手）が入らない
 *   ② 行き先の序列を変えても文字が変わらない（＝数字が混ざっていない）
 *   ③ 出口3つ（会話の代理人・本人のセリフ・通知）が同じ字を出す
 *   ④ 表が2つ目にならない（`Record<…lead…, string>` を他所に書かない）
 *   ⑤ 長い形・短い形の2本立て（`shortReason`）が復活していない
 *
 * ★以前ここは**印字するだけで判定が1つも無く**、番手が出ていても必ず緑だった。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { appraiseMove, moveAcceptText, moveDeclineText, type Appraisal, type MoveReason } from '../src/utils/transferDecision'
import { gmInviteNoLine } from '../src/utils/chatLines'
import { buildIncomingOfferMessages } from '../src/utils/chatTalk'
import { offerResultText } from '../src/utils/offerResult'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const LEADS: MoveReason[] = ['tier_up', 'tier_down', 'playing_time', 'no_playing_time', 'title',
  'ecl', 'dream', 'wrong_region', 'capped', 'loyalty', 'even', 'out_of_band', 'key_player', 'fee']

const p = {
  id: 'x', name: '野村 修平', age: 28, specialty: 'mountain', personality: 'salary', morale: 60,
  growthCurve: 'normal', teamId: 't1',
  ratings: { speed: 70, stamina: 70, power: 70, technique: 70, mental: 70 },
} as unknown as Player

console.log('[1] どの理由でも、文字に序列（番手）が入らない')
{
  const bad: string[] = []
  for (const lead of LEADS) {
    for (const belowTier of [true, false]) {
      const t = moveDeclineText(lead, { dream: 'ヨーロッパ', belowTier })
      if (/番手|\d/.test(t)) bad.push(`断り:${lead}「${t}」`)
    }
    const y = moveAcceptText(lead, { dream: 'ヨーロッパ' })
    if (/番手|\d/.test(y)) bad.push(`承諾:${lead}「${y}」`)
  }
  check('断り・承諾の全パターンに番手も数字も無い', bad.length === 0, bad.join(' / '))
  check('出番の無い理由は「出場機会が見込めない」で統一',
    moveDeclineText('no_playing_time', { dream: '' }) === '出場機会が見込めない',
    moveDeclineText('no_playing_time', { dream: '' }))
}

console.log('\n[2] 行き先の序列を変えても文字が変わらない')
{
  const ctx = { srcTier: 8, playFraction: 0.9, teamRaces: 10, playerTier: 8 }
  const texts = new Set<string>()
  for (const squadRank of [15, 18, 20, 23, 25]) {
    const a = appraiseMove(p, { clubId: 'c', tier: 8, squadRank, squadSize: 25, inEcl: false } as never, ctx as never)
    check(`${String(squadRank).padStart(2)}番手 → 断る・出場機会の理由`,
      !a.ok && a.lead === 'no_playing_time', `ok=${a.ok} lead=${a.lead}`)
    texts.add(a.reason)
  }
  check('5通りとも同じ文字', texts.size === 1, [...texts].join(' / '))
  console.log(`     「${[...texts][0]}」`)
}

console.log('\n[3] 出口3つが同じ字を出す')
{
  const ctx = { srcTier: 8, playFraction: 0.9, teamRaces: 10, playerTier: 8 }
  const a = appraiseMove(p, { clubId: 'c', tier: 8, squadRank: 23, squadSize: 25, inEcl: false } as never, ctx as never)
  const word = '出場機会が見込めない'
  check('判定が出す理由', a.reason === word, a.reason)

  // ①チャットの代理人（買い取り打診の返事）
  const agent = buildIncomingOfferMessages(p,
    [{ id: 'o1', name: 'ポートランド', price: 219_000_000, ok: a.ok, reason: a.reason }])
    .map(m => m.text ?? '').join('\n')
  check('会話の代理人が同じ字', agent.includes(word) && !/番手/.test(agent), agent)

  // ②本人のセリフ（監督について行く）
  const self = gmInviteNoLine(a.lead, p).text ?? ''
  check('本人のセリフが同じ字', self.includes(word) && !/番手/.test(self), self)

  // ③通知（承諾したが本人が断った）
  const notif = offerResultText('refused_by_player',
    { playerName: p.name, teamName: 'ポートランド', price: 219_000_000, reason: a.reason }).text
  check('通知が同じ字', notif.includes(word) && !/番手/.test(notif), notif)
}

console.log('\n[4] 表が2つ目になっていない')
{
  const noComment = (f: string) => readFileSync(f, 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  const td = noComment('src/utils/transferDecision.ts')
  // 理由の表は moveDeclineText / moveAcceptText の2つだけ（断り・承諾）
  const tables = (td.match(/Record<MoveReason, string>/g) ?? []).length
  check('理由の表は断りと承諾の2つだけ', tables === 2, `${tables}個`)
  check('REASON_NO / SHORT_NO / REASON_YES が復活していない',
    !/REASON_NO|SHORT_NO|REASON_YES/.test(td))
  const cl = noComment('src/utils/chatLines.ts')
  check('chatLines に2つ目の断り文句の表が無い',
    !/Record<Appraisal\['lead'\], string>/.test(cl))
  // 理由を書く口は全部この関数を通る（定義1つ＋呼び出し4つ）
  const callers = ['src/utils/transferDecision.ts', 'src/utils/chatLines.ts',
    'src/utils/gmInvite.ts', 'src/utils/playerUtils.ts']
  const calls = callers.reduce((n, f) =>
    n + ((noComment(f).match(/(?<!export function )moveDeclineText\(/g) ?? []).length), 0)
  check('断り文句を作る口は4つとも1本を通っている', calls === 4, `${calls}か所`)
}

console.log('\n[5] 長い形・短い形の2本立てが復活していない')
{
  const td = readFileSync('src/utils/transferDecision.ts', 'utf8')
  check('shortReason が無い', !/shortReason/.test(td))
  const a: Appraisal = appraiseMove(p, { clubId: 'c', tier: 8, squadRank: 2, squadSize: 25, inEcl: false } as never,
    { srcTier: 8, playFraction: 0.9, teamRaces: 10, playerTier: 8 } as never)
  check('返すのは reason 1つ', Object.keys(a).sort().join(',') === 'lead,ok,parts,reason,score',
    Object.keys(a).join(','))
}

console.log('\n[6] 画面に出る文字のどこにも序列（番手）が無い')
{
  // ★オーナー・2026-08-21「見えるところで⚪︎番手はなし」。
  //   理由の文面だけ直しても、ニュースの見出し・遊び方の説明に残っていた。
  //   **文字列そのものを数える**（どの経路で出るかを追わない）。
  //
  //   物差しとしての序列（squadRankOf・SQUAD_DEPTH_SLOTS）は今までどおり使う。
  //   ここが見るのは「画面に出す字」だけなので、コメントは外してから数える。
  //
  // 配信し終えたお知らせだけは例外（何を出したかの記録なので書き換えない）。
  //   ★**1行ずつ名指しで許す。** ファイルごと外すと、新しく書いたお知らせに
  //     番手が入っても素通りする。
  const SHIPPED_NOTES = [
    '世界最高峰のクラブからの誘いでも、そこで20番手なら断ります。',
    '「その行き先では23番手」なのに',
    '表示のときだけ「そのクラブで何番手になるか」',
    'そのクラブでの序列15番手以降に統一しました。',
  ]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const q = `${dir}/${e.name}`
      if (e.isDirectory()) walk(q)
      else if (/\.tsx?$/.test(e.name)) files.push(q)
    }
  }
  walk('src')
  const hits: string[] = []
  const usedNotes = new Set<string>()
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      if (!l.includes('番手')) return
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return               // 説明文（経緯の記録）
      const note = SHIPPED_NOTES.find(n => l.includes(n))
      if (note) { usedNotes.add(note); return }
      hits.push(`${f}:${i + 1} ${l.trim().slice(0, 70)}`)
    })
  }
  check('画面に出す字に番手が無い', hits.length === 0, `\n      ${hits.join('\n      ')}`)
  // 例外の名簿が腐っていないか（消えたお知らせの言い訳が残ると、次の1件が黙って通る）
  check('配信済みお知らせの例外が全部いまも当たっている',
    usedNotes.size === SHIPPED_NOTES.length,
    `${usedNotes.size}/${SHIPPED_NOTES.length}`)
}

console.log('\n[参考] 一番効いた要素が見出しになっているか')
{
  const cases: { label: string; d: unknown; ctx: unknown }[] = [
    { label: '格上・憧れの地域・行き先で23番手', d: { clubId: 'a', tier: 4, squadRank: 23, squadSize: 28, inEcl: false, isForeign: true, region: 'africa' }, ctx: { srcTier: 12, playFraction: 0.9, teamRaces: 10, playerTier: 12 } },
    { label: '格上・憧れの地域・行き先で3番手', d: { clubId: 'a', tier: 4, squadRank: 3, squadSize: 28, inEcl: false, isForeign: true, region: 'africa' }, ctx: { srcTier: 12, playFraction: 0.9, teamRaces: 10, playerTier: 12 } },
    { label: '同格・国内・行き先で2番手', d: { clubId: 'a', tier: 12, squadRank: 2, squadSize: 25, inEcl: false }, ctx: { srcTier: 12, playFraction: 0.9, teamRaces: 10, playerTier: 12 } },
    { label: '格下・国内・行き先で1番手', d: { clubId: 'a', tier: 17, squadRank: 1, squadSize: 25, inEcl: false }, ctx: { srcTier: 12, playFraction: 0.9, teamRaces: 10, playerTier: 17 } },
    { label: '格上・地域違いの海外・20番手', d: { clubId: 'a', tier: 6, squadRank: 20, squadSize: 28, inEcl: false, isForeign: true, region: 'europe' }, ctx: { srcTier: 12, playFraction: 0.9, teamRaces: 10, playerTier: 12 } },
  ]
  for (const c of cases) {
    const a = appraiseMove(p, c.d as never, c.ctx as never)
    console.log(`     ${c.label.padEnd(28)} → ${a.ok ? '行く' : '断る'} (${a.score.toFixed(2)})  ${a.reason}`)
  }
}

console.log('')
if (failed > 0) { console.log(`✗ 移籍の理由の文字が割れています（${failed}件）`); process.exit(1) }
console.log('✓ 理由の文字は1本。序列（番手）は画面に出ない')
