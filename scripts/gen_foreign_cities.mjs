// 海外クラブの「本拠地（都市名）」表を作る。
// クラブ名は手で直したものが多く、shortName は5文字で切られているので、
// 名前から都市を復元できない。だから scripts/gen_leagues.mjs が使った
// 都市表と同じ割り当てで id → 都市 を書き出しておく。
// 出力先: src/data/foreignClubCities.ts
import { readFileSync, writeFileSync } from 'fs'

const here = new URL('.', import.meta.url).pathname
const src = readFileSync(here + 'gen_leagues.mjs', 'utf8')
const cityBlock = src.slice(src.indexOf('const CITY = {'), src.indexOf('// 国 → 色'))
const lgBlock = src.slice(src.indexOf('const LEAGUES = ['), src.indexOf('const leagueCountry'))
const tmp = here + '_gen_cities_tmp.mjs'
writeFileSync(tmp, cityBlock + lgBlock + '\nexport { CITY, LEAGUES }\n')
const { CITY, LEAGUES } = await import(tmp)

let out = `// ⚠ このファイルは scripts/gen_foreign_cities.mjs の生成物。手で編集しない。\n`
out += `// 海外クラブの本拠地（都市名）。クラブIDで引く。9リーグ×20クラブ＝180件。\n`
out += `export const FOREIGN_CLUB_CITY: Record<string, string> = {\n`
for (const lg of LEAGUES) {
  const pairs = []
  for (const [code, cnt] of lg.nations) {
    const cities = CITY[code]
    for (let i = 0; i < cnt; i++) pairs.push(`${code.toLowerCase()}_${i + 1}: '${cities[i % cities.length]}'`)
  }
  out += `  // ${lg.name}\n`
  for (let i = 0; i < pairs.length; i += 4) out += `  ${pairs.slice(i, i + 4).join(', ')},\n`
}
out += `}\n`
writeFileSync(here + '../src/data/foreignClubCities.ts', out)
console.log('written. clubs:', LEAGUES.reduce((s, l) => s + l.nations.reduce((a, [, n]) => a + n, 0), 0))
