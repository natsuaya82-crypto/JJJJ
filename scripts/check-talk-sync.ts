/**
 * 「選手が動いたら、その選手についての交渉ごとの札は必ず片付く」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-talk-sync.ts
 *
 * 直したのは、札の片付けが話ごとに手書きで、付いている所と付いていない所があったこと。
 * 契約更新の要求は退団しても消えず、逆提示で売れたときだけ出品の掃除が抜けていて、
 * トレード交渉に至っては一度も見直されず、対象がよそへ移ったあとでも成立ボタンが押せた。
 */
import { reconcileTalks, STALE_TRADE_MSG } from '../src/utils/talkSync'
import type { TalkLists } from '../src/utils/talkSync'
import type { Player } from '../src/types'

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
  const r = run({
    retirementRequests: [{ playerId: 'p1', age: 34 }, { playerId: 'p3', age: 34 }],
    transferRequests: [{ playerId: 'p2', reason: 'playing_time' as const }, { playerId: 'p4', reason: 'unhappy' as const }],
    overseasRequests: [{ playerId: 'p1', region: 'europe' as never }, { playerId: 'p5', region: 'europe' as never }],
  })
  check('引退希望は自チームの選手だけ', ids(r.retirementRequests) === 'p1')
  check('移籍希望は自チームの選手だけ', ids(r.transferRequests) === 'p2')
  check('海外挑戦の直訴も自チームの選手だけ', ids(r.overseasRequests) === 'p1')
  // ケガ中でも話は続く（status が active でないだけで所属は変わっていない）
  const hurt = [P('p1', 'me', { status: 'injured' } as Partial<Player>)]
  const r2 = reconcileTalks({ transferRequests: [{ playerId: 'p1', reason: 'playing_time' as const }] }, hurt, 'me')
  check('ケガ中の選手の直訴は消さない', ids(r2.transferRequests) === 'p1')
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

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
