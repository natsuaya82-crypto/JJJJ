/**
 * CPU間トレード（`engine/cpuOffseason.ts` の `runCpuTrades`）の網。
 *
 * ■なぜ独立した点検が要るのか
 *   golden（`draft-flow`）は世界を1つ流すだけなので、成立の条件を1つ変えても
 *   「たまたま起きなかった」のか「起こせなくなった」のかが区別できません。
 *   ここでは**条件を1つずつ外した世界**を作って、どれが効いているかを見ます。
 *
 * ■トレードは「現金の代わりに選手で払う移籍」です（2026-08-11・オーナー判断）
 *   問いは現金の移籍とまったく同じで、変わるのは③の中身だけ
 *   （`docs/AUDIT_TRANSFERS.md` §3）。
 *
 *     ① 買う側が要るか      needsPlayer
 *     ② 売る側で出せる選手か  出番が無い（hasNoPlayingTime）・保有権・今季加入でない
 *     ③ 対価が足りるか      **選手で払う** → tradeBalance
 *     ④ 本人が行くか        appraiseMove（2人とも動くので2人に聞く）
 *
 *   以前はここに**5つ目**がありました：「売り手も、もらう選手を使えること」。
 *   現金の移籍にはこの問いが無いのに、トレードだけ両側に「必要か」を課していたので、
 *   実測で1件も成立しませんでした（51クラブ・11,753通りで0件）。
 */
import { runCpuTrades } from '../src/engine/cpuOffseason'
import { RUNNING_SLOTS } from '../src/data/rosterRules'
import type { Destination } from '../src/utils/transferDecision'
import type { Player, Team, TradeValueCtx } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
// 15番手以降＝「出番が無い」。その人数まで名簿を膨らませないと、そもそも出す選手が出ない
const SIZE = RUNNING_SLOTS * 2 + 2

function player(id: string, teamId: string, o: number, specialty = 'long'): Player {
  return {
    id, name: id, teamId, age: 26, status: 'active', specialty,
    joinedYear: YEAR - 3, nationality: 'JPN',
    ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
    // 残り1年で揃える。`tradeBalance` はもらう側を「相手の言い値」で数えるので、
    // 契約年数がズレるだけで釣り合いが崩れる
    contract: { annualSalary: 10_000_000, yearsLeft: 1 },
    morale: 50, fatigue: 0, potential: o,
  } as unknown as Player
}
const team = (id: string): Team =>
  ({ id, name: id, shortName: id, division: 1, finance: { budget: 500_000_000 }, draftPicks: [] } as unknown as Team)

const CTX: TradeValueCtx = { races: [], teamRaces: 0, currentSeason: { year: YEAR, races: [] }, pastSeasons: [] } as unknown as TradeValueCtx
const teams = [team('my'), team('a'), team('b')]

/**
 * a＝買い手：**山登りが1人もいない**（穴がある）。全員 long
 * b＝売り手：山登りを1人だけ持っていて、その1人が**bでは最下位**（出番が無い）
 * 全員同じOVRなので、bの最下位でも a では1番手＝走れる7人に入る
 *
 * ★タイプ名は `types` の `SPECIALTY_LABELS` のキーであること。
 *   存在しない名前を書くと `squadDepth` が拾えず、**誰も「必要」にならない**
 *   （最初に書いた版は 'balanced' / 'climber' と書いていて、全部0件だった）
 */
function world() {
  return [
    ...Array.from({ length: SIZE }, (_, i) => player(`a${i}`, 'a', 70)),
    ...Array.from({ length: SIZE - 1 }, (_, i) => player(`b${i}`, 'b', 70)),
    player('b-climber', 'b', 70, 'mountain_up'),
  ]
}
const movedOf = (before: Player[], after: Player[]) =>
  after.filter(p => before.find(x => x.id === p.id)!.teamId !== p.teamId)

const run = (players: Player[], extra: Record<string, unknown> = {}) =>
  runCpuTrades({ players, teams }, { playerTeamId: 'my', year: YEAR, tradeValueCtx: CTX, excludeIds: new Set<string>(), ...extra })

console.log('[1] 4つの問いが全部通れば成立する')
{
  const players = world()
  const excludeIds = new Set<string>()
  const out = runCpuTrades({ players, teams }, { playerTeamId: 'my', year: YEAR, tradeValueCtx: CTX, excludeIds })
  const moved = movedOf(players, out.players)
  check('穴のあるクラブが、相手の控えを選手で買える', moved.length === 2, `動いた選手 ${moved.length}人`)
  check('  もらったのは穴の空いていたタイプ',
    moved.some(p => p.id === 'b-climber' && p.teamId === 'a'), moved.map(p => `${p.id}→${p.teamId}`).join(' , '))
  check('  交換なので互いに1人ずつ入れ替わる', moved.length === 2 && moved[0].teamId !== moved[1].teamId)
  check('  移籍記録が2件（kind=trade）',
    out.records.length === 2 && out.records.every(r => r.kind === 'trade'), `${out.records.length}件`)
  check('  動いた選手が excludeIds に書き足される', moved.every(p => excludeIds.has(p.id)))
  check('  名簿の人数は変わらない（1対1なので増減しない）',
    out.players.filter(p => p.teamId === 'a').length === SIZE &&
    out.players.filter(p => p.teamId === 'b').length === SIZE)
  check('  自チームは巻き込まれない', out.players.every(p => p.teamId !== 'my'))

  // ★**売り手が、もらう選手を欲しがる必要はありません**（現金の移籍と同じ）。
  //   b が受け取るのは a の余った long で、b には long が15人もいる＝要らない。
  //   それでも成立するのが「対価が釣り合えば手放す」ということ
  const toB = moved.find(p => p.teamId === 'b')
  check('  売り手は「もらう選手が要るか」を問われない（現金の移籍と同じ）',
    !!toB && toB.specialty === 'long', toB ? `${toB.id}(${toB.specialty})` : 'なし')
}

console.log('')
console.log('[2] 条件を1つずつ外すと成立しなくなる')
{
  // ① 買う側に穴が無い → 成立しない（山型を最初から持たせる）
  const noHole = world().map(p => p.id === 'a0' ? { ...p, specialty: 'mountain_up' } as Player : p)
  check('① 買う側に穴が無ければ成立しない', movedOf(noHole, run(noHole).players).length === 0)

  // ② 売る側で出番がある選手は出さない（山型を1番手に置く）
  const starter = [
    ...Array.from({ length: SIZE }, (_, i) => player(`a${i}`, 'a', 70)),
    player('b-climber', 'b', 90, 'mountain_up'),
    ...Array.from({ length: SIZE - 1 }, (_, i) => player(`b${i}`, 'b', 70)),
  ]
  check('② 売る側の主力（出番がある選手）は出さない', movedOf(starter, run(starter).players).length === 0)

  // ③ 釣り合わない → 成立しない（もらう選手だけ契約を長くして言い値を上げる）
  const pricey = world().map(p => p.id === 'b-climber' ? { ...p, contract: { ...p.contract, yearsLeft: 3 } } : p)
  check('③ 対価が釣り合わなければ成立しない', movedOf(pricey, run(pricey).players).length === 0)

  // ④ 本人が断れば成立しない
  const refuse = (): Destination => ({ tier: 20, squadRank: 30, playFraction: 0, teamRaces: 10 } as unknown as Destination)
  const players = world()
  const out = run(players, { destinationOf: refuse, allTeams: teams, foreignLeagues: [] })
  check('④ 本人が断れば成立しない', movedOf(players, out.players).length === 0, `動いた選手 ${movedOf(players, out.players).length}人`)
}

console.log('')
console.log('[3] 数の上限と二重移動')
{
  const players = world()
  check('excludeIds に入っている選手は動かさない',
    movedOf(players, run(players, { excludeIds: new Set(players.map(p => p.id)) }).players).length === 0)
  check('maxTrades で件数を絞れる（0件なら動かない）',
    movedOf(players, run(players, { maxTrades: 0 }).players).length === 0)
  check('1クラブ1回まで（2クラブなので1件で打ち止め）',
    movedOf(players, run(players).players).length === 2)
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
