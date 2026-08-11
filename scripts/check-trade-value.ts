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
import { calcTransferValue, ovr, peakAgeOf } from '../src/utils/playerUtils'
import type { Player } from '../src/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storeSource, logicSource } from './storeSource'

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

console.log('\n[1] 移籍金の年齢倍率が CLAUDE.md の段どおり')
// ★ここは 2026-08 に**段**へ変わった（CLAUDE.md「値段も1本」の transferFeeAgeMultiplier）。
//     〜22歳 ×5 ／ 23〜27歳 ×4 ／ 28〜31歳 ×3 ／ 32歳〜 ×2
//   点検は「滑らかなカーブ（27→28の差は6%以内・20歳の上乗せは1.25倍）」を期待したままで、
//   実測 1.332（＝4/3）と 1.664（＝5/3）で落ちていた。**現行仕様に合わせて書き直す。**
//   倍率は年齢だけの関数で、成長タイプは見ない（衰えは年齢カーブでOVRが下がることで表す）。
{
  const v = (o: number, a: number) => calcTransferValue(P(o, a))
  // 値は百万円単位に丸められるので、比はぴったりにはならない。±0.01 で見る
  const near = (got: number, want: number) => Math.abs(got - want) <= 0.01
  const ratio = (a: number, b: number) => v(90, a) / v(90, b)

  check('同じ段の中では動かない（28歳と30歳）', v(90, 28) === v(90, 30),
    `${億(v(90, 28))} vs ${億(v(90, 30))}`)
  check('同じ段の中では動かない（23歳と27歳）', v(90, 23) === v(90, 27))
  check('22→23歳で段が変わる（×5→×4＝1.25倍）', near(ratio(22, 23), 1.25), ratio(22, 23).toFixed(3))
  check('27→28歳で段が変わる（×4→×3＝1.333倍）', near(ratio(27, 28), 4 / 3), ratio(27, 28).toFixed(3))
  check('31→32歳で段が変わる（×3→×2＝1.5倍）', near(ratio(31, 32), 1.5), ratio(31, 32).toFixed(3))
  // ★32歳〜 はひと続きの段。ここで「もう一段下がる」を期待すると現行仕様と食い違う
  check('32歳以降はひと続きの段（36歳でも下がらない）', v(90, 36) === v(90, 32),
    `${億(v(90, 36))} vs ${億(v(90, 32))}`)
  // 上限だけを見ていると、上乗せが丸ごと消えて 1.00 になっていても気づけない
  // （実際に一度そうなった）。若さの上乗せが生きていることを下限でも見る
  check('20歳の上乗せは28歳の5/3（若さの上乗せが消えていない）',
    near(ratio(20, 28), 5 / 3), ratio(20, 28).toFixed(3))
  check('ピーク前(24〜27歳)にも上乗せが乗っている', v(90, 26) > v(90, 29))
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
  // store は分割済み。本文は scripts/storeSource の1本から取る（範囲の決め方もそこ）
  // logic は store＋engine。**「どこかに1本だけあるか」を数えるものはこちら**
  // （判定の実体が engine へ移っても数え漏らさない）
  const store = storeSource()
  const logic = logicSource()
  const chat = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')

  // ★相対パスで判定しないこと。storeSource() は深さの違うファイルを繋ぐので
  //   "from '../utils/tradeValue'" は gameStore.ts にしか当たらない（slices は '../../'）。
  //   深さを問わない形で見る
  check('ストアが tradeValue を通している', /from '\.[./]*utils\/tradeValue'/.test(store))
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
  // ★CPUの打診づくりは engine/aiTradeOffer.ts へ移した。store だけを見ると空振りする
  check('CPUの打診づくりは逆向きの定数を使う（同じ数字を使い回さない）',
    logic.includes('if (r < AI_OFFER_GAIN_MIN || r > AI_OFFER_GAIN_MAX) continue'))
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

  // ── 値段の出どころ（data/economy.ts）を素通りしていないか ──
  const bid = readFileSync(join('src', 'components', 'transfer', 'BidSheet.tsx'), 'utf-8')
  const tp = readFileSync(join('src', 'components', 'transfer', 'TransferPage.tsx'), 'utf-8')
  const fx = readFileSync(join('src', 'engine', 'foreignTransfers.ts'), 'utf-8')
  // 指名権キーの読み取り（正規表現＋既定値8,000,000）が2箇所に手書きされていた
  const pickRe = /match\(\/-R\(\\d\+\)-\(\\d\+\)\$\//g
  const pickDefs = (store.match(pickRe) ?? []).length + (chat.match(pickRe) ?? []).length
  check('指名権キーの読み取りは economy の1本だけ', pickDefs === 0, `${pickDefs}箇所`)
  check('チャットが指名権の値段を pickKeyValue から取る', chat.includes('pickKeyValue('))
  // 主力割増1.8は入札の受諾ラインの一部。画面と本処理で別々に書くと表示と結果がズレる
  check('主力割増(1.8)のべた書きが無い', !/\? 1\.8 : 1/.test(store) && !/\? 1\.8 : 1/.test(bid))
  check('入札画面が bidThreshold を通る', bid.includes('bidThreshold('))
  // 入札の判定はストアから出して utils/transferBid.ts の1本にした（詳しくは check-transfer-bid.ts）。
  // ストア側が受諾ラインを組み立て直したら、また画面の表示とズレるので通らせない
  check('ストアが受諾ラインを自前で組み立てない', !store.includes('bidThreshold('))
  // ★入札の応答は2つの道（本編の1戦＝engine/bidResolution と ECL等＝competitionSlice）にある。
  //   engine 側へ移したので store だけでは1箇所しか見えない。**store＋engine で数える**
  check('入札の応答は resolveBid を呼ぶだけ（本編とサブの2箇所）',
    (logic.match(/resolveBid\(/g) ?? []).length === 2,
    `${(logic.match(/resolveBid\(/g) ?? []).length}箇所`)
  // 逆提示の上限（市場価値1.15倍 / 提示額1.3倍）
  check('逆提示の上限のべた書きが無い', !/\* 1\.15,/.test(logic) && !/offeredPrice \* 1\.3/.test(logic))
  // ★上限を出すのは willingFeeFor 1本になった（marketOps）。
  //   以前は逆提示の2つの道がそれぞれ counterCeiling を呼んでいたので「2箇所」だったが、
  //   いまは両方が willingFeeFor を通るので**呼び出しは1箇所**。数だけ直すと
  //   「2つの道が同じラインを使っているか」が見えなくなるので、そこも名指しで見る
  check('逆提示の上限を出すのは1箇所（counterCeiling）',
    (logic.match(/counterCeiling\(/g) ?? []).length === 1,
    `${(logic.match(/counterCeiling\(/g) ?? []).length}箇所`)
  check('  応じるラインは willingFeeFor 1本（全クラブ一斉）',
    logic.includes('if (price <= willingFeeFor(state, o, player)) {'))
  check('  応じるラインは willingFeeFor 1本（1クラブへの逆提示）',
    logic.includes('willingFeeFor(state, offer, player)'))
  check('移籍画面が逆提示の既定額を自前で書いていない', !/offeredPrice \* 1\.3/.test(tp))
  // 移籍金の丸め（下限付き）。付け忘れると移籍金0円の打診が出る
  check('移籍金の丸めを自前で書いていない',
    !/Math\.max\(500000, Math\.round\(/.test(store) && !/Math\.max\(1000000, Math\.round\(/.test(store))
  check('引き抜きの割増が名前付き', store.includes('POACH_PREMIUM') && fx.includes('FOREIGN_STAR_PREMIUM'))
}

console.log('\n[8] 年齢補正の段が1箇所にしかない')
{
  const pu = readFileSync(join('src', 'utils', 'playerUtils.ts'), 'utf-8')
  // store は分割済み。本文は scripts/storeSource の1本から取る（範囲の決め方もそこ）
  const store = storeSource()
  const logic = logicSource()      // store＋engine。成長処理は engine へ移っている
  const chatSrc = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')
  const gen = readFileSync(join('src', 'engine', 'playerGenerator.ts'), 'utf-8')
  // ★年齢係数は**移籍金の1本だけ**になった（CLAUDE.md「値段も1本」）。
  //   年俸には年齢係数を掛けない（衰えは年齢カーブでOVRが下がることだけで表す）ので、
  //   以前ここが期待していた「playerUtils に2つ（市場価値・年俸）」はもう成り立たない。
  check('年齢係数の定義は移籍金の1本だけ（transferFeeAgeMultiplier）',
    (pu.match(/export function transferFeeAgeMultiplier/g) ?? []).length === 1)
  check('  年俸側に年齢係数の手書きが残っていない', !pu.includes('const ageFactor ='))
  const cvBody = pu.slice(pu.indexOf('export function calcTransferValue'), pu.indexOf('export type CareerStage'))
  check('前提：calcTransferValue を取り出せている', cvBody.length > 100, `${cvBody.length}文字`)
  check('移籍金がその1本を通る', cvBody.includes('transferFeeAgeMultiplier(p.age)'))
  check('ストアが年齢補正を自前で持っていない', !store.includes('const ageFactor ='))
  check('チャットが年齢補正を自前で持っていない', !chatSrc.includes('const ageFactor ='))

  // ★ピーク年齢の表は engine/ageCurve.ts の PEAK_AGE 1本★
  //   以前は playerUtils にも 24/27/30 の表があり、成長カーブ側の 22/27/30 とズレていた。
  //   いま peakAgeOf は peakAgeOfCurve へ委譲するだけ。**手書きの表を他所に作らないこと。**
  const peakDef = /=== 'early' \? \d\d/g
  const peakDefs = (pu.match(peakDef) ?? []).length + (store.match(peakDef) ?? []).length + (gen.match(peakDef) ?? []).length
  check('ピーク年齢の表を手書きしていない（PEAK_AGE 1本）', peakDefs === 0, `${peakDefs}箇所`)
  check('  peakAgeOf は ageCurve へ委譲するだけ', pu.includes('peakAgeOfCurve(p.growthCurve'))
  // ★移籍金は年齢の段だけを見る（成長タイプは見ない）。
  //   衰えは年齢カーブでOVRが下がることで表すので、値段の式に成長タイプは入らない
  check('移籍金の式に成長タイプが入っていない',
    !cvBody.includes('peakAgeOf') && !cvBody.includes('growthCurve'))
  // ★成長処理は engine/growth.ts へ移した。store だけを見ると0箇所になる
  check('成長処理はピークを peakAgeOf から取る', (logic.match(/peakAgeOf\(/g) ?? []).length === 2,
    `${(logic.match(/peakAgeOf\(/g) ?? []).length}箇所`)
  // ★生成時の焼き込み（bakeAgeGrowth）は廃止済み。年齢ぶんは年齢カーブ1本から出る。
  //   CLAUDE.md に「復活させないこと」と書いてあるので、無いことを見る
  check('生成時の焼き込み(bakeAgeGrowth)が復活していない', !/function bakeAgeGrowth/.test(gen))
  check('  生成は年齢カーブを通る（curveOvr）', gen.includes("from './ageCurve'") && gen.includes('curveOvr'))
  check('成長タイプが無い古いセーブは標準型(27)扱い', peakAgeOf({} as never) === 27)
  // 早熟は 24 → 22（011ff08「決定事項の実装」で意図して変えたもの。分解による劣化ではない）
  check('早熟は22・標準は27・晩成は30',
    peakAgeOf({ growthCurve: 'early' }) === 22 && peakAgeOf({ growthCurve: 'normal' }) === 27
    && peakAgeOf({ growthCurve: 'late_bloomer' }) === 30)

  // ★成長タイプは値段の式に**入らない**。同じOVR・同じ年齢なら同じ値段になる。
  //   成長タイプの差は「同じ年齢でもOVRが違う」という形で既に効いている（年齢カーブ）。
  //   ここで OVR を固定したまま差を期待すると、係数を二重に掛けろと言っているのと同じになる。
  const G = (o: number, a: number, g: string) => calcTransferValue(P(o, a, { growthCurve: g } as Partial<Player>))
  for (const age of [22, 30, 36]) {
    check(`${age}歳・同じOVRなら成長タイプで値段は変わらない`,
      G(85, age, 'late_bloomer') === G(85, age, 'normal') && G(85, age, 'normal') === G(85, age, 'early'))
  }
  check('成長タイプによらず32歳以降はひと続きの段',
    G(85, 36, 'late_bloomer') === G(85, 34, 'late_bloomer') && G(85, 38, 'late_bloomer') === G(85, 36, 'late_bloomer'))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
