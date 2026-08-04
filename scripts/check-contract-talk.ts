/**
 * 契約更新の話の判定が、utils/contractTalk.ts の1本だけになっているかを見る検査。
 *
 * もともと「この選手と契約更新の話をしていいか」「今その話は進行中か」「残り何ヶ月か」を、
 * ストア(generateContractRequests)・チャット(ChatPage)・通知(notifItems)・ホーム(Dashboard)・
 * レース後(ResultsPhase) がそれぞれ手書きで数えていた。条件が少しずつ違ったので、
 *   ・チャットには出ないのにホームだけ「契約未解決の選手が3人います」と言う
 *   ・レース後に通知へ強制で飛ばされるが、その通知ページには何も出ていない
 *   ・ケガをした瞬間、契約更新の用件がチャットからも通知からも消える
 *   ・期限切れの札が「拒否」で残り、その選手には二度と契約更新の話が出てこない
 *   ・すでに交渉中なのに「まだ何も連絡がなくて」の催促がもう1通ぶら下がる
 * が全部同時に起きていた。
 *
 * ここが NG になったら、呼び出し側が自前で数え直している。判定は必ず contractTalk に足すこと。
 */
import {
  MAX_CONTRACT_ROUNDS, contractMonthsLeft, isLiveContract, liveContractOf, hasContractTalk,
  freeContactIdsOf, contractTalkCtx, canOfferRenewal, canRequestRenewal, needsRenewalAttention, canReNegotiate,
} from '../src/utils/contractTalk'
import type { ContractRequest, Player } from '../src/types'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (extra: Partial<Player> = {}) =>
  ({ id: 'p1', name: 'p1', teamId: 'a', status: 'active', age: 25, joinedYear: 2028, contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 }, ...extra }) as unknown as Player

const R = (extra: Partial<ContractRequest> = {}) =>
  ({ id: 'c1', playerId: 'p1', initiatedBy: 'player', round: 1, status: 'pending_gm', expiresAtRace: 9, demandSalary: 1, demandYears: 2, offerSalary: 0, offerYears: 0, ...extra }) as ContractRequest

const SEASON = { year: 2030, contractRequests: [] as ContractRequest[], incomingOffers: [], retirementRequests: [] }
const CTX = contractTalkCtx(SEASON, 'a')

console.log('\n[1] 札の状態は「進行中」と「決着」の2つだけ')
// 期限切れは決着ではなく**札ごと消す**。ここを rejected で残すと、
// 「札がある＝もう話した」が嘘になり、その選手はシーズン中ずっと契約更新に出てこなくなる
{
  check('応対待ちは進行中', isLiveContract(R({ status: 'pending_gm' })))
  check('逆提示中も進行中', isLiveContract(R({ status: 'countered' })))
  check('合意は決着', !isLiveContract(R({ status: 'accepted' })))
  check('拒否も決着', !isLiveContract(R({ status: 'rejected' })))
}

console.log('\n[2] 進行中の札の取り出しと「もう話したか」')
{
  const reqs = [R({ id: 'c1', status: 'rejected' }), R({ id: 'c2', status: 'countered' })]
  check('進行中のものを拾う', liveContractOf(reqs, 'p1')?.id === 'c2')
  check('進行中が無ければ何も返さない', liveContractOf([R({ status: 'accepted' })], 'p1') === undefined)
  check('別の選手の札は拾わない', liveContractOf(reqs, 'p9') === undefined)
  check('決着済みでも「もう話した」', hasContractTalk([R({ status: 'rejected' })], 'p1'))
  check('札が無ければ「まだ話していない」', !hasContractTalk([], 'p1'))
}

console.log('\n[3] 残り月数の式は1つだけ')
// チャットの見出し・通知のリマインダー・ホームの警告・レース後の強制遷移が全部これを使う
{
  check('契約満了の年は0ヶ月に近づく', contractMonthsLeft(1, 10, 10) === 0)
  check('シーズン頭なら12ヶ月', contractMonthsLeft(1, 0, 10) === 12)
  check('残り2年ならその上に12ヶ月乗る', contractMonthsLeft(2, 0, 10) === 24)
  check('レース数が0でも壊れない', Number.isFinite(contractMonthsLeft(1, 0, 0)))
  check('消化が総レース数を超えても負にならない', contractMonthsLeft(1, 20, 10) === 0)
}

console.log('\n[4] GMのほうから契約の話を持ちかけていい相手')
{
  check('素の選手には持ちかけられる', canOfferRenewal(P(), CTX))
  check('引退を承認した選手には持ちかけない', !canOfferRenewal(P({ pendingRetirementYear: 2030 } as Partial<Player>), CTX))
  check('海外挑戦を承認した選手には持ちかけない', !canOfferRenewal(P({ overseasListed: 'europe' } as Partial<Player>), CTX))
  check('退団予定（移籍を容認した）選手には持ちかけない', !canOfferRenewal(P({ transferListed: true } as Partial<Player>), CTX))
  check('借りている選手には持ちかけない', !canOfferRenewal(P({ loan: { ownerTeamId: 'b', untilYear: 2031 } } as Partial<Player>), CTX))
  check('決裂して更新ロック中は持ちかけない', !canOfferRenewal(P({ renewalLockedUntilYear: 2031 } as Partial<Player>), CTX))
  check('ロックが切れた年なら持ちかけられる', canOfferRenewal(P({ renewalLockedUntilYear: 2030 } as Partial<Player>), CTX))
  check('ケガ中でも持ちかけられる', canOfferRenewal(P({ status: 'injured' } as Partial<Player>), CTX))
}

console.log('\n[5] フリー接触中の扱い（GMからは通す・本人からは言い出さない）')
// ここを両方止めていたので、「引き留めの条件を提示する」を押しても札が作られず、
// 本人が何も返さない空振りになっていた
{
  const fc = contractTalkCtx({ ...SEASON, incomingOffers: [{ playerId: 'p1', offeredPrice: 0 }] as never }, 'a')
  check('移籍金0円の接触だけを拾う',
    freeContactIdsOf([{ playerId: 'p1', offeredPrice: 0 }, { playerId: 'p2', offeredPrice: 100 }] as never).has('p1'))
  check('買い取りオファーは接触に数えない',
    !freeContactIdsOf([{ playerId: 'p2', offeredPrice: 100 }] as never).has('p2'))
  check('接触中でもGMからの引き留めは通す', canOfferRenewal(P(), fc))
  check('接触中は本人から契約更新を言い出さない', !canRequestRenewal(P(), fc))
  check('接触が無ければ本人からも言い出す', canRequestRenewal(P(), CTX))
}

console.log('\n[6] 「要対応」は1つの判定だけを見る')
// 通知のリマインダー・チャット一覧の赤札・ホームの警告・レース後の強制遷移が全部これ
{
  check('契約最終年で残り6ヶ月未満なら要対応', needsRenewalAttention(P(), 3, CTX))
  check('残り6ヶ月ちょうどはまだ出さない', !needsRenewalAttention(P(), 6, CTX))
  check('契約が2年以上残っていれば出さない', !needsRenewalAttention(P({ contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 } } as Partial<Player>), 3, CTX))
  check('ケガ中でも出す', needsRenewalAttention(P({ status: 'injured' } as Partial<Player>), 3, CTX))
  check('退団予定には出さない', !needsRenewalAttention(P({ transferListed: true } as Partial<Player>), 3, CTX))
  check('引退を承認した選手には出さない', !needsRenewalAttention(P({ pendingRetirementYear: 2030 } as Partial<Player>), 3, CTX))
  const talked = contractTalkCtx({ ...SEASON, contractRequests: [R({ status: 'rejected' })] }, 'a')
  check('もう話した選手には出さない', !needsRenewalAttention(P(), 3, talked))
}

console.log('\n[7] 再交渉はラウンド上限と更新ロックで止まる')
// 上限が無かったので何度でも再交渉でき、「最終ラウンド」の扱いのまま
// 勝手に移籍リスト入り（退団予定）になっていた
{
  check('逆提示には出し直せる', canReNegotiate(R({ status: 'countered', round: 1 }), P(), CTX))
  check('拒否にも出し直せる', canReNegotiate(R({ status: 'rejected', round: 2 }), P(), CTX))
  check('上限に達したら出し直せない', !canReNegotiate(R({ status: 'countered', round: MAX_CONTRACT_ROUNDS }), P(), CTX))
  check('応対待ちの札は出し直す対象ではない', !canReNegotiate(R({ status: 'pending_gm' }), P(), CTX))
  check('合意した札も対象外', !canReNegotiate(R({ status: 'accepted' }), P(), CTX))
  check('退団予定になったら出し直せない', !canReNegotiate(R({ status: 'rejected' }), P({ transferListed: true } as Partial<Player>), CTX))
  check('更新ロック中も出し直せない', !canReNegotiate(R({ status: 'rejected' }), P({ renewalLockedUntilYear: 2031 } as Partial<Player>), CTX))
  check('選手が見つからなければ出し直せない', !canReNegotiate(R({ status: 'rejected' }), undefined, CTX))
}

// ---- ここからソースの検査（呼び出し側が自前で数え直していないか） ----
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf-8')
const store = read('src', 'store', 'gameStore.ts')
const notif = read('src', 'utils', 'notifItems.ts')
const chat = read('src', 'components', 'team', 'ChatPage.tsx')
const dash = read('src', 'components', 'dashboard', 'Dashboard.tsx')
const results = read('src', 'components', 'race', 'ResultsPhase.tsx')
const talkSync = read('src', 'utils', 'talkSync.ts')
const contractTalk = read('src', 'utils', 'contractTalk.ts')

// gameStore の関数の中身を切り出す（次の「      名前: 」まで）
const fnBody = (name: string): string => {
  const i = store.indexOf(`      ${name}: (`)
  if (i < 0) return ''
  const j = store.indexOf('\n      },', i)
  return store.slice(i, j < 0 ? store.length : j)
}
const has = (name: string, needle: string) => fnBody(name).includes(needle)

console.log('\n[8] 呼び出し側が判定を自前で書き直していない')
{
  check('残り月数の式が contractTalk にしかない',
    [store, notif, chat, dash, results].every(src => !src.includes('yearsLeft - 1 +')))
  check('「進行中の札」を status の並べ書きで探していない',
    [store, notif, chat, dash, results].every(src => !src.includes("!== 'accepted' && r.status !== 'rejected'")))
  check('チャットが contractTalk を通している', chat.includes("from '../../utils/contractTalk'"))
  check('通知が contractTalk を通している', notif.includes("from './contractTalk'"))
  check('ホームが contractTalk を通している', dash.includes('needsRenewalAttention'))
  check('レース後が contractTalk を通している', results.includes('needsRenewalAttention'))
  check('残り月数の実体が contractTalk にある', contractTalk.includes('export function contractMonthsLeft'))
  check('通知は contractMonthsLeft を持たず再輸出している', !notif.includes('function contractMonthsLeft'))
}

console.log('\n[9] 期限切れの札は「拒否」で残さず消す')
// ここが rejected で残っていたのが「契約更新のチャットが出てこない」の一番大きい原因。
// countered（逆提示中）が期限切れの対象から漏れていたのも同じ
{
  const rr = fnBody('runRace')
  check('期限切れの札を消している', rr.includes('!expiredContractIds.has(r.id)'))
  check('期限切れの対象を isLiveContract で拾っている（逆提示中も含む）',
    rr.includes('isLiveContract(r) && (r.expiresAtRace'))
  check('期限切れを status:\'rejected\' に書き換えていない', !rr.includes("status: 'rejected' as const, ...(r.playerId"))
}

console.log('\n[10] 状況が変わったら札の片付けを1箇所（reconcileTalks）に通す')
// 移籍を容認した／容認を取り消した／非売・貸出を切り替えた、のどれでも
// 古い札が残っていて、チャットに出る用件と実際にできることが食い違っていた
{
  check('移籍の容認（allowPlayerTransfer）が reconcileTalks を通る', has('allowPlayerTransfer', 'reconcileTalks'))
  check('売出の取り消し（cancelSellListing）が reconcileTalks を通る', has('cancelSellListing', 'reconcileTalks'))
  check('非売の切り替え（toggleNoSale）が reconcileTalks を通る', has('toggleNoSale', 'reconcileTalks'))
  check('貸出の切り替え（toggleLoanListed）が reconcileTalks を通る', has('toggleLoanListed', 'reconcileTalks'))
  check('片付け側が「退団予定」も見ている', talkSync.includes('isLeavingClub'))
  check('片付け側が進行中の札だけを対象にしている', talkSync.includes('!isLiveContract(r) ||'))
}

console.log('\n[11] チャットの用件が二重に出ない')
// 初回に組み立てるときと、開き直したときの差分を作るときで条件が別々だったので、
// 交渉中の会話の下に「まだ何も連絡がなくて」の催促がもう1通ぶら下がっていた
{
  check('催促を出すかどうかの条件が1つ（remindMonths）', chat.includes('const remindMonths ='))
  check('初回の組み立てが remindMonths を使う', chat.includes('buildMessages(player, contractReq, remindMonths'))
  check('催促の判定に hasContractTalk が入っている', chat.includes('hasContractTalk(contractRequests, player.id)'))
  check('契約更新のメッセージに kind が付いている（同じ用件を増やさない）',
    ['contract_gm_open', 'contract_offer', 'contract_accept', 'contract_counter', 'contract_reject'].every(k => chat.includes(k)))
  check('退団予定の選手には用件を出さない分岐がフリー接触より前にある',
    chat.indexOf('if (player.transferListed) return [') < chat.indexOf('if (freeContactOffer) {'))
  check('チャット一覧がケガ人も対象にしている', chat.includes("p.status === 'active' || p.status === 'injured'"))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
