/**
 * 【オーナー判断・2026-08-12 の4件】どれも1行で静かに戻る形なので釘で留める。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-owner-fixes-0812.ts \
 *     --outfile=node_modules/.cache/check-of.cjs --log-level=error && node node_modules/.cache/check-of.cjs
 *
 *   ① 非売（noSale）はレンタル打診も止める（「レンタル歓迎」が opt-in）
 *   ② 資金の繰越は 30%
 *   ③ 移籍したら3シーズンは、退任もオファーも無い（線は1本）
 *   ④ その年の世界選手権が終わっていなければシーズンを終われない
 *
 * ■数字は定数を読まずリテラルで打つこと
 *   定数を読んで比べると、その定数を変えたときに一緒に動いて永遠に緑になります。
 */
import { readFileSync } from 'node:fs'
import { canLoanOut, eligibilityCtx } from '../src/utils/transferEligibility'
import { CARRYOVER_CAP_SHARE, computeNextSeasonBudget } from '../src/data/economy'
import { GM_RESIGN_MIN_TENURE, canResignAsGm, makeGmOffer } from '../src/utils/gmOffer'
import type { Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const MY = 'me'
const P = (over: Partial<Player> = {}): Player => ({
  id: 'p1', name: 'p1', teamId: MY, age: 24, status: 'active', specialty: 'long',
  nationality: 'JPN', joinedYear: YEAR - 3, growthCurve: 'normal',
  contract: { annualSalary: 5_000_000, yearsLeft: 2 },
  career: { totalRaces: 20, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ratings: Object.fromEntries(['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    .map(k => [k, 60])),
  potential: 75, ...over,
} as unknown as Player)

const season = { year: YEAR, races: [], currentRaceIndex: 0, pendingSales: [] } as unknown as Season
const ctx = eligibilityCtx(season, MY, [])

console.log('[①] 非売はレンタル打診も止める')
{
  check('ふつうの選手は貸し出せる', canLoanOut(P(), ctx))
  check('**非売の選手は貸し出せない**', !canLoanOut(P({ noSale: true }), ctx))
  // 「レンタル歓迎」を付けていても、非売なら止まる（非売のほうが強い）
  check('貸出歓迎を付けていても、非売なら止まる',
    !canLoanOut(P({ noSale: true, loanListed: true }), ctx))
  check('売出中は今までどおり貸し出せない', !canLoanOut(P({ transferListed: true }), ctx))
}

console.log('')
console.log('[②] 資金の繰越は 30%')
{
  // ★リテラルで釘を打つ
  check('繰越の上限は 0.30', CARRYOVER_CAP_SHARE === 0.30, `${CARRYOVER_CAP_SHARE}`)
  // ふるまい：何年回しても「年間予算の 1.3倍 + 収入ぶん」を超えて積み上がらない
  const grant = 1_000_000_000
  let bal = grant
  for (let i = 0; i < 20; i++) {
    bal = computeNextSeasonBudget({ baseGrant: grant, prevBalance: bal, sponsorAnnual: 0,
      objBudgetBonus: 0, bonusPayout: 0, salaryTotal: 0, facilityUpkeep: 0 })
  }
  check('20年回しても年間予算の1.3倍で頭打ち', Math.abs(bal - grant * 1.3) < 1,
    `${(bal / grant).toFixed(2)}倍`)
}

console.log('')
console.log('[③] 移籍したら3シーズンは、退任もオファーも無い')
{
  check('線は3シーズン', GM_RESIGN_MIN_TENURE === 3, `${GM_RESIGN_MIN_TENURE}`)
  const tenure = (fromYear: number) => [{ teamId: MY, fromYear }] as never
  check('就任1年目は辞められない', !canResignAsGm(tenure(YEAR), YEAR).ok)
  check('2年目も辞められない', !canResignAsGm(tenure(YEAR), YEAR + 1).ok)
  check('3年目も辞められない', !canResignAsGm(tenure(YEAR), YEAR + 2).ok)
  check('**4年目に辞められる**', canResignAsGm(tenure(YEAR), YEAR + 3).ok)

  // ★オファー側も同じ線。以前は「就任1年目は来ない」の2年で、
  //   **押せないのにオファーだけ来る**年があった
  // ★格を付けないと offerCandidates が「格上も格下も居ない」と判断して常に null になる。
  //   fixture の作りが甘いと、判定ではなく世界のせいで落ちる（最初に書いた版がこれ）
  const teams = [{ id: MY, shortName: MY, division: 1, tier: 15, finance: { budget: 1e9 } },
    { id: 'x', shortName: 'x', division: 1, tier: 5, finance: { budget: 1e9 } }] as unknown as Team[]
  const budgets = Object.fromEntries(teams.map(t => [t.id,
    { budget: 1e9, carryover: 0, grant: 1e9, raceIncome: 0, sponsor: 0, objBonus: 0, expenses: 0 }]))
  const offerAt = (nextYear: number) => makeGmOffer({
    season: { standings: { 1: [{ teamId: 'x', totalPoints: 50 }, { teamId: MY, totalPoints: 40 }] } } as never,
    playerTeamId: MY, finalRank: 1, gmRep: 100,
    teamCount: 20, nextYear, teams, nextBudgets: budgets as never, objBonus: 0,
    rng: () => 0, tenureStartYear: YEAR })
  check('就任2年目にオファーは来ない', offerAt(YEAR + 1) === null)
  check('3年目にもオファーは来ない', offerAt(YEAR + 2) === null)
  check('**4年目には来る**', offerAt(YEAR + 3) !== null)
}

console.log('')
console.log('[④] 世界選手権が終わっていなければシーズンを終われない')
{
  // 字面で見る（endSeason を丸ごと走らせるには世界が要るので、ここは関門の有無を確かめる）
  const src = readFileSync('src/store/slices/seasonSlice.ts', 'utf-8')
  const body = src.slice(src.indexOf('endSeason: () => {'))
  check('endSeason がその年の大会の有無を見ている', /worldAthleticsResults \?\? \[\]\)\.some\(r => r\.year === y\)/.test(body))
  check('未開催ならその場で開催しようとする', /startWorldTournament\(\)/.test(body))
  check('**それでも積まれなければ return する**（黙って年を飛ばさない）',
    /シーズンを締めません[\s\S]{0,80}return/.test(body))

  // 画面側：大会へ入る導線がどの分岐にもあること
  //   ★identifier を数えるだけでは足りない（条件を false にしても名前は残るので緑のままになる）。
  //     **ECLの残り戦がある分岐の中に**ボタンがあることを見る
  const dash = readFileSync('src/components/dashboard/Dashboard.tsx', 'utf-8')
  const eclBranchStart = dash.indexOf('seasonDone && nextEclRace ?')
  const eclBranchEnd = dash.indexOf('seasonDone && !waDone ?', eclBranchStart)
  const eclBranch = eclBranchStart >= 0 && eclBranchEnd > eclBranchStart ? dash.slice(eclBranchStart, eclBranchEnd) : ''
  check('ECLの残り戦がある分岐を見つけられた', eclBranch.length > 0)
  check('**その分岐の中に大会へ進むボタンがある**', /onClick=\{goWorldAthletics\}/.test(eclBranch))
  // ★条件式そのものを書くと「実装をそのまま写した検査」になり、条件を強めても緑のままになる。
  //   見るのは**消えうる条件が付いていないこと**（大会が済んでいるとき以外は必ず出す）。
  //   `waSquadReady`（代表選考が済んでいるか）で隠すと、選考していない人には入口が
  //   1つも無くなり、その年の大会が丸ごと消える
  check('その分岐のボタンが「選考済み」で消されていない',
    !/waSquadReady\s*&&[\s\S]{0,200}onClick=\{goWorldAthletics\}/.test(eclBranch))
}

console.log('')
console.log(failed === 0 ? '\n✓ 2026-08-12 のオーナー判断4件は入っている\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
