/**
 * 【ドラフトを終えるまで開幕できない】
 *
 * ■なぜ要るのか（オーナー・2026-08-14）
 *   「シーズン開始した後に予定表見て戻ったらドラフト自体がスキップされたんだけどなんで？」
 *   「スキップを可能にしたことは今までで一度もないが？」
 *
 *   ドラフトを飛ばせる形は**オーナーが決めたものではありません**。2つの変更が重なって
 *   できていました。
 *
 *   | いつ | 何が起きたか |
 *   |---|---|
 *   | 2026-07-15 `872ca32` | 「役割の選択・表示UIを非表示化」のコミットで**プレシーズンの塊がまるごと書き直され**、準備が残っていても押せるボタンと「スキップも可能です」の文が入った |
 *   | 2026-08-13 `0a62e14` | ホームの見た目を寄せたとき、3つに描き分けていたボタンを1つに統合し、**分岐を `rosterShort` だけに潰した**。灰色だった「準備が残っている」状態が金のままになり、唯一の目印も消えた |
 *
 *   ドラフトは1年に1度きりで、`endSeason` が `draftState` を null にしたあとなので、
 *   開幕してしまうとその年のドラフトは**二度と開けません**。
 *
 * ■空振りの緑にしないために
 *   判定を単体で叩くだけだと、**画面がそれを呼んでいなくても緑になります**（今回まさに
 *   「画面に `allReady` はあるのにボタンは見ていない」という形で起きた）。[2] で
 *   Dashboard のソースを読み、ボタンが判定を通していることと、`rosterShort` だけを
 *   見る形に戻っていないことを見ます。
 */
import { readFileSync } from 'node:fs'
import { canStartSeason, seasonStartBlockers, rosterShortFor } from '../src/utils/seasonStart'
import { ROSTER_MIN } from '../src/data/rosterRules'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 開幕を止める条件')
{
  const ok = { draftDone: true, rosterCount: 25 }
  check('ドラフトを終えて人数も足りていれば開幕できる', canStartSeason(ok))
  check('ドラフトが残っていたら開幕できない', !canStartSeason({ ...ok, draftDone: false }))
  check(`人数が下限（${ROSTER_MIN}人）未満なら開幕できない`, !canStartSeason({ ...ok, rosterCount: ROSTER_MIN - 1 }))
  check(`下限ちょうどは開幕できる`, canStartSeason({ ...ok, rosterCount: ROSTER_MIN }))
  check('両方だめなら理由も2つ出る', seasonStartBlockers({ draftDone: false, rosterCount: 3 }).length === 2)
  check('開幕できるときは理由が0件', seasonStartBlockers(ok).length === 0)
  // 理由は必ず文章で出す（押せないのに何も出ないのが一番まずい）
  check('止めるときは必ず理由の文がある',
    seasonStartBlockers({ ...ok, draftDone: false }).every(b => b.length > 0))
  check('人数の線は rosterShortFor 1本', rosterShortFor(ROSTER_MIN - 1) && !rosterShortFor(ROSTER_MIN))
}

console.log('\n[2] 画面が実際にその判定を通している')
{
  const dash = readFileSync('src/components/dashboard/Dashboard.tsx', 'utf8')
  check('開幕ボタンの onClick が canStart を見る', /onClick=\{\(\) => \{ if \(canStart\)/.test(dash))
  check('開幕ボタンの disabled が canStart を見る', /disabled=\{!canStart\}/.test(dash))
  // ★ここが本体。`rosterShort` だけを見る形に戻ったら落とす
  check('onClick が rosterShort だけを見る形に戻っていない',
    !/onClick=\{\(\) => \{ if \(!rosterShort\)/.test(dash))
  check('disabled が rosterShort だけを見る形に戻っていない', !/disabled=\{rosterShort\}/.test(dash))
  check('判定は utils/seasonStart から取っている', /from '\.\.\/\.\.\/utils\/seasonStart'/.test(dash))
  check('画面で条件を組み直していない（campDone && draftDone のような手書き）',
    !/const\s+canStart\s*=\s*[^\n]*&&/.test(dash))
  // 「スキップも可能です」は消した。文言ごと戻ってきたら落とす
  check('「スキップも可能です」が復活していない', !dash.includes('スキップも可能です'))
  check('押せない理由を画面に出している', /blockers\.map/.test(dash))
}

console.log('')
if (failed > 0) { console.log(`✗ ドラフトを飛ばして開幕できてしまいます（${failed}件）`); process.exit(1) }
console.log('✓ ドラフトを終えるまで開幕できない。理由も画面に出る')
