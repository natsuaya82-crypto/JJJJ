/**
 * 「カードの交換レートが1か所しか無い」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-card-exchange.ts
 *
 * 直したのは、何枚で何枚もらえるかの表が
 * CardConvertPage.tsx（CONVERT_RATE）と gameStore の convertCards（RATE）に
 * 別々に手書きされていたこと。コードにも「store側と一致させる」と注意書きがあり、
 * 片方だけ直すと画面の表示と実際の増減がズレる形だった。
 * 今は utils/cardCombo.ts の CARD_EXCHANGES 1本だけが決める。
 */
import { CARD_EXCHANGES, planExchange, exchangeSource, canPickStat, generateTrainingCard, generateRestCard, RARITY_EXP } from '../src/utils/cardCombo'
import type { TrainingCard } from '../src/types'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const many = (n: number, make: () => TrainingCard) => Array.from({ length: n }, make)

console.log('\n[1] 表の中身が矛盾していない')
{
  for (const ex of CARD_EXCHANGES) {
    check(`${ex.fromRarity}${ex.fromRest ? '(休養)' : ''}→${ex.toRarity} の枚数が正`, ex.need > 0 && ex.produce > 0)
  }
  // 上位レアへのまとめ変換はEXP等価（損得が出ない）
  for (const ex of CARD_EXCHANGES.filter(e => !e.fromRest)) {
    check(`${ex.fromRarity}→${ex.toRarity} はEXP等価`,
      RARITY_EXP[ex.fromRarity] * ex.need === RARITY_EXP[ex.toRarity] * ex.produce,
      `${RARITY_EXP[ex.fromRarity] * ex.need} vs ${RARITY_EXP[ex.toRarity] * ex.produce}`)
  }
  // 完全休養の引き換えは「同じレア度・10枚で1枚」
  for (const ex of CARD_EXCHANGES.filter(e => e.fromRest)) {
    check(`完全休養(${ex.fromRarity}) は同じレア度の1枚になる`,
      ex.fromRarity === ex.toRarity && ex.need === 10 && ex.produce === 1)
    check(`完全休養(${ex.fromRarity}) は種類を選べる`, canPickStat(ex))
  }
  for (const ex of CARD_EXCHANGES.filter(e => !e.fromRest)) {
    check(`${ex.fromRarity}→${ex.toRarity} は種類を選べない（ランダム）`, !canPickStat(ex))
  }
}

console.log('\n[2] 消費するのは「その交換の対象カード」だけ')
{
  const ex = CARD_EXCHANGES.find(e => e.fromRest && e.fromRarity === 'normal')!
  const cards = [
    ...many(10, () => generateRestCard('normal')),
    ...many(10, () => generateRestCard('rare')),      // レア度違い
    ...many(10, () => generateTrainingCard('normal')), // 休養じゃない
  ]
  check('対象だけ拾う', exchangeSource(cards, ex).length === 10, `${exchangeSource(cards, ex).length}枚`)
  const plan = planExchange(cards, ex, 'speed')!
  check('10枚ちょうど消える', plan.consumeIds.size === 10, `${plan.consumeIds.size}枚`)
  check('もらうのは1枚', plan.produced.length === 1)
  check('もらうカードは指定した種類', plan.produced[0].statKey === 'speed')
  check('もらうカードは同じレア度', plan.produced[0].rarity === 'normal')
  check('もらうカードは完全休養ではない', plan.produced[0].kind !== 'rest')
  const rest = cards.filter(c => !plan.consumeIds.has(c.id))
  check('関係ないカードは残る', rest.length === 20, `${rest.length}枚`)
  check('消えたのは完全休養ノーマルだけ',
    rest.filter(c => c.kind === 'rest' && c.rarity === 'normal').length === 0)
}

console.log('\n[3] 束が組めない・複数束のとき')
{
  const ex = CARD_EXCHANGES.find(e => e.fromRest && e.fromRarity === 'epic')!
  check('9枚では交換できない', planExchange(many(9, () => generateRestCard('epic')), ex, 'speed') === null)
  const p = planExchange(many(25, () => generateRestCard('epic')), ex, 'mental')!
  check('25枚なら20枚消えて2枚もらえる', p.consumeIds.size === 20 && p.produced.length === 2,
    `${p.consumeIds.size}枚消費 / ${p.produced.length}枚`)
  check('もらう2枚とも指定した種類', p.produced.every(c => c.statKey === 'mental'))
}

console.log('\n[4] まとめ変換は種類を指定しても効かない（ランダムのまま）')
{
  const ex = CARD_EXCHANGES.find(e => !e.fromRest && e.fromRarity === 'normal')!
  const p = planExchange(many(4, () => generateTrainingCard('normal')), ex, 'speed')!
  check('4枚消えて1枚もらえる', p.consumeIds.size === 4 && p.produced.length === 1)
  check('もらうのはレア', p.produced[0].rarity === 'rare')
}

console.log('\n[5] レートの手書きが復活していない')
{
  const store = readFileSync('src/store/gameStore.ts', 'utf-8')
  const page = readFileSync('src/components/training/CardConvertPage.tsx', 'utf-8')
  check('store は planExchange を呼ぶ', store.includes('planExchange('))
  check('store に古い convertCards が残っていない', !store.includes('convertCards'))
  check('store にレート表が無い', !/const\s+RATE\s*[:=]/.test(store))
  check('変換ページにレート表が無い', !page.includes('CONVERT_RATE'))
  check('変換ページは CARD_EXCHANGES を読む', page.includes('CARD_EXCHANGES'))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
process.exit(failed === 0 ? 0 : 1)
