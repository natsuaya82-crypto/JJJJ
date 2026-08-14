/**
 * 【施設】レベルの読み方が1本か。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-facilities.ts \
 *     --outfile=node_modules/.cache/check-fac.cjs --log-level=error && node node_modules/.cache/check-fac.cjs
 *
 * ■なぜ要るか（2026-08-14・オーナー「移籍した後の施設レベルが1からになるのが気になる」）
 *   `utils/facilities.ts` の冒頭に「読むときは必ず facilitiesOf を通すこと」と
 *   書いてあるのに、**9か所が `team.facilities` を直接読んでいた**。その結果
 *     ・維持費は格から計算（facilityUpkeepOf → facilitiesOf）
 *     ・画面・成長・スカウトは直読み＝0
 *   となり、**新規ゲームの時点から払っているのに効いていない**（格20で1億/年）。
 *   監督が移った先の施設も引き継がれず、オファー画面の
 *   「選手・予算・施設はすべて◯◯のものを引き継ぎます」が嘘になっていた。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : `\n      ${detail}`}`)
  if (!ok) failed++
}
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(join(d, e.name)) : join(d, e.name))
const files = walk('src').filter(f => /\.tsx?$/.test(f))

// **まだ直読みのままにしてあるもの**。races は全52クラブの走りに効くので、
// 通すかどうかはバランスの判断（docs/BACKLOG.md A-…／オーナー待ち）。
// 「漏れた」と「わざと外した」を区別するために、理由を書いてここへ置く。
const PENDING: Record<string, string> = {
  'src/engine/raceBoosts.ts': '戦術室（pacing/mental +Lv）。通すと全52クラブに効く＝バランスの判断',
  'src/engine/raceFatigue.ts': '医療（疲労 -8%/Lv）。同上',
}

console.log('① 施設のレベルは facilitiesOf 1本で読んでいる')
{
  const hits: string[] = []
  for (const f of files) {
    if (f === 'src/utils/facilities.ts') continue
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // 書き込み（facilities: { ... }）は対象外。**読み**だけを見る
    src.split('\n').forEach((l, i) => {
      const m = l.match(/\.facilities\s*(\?\.|\[|\))/)
      if (!m) return
      if (/facilities:\s*\{/.test(l)) return
      if (PENDING[f]) return
      hits.push(`${f}:${i + 1} ${l.trim().slice(0, 90)}`)
    })
  }
  check('team.facilities を直接読んでいない', hits.length === 0,
    hits.join('\n      ') + '\n      → utils/facilities の facilitiesOf を通すこと')
}

console.log('\n② わざと外したものに理由が書いてある')
{
  const missing = Object.keys(PENDING).filter(f => !files.includes(f))
  check('外した2本が実在する', missing.length === 0, missing.join(' / '))
  for (const [f, why] of Object.entries(PENDING)) console.log(`      見送り: ${f} — ${why}`)
}

console.log('\n③ 格の土台と、自分で建てたぶんが積み上がる')
{
  const src = readFileSync('src/utils/facilities.ts', 'utf8')
  check('facilitiesOf が Math.max で積んでいる', /Math\.max\(own\?\.\[k\] \?\? 0, lv\)/.test(src),
    '「建てたものがあればそれを丸ごと採用」に戻すと、1つ建てた瞬間に残り3施設が0に落ちる')
  check('上限を超えない', /Math\.min\(FACILITY_MAX_LEVEL/.test(src))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
