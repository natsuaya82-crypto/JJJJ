/**
 * 「選手が動いたら、その選手についての交渉ごとの札は必ず片付く」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-talk-sync.ts
 *
 * 直したのは、札の片付けが話ごとに手書きで、付いている所と付いていない所があったこと。
 * 契約更新の要求は退団しても消えず、逆提示で売れたときだけ出品の掃除が抜けていて、
 * トレード交渉に至っては一度も見直されず、対象がよそへ移ったあとでも成立ボタンが押せた。
 */
import { reconcileTalks, openWishIds, STALE_TRADE_MSG, SETTLED_TRADE_MSG, settledPath } from '../src/utils/talkSync'
import type { TalkLists } from '../src/utils/talkSync'
import type { Player } from '../src/types'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player

// me:p1,p2 / other:p3 / 引退:p4 / 無所属:p5
const PLAYERS = [
  P('p1', 'me'), P('p2', 'me'), P('p3', 'other'),
  P('p4', '', { status: 'retired' } as Partial<Player>), P('p5', ''),
]
const run = (t: TalkLists, players: Player[] = PLAYERS) => reconcileTalks(t, players, 'me')
const ids = (a: { playerId: string }[] | undefined) => (a ?? []).map(x => x.playerId).join(',')

console.log('\n[1] 出品は「出しているクラブに今も居るか」で見る（CPUの出品も同じ）')
{
  const L = (playerId: string, fromTeamId: string) =>
    ({ id: `l_${playerId}`, playerId, fromTeamId, askingPrice: 100, listedAtRace: 0, expiresAtRace: 9, competingTeams: [] })
  const r = run({ transferListings: [L('p1', 'me'), L('p2', 'other'), L('p3', 'other'), L('p4', 'me')] })
  check('自チームの出品は残る', ids(r.transferListings).includes('p1'))
  check('よそへ移った選手の出品は消える', !ids(r.transferListings).includes('p2'))
  check('CPUの出品も残る', ids(r.transferListings).includes('p3'))
  check('引退した選手の出品は消える', !ids(r.transferListings).includes('p4'))
}

console.log('\n[2] 購入オファーは自チームの選手のものだけ')
{
  const O = (playerId: string) => ({ id: `o_${playerId}`, fromTeamId: 'other', playerId, offeredPrice: 100, expiresAtRace: 9, round: 1 })
  const r = run({ incomingOffers: [O('p1'), O('p3'), O('p4')] })
  check('自チームの選手へのオファーは残る', ids(r.incomingOffers) === 'p1')
}

console.log('\n[3] レンタルの打診は向きで見る')
{
  const A = (playerId: string, direction: 'lend_out' | 'borrow_in') =>
    ({ id: `il_${playerId}_${direction}`, fromTeamId: 'other', playerId, direction, years: 1, expiresAtRace: 9 })
  const r = run({ incomingLoanOffers: [A('p1', 'lend_out'), A('p3', 'lend_out'), A('p3', 'borrow_in'), A('p1', 'borrow_in')] })
  const got = (r.incomingLoanOffers ?? []).map(o => `${o.playerId}:${o.direction}`)
  check('貸してほしいは自チームの選手だけ残る', got.includes('p1:lend_out') && !got.includes('p3:lend_out'))
  check('借りませんかは相手クラブの選手だけ残る', got.includes('p3:borrow_in') && !got.includes('p1:borrow_in'))
}

console.log('\n[4] 自分から出したレンタル要請は相手クラブに居ることが前提')
{
  const R = (playerId: string, targetTeamId: string) => ({ id: `lr_${playerId}`, playerId, targetTeamId, years: 1, submittedAtRace: 0 })
  const r = run({ loanRequests: [R('p3', 'other'), R('p1', 'other')] })
  check('相手クラブに居る選手への要請は残る', ids(r.loanRequests) === 'p3')
}

console.log('\n[5] トレード交渉は消さずに破談にする')
{
  const N = (id: string, giveIds: string[], getIds: string[], extra: Record<string, unknown> = {}) =>
    ({ id, targetTeamId: 'other', giveIds, givePickKeys: [], getIds, getPickKeys: [], round: 1, status: 'countered' as const, message: 'もとの文', ...extra })
  const r = run({ tradeNegotiations: [
    N('n1', ['p1'], ['p3']),                    // 前提が生きている
    N('n2', ['p3'], ['p3']),                    // 出す選手が自チームに居ない
    N('n3', ['p1'], ['p1']),                    // もらう選手が相手クラブに居ない
    N('n4', ['p1'], ['p3'], { demandAddIds: ['p3'] }), // 追加要求の選手が自チームに居ない
    N('n5', ['p3'], ['p1'], { status: 'rejected' as const }), // 決着済みは触らない
  ] })
  const at = (id: string) => (r.tradeNegotiations ?? []).find(n => n.id === id)!
  check('件数は減らさない', (r.tradeNegotiations ?? []).length === 5)
  check('前提が生きている話はそのまま', at('n1').status === 'countered' && at('n1').message === 'もとの文')
  check('出す選手が動いていたら破談', at('n2').status === 'rejected')
  check('もらう選手が動いていたら破談', at('n3').status === 'rejected')
  check('追加要求の選手が動いていたら破談', at('n4').status === 'rejected')
  check('破談には理由が入る', at('n2').message === STALE_TRADE_MSG)
  check('決着済みの話は書き換えない', at('n5').message === 'もとの文')
}

console.log('\n[6] 契約更新は応対できるものだけ見る')
{
  const C = (playerId: string, status: 'pending_gm' | 'countered' | 'accepted' | 'rejected') =>
    ({ id: `c_${playerId}_${status}`, playerId, initiatedBy: 'player' as const, round: 1, status, demandSalary: 1, demandYears: 1, offerSalary: 1, offerYears: 1 })
  const r = run({ contractRequests: [C('p1', 'pending_gm'), C('p3', 'pending_gm'), C('p3', 'countered'), C('p3', 'accepted'), C('p4', 'pending_gm')] })
  const got = (r.contractRequests ?? []).map(c => c.id)
  check('自チームの選手の要求は残る', got.includes('c_p1_pending_gm'))
  check('退団した選手の要求は消える', !got.includes('c_p3_pending_gm') && !got.includes('c_p3_countered'))
  check('引退した選手の要求も消える', !got.includes('c_p4_pending_gm'))
  check('決着済みは履歴として残す', got.includes('c_p3_accepted'))
}

console.log('\n[7] 獲得交渉：トレード後の契約詰めを消さない')
{
  const A = (playerId: string, source: 'fa' | 'scout', status: 'pending' | 'accepted' = 'pending') =>
    ({ id: `a_${playerId}_${source}_${status}`, playerId, source, round: 1, status, offerSalary: 1, offerYears: 1, offerContractType: 'standard' as const })
  const r = run({ acquisitionOffers: [
    A('p5', 'fa'),      // FA選手への交渉
    A('p1', 'fa'),      // トレードで加入した選手の契約詰め（自チームに居る）
    A('p3', 'fa'),      // よそのクラブへ入ってしまった
    A('p3', 'scout'),   // 他クラブ選手の引き抜きはそのまま
    A('p4', 'scout'),   // 引退したら消える
    A('p3', 'fa', 'accepted'), // 決着済みは触らない
  ] })
  const got = (r.acquisitionOffers ?? []).map(o => o.id)
  check('FA選手への交渉は残る', got.includes('a_p5_fa_pending'))
  check('トレード加入選手の契約詰めは残る', got.includes('a_p1_fa_pending'))
  check('よそへ入った選手のFA交渉は消える', !got.includes('a_p3_fa_pending'))
  check('引き抜き交渉は移った先でも続く', got.includes('a_p3_scout_pending'))
  check('引退したら引き抜き交渉も消える', !got.includes('a_p4_scout_pending'))
  check('決着済みは残す', got.includes('a_p3_fa_accepted'))
}

console.log('\n[8] 選手からの直訴は自チームの選手のものだけ')
{
  // 1人1つの決まりと混ざらないように、3つのリストは別の選手で見る
  const P8 = [...PLAYERS, P('p6', 'me')]
  const r = reconcileTalks({
    retirementRequests: [{ playerId: 'p1', age: 34 }, { playerId: 'p3', age: 34 }],
    transferRequests: [{ playerId: 'p2', reason: 'playing_time' as const }, { playerId: 'p4', reason: 'unhappy' as const }],
    overseasRequests: [{ playerId: 'p6', region: 'europe' as never }, { playerId: 'p5', region: 'europe' as never }],
  }, P8, 'me')
  check('引退希望は自チームの選手だけ', ids(r.retirementRequests) === 'p1')
  check('移籍希望は自チームの選手だけ', ids(r.transferRequests) === 'p2')
  check('海外挑戦の直訴も自チームの選手だけ', ids(r.overseasRequests) === 'p6')
  // ケガ中でも話は続く（status が active でないだけで所属は変わっていない）
  const hurt = [P('p1', 'me', { status: 'injured' } as Partial<Player>)]
  const r2 = reconcileTalks({ transferRequests: [{ playerId: 'p1', reason: 'playing_time' as const }] }, hurt, 'me')
  check('ケガ中の選手の直訴は消さない', ids(r2.transferRequests) === 'p1')
}

console.log('\n[8.2] 直訴は1人につき1つだけ（引退＞海外＞移籍）')
// ベルの数とチャットの行数が合わない主因。3つのリストを別々に抽選していたので、
// 同じ選手が「移籍したい」と「海外に行きたい」を同時に持てた。
// 抽選側は openWishIds で外し、最後にここで1つに揃える
{
  const talks: TalkLists = {
    retirementRequests: [{ playerId: 'p1', age: 36 }],
    overseasRequests: [{ playerId: 'p1', region: 'europe' as never }, { playerId: 'p2', region: 'europe' as never }],
    transferRequests: [{ playerId: 'p1', reason: 'unhappy' as const }, { playerId: 'p2', reason: 'unhappy' as const }],
  }
  check('抽選側が見る一覧に、直訴を出している選手が全部入る',
    [...openWishIds(talks)].sort().join(',') === 'p1,p2')
  const r = run(talks)
  check('一番強い引退の札は残る', ids(r.retirementRequests) === 'p1')
  check('引退したい選手の海外挑戦は落とす', ids(r.overseasRequests) === 'p2')
  check('引退したい選手の移籍希望も落とす', ids(r.transferRequests) === '')
  check('海外を出した選手の移籍希望も落とす', !ids(r.transferRequests).includes('p2'))
  // 1つしか持っていなければ何も起きない
  const one: TalkLists = { transferRequests: [{ playerId: 'p1', reason: 'unhappy' as const }] }
  check('1つだけなら元のまま', run(one) === one)
}

console.log('\n[8.5] チャットのログは、居なくなった選手のぶんを片付ける')
{
  // ログはシーズン中ずっと残るので、引退・消滅した選手のぶんを残すとセーブが膨らむだけ。
  // よそのクラブへ移った選手は獲得交渉の会話が続くことがあるので消さない
  const logs = {
    p1: [{ from: 'player' as const, text: 'よろしくお願いします' }],
    p3: [{ from: 'player' as const, text: '条件次第です' }],
    p4: [{ from: 'player' as const, text: 'お世話になりました' }],
    p9: [{ from: 'player' as const, text: 'もう居ない選手' }],
  }
  const r = run({ chatLogs: logs })
  check('自チームの選手のログは残る', !!r.chatLogs?.p1)
  check('よそのクラブの選手のログも残る', !!r.chatLogs?.p3)
  check('引退した選手のログは消える', !r.chatLogs?.p4)
  check('データから消えた選手のログも消える', !r.chatLogs?.p9)
  const kept = { chatLogs: { p1: logs.p1 } }
  check('消すものが無ければ元のまま', run(kept) === kept)
}

console.log('\n[9] 何も起きていなければ元のまま返す（無駄な保存を起こさない）')
{
  const talks: TalkLists = {
    incomingOffers: [{ id: 'o1', fromTeamId: 'other', playerId: 'p1', offeredPrice: 100, expiresAtRace: 9, round: 1 }],
    transferRequests: [{ playerId: 'p2', reason: 'unhappy' as const }],
  }
  const r = run(talks)
  check('同じオブジェクトを返す', r === talks)
  check('からっぽでもそのまま', run({}) !== undefined)
  // 一度通した結果をもう一度通しても変わらない
  const once = run({ transferRequests: [{ playerId: 'p3', reason: 'unhappy' as const }] })
  check('二度通しても変わらない', run(once) === once)
}

console.log('\n[10] 進路が決まった選手の札は全部たたむ')
// 引退を承認した／海外挑戦を承認した選手は、ロスターには残ったまま進路だけ決まっている。
// belongsToClub では「まだ居る」なので前提が崩れたと判定できず、承認処理の側で
// 手作業で1つ2つ消していただけだった。買い取りオファー・売出・レンタル打診・トレード・
// 移籍希望・契約更新が残り、**「引退します」と言った選手がそのままよそへ移籍していた**
{
  // r1=引退を承認済み / o1=海外挑戦を承認済み
  const P2 = [
    P('r1', 'me', { pendingRetirementYear: 2030 } as Partial<Player>),
    P('o1', 'me', { overseasListed: 'europe' } as Partial<Player>),
    P('n1', 'me'), P('x1', 'other'),
  ]
  check('引退を承認した選手は進路が決まっている', settledPath(P2[0]) === 'retiring')
  check('海外挑戦を承認した選手も進路が決まっている', settledPath(P2[1]) === 'overseas')
  check('普通の選手はまだ何も決まっていない', settledPath(P2[2]) === null)

  const go = (t: TalkLists) => reconcileTalks(t, P2, 'me')
  const L = (playerId: string) =>
    ({ id: `l_${playerId}`, playerId, fromTeamId: 'me', askingPrice: 100, listedAtRace: 0, expiresAtRace: 9, competingTeams: [] })
  const lr = go({ transferListings: [L('r1'), L('o1'), L('n1')] })
  check('引退を承認した選手は売出から下ろす', !ids(lr.transferListings).includes('r1'))
  check('海外挑戦を承認した選手も国内の売出から下ろす', !ids(lr.transferListings).includes('o1'))
  check('普通の選手の出品は残る', ids(lr.transferListings) === 'n1')

  const O = (playerId: string, fromForeign?: boolean) =>
    ({ id: `o_${playerId}${fromForeign ? 'f' : ''}`, fromTeamId: 'other', playerId, offeredPrice: 100, expiresAtRace: 9, round: 1, ...(fromForeign ? { fromForeign: true } : {}) })
  const or_ = go({ incomingOffers: [O('r1'), O('r1', true), O('o1'), O('o1', true), O('n1')] })
  check('引退を承認した選手への買い取りオファーは全部消える', !ids(or_.incomingOffers).includes('r1'))
  check('海外挑戦を承認した選手への国内オファーは消える',
    (or_.incomingOffers ?? []).filter(o => o.playerId === 'o1' && !o.fromForeign).length === 0)
  check('海外挑戦を承認した選手への海外からのオファーだけ残る',
    (or_.incomingOffers ?? []).filter(o => o.playerId === 'o1').length === 1)
  check('普通の選手へのオファーは残る', ids(or_.incomingOffers).includes('n1'))

  const LO = (playerId: string, direction: 'lend_out' | 'borrow_in', fromTeamId: string) =>
    ({ id: `lo_${playerId}`, fromTeamId, playerId, direction, years: 1, expiresAtRace: 9 })
  const lor = go({ incomingLoanOffers: [LO('r1', 'lend_out', 'other'), LO('n1', 'lend_out', 'other'), LO('x1', 'borrow_in', 'other')] })
  check('引退を承認した選手のレンタル打診は消える', !ids(lor.incomingLoanOffers).includes('r1'))
  check('普通の選手のレンタル打診は残る', ids(lor.incomingLoanOffers).includes('n1'))
  check('相手の選手を借りませんかの打診は関係ない', ids(lor.incomingLoanOffers).includes('x1'))

  const tn = go({ tradeNegotiations: [
    { id: 't1', targetTeamId: 'other', giveIds: ['r1'], getIds: ['x1'], status: 'countered' as const, round: 1, createdAtRace: 0 },
    { id: 't2', targetTeamId: 'other', giveIds: ['n1'], getIds: ['x1'], status: 'countered' as const, round: 1, createdAtRace: 0 },
  ] })
  check('引退を承認した選手を出すトレードは破談になる', tn.tradeNegotiations?.[0].status === 'rejected')
  check('破談の理由が出る', tn.tradeNegotiations?.[0].message === SETTLED_TRADE_MSG)
  check('関係ないトレードはそのまま', tn.tradeNegotiations?.[1].status === 'countered')

  const cr = go({ contractRequests: [
    { id: 'c1', playerId: 'r1', initiatedBy: 'player' as const, round: 1, status: 'pending_gm' as const, expiresAtRace: 9, demandSalary: 1, demandYears: 2, offerSalary: 0, offerYears: 0 },
    { id: 'c2', playerId: 'n1', initiatedBy: 'player' as const, round: 1, status: 'pending_gm' as const, expiresAtRace: 9, demandSalary: 1, demandYears: 2, offerSalary: 0, offerYears: 0 },
  ] })
  check('引退を承認した選手との契約更新は取り下げる', ids(cr.contractRequests) === 'n1')

  // 残る側は「1人1つ」の決まりに引っかからないよう別々の選手で見る
  const P2b = [...P2, P('n2', 'me'), P('n3', 'me')]
  const dr = reconcileTalks({
    retirementRequests: [{ playerId: 'r1', age: 36 }, { playerId: 'n1', age: 36 }],
    transferRequests: [{ playerId: 'r1', reason: 'unhappy' as const }, { playerId: 'n2', reason: 'unhappy' as const }],
    overseasRequests: [{ playerId: 'r1', region: 'europe' as const }, { playerId: 'n3', region: 'europe' as const }],
  }, P2b, 'me')
  check('進路が決まった選手の引退希望は残らない', ids(dr.retirementRequests) === 'n1')
  check('進路が決まった選手の移籍希望も残らない', ids(dr.transferRequests) === 'n2')
  check('進路が決まった選手の海外直訴も残らない', ids(dr.overseasRequests) === 'n3')
}

console.log('\n[11] 退団予定（移籍を容認した）選手の用件も取り下げる')
// 「移籍を認めたのに引き留めの条件が出る」の対策。
// 容認したときに契約更新の札を status:'rejected' にして残していたので、
//   ・チャットには決着済みの札が「進行中」として出続ける
//   ・容認を取り消しても「もう話した選手」と見なされ、二度と契約更新が出てこない
// の2つが同時に起きていた。ここで**札ごと消す**（履歴に残さない）
{
  const P3 = [P('t1', 'me', { transferListed: true } as Partial<Player>), P('n1', 'me')]
  const go3 = (t: TalkLists) => reconcileTalks(t, P3, 'me')
  const CR = (id: string, playerId: string, status: 'pending_gm' | 'countered' | 'accepted' | 'rejected') =>
    ({ id, playerId, initiatedBy: 'player' as const, round: 1, status, expiresAtRace: 9, demandSalary: 1, demandYears: 2, offerSalary: 0, offerYears: 0 })
  const cr3 = go3({ contractRequests: [CR('c1', 't1', 'pending_gm'), CR('c2', 't1', 'countered'), CR('c3', 't1', 'accepted'), CR('c4', 'n1', 'pending_gm')] })
  const cr3ids = (cr3.contractRequests ?? []).map(r => r.id).join(',')
  check('退団予定の選手の進行中の札は消える', !cr3ids.includes('c1'))
  check('逆提示中の札も消える', !cr3ids.includes('c2'))
  check('決着済み（合意）は履歴として残る', cr3ids.includes('c3'))
  check('普通の選手の札はそのまま', cr3ids.includes('c4'))

  const P3b = [...P3, P('n2', 'me'), P('n3', 'me')]
  const dr3 = reconcileTalks({
    retirementRequests: [{ playerId: 't1', age: 36 }, { playerId: 'n1', age: 36 }],
    transferRequests: [{ playerId: 't1', reason: 'unhappy' as const }, { playerId: 'n2', reason: 'unhappy' as const }],
    overseasRequests: [{ playerId: 't1', region: 'europe' as const }, { playerId: 'n3', region: 'europe' as const }],
  }, P3b, 'me')
  check('退団予定の選手の引退希望は残らない', ids(dr3.retirementRequests) === 'n1')
  check('退団予定の選手の移籍希望も残らない', ids(dr3.transferRequests) === 'n2')
  check('退団予定の選手の海外直訴も残らない', ids(dr3.overseasRequests) === 'n3')

  // 退団予定の選手の「出品」は消してはいけない（容認＝売りに出すこと そのものなので）
  const L3 = (playerId: string) =>
    ({ id: `l_${playerId}`, playerId, fromTeamId: 'me', askingPrice: 100, listedAtRace: 0, expiresAtRace: 9, competingTeams: [] })
  check('退団予定の選手の出品は残る', ids(go3({ transferListings: [L3('t1')] }).transferListings) === 't1')
  const O3 = (playerId: string) =>
    ({ id: `o_${playerId}`, fromTeamId: 'other', playerId, offeredPrice: 100, expiresAtRace: 9, round: 1 })
  check('退団予定の選手への買い取りオファーも残る', ids(go3({ incomingOffers: [O3('t1')] }).incomingOffers) === 't1')
}

console.log('\n[12] レンタルが成立したら、その選手あての打診は全部下がる（同じ選手への二重打診対策）')
// 貸し出し・借り入れが決まった瞬間に選手の所属クラブが変わるので、
// 「貸してほしい」「借りませんか」の前提はどちらも崩れる。
// 前は loanOutPlayer / loanInPlayer のあとに片付けを呼んでいなかったため、
// 同じ選手あての打診が何件も残り、チャットに重複して並んでいた
{
  const A = (id: string, playerId: string, fromTeamId: string, direction: 'lend_out' | 'borrow_in') =>
    ({ id, fromTeamId, playerId, direction, years: 1, expiresAtRace: 9 })
  const talks: TalkLists = {
    incomingLoanOffers: [
      A('a1', 'p1', 'other', 'lend_out'), A('a2', 'p1', 'other2', 'lend_out'),
      A('b1', 'p3', 'other', 'borrow_in'), A('b2', 'p3', 'other', 'borrow_in'),
      A('c1', 'p2', 'other', 'lend_out'),
    ],
  }
  // 貸し出し成立：p1 の所属は借りたクラブになる（loan.ownerTeamId が自分）
  const lentOut = [
    P('p1', 'other', { loan: { ownerTeamId: 'me', yearsLeft: 1 } } as unknown as Partial<Player>),
    P('p2', 'me'), P('p3', 'other'),
  ]
  const r1 = reconcileTalks(talks, lentOut, 'me')
  const left1 = (r1.incomingLoanOffers ?? []).map(o => o.id).join(',')
  check('貸し出しが決まったら、その選手あての打診は1件も残らない', !left1.includes('a1') && !left1.includes('a2'))
  check('関係ない選手あての打診はそのまま', left1.includes('c1'))

  // 借り入れ成立：p3 の所属は自チームになる
  const borrowedIn = [
    P('p1', 'me'), P('p2', 'me'),
    P('p3', 'me', { loan: { ownerTeamId: 'other', yearsLeft: 1 } } as unknown as Partial<Player>),
  ]
  const r2 = reconcileTalks(talks, borrowedIn, 'me')
  const left2 = (r2.incomingLoanOffers ?? []).map(o => o.id).join(',')
  check('借り入れが決まったら、その選手あての打診も1件も残らない', !left2.includes('b1') && !left2.includes('b2'))
}

console.log('\n[13] 札の片付けは store の set 1枚だけが呼ぶ（処理ごとの書き足しをしない）')
// movePlayer を呼ぶ処理は13箇所あり、片付けを書き忘れた処理では古い札が残っていた。
// 呼ぶ場所を増やすのではなく set を1枚かぶせて、players か currentSeason を
// 触った更新は必ず片付けを通す形にした。ここではその形が崩れていないかを見る
{
  // 点検は esbuild で CJS に束ねてから走らせるので import.meta.url が残らない（Invalid URL で落ちる）。
  // 他の点検と同じく、リポジトリ直下からの相対で読む
  const src = readFileSync('src/store/gameStore.ts', 'utf-8')
  check('set のかぶせが store にある', src.includes('const set: SetGame = (partial) =>'))
  check('片付けを呼ぶ場所は store 全体で1つだけ',
    (src.match(/reconcileTalks\(/g) ?? []).length === 1,
    `見つかった数=${(src.match(/reconcileTalks\(/g) ?? []).length}`)
  // トレードの成立ボタンは、条件を満たさないとき黙ってカードを消していた
  // 型宣言の側にも同じ名前が並ぶので、実装の始まりから次の実装までを切り出す
  const txHead = src.indexOf('acceptTradeOffer: (offerId) =>')
  const tx = src.slice(txHead, src.indexOf('rejectTradeOffer: (offerId) =>', txHead))
  check('成立できないトレードは理由を通知に残す', tx.includes("callOff(brokenId, 'trade')") && tx.includes("'trade_unfair'"))
  check('黙ってカードだけ消す道が残っていない',
    !/return \{ currentSeason: \{ \.\.\.state\.currentSeason, pendingTradeOffers:/.test(tx))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
