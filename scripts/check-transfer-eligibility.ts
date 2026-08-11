/**
 * 「この選手に移籍の話を持ちかけていいか」の判定が1本にまとまっていることを確かめる自己点検。
 *
 *   npx jiti scripts/check-transfer-eligibility.ts
 *
 * 直したのは、同じ条件（引退希望中は除く／非売品は除く／海外挑戦を承認済みは除く／
 * 加入1年目は除く／レンタルで借りている選手は除く）が、オファー生成・入札・CPUの自動購入・
 * 売出・レンタル打診と10箇所近くに手書きでコピーされていたこと。
 * 実際に「海外挑戦を認めたのに国内クラブへ売られる」不具合が出ていて、
 * 除外していたのは3箇所だけ、残りは素通りだった。
 */
import {
  isNewJoin, isRetiring, isOwnedBy, isTalkFree,
  canBePoached, canReceiveFreeContact, canGoOverseasDream, canListForSale, canLoanOut,
  canTradeAway, canStartContractTalk, canWishTransfer, canAcceptOfferFor, isLeavingClub,
} from '../src/utils/transferEligibility'
import type { Player } from '../src/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { storeSource, logicSource, actionBody } from './storeSource'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (extra: Partial<Player> = {}) =>
  ({ id: 'p1', name: 'p1', teamId: 'a', status: 'active', age: 25, joinedYear: 2028, contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player

const CTX = { teamId: 'a', currentYear: 2030, retiringIds: new Set<string>() }

console.log('\n[1] 素の選手はどの話も持ちかけられる')
{
  const p = P()
  check('引き抜きの対象になる', canBePoached(p, CTX))
  check('フリー移籍の接触が来る', canReceiveFreeContact(p, CTX))
  check('売りに出せる', canListForSale(p, CTX))
  check('レンタルに出せる', canLoanOut(p, CTX))
  check('海外挑戦の指名は来ない（承認していないので）', !canGoOverseasDream(p, CTX))
}

console.log('\n[2] よそのクラブの選手・引退した選手・借りている選手は対象外')
{
  check('他クラブの選手は対象外', !isOwnedBy(P({ teamId: 'b' }), 'a'))
  check('引退した選手は対象外', !isOwnedBy(P({ status: 'retired' } as Partial<Player>), 'a'))
  check('レンタルで借りている選手は保有権が無いので対象外', !isOwnedBy(P({ loan: { ownerTeamId: 'b', untilYear: 2031 } } as Partial<Player>), 'a'))
  const lent = P({ loan: { ownerTeamId: 'b', untilYear: 2031 } } as Partial<Player>)
  check('借りている選手は引き抜かれない', !canBePoached(lent, CTX))
  check('借りている選手は売りに出せない', !canListForSale(lent, CTX))
  check('借りている選手は又貸しできない', !canLoanOut(lent, CTX))
}

console.log('\n[3] 海外挑戦を承認した選手に国内の話は一切来ない')
{
  const ov = P({ overseasListed: 'europe' } as Partial<Player>)
  check('国内オファー・入札・CPUの買い取りが来ない', !canBePoached(ov, CTX))
  check('フリー移籍の接触も来ない', !canReceiveFreeContact(ov, CTX))
  check('国内の売出には出せない', !canListForSale(ov, CTX))
  check('レンタルにも出せない', !canLoanOut(ov, CTX))
  check('希望した地域からの指名だけは来る', canGoOverseasDream(ov, CTX))
}

console.log('\n[4] 非売の設定')
{
  const ns = P({ noSale: true } as Partial<Player>)
  check('移籍金を払っての引き抜きは来ない', !canBePoached(ns, CTX))
  check('契約が切れる選手へのフリー移籍の接触は止められない', canReceiveFreeContact(ns, CTX))
  check('GM自身が売りに出すのは自由', canListForSale(ns, CTX))
  const ovNs = P({ noSale: true, overseasListed: 'europe' } as Partial<Player>)
  check('非売なら海外挑戦の指名も来ない', !canGoOverseasDream(ovNs, CTX))
}

console.log('\n[5] 引退希望を受けた選手・加入1年目の選手')
{
  const retiring = { ...CTX, retiringIds: new Set(['p1']) }
  check('引退希望の判定', isRetiring(P(), retiring.retiringIds))
  check('引退の話をしている選手に移籍話は来ない', !canBePoached(P(), retiring))
  check('引退希望ならレンタルにも出さない', !canLoanOut(P(), retiring))
  check('引退の話をしている選手は売りに出せない', !canListForSale(P(), retiring))
  check('引退の話をしている選手はトレードにも出せない', !canTradeAway(P(), retiring))
  check('引退の話をしている選手と契約更新の話は始めない', !canStartContractTalk(P(), retiring))
  check('引退の話をしている選手は移籍希望を言い出さない', !canWishTransfer(P(), retiring))
  check('引退の話をしている選手は来たオファーを受けても放出しない', !canAcceptOfferFor(P(), retiring))

  const fresh = P({ joinedYear: 2030 })
  check('今季加入の判定', isNewJoin(fresh, 2030))
  check('加入1年目は引き抜かれない', !canBePoached(fresh, CTX))
  check('年が分からないときは加入1年目の判定をしない', !isNewJoin(fresh, undefined))
  check('海外挑戦は本人とGMが望んだ話なので加入1年目でも止めない',
    canGoOverseasDream(P({ joinedYear: 2030, overseasListed: 'europe' } as Partial<Player>), CTX))
}

console.log('\n[6] 条件がソースに手書きでコピーし直されていない')
// 1箇所でも手書きに戻ると、そこだけ条件が抜けて「海外挑戦を認めたのに売られる」が再発する。
// 移籍の話を作っている gameStore では、生の noSale / overseasListed を読まないこと
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(n) ? [p] : [])
})
// store は分割済み。本文は scripts/storeSource の1本から取る（範囲の決め方もそこ）
const store = storeSource()
// 生の読み取りが許されるのは「GMが本人と話して札を付け替える」処理だけ。
// それ以外（オファー生成・入札・自動購入・トレード打診）は必ず transferEligibility を通す
const rawNoSale = (store.match(/\.noSale\b/g) ?? []).length
const rawOverseasListed = (store.match(/\.overseasListed\b/g) ?? []).length
// 5箇所の内訳：toggleNoSale が2（付け直しの可否＋反転そのもの）、
// トレード打診の除外が1、移籍後の札はがしが1、コメント中の言及が1
check('gameStore の生 noSale 読みが増えていない', rawNoSale <= 5, `いま${rawNoSale}箇所`)
check('gameStore の生 overseasListed 読みが増えていない', rawOverseasListed <= 4, `いま${rawOverseasListed}箇所`)
// store は分割済みなので import のパスは '../utils/…' と '../../utils/…' の両方がありうる。
// **深さを決め打ちしないこと**（決め打ちしていたせいで、移動しただけで落ちた）
check('store が transferEligibility を使っている', /from '\.\.\/(\.\.\/)?utils\/transferEligibility'/.test(store))

const srcFiles = walk('src')
const elig = join('src', 'utils', 'transferEligibility.ts')
const windowLeftovers = srcFiles.filter(f => f !== elig && /isWindowOpenNow|windowOpen\b/.test(readFileSync(f, 'utf-8')))
check('撤廃した移籍ウィンドウの判定が残っていない', windowLeftovers.length === 0, windowLeftovers.join(', '))

console.log('\n[7] 枝分かれした移籍の入口が全部この判定を通っている')
// トレード・レンタル・契約更新・入札は入口がバラバラで、それぞれが自前で
// 「p.teamId === playerTeamId」しか見ていなかった。借りている選手を売る・貸す・
// 契約更新する、が全部できてしまっていたので、入口ごとに関数名で確かめる
// 実装の切り出しは scripts/storeSource の actionBody 1本（型の宣言と実装の見分けもそこ）
const has = (fn: string, needle: string) => actionBody(store, fn).includes(needle)
check('入札（submitTransferBid）が canBePoached を通る', has('submitTransferBid', 'canBePoached'))
check('移籍成立（finalizeTransfer）でもう一度確かめている', has('finalizeTransfer', 'canBePoached'))
check('トレード（tradePlayer）が canTradeAway を通る', has('tradePlayer', 'canTradeAway'))
check('CPUのトレード提案（acceptTradeOffer）が判定を通る', has('acceptTradeOffer', 'canTradeAway'))
check('レンタル放出（loanOutPlayer）が canLoanOut を通る', has('loanOutPlayer', 'canLoanOut'))
// 契約更新は isOwnedBy を直に呼ばず、contractTalk の canOfferRenewal を通る。
// その中で canStartContractTalk → isTalkFree → isOwnedBy と辿るので**所属の確認は効いている**
// （借りている選手の更新はここで止まる）。入口の名前で見ること
check('契約更新（initiateContractRenewal）が canOfferRenewal を通る', has('initiateContractRenewal', 'canOfferRenewal'))
check('契約要求の生成（generateContractRequests）が isOwnedBy を通る', has('generateContractRequests', 'isOwnedBy'))
check('スカウト（startAcquisitionOffer）が canBePoached を通る', has('startAcquisitionOffer', 'canBePoached'))
const market = readFileSync(join('src', 'components', 'transfer', 'TransferPage.tsx'), 'utf-8')
check('移籍市場の一覧も同じ判定で絞っている', market.includes('canBePoached'))
const chat = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf-8')
check('チャットのトレード候補も同じ判定で絞っている', chat.includes('canTradeAway') && chat.includes('canBePoached'))

console.log('\n[8] 引退を「承認したあと」も引退の話をしている扱いのまま')
// ここが本丸。承認すると retirementRequests から消えて pendingRetirementYear が立つ。
// 前は retiringIds（＝未承認のリスト）しか見ていなかったので、**承認した瞬間に
// 引退の札が消えて、また普通に売れる選手に戻っていた**。
// 「引退します！」と言った選手がよそへ移籍する不具合はこれ
{
  const done = P({ pendingRetirementYear: 2030 } as Partial<Player>)
  check('承認済みも引退の話をしている扱い', isRetiring(done, new Set<string>()))
  check('承認済みは他の話を一切抱えていない状態ではない', !isTalkFree(done, CTX))
  check('承認済みは引き抜かれない', !canBePoached(done, CTX))
  check('承認済みはフリー接触も来ない', !canReceiveFreeContact(done, CTX))
  check('承認済みは売りに出せない', !canListForSale(done, CTX))
  check('承認済みはトレードに出せない', !canTradeAway(done, CTX))
  check('承認済みはレンタルに出せない', !canLoanOut(done, CTX))
  check('承認済みは契約更新の話をしない', !canStartContractTalk(done, CTX))
  check('承認済みは移籍希望を言い出さない', !canWishTransfer(done, CTX))
  check('承認済みは来たオファーを受けても放出しない', !canAcceptOfferFor(done, CTX))
  check('承認済みは海外からのオファーでも放出しない', !canAcceptOfferFor(done, CTX, true))
  check('承認済みは海外挑戦の指名も来ない',
    !canGoOverseasDream(P({ pendingRetirementYear: 2030, overseasListed: 'europe' } as Partial<Player>), CTX))
}

console.log('\n[9] 来たオファーを受けるところにも判定が入っている')
{
  const ov = P({ overseasListed: 'europe' } as Partial<Player>)
  check('素の選手は受けられる', canAcceptOfferFor(P(), CTX))
  check('海外挑戦を承認した選手は国内オファーを受けられない', !canAcceptOfferFor(ov, CTX))
  check('海外挑戦を承認した選手は海外からのオファーなら受けられる', canAcceptOfferFor(ov, CTX, true))
  check('借りている選手は受けられない',
    !canAcceptOfferFor(P({ loan: { ownerTeamId: 'b', untilYear: 2031 } } as Partial<Player>), CTX, true))
}

console.log('\n[10] 判定の本体が1つしか無い')
// can〜 が増えるのは構わないが、条件を自前で書き直したものが増えると元の木阿弥。
// 「isOwnedBy と isRetiring と overseasListed を並べて書いている関数」は
// 土台（isTalkFree）と、例外が要る canGoOverseasDream / canAcceptOfferFor だけに保つ
const eligSrc = readFileSync(elig, 'utf-8')
const bodies = eligSrc.split(/export function |^function /m).slice(1)
const handwritten = bodies.filter(b => b.includes('isRetiring(p, ctx.retiringIds)') && b.includes('isOwnedBy(p, ctx.teamId)'))
  .map(b => b.slice(0, b.indexOf('(')))
check('条件を並べ書きしているのは土台と例外の3つだけ', handwritten.length === 3, handwritten.join(', '))
check('土台が isTalkFree という名前で外に出ている', eligSrc.includes('export function isTalkFree'))

console.log('\n[11] 引退・海外挑戦を承認したら、その選手の札を全部たたんでいる')
// 承認処理が自分で1つ2つ消すのをやめて、片付けは store の set にかぶせた1枚に寄せた。
// ここが手書きに戻ると「承認した直後にそのまま移籍が成立する」が再発する
check('片付けのかぶせが store にある', store.includes('const set: SetGame = (partial) =>'))
check('引退の承認（acceptRetirement）が set を通る', has('acceptRetirement', 'set(state'))
check('海外挑戦の承認（approveOverseasChallenge）が set を通る', has('approveOverseasChallenge', 'set(state'))
check('オファー承諾（acceptIncomingOffer）が canAcceptOfferFor を通る', has('acceptIncomingOffer', 'canAcceptOfferFor'))
check('オファー逆提示（counterIncomingOffer）が canAcceptOfferFor を通る', has('counterIncomingOffer', 'canAcceptOfferFor'))
// 契約更新の判定は utils/contractTalk.ts に寄せてある（canRequestRenewal の中で canStartContractTalk を通る）
check('契約要求の生成（generateContractRequests）が canRequestRenewal を通る', has('generateContractRequests', 'canRequestRenewal'))
check('契約更新の判定の土台が canStartContractTalk のまま', readFileSync(join('src', 'utils', 'contractTalk.ts'), 'utf-8').includes('canStartContractTalk(p, {'))
// ここだけ logicSource（store＋engine）で見る。**「どこに書いてあるか」ではなく
// 「その決まりを通っているか」を見る判定**で、直訴の生成は engine/playerWishes へ移した。
// 上の has(...) 群は「store にこれを手書きしていないか」を見る別の性格の判定なので
// storeSource のままにしてある（engine を混ぜると主張が変わってしまう）
check('移籍希望の生成（playerWishes）が canWishTransfer を通る', logicSource().includes('canWishTransfer(p, {'))

console.log('\n[12] 退団予定（isLeavingClub）を1箇所で見ている')
// 「移籍を認めたのに引き留めの条件が出る」の対策。
//   ・新しい話（契約更新・移籍希望・レンタル）は退団予定の選手に出さない
//   ・来た話（オファー・トレード）は退団予定の選手こそ相手なので止めない
// この線引きを関数の外に書き直すと、また片方だけ直した状態に戻る
{
  const listed = P({ transferListed: true } as Partial<Player>)
  check('売出・移籍容認は退団予定', isLeavingClub(listed))
  check('引退の承認も退団予定', isLeavingClub(P({ pendingRetirementYear: 2030 } as Partial<Player>)))
  check('海外挑戦の承認も退団予定', isLeavingClub(P({ overseasListed: 'europe' } as Partial<Player>)))
  check('素の選手は退団予定ではない', !isLeavingClub(P()))
  check('退団予定と契約更新の話は始めない', !canStartContractTalk(listed, CTX))
  check('退団予定は移籍希望を言い出さない', !canWishTransfer(listed, CTX))
  check('退団予定はレンタルに出さない', !canLoanOut(listed, CTX))
  check('退団予定でも来たオファーは受けられる', canAcceptOfferFor(listed, CTX))
  check('退団予定でもトレードには出せる', canTradeAway(listed, CTX))
  check('退団予定でも他クラブは引き抜きに来られる', canBePoached(listed, CTX))
  check('用件を止める判定が talkSync の片付けでも使われている',
    readFileSync(join('src', 'utils', 'talkSync.ts'), 'utf-8').includes('isLeavingClub'))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
