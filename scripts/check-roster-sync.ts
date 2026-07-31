/**
 * チーム名簿（team.roster）が player.teamId と食い違わないかを確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-roster-sync.ts
 *
 * 直したのは、ユーザー報告の
 *   「トレードで加入した選手がロスター画面に表示されず、駅伝の走者選択には出せるが
 *     カード育成ができない」
 * という不具合。原因は所属の持ち方が2つ（player.teamId と team.roster）あり、
 * 獲得処理が片方しか更新していなかったこと。
 */
import { isSquadMember, squadIdsOf, squadPlayersOf, rebuildRosters } from '../src/utils/rosterSync'
import type { Player, Team } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player
const T = (id: string, main: string[], stray: string[] = []) =>
  ({ id, name: id, roster: { main, second: stray } }) as unknown as Team

console.log('\n[1] 在籍の条件')
check('自チームの現役選手は在籍', isSquadMember(P('p1', 't1'), 't1'))
check('他チームの選手は在籍でない', !isSquadMember(P('p2', 't2'), 't1'))
check('負傷中でも在籍したまま（人数にも数える）', isSquadMember(P('p3', 't1', { status: 'injured' }), 't1'))
check('引退した選手は在籍でない', !isSquadMember(P('p4', 't1', { status: 'retired' }), 't1'))
check('レンタル中の選手は名簿の外（別枠で管理）',
  !isSquadMember(P('p5', 't1', { loan: { ownerTeamId: 't2', untilYear: 2048 } } as Partial<Player>), 't1'))

console.log('\n[2] 報告された不具合の再現と修正')
// トレードで t2 から加入した p9。選手側の所属だけ更新され、名簿への追加が漏れた状態
const players = [
  P('p1', 't1'), P('p2', 't1', { status: 'injured' }), P('p9', 't1'),
  P('p3', 't2'), P('p4', 't1', { status: 'retired' }),
  P('p5', 't1', { loan: { ownerTeamId: 't2', untilYear: 2048 } } as Partial<Player>),
]
const brokenTeams = [T('t1', ['p1', 'p2'], ['p9']), T('t2', ['p3'])]
// 修正前：名簿には居ないが、選手側の所属は自チーム＝「ロスターに出ないのに駅伝には出せる」状態
check('不具合を再現できている（名簿のmainに居ない）', !brokenTeams[0].roster.main.includes('p9'))
check('　しかし選手側の所属は自チーム', players.find(p => p.id === 'p9')!.teamId === 't1')

const fixed = rebuildRosters(players, brokenTeams)
const t1 = fixed.find(t => t.id === 't1')!
check('組み直すと名簿に入る', t1.roster.main.includes('p9'))
check('負傷中の選手も名簿に残る', t1.roster.main.includes('p2'))
check('引退した選手は名簿から消える', !t1.roster.main.includes('p4'))
check('レンタル中の選手は名簿に入らない', !t1.roster.main.includes('p5'))
check('他チームの名簿も正しい', JSON.stringify(fixed.find(t => t.id === 't2')!.roster.main) === JSON.stringify(['p3']))

console.log('\n[3] 画面が使う一覧と名簿が一致する')
check('squadIdsOf と名簿が一致', JSON.stringify(squadIdsOf(players, 't1')) === JSON.stringify(t1.roster.main))
check('squadPlayersOf の人数が一致', squadPlayersOf(players, 't1').length === t1.roster.main.length)
check('カード練習の条件（在籍していること）を全員が満たす',
  squadPlayersOf(players, 't1').every(p => p.teamId === 't1'))

console.log('\n[4] 何度通しても壊れない')
const once = rebuildRosters(players, brokenTeams)
const twice = rebuildRosters(players, once)
check('2回流しても結果が変わらない（冪等）', JSON.stringify(once) === JSON.stringify(twice))
check('　変化が無いときは同じ配列をそのまま返す（無駄な保存を避ける）', rebuildRosters(players, once) === once)
check('元のデータを書き換えていない', !brokenTeams[0].roster.main.includes('p9'))
check('選手が0人のチームでも落ちない', rebuildRosters([], brokenTeams).every(t => t.roster.main.length === 0))
check('所属なし（FA）の選手はどこの名簿にも入らない',
  rebuildRosters([P('fa1', '')], brokenTeams).every(t => !t.roster.main.includes('fa1')))

console.log(`\n${failed === 0 ? '全部OK' : `${failed}件 失敗`}\n`)
process.exit(failed === 0 ? 0 : 1)
