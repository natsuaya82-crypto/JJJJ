/**
 * 「ロスターは1つだけ（2軍の枠は無い）」を確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-flat-roster.ts
 *
 * 直したのは、選手に rosterTier('main'/'second')・dualRegistered、
 * チームに roster.second という「2軍の枠」が残っていたこと。
 * 実際には2軍は使っていないのに、獲得やトレードの処理でうっかり second に入ると
 * ロスター画面に出ないのに年俸と枠だけ食う「見えない選手」が生まれていた。
 * 今は所属は player.teamId だけ、名簿は team.roster.main だけ。
 *
 * 既存セーブは migrate v23 で 2軍の枠を落として main に寄せるので、選手は消えない。
 */
import { canReleaseFromRoster, canSignContract, playerStatusLabel, ROSTER_MAX, ROSTER_MIN, teamRosterSize } from '../src/data/rosterRules'
import { rebuildRosters, squadIdsOf, squadPlayersOf } from '../src/utils/rosterSync'
import type { Player, Team } from '../src/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player

console.log('\n[1] 型・データに2軍の枠が残っていない')
// 旧セーブそのままの形（rosterTier / dualRegistered / roster.second 付き）を流し込む
const legacyPlayers = [
  P('p1', 't1', { rosterTier: 'main' } as Partial<Player>),
  P('p2', 't1', { rosterTier: 'second', dualRegistered: true } as Partial<Player>),
  P('p3', 't1', { status: 'retired' } as Partial<Player>),
]
const legacyTeams = [{ id: 't1', name: 't1', roster: { main: ['p1'], second: ['p2'] } }] as unknown as Team[]
const rebuilt = rebuildRosters(legacyPlayers, legacyTeams)
const t1 = rebuilt.find(t => t.id === 't1')!
check('組み直した名簿に second が無い', !('second' in (t1.roster as Record<string, unknown>)))
check('旧2軍の選手も名簿(main)に入る', t1.roster.main.includes('p2'))
check('旧1軍の選手もそのまま名簿に居る', t1.roster.main.includes('p1'))
check('引退選手は名簿に入らない', !t1.roster.main.includes('p3'))
check('元のデータは書き換えない', (legacyTeams[0].roster as Record<string, unknown>).second !== undefined)

console.log('\n[2] 一覧はどこから引いても同じ')
check('squadIdsOf と名簿が一致', JSON.stringify(squadIdsOf(legacyPlayers, 't1')) === JSON.stringify(t1.roster.main))
check('squadPlayersOf の人数が一致', squadPlayersOf(legacyPlayers, 't1').length === t1.roster.main.length)
check('在籍人数も同じ数え方', teamRosterSize(legacyPlayers, 't1') === t1.roster.main.length)

console.log('\n[3] ソースのどこにも2軍の枠が残っていない')
// 1ヶ所でも書き忘れると、そこだけ「2軍の選手が出てこない」状態に戻ってしまう。
// 画面ごとの書き分けが復活しないよう、src配下を丸ごと見張る
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(n) ? [p] : [])
})
const srcFiles = walk('src')
const hits = (word: string) => srcFiles.filter(f => readFileSync(f, 'utf-8').includes(word))
// gameStore の migrate だけは旧セーブの古い形を読んで捨てる処理なので、そこは見逃す
const exceptMigrate = (w: string) => hits(w).filter(f => f !== join('src', 'store', 'gameStore.ts'))
const noneLeft = (w: string) => check(`${w} が残っていない（旧セーブ変換を除く）`,
  exceptMigrate(w).length === 0, exceptMigrate(w).join(', '))
noneLeft('rosterTier')
noneLeft('dualRegistered')
noneLeft('roster.second')
check('RosterTier 型が残っていない', hits('RosterTier').length === 0, hits('RosterTier').join(', '))

console.log('\n[4] 人数の上限・下限はロスター1つぶんだけ')
const many = (n: number) => Array.from({ length: n }, (_, i) => P(`m${i}`, 't1'))
check(`上限は${ROSTER_MAX}人`, canSignContract(many(ROSTER_MAX - 1), 't1') && !canSignContract(many(ROSTER_MAX), 't1'))
// 契約形態ごとの枠は廃止済み。受け取るだけで使わない引数を残すと
// 「形態で枠が変わる」と誤解した呼び出しがまた生えるので、引数そのものを持たない
check('契約形態は上限の判定に関わらない（引数を取らない）', canSignContract.length === 2, `${canSignContract.length}個`)
check(`下限は${ROSTER_MIN}人（${ROSTER_MIN}人からは放出できない）`,
  canReleaseFromRoster(many(ROSTER_MIN + 1), 't1') && !canReleaseFromRoster(many(ROSTER_MIN), 't1'))
check('引退選手は人数に数えない', teamRosterSize([...many(3), P('r1', 't1', { status: 'retired' } as Partial<Player>)], 't1') === 3)

console.log('\n[5] 選手の状態表示に2軍が出てこない')
check('所属あり＝契約中', playerStatusLabel(P('a', 't1')).key === 'standard')
check('所属なし＝契約満了(FA)', playerStatusLabel(P('b', '')).key === 'fa')
check('移籍リスト入り', playerStatusLabel(P('c', 't1', { transferListed: true } as Partial<Player>)).key === 'listed')
check('旧2軍の選手でも「契約中」と出る', playerStatusLabel(P('d', 't1', { rosterTier: 'second' } as Partial<Player>)).key === 'standard')

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
