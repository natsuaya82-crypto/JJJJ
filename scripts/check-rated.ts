/**
 * レート戦（レート・段位・グループ分け・その日のコース）の網。
 *
 * ■何を守るか
 *   ① **グループは10〜20人。20を超えない。** どんな人数でも割れる
 *      （10・15・20 の決め打ちにすると43人が割り切れない）
 *   ② **強い相手に勝つほど大きく上がる。** レート0とレート2000が同じだけ上がらない
 *   ③ **人数で割らない。** 相手が多い組ほど大きく動く
 *   ④ **段位は7段。実測の幅に入っている**（上の段位に誰も届かない、が起きない）
 *   ⑤ **コースは日付から決まる。** 同じ日付なら必ず同じ／日が変われば散らばる
 *
 * ■壊して確かめたこと（全部落ちた）
 *   ・`splitGroups` の均等割りをやめて20人ずつ切る（43人が 20+20+3 になる） → [1]
 *   ・`applyElo` の期待勝率を 0.5 固定にする                                → [2]
 *   ・増減を人数で割る（÷(N−1)）                                            → [3]
 *   ・`RANK_BANDS` を最初の版（100/250/450/700/1000/1400）に戻す           → [4]
 *   ・`ratedCourse` の乱数の空回しをやめる（3日とも同じ区間数になる）       → [5]
 */
import {
  applyElo, splitGroups, groupsFromMap, rankOf, clampRating, RANK_BANDS, RATED_K, ELO_SCALE, GROUP_MAX, GROUP_MIN, RATING_START,
} from '../src/engine/rating'
import { ratedCourse, courseDistanceKm, SEG_MIN, SEG_MAX } from '../src/engine/ratedCourse'
import { assignGroups } from '../src/lib/ratedTick'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const mk = (n: number, rating = 0) => Array.from({ length: n }, (_, i) => ({ id: `u${i}`, rating }))

console.log('[1] グループ分け（10〜20人・20を超えない・どんな人数でも割れる）')
{
  check('上限は20・下限は10', GROUP_MAX === 20 && GROUP_MIN === 10, `${GROUP_MIN}〜${GROUP_MAX}`)
  check('9人は流会', splitGroups(mk(9)).length === 0)
  check('10人は1グループ', splitGroups(mk(10)).map(g => g.length).join(',') === '10')
  // ★43人。10・15・20 の決め打ちでは割り切れない人数（オーナーの指摘）
  check('43人は 15+14+14', splitGroups(mk(43)).map(g => g.length).join(',') === '15,14,14',
    splitGroups(mk(43)).map(g => g.length).join(','))
  check('100人は 20×5', splitGroups(mk(100)).map(g => g.length).join(',') === '20,20,20,20,20')

  // 10〜300人の**全部**で、上限・下限・人数の合計が守られていること
  let bad = ''
  for (let n = GROUP_MIN; n <= 300; n++) {
    const g = splitGroups(mk(n)).map(x => x.length)
    const sum = g.reduce((s, x) => s + x, 0)
    if (sum !== n) { bad = `${n}人：合計が ${sum}`; break }
    if (Math.max(...g) > GROUP_MAX) { bad = `${n}人：${Math.max(...g)}人の組ができた`; break }
    if (Math.min(...g) < GROUP_MIN) { bad = `${n}人：${Math.min(...g)}人の組ができた`; break }
    if (Math.max(...g) - Math.min(...g) > 1) { bad = `${n}人：${g.join(',')} で均等でない`; break }
  }
  check('10〜300人のどれでも 上限20・下限10・均等・合計が合う', bad === '', bad)

  // レート順に並ぶこと（上の組ほど強い）
  const es = Array.from({ length: 40 }, (_, i) => ({ id: `u${i}`, rating: i * 10 }))
  const gs = splitGroups(es)
  check('レートの高い順に組が並ぶ', gs[0][0].rating > gs[1][0].rating,
    `${gs[0][0].rating} vs ${gs[1][0].rating}`)
}

console.log('\n[2][3] レートの動き')
{
  const flat = mk(20, 0)
  const d0 = applyElo(flat, flat.map(e => e.id))
  console.log(`      全員同じレートの20人： 1位 ${d0.u0} / 10位 ${d0.u9} / 20位 ${d0.u19}`)
  check('1位は上がり、最下位は下がる', d0.u0 > 0 && d0.u19 < 0)
  // ★数字は K と目盛りに連動する。2026-08-14 に3つまとめて10倍にしたので、
  //   ここも10倍（3 → 30）。**比を変えないこと**（緩めるのではなく目盛りを合わせる）
  check('真ん中はほとんど動かない', Math.abs(d0.u9) <= 30, `${d0.u9}`)

  // ★格上に勝つほど大きい（オーナー指摘「10000と0が同じ量上がるのはおかしい」）
  // ★レートの差も10倍（800 → 8000、2000 → 20000）。目盛りが4000になったので、
  //   同じ「格上／格下」を表すには差も同じだけ開かないといけない
  const weakWins = applyElo(
    [{ id: 'me', rating: 0 }, ...Array.from({ length: 19 }, (_, i) => ({ id: `s${i}`, rating: 8000 }))],
    ['me', ...Array.from({ length: 19 }, (_, i) => `s${i}`)])
  const strongWins = applyElo(
    [{ id: 'me', rating: 20000 }, ...Array.from({ length: 19 }, (_, i) => ({ id: `s${i}`, rating: 0 }))],
    ['me', ...Array.from({ length: 19 }, (_, i) => `s${i}`)])
  console.log(`      格上19人に全勝： +${weakWins.me} ／ 格下19人に全勝： +${strongWins.me}`)
  check('格上に勝つと大きく上がる', weakWins.me > 600, `${weakWins.me}`)
  check('格下に勝ってもほとんど増えない', strongWins.me <= 20, `${strongWins.me}`)

  const strongLoses = applyElo(
    [{ id: 'me', rating: 20000 }, ...Array.from({ length: 19 }, (_, i) => ({ id: `s${i}`, rating: 0 }))],
    [...Array.from({ length: 19 }, (_, i) => `s${i}`), 'me'])
  console.log(`      格下19人に全敗： ${strongLoses.me}`)
  check('格下に負けると大きく減る', strongLoses.me < -60, `${strongLoses.me}`)

  // ★人数で割らない＝相手が多い組ほど大きく動く
  const win = (n: number) => {
    const es = mk(n, 0)
    return applyElo(es, es.map(e => e.id)).u0
  }
  console.log(`      全勝したときの上がり幅： 20人 +${win(20)} / 14人 +${win(14)} / 10人 +${win(10)}`)
  check('人数が多い組ほど大きく動く', win(20) > win(14) && win(14) > win(10))
  // ★**K と目盛りは一緒に動かす。** 桁は見た目でしかなく、中身は比。
  check('K は 40', RATED_K === 40, `${RATED_K}`)
  check('目盛り ÷ K が 100', ELO_SCALE / RATED_K === 100, `${ELO_SCALE} / ${RATED_K}`)

  // ★**目盛りだけ戻す（K=40・目盛り400）を捕まえる網。**
  //   上の全勝／全敗は「格上」「格下」が極端すぎて、目盛りが10倍でも1倍でも同じ答えになる。
  //   効くのは**中くらいの差**で、目盛りの1/4だけ上の人が全勝したときの上がり幅が
  //   274（正しい）と 2（目盛りだけ400のとき）に分かれる＝上のほうが詰まる形。
  const midLead = ELO_SCALE / 4
  const midWins = applyElo(
    [{ id: 'me', rating: midLead }, ...Array.from({ length: 19 }, (_, i) => ({ id: `m${i}`, rating: 0 }))],
    ['me', ...Array.from({ length: 19 }, (_, i) => `m${i}`)])
  console.log(`      目盛りの1/4（${midLead}）だけ上の人が全勝： +${midWins.me}`)
  check('少し上なだけの人は、全勝すればまだしっかり上がる', midWins.me > 150, `${midWins.me}`)
}

console.log('\n[4] 段位')
{
  check('7段', RANK_BANDS.length === 7, `${RANK_BANDS.length}`)
  check('名前が仕様どおり',
    RANK_BANDS.map(b => b.name).join('/') === 'レジェンド/マスター/ダイヤモンド/プラチナ/ゴールド/シルバー/ブロンズ')
  // ★開始は1000（オーナー判断・2026-08-19）。**開始はいちばん下の段位の中**で、
  //   負ければ同じ段のまま下へ落ちる（下限0）。
  check('開始は 1000', RATING_START === 1000, `${RATING_START}`)
  check('開始はブロンズ', rankOf(RATING_START) === 'ブロンズ')
  check('0もブロンズ', rankOf(0) === 'ブロンズ')
  check('下がる（下限0で止まるだけ）', clampRating(RATING_START - 5000) === 0)
  // ★段位の線はオーナー指定の形：シルバーが開始+500、そこから1段1000ずつ
  const mins = [...RANK_BANDS].reverse().map(b => b.min).slice(1)   // ブロンズ(-∞)を除く
  check('シルバーは開始+500', mins[0] === RATING_START + 500, `${mins[0]}`)
  check('シルバーから上は1000きざみ',
    mins.every((m, i) => i === 0 || m - mins[i - 1] === 1000), mins.join('/'))
  // ★実測の幅に区切りが入っていること。最初の版は 700/1000/1400（当時の目盛り）で、
  //   上の3段位に**誰も届かなかった**。
  //   いまは1大会14日で −2682〜2984、**大会をまたいでレートが続く**ので、
  //   いちばん上（4500）は数回の大会で届く。**1回で届いてはいけない**
  //   （オーナー・2026-08-14「一回でマスターとかいかれると逆に困る」）。
  // ★**1回の大会で上まで行かないのが正しい**（オーナー・2026-08-14
  //   「一回でマスターとかいかれると逆に困る」）。開始1000・下限0で測り直した実測は
  //   `scripts/measure-rated-season.ts`（100人・30回戦）で最高 4911。
  const top = RANK_BANDS[0].min
  const MEASURED_TOP = 4911
  check('いちばん上は1大会では届かない', top > MEASURED_TOP, `${top} / 実測${MEASURED_TOP}`)
  check('ダイヤモンドは1大会で届く', RANK_BANDS[2].min <= MEASURED_TOP, `${RANK_BANDS[2].min}`)
  check('区切りが上から下へ並んでいる',
    RANK_BANDS.every((b, i) => i === 0 || RANK_BANDS[i - 1].min > b.min))
  const seen = new Set(RANK_BANDS.map(b => rankOf(b.min)))
  check('7段すべてに入る値がある', seen.size === 7, `${seen.size}段`)
}

console.log('\n[5] その日のコース')
{
  const days = Array.from({ length: 200 }, (_, i) =>
    new Date(Date.UTC(2026, 8, 1) + i * 86400000).toISOString().slice(0, 10))
  const courses = days.map(ratedCourse)
  check('同じ日付なら必ず同じコース',
    days.every(d => JSON.stringify(ratedCourse(d)) === JSON.stringify(ratedCourse(d))))
  const counts = courses.map(c => c.segments.length)
  check(`区間数が ${SEG_MIN}〜${SEG_MAX} に収まる`,
    Math.min(...counts) >= SEG_MIN && Math.max(...counts) <= SEG_MAX,
    `${Math.min(...counts)}〜${Math.max(...counts)}`)
  // ★**散らばっていること。** 乱数の空回しを入れる前は3日とも10区間だった
  //   （LCGは種が近いと最初の1個も近い）。「幅に収まる」だけでは気づけない
  const uniq = new Set(counts)
  console.log(`      200日で出た区間数： ${[...uniq].sort((a, b) => a - b).join(',')}`)
  check('区間数が散らばっている（何日やっても同じ本数、にならない）',
    uniq.size >= SEG_MAX - SEG_MIN, `${uniq.size}通り`)
  const first5 = courses.slice(0, 5).map(c => c.segments.length)
  check('連続する5日で同じ本数が続かない', new Set(first5).size >= 3, first5.join(','))
  check('上限は15（オーナー判断・8〜15区間）', SEG_MAX === 15, `${SEG_MAX}`)

  // ★区間の番号は1始まり（本編の data/races.ts と同じ）。
  //   0始まりにしていたときは画面に「0区」と出ていた
  check('区間の番号は1始まり',
    courses.every(c => c.segments[0].index === 1
      && c.segments[c.segments.length - 1].index === c.segments.length))
  check('登りと下りの合計が100%を超えない',
    courses.every(c => c.segments.every(s => s.uphillPct + s.downhillPct <= 100)))
  check('距離が0の区間が無い', courses.every(c => c.segments.every(s => s.distanceKm > 0)))
  const kms = courses.map(courseDistanceKm)
  console.log(`      総距離 ${Math.min(...kms)}〜${Math.max(...kms)} km`)
  check('総距離に幅がある', Math.max(...kms) - Math.min(...kms) > 100)
}

console.log('\n[6] その日の組は 10:00 に決めて、そのとおりに走らせる')
{
  // ★オーナー・2026-08-19「当日はまずレート分けされて部屋が見れるんでしょ？」
  //   当日ずっと見せた部屋と、実際に走った組が食い違ってはいけない。
  const pool = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, rating: 1000 + i * 10 }))
  const assigned = assignGroups(pool)
  check('全員に番号が付く', assigned.length === pool.length, `${assigned.length}`)
  check('番号は1始まり', Math.min(...assigned.map(a => a.groupNo)) === 1)

  const map = Object.fromEntries(assigned.map(a => [a.userId, a.groupNo]))
  const rebuilt = groupsFromMap(pool, map)
  check('保存した番号どおりに組み直せる',
    rebuilt.length === new Set(assigned.map(a => a.groupNo)).size, `${rebuilt.length}組`)
  check('人数も同じ',
    rebuilt.reduce((n, g) => n + g.length, 0) === pool.length)

  // ★10:00 より後に入った人（番号を持っていない）はその日走らない
  const late = [...pool, { id: 'late', rating: 9999 }]
  const withLate = groupsFromMap(late, map)
  check('番号を持っていない人は走らない',
    !withLate.some(g => g.some(m => m.id === 'late')))
  // ★割り直すと組が変わってしまう＝見せていた部屋と食い違う、を数字で示す
  const resplit = splitGroups(late)
  check('割り直すと組が変わる（だから保存したものを使う）',
    JSON.stringify(resplit.map(g => g.length)) !== JSON.stringify(withLate.map(g => g.length)),
    `割り直し ${resplit.map(g => g.length)} / 保存どおり ${withLate.map(g => g.length)}`)
}

console.log('')
if (failed > 0) { console.log(`✗ ${failed}件 NG`); process.exit(1) }
console.log('OK')
