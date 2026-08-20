/**
 * 【ドラフト会場のAI】`engine/draft.ts` の3本を釘で留める。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-draft-ai.ts \
 *     --outfile=node_modules/.cache/check-da.cjs --log-level=error && node node_modules/.cache/check-da.cjs
 *
 * ■なぜ要るのか
 *   `getTeamNeeds` / `getAIBuzz` / `draftSalaryFloor` は **画面（DraftRoom.tsx）の中**に
 *   書かれていて、どの点検からも見えていませんでした。ゴールデン検査は store の
 *   アクションを叩くので、画面の中の関数には届きません。
 *
 * ■「何が足りないか」は補強と同じ物差し（2026-08-12・オーナー判断）
 *   移設した時点では**人数の少ない順に2つ**で、強さを見ていませんでした。そのため
 *   **OVR90の逸材もOVR57の候補も、欲しがるクラブが同じ11クラブ**でした。
 *   `utils/squadNeeds` へ揃えて、選手そのものを見る形にしています。
 *
 * ■ただし「走れる7人に入るか」の関門だけは当てない
 *   当てると候補120人中35人が全52クラブから無視されます（下位30人は全員ゼロ）。
 *   `needsPlayer(..., { requireLineup: false })` を使ってよいのは**ここだけ**で、
 *   下の [6] がそれを見張ります。
 *
 * ■数字は定数を読まずリテラルで打つこと
 *   `SALARY_DIAL_MIN` を読んで比べると、その定数を変えたときに一緒に動いて永遠に緑になります
 *   （`CPU_SELL_FLOOR` で実際にそうなっていました）。
 */
import { readFileSync } from 'node:fs'
import { draftBuzz, draftSalaryFloor, draftTeamNeeds } from '../src/engine/draft'
import { standingsPickNumbers } from '../src/engine/draftOrder'
import { SALARY_DIAL_MIN, SALARY_DIAL_STEP } from '../src/data/economy'
import { faMarketSalary } from '../src/utils/playerUtils'
import { SPECIALTIES, needsPlayer } from '../src/utils/squadNeeds'
import { logicSource } from './storeSource'
import type { Player, Specialty, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const team = (id: string): Team => ({ id, shortName: id }) as unknown as Team
const P = (id: string, teamId: string, specialty: Specialty, rating = 60): Player => ({
  id, name: id, teamId, age: 24, status: 'active', specialty,
  nationality: 'JPN', joinedYear: 2030, growthCurve: 'normal',
  contract: { annualSalary: 5_000_000, yearsLeft: 2 },
  career: { totalRaces: 20, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ratings: Object.fromEntries(['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    .map(k => [k, rating])),
  potential: 75,
} as unknown as Player)

const [S0, S1, S2] = SPECIALTIES

console.log('[1] 欲しいタイプは「穴の深い順に2つ」')
{
  // 全タイプ1人ずつ 60。S0 だけ不在、S1 は 40、S2 は 50（＝穴が3つある世界）。
  // ★穴を2つしか作らないと `.slice(0, 2)` を3に変えても答えが変わらず、
  //   「2つまで」という決まりが釘で留まりません（最初に書いた版がこれで素通りした）
  const roster = SPECIALTIES.filter(s => s !== S0)
    .map((s, i) => P(`r${i}`, 't1', s, s === S1 ? 40 : s === S2 ? 50 : 60))
  const got = draftTeamNeeds('t1', [], roster)
  check('不在のタイプが最優先', got[0] === S0, got.join(','))
  check('次に「平均を下回っているタイプ」の深い順', got[1] === S1, got.join(','))
  check('穴が3つあっても2つまで', got.length === 2, `${got.length}件: ${got.join(',')}`)

  // 穴がまったく無い（全タイプ同じ強さ）なら空。2つに水増ししない
  const flat = SPECIALTIES.map((s, i) => P(`f${i}`, 't2', s, 60))
  check('穴が無ければ空（無理に2つ出さない）', draftTeamNeeds('t2', [], flat).length === 0,
    draftTeamNeeds('t2', [], flat).join(','))

  // ★強さを見る。人数だけ見ていたころは、弱い1人でも「足りている」になっていた
  const weakOne = [...SPECIALTIES.filter(s => s !== S0).map((s, i) => P(`w${i}`, 't3', s, 60)), P('wx', 't3', S0, 20)]
  check('弱い1人がいても穴のまま（人数だけ見ていない）', draftTeamNeeds('t3', [], weakOne).includes(S0),
    draftTeamNeeds('t3', [], weakOne).join(','))
}

console.log('')
console.log('[2] その会場で指名済みのぶんも数える')
{
  const roster = SPECIALTIES.filter(s => s !== S0).map((s, i) => P(`r${i}`, 't1', s, 60))
  const pool = [P('d0', '', S0, 70)]
  const all = [...roster, ...pool]
  check('指名前は S0 が欲しい', draftTeamNeeds('t1', [], all).includes(S0))
  const after = draftTeamNeeds('t1', [{ teamId: 't1', playerId: 'd0' }], all)
  check('指名したら S0 は穴でなくなる', !after.includes(S0), after.join(','))
  const other = draftTeamNeeds('t1', [{ teamId: 't9', playerId: 'd0' }], all)
  check('よその指名は自分の穴を埋めない', other.includes(S0), other.join(','))
}

console.log('')
console.log('[3] 注目度は「その選手を欲しがっているクラブの数」')
{
  // ★S0 を「不在」にしないこと。不在のタイプは `needsPlayer` の①で無条件に欲しくなるので、
  //   強い候補と弱い候補が同じ数になり、強さの差が見えません（最初に書いた版がこれで落ちた）。
  //   強さが効くのは②の枝＝**そのタイプが居るが弱い**とき。
  //   t1・t2 は S0 が 40（チーム平均を下回る）。t3 は S0 が 90 で埋まっている
  const roster = [
    ...SPECIALTIES.map((s, i) => P(`a${i}`, 't1', s, s === S0 ? 40 : 60)),
    ...SPECIALTIES.map((s, i) => P(`b${i}`, 't2', s, s === S0 ? 40 : 60)),
    ...SPECIALTIES.map((s, i) => P(`c${i}`, 't3', s, s === S0 ? 90 : 60)),
  ]
  const teams = [team('t1'), team('t2'), team('t3')]
  const good = P('good', '', S0, 80)
  check('自チームを t3 にすると t1・t2 の2件', draftBuzz(good, teams, 't3', [], roster) === 2,
    `${draftBuzz(good, teams, 't3', [], roster)}件`)
  check('自チームは数えない', draftBuzz(good, teams, 't1', [], roster) === 1,
    `${draftBuzz(good, teams, 't1', [], roster)}件`)

  // ★同じタイプでも強さで差が付く。人数だけ見ていたころは同じ数だった
  const weak = P('weak', '', S0, 20)
  const strong = P('strong', '', S0, 95)
  const bw = draftBuzz(weak, teams, '__none__', [], roster)
  const bs = draftBuzz(strong, teams, '__none__', [], roster)
  check('同じタイプでも、強い候補のほうが注目される', bs > bw, `強 ${bs}件 / 弱 ${bw}件`)

  // ★「走れる7人に入るか」は当てない。入れない候補でも欲しがるクラブがある
  //   （当てると下位の候補が全クラブから無視される）
  const deep = [...roster, ...Array.from({ length: 10 }, (_, i) => P(`t1big${i}`, 't1', S1, 95))]
  const rookie = P('rookie', '', S0, 55)
  check('7人に入れない候補でも欲しがるクラブがある',
    draftBuzz(rookie, [team('t1')], '__none__', [], deep) === 1,
    `${draftBuzz(rookie, [team('t1')], '__none__', [], deep)}件`)
}

console.log('')
console.log('[4] 新人の年俸の下限')
{
  // ★リテラルで釘を打つ（定数を読んで比べると、定数を変えたとき一緒に動いて緑のままになる）
  check('下限そのものは300万', SALARY_DIAL_MIN === 3_000_000, `${SALARY_DIAL_MIN}`)
  check('刻みは100万', SALARY_DIAL_STEP === 1_000_000, `${SALARY_DIAL_STEP}`)

  const weak = P('weak', '', S0, 20)
  check('相場が安い選手でも300万を下回らない', draftSalaryFloor(weak) >= 3_000_000, `${draftSalaryFloor(weak)}`)

  const strong = P('strong', '', S0, 95)
  const half = Math.round(faMarketSalary(strong) / 2 / 1_000_000) * 1_000_000
  check('相場が高い選手は市場相場の半分（100万刻み）', draftSalaryFloor(strong) === Math.max(3_000_000, half),
    `${draftSalaryFloor(strong)} / 相場 ${faMarketSalary(strong)}`)
  check('強い選手の下限は300万より上（＝下限に張り付いていない世界で見ている）',
    draftSalaryFloor(strong) > 3_000_000, `${draftSalaryFloor(strong)}`)
}

console.log('')
console.log('[5] 画面に写しを作り直していないか')
{
  const view = readFileSync('src/components/draft/DraftRoom.tsx', 'utf-8')
  check('DraftRoom は engine/draft を通す', /from '\.\.\/\.\.\/engine\/draft'/.test(view))
  check('画面に needs の数え直しが無い', !/function getTeamNeeds|function getAIBuzz/.test(view))
  check('画面に年俸の下限の式が無い', !/faMarketSalary\(\w+\)\s*\/\s*2/.test(view))
}

console.log('')
console.log('[6] 「走れる7人」の関門を緩めてよいのはドラフトだけ')
{
  // ★ここが緩むと、1部のクラブが3部で1戦も走っていない選手を「必要」と言い出す。
  //   engine/draft.ts だけが requireLineup を渡していること（字面で見る）
  const src = logicSource()
  const hits = (src.match(/requireLineup/g) ?? []).length
  const inDraft = (readFileSync('src/engine/draft.ts', 'utf-8').match(/requireLineup/g) ?? []).length
  check('logic 側で requireLineup を渡すのは engine/draft だけ', hits === inDraft,
    `logic全体 ${hits}箇所 / engine/draft ${inDraft}箇所`)
  check('engine/draft は実際に渡している（判定が空振りしていない）', inDraft >= 1, `${inDraft}箇所`)

  // ★**既定では関門が効いていること**も見る。ここを見ないと、`needsPlayer` 側の
  //   `requireLineup !== false` を消しても（＝全員に緩めても）この点検は緑のままになる
  const packed = [
    ...SPECIALTIES.map((s, i) => P(`z${i}`, 'tz', s, s === S0 ? 40 : 60)),
    ...Array.from({ length: 10 }, (_, i) => P(`big${i}`, 'tz', S1, 95)),
  ]
  const farOff = P('faroff', '', S0, 55)
  check('既定では「走れる7人」に入らない選手は必要とされない',
    needsPlayer(packed, farOff) === false, `${needsPlayer(packed, farOff)}`)
  check('関門を外すと必要とされる（同じ世界で答えが変わる）',
    needsPlayer(packed, farOff, { requireLineup: false }) === true,
    `${needsPlayer(packed, farOff, { requireLineup: false })}`)
}

console.log('\n[指名順] 昇格組は「19位・20位の枠」に入る（部内順位で比べない）')
{
  // ★オーナー・2026-08-20「昇格組が前年の19位20位と入れ替わるってだけじゃないの？」
  //   部内順位のまま比べていたので、前年2部1位で昇格したクラブが「いちばん成績が
  //   良かったクラブ」になり、**優勝クラブより後ろの全体最後**に指名していた。
  //   ★ここは**実際に並べて確かめる**こと。字面（domesticThroughRank を呼んでいるか）
  //     だけだと、呼んだ結果を捨てても緑になる。
  const teams: { id: string }[] = []
  const histories: Record<string, { seasonResults: { year: number; rank: number; points: number; division: 1 | 2 | 3 }[] }> = {}
  for (let i = 1; i <= 18; i++) {
    teams.push({ id: `d1_${i}` })
    histories[`d1_${i}`] = { seasonResults: [{ year: 2030, rank: i, points: 0, division: 1 }] }
  }
  for (const [id, r] of [['up_a', 1], ['up_b', 2]] as [string, number][]) {
    teams.push({ id })
    histories[id] = { seasonResults: [{ year: 2030, rank: r, points: 0, division: 2 }] }
  }
  const order = standingsPickNumbers(teams as never, histories as never)
  check('昇格組が全体1位・2位の指名',
    (order.get('up_b') ?? 0) === 1 && (order.get('up_a') ?? 0) === 2,
    `2部2位=${order.get('up_b')} / 2部1位=${order.get('up_a')}`)
  check('前年1部の優勝クラブが最後', (order.get('d1_1') ?? 0) === teams.length, `${order.get('d1_1')}`)
  check('1部の下位ほど早い指名',
    (order.get('d1_18') ?? 0) < (order.get('d1_10') ?? 0) &&
    (order.get('d1_10') ?? 0) < (order.get('d1_2') ?? 0))
}

console.log('')
console.log(failed === 0 ? '\n✓ ドラフト会場のAIは engine/draft 1本（穴の見方は squadNeeds と同じ）\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
