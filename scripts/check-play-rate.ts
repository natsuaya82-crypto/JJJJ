/**
 * **出場率が移籍の判断に本当に届いているか**の網（`utils/playRate` の `playRateOf`）。
 *
 * ■なぜ要るのか
 *   `appraiseMove` にはオーナー指示（2026-08-14「格下げてまでエースになりたいやつ
 *   いないだろ。海外でやってる久保がいきなりJ3に移籍するか？」）で入れた関門があります。
 *
 *       starterNow  = races >= 3 && frac >= 0.5
 *       tooFarDown  = !freeAgent && !declining && starterNow && -gap >= MAX_TIER_DROP_FOR_STARTER
 *
 *   ところが `playFraction` / `teamRaces` が**省略可**だったため、7つの呼び出し口のうち
 *   **移籍の唯一の経路（`engine/transferMarket.ts`）を含む5つ**が渡しておらず、
 *   既定の `teamRaces = 0` が入って `starterNow` が**常に false**。
 *   関門は書いてあるのに**世界中で一度も発火していませんでした**（2026-08-20 に発覚）。
 *
 *   実測（232クラブ5800人・1年）：格下へ動いた 561件のうち **131件（23.4%）が本来は止まる**
 *   （OVR85+ が58件、78-84 が72件）。
 *
 * ■この点検が見るもの
 *   ① 型が必須のままか（`MoveContext` の2つに `?` が付いていない）
 *   ② 呼び出し口に 0.5 / 0 の手書きが無いか（**否定**なので安全側）
 *   ③ **世界を1つ作って実際に流し**、走れている選手が2段下へ移らないこと
 *   ④ ③が空振りでないこと＝**同じ世界で出場記録だけ消すと、その移籍が起きる**
 *      （「起きない」だけを見ると、そもそも移籍が起こせない世界でも緑になります）
 */
import { runTransferMarket } from '../src/engine/transferMarket'
import { MAX_TIER_DROP_FOR_STARTER } from '../src/utils/transferDecision'
import { RUNNING_SLOTS } from '../src/data/rosterRules'
import { squadRankOf } from '../src/utils/squadNeeds'
import { logicSource } from './storeSource'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Destination } from '../src/utils/transferDecision'
import type { ArchivedSeason, ForeignLeague, Player, Race, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
/** コメントを外してから見る（この点検の説明文や、コードの中の経緯の説明に当たるため） */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ── ① 型が必須のままか ──────────────────────────────
console.log('[1] 出場率は省略できない（型）')
{
  const src = readFileSync('src/utils/transferDecision.ts', 'utf8')
  const ctx = src.slice(src.indexOf('export type MoveContext'), src.indexOf('export type Appraisal'))
  check('MoveContext.playFraction が必須', /^\s*playFraction: number/m.test(ctx),
    '`playFraction?:` に戻すと、渡し忘れた呼び出し口で関門が黙って死にます')
  check('MoveContext.teamRaces が必須', /^\s*teamRaces: number/m.test(ctx))
  const pu = strip(readFileSync('src/utils/playerUtils.ts', 'utf8'))
  check('playerConsentToMove の2つも必須',
    /playFraction: number, teamRaces: number/.test(pu),
    '`playFraction = 0.5, teamRaces = 0` に戻さないこと')
}

// ── ② 手書きが無いか（否定） ─────────────────────────
console.log('[2] 0.5 / 0 を手書きしていない')
{
  const compSrc = readdirSync('src/components', { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map(f => readFileSync(join('src/components', f), 'utf8')).join('\n')
  const all = strip(logicSource() + '\n' + compSrc)
  // `playerConsentToMove(..., 0.5, 0, ...)`（位置引数）
  // ★改行をまたぐこと。`srcTier,\n  0.5, 0, 0, ...` と折り返されると、
  //   `/, 0\.5, 0,/` は**1件も当たりません**（実際にそれで空振りしました）
  check('playerConsentToMove に 0.5, 0 を渡していない', !/,\s*0\.5,\s*0,/.test(all))
  // `appraiseMove(..., { playFraction: 0.5, teamRaces: 0 })`（名前つき）
  check('appraiseMove に 0.5 / 0 を書いていない',
    !/playFraction: 0\.5/.test(all) && !/teamRaces: 0(?!\.)/.test(all.replace(/fraction: 0\.5, teamRaces: 0 \}/g, '')))
  // 移籍の唯一の経路が playRateOf を通っているか（**入口の数と通っている数を両方数える**）
  const tm = strip(readFileSync('src/engine/transferMarket.ts', 'utf8'))
  check('transferMarket が playRateOf を通る', /playRateOf\(/.test(tm),
    '出場率を数え直さず playRateOf 1本から引くこと')
  check('transferMarket が season.races を直に数えていない',
    !/season\.races\b(?!\s*\?\?\s*\[\])/.test(tm.replace(/ctx\.season\.races \?\? \[\]/g, '')),
    '自分の部の日程しか入っていないので、他の部と海外の212クラブが全員「0戦」になります')
}

// ── ③④ 世界を1つ作って実際に流す ─────────────────────
console.log('[3] 走れている選手は2段以上下のクラブへ移らない')

const YEAR = 2030
const SIZE = RUNNING_SLOTS * 2 + 4

function player(id: string, teamId: string, o: number, specialty = 'long'): Player {
  return {
    id, name: id, teamId, age: 24, status: 'active', specialty,
    // 24歳・normal（ピーク27）なので declining ではない＝関門の対象
    growthCurve: 'normal',
    joinedYear: YEAR - 4, nationality: 'JPN',
    ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
    contract: { annualSalary: 10_000_000, yearsLeft: 1 },
    morale: 50, fatigue: 0, potential: o,
    career: { races: 40, wins: 5, championships: 0, mvpAwards: 0, segmentAwards: 0 },
  } as unknown as Player
}
/** 格は `tierOf` が `team.tier` を先に見るので、ここで直に置く（実在クラブに依らせない） */
const HI = 'hi'
const LO = 'lo'
const team = (id: string, division: number, tier: number): Team =>
  ({ id, name: id, shortName: id, division, tier, finance: { budget: 5_000_000_000 }, draftPicks: [] } as unknown as Team)
// 格差はちょうど関門の線（MAX_TIER_DROP_FOR_STARTER = 2段）に置く。
// 15段も離すと、控えでも点数が届かなくなって④が成立しません（＝何も試せない世界）
const teams = [team(HI, 1, 5), team(LO, 2, 5 + MAX_TIER_DROP_FOR_STARTER), team('my', 3, 20)]

/** そのクラブの日程。`results` を入れた本数がそのまま「消化レース数」になる */
function racesFor(clubId: string, runnerIds: string[], n: number): Race[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, name: `r${i}`, date: `${YEAR}-0${(i % 9) + 1}-01`,
    segments: [{ distanceKm: 10, uphillPct: 0, downhillPct: 0 }],
    results: {
      teamResults: [{ teamId: clubId, totalTime: 1000, rank: 1 }],
      segmentResults: [{ segment: 1, runners: runnerIds.map(id => ({ playerId: id, teamId: clubId, time: 1000, rank: 1 })) }],
    },
  })) as unknown as Race[]
}

/**
 * hi＝格上のクラブ。ここで**走れている**エース級を1人だけ「粘り型」にする。
 * lo＝格下のクラブ。粘り型が1人もいない（＝穴）ので、その1人を欲しがる。
 * 名簿は SIZE 人ずつ（CPU_SELL_FLOOR を超えないと1人も出せない）。
 */
const STAR = 'hi-star'
const BENCH = 'hi-bench'
function world(): Player[] {
  return [
    // ★STAR を1番手にしないこと。**エース（1番手）は市場に出ません**（sellCandidatesOf の slice(1)）。
    //   ここを 88 で置いた最初の版は、④も③も「移籍が起こせない世界」で緑でした
    player('hi-top', HI, 90),
    player(STAR, HI, 88, 'mountain_up'),
    // ⑤の対照用：**同じ穴を埋められる控え**（15番手以降）。これが居ないと、
    //   lo が欲しがるのは STAR だけ＝止めた瞬間に「誰も動かない世界」になり、
    //   ⑤が「守っている」のか「起こせない」のか区別できません
    player(BENCH, HI, 80, 'mountain_up'),
    ...Array.from({ length: SIZE - 3 }, (_, i) => player(`hi${i}`, HI, 86)),
    ...Array.from({ length: SIZE }, (_, i) => player(`lo${i}`, LO, 62)),
    ...Array.from({ length: SIZE }, (_, i) => player(`my${i}`, 'my', 60)),
  ]
}
const destinationOf = (clubId: string, p: Player): Destination => {
  const roster = current.filter(x => x.teamId === clubId && x.status === 'active' && x.id !== p.id)
  return {
    clubId, tier: clubId === HI ? 5 : 5 + MAX_TIER_DROP_FOR_STARTER,
    squadRank: squadRankOf(roster, p), squadSize: roster.length + 1,
  } as Destination
}
let current: Player[] = []

function run(appearances: number): { moved: boolean; to: string } {
  current = world()
  // hi のクラブは10戦こなしていて、STAR はそのうち `appearances` 戦に出ている
  const ran = racesFor(HI, [STAR], appearances)
  const idle = racesFor(HI, ['hi0'], 10 - appearances)
  const season = { year: YEAR, races: [], divisionRaces: { 1: [...ran, ...idle], 2: racesFor(LO, ['lo0'], 8) } }
  const out = runTransferMarket(
    { players: current, teams, foreignLeagues: [] as ForeignLeague[] },
    { playerTeamId: 'my', year: YEAR, season, pastSeasons: [] as ArchivedSeason[],
      rosterCapFor: () => 30, destinationOf, excludeIds: new Set<string>(), date: `${YEAR}-02-01` })
  const after = out.players.find(p => p.id === STAR)!
  return { moved: after.teamId !== HI, to: after.teamId }
}

// ④ **先に空振りでないことを確かめる。** 出場記録が無ければ（＝控え）この移籍は起きる
const benched = run(0)
check('④ 出場0なら格下へ動く（この世界でその移籍が起こせる）', benched.moved,
  'ここが false なら、下の③は「起きない」のではなく「起こせない」＝何も守っていません')

// ③ 本命。10戦中10戦に出ている＝走れている選手は、格5→格20（15段下）へは動かない
const starter = run(10)
check(`③ 10戦フル出場なら ${MAX_TIER_DROP_FOR_STARTER}段以上下へは動かない`, !starter.moved,
  `${STAR} が ${starter.to} へ動きました`)

// ── ⑤ 出場記録が1本も無いとき（シーズンの頭・旧セーブ）でも、
//    **序列で見る2本目の関門**が主力を守る（`transferMarket` の買う側）。
//    `tooFarDown` は出場率で見るので、ここが無いと開幕直後は素通りします。
console.log('[4] 出場記録が無くても、2段以上格下のクラブは主力を買えない')
{
  current = world()
  const noData = { year: YEAR, races: [], divisionRaces: {}, foreignRaces: {} }
  const out = runTransferMarket(
    { players: current, teams, foreignLeagues: [] as ForeignLeague[] },
    { playerTeamId: 'my', year: YEAR, season: noData, pastSeasons: [] as ArchivedSeason[],
      rosterCapFor: () => 30, destinationOf, excludeIds: new Set<string>(), date: `${YEAR}-02-01` })
  const star = out.players.find(p => p.id === STAR)!
  // STAR は HI で2番手＝走れる7人。lo は2段下なので買いに来られない
  check('⑤ 出場データ無しでも、走れる7人は2段下へ売られない', star.teamId === HI,
    `${STAR} が ${star.teamId} へ動きました`)
  // 空振りでないこと：同じ世界で**控え**（15番手以降）なら動く
  const benchMoved = out.players.find(p => p.id === BENCH)!.teamId !== HI
  check('⑤ 空振りでない（同じ世界で控えは動く）', benchMoved,
    'この世界では誰も動かない＝⑤は何も守っていません')
}

process.exit(failed > 0 ? 1 : 0)
