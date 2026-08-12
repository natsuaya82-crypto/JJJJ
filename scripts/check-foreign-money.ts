/**
 * 海外クラブのお金が、国内クラブとまったく同じように「使えば減る／毎年精算される」かを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-foreign-money.ts --outfile=/tmp/cfm.cjs && node /tmp/cfm.cjs
 *
 * ■何が起きていたか
 *   海外クラブには資金の置き場所（finance）が無かった。そのため移籍の処理に入るたびに
 *   tierBudget(c) ＝ 格の年間予算に満タンで戻り、
 *     ・使っても減らない（同じオフに何人でも買える）
 *     ・繰越の上限（CARRYOVER_CAP_SHARE）が効かない
 *     ・総年俸も施設維持費も払わない
 *   という別のお金で動いていた。国内が節約して手が出せない場面で海外だけは必ず買えるので、
 *   日本の主力が一方的に抜けていく。
 *
 * ■確かめること
 *   1. 買えば減り、売れば増える（クロスボーダー移籍の前後で finance.budget が動く）
 *   2. 手元に無い額は出せない（残高より高い選手は買われない）
 *   3. 毎年の精算が国内CPUと同じ式（computeNextSeasonBudget）で、破産しない・貯め込まない
 */
import { runTransferMarket } from '../src/engine/transferMarket'
import { ROSTER_MAX } from '../src/data/rosterRules'
import { buildDestination, regionOfLeague } from '../src/utils/transferDecision'
import { allTieredClubs, tierOf, tierOfPlayerClub, tierOfClubId } from '../src/utils/clubTier'
import { leagueOfClub } from '../src/utils/clubs'
import { generateForeignLeaguePlayers, generateCpuRosters } from '../src/engine/playerGenerator'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { tierBudget } from '../src/utils/clubTier'
import { facilityUpkeepOf } from '../src/utils/facilities'
import { computeNextSeasonBudget, CARRYOVER_CAP_SHARE } from '../src/data/economy'
import { allForeignClubs } from '../src/utils/clubs'
import type { ForeignLeague, Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}
const oku = (n: number) => (n / 1e8).toFixed(2)

const YEAR = 2030
const gen = generateForeignLeaguePlayers(FOREIGN_LEAGUES as ForeignLeague[], YEAR)
// 国内52クラブの名簿も作る。**海外が日本から買う向き（dir=out）は
// 国内に選手が居ないと一度も起きない**ので、片側だけの盤面では試験にならない
const baseTeams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(baseTeams, YEAR)
const teams: Team[] = baseTeams.map(t => ({ ...t, roster: cpu.teamRosters[t.id] ?? { main: [] } }))
const allPlayers: Player[] = [...gen.players, ...cpu.cpuPlayers]

// 全クラブに「格の年間予算」を入れた状態から始める
const seeded: ForeignLeague[] = gen.updatedLeagues.map(l => ({
  ...l,
  clubs: l.clubs.map(c => ({ ...c, finance: { budget: tierBudget(c) } })),
}))
const budgetOf = (ls: ForeignLeague[]) =>
  new Map(allForeignClubs(ls).map(c => [c.id, c.finance?.budget ?? tierBudget(c)]))

// 移籍の経路は engine/transferMarket の1本だけ。国内も海外も同じ入口を通る
const season = { year: YEAR + 1, races: [] } as never
const market = (leagues: ForeignLeague[], ts: Team[] = teams) => {
  const clubs = allTieredClubs(ts, leagues)
  const destinationOf = (clubId: string, player: Player) => {
    const team = ts.find(t => t.id === clubId)
    const tier = team ? tierOf(team) : (tierOfPlayerClub(clubId, clubs) ?? tierOfClubId(clubId))
    const lg = team ? undefined : leagueOfClub(leagues, clubId)
    return buildDestination(clubId, tier, allPlayers, { isForeign: !team, region: regionOfLeague(lg?.id), player })
  }
  return runTransferMarket({ players: allPlayers, teams: ts, foreignLeagues: leagues }, {
    playerTeamId: ts[0].id, year: YEAR + 1, season, pastSeasons: [],
    rosterCapFor: () => ROSTER_MAX, destinationOf, excludeIds: new Set<string>() })
}

console.log('[1] 買えば減り、売れば増える')
{
  // ★1回で足ります。市場は1本になったので、1回の中で買う側にも売る側にも回ります
  //  （以前は経路が別だったので、片方しか起きない年があり40回まで試していた）
  const before = budgetOf(seeded)
  const down: [string, number][] = []
  const up: [string, number][] = []
  const r0 = market(seeded)
  const moved = r0.records.length
  for (const [id, v] of budgetOf(r0.foreignLeagues)) {
    if (v < before.get(id)! && down.length < 3) down.push([id, v])
    if (v > before.get(id)! && up.length < 3) up.push([id, v])
  }
  console.log(`  移籍 ${moved}件`)
  check('移籍が起きている', moved > 0, `${moved}件`)
  for (const [id, v] of down) console.log(`    買った ${id}  ${oku(before.get(id)!)}億 → ${oku(v)}億`)
  for (const [id, v] of up) console.log(`    売った ${id}  ${oku(before.get(id)!)}億 → ${oku(v)}億`)
  check('買ったクラブは資金が減っている', down.length > 0,
    '減ったクラブが1件も無い＝払っても書き戻していない（＝使っても減らない）')
  check('売ったクラブは資金が増えている', up.length > 0,
    '増えたクラブが1件も無い＝移籍金を受け取っていない')
}

console.log('')
console.log('[2] 手元に無い額は出せない（残高を1000万まで削った盤面）')
{
  // 全海外クラブの残高を1000万にする。持っていない額は払えないので、
  // 「そのオフに売って得たぶん」を超えて買うクラブが1件でもあれば資金の縛りが効いていない。
  // （売ってから買うのは正しい。ger_1 が 3.2億で売ってから 1.8億で買う、はあり得る）
  const START = 10_000_000
  const broke: ForeignLeague[] = gen.updatedLeagues.map(l => ({
    ...l, clubs: l.clubs.map(c => ({ ...c, finance: { budget: START } })),
  }))
  const fSet = new Set(allForeignClubs(broke).map(c => c.id))
  let overspent = 0
  let negative = 0
  let bought = 0
  for (let i = 0; i < 2; i++) {
    const r = market(broke)
    const cash = new Map<string, number>(allForeignClubs(broke).map(c => [c.id, START]))
    for (const rec of r.records) {
      if (fSet.has(rec.fromTeamId)) cash.set(rec.fromTeamId, cash.get(rec.fromTeamId)! + (rec.fee ?? 0))   // 売った
      if (fSet.has(rec.toTeamId)) {
        cash.set(rec.toTeamId, cash.get(rec.toTeamId)! - (rec.fee ?? 0))                                   // 買った
        bought++
      }
    }
    overspent += [...cash.values()].filter(v => v < 0).length
    negative += allForeignClubs(r.foreignLeagues).filter(c => (c.finance?.budget ?? 0) < 0).length
  }
  console.log(`  2回で海外クラブが買ったのは ${bought}件`)
  check('売って得たぶんを超えて買うクラブが無い', overspent === 0, `${overspent}件が持ち出し超過`)
  check('残高がマイナスになるクラブが無い', negative === 0, `${negative}件`)
}

console.log('')
console.log('[3] 毎年の精算が国内CPUと同じ式で、破産も貯め込みもしない')
{
  const clubs = allForeignClubs(seeded)
  const salary = new Map<string, number>()
  for (const p of gen.players as Player[]) {
    salary.set(p.teamId, (salary.get(p.teamId) ?? 0) + p.contract.annualSalary)
  }
  const bal = new Map(clubs.map(c => [c.id, tierBudget(c)]))
  for (let y = 1; y <= 20; y++) {
    for (const c of clubs) {
      bal.set(c.id, computeNextSeasonBudget({
        baseGrant: tierBudget(c), prevBalance: bal.get(c.id)!,
        sponsorAnnual: 0, raceIncome: 0, objBudgetBonus: 0, bonusPayout: 0,
        salaryTotal: salary.get(c.id) ?? 0, facilityUpkeep: facilityUpkeepOf(c),
      }))
    }
  }
  const ratios = clubs.map(c => bal.get(c.id)! / tierBudget(c))
  const red = clubs.filter(c => bal.get(c.id)! < 0).length
  const max = Math.max(...ratios)
  console.log(`  20年後の残高／年間予算：最小 ${Math.min(...ratios).toFixed(2)}倍  最大 ${max.toFixed(2)}倍  赤字 ${red}件`)
  check('20年回しても赤字にならない', red === 0, `${red}件`)
  // 繰越の上限（予算の50%）が効いていれば、残高は「年間予算 + 上限」を超えられない
  check(`繰越の上限が効いている（${1 + CARRYOVER_CAP_SHARE}倍を超えない）`, max <= 1 + CARRYOVER_CAP_SHARE + 1e-9, `最大 ${max.toFixed(3)}倍`)
}

console.log('')
console.log('[4] 移籍市場（国内52＋海外180が同じ1本）でお金が動く')
{
  // ★この点検は長いあいだ日本がらみの経路しか見ておらず、**海外クラブ同士の移籍を
  //   1件も通していませんでした**。そちらには資金の変数自体が無く、移籍金0円で
  //   他クラブの1番手を引き抜けた（実測20件すべてが出す側の1〜4番手）。
  //   「緑になった」は「通った」の証拠にならない、の4例目。
  //   いまは経路が1本（engine/transferMarket）なので、この節がその1本を丸ごと通ります。
  const before = budgetOf(seeded)
  const r = market(seeded)
  const after = budgetOf(r.foreignLeagues)
  const fees = r.records.reduce((s, x) => s + (x.fee ?? 0), 0)
  const down = allForeignClubs(seeded).filter(c => after.get(c.id)! < before.get(c.id)!)
  const up = allForeignClubs(seeded).filter(c => after.get(c.id)! > before.get(c.id)!)
  console.log(`  移籍 ${r.records.length}件 ／ 移籍金の合計 ${oku(fees)}億 ／ 資金が動いたクラブ ${down.length + up.length}件`)
  check('移籍が起きている', r.records.length > 0, `${r.records.length}件`)
  check('移籍金を取っている（0円で引き抜けない）', fees > 0, `合計 ${oku(fees)}億`)
  check('  すべての記録に移籍金が付いている',
    r.records.every(x => (x.fee ?? 0) > 0), `${r.records.filter(x => !(x.fee ?? 0)).length}件が0円`)
  check('買ったクラブは資金が減っている', down.length > 0)
  check('売ったクラブは資金が増えている', up.length > 0)
  // 移籍でお金は移るだけ。**国内52＋海外180の合計は増えも減りもしない。**
  // ★海外だけで数えないこと。市場は1本なので日本↔海外の移籍が同じ回に混ざり、
  //   海外の合計だけ見ると国内へ出ていったぶんが「消えた」ように見えます（実測5.05億）。
  // ★クラブごとの増減でも数えないこと。同じ回に売って買うクラブがあると差引で相殺され、
  //   「払った額の合計」は移籍金の合計と一致しません（それは正しい状態）
  const teamNet = r.teams.reduce((s, t) => s + (t.finance.budget - (teams.find(x => x.id === t.id)?.finance.budget ?? 0)), 0)
  const foreignNet = allForeignClubs(seeded).reduce((s, c) => s + (after.get(c.id)! - before.get(c.id)!), 0)
  check('お金が湧きも消えもしない（国内＋海外の合計がゼロ）', teamNet + foreignNet === 0,
    `国内 ${oku(teamNet)}億 / 海外 ${oku(foreignNet)}億`)

  // **国内も海外も**残高を1円にすると、誰も買えない＝1件も成立しない。
  // ★海外だけ空にしても止まりません（国内クラブが買いに来るし、売った海外クラブは
  //   その場で資金を得てまた買えるようになる）。実測で200件動きました
  const broke: ForeignLeague[] = gen.updatedLeagues.map(l => ({
    ...l, clubs: l.clubs.map(c => ({ ...c, finance: { budget: 1 } })),
  }))
  const brokeTeams = teams.map(t => ({ ...t, finance: { ...t.finance, budget: 1 } }))
  const poor = market(broke, brokeTeams)
  check('手元に無ければ引き抜けない（全232クラブ残高1円なら0件）',
    poor.records.length === 0, `${poor.records.length}件も動いた`)
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 海外クラブのお金は国内と同じ。使えば減り、無ければ買えず、毎年同じ式で精算される')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
