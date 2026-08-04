/**
 * 「他クラブから来た買い取りオファーへの返事」と「チャット一覧の仕分け」の自己点検。
 *
 *   npx jiti scripts/check-offer-result.ts
 *
 * 直したのはこの6つ：
 *  ① 30人ちょうどでトレード加入した選手と契約できない（→ check-flat-roster.ts [4b]）
 *  ② 「対応が必要」の人数が水増し（返事の要らない札まで数えていた）
 *  ③ レンタルで借りている選手のチャットが真っ白
 *  ④ 昔の獲得オファーの札が1枚残っているだけで「契約交渉待ち」の行が消える
 *  ⑤ ロスター下限で放出できなかっただけなのに「相手が金を払えず決裂」と嘘の理由が出る
 *  ⑥ 同じ下限なのに、承諾は札が残り逆提示は札が消える（再交渉できない）
 *
 * ⑤⑥は「返り値の言葉」と「結果の文章」がバラバラに手書きされていたのが原因なので、
 * utils/offerResult.ts の1本に寄せた。画面が自前で文章を組み立て直したらここで落とす。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { offerResultText } from '../src/utils/offerResult'
import { ROSTER_MIN } from '../src/data/rosterRules'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const store = readFileSync(join('src', 'store', 'gameStore.ts'), 'utf8')
const chat = readFileSync(join('src', 'components', 'team', 'ChatPage.tsx'), 'utf8')
const transfer = readFileSync(join('src', 'components', 'transfer', 'TransferPage.tsx'), 'utf8')
const offerList = readFileSync(join('src', 'components', 'transfer', 'OfferListPage.tsx'), 'utf8')
const A = { playerName: '田中', teamName: '青葉', price: 50_000_000 }

console.log('\n[1] 結果の文章は種類ごとに1つだけ')
check('成立は成功あつかい', offerResultText('sold', A).ok)
check('成立の文章に移籍金が入る', offerResultText('sold', A).text.includes('5,000万'))
check('移籍金0はフリー移籍の言い方になる', offerResultText('sold', { ...A, price: 0 }).text.includes('フリー移籍'))
check('決裂は失敗あつかい', !offerResultText('refused', A).ok)
check('決裂は「相手が払えなかった」と言う', offerResultText('refused', A).text.includes('支払えず'))

console.log('\n[2] ロスター下限は「決裂」と別の言葉で出す')
const rm = offerResultText('roster_min', A)
check('下限は失敗あつかい', !rm.ok)
check(`下限の理由が${ROSTER_MIN}人だと分かる`, rm.text.includes(`${ROSTER_MIN}人`))
check('下限で「決裂」とは言わない（嘘の理由を出さない）', !rm.text.includes('決裂'))
check('下限は札が残ることを伝える', rm.text.includes('残っています'))
check('無効は札を取り下げたことを伝える', offerResultText('invalid', A).text.includes('取り下げ'))

console.log('\n[3] 承諾と逆提示が同じ言葉を返す')
check('承諾の返り値が true/false のままではない', !store.includes('acceptIncomingOffer: (offerId: string) => boolean'))
check('承諾も逆提示も OfferOutcome を返す', (store.match(/=> OfferOutcome/g) ?? []).length === 2)
check('逆提示の返り値を手書きの union で持っていない', !store.includes("'sold' | 'refused' | 'invalid'"))
check('承諾がロスター下限を専用の言葉で返す', store.includes("return 'roster_min'"))
check('逆提示がロスター下限を専用の言葉で返す', store.includes("outcome = 'roster_min'"))
// 下限で札を消すと補強しても再交渉できない。逆提示側は state をそのまま返す＝札を残す
check('逆提示は下限のとき札を消さない', /outcome = 'roster_min'\n\s+return state\n/.test(store))

console.log('\n[4] 画面が結果の見せ方を自前で持たない')
// 返事の結果は「状態(useOfferResults)」も「見た目(OfferResultList)」も1本。
// 3画面（チャット・移籍・オファー一覧）が同じものを使う。手書きに戻したらここで落とす
for (const [name, src] of [['チャット画面', chat], ['移籍画面', transfer], ['オファー一覧', offerList]] as const) {
  check(`${name}は useOfferResults を使う`, src.includes('useOfferResults()'))
  check(`${name}は OfferResultList を出す`, src.includes('<OfferResultList'))
  check(`${name}が結果の状態を自前で持たない`, !src.includes('setOfferResults'))
  check(`${name}が文章を自前で組み立てない`, !src.includes('offerResultText('))
  check(`${name}に手書きの決裂文が残っていない`, !src.includes('交渉は決裂しました'))
  check(`${name}に手書きの失敗文が残っていない`, !src.includes('売却は成立しませんでした'))
}
// オファー一覧の「売却する」が返り値を捨てていたら死んだボタンに逆戻りする
check('オファー一覧の承諾が結果を出す', offerList.includes('pushOfferResult(o.id, acceptIncomingOffer(o.id)'))
// 成立するとオファーの札は消えるので、結果だけが残る瞬間がある。そこで
// 「· 0件」「0件 — 要確認」「オファーはありません」が出ないこと
check('チャットは結果だけのとき見出しを出さない', chat.includes('{inboundCount > 0 && ('))
check('移籍画面は結果だけのとき見出しを出さない', transfer.includes('{incomingOffers.length > 0 && ('))
check('オファー一覧は結果だけのとき「ありません」を出さない', offerList.includes('offerResults.length === 0 ? <Empty'))

console.log('\n[5] チャット一覧の仕分け')
// 返事の要らない札（今季限りで引退・海外オファー待ち・退団へ）を「対応が必要」に数えない
check('「対応が必要」は actionable で数える', chat.includes('x.status?.actionable'))
check('札の有無だけで数える書き方が残っていない', !chat.includes('x.status !== null') && !chat.includes('x.status === null'))
check('進路が決まった選手は数えない', /'今季限りで引退', color: C.textSub, priority: 0, actionable: false/.test(chat))
check('海外オファー待ちは数えない', /'海外オファー待ち', color: C.purple, priority: 1, actionable: false/.test(chat))
check('退団予定は数えない', /'退団へ', color: C.orange, priority: 1, actionable: false/.test(chat))
check('返事が要る用件は数える（要対応）', /'要対応', color: C.red, priority: 3, actionable: true/.test(chat))
// 数えないだけで札は消さない。OVR順に埋もれると消えたように見えるので その他 の先頭に置く
check('札の表示自体は残す', chat.includes('{status.label}'))
check('札付きは「その他の選手」の先頭に出す', chat.includes('const sa = a.status ? 0 : 1'))
// 「契約交渉待ち」から除くのは、いま動いている獲得交渉だけ
check('契約交渉待ちは動いている獲得交渉だけ除く', chat.includes('feeAcceptedBidIds.has(p.id) && !myPlayers.some(m => m.id === p.id) && !activeAcqPlayerIds.has(p.id)'))
check('status を問わない札で除いていない', !chat.includes('!offerPlayers.some(o => o.id === p.id)'))
// レンタルで借りている選手は用件が無い＝発言0件で真っ白になっていた
check('レンタルで借りている選手に説明を出す', chat.includes("kind: 'loaned_in'"))
check('その説明は保存ログと突き合わせる側にも入っている', (chat.match(/loanNote/g) ?? []).length >= 4)

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
