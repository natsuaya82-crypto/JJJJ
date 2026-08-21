/**
 * 【自分でつくる選手：下限と、振り分けポイントの出どころ】
 *
 * ■なぜ要るのか（オーナー・2026-08-21）
 *   「99 99 1 99 99 99 とかやられるとカードで合成でバケモンが完成してしまう」
 *
 *   `createMyPlayer` は振り分けたあと、**合計が育成上限の合計になるまで低い能力から
 *   自動で埋めます**。捨てた能力はタダで戻ってくるので、尖らせるほど得をします。
 *
 *     均等に振る   72 71 71 71 71 72 72 → 育て切ると 92 92 92 92 92 92 92
 *     1つ捨てる    99 99 99 99 99  4  1 → 育て切ると 99 99 99 99 99 75 74
 *
 *   **OVRはどちらも92**（合計が同じ）。違うのは99が5本あるかどうかで、区間の重みは
 *   能力ごとに掛かるのでそこがタイム差になります。画面のOVRでは気づけません。
 *
 * ■もう1つ（オーナー・2026-08-21「500は新規作成記念でしょ？560は配布でしょ？」）
 *   振り分けポイントは出どころで違います。**回数だけ持つと額を別の分岐で当てる**
 *   ことになるので、配るときに額を決めて列に入れ、使う側は先頭を取るだけにします。
 */
import { readFileSync } from 'node:fs'
import {
  MY_PLAYER_STAT_MIN, MY_PLAYER_STAT_MAX, MY_PLAYER_POINTS_INITIAL, MY_PLAYER_POINTS_GRANT,
  MY_PLAYER_STATS, evenSpread, myPlayerBlockReason,
} from '../src/utils/myPlayer'
import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import type { Ratings } from '../src/types'

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

console.log(failed === 0 ? '\n  → OK\n' : `\n  → NG ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
