/**
 * 「CPUの補強が1周につき1人ずつになっている」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-round-robin.ts
 *
 * もとは移籍もFAも for(チーム){ while(枠が空いてる){ 1人取る } } の形で、
 * 先頭のチーム（予算の多い上位チーム）が良い選手を全部さらってから次に回っていた。
 * 今は utils/roundRobin.ts の roundRobin 1本で、1周につき1人だけ取る。
 */
import { roundRobin } from '../src/utils/roundRobin'
import { readFileSync } from 'node:fs'
import { storeSource } from './storeSource'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

console.log('\n[1] 良い選手が1チームに固まらない')
{
  // 市場に6人。強い順。3チームが「取れるなら一番強いのを取る」を繰り返す
  const market = [90, 85, 80, 75, 70, 65]
  const got: Record<string, number[]> = { A: [], B: [], C: [] }
  const CAP = 2
  roundRobin(['A', 'B', 'C'], team => {
    if (got[team].length >= CAP || market.length === 0) return false
    got[team].push(market.shift()!)
    return true
  })
  check('全員が取られる', market.length === 0, `残${market.length}`)
  check('A は 90 と 75', got.A.join(',') === '90,75', got.A.join(','))
  check('B は 85 と 70', got.B.join(',') === '85,70', got.B.join(','))
  check('C は 80 と 65', got.C.join(',') === '80,65', got.C.join(','))
  check('1チームが上位を独占していない', got.A[0] - got.A[1] > 0 && got.A[1] < got.C[0])
}

console.log('\n[2] 取れないチームは飛ばす／誰も取れなくなったら終わる')
{
  let calls = 0
  const market = [1, 2, 3]
  const got: Record<string, number[]> = { A: [], B: [] }
  roundRobin(['A', 'B'], team => {
    calls++
    if (team === 'B') return false           // B はずっと取れない（予算不足など）
    if (market.length === 0) return false
    got.A.push(market.shift()!)
    return true
  })
  check('取れるチームだけ増える', got.A.length === 3 && got.B.length === 0)
  // 3周で全部取り、4周目で誰も取れず終了 → 4周 × 2チーム = 8回
  check('誰も取れなくなったら止まる', calls === 8, `${calls}回`)
}

console.log('\n[3] 空回りしない・上限で必ず止まる')
{
  let n = 0
  roundRobin([], () => { n++; return true })
  check('順番が空なら何もしない', n === 0)
  let inf = 0
  roundRobin(['A'], () => { inf++; return true }, 5)   // ずっと true でも maxRounds で止まる
  check('ずっと取れても回り続けない', inf === 5, `${inf}回`)
}

console.log('\n[4] 早い者勝ちの書き方が復活していない')
{
  // ★1つのファイルに閉じ込めないこと。FA側は engine/cpuMarket、移籍側は store/slices/draftSlice
  //   と別々の層に分かれている（store だけ見ていたので「1か所」になって落ちた）
  const src = [storeSource(), readFileSync('src/engine/cpuMarket.ts', 'utf-8')].join('\n')
  check('移籍とFAの2か所で roundRobin を使う',
    (src.match(/roundRobin\(/g) ?? []).length >= 2,
    `${(src.match(/roundRobin\(/g) ?? []).length}か所`)
  // import の深さ（../ か ../../）を決め打ちしないこと。移動しただけで落ちる
  check('roundRobin を読み込んでいる', /import\s*\{\s*roundRobin\s*\}\s*from\s*'\.\.\/(\.\.\/)?utils\/roundRobin'/.test(src))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
process.exit(failed === 0 ? 0 : 1)
