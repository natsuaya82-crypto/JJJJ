/**
 * 【同じ問いに物差しを2本置かない】`src` 全体を見る唯一の点検
 *
 * ■なぜ要るのか（オーナー・2026-09-15）
 *   「引退一本化してないのはなぜ？ そもそも人によって違うとかおかしいよね」
 *   「直書きは禁止で、必ずそのコードに値するものがあるか確認してから一本化して欲しい」
 *
 *   `check-single-source` が読むのは `src/store` と `src/engine` **だけ**で、
 *   `src/utils` と `src/components` はまるごと網の外でした。ところが「唯一の決まり」の
 *   多くは `src/utils` に置く決まりなので、**一番見なければいけない場所を見ていません**でした。
 *   その結果こうなっていました。
 *
 *   | 何 | どう割れていたか |
 *   |---|---|
 *   | 引退するか | 3か所（`age >= retirementAgeOf` / `(age+1) >= retirementAgeOf` / **`age >= 35` の直書き**）。しかも除外が別々（FA除外・国内だけ・自チームだけ） |
 *   | 年齢込みの強さ | 2本（`effectiveOvr` ＝ 33歳から−3 ／ `cpuOffseason` ＝ 30超で−8・33超でもう−8） |
 *   | 在籍人数 | 2通り（`!== 'retired'` ＝怪我人を数える ／ `=== 'active'` ＝数えない）。上限を止める側と通知が食い違っていた |
 *   | 在籍上限の数 | `offerExpiry` が `30` を直書き |
 *
 * ■わざと壊して落ちることを確かめた（下の各項に「戻し方」を書いてある）
 */
import { srcSource } from './storeSource'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const src = srcSource()
/** コメントを外して数える（経緯の説明文に当たって落ちるのを防ぐ。check-morale と同じ形） */
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

console.log('[1] 引退するかの判定は isRetiringAge 1本')
{
  // 戻し方：contractRequests を `p.age >= 35` に戻す／retirement を `p.age >= retirementAgeOf(p)` に戻す
  check('isRetiringAge が居る', /export function isRetiringAge\(/.test(code))
  const callers = (code.match(/(?<!function )isRetiringAge\(/g) ?? []).length
  // 年度処理・引退表明・本人の打診・満了の除外（引退が勝つ）の4か所
  check('呼んでいるのは4か所', callers === 4, `${callers}か所`)
  check('retirementAgeOf を直に比べていない（isRetiringAge の中を除く）',
    !/age[^\n]{0,20}>=\s*retirementAgeOf\(/.test(code.replace(/export function isRetiringAge[\s\S]*?\n}/, '')))
  // ★**年齢の直書きは「引退の話をしている行」だけを見る。** `src` 全体で `.age >= 3x` を
  //   禁じると、移籍市場の絞り込み（31歳以上）や実績の「ベテランが居る」（35歳以上）まで
  //   当たる。どちらも引退の判定ではないので、そこを止めると点検が嘘になる。
  //   実際に落ちていたのは `contractRequests` の `retPlayers = … p.age >= 35` の行だった
  const retLines = code.split('\n').filter(l => /引退|retir/i.test(l) && /\.age\s*[><]=?\s*\d/.test(l))
  check('引退を決める行で年齢を数字で直書きしていない', retLines.length === 0, retLines.join(' / ').slice(0, 160))
}

console.log('\n[2] 引退に除外を付けていない（不死の選手を作らない）')
{
  // 戻し方：retirement の filter に `p.teamId &&` を戻す
  // ★**ブロックを切り出して中を見る形にしないこと。** 最初そう書いたら、切り出しの
  //   正規表現が filter の行まで届かず、`p.teamId &&` を戻しても**緑のまま**でした
  //   （わざと壊して確かめて分かった）。行そのものを見る形にする。
  const pool = "p.teamId !== '__pool__'"
  check('引退の対象はドラフト候補だけを外している',
    code.includes(`.filter(p => p.status === 'active' && ${pool})`))
  check('「クラブに所属している人だけ」に戻していない',
    !code.includes(`p.status === 'active' && p.teamId && ${pool}`))
  // 満了と重なったら引退が勝つ（逆にすると 36歳で契約が切れた選手がFAのまま歳を取り続ける）
  check('満了の側が引退を外している（引退が勝つ）', /\.filter\(p => !isRetiringAge\(p\)\)/.test(code))
}

console.log('\n[3] 年齢込みの強さは effectiveOvr 1本')
{
  // 戻し方：byReleasePriority を `ovr(p) - (p.age > 30 ? 8 : 0) - ...` に戻す
  check('effectiveOvr が居る', /export function effectiveOvr\(/.test(code))
  check('年齢で強さを割り引く2本目を書いていない',
    !/ovr\(p\)\s*-\s*\(p\.age\s*>/.test(code))
  check('切る順も effectiveOvr を通る', /byReleasePriority[\s\S]{0,120}effectiveOvr\(/.test(code))
}

console.log('\n[4] 在籍人数の数え方は teamRosterSize 1本')
{
  // 戻し方：notifItems / NotificationsPage / Dashboard のどれかを filter に戻す
  check('teamRosterSize が居る', /export function teamRosterSize\(/.test(code))
  const handwritten = (code.match(/teamId === playerTeamId && p\.status [!=]== '(active|retired)'\)\.length/g) ?? []).length
  check('「うちの人数」を画面で数え直していない', handwritten === 0, `${handwritten}か所`)
  check('怪我人を落とす数え方（=== active）で人数にしていない',
    !/status === 'active'\)\.length[\s\S]{0,40}ROSTER_MAX/.test(code))
}

console.log('\n[5] 在籍上限の数を直書きしていない')
{
  // 戻し方：offerExpiry を `suitorSize >= 30` に戻す
  check('上限と比べるのに 30 を直書きしていない', !/Size\s*>=\s*30\b/.test(code))
  check('数えるのも teamRosterSize を通っている', /suitorSize = teamRosterSize\(/.test(code))
}

console.log('\n[6] 下限の救済は全クラブに効く（自チームだけを特別扱いしない）')
{
  // 戻し方：startRegularSeason を `state.teams.filter(t => t.id === state.playerTeamId)` に戻す
  check('全クラブを渡している', /fillAllRostersToMin\(allClubs,/.test(code))
  check('海外クラブも入っている', /allClubs = \[\.\.\.state\.teams, \.\.\.allForeignClubs\(/.test(code))
  check('1クラブぶんだけ埋める旧API（fillRosterToMin）が残っていない', !/fillRosterToMin\(/.test(code))
}

console.log('')
if (failed > 0) { console.log(`✗ 同じ問いに物差しが2本あります（${failed}件）`); process.exit(1) }
console.log('✓ 引退・年齢込みの強さ・在籍人数・在籍上限・下限の救済は、どれも1本')
