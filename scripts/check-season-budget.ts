/**
 * 【来季予算の精算は1か所・232クラブ全部を同じ式で】（W7）
 *
 * ■なぜ要るのか
 *   精算が2か所に割れていた。日本のリーグのクラブは `engine/seasonBudget`、海外クラブは
 *   `engine/foreignSeason`。どちらにいるかで入口が変わるので、
 *     ・自チームが海外クラブだと、自チーム用の精算（スポンサー・目標ボーナス・出来高）を通らない
 *     ・区間賞は集計には入っているのに、海外クラブには払われない
 *   という形になっていた（オーナー・2026-09-25「区間賞を海外リーグにも払う」）。
 *
 * ■見るもの
 *   [1] `computeNextSeasonBudget` を呼ぶのは `engine/seasonBudget` だけ（src 全体を数える）
 *   [2] 世界を1つ作って実際に精算する
 *       ・232クラブ全部の残高が式どおりに書き換わる
 *       ・海外クラブにも区間賞が入る
 *       ・海外クラブの格は書かない／所属リーグは動かない（動くのは決まりのあるリーグだけ）
 *   [3] 自チームが海外クラブでも、自チーム用の精算（スポンサー・目標ボーナス）を通る
 */
import { srcSource } from './storeSource'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { computeSeasonBudgets } from '../src/engine/seasonBudget'
import { computePromotion } from '../src/engine/promotion'
import { computeNextSeasonBudget } from '../src/data/economy'
import { initialWorldClubs } from '../src/store/initialWorld'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { newSeasonStandings } from '../src/utils/league'
import { clubSalaryTotal } from '../src/utils/clubMoney'
import { tierBudget } from '../src/utils/clubTier'
import { facilityUpkeepOf } from '../src/utils/facilities'
import { clubById, clubsWhere, isJpelLeague } from '../src/utils/world'
import { seasonLeaguesFixture } from './seasonFixture'
import type { Season, SeasonStanding, WorldClub } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

console.log('[1] 精算の式を呼ぶのは engine/seasonBudget だけ')
{
  const files: string[] = []
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.tsx?$/.test(f)) files.push(p)
    }
  }
  walk('src')
  const callers = files.filter(f => /(?<!function )computeNextSeasonBudget\(/.test(readFileSync(f, 'utf8')))
  check('呼ぶファイルは1つ', callers.length === 1, callers.join(' / '))
  check('  それが engine/seasonBudget', callers[0]?.replace(/\\/g, '/') === 'src/engine/seasonBudget.ts', callers[0] ?? '(無し)')
  // 前提：数える範囲に src 全体が入っている（範囲が空だと上は必ず NG になるが、念のため）
  check('前提：src の本文を読めている', srcSource().length > 100_000)
}

const YEAR = 2031
const clubs0 = initialWorldClubs()
const players = generateCpuRosters(clubs0, YEAR).cpuPlayers
const foreign = clubsWhere(clubs0, c => !isJpelLeague(c.leagueId))
const f1 = foreign[0]
const f2 = foreign[17]
const row = (teamId: string): SeasonStanding => ({ teamId, totalPoints: 0, raceResults: [] })
const foreignStandings: Record<string, SeasonStanding[]> = {}
for (const c of foreign) (foreignStandings[c.leagueId!] ??= []).push(row(c.id))
const SEG = 12_000_000
const season = {
  year: YEAR,
  leagues: seasonLeaguesFixture({ standings: newSeasonStandings(clubs0, row), foreignStandings }),
  seasonSegPrize: { [f1.id]: SEG },
  seasonRaceIncome: 0,
} as unknown as Season

const settle = (clubs: WorldClub[], playerTeamId: string, extra: { sponsorAnnual?: number; objBudgetBonus?: number } = {}) => {
  const promo = computePromotion({ clubs, currentSeason: season, playerTeamId })
  return computeSeasonBudgets({
    players, sponsors: [], clubsWithFA: clubs, currentSeason: season, playerTeamId,
    nextTierOf: promo.nextTierOf, nextPlaceOf: promo.nextPlaceOf,
    playerSalaryTotal: clubSalaryTotal(players, playerTeamId),
    playerBudgetAtSeasonEnd: clubById(clubs, playerTeamId)?.finance?.budget ?? 0,
    sponsorAnnual: extra.sponsorAnnual ?? 0, objBudgetBonus: extra.objBudgetBonus ?? 0,
    bonusTotalPayout: 0, prevStreakMe: 0,
  })
}

console.log('\n[2] 232クラブ全部を同じ式で精算する（自チームは日本1部）')
{
  const me = clubs0[0].id
  const out = settle(clubs0, me)
  const after = out.clubsWithSeasonRewards
  check('クラブの数が変わらない', after.length === clubs0.length, `${after.length}`)
  // 自チーム以外は全部、同じ式で書き換わっている（式を写して突き合わせる）
  const wrong = after.filter((c, i) => {
    if (c.id === me) return false
    const before = clubs0[i]
    const want = computeNextSeasonBudget({
      baseGrant: tierBudget({ tier: c.tier ?? undefined, id: c.id }),
      prevBalance: before.finance?.budget ?? tierBudget(before),
      sponsorAnnual: 0, raceIncome: season.seasonSegPrize?.[c.id] ?? 0, objBudgetBonus: 0, bonusPayout: 0,
      salaryTotal: clubSalaryTotal(players, c.id), facilityUpkeep: facilityUpkeepOf(before) })
    return c.finance?.budget !== want
  })
  check('自チーム以外の231クラブが式どおり', wrong.length === 0, `${wrong.length}件が違う（${wrong.slice(0, 3).map(c => c.id).join(', ')}）`)
  const f1After = clubById(after, f1.id)!
  const f1Before = clubById(clubs0, f1.id)!
  const f1NoPrize = computeNextSeasonBudget({
    baseGrant: tierBudget(f1Before), prevBalance: f1Before.finance?.budget ?? tierBudget(f1Before),
    sponsorAnnual: 0, raceIncome: 0, objBudgetBonus: 0, bonusPayout: 0,
    salaryTotal: clubSalaryTotal(players, f1.id), facilityUpkeep: facilityUpkeepOf(f1Before) })
  check('海外クラブにも区間賞が入っている（区間賞の無い計算との差がちょうど区間賞ぶん）',
    f1After.finance!.budget - f1NoPrize === SEG && out.cpuNextBudgets[f1.id].raceIncome === SEG,
    `差 ${f1After.finance!.budget - f1NoPrize} / 内訳 ${out.cpuNextBudgets[f1.id]?.raceIncome}`)
  check('  区間賞を取っていない海外クラブは0', out.cpuNextBudgets[f2.id].raceIncome === 0)
  const foreignAfter = clubsWhere(after, c => !isJpelLeague(c.leagueId))
  check('海外クラブの数が変わらない', foreignAfter.length === foreign.length)
  check('海外クラブに格を書いていない（格は初期値が正）', foreignAfter.every(c => !('tier' in c) || c.tier === undefined),
    foreignAfter.filter(c => 'tier' in c && c.tier !== undefined).map(c => c.id).slice(0, 3).join(', '))
  check('海外クラブの所属リーグが動いていない', foreignAfter.every(c => c.leagueId === clubById(clubs0, c.id)?.leagueId))
  check('日本のリーグのクラブには来季の格を書いている', clubsWhere(after, c => isJpelLeague(c.leagueId)).every(c => c.tier != null))
}

console.log('\n[3] 自チームが海外クラブでも、自チーム用の精算を通る')
{
  const me = f1.id
  const SPONSOR = 30_000_000
  const OBJ = 20_000_000
  const out = settle(clubs0, me, { sponsorAnnual: SPONSOR, objBudgetBonus: OBJ })
  const mine = clubById(out.clubsWithSeasonRewards, me)!
  check('自チームの予算が newBudget になっている', mine.finance?.budget === out.newBudget, `${mine.finance?.budget} / ${out.newBudget}`)
  check('  スポンサーと目標ボーナスが入っている', out.newBudgetBreakdown.sponsor === SPONSOR && out.newBudgetBreakdown.objBonus === OBJ)
  check('  自チームは他クラブの内訳に入っていない', !(me in out.cpuNextBudgets))
  check('  格を書いていない・リーグも動かない', !('tier' in mine && mine.tier !== undefined) && mine.leagueId === f1.leagueId)
  // 日本のリーグのクラブは、自チームが海外にいても同じ式で精算される
  const j = clubs0[0]
  check('日本1部のクラブも同じ式で精算される', out.cpuNextBudgets[j.id] != null)
}

if (failed > 0) { console.log(`\n✗ ${failed}件`); process.exit(1) }
console.log('\n✓ 精算は1か所・232クラブ全部を同じ式で')
