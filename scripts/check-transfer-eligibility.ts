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
  isNewJoin, isRetiring, isOwnedBy,
  canBePoached, canReceiveFreeContact, canGoOverseasDream, canListForSale, canLoanOut,
} from '../src/utils/transferEligibility'
import type { Player } from '../src/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
  check('引退希望でも売出そのものは止めない（GMの判断）', canListForSale(P(), retiring))

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
const store = readFileSync(join('src', 'store', 'gameStore.ts'), 'utf-8')
// 生の読み取りが許されるのは「GMが本人と話して札を付け替える」処理だけ。
// それ以外（オファー生成・入札・自動購入・トレード打診）は必ず transferEligibility を通す
const rawNoSale = (store.match(/\.noSale\b/g) ?? []).length
const rawOverseasListed = (store.match(/\.overseasListed\b/g) ?? []).length
check('gameStore の生 noSale 読みが増えていない', rawNoSale <= 4, `いま${rawNoSale}箇所`)
check('gameStore の生 overseasListed 読みが増えていない', rawOverseasListed <= 4, `いま${rawOverseasListed}箇所`)
check('gameStore が transferEligibility を使っている', store.includes("from '../utils/transferEligibility'"))

const srcFiles = walk('src')
const elig = join('src', 'utils', 'transferEligibility.ts')
const windowLeftovers = srcFiles.filter(f => f !== elig && /isWindowOpenNow|windowOpen\b/.test(readFileSync(f, 'utf-8')))
check('撤廃した移籍ウィンドウの判定が残っていない', windowLeftovers.length === 0, windowLeftovers.join(', '))

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
