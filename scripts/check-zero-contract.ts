/**
 * 【契約が残り0年のままクラブに居る選手は居ない】オーナー・2026-09-26
 *   「契約が切れたままでチームに居座るバグが起きてる」
 *   「0年でチャット出るくらいなら勝手に一年足してくれ。それ以外は問答無用で消してくれ」
 *
 *   満了（engine/contractExpiry の processContractExpiry）をくぐって残り0年のまま在籍する道が2つあった。
 *     ・監督について来た選手（applyGmMove。満了でFAになったあと契約を結び直さずに連れて行っていた）
 *     ・レンタル中に契約が切れた選手（レンタル中は満了の対象外）
 *   片付けは settleZeroContracts 1本：自チーム＝残り1年を足す／それ以外＝レンタルでもFA。
 *
 *   ① 自チームの0年の選手は残り1年になる（チームは出ない）
 *   ② ほかのクラブの0年の選手はFA（レンタル中でも）。保有元にも戻らない
 *   ③ 契約が残っている選手・無所属・引退は触らない
 *   ④ 通る口は2つ（endSeason の来季の選手・applyGmMove）で、どちらも settleZeroContracts
 *   ⑤ チャットに「契約が切れたまま」の文が無い
 */
import { readFileSync } from 'node:fs'
import { settleZeroContracts } from '../src/engine/contractExpiry'
import type { Player } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const ME = 'me', CPU = 'cpu', OWNER = 'owner'
const mk = (id: string, teamId: string, yearsLeft: number, extra: Partial<Player> = {}): Player => ({
  id, name: id, teamId, status: 'active',
  contract: { annualSalary: 1000, yearsLeft, faEligibleYear: 2030, contractType: 'regular' },
  ...extra,
} as unknown as Player)

const before = [
  mk('mine0', ME, 0),
  mk('mineLoan0', ME, 0, { loan: { ownerTeamId: OWNER, untilYear: 2031 } }),
  mk('cpu0', CPU, 0),
  mk('cpuLoan0', CPU, 0, { loan: { ownerTeamId: OWNER, untilYear: 2031 } }),
  mk('mine2', ME, 2),
  mk('cpu1', CPU, 1),
  mk('fa0', '', 0),
  mk('ret0', CPU, 0, { status: 'retired' }),
]
const after = settleZeroContracts(before, ME, 2030)
const get = (id: string) => after.find(p => p.id === id)!

console.log('\n[1] 自チームの0年の選手は残り1年になる')
check('自チームの選手は残り1年・自チームのまま', get('mine0').contract.yearsLeft === 1 && get('mine0').teamId === ME,
  `${get('mine0').contract.yearsLeft}年・${get('mine0').teamId}`)
check('自チームが借りている選手も残り1年・自チームのまま', get('mineLoan0').contract.yearsLeft === 1 && get('mineLoan0').teamId === ME)

console.log('\n[2] ほかのクラブの0年の選手はFA')
check('ほかのクラブの選手はFA', get('cpu0').teamId === '', get('cpu0').teamId)
check('レンタル中でもFA（保有元に戻さない）', get('cpuLoan0').teamId === '' && !get('cpuLoan0').loan, `${get('cpuLoan0').teamId}`)

console.log('\n[3] 触らないもの')
check('契約が残っている選手はそのまま', get('mine2').contract.yearsLeft === 2 && get('cpu1').teamId === CPU)
check('無所属・引退はそのまま', get('fa0').teamId === '' && get('fa0').contract.yearsLeft === 0 && get('ret0').teamId === CPU)
check('残り0年のままクラブに居る選手は0人',
  after.filter(p => p.teamId && p.status !== 'retired' && p.contract.yearsLeft === 0).length === 0)

console.log('\n[4] 通る口は2つで、どちらも settleZeroContracts')
{
  const src = readFileSync('src/store/slices/seasonSlice.ts', 'utf8')
  const n = (src.match(/settleZeroContracts\(/g) ?? []).length
  check('seasonSlice から2回呼ぶ（endSeason の来季の選手・applyGmMove）', n === 2, `${n}`)
  const gm = src.slice(src.indexOf('function applyGmMove('), src.indexOf('\n}\n', src.indexOf('function applyGmMove(')))
  check('applyGmMove が返す選手は settleZeroContracts を通る', /players: settleZeroContracts\(players, offer\.teamId/.test(gm))
}

console.log('\n[5] チャットに「契約が切れたまま」の文が無い')
check('chatTalk に無い', !readFileSync('src/utils/chatTalk.ts', 'utf8').includes('契約が切れたまま'))

console.log('')
if (failed > 0) { console.log(`✗ 残り0年のまま居残る選手がいます（${failed}件）`); process.exit(1) }
console.log('✓ 残り0年の選手は、自チームなら1年足し、それ以外はFA')
