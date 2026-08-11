/**
 * CPU間トレード（`engine/cpuOffseason.ts` の `runCpuTrades`）の網。
 *
 * ■なぜ独立した点検が要るのか
 *   golden（`draft-flow`）はこの処理を**評価の側しか通っていない**。
 *   実際の世界では1件も成立しないので（`docs/BACKLOG.md` A-7）、
 *   「成立したあと」＝ movePlayer を呼んで名簿を書き換えるところが網の外にあった。
 *   枝ごとに壊して確かめたとき、ここだけ壊しても golden が緑のままだった。
 *
 * ■なぜ実際の世界では成立しないのか（ここで一緒に証明する）
 *   条件は次の2つを**同時に**満たすこと。
 *     ・出す選手は自分のところで15番手以降（`hasNoPlayingTime`＝走れる7人の2倍より下）
 *     ・もらう選手は相手のところで15番手以降なのに、うちの走れる7人に入る
 *   OVRの大小だけで序列が決まるなら、これは**論理的に成立し得ない**。
 *     もらう選手は買い手で上位7人 ＝ 買い手で自分より上は6人以下
 *     出す選手は買い手で15番手以降 ＝ 買い手で自分より上が14人以上
 *     → 出す選手 < もらう選手
 *     売り手側でまったく同じ関係を見ると → 出す選手 > もらう選手
 *   両方は立たない。**成立するのはOVRが並んだときだけ**で、それは
 *   「並び順の何番目か（`i + 1`）」と「自分より強い人が何人いるか（`squadRankOf`）」という
 *   2つの別々の数え方を使っているから開く抜け道。
 *
 * ■この点検がやること
 *   その抜け道をわざと突いた世界（全員同じOVR・同じ年齢・残り1年）を作り、
 *   **実際に交換が起きる**ことを見る。残り契約年数まで揃えるのは、`tradeBalance` が
 *   もらう側を「相手の言い値」（`askingValueOf`）で数えるので、契約年数がズレるだけで
 *   釣り合いが崩れて成立しなくなるため。
 *   成立後の後始末（所属・名簿・移籍記録・1クラブ1件の上限・excludeIds の書き足し）を確かめる。
 */
import { runCpuTrades } from '../src/engine/cpuOffseason'
import { RUNNING_SLOTS } from '../src/data/rosterRules'
import type { Player, Team, TradeValueCtx } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
// 15番手以降＝「出番が無い」。その人数まで名簿を膨らませないと、そもそも出す選手が出ない
const SIZE = RUNNING_SLOTS * 2 + 2

function player(id: string, teamId: string, o: number): Player {
  return {
    id, name: id, teamId, age: 26, status: 'active', specialty: 'balanced',
    joinedYear: YEAR - 3, nationality: 'JPN',
    ratings: { speed: o, stamina: o, hill: o, sprint: o, mental: o, recovery: o },
    contract: { annualSalary: 10_000_000, yearsLeft: 1 },
    morale: 50, fatigue: 0, potential: o,
  } as unknown as Player
}

function team(id: string): Team {
  return { id, name: id, shortName: id, division: 1, finance: { budget: 500_000_000 }, draftPicks: [] } as unknown as Team
}

const CTX: TradeValueCtx = { races: [], teamRaces: 0, currentSeason: { year: YEAR, races: [] }, pastSeasons: [] } as unknown as TradeValueCtx

// ── 全員同じOVRの2クラブ。序列は「並び順」でだけ付き、強さでは付かない ──
const teams = [team('my'), team('a'), team('b')]
const players: Player[] = [
  ...Array.from({ length: SIZE }, (_, i) => player(`a${i}`, 'a', 70)),
  ...Array.from({ length: SIZE }, (_, i) => player(`b${i}`, 'b', 70)),
]

const excludeIds = new Set<string>()
const out = runCpuTrades({ players, teams }, { playerTeamId: 'my', year: YEAR, tradeValueCtx: CTX, excludeIds })

const moved = out.players.filter(p => {
  const before = players.find(x => x.id === p.id)!
  return before.teamId !== p.teamId
})
check('OVRが並んだ世界では実際に交換が成立する', moved.length === 2, `動いた選手 ${moved.length}人`)
check('交換なので互いに1人ずつ入れ替わる',
  moved.length === 2 && moved[0].teamId !== moved[1].teamId,
  moved.map(p => `${p.id}→${p.teamId}`).join(' , '))
check('移籍記録が2件出る（kind=trade）',
  out.records.length === 2 && out.records.every(r => r.kind === 'trade'),
  `${out.records.length}件 / ${out.records.map(r => r.kind).join(',')}`)
check('動いた選手が excludeIds に書き足される（この後のレンタルで二重に動かさない）',
  moved.every(p => excludeIds.has(p.id)), `${[...excludeIds].join(',')}`)
check('1クラブ1オフ1件まで（2クラブしか無いので2人で打ち止め）', moved.length === 2)
check('名簿の人数は変わらない（片道にならない）',
  out.players.filter(p => p.teamId === 'a').length === SIZE &&
  out.players.filter(p => p.teamId === 'b').length === SIZE)
check('自チームは巻き込まれない', out.players.every(p => p.teamId !== 'my'))

// ── OVRに差が付いた瞬間、条件は満たせなくなる（上の証明の裏取り）──
{
  // 買い手 a は弱い（60）、売り手 b は強い（80）。b の最下位でも a なら1番手だが、
  // そのとき a の最下位（出す選手）は b で上位7人に入れない
  const players2: Player[] = [
    ...Array.from({ length: SIZE }, (_, i) => player(`a${i}`, 'a', 60 + i)),
    ...Array.from({ length: SIZE }, (_, i) => player(`b${i}`, 'b', 80 + i)),
  ]
  const out2 = runCpuTrades({ players: players2, teams }, { playerTeamId: 'my', year: YEAR, tradeValueCtx: CTX, excludeIds: new Set() })
  const moved2 = out2.players.filter(p => players2.find(x => x.id === p.id)!.teamId !== p.teamId)
  check('OVRに差があると1件も成立しない（実際の世界がこの形）', moved2.length === 0, `動いた選手 ${moved2.length}人`)
}

// ── 既に動いた選手は対象外（1オフ1移動）──
{
  const all = new Set(players.map(p => p.id))
  const out3 = runCpuTrades({ players, teams }, { playerTeamId: 'my', year: YEAR, tradeValueCtx: CTX, excludeIds: all })
  const moved3 = out3.players.filter(p => players.find(x => x.id === p.id)!.teamId !== p.teamId)
  check('excludeIds に入っている選手は動かさない', moved3.length === 0, `動いた選手 ${moved3.length}人`)
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
