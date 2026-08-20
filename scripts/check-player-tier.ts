/**
 * **選手の格**（`utils/playerTier`）の網。
 *
 * ■何を置き換えたのか
 *   以前の市場には「**この選手はどの格にいるべきか**」という考えが無く、あるのは
 *   「そのクラブの名簿の中で何番手か」だけでした。だから OVR88 の選手は、格5のクラブに
 *   88〜90 が並んでいれば**そのクラブの中では8番手**になり、「走れていない」→
 *   「出番を求めている」→**どこへでも行っていい**、になっていた。行き先を決めていたのは
 *   「誰が声を掛けてきたか」だけなので、格20のクラブでも買えた
 *   （実測：12段下が2件、10段下が10件。オーナー・2026-08-20
 *   「どこでもエース級がわざわざ格下に行くの？別に移籍しないで止まったり、上に行けばいいやん」）。
 *
 *   関門は3枚ありましたが、**全部これに置き換えて消しました。戻さないこと。**
 *       `unproven`                 … 1戦も走っていない選手は格上へ行かない
 *       `tooFarDown`               … 走れている選手は2段以上下へ行かない
 *       `cpuMarket` の格差フィルタ  … 2段以上格下のクラブは主力に打診しない
 *
 * ■この点検が見るもの
 *   ① 消した3枚が復活していないこと（**否定**なので安全側）
 *   ② 線が世界から引かれていること＝初期世界のほとんどが `TIER_FALL_LIMIT` に収まる
 *   ③ 世界を1つ作って実際に流し、格の離れたクラブが主力を買えないこと
 *   ④ ③が空振りでないこと＝**同じ世界で近い格のクラブなら買える**
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { runTransferMarket } from '../src/engine/transferMarket'
import { TIER_FALL_LIMIT, careerOvr, playerTierOf, tierLines } from '../src/utils/playerTier'
import { allTieredClubs, tierOf } from '../src/utils/clubTier'
import { RUNNING_SLOTS } from '../src/data/rosterRules'
import { squadRankOf } from '../src/utils/squadNeeds'
import { logicSource } from './storeSource'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Destination } from '../src/utils/transferDecision'
import type { ArchivedSeason, ForeignLeague, Player, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

// ── ① 消した蓋が復活していないこと（否定） ──────────────
console.log('[1] 置き換えた3枚が戻っていない')
{
  const src = strip(logicSource())
  check('tooFarDown が無い', !src.includes('tooFarDown'))
  check('unproven が無い', !src.includes('unproven'))
  check('MAX_TIER_DROP_FOR_STARTER が無い', !src.includes('MAX_TIER_DROP_FOR_STARTER'))
  // 落ちていい幅の比べ方は `inTierBand` 1本。**入口の数と、通っている数を両方数える**
  const all = strip(readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter(f => f.endsWith('.ts') || f.endsWith('.tsx'))
    .map(f => readFileSync(join('src', f), 'utf8')).join('\n'))
  check('inTierBand の定義は1つ', (all.match(/export function inTierBand/g) ?? []).length === 1)
  check('TIER_FALL_LIMIT の定義は1つ', (all.match(/export const TIER_FALL_LIMIT/g) ?? []).length === 1)
  // `playerTier.ts` の外で「格の差」を手で比べていないこと（数字の二重化を防ぐ）
  const outside = strip(readdirSync('src', { recursive: true, encoding: 'utf8' })
    .filter(f => (f.endsWith('.ts') || f.endsWith('.tsx')) && !f.endsWith('playerTier.ts'))
    .map(f => readFileSync(join('src', f), 'utf8')).join('\n'))
  check('playerTier.ts の外で TIER_FALL_LIMIT と比べていない',
    !/TIER_FALL_LIMIT\s*[<>]/.test(outside) && !/[<>]=?\s*TIER_FALL_LIMIT/.test(outside))
}

// ── ② 線は世界から引く ────────────────────────────
console.log('[2] 初期世界のほとんどが範囲に収まる')
const YEAR = 2030
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(base, YEAR)
const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const world: Player[] = [...cpu.cpuPlayers, ...fgen.players]
{
  const clubs = allTieredClubs(base, fgen.updatedLeagues)
  const byId = new Map(clubs.map(c => [c.id, tierOf(c)]))
  const lines = tierLines(world, (id: string) => byId.get(id))
  const act = world.filter(p => p.status === 'active' && p.teamId)
  const inBand = act.filter(p => (byId.get(p.teamId) ?? 20) - playerTierOf(p, lines) <= TIER_FALL_LIMIT).length
  const rate = inBand / act.length
  // ★**「選手の格 ≒ クラブの格」ではありません。** 世界は tierRankComposition で
  //   SSS〜D を混ぜて名簿を作るので、1クラブの中に選手の格が10段ぶん同居しています
  //   （実測：格5のクラブ＝選手の格5〜15）。ここで見るのは「落ちすぎが普通ではない」こと。
  check(`初期世界の8割以上が「クラブの格 ≤ 選手の格 + ${TIER_FALL_LIMIT}」`, rate >= 0.8,
    `${(rate * 100).toFixed(1)}%（${inBand}/${act.length}人）`)
  // 線が単調（格が下がるほど緩くなる）
  const mono = lines.slice(1, 21).every((v, i, a) => i === 0 || v <= a[i - 1])
  check('線は格が下がるほど緩い（単調）', mono, lines.slice(1, 21).map(v => v.toFixed(1)).join(' '))
}

// ── ③④ 世界を1つ作って実際に流す ───────────────────
console.log('[3] 格の離れたクラブは主力を買えない')

const SIZE = RUNNING_SLOTS * 2 + 4
function player(id: string, teamId: string, o: number, specialty = 'long'): Player {
  return {
    id, name: id, teamId, age: 27, status: 'active', specialty, growthCurve: 'normal',
    joinedYear: YEAR - 4, nationality: 'JPN',
    ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
    contract: { annualSalary: 10_000_000, yearsLeft: 1 },
    morale: 50, fatigue: 0, potential: o,
    career: { races: 40, wins: 5, championships: 0, mvpAwards: 0, segmentAwards: 0 },
  } as unknown as Player
}
const HI = 'hi', STAR = 'hi-star'
const team = (id: string, division: number, tier: number): Team =>
  ({ id, name: id, shortName: id, division, tier, finance: { budget: 5_000_000_000 }, draftPicks: [] } as unknown as Team)

let current: Player[] = []
/** 名簿。HI に「粘り型」のエースが1人。買い手はそのタイプが0人＝穴 */
const build = (buyerId: string) => [
  player('hi-top', HI, 90),
  player(STAR, HI, 88, 'mountain_up'),
  ...Array.from({ length: SIZE - 2 }, (_, i) => player(`hi${i}`, HI, 86)),
  ...Array.from({ length: SIZE }, (_, i) => player(`${buyerId}${i}`, buyerId, 62)),
  ...Array.from({ length: SIZE }, (_, i) => player(`my${i}`, 'my', 60)),
]

function run(buyerTier: number): boolean {
  const buyerId = 'buy'
  const teams = [team(HI, 1, 5), team(buyerId, 2, buyerTier), team('my', 3, 20)]
  current = build(buyerId)
  // 線はこの小さな世界から引く（本番と同じ道＝runTransferMarket の中で組まれる）
  const destinationOf = (clubId: string, p: Player): Destination => {
    const roster = current.filter(x => x.teamId === clubId && x.status === 'active' && x.id !== p.id)
    return { clubId, tier: clubId === HI ? 5 : buyerTier, squadRank: squadRankOf(roster, p), squadSize: roster.length + 1 } as Destination
  }
  const out = runTransferMarket(
    { players: current, teams, foreignLeagues: [] as ForeignLeague[] },
    { playerTeamId: 'my', year: YEAR, season: { year: YEAR, races: [] },
      pastSeasons: [] as ArchivedSeason[], rosterCapFor: () => 30, destinationOf,
      excludeIds: new Set<string>(), date: `${YEAR}-02-01` })
  return out.players.find(p => p.id === STAR)!.teamId !== HI
}

// ④ **先に空振りでないことを確かめる。** 格が近ければこの移籍は起きる
// ★**関門のすぐ内と外で比べること。** 大きく離すと、関門ではなく点数
//   （格下への減点）のほうで止まるので、関門を壊しても緑のままになります
//   （最初に格18で組んで、実際に空振りでした）。
const starTier = (() => {
  const teams = [team(HI, 1, 5), team('buy', 2, 6), team('my', 3, 20)]
  current = build('buy')
  const clubs = allTieredClubs(teams, [])
  const byId = new Map(clubs.map(c => [c.id, tierOf(c)]))
  return playerTierOf(current.find(p => p.id === STAR)!, tierLines(current, (id: string) => byId.get(id)))
})()
check('④ 関門のすぐ内（+TIER_FALL_LIMIT）なら動く', run(starTier + TIER_FALL_LIMIT),
  `選手の格=${starTier}。ここが false なら、下の③は「起きない」のではなく「起こせない」＝何も守っていません`)
// ③ 本命。1段だけ外へ出したら止まる
check(`③ 関門のすぐ外（+${TIER_FALL_LIMIT + 1}）なら動かない`, !run(starTier + TIER_FALL_LIMIT + 1),
  `選手の格=${starTier}`)

// 線そのものの単位テスト（世界を作らずに）
{
  const lines = tierLines(
    [player('a', 'c1', 90), player('b', 'c1', 80), player('c', 'c2', 70), player('d', 'c2', 60)],
    (id: string) => (id === 'c1' ? 1 : 10),
  )
  check('席の数で切っている（格1に2席なら上位2人が格1）',
    lines[1] === careerOvr(player('b', 'c1', 80)) && lines[10] === careerOvr(player('d', 'c2', 60)),
    `lines[1]=${lines[1]} lines[10]=${lines[10]}`)
}

process.exit(failed > 0 ? 1 : 0)
