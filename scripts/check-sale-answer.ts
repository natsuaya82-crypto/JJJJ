/**
 * 【チャットの返事】「答えた」が消えないこと・二重に処分できないこと。
 *
 * ■なぜ要るのか（実機で出た3つ）
 *   ① 一回答えたのに、開き直すとまた同じ返事を求められる
 *      返事の置き場所が `Season.pendingSale` という**シーズンに1件の枠**だった。
 *      同じレース間に2人ぶん返事をすると、あとの返事が前の返事を上書きする。
 *      上書きされた側はベルも通知も「返事待ち」に戻り、レースを進めても決着しない。
 *   ② 海外クラブからオファーが来ているのに「閉じる」しか出ない
 *      海外挑戦を認めた選手には、海外からのオファーだけ札が残る（talkSync）。
 *      なのに返事のボタン側が「進路が決まった選手＝閉じるだけ」で先に打ち切っていた。
 *   ③ 1人の選手を二重に処分できる
 *      「譲ります」と返事をした選手が、決着までのあいだトレード・貸出・売出に出せた。
 *
 * ここでは①③を実際のデータで踏む（②はボタンの並びなので check-single-source と目視）。
 */
import {
  saleAnswers, isSaleAnswered, withSaleAnswer, keepSaleAnswers,
} from '../src/utils/saleAnswer'
import { offersAwaitingReply } from '../src/utils/notifItems'
import { canTradeAway, canLoanOut, canListForSale, canBePoached, eligibilityCtx } from '../src/utils/transferEligibility'
import type { Player } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const MY = 'my-club'
const player = (id: string): Player => ({
  id, name: id, teamId: MY, age: 26, status: 'active',
  contract: { annualSalary: 10_000_000, yearsLeft: 2 },
} as never)

console.log('[1] 返事は選手ごとに残る（あとの返事が前の返事を消さない）')
{
  let season = { year: 2029 } as Parameters<typeof withSaleAnswer>[0]
  season = withSaleAnswer(season, { offerId: 'o-a', playerId: 'a', atRaceIndex: 3 })
  season = withSaleAnswer(season, { offerId: 'o-b', playerId: 'b', atRaceIndex: 3 })
  check('2人ぶん答えたら2件とも残る', saleAnswers(season).length === 2, `${saleAnswers(season).length}件`)
  check('  1人目の返事が消えていない', isSaleAnswered(season, 'a'))
  check('  2人目の返事も残っている', isSaleAnswered(season, 'b'))

  // 同じ選手に出し直したら「行き先の選び直し」＝上書き（増えない）
  const again = withSaleAnswer(season, { offerId: 'o-a2', playerId: 'a', atRaceIndex: 3 })
  check('同じ選手に出し直しても増えない（行き先の選び直し）', saleAnswers(again).length === 2)
  check('  行き先は新しいほうになる', saleAnswers(again).find(x => x.playerId === 'a')?.offerId === 'o-a2')
}

console.log('')
console.log('[2] 旧セーブ（シーズンに1件の枠）も同じように読める')
{
  const old = { pendingSale: { offerId: 'o-x', playerId: 'x', atRaceIndex: 1 } }
  check('旧セーブの返事も読める', isSaleAnswered(old, 'x'))
  const added = withSaleAnswer(old, { offerId: 'o-y', playerId: 'y', atRaceIndex: 1 })
  check('新しい返事を足しても、旧セーブのぶんは消えない', isSaleAnswered(added, 'x') && isSaleAnswered(added, 'y'),
    `${saleAnswers(added).length}件`)
  check('  旧い置き場所は畳まれる（二重に数えない）', added.pendingSale === undefined && saleAnswers(added).length === 2)
}

console.log('')
console.log('[3] 返事をした選手は、ベルと通知の「返事待ち」から消える')
{
  const offers = [
    { id: 'o-a', playerId: 'a', fromTeamId: 'c1', offeredPrice: 100_000_000 },
    { id: 'o-b', playerId: 'b', fromTeamId: 'c2', offeredPrice: 90_000_000 },
    { id: 'o-c', playerId: 'c', fromTeamId: 'c3', offeredPrice: 80_000_000 },
  ] as never
  const season = withSaleAnswer(
    withSaleAnswer({ incomingOffers: offers } as never, { offerId: 'o-a', playerId: 'a', atRaceIndex: 2 }),
    { offerId: 'o-b', playerId: 'b', atRaceIndex: 2 },
  )
  const left = offersAwaitingReply(season as never)
  check('2人に答えたら、返事待ちは残り1人だけ', left.length === 1 && left[0].playerId === 'c',
    left.map(o => o.playerId).join('・'))
}

console.log('')
console.log('[4] 返事をした選手を、別の形で処分できない（二重処分）')
{
  const p = player('a')
  const season = withSaleAnswer({ year: 2029 } as never, { offerId: 'o-a', playerId: 'a', atRaceIndex: 2 })
  const ctx = eligibilityCtx(season as never, MY)
  check('前提：材料に返事済みが入っている', ctx.saleAnsweredIds?.has('a') === true)
  check('トレードに出せない', !canTradeAway(p, ctx))
  check('レンタルに出せない', !canLoanOut(p, ctx))
  check('売出に出せない', !canListForSale(p, ctx))
  // 上乗せは受けたいので、他クラブからの打診は止めない
  check('他クラブからの上乗せは止めない（canBePoached は通す）', canBePoached(p, { ...ctx, currentYear: 0 }))

  const other = player('z')
  check('答えていない選手はどれもできる',
    canTradeAway(other, ctx) && canLoanOut(other, ctx) && canListForSale(other, ctx))
}

console.log('')
console.log('[5] 前提が崩れた返事だけが落ちる')
{
  const season = withSaleAnswer(
    withSaleAnswer({ year: 2029 } as never, { offerId: 'o-a', playerId: 'a', atRaceIndex: 2 }),
    { offerId: 'o-b', playerId: 'b', atRaceIndex: 2 },
  )
  const kept = keepSaleAnswers(season, x => x.playerId !== 'a')
  check('崩れた1件だけ落ちる', saleAnswers(kept).length === 1 && isSaleAnswered(kept, 'b'))
  check('  何も落ちなければ同じ実体を返す（無駄な書き込みをしない）',
    keepSaleAnswers(kept, () => true) === kept)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 返事が消える／二重に処分できる状態です（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 返事は選手ごとに残り、答えた選手は他の形で処分できない')
