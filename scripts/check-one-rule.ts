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

console.log('\n[7] 国籍のそろい具合（士気のボーナス）は lineupChemistry 1本')
{
  // 戻し方：LineupPhase に `maxNatCount >= 9 ? 10 : maxNatCount >= 7 ? 6 : 0` を書き戻す
  // ★**実際に掛ける側（engine/raceBoosts）と画面に出す側（LineupPhase）の両方**が通ること。
  //   以前は同じ三項が両方に手書きされていて、数を変えると**画面の表示だけが嘘**になった
  //   （「日本 士気+6」と出しているのに掛かるのは別の値）。
  check('lineupChemistry が居る', /export function lineupChemistry\(/.test(code))
  const callers = (code.match(/(?<!function )lineupChemistry\(/g) ?? []).length
  check('呼んでいるのは2か所（掛ける側と画面）', callers === 2, `${callers}か所`)
  check('人数と効き目を三項で手書きしていない', !/maxNatCount\s*>=\s*\d/.test(code))
  check('人数と効き目は表1つ', /const CHEMISTRY_TIERS/.test(code))
}

console.log('\n[8] 名簿を減らす経路は、どれも同じ下限（CPU_SELL_FLOOR）を通る')
{
  // 戻し方：cpuOffseason の canLeave を消して releaseSet.add を直に呼ぶ／
  //         runCpuLoans の `rosterSize(sid) <= CPU_SELL_FLOOR` を消す
  // ★名簿が減るのは3つ（現金の移籍 engine/transferMarket／解雇 runCpuReleases／
  //   レンタルで貸す runCpuLoans）。**下限を見ていたのは2つだけ**で、しかも解雇の中でも
  //   「払える年俸」の枝だけが見ていて「衰えた選手」の枝は何人でも切れた。
  // ★**出現回数を数えないこと。** ここは `floors >= 4` で `CPU_SELL_FLOOR` の
  //   **字が何回出るか**を見ていましたが、それは経路と対応していません
  //   （コメントに1回増やすだけで通る／4本目の経路を下限なしで足しても通る）。
  //   下の3行が経路を1本ずつ名指しで釘打ちするので、この行は「定義が居るか」だけにします。
  check('CPU_SELL_FLOOR が居る', /export const CPU_SELL_FLOOR/.test(code))
  check('解雇は理由ごとに線を持たず1本で止める', /const canLeave = Math\.max\(0, roster\.length - CPU_SELL_FLOOR\)/.test(code))
  check('貸す側も下限を見る', /rosterSize\(sid\) <= CPU_SELL_FLOOR/.test(code))
  check('現金の移籍も下限を見る', /sellRoster\.length <= CPU_SELL_FLOOR/.test(code))
}

console.log('\n[9] 在籍上限に「海外だけ別」の枝を置かない')
{
  // 戻し方：inSeasonFa / draftSlice の capFor を `海外 ? ROSTER_MAX : rosterCapOf(0)` に戻す
  // ★`rosterCapOf(0)` は `ROSTER_MAX - 0` なので、この三項は**両側とも同じ数**でした＝
  //   「海外は別扱い」に見えるだけの残骸。残すと片方だけ動かしたときに国内と海外で割れます。
  const ternaries = (code.match(/\?\s*ROSTER_MAX\s*:\s*rosterCap/g) ?? []).length
  check('capFor に海外だけの三項が残っていない', ternaries === 0, `${ternaries}か所`)
}

console.log('\n[10] 画面の「押せるか」と store の「受け付けるか」が同じところから出ている')
{
  // 戻し方：FacilitiesPage か economySlice に `[100, 300, 500, 1000, 3000]` を書き戻す／
  //         SponsorPage か economySlice に `3` を書き戻す
  check('施設の値段は `utils/facilities` 1本', /export const FACILITY_UPGRADE_COSTS/.test(code))
  const costTables = (code.match(/\[\s*100,\s*300,\s*500,\s*1000,\s*3000\s*\]/g) ?? []).length
  check('値段の表が1つだけ', costTables === 1, `${costTables}か所`)
  check('施設の上限レベルを直書きしていない', !/currentLv\s*>=\s*5\b/.test(code))
  check('スポンサーの枠は `data/sponsors` 1本', /export const SPONSOR_SLOTS/.test(code))
  check('枠の数を直書きしていない', !/[Ss]ponsors(\.length)?\s*>=\s*3\b/.test(code))
  check('広告の報酬は `utils/ads` 1本', /export const AD_REWARD_JEWELS/.test(code))
  check('報酬額を直書きしていない', !/jewels\s*\+\s*100\b/.test(code))
}

console.log('\n[11] プレシーズンに配るカードの中身は1本')
{
  // 戻し方：Dashboard か cardsSlice に rank の6分岐を書き戻す
  // ★画面と store に**1文字違わず2本**あり、片方だけ変えると
  //   「画面には EPIC 1枚と出ているのに配られない」になっていた。
  check('`preseasonCardDist` が居る', /export function preseasonCardDist\(/.test(code))
  const callers = (code.match(/(?<!function )preseasonCardDist\(/g) ?? []).length
  check('呼んでいるのは2か所（画面と store）', callers === 2, `${callers}か所`)
  const legRows = (code.match(/rarity: 'legendary', count: 1/g) ?? []).length
  check('表が1つだけ', legRows === 1, `${legRows}か所`)
}

console.log('\n[12] 天候の呼び名は1本')
{
  // 戻し方：どれかの画面に `sunny: '晴れ'` の表を書き戻す
  // ★7か所に手書きされていて、**2つ既にズレて**いた（`windy` が「風」／`cloudy` が「くもり」）
  check('`WEATHER_LABEL` が居る', /export const WEATHER_LABEL/.test(code))
  const tables = (code.match(/sunny:\s*'晴れ'/g) ?? []).length
  check('表が1つだけ', tables === 1, `${tables}か所`)
}

console.log('\n[13] ゲームの中の「今日」は日本時間の1本')
{
  // 戻し方：loginDate か metaSlice に `getHours() < 10` を書き戻す
  // ★`jstGameDayISO`（日本時間）と `loginTodayKey`（端末のローカル時刻）と
  //   metaSlice のインライン版の3本があり、2本が物差し違いだった。
  check('区切りは `jstGameDayISO` 1本', /export function jstGameDayISO\(/.test(code))
  const local = (code.match(/getHours\(\)\s*<\s*10/g) ?? []).length
  check('端末のローカル時刻で日付を決めていない', local === 0, `${local}か所`)
  check('`loginTodayKey` は `jstGameDayISO` を通る', /loginTodayKey\(\)[\s\S]{0,80}jstGameDayISO\(\)/.test(code))
}

console.log('')
if (failed > 0) { console.log(`✗ 同じ問いに物差しが2本あります（${failed}件）`); process.exit(1) }
console.log('✓ 引退・年齢込みの強さ・在籍人数・在籍上限・下限の救済は、どれも1本')
