/**
 * 【イベントと成長の重さ】期間が日本時間の朝10時区切りか・99から重くなるか
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-event-window.ts \
 *     --outfile=node_modules/.cache/check-ew.cjs --log-level=error && node node_modules/.cache/check-ew.cjs
 *
 * ■なぜ要るか
 *   ①イベントの期間を**端末のローカル日付**で見ていた。海外にいる人や時計をずらした
 *     端末で始まる時刻がバラバラになる。ゲームの1日は朝10時区切り（ログインボーナスと同じ）
 *     なので、日本時間の朝10時で切り替わること（オーナー・2026-08-20
 *     「22の10時から25日の9:59まで」）。
 *   ②99 から先は優勝トロフィーで上限を開けた選手だけが通る道。**上へ行くほど重くする**
 *     （オーナー「99からは育ちにくくしたいよね」）。
 *     ★カード合成には**年齢・ポテンシャル・施設の倍率が掛からない**（`SOURCE_RULES`）。
 *       これを勘違いすると必要枚数を3倍近く見誤る（実際に誤った）ので、枚数で数える。
 */
import { greatSuccessChance, activeEvents, EVENTS, GREAT_SUCCESS_CHANCE, GREAT_SUCCESS_EVENT_MULT } from '../src/data/events'
import { NEWS_POPUPS } from '../src/data/newsPopups'
import { CHANGELOG } from '../src/data/appMeta'
import { jstGameDayISO } from '../src/utils/jstDate'
import { requiredExpForLevel } from '../src/engine/growth'
import { RARITY_EXP } from '../src/utils/cardCombo'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const at = (jst: string) => jstGameDayISO(new Date(`${jst}:00+09:00`).getTime())

console.log('[1] 日本時間の朝10時で切り替わる')
{
  check('10:00 で日付が変わる', at('2026-08-22T09:59') === '2026-08-21' && at('2026-08-22T10:00') === '2026-08-22',
    `${at('2026-08-22T09:59')} / ${at('2026-08-22T10:00')}`)
  // ★端末のローカル時刻に引きずられないこと。同じ瞬間なら、どの時間帯から見ても同じ日付
  const ms = new Date('2026-08-22T10:00:00+09:00').getTime()
  check('同じ瞬間ならどこから見ても同じ日付', jstGameDayISO(ms) === '2026-08-22')
  const src = readFileSync('src/utils/jstDate.ts', 'utf8')
  check('ローカル時刻の関数を使っていない', !/getHours\(\)|getFullYear\(\)/.test(src),
    'getHours / getFullYear は端末のローカル時刻。UTC からずらして出すこと')
  check('data/events は日付を受け取る（自分で今日を作らない）',
    !/new Date\(\)/.test(readFileSync('src/data/events.ts', 'utf8')),
    'data/ は utils/ を import できないので、呼ぶ側から渡す')
}

console.log('\n[2] いま入っているイベントの窓')
for (const e of EVENTS) {
  const before = at(`${e.from}T09:59`), start = at(`${e.from}T10:00`)
  const lastOk = at(`${e.to}T23:00`)
  // `to` の翌日（日本時間）。★UTC のまま slice すると9時間ぶん手前の日になる
  const endDay = new Date(new Date(`${e.to}T00:00:00+09:00`).getTime() + 86400_000 + 9 * 3600_000)
    .toISOString().slice(0, 10)
  const justOk = at(`${endDay}T09:59`), over = at(`${endDay}T10:00`)
  const on = (d: string) => activeEvents(d).some(x => x.id === e.id)
  check(`${e.title}：${e.from} 10:00 に始まる`, !on(before) && on(start))
  check(`${e.title}：${endDay} 9:59 まで続いて 10:00 に終わる`, on(lastOk) && on(justOk) && !on(over))
}

console.log('\n[2-b] ポップとお知らせの日付が、イベントの期間と合っている')
{
  // ★同じ期間が**4か所に文字で出ます**（イベント本体・ポップの出す期間・ポップに出る
  //   文字・お知らせの本文）。ずらしたときに1つ書き忘れると、**画面にだけ古い日付が残る**。
  //   コメントで「一緒に直すこと」と書いても守られないので、ここで突き合わせる。
  const ev = EVENTS.find(e => e.id === 'dl1000-great')
  const pop = NEWS_POPUPS.find(n => n.id === 'dl1000-2026-08')
  check('イベントとポップが両方ある', !!ev && !!pop)
  if (ev && pop) {
    check('ポップを出す期間がイベントと同じ',
      pop.from === ev.from && pop.until === ev.to, `ポップ ${pop.from}〜${pop.until} / イベント ${ev.from}〜${ev.to}`)
    // 画面に出る文字（`8/23 10:00 〜 8/26 9:59`）。終わりは `to` の翌日の 9:59
    const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
    const endDay = new Date(new Date(`${ev.to}T00:00:00+09:00`).getTime() + 86400_000 + 9 * 3600_000)
      .toISOString().slice(0, 10)
    const want = `${md(ev.from)} 10:00 〜 ${md(endDay)} 9:59`
    check(`ポップに出る文字が期間と同じ（${want}）`, pop.event?.period === want, `いまは ${pop.event?.period}`)
    // お知らせの本文（`8月23日10:00から8月26日9:59まで`）
    const jp = (d: string) => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`
    const line = `${jp(ev.from)}10:00から${jp(endDay)}9:59まで`
    const v205 = CHANGELOG.find(c => c.version === 'v2.0.5')
    check('v2.0.5 のお知らせがある', !!v205)
    check(`お知らせの本文が期間と同じ（${line}）`, !!v205 && v205.body.includes(line))
  }
}

console.log('\n[3] 大成功の確率（イベント中だけ倍率が掛かる）')
{
  // ★**日付を書かないこと。** ここは前日・当日・翌日を `data/events` から引く。
  //   手書きしていたころ（2026-08-21 に期間を 8/22〜8/24 → 8/23〜8/25 へずらしたとき）は、
  //   「ふだんは5%」に当てていた 8/21 が**新しい期間でもふだんのまま**なので緑で通り、
  //   「終わったら戻る」の 8/25 だけが**イベント中に変わって**落ちた。
  //   ずれた日を1つずつ直すことになるので、動かす場所を1つにする。
  const ev = EVENTS.find(e => e.id === 'dl1000-great')
  check('大成功2倍のイベントが入っている', !!ev, 'data/events の EVENTS')
  if (ev) {
    const shift = (d: string, days: number) =>
      new Date(new Date(`${d}T00:00:00+09:00`).getTime() + days * 86400_000 + 9 * 3600_000)
        .toISOString().slice(0, 10)
    const before = shift(ev.from, -1), during = ev.from, after = shift(ev.to, 1)
    console.log(`      前日 ${before} ／ 期間 ${ev.from}〜${ev.to} ／ 翌日 ${after}`)
    check(`ふだんは5%（${before}）`, greatSuccessChance(before) === GREAT_SUCCESS_CHANCE)
    // ★倍率は data/events の GREAT_SUCCESS_EVENT_MULT 1本（オーナー・2026-08-20「3日間大成功2倍」。
    //   はじめ100%で組んでいたのを2倍に変えた）。ここに数字を書かないこと
    check(`イベント中は${GREAT_SUCCESS_EVENT_MULT}倍（${during}）`,
      greatSuccessChance(during) === Math.min(1, GREAT_SUCCESS_CHANCE * GREAT_SUCCESS_EVENT_MULT),
      String(greatSuccessChance(during)))
    // ★1 を超えないこと（超えると「確約」と見分けが付かず、広告のボタンが消える）
    check('1 を超えない', greatSuccessChance(during) <= 1)
    check(`終わったら戻る（${after}）`, greatSuccessChance(after) === GREAT_SUCCESS_CHANCE)
  }
  // 広告まわりを隠す判定も同じ関数から出していること（画面に日付や 0.05 を書かない）
  const page = readFileSync('src/components/training/CardTrainingPage.tsx', 'utf8')
  check('広告まわりの出し分けも greatSuccessChance から', /greatSuccessChance\(jstGameDayISO\(\)\) < 1/.test(page))
  check('画面に 0.05 も日付も書いていない', !/0\.05|2026-08-2/.test(page))
}

console.log('\n[4] 99 から重くなる（レジェンド何枚か）')
{
  const LEG = RARITY_EXP.legendary
  const n = (l: number) => requiredExpForLevel(l) / LEG
  console.log(`      99→100 ${n(99).toFixed(1)}枚 ／ 104→105 ${n(104).toFixed(1)}枚 ／ 109→110 ${n(109).toFixed(1)}枚`)
  check('98→99 までは軽いまま（2枚以下）', n(98) <= 2.0, `${n(98).toFixed(1)}枚`)
  check('99→100 は3枚くらい', n(99) >= 2.5 && n(99) <= 3.5, `${n(99).toFixed(1)}枚`)
  check('上へ行くほど重くなる', n(109) > n(104) && n(104) > n(99))
  check('109→110 は10枚くらい', n(109) >= 8 && n(109) <= 11, `${n(109).toFixed(1)}枚`)
  let total = 0
  for (let l = 99; l < 110; l++) total += requiredExpForLevel(l)
  check('99→110 の合計は60〜75枚', total / LEG >= 60 && total / LEG <= 75, `${(total / LEG).toFixed(0)}枚`)
  // ★カードに年齢・ポテ・施設が掛からないこと（掛かると枚数が3倍近くずれる）
  const growth = readFileSync('src/engine/growth.ts', 'utf8')
  check('カード合成に年齢・ポテ・施設は掛からない',
    /card:\s*\{ age: false, potential: false, facility: false \}/.test(growth))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
