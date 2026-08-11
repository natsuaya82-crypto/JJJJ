/**
 * 入札(移籍金オファー)の合否判定が utils/transferBid.ts の1本だけになっているかを見る検査。
 *
 * もともと同じ判定が gameStore.ts の中に2つ手書きされていた。
 *   ・本編の1戦を進めたとき（nextRace）
 *   ・サブの1戦を進めたとき（advanceRace）
 * この2つは中身が食い違っていて、
 *   ・主力ガード(locked)に当たったとき、本編側は黙って却下するだけ／サブ側は通知＋1年ロック
 *     → 同じ入札なのに、どっちで1戦進めたかで結果が変わっていた。本編側では
 *       「入札が理由も無く消えた」ようにしか見えない
 *   ・費用合意を放置したときの自動失効は本編側にしか無かった
 *   ・出品中の受諾ラインの数字(0.85/0.15/0.7)が両方に手書き、しかも逆提示額が
 *     Math.round(ask/100万)*100万 で下限が無く、安い選手だと0円になり得た
 *
 * ここが NG になったら、また片方だけ書き換わっている。判定は必ず transferBid.ts に足すこと。
 */
import { resolveBid, FEE_ACCEPTED_EXPIRE_RACES, BID_MAX_ROUND } from '../src/utils/transferBid'
import type { BidContext } from '../src/utils/transferBid'
import { LISTED_ACCEPT_MIN, LISTED_COUNTER_RATIO, listedThreshold, listedAcceptChance, bidThreshold, BID_COUNTER_RATIO } from '../src/data/economy'
import { calcTransferValue } from '../src/utils/playerUtils'
import { expiredNegText, EXPIRED_NEG_TEXT } from '../src/utils/notifItems'
import type { Player, TransferBid } from '../src/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storeSource, logicSource } from './storeSource'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const YEAR = 2030

// 素の選手。yearsLeft=3・morale=70・在籍2年目なので主力ガードは open（出場データが無いので）
const P = (id: string, o: number, extra: Partial<Player> = {}) => ({
  id, name: `名${id}`, age: 26, potential: 90, teamId: 'other', status: 'active',
  morale: 70, draftYear: YEAR - 3, joinedYear: YEAR - 3, specialty: 'balanced',
  growthCurve: 'normal',
  ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
  contract: { annualSalary: 10_000_000, yearsLeft: 3, faEligibleYear: YEAR + 5 },
  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ...extra,
}) as unknown as Player

const B = (extra: Partial<TransferBid> = {}): TransferBid => ({
  id: 'b1', playerId: 'p1', targetTeamId: 'other', offeredFee: 0, round: 1,
  status: 'pending', submittedAtRace: 0, ...extra,
})

// rand を固定して揺れを消す（0.5＝ちょうど真ん中）
const ctx = (players: Player[], o: Partial<BidContext> = {}): BidContext => ({
  players, listings: [], currentSeason: { year: YEAR, races: [] }, pastSeasons: [],
  raceIndex: 10, rand: () => 0.5, ...o,
})

console.log('[1] 対象がもう他所へ行っていたら破談。通知は出さない')
{
  const p = P('p1', 80, { teamId: 'moved' })
  for (const st of ['pending', 'fee_accepted', 'countered'] as const) {
    const r = resolveBid(B({ status: st }), ctx([p]))
    check(`${st}：他所へ移っていたら failed`, r.bid.status === 'failed' && r.expired === null, r.bid.status)
  }
  const gone = resolveBid(B({ status: 'pending' }), ctx([]))
  check('選手が消えていたら failed', gone.bid.status === 'failed' && gone.expired === null)
}

console.log('\n[2] 費用合意の放置は自動で流れる。必ず通知が出る')
{
  const p = P('p1', 80)
  const bid = B({ status: 'fee_accepted', feeAcceptedAtRace: 3 })
  const still = resolveBid(bid, ctx([p], { raceIndex: 3 + FEE_ACCEPTED_EXPIRE_RACES - 1 }))
  check('期限まではそのまま残る', still.bid.status === 'fee_accepted' && still.expired === null, still.bid.status)
  const out = resolveBid(bid, ctx([p], { raceIndex: 3 + FEE_ACCEPTED_EXPIRE_RACES }))
  check('期限を過ぎたら failed', out.bid.status === 'failed', out.bid.status)
  check('通知が出る（黙って消さない）', out.expired?.playerId === 'p1' && out.expired?.playerName === '名p1')
  check('種類は入札(bid)', out.expired?.kind === 'bid', String(out.expired?.kind))
  // feeAcceptedAtRace が入っていない古い入札で勝手に失効しないこと
  const noStamp = resolveBid(B({ status: 'fee_accepted' }), ctx([p], { raceIndex: 999 }))
  check('合意した戦が記録されていなければ失効しない', noStamp.bid.status === 'fee_accepted' && noStamp.expired === null)
}

console.log('\n[3] 主力ガード(locked)に当たったら必ず通知＋ロック')
{
  // ドラフト当年の新人＝データ不足で locked
  const rookie = P('p1', 80, { draftYear: YEAR, joinedYear: YEAR })
  const r = resolveBid(B({ offeredFee: 999_999_999_999 }), ctx([rookie]))
  check('いくら積んでも rejected', r.bid.status === 'rejected', r.bid.status)
  check('通知が出る（本編側は黙って却下していた）', r.expired?.playerId === 'p1')
  check('種類は入札(bid)', r.expired?.kind === 'bid', String(r.expired?.kind))
}

console.log('\n[4] 出品中(移籍リスト掲載)：希望額が受諾ライン')
{
  const p = P('p1', 80)
  const ask = 100_000_000
  const listed = (fee: number, round = 1) => resolveBid(B({ offeredFee: fee, round }), ctx([p], { listings: [{ playerId: 'p1', askingPrice: ask }] }))
  // rand=0.5 → 受諾ライン = ask × (0.85 + 0.5×0.15) = ask × 0.925
  const thr = listedThreshold(ask, 0.5)
  check('受諾ラインは listedThreshold の1本', thr === ask * 0.925, String(thr))
  check('満額なら成立', listed(ask).bid.status === 'fee_accepted')
  check('ラインちょうどで成立', listed(thr).bid.status === 'fee_accepted')
  const under = listed(thr - 1)
  check('ライン未満は成立しない', under.bid.status === 'countered', under.bid.status)
  check('成立したら合意した戦を記録する', listed(ask).bid.feeAcceptedAtRace === 10)
  check('逆提示の下限は LISTED_COUNTER_RATIO', listed(ask * LISTED_COUNTER_RATIO).bid.status === 'countered')
  check('それ未満は却下', listed(ask * LISTED_COUNTER_RATIO - 1).bid.status === 'rejected')
  check(`逆提示は${BID_MAX_ROUND}巡目からしない`, listed(ask * 0.8, BID_MAX_ROUND).bid.status === 'rejected')
  check('出品中は通知を出さない（交渉禁止にしない）', listed(1).expired === null)

  // ★逆提示額に下限があること★
  // 以前は Math.round(ask/100万)*100万 だったので、希望額が50万未満だと0円の逆提示になっていた
  const cheap = resolveBid(B({ offeredFee: 300_000 }), ctx([p], { listings: [{ playerId: 'p1', askingPrice: 400_000 }] }))
  check('安い選手でも逆提示が0円にならない', cheap.bid.status === 'countered' && (cheap.bid.counterFee ?? 0) >= 1_000_000, `${cheap.bid.counterFee}円`)
}

console.log('\n[5] 出品中の成立確率表示と判定が同じ定数から出ている')
{
  const ask = 100_000_000
  check('満額は100%', listedAcceptChance(ask, ask) === 1)
  check(`${LISTED_ACCEPT_MIN}倍で0%`, listedAcceptChance(ask * LISTED_ACCEPT_MIN, ask) === 0)
  // 画面が「x%で成立」と出したとき、実際に成立する乱数の割合が同じであること
  for (const pct of [0, 0.25, 0.5, 0.75, 1]) {
    const fee = listedThreshold(ask, pct)
    const shown = listedAcceptChance(fee, ask)
    check(`表示${Math.round(shown * 100)}% と判定が一致(roll=${pct})`, Math.abs(shown - pct) < 1e-9, String(shown))
  }
  check('希望額0円なら100%（0除算しない）', listedAcceptChance(0, 0) === 1)
}

console.log('\n[6] 出品していない選手：economy.bidThreshold の1本で判定')
{
  const p = P('p1', 80)
  const val = calcTransferValue(p)
  // rand=0.5 → 揺れ = 0.9 + 0.5×0.2 = 1.0（ちょうどベース）
  const thr = bidThreshold(val, false, false)
  const bid = (fee: number, round = 1) => resolveBid(B({ offeredFee: fee, round }), ctx([p]))
  check('ラインちょうどで成立', bid(thr).bid.status === 'fee_accepted')
  check('1円足りなければ成立しない', bid(thr - 1).bid.status !== 'fee_accepted')
  check('逆提示の下限は BID_COUNTER_RATIO', bid(thr * BID_COUNTER_RATIO).bid.status === 'countered')
  check('それ未満は却下', bid(thr * BID_COUNTER_RATIO - 1).bid.status === 'rejected')
  check(`逆提示は${BID_MAX_ROUND}巡目からしない`, bid(thr * 0.9, BID_MAX_ROUND).bid.status === 'rejected')
  check('逆提示額は100万円単位', (bid(thr * 0.9).bid.counterFee ?? 1) % 1_000_000 === 0)
  check('却下でも通知は出さない（額が足りないだけ）', bid(1).expired === null)

  // 契約残1年以下は安くなる（transferBidBase の isExpiring）
  const expiring = P('p2', 80, { contract: { annualSalary: 10_000_000, yearsLeft: 1, faEligibleYear: YEAR + 5 } } as Partial<Player>)
  const eThr = bidThreshold(calcTransferValue(expiring), true, false)
  check('契約残1年以下は受諾ラインが下がる', eThr < bidThreshold(calcTransferValue(expiring), false, false))
  check('契約残1年以下でも同じ関数で判定', resolveBid(B({ playerId: 'p2', offeredFee: eThr }), ctx([expiring])).bid.status === 'fee_accepted')
}

console.log('\n[7] pending 以外はそのまま返す')
{
  const p = P('p1', 80)
  for (const st of ['rejected', 'player_neg', 'complete', 'failed'] as const) {
    const r = resolveBid(B({ status: st }), ctx([p]))
    check(`${st}は触らない`, r.bid.status === st && r.expired === null)
  }
}

console.log('\n[7.5] 買う側も取り合いになる（rivals）')
{
  const p = P('p1', 80)
  const mv = calcTransferValue(p)
  const thr = Math.ceil(bidThreshold(mv, false, false))
  const rival = (willing: number) => [{ clubId: 'rv', name: '青森', willing }]

  // 受諾ラインに届いていない入札は、そもそも競りにならない（却下のまま）
  check('ラインに届かない入札は競りにならない',
    resolveBid(B({ offeredFee: 1 }), ctx([p], { rivals: rival(mv * 10) })).outbidBy === undefined)

  // 届いていても、もっと出すクラブがいれば持っていかれる
  const lost = resolveBid(B({ offeredFee: thr }), ctx([p], { rivals: rival(mv * 3) }))
  check('上回るクラブがいれば競り負ける', lost.bid.status === 'rejected')
  check('競り負けの通知が出る', lost.expired?.kind === 'outbid')
  check('相手クラブと金額が通知に入る', (lost.expired?.detail ?? '').includes('青森') && (lost.expired?.detail ?? '').includes('億'))
  check('誰が獲ったかを呼び出し側に返す', lost.outbidBy?.clubId === 'rv')
  check('勝った額はこちらの提示を必ず上回る', (lost.outbidBy?.fee ?? 0) > thr, `${lost.outbidBy?.fee} vs ${thr}`)
  check('出せる上限まで積むわけではない', (lost.outbidBy?.fee ?? 0) < mv * 3)
  check('勝った額は1000万円単位', (lost.outbidBy?.fee ?? 1) % 10_000_000 === 0, String(lost.outbidBy?.fee))

  // 相手の上限がこちらの提示以下なら競り負けない
  const won = resolveBid(B({ offeredFee: thr }), ctx([p], { rivals: rival(thr) }))
  check('同額では持っていかれない', won.bid.status === 'fee_accepted' && won.outbidBy === undefined)
  check('rivals を渡さなければ今までどおり',
    resolveBid(B({ offeredFee: thr }), ctx([p])).bid.status === 'fee_accepted')

  // 一番高いクラブが獲る（複数いても1クラブだけ）
  const many = resolveBid(B({ offeredFee: thr }), ctx([p], {
    rivals: [{ clubId: 'a', name: 'A', willing: thr + 5_000_000 }, { clubId: 'b', name: 'B', willing: mv * 3 }, { clubId: 'c', name: 'C', willing: thr + 1 }],
  }))
  check('一番高いクラブが獲る', many.outbidBy?.clubId === 'b')

  // 出品中（移籍リスト掲載）でも同じ。売り手のラインとは別に競りがある
  const listedLost = resolveBid(B({ offeredFee: mv }), ctx([p], {
    listings: [{ playerId: 'p1', askingPrice: mv }], rivals: rival(mv * 3),
  }))
  check('出品中でも競り負ける', listedLost.bid.status === 'rejected' && listedLost.expired?.kind === 'outbid')
}

console.log('\n[8] 期限切れ通知の文言は種類から出す')
{
  // 入札・獲得オファー・契約更新に、トレードが飲めなかったとき用の2つ、
  // それに買う側の競り負けを足して6種類
  // ★数を写さないこと。写した瞬間に「増やしたのに片方だけ古い」が起きる
  //   （sale_refused / sale_roster_min を足したとき、ここだけ6のままだった）。
  //   数がそろっているかは Record<ExpiredNegKind, …> なので tsc が見る。ここでは中身だけ見る
  check('どの種類にも文言が入っている',
    Object.values(EXPIRED_NEG_TEXT).every(t => typeof t.title === 'function' && !!t.note),
    Object.keys(EXPIRED_NEG_TEXT).join(','))
  // 競り負けは金額の問題なので、来季まで交渉禁止にはしない
  check('競り負けは交渉禁止にしない', expiredNegText('outbid').note !== '来季まで交渉できません')
  check('種類が無い古いセーブは入札として扱う', expiredNegText(undefined) === EXPIRED_NEG_TEXT.bid)
  check('入札は「来季まで交渉できません」', expiredNegText('bid').note === '来季まで交渉できません')
  check('獲得オファーも交渉禁止', expiredNegText('offer').note === '来季まで交渉できません')
  // 契約更新はロック対象外（gameStore の allExpiredPlayerIds に入れていない）。
  // なのに「移籍を拒否しました／来季まで交渉できません」と出ていたのが嘘だった
  check('契約更新は移籍の話にしない', !expiredNegText('contract').title('名').includes('移籍'))
  check('契約更新は交渉禁止にしない', expiredNegText('contract').note !== '来季まで交渉できません')
  check('トレードは交渉禁止にしない', expiredNegText('trade').note !== '来季まで交渉できません')
  for (const k of ['bid', 'outbid', 'offer', 'contract', 'trade', 'trade_unfair'] as const) {
    check(`${k}の文言に選手名が入る`, expiredNegText(k).title('山田').includes('山田'))
  }
}

console.log('\n[9] ストアが自前で判定を持っていない')
{
  // store は分割済み。本文は scripts/storeSource の1本から取る（範囲の決め方もそこ）
  // 入札の応答・期限切れ・競り負けの後始末は store/slices/raceSlice.ts の runRace から
  // engine/bidResolution.ts・engine/offerExpiry.ts・engine/applyTransfers.ts へ切り出された。
  // 「store に自前で書いていないか」（層の話）は storeSource、「どこかに1本あるか」
  // （存在の話）は logicSource（store＋engine）で見る。混ぜないこと
  const store = storeSource()
  const logic = logicSource()
  check('入札の応答は resolveBid を呼ぶだけ（本編とサブの2箇所）',
    (logic.match(/resolveBid\(/g) ?? []).length === 2, `${(logic.match(/resolveBid\(/g) ?? []).length}箇所`)
  check('主力ガードの判定を入札処理で自前に書いていない', !store.includes("kStatus === 'locked'"))
  check('受諾ラインを自前で組み立てていない', !store.includes('bidThreshold('))
  check('出品中の受諾ラインを手書きしていない', !store.includes('0.85 + Math.random() * 0.15'))
  check('逆提示額を丸めるところで下限を外していない', !store.includes('Math.round(ask / 1000000)'))

  // 期限切れ通知は3種類とも種類つきで積まれること
  const page = readFileSync(join('src', 'components', 'notifications', 'NotificationsPage.tsx'), 'utf-8')
  check('通知ページが文言を決め打ちしていない', !page.includes('選手が移籍を拒否しました') && !page.includes('>来季まで交渉できません<'))
  check('通知ページは expiredNegText から出す', page.includes('expiredNegText(neg.kind)'))
  // ★獲得オファーの期限切れは engine/offerExpiry.ts へ移設。store だけを見ると空振りする
  check('獲得オファーの失効に種類がついている', logic.includes("kind: 'offer'"))
  // 契約更新の期限切れは store/slices/raceSlice.ts のまま
  check('契約更新の失効に種類がついている', store.includes("kind: 'contract'"))
  // 競り負けは金額の問題なので、来季まで交渉不可のロックには入れない。
  // ★engine/bidResolution.ts へ移設
  check('競り負けは1年ロックの対象外', logic.includes("r.expired.kind !== 'outbid'"))
  // 「上回られた」と出しておいて選手が残っていたら、次の節に同じ額でもう一度出せてしまう
  check('競り負けた選手は実際に相手クラブへ移る', store.includes('outbidMoves'))
  // ★競り負けた選手を実際に動かす処理は engine/applyTransfers.ts へ移設。
  //   窓を狭くしないこと。ループの中に「移す直前に本人へもう一度聞く」処理が入ったぶん
  //   400文字では届かなくなった（movePlayer は動いていないのに落ちる）
  check('移すのは movePlayer 1本', /for \(const mv of outbidMoves\)[\s\S]{0,2000}movePlayer\(/.test(logic))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
