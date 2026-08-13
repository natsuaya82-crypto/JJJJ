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

// ★**localStorage を直接置かない。** persist は store/saveStorage を通しているので、
//   そこへ書いてから読ませる。最初に書いた版は window.localStorage を直接読んでいて、
//   実機で `save: null` の空ファイルが出てきた（fixture が localStorage だったので緑だった）
const YEARS = [2030, 2031]
// ls-shim が localStorage を用意するので、saveStorage はブラウザ経路（localStorage）を通る
localStorage.setItem('jpel-manager-save', JSON.stringify({
  version: 40, state: { players: [1, 2, 3], pastSeasons: [{ year: 2030 }] } }))
for (const y of YEARS) localStorage.setItem(archiveKeyOf(y), JSON.stringify({ year: y, races: ['a'] }))
localStorage.setItem('unrelated-key', 'x')

async function main() {
  const out = await buildExport(YEARS)

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
    // ★母数の確認。save が null なら「拾えている」も全部空振り（実機で出た形がこれ）
    check('**セーブ本体が null ではない**', out.save !== null, JSON.stringify(out.save)?.slice(0, 40) ?? 'null')
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

}
void main()
