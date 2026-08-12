/**
 * **移籍でお金が湧かない・消えない**（国内52＋海外180の合計は動かない）。
 *
 * ■何が起きていたか
 *   `movePlayer` は `teams`（国内52クラブ）しか知りません。そのため相手が海外クラブだと
 *   **片側しかお金が動きませんでした**。
 *
 *     自チームが海外へ売る … 自チームは受け取るが、海外クラブは払っていない（世界のお金が増える）
 *     自チームが海外から買う … 自チームは払うが、海外クラブは受け取っていない（世界のお金が減る）
 *
 *   オフの市場（`engine/transferMarket`）は自前の帳簿を持っているので合っていて、
 *   **自チームがからむシーズン中の移籍だけ**が漏れていました（`docs/BACKLOG.md` A-4）。
 *
 * ■なぜ「合計」で見るのか
 *   クラブごとの増減で数えると、同じ回に売って買うクラブがあると差引で相殺され、
 *   「払った額の合計」が移籍金の合計と一致しません（それは正しい状態）。
 *   海外だけの合計でも足りません（日本へ出ていったぶんが消えたように見える）。
 */
import { readFileSync } from 'node:fs'
import { settleForeignFee } from '../src/utils/clubMoney'
import { tierBudget } from '../src/utils/clubTier'
import { allForeignClubs } from '../src/utils/clubs'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import type { ForeignLeague } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const oku = (n: number) => (n / 1e8).toFixed(2)

const seeded: ForeignLeague[] = (FOREIGN_LEAGUES as ForeignLeague[]).map(l => ({
  ...l, clubs: l.clubs.map(c => ({ ...c, finance: { budget: tierBudget(c) } })) }))
const total = (ls: ForeignLeague[]) => allForeignClubs(ls).reduce((s, c) => s + (c.finance?.budget ?? tierBudget(c)), 0)
const budgetOf = (ls: ForeignLeague[], id: string) =>
  allForeignClubs(ls).find(c => c.id === id)!.finance!.budget
const [c1, c2] = allForeignClubs(seeded).map(c => c.id)
const FEE = 300_000_000
const before = total(seeded)

console.log('[1] 自チーム（国内）と海外クラブのあいだ')
{
  // 自チームが海外クラブ c1 へ売った → c1 が払う
  const sold = settleForeignFee(seeded, 'my-team', c1, FEE)
  check('売った先の海外クラブから移籍金が引かれる',
    budgetOf(sold, c1) === budgetOf(seeded, c1) - FEE, `${oku(budgetOf(sold, c1))}億`)
  check('  海外全体はその額だけ減る（自チーム側で増えるので世界の合計は同じ）',
    total(sold) === before - FEE, `${oku(total(sold) - before)}億`)

  // 自チームが海外クラブ c1 から買った → c1 が受け取る
  const bought = settleForeignFee(seeded, c1, 'my-team', FEE)
  check('買った相手の海外クラブへ移籍金が入る',
    budgetOf(bought, c1) === budgetOf(seeded, c1) + FEE)
  check('  海外全体はその額だけ増える', total(bought) === before + FEE)
}

console.log('')
console.log('[2] 海外クラブ同士なら、世界のお金は動かない')
{
  const moved = settleForeignFee(seeded, c1, c2, FEE)
  check('出した側が受け取る', budgetOf(moved, c1) === budgetOf(seeded, c1) + FEE)
  check('受け取った側が払う', budgetOf(moved, c2) === budgetOf(seeded, c2) - FEE)
  check('合計は変わらない（湧きも消えもしない）', total(moved) === before, `${oku(total(moved) - before)}億`)
}

console.log('')
console.log('[3] 何もしない場合')
{
  check('移籍金0なら何も動かない', settleForeignFee(seeded, c1, c2, 0) === seeded)
  check('国内同士なら何も動かない', settleForeignFee(seeded, 'a', 'b', FEE) === seeded)
  check('同じクラブなら何も動かない', settleForeignFee(seeded, c1, c1, FEE) === seeded)
  check('リーグが無くても落ちない', settleForeignFee(undefined, c1, c2, FEE).length === 0)
}

console.log('')
console.log('[4] 自チームがからむ移籍の入口が、全部この1本を通っているか')
{
  // ソースを読んで確かめる。**movePlayer に移籍金を渡す入口は、必ずすぐ外で精算すること**。
  // ★文字列だけで数えないこと。`fee:` は見出しの引数にもトレードの現金にも出てくるので、
  //   最初に書いた版は7件と数えて（実際は4件）誤検知しました。
  //   `movePlayer(` の**引数の中**だけを見るために括弧の深さを数えます
  const files = ['src/store/marketOps.ts', 'src/store/slices/marketSlice.ts']
  const missing: string[] = []
  let feeMoves = 0
  for (const f of files) {
    const src = readFileSync(f, 'utf-8')
    const lines = src.split('\n')
    for (const m of src.matchAll(/movePlayer\(/g)) {
      let depth = 0
      let i = m.index! + 'movePlayer'.length
      const start = i
      for (; i < src.length; i++) {
        if (src[i] === '(') depth++
        else if (src[i] === ')') { depth--; if (depth === 0) break }
      }
      if (!/\bfee:/.test(src.slice(start, i))) continue
      feeMoves++
      // ★総数で数えないこと。`settles >= feeMoves` にしていたら、精算を1つ消しても
      //   （4件→3件で 3>=3 となり）緑のまま通りました。**入口ごとに見ます**
      const endLine = src.slice(0, i).split('\n').length
      const near = lines.slice(endLine - 1, endLine + 40).join('\n')
      if (!near.includes('settleForeignFee(')) {
        missing.push(`${f}:${src.slice(0, m.index).split('\n').length}`)
      }
    }
  }
  console.log(`  movePlayer に移籍金を渡す入口 ${feeMoves}件 ／ 精算が見つからない ${missing.length}件`)
  check('移籍金を動かす入口は、すぐ外で海外側も精算している', missing.length === 0,
    `${missing.join(' , ')} ＝海外が相手だと片側しか動かない`)
}

console.log(failed === 0 ? '\n✓ 移籍でお金は湧きも消えもしない\n' : `\n✗ ${failed}件\n`)
if (failed > 0) process.exit(1)
