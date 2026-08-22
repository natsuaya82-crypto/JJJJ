/**
 * 【自分でつくる選手：下限と、振り分けポイントの出どころ】
 *
 * ■なぜ要るのか（オーナー・2026-08-21）
 *   「99 99 1 99 99 99 とかやられるとカードで合成でバケモンが完成してしまう」
 *
 *   捨てた能力はカードで育て直せるので、下限が無いと「5本を99で始める」形が通ります。
 *
 * ■成長上限（オーナー・2026-08-22「その平均92をやめろ」）
 *   以前は「育て切ると全能力の平均が92（合計644）」で、**どう振っても到達点が同じ**
 *   でした（合計を644に固定して低い能力から水を張る形）。この92は実装のときに
 *   確認せずこちらで決めた数字（`2c008b3`）。**廃止して `STAT_CAP` 1本にしました。**
 *   同じ水割りが store と画面の2か所に写してあったので、両方消えていることも見ます。
 *
 * ■もう1つ（オーナー・2026-08-21「500は新規作成記念でしょ？560は配布でしょ？」）
 *   振り分けポイントは出どころで違います。**回数だけ持つと額を別の分岐で当てる**
 *   ことになるので、配るときに額を決めて列に入れ、使う側は先頭を取るだけにします。
 */
import { readFileSync } from 'node:fs'
import {
  MY_PLAYER_STAT_MIN, MY_PLAYER_STAT_MAX, MY_PLAYER_POINTS_INITIAL, MY_PLAYER_POINTS_GRANT,
  MY_PLAYER_STATS, MY_PLAYER_CAP_TOTAL, evenSpread, myPlayerBlockReason, myPlayerCaps,
} from '../src/utils/myPlayer'
import { useGameStore } from '../src/store/gameStore'
import { getStatPotentials, STAT_CAP, SPEC_STRONG_STATS } from '../src/utils/playerUtils'
import { INITIAL_TEAMS } from '../src/data/teams'
import type { Ratings, Specialty } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const R = (a: number[]) => Object.fromEntries(MY_PLAYER_STATS.map((k, i) => [k, a[i]])) as unknown as Ratings

console.log(`[1] 下限（${MY_PLAYER_STAT_MIN}）より下は受け付けない`)
{
  const P = MY_PLAYER_POINTS_INITIAL
  // オーナーが挙げた形。合計が合っていても通してはいけない
  const dumped = R([99, 99, 1, 99, 99, 52, 51])
  check('合計が合っていても、1つでも下限割れなら理由が返る',
    myPlayerBlockReason(dumped, P, '田中', true) !== null,
    String(myPlayerBlockReason(dumped, P, '田中', true)))
  check('ちょうど下限なら通る',
    myPlayerBlockReason(R([99, 99, 61, 60, 60, 60, 61]), P, '田中', true) === null,
    String(myPlayerBlockReason(R([99, 99, 61, 60, 60, 60, 61]), P, '田中', true)))
  check('上限より上も止める',
    myPlayerBlockReason(R([100, 98, 61, 60, 60, 60, 61]), P, '田中', true) !== null)
  check('合計が足りなければ止める', myPlayerBlockReason(R([60, 60, 60, 60, 60, 60, 60]), P, '田中', true) !== null)
  check('名前が無ければ止める', myPlayerBlockReason(evenSpread(P), P, '  ', true) !== null)
  check('回数が無ければ止める', myPlayerBlockReason(evenSpread(P), P, '田中', false) !== null)
  // ★下限×7 が振り分けポイントを超えていたら、どう振っても作れない
  check('下限×7 が振り分けポイントに収まる',
    MY_PLAYER_STAT_MIN * MY_PLAYER_STATS.length <= MY_PLAYER_POINTS_INITIAL,
    `${MY_PLAYER_STAT_MIN} × ${MY_PLAYER_STATS.length} = ${MY_PLAYER_STAT_MIN * MY_PLAYER_STATS.length} / ${MY_PLAYER_POINTS_INITIAL}`)
  check('均等割りは下限を割らない',
    MY_PLAYER_STATS.every(k => (evenSpread(MY_PLAYER_POINTS_INITIAL) as unknown as Record<string, number>)[k] >= MY_PLAYER_STAT_MIN))
}

console.log('\n[2] 画面と store が同じ関門を通る')
{
  const strip = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const page = strip('src/components/player/CreateMyPlayerPage.tsx')
  const meta = strip('src/store/slices/metaSlice.ts')
  check('画面が myPlayerBlockReason を通る', /myPlayerBlockReason\(/.test(page))
  check('store も myPlayerBlockReason を通る', /myPlayerBlockReason\(/.test(meta))
  // ★数字を画面に手書きしないこと（下限を変えたときに片方だけ古い値になる）
  check('画面に下限の数字を書いていない', !/Math\.max\(\s*\d+\s*,\s*Math\.min/.test(page),
    'Math.max(<数字>, Math.min(...)) が残っている')
  check('画面に上限の数字を書いていない', !/const STAT_MAX = \d+/.test(page))
}

console.log('\n[2b] 入口は通知の「アップデート記念」の枠')
{
  const strip2 = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const notif = strip2('src/components/notifications/NotificationsPage.tsx')
  const dash = strip2('src/components/dashboard/Dashboard.tsx')
  // ★**入口は通知**（オーナー・2026-08-21「前は通知に入ってただろ」）。
  //   ダッシュボードの行はプレシーズンのときしか描かれないので、記念で配ったぶん
  //   （いつでも使える）はシーズン中に出せません。
  check('通知に入口がある', notif.includes('/create-player'))
  check('残り回数で出し分けている', /playerCreateLeft > 0/.test(notif))
  // ★**数えるほうにも足すこと。** 足さないと、他に通知が1件も無いときに
  //   `total === 0` で「通知なし」になり、枠ごと描かれません
  const items = strip2('src/utils/notifItems.ts')
  check('通知の件数に入っている', /\+ playerCreateCount/.test(items))
  check('ベルの数字にも入っている', /playerCreateCount:/.test(strip2('src/components/notifications/useNotifCount.ts')))
  // 初年度のプレシーズンの行は残す（オーナー「初年度は絶対だけど」）
  check('プレシーズンの準備の行も残っている', dash.includes('/create-player'))
}

console.log('\n[3] 振り分けポイントは出どころで違う（500と560）')
{
  check('新規作成の記念は500', MY_PLAYER_POINTS_INITIAL === 500, String(MY_PLAYER_POINTS_INITIAL))
  check('記念の配布ぶんは560', MY_PLAYER_POINTS_GRANT === 560, String(MY_PLAYER_POINTS_GRANT))
  check('同じ額ではない（区別が消えていない）', MY_PLAYER_POINTS_INITIAL !== MY_PLAYER_POINTS_GRANT)
  const meta = readFileSync('src/store/slices/metaSlice.ts', 'utf8')
  check('配布は GRANT の額を入れている', /MY_PLAYER_POINTS_GRANT/.test(meta))
}

console.log('\n[4] 実際に store を動かす（空振りの緑ではない）')
{
  const teams = INITIAL_TEAMS.slice(0, 3)
  const setup = (grants: number[]) => useGameStore.setState({
    isInitialized: true, playerTeamId: teams[0].id, teams, players: [],
    playerCreateGrants: grants,
    currentSeason: { year: 2030, phase: 'regular', currentRaceIndex: 0, races: [], standings: {}, newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
  } as never)
  const face = { style: 1, eye: 1, hair: 'black_light', flip: false } as never
  const mk = (r: Ratings, name = '田中') => useGameStore.getState().createMyPlayer({
    name, age: 20, specialty: 'ace', nationality: 'JPN', ratings: r, customFace: face })

  setup([MY_PLAYER_POINTS_INITIAL])
  check('下限割れは store でも作れない', mk(R([99, 99, 1, 99, 99, 52, 51])) === false)
  check('作れていない（人数0）', useGameStore.getState().players.length === 0)
  check('回数も減っていない', (useGameStore.getState().playerCreateGrants ?? []).length === 1)

  check('正しい振り分けなら作れる', mk(R([99, 99, 61, 60, 60, 60, 61])) === true)
  check('作れている（人数1）', useGameStore.getState().players.length === 1)
  check('回数が1つ減る', (useGameStore.getState().playerCreateGrants ?? []).length === 0)
  check('残り0なら作れない', mk(R([99, 99, 61, 60, 60, 60, 61]), '佐藤') === false)

  // ★**同じ年に2人つくったとき、IDが衝突していないこと**（前は年だけのIDだった）
  setup([MY_PLAYER_POINTS_INITIAL, MY_PLAYER_POINTS_GRANT])
  mk(R([99, 99, 61, 60, 60, 60, 61]), '1人目')
  const second = R([99, 99, 99, 61, 60, 60, 82])
  check('2人目は配布の額（560）で通る', mk(second, '2人目') === true,
    `合計 ${MY_PLAYER_STATS.reduce((s, k) => s + (second as unknown as Record<string, number>)[k], 0)}`)
  const ids = useGameStore.getState().players.map(p => p.id)
  check('2人ぶんのIDが別', new Set(ids).size === ids.length, ids.join(' / '))
  check('2人とも名簿にいる', useGameStore.getState().players.length === 2)
}

console.log('\n[5] 育て切ったときの上限はタイプごと（平均92のまま、得意は99）')
{
  // ★**わざと壊して落ちることを確かめた**
  //   ・644 の水割りを store に書き戻す                       → ①②
  //   ・全部 STAT_CAP にする（タイプで差が出ない）             → ④
  //   ・myPlayerCaps の端数配りを削る（合計が644にならない）   → ③
  //   ・画面が myPlayerCaps を呼ばず自分で組む                 → ⑤
  const src = ['src/store/slices/metaSlice.ts', 'src/components/player/CreateMyPlayerPage.tsx']
    .map(f => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))
  check('水割りの式が store にも画面にも無い', src.every(t => !t.includes('644')))

  // ①合計はどのタイプでもちょうど 644（＝平均92）
  const SPECS: Specialty[] = ['ace', 'sprinter', 'long', 'mountain_up', 'mountain_down',
    'undulating', 'allrounder', 'kick', 'grinder']
  const sumOf = (sp: Specialty) => {
    const c = myPlayerCaps(sp) as unknown as Record<string, number>
    return MY_PLAYER_STATS.reduce((n, k) => n + c[k as string], 0)
  }
  const bad = SPECS.filter(sp => sumOf(sp) !== MY_PLAYER_CAP_TOTAL)
  check(`9タイプとも合計が ${MY_PLAYER_CAP_TOTAL}（平均92）`, bad.length === 0,
    bad.map(sp => `${sp}=${sumOf(sp)}`).join(', '))

  // ②得意な能力は天井、③不得意はそれより下（＝のっぺりしていない）
  for (const sp of SPECS) {
    const c = myPlayerCaps(sp) as unknown as Record<string, number>
    const strong = new Set<string>(SPEC_STRONG_STATS[sp] as unknown as string[])
    const hi = MY_PLAYER_STATS.filter(k => strong.has(k as string)).map(k => c[k as string])
    const lo = MY_PLAYER_STATS.filter(k => !strong.has(k as string)).map(k => c[k as string])
    check(`${sp}: 得意が天井で、不得意はその下`,
      hi.every(v => v === STAT_CAP) && Math.max(...lo) < STAT_CAP,
      `得意 ${hi.join(',')} / 不得意 ${lo.join(',')}`)
  }

  // ④**タイプで中身が違う**こと。ここが今回の直しの本体（前は9タイプとも 92×7 だった）
  const shapes = new Set(SPECS.map(sp => {
    const c = myPlayerCaps(sp) as unknown as Record<string, number>
    return MY_PLAYER_STATS.map(k => c[k as string]).join(',')
  }))
  check('タイプごとに並びが違う（9タイプで8通り以上）', shapes.size >= 8, `${shapes.size} 通り`)

  // ⑤実際に store を動かして、その並びが選手に入っていること
  const teams = INITIAL_TEAMS.slice(0, 3)
  useGameStore.setState({
    isInitialized: true, playerTeamId: teams[0].id, teams, players: [],
    playerCreateGrants: [MY_PLAYER_POINTS_INITIAL],
    currentSeason: { year: 2030, phase: 'regular', currentRaceIndex: 0, races: [], standings: {}, newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
  } as never)
  useGameStore.getState().createMyPlayer({
    name: '短距離', age: 20, specialty: 'sprinter', nationality: 'JPN',
    ratings: R([99, 99, 61, 60, 60, 60, 61]),
    customFace: { style: 1, eye: 1, hair: 'black_light', flip: false } as never })
  const me = useGameStore.getState().players.find(p => p.isMyPlayer)
  const want = myPlayerCaps('sprinter') as unknown as Record<string, number>
  check('作った選手の上限がタイプの並びと同じ',
    !!me && MY_PLAYER_STATS.every(k =>
      (me.customCaps as unknown as Record<string, number>)[k as string] === want[k as string]),
    me ? MY_PLAYER_STATS.map(k => (me.customCaps as unknown as Record<string, number>)[k as string]).join(' ') : 'いない')
  // ★振ったぶんは残る（`getStatPotentials` は Math.max(現在値, 上限)）
  const caps = me ? (getStatPotentials(me) as unknown as Record<string, number>) : {}
  check('不得意へ振った99は消えない（スタミナ）', caps.stamina === 99, String(caps.stamina))
}

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
