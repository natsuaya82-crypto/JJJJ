/**
 * **トレードの「物の動かし方」と「本人の下駄」。** どちらも壊しても55本が緑のままでした。
 *
 * ■なぜ要るのか（2026-08-12 の監査で見つけた穴）
 *   1件ずつわざと壊して `npm run check` を1周させたところ、次の2つが緑のままでした。
 *
 *   ・`swapDraftPicks` の指名権を**キーの文字列**で消す形に戻す
 *       → `engine/tradeExecution.ts` のコメントは「同一性で数える。同じ年・同じ巡・
 *         同じ順番の権利が2つ並ぶことがあるので、キーの文字列で消すと関係ない方が消える」
 *         と**書いてあるのに、それを確かめる検査がどこにもありませんでした**。
 *         既存の網（`check-cpu-trade` / `golden-market-trade`）はどちらも
 *         **同じキーの指名権が2つ並ぶ世界を作っていない**ので、この枝を通りません。
 *   ・`tradeConsentBonus` を常に 0 にする
 *       → 「釣り合いが 1.2倍を超えたら本人の判定に +0.15 する」という決まりが
 *         誰にも見られていませんでした。
 *
 * ■書き方
 *   どちらも小さな純粋関数なので、**その枝だけを通す世界を手で組みます**。
 *   特に指名権は「同じキーが2つ並ぶ」ことが穴の本体なので、
 *   **そこを作らない検査には意味がありません**。
 */
import { swapDraftPicks } from '../src/engine/tradeExecution'
import { TRADE_SWEET_BONUS, TRADE_SWEET_RATIO, tradeConsentBonus } from '../src/engine/tradeConsent'
import type { Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2031
const keyOf = (pk: { year: number; round: number; pickNumber: number }) =>
  `${pk.year}-R${pk.round}-${pk.pickNumber}`

console.log('[1] 指名権は同一性で数える（同じキーが2つ並んでも、渡すのは1つだけ）')
{
  // ★ここが穴の本体。**同じ年・同じ巡・同じ順番の指名権を2つ持たせる。**
  //   キーの文字列で filter すると、渡していない方まで一緒に消える。
  //   `originallyOwnedBy` が違うので、消えたのがどちらかは見分けられる。
  const mine = [
    { year: YEAR, round: 1, pickNumber: 3, originallyOwnedBy: 'a' },
    { year: YEAR, round: 1, pickNumber: 3, originallyOwnedBy: 'b' },
  ]
  const theirs = [{ year: YEAR, round: 2, pickNumber: 5, originallyOwnedBy: 'x' }]
  const teams = [
    { id: 'a', draftPicks: mine },
    { id: 'b', draftPicks: theirs },
  ] as unknown as Team[]

  const out = swapDraftPicks(teams, { teamId: 'a', pickKeys: [keyOf(mine[0])] }, { teamId: 'b', pickKeys: [keyOf(theirs[0])] })
  const aPicks = out.find(t => t.id === 'a')!.draftPicks ?? []
  const bPicks = out.find(t => t.id === 'b')!.draftPicks ?? []

  check('出した側に残るのは1つだけ（2つとも消えない）', aPicks.filter(p => keyOf(p) === keyOf(mine[0])).length === 1,
    `${aPicks.filter(p => keyOf(p) === keyOf(mine[0])).length}件`)
  check('残ったのは渡していない方（originallyOwnedBy=b）',
    aPicks.some(p => p.originallyOwnedBy === 'b'), aPicks.map(p => p.originallyOwnedBy).join(','))
  check('相手に渡ったのは1つだけ', bPicks.filter(p => keyOf(p) === keyOf(mine[0])).length === 1)
  check('相手が出した指名権は相手から消えている', !bPicks.some(p => keyOf(p) === keyOf(theirs[0])))
  check('こちらは相手の指名権を受け取っている', aPicks.some(p => keyOf(p) === keyOf(theirs[0])))
  // 合計は動かない（湧きも消えもしない）
  check('世界の指名権の数は変わらない', aPicks.length + bPicks.length === mine.length + theirs.length,
    `${aPicks.length + bPicks.length}件`)
}

console.log('')
console.log('[2] 釣り合いが良ければ本人が首を縦に振りやすくなる（下駄）')
{
  // 仕様はリテラルで釘を打つ。**定数を読んで比べると、定数を変えても緑のままになる**
  // （`CPU_SELL_FLOOR` と `CARRYOVER_CAP_SHARE` が実際にそうだった）
  check('線は1.2倍', TRADE_SWEET_RATIO === 1.2, `${TRADE_SWEET_RATIO}`)
  check('下駄は+0.15', TRADE_SWEET_BONUS === 0.15, `${TRADE_SWEET_BONUS}`)
  check('線ちょうどで下駄が付く', tradeConsentBonus(1.2) === 0.15, `${tradeConsentBonus(1.2)}`)
  check('線を超えたら下駄が付く', tradeConsentBonus(1.5) === 0.15, `${tradeConsentBonus(1.5)}`)
  check('線に届かなければ下駄は無い', tradeConsentBonus(1.19) === 0, `${tradeConsentBonus(1.19)}`)
  check('釣り合っているだけでは下駄は無い', tradeConsentBonus(1) === 0, `${tradeConsentBonus(1)}`)
}

console.log('')
console.log(failed === 0
  ? '\n✓ 指名権は同一性で動き、下駄は1.2倍から付く\n'
  : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
