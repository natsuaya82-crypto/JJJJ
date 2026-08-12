/**
 * 【セーブの書き出し】本体だけでなく**走行記録の別ファイルも一緒に**入ること。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-export-save.ts \
 *     --outfile=node_modules/.cache/check-es.cjs --log-level=error && node node_modules/.cache/check-es.cjs
 *
 * ■なぜ要るのか
 *   「セーブが重い」を調べるのに、本体だけ渡されても
 *   **どの年の走行記録が別ファイルへ逃げているのか**が分かりません（そこが本題）。
 *   キーを手で書くと拾えないので（実際 'jpel-season-' と書いて0件だった。
 *   本物は utils/raceRecord の archiveKeyOf ＝ 'jpel-archive-'）、
 *   **拾えていること自体**を見ます。
 */
import { buildExport } from '../src/store/exportSave'
import { archiveKeyOf } from '../src/utils/raceRecord'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

// localStorage の代わり
const data: Record<string, string> = {
  'jpel-manager-save': JSON.stringify({ version: 40, state: { players: [1, 2, 3], pastSeasons: [{ year: 2030 }] } }),
  [archiveKeyOf(2030)]: JSON.stringify({ year: 2030, races: ['a', 'b'] }),
  [archiveKeyOf(2031)]: JSON.stringify({ year: 2031, races: ['c'] }),
  'unrelated-key': 'x',
}
const keys = Object.keys(data)
const fake = {
  length: keys.length,
  getItem: (k: string) => data[k] ?? null,
  key: (i: number) => keys[i] ?? null,
}

const out = buildExport(fake)

console.log('[1] 本体が入っている')
check('セーブ本体を拾えている', !!out.save)
check('中身まで入っている（キーだけではない）',
  JSON.stringify(out.save).includes('pastSeasons'))

console.log('')
console.log('[2] **走行記録の別ファイルも入っている**')
{
  const got = Object.keys(out.archives)
  check('2年ぶん拾えている', got.length === 2, `${got.length}件：${got.join(',')}`)
  check(`${archiveKeyOf(2030)} が入っている`, archiveKeyOf(2030) in out.archives)
  check('関係ないキーは入っていない', !('unrelated-key' in out.archives))
}

console.log('')
console.log('[3] 大きさの内訳が出る（開かなくても何が重いか分かる）')
{
  check('state のキーごとに出ている', (out.sizes['state.players'] ?? 0) > 0, `${out.sizes['state.players']}B`)
  check('走行記録のぶんも出ている', (out.sizes[archiveKeyOf(2030)] ?? 0) > 0)
}

console.log('')
console.log(failed === 0 ? '\n✓ 本体と走行記録の両方が書き出される\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
