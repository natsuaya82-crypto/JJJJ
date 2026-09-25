/**
 * **移籍でお金が湧かない・消えない**（国内52＋海外180の合計は動かない）。
 *
 * ■何が起きていたか
 *   `movePlayer` は日本のリーグのクラブのお金しか動かさず、相手が海外クラブのときは
 *   呼ぶ側が `settleForeignFee` で海外の側を別に精算していた（6か所）。呼び忘れた道だけ
 *   **片側しかお金が動かない**（海外クラブが移籍金を払わずに選手を持っていく）形で、
 *   実際に競り負けの道とトレードの現金がそうなっていた。
 *
 *   いまはクラブ間でお金を動かすのは `utils/clubMoney` の `payBetween` 1本で、
 *   `movePlayer` もトレードの現金もそれを通る。**どのリーグのクラブでも同じ。**
 *
 * ■なぜ「合計」で見るのか
 *   クラブごとの増減で数えると、同じ回に売って買うクラブがあると差引で相殺されるため。
 *   海外だけの合計でも足りない（日本へ出ていったぶんが消えたように見える）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { payBetween } from '../src/utils/clubMoney'
import { movePlayer } from '../src/utils/movePlayer'
import { tierBudget } from '../src/utils/clubTier'
import { initialWorldClubs } from '../src/store/initialWorld'
import { clubsWhere, isJpelLeague } from '../src/utils/world'
import type { Player, WorldClub } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const oku = (n: number) => (n / 1e8).toFixed(2)

const world: WorldClub[] = initialWorldClubs().map(c => ({ ...c, finance: { ...c.finance, budget: tierBudget(c) } }))
const total = (cs: readonly WorldClub[]) => cs.reduce((s, c) => s + (c.finance?.budget ?? tierBudget(c)), 0)
const budgetOf = (cs: readonly WorldClub[], id: string) => cs.find(c => c.id === id)!.finance!.budget
const [j1, j2] = clubsWhere(world, c => isJpelLeague(c.leagueId)).map(c => c.id)
const [f1, f2] = clubsWhere(world, c => !isJpelLeague(c.leagueId)).map(c => c.id)
const FEE = 300_000_000
const before = total(world)
const player = (teamId: string) => ({
  id: 'p1', name: 'p1', teamId, age: 25, status: 'active', nationality: 'JPN',
  ratings: { speed: 80, stamina: 80, mountainUp: 80, mountainDown: 80, pacing: 80, mental: 80, recovery: 80 },
  contract: { annualSalary: 20_000_000, yearsLeft: 2 },
} as unknown as Player)

console.log('[1] movePlayer に移籍金を渡すと、どの組み合わせでも両側が動く')
for (const [label, from, to] of [
  ['国内 → 国内', j1, j2], ['国内 → 海外', j1, f1], ['海外 → 国内', f1, j1], ['海外 → 海外', f1, f2],
] as const) {
  const m = movePlayer({ players: [player(from)], clubs: world }, 'p1', to, { year: 2031, fee: FEE })
  check(`${label}：選手が動いた`, m.ok && m.players[0].teamId === to)
  check(`  出した側が受け取り、受け取った側が払う`,
    budgetOf(m.clubs, from) === budgetOf(world, from) + FEE && budgetOf(m.clubs, to) === budgetOf(world, to) - FEE,
    `${oku(budgetOf(m.clubs, from) - budgetOf(world, from))}億 / ${oku(budgetOf(m.clubs, to) - budgetOf(world, to))}億`)
  check(`  世界の合計は変わらない`, total(m.clubs) === before, `${oku(total(m.clubs) - before)}億`)
}

console.log('\n[2] payBetween')
{
  const back = payBetween(world, j1, f1, -FEE)
  check('マイナスなら向きが逆（受け取る側が払う）',
    budgetOf(back, j1) === budgetOf(world, j1) + FEE && budgetOf(back, f1) === budgetOf(world, f1) - FEE)
  check('0なら何も動かない', payBetween(world, j1, f1, 0) === world)
  check('同じクラブなら何も動かない', payBetween(world, f1, f1, FEE) === world)
  check('クラブが無くても落ちない', payBetween([], j1, f1, FEE).length === 0)
  const noFin = world.map(c => (c.id === f2 ? { ...c, finance: undefined } : c))
  check('finance の無い古いセーブの海外クラブは、格の年間予算から始める',
    payBetween(noFin, f1, f2, FEE).find(c => c.id === f2)!.finance!.budget === tierBudget(world.find(c => c.id === f2)) + FEE)
}

console.log('\n[3] 海外の側を別に精算する関数が戻っていない／トレードの現金も1本を通る')
{
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(f)) files.push(p)
    }
  }
  walk('src')
  const bad = files.filter(f => /settleForeignFee\(/.test(readFileSync(f, 'utf8')))
  check('settleForeignFee の定義も呼び出しも src のどこにも無い', bad.length === 0, bad.join(' / '))
  const mp = readFileSync('src/utils/movePlayer.ts', 'utf8')
  check('movePlayer のお金は payBetween を通る', /payBetween\(nextClubs, dest, fromTeamId, fee\)/.test(mp))
  check('  movePlayer に「日本のリーグなら」の絞り込みが無い', !/isJpelLeague|jpelClubs\(/.test(mp))
  const market = readFileSync('src/store/slices/marketSlice.ts', 'utf8')
  check('トレードの現金は payBetween を通る', /payBetween\(withPicks, state\.playerTeamId, targetTeamId, transferFee\)/.test(market))
}

console.log(failed === 0 ? '\n✓ 移籍でお金は湧きも消えもしない（どのリーグでも両側が動く）\n' : `\n✗ ${failed}件\n`)
if (failed > 0) process.exit(1)
