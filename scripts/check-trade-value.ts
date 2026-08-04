/**
 * トレードの「釣り合っているか」の判定が、utils/tradeValue.ts の1本だけになっているかを見る検査。
 *
 * もともと同じ判断が5箇所に手書きされていて、しかも全部ちがっていた。
 *   ・tradePlayer（成立）        … 下限0.92だけ。上限なし
 *   ・proposeTrade（チャット交渉）… 下限0.95／門前払い0.55。上限なし
 *   ・acceptTradeCounter（逆提示を飲む）… 判定なし
 *   ・acceptTradeOffer（打診を飲む）    … 判定が1つも無い
 *   ・CPUが打診を作るところ       … 0.95〜1.30の帯＋OVR差3以内（ここだけ両側を見ていた）
 * 上限が無いのはこちら（GM）が損をする側だけだったので、
 * 「30歳のOVR90を22歳のOVR70と交換」がそのまま成立していた。
 *
 * ここが NG になったら、呼び出し側が自前で閾値を書いている。判定は必ず tradeValue に足すこと。
 */
import {
  TRADE_MIN_RATIO, TRADE_OK_RATIO, TRADE_HARD_NO_RATIO, TRADE_MAX_RATIO,
  KEY_PLAYER_PREMIUM, TRADE_OVR_SLACK, AI_OFFER_GAIN_MIN, AI_OFFER_GAIN_MAX,
  activityFactor, keyFactor, faceValueOf, askingValueOf, tradeValues, tradeBalance, tradeNotLopsided,
} from '../src/utils/tradeValue'
import type { TradeValueCtx } from '../src/utils/tradeValue'
import { calcTransferValue, ovr } from '../src/utils/playerUtils'
import type { Player } from '../src/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

// OVR と年齢だけを指定した素の選手（実績は全部0＝careerFactor 1.0）
const P = (o: number, age: number, extra: Partial<Player> = {}) => ({
  id: `p${o}_${age}`, name: `P${o}/${age}`, age, potential: 90, teamId: 't1',
  status: 'active', morale: 70, draftYear: 2020, joinedYear: 2020, specialty: 'balanced',
  ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
  contract: { annualSalary: 10000000, yearsLeft: 2, faEligibleYear: 2035 },
  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ...extra,
}) as unknown as Player

const CTX: TradeValueCtx = {
  races: [], teamRaces: 0,
  currentSeason: { year: 2030, races: [] }, pastSeasons: [],
} as unknown as TradeValueCtx

const 億 = (n: number) => (n / 100000000).toFixed(2)

console.log('\n[1] 市場価値の年齢補正が成長処理(growPlayer)と噛み合っている')
// growPlayer のピークは27前後、実際に数値が落ち始めるのは31歳、はっきり落ちるのは33歳から。
// 以前はここだけ28歳から下げ始めて30歳0.80・32歳0.60と、実際の衰えよりずっと急だった
{
  const v = (o: number, a: number) => calcTransferValue(P(o, a))
  check('28歳と30歳で同じOVRなら値段は変わらない（30歳まで据え置き）', v(90, 28) === v(90, 30),
    `${億(v(90, 28))} vs ${億(v(90, 30))}`)
  check('27歳と28歳の差はごくわずか（段差で価値が跳ねない）', v(90, 27) / v(90, 30) <= 1.06,
    String((v(90, 27) / v(90, 30)).toFixed(3)))
  check('31歳から下がり始める', v(90, 32) < v(90, 30))
  check('33歳からもう一段下がる', v(90, 34) < v(90, 32))
  check('35歳以降でさらに下がる', v(90, 36) < v(90, 34))
  // 値は百万円単位に丸められるので、比は 1.25 ぴったりにはならない。
  // 係数そのものは [8] の「20歳の上乗せが1.25」で原文を見て確かめている
  check('20歳の上乗せは1.25倍程度まで（伸びる保証が無いぶん抑える）', v(90, 20) / v(90, 28) <= 1.27,
    String((v(90, 20) / v(90, 28)).toFixed(3)))
  check('OVRの差は年齢では覆らない（30歳の90 > 22歳の80）', v(90, 30) > v(80, 22))
}

console.log('\n[2] 「30歳のOVR90」と「22歳のOVR70」が等価にならない')
{
  const vet = P(90, 30), kid = P(70, 22)
  const r = calcTransferValue(vet) / calcTransferValue(kid)
  check('市場価値で2.5倍以上の開きがある', r >= 2.5, `${r.toFixed(2)}倍（${億(calcTransferValue(vet))}億 / ${億(calcTransferValue(kid))}億）`)
  const bal = tradeBalance({ outPlayers: [vet], inPlayers: [kid] }, CTX)
  check('この交換は成立しない', !bal.ok, bal.reason)
  check('断る理由が「持ち出しが大きすぎる」になっている', (bal.reason ?? '').includes('持ち出し'))
}

console.log('\n[3] 釣り合いは上下どちらにもはみ出したら不成立')
{
  // 指名権だけの取引にすれば上乗せが掛からないので、比だけを素直に確かめられる
  const B = (out: number, inn: number) => tradeBalance({ outExtra: out, inExtra: inn }, CTX)
  check('ちょうど釣り合っていれば成立', B(100, 100).ok)
  check('下限ちょうどは成立', B(100 * TRADE_MIN_RATIO, 100).ok)
  check('下限を下回ると相手が断る', !B(100 * TRADE_MIN_RATIO - 1, 100).ok)
  check('上限ちょうどは成立', B(100 * TRADE_MAX_RATIO, 100).ok)
  check('上限を超えるとこちらの持ち出しが大きすぎる', !B(100 * TRADE_MAX_RATIO + 1, 100).ok)
  check('もらう側が空なら不成立', !B(100, 0).ok)
  check('上限 > 下限（帯が潰れていない）', TRADE_MAX_RATIO > TRADE_MIN_RATIO)
  check('門前払いの線が下限より下', TRADE_HARD_NO_RATIO < TRADE_MIN_RATIO)
  check('即OKの線が下限以上', TRADE_OK_RATIO >= TRADE_MIN_RATIO)
}

console.log('\n[4] 数を足して値段だけ合わせた交換を止める（OVR差）')
{
  const star = P(88, 27)
  const near = P(88 - TRADE_OVR_SLACK, 24)
  const far = P(88 - TRADE_OVR_SLACK - 1, 24)
  // 額面差で先に弾かれないよう、足りない分は指名権で埋めて比を1.0に寄せる
  const NL = (out: Player[], inn: Player[]) => {
    const of = out.reduce((s2, p) => s2 + faceValueOf(p), 0)
    const inf = inn.reduce((s2, p) => s2 + faceValueOf(p), 0)
    return tradeNotLopsided({ outPlayers: out, inPlayers: inn, inExtra: Math.max(0, of - inf) }, CTX)
  }
  check('OVR差ちょうどは通る', NL([star], [near]).ok)
  check('OVR差が開きすぎたら額面で見合わない', !NL([star], [far]).ok)
  check('もらう中に1人でも近いOVRがいれば通る', NL([star], [far, near]).ok)
  check('選手が片側にしかいない（指名権だけ）ならOVRは見ない',
    tradeNotLopsided({ outPlayers: [star], inExtra: faceValueOf(star) }, CTX).ok)
  check('断る理由が「額面で見合わない」になっている', (NL([star], [far]).reason ?? '').includes('額面'))
  check('OVRの見方が最上位どうし', ovr(star) - ovr(far) === TRADE_OVR_SLACK + 1)
}

console.log('\n[5] 相手から来た打診は、こちらが損をする側だけ見る')
// CPUが作る打診は「こちらがもらう側が多め」に寄っている（0.95〜1.30の帯）。
// ここに下限まで掛けると、相手が気前よく出してきた打診が押した瞬間に黙って消えていた
{
  const NL2 = (out: number, inn: number) => tradeNotLopsided({ outExtra: out, inExtra: inn }, CTX)
  check('相手が損をする打診は飲める', NL2(70, 100).ok)
  check('同じ形を tradeBalance に掛けると下限で弾かれる（だから使い分ける）',
    !tradeBalance({ outExtra: 70, inExtra: 100 }, CTX).ok)
  check('こちらが出しすぎの打診は飲めない', !NL2(100 * TRADE_MAX_RATIO + 1, 100).ok)
  // ★CPUが作った打診が、押した瞬間に上限で消えないこと★
  // 生成側は「もらう額面 ÷ 出す額面 >= AI_OFFER_GAIN_MIN」で作る。その逆数が上限を
  // 超えていると、届いた打診を飲もうとした瞬間に tradeNotLopsided が弾いて黙って消える
  check('CPUが作れる一番渋い打診でも上限に触れない', 1 / AI_OFFER_GAIN_MIN <= TRADE_MAX_RATIO,
    `1/${AI_OFFER_GAIN_MIN} = ${(1 / AI_OFFER_GAIN_MIN).toFixed(3)} vs ${TRADE_MAX_RATIO}`)
  check('CPUの帯の上側も筋が通っている（もらいすぎを作らない）', AI_OFFER_GAIN_MAX >= 1)
  {
    // 生成側の一番渋い形をそのまま飲めるか、実物で確かめる
    const mine = P(80, 26), theirs = P(80, 26)
    const inExtra = Math.max(0, Math.ceil(faceValueOf(mine) * AI_OFFER_GAIN_MIN) - faceValueOf(theirs))
    check('生成の下限ちょうどの打診をそのまま飲める',
      tradeNotLopsided({ outPlayers: [mine], inPlayers: [theirs], inExtra }, CTX).ok)
  }
}

console.log('\n[6] 物差しは2つ。額面（損得）と言い値（相手が承知するか）を混ぜない')
{
  check('主力の割増は1.5倍', KEY_PLAYER_PREMIUM === 1.5)
  const p = P(80, 26)
  check('出場データが無ければ割増は掛からない', keyFactor(p, CTX) === 1)
  check('出場していなければ上乗せも無い', activityFactor(p, CTX) === 1)
  check('額面＝そのままの市場価値（上乗せを掛けない）', faceValueOf(p) === calcTransferValue(p))
  check('言い値＝市場価値×出場×主力割増', askingValueOf(p, CTX) === calcTransferValue(p) * activityFactor(p, CTX) * keyFactor(p, CTX))

  // ★同じOVR・同じ年齢の1対1が通ること★
  // 上限の判定にまで言い値（最大2.1倍まで開く）を使うと、この当たり前の交換が成立しなくなる
  const a = P(80, 28), b = P(80, 28)
  const v = tradeValues({ outPlayers: [a], inPlayers: [b] }, CTX)
  check('同じOVR・同じ年齢の1対1は額面で釣り合う', v.outFace === v.inFace, `${億(v.outFace)} vs ${億(v.inFace)}`)
  check('同じOVR・同じ年齢の1対1が上限で弾かれない', tradeNotLopsided({ outPlayers: [a], inPlayers: [b] }, CTX).ok)

  // 上限は額面だけを見るので、相手の言い値がいくら高くても上限判定は動かない
  const keyish = P(80, 28)
  const vk = tradeValues({ outPlayers: [a], inPlayers: [keyish] }, CTX)
  check('上限の判定に使うのは額面（cpuGain は額面と同じ）', vk.cpuGain === vk.outFace)
  check('相手が承知するかの判定に使うのは言い値', vk.cpuLoss === askingValueOf(keyish, CTX))
}

console.log('\n[7] 呼び出し側が自前で閾値を書いていない')
{
  const store = readFileSync(join('src', 'store', 'gameStore.ts'), 'utf-8')
  const chat = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')

  check('ストアが tradeValue を通している', store.includes("from '../utils/tradeValue'"))
  check('チャットが tradeValue を通している', chat.includes("from '../../utils/tradeValue'"))

  // 0.92 / 0.95 / 0.55 / 1.3 / 1.5 のべた書きが残っていないか
  for (const [label, pat] of [
    ['成立の下限(0.92)', /(requestedVal|cpuLoss|inVal)\s*\*\s*0\.92/],
    ['即OKの線(0.95)', /(requestedVal|cpuLoss|inVal)\s*\*\s*0\.95/],
    ['門前払いの線(0.55)', /(requestedVal|cpuLoss|inVal)\s*\*\s*0\.55/],
  ] as [string, RegExp][]) {
    check(`ストアに ${label} のべた書きが無い`, !pat.test(store))
    check(`チャットに ${label} のべた書きが無い`, !pat.test(chat))
  }
  check('ストアに主力割増(1.5)のべた書きが無い', !/!== 'open' \? 1\.5 : 1/.test(store))
  check('チャットに主力割増(1.5)のべた書きが無い', !/\? 1\.5 : 1/.test(chat))
  check('チャットが主力の判定を自前で書き直していない（isDataKeyPlayer）', !chat.includes('isDataKeyPlayer('))
  check('出場の上乗せ(0.4)を自前で書いていない', !/frac \* 0\.4/.test(store) && !/frac \* 0\.4/.test(chat))

  check('成立(tradePlayer)が tradeBalance を通る', store.includes('const bal = tradeBalance(tradeIn, tvCtx)'))
  check('チャット交渉(proposeTrade)が tradeBalance を通る', store.includes('const overBal = tradeBalance(baseIn, tvCtx)'))
  check('逆提示の作り方も tradeBalance で確かめている', store.includes('tradeBalance({ ...baseIn, outPlayers: [...givePlayers, fit] }, tvCtx)'))
  check('相手からの打診(acceptTradeOffer)が tradeNotLopsided を通る', store.includes('tradeNotLopsided(acceptIn, tvCtxA)'))
  check('CPUの打診づくりは逆向きの定数を使う（同じ数字を使い回さない）',
    store.includes('if (r < AI_OFFER_GAIN_MIN || r > AI_OFFER_GAIN_MAX) continue'))
  check('値付けの ctx が1箇所（tradeValueCtxOf）', store.includes('function tradeValueCtxOf('))
  // 値の合計は tradeValue 側でやる。呼び出し側で足すと額面と言い値がまた混ざる
  check('ストアが値を自前で合計していない', !/reduce\(\(s2?, p\) => s2? \+ (tradeValueOf|askingValueOf|faceValueOf)\(/.test(store))
  check('チャットが値を自前で合計していない', !/reduce\(\(s, p\) => s \+ (tradeValueOf|askingValueOf|faceValueOf)\(/.test(chat))
  check('チャットも tradeValues で数える', chat.includes('const { cpuGain, cpuLoss, ratio } = tradeValues(tradeIn, tvCtx)'))
  // 断る理由の文末に句点を付けない（画面側で助言を足すため。以前は句点が二重になっていた）
  check('チャットが断り文句に助言を足す形が1本', chat.includes('const blockNote = blockMsg ?'))
  check('画面が二重の句点を作らない', !chat.includes('{tradeOutlook.blockMsg}。'))

  // 逆提示を飲む道は tradePlayer をそのまま通すので、そこに判定があれば足りる
  check('逆提示を飲む道が tradePlayer を通る', store.includes("const res = get().tradePlayer([...neg.giveIds"))
}

console.log('\n[8] 年齢補正の段が1箇所にしかない')
{
  const pu = readFileSync(join('src', 'utils', 'playerUtils.ts'), 'utf-8')
  const store = readFileSync(join('src', 'store', 'gameStore.ts'), 'utf-8')
  const chatSrc = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')
  // playerUtils には市場価値ぶんと年俸(faMarketSalary)ぶんの2つ。それ以上に増やさない
  check('年齢補正の定義は playerUtils の2つだけ（市場価値・年俸）', (pu.match(/const ageFactor =/g) ?? []).length === 2)
  const cvBody = pu.slice(pu.indexOf('export function calcTransferValue'), pu.indexOf('export type CareerStage'))
  check('市場価値の年齢補正はその中の1つ', (cvBody.match(/const ageFactor =/g) ?? []).length === 1)
  check('ストアが年齢補正を自前で持っていない', !store.includes('const ageFactor ='))
  check('チャットが年齢補正を自前で持っていない', !chatSrc.includes('const ageFactor ='))
  check('30歳までが据え置きになっている', cvBody.includes('age <= 30 ? 1.00 :'))
  check('20歳の上乗せが1.25', cvBody.includes('age <= 20 ? 1.25 :'))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
