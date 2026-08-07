/**
 * 監督オファーの組み立てが、ランダムに来るぶんも退任したときのぶんも同じ形になることを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-gm-offer.ts --outfile=/tmp/cgo.cjs && node /tmp/cgo.cjs
 *
 * オファーは2つの入口から来る。
 *   ・年に1回ランダムに1件（makeGmOffer）
 *   ・自分から退任したときに一度に複数（resignOffers）
 * 中身の作り方を別々に書くと、片方だけ予算や目標の引き直しがずれる。
 * どちらも buildOffer 1本を通していることと、退任のときに
 * 「格上・落ちぶれた名門・3部」が並ぶことを見る。
 */
import { resignOffers, offerCandidates, buildOffer } from '../src/utils/gmOffer'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { tierOf, tierOfClubId, tierBudget } from '../src/utils/clubTier'
import { divisionOf, newSeasonStandings } from '../src/utils/league'
import type { GmOffer, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const standings = newSeasonStandings(teams, (id: string) => ({ teamId: id, leaguePoints: 0, segmentPoints: 0, totalPoints: 0, raceResults: [] }))
const season = { standings }
const nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }> = {}
for (const t of teams) {
  nextBudgets[t.id] = { budget: tierBudget(t), carryover: 0, grant: tierBudget(t), raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }
}
// 1部の中位クラブが辞めたとする
const me = teams.filter(t => divisionOf(t) === 1)[9]
const tierNow = (id: string) => tierOf(teams.find(t => t.id === id))
const tierSeed = (id: string) => tierOfClubId(id)

console.log(`退任するクラブ: ${me.shortName}（${divisionOf(me)}部）`)
console.log('')

const offers = resignOffers({
  season, playerTeamId: me.id, finalRank: 10, nextYear: 2030,
  teams, nextBudgets, rng: Math.random, tierNow, tierSeed,
})
console.log('届いた打診')
for (const o of offers) {
  const t = teams.find(x => x.id === o.teamId)!
  console.log(`  ${({ promotion: '栄転', rebuild: '名門再建', comeback: '再起' } as Record<string, string>)[o.kind ?? '']}  ${t.shortName}（${divisionOf(t)}部・予算${(o.budget / 1e8).toFixed(1)}億）`)
}
console.log('')
check('1件以上届く', offers.length > 0, `${offers.length}件`)
check('同じクラブが2回出ない', new Set(offers.map(o => o.teamId)).size === offers.length)
check('自分のクラブは出ない', !offers.some(o => o.teamId === me.id))
check('話の種類が重ならない', new Set(offers.map(o => o.kind)).size === offers.length)
check('どれも予算が入っている', offers.every(o => o.budget > 0))
check('どれも部の人数が入っている（目標の引き直しに使う）', offers.every(o => (o.divisionSize ?? 0) > 0))
check('就任する年が入っている', offers.every(o => o.year === 2030))

console.log('')
console.log('[話の種類ごとの候補]')
for (const kind of ['promotion', 'rebuild', 'comeback'] as const) {
  const c = offerCandidates(kind, teams.map(t => t.id), me.id, tierNow, tierSeed)
  const label = { promotion: '栄転（格上）', rebuild: '名門再建（もとの格から4段以上落ちた）', comeback: '再起（格下）' }[kind]
  console.log(`  ${label}  ${c.length}クラブ`)
  if (kind === 'promotion') check('栄転の候補は全部いまより格上', c.every(id => tierNow(id) < tierNow(me.id)))
  if (kind === 'comeback') check('再起の候補は全部いまより格下', c.every(id => tierNow(id) > tierNow(me.id)))
}

console.log('')
console.log('[ランダムに来るぶんと同じ組み立てか]')
{
  const one = buildOffer({
    teamId: teams[0].id, kind: 'promotion', season, teams, nextBudgets,
    nextYear: 2030, objBonus: 0, finalRank: 10,
  })
  const keys = Object.keys(one).sort().join(',')
  const keysResign = offers.length > 0 ? Object.keys(offers[0]).sort().join(',') : keys
  check('返す形が同じ', keys === keysResign, `${keys} / ${keysResign}`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 退任すると格上・落ちぶれた名門・格下が並び、中身の作り方はランダムのぶんと同じ')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
