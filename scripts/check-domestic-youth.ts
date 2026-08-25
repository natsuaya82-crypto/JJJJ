/**
 * 【国内2部・3部にも、毎年 若手が入ってくる】
 *
 * ■なぜ要るのか（オーナー・2026-08-16）
 *   「fa全部とっても１３人にしかならないからロスター埋められない」
 *   「海外の選手自動生成はなくなったの？ドラフトがない代わりに全チーム毎年２人くらい
 *     勝手に補強されるシステム」
 *   →「2.3部にも若手補強しよう。２人。レベル帯はドラフト外レベル」
 *
 *   選手が**入ってくる口**が、国内と海外で桁違いでした。
 *
 *     海外180クラブ … `refreshForeignLeagues` で1クラブ最大3人（最大540人／年）
 *     国内52クラブ  … ドラフト候補120人。しかも**指名できるのは1部の20クラブだけ**
 *
 *   出ていくほう（引退・契約満了・海外移籍）は国内も海外も同じだけあるので、
 *   国内の2部・3部だけが痩せます。実測（同じ世界を6年）で
 *
 *     2部の名簿（中央）23 → 18人 ／ 3部 24 → 17人
 *     下限15人を割ったクラブ 0 → 10クラブ
 *
 *   になり、FAをかき集めても15人に届かないクラブが並んでいました。
 *
 * ■この点検が守るもの
 *   ①〜④は関数を直接叩いて線を見ます。⑤は**世界を作って実際に3年回し**、
 *   2部・3部が痩せないことを見ます（関数を叩くだけだと「呼ばれているか」が分からない）。
 */
// ── 乱数の種を固定（他の import より先に効かせる）──────────────────
// ★**世界を作って回す点検は種を固定すること。** 固定しないと、成長の衰えや
//   CPUの市場に入っている `Math.random` の引きで、下限を割るクラブ数が
//   0〜2件のあいだで揺れる（実際に「昨日まで緑・今日だけ赤」が出た）。
//   `flaky`（落ちたら引き直す印）はこの repo では使わない——落ちた世界を
//   二度と再現できないため（run-checks.mjs の continental の項）。
let rngSeed = 20260816
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { readFileSync } from 'node:fs'
import { DOMESTIC_YOUTH_PER_CLUB, refreshDomesticYouth, generateCpuRosters, generateDraftPool, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { ROSTER_MAX, ROSTER_MIN } from '../src/data/rosterRules'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import { generateSeasonRaces } from '../src/data/races'
import { ovr } from '../src/utils/playerUtils'
import { useGameStore } from '../src/store/gameStore'
import type { Player, SeasonStanding, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const MY = 'tokyo'
const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]

console.log('[1] 入るのは2部・3部だけ。1部はドラフトで獲る')
const youth = refreshDomesticYouth(base, YEAR, [])
{
  const byDiv = new Map<number, number>()
  for (const p of youth) {
    const d = divisionOf(base.find(t => t.id === p.teamId)!)
    byDiv.set(d, (byDiv.get(d) ?? 0) + 1)
  }
  console.log(`      1部${byDiv.get(1) ?? 0} / 2部${byDiv.get(2) ?? 0} / 3部${byDiv.get(3) ?? 0}人`)
  check('1部には入らない', (byDiv.get(1) ?? 0) === 0, `${byDiv.get(1) ?? 0}人`)
  check('2部・3部には入る（空振りの緑ではない）', (byDiv.get(2) ?? 0) > 0 && (byDiv.get(3) ?? 0) > 0)
}

console.log('\n[2] 1クラブ2人（DOMESTIC_YOUTH_PER_CLUB 1本）')
{
  const per = new Map<string, number>()
  for (const p of youth) per.set(p.teamId, (per.get(p.teamId) ?? 0) + 1)
  const targets = base.filter(t => divisionOf(t) !== 1)
  check('対象クラブ全部に入っている', per.size === targets.length, `${per.size}/${targets.length}クラブ`)
  check(`ちょうど${DOMESTIC_YOUTH_PER_CLUB}人ずつ`,
    [...per.values()].every(n => n === DOMESTIC_YOUTH_PER_CLUB),
    [...new Set(per.values())].join('/') + '人')
  // 人数はここ1本から出す（画面や store に 2 と書かない）
  const src = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  check('人数の定数がある', /export const DOMESTIC_YOUTH_PER_CLUB\s*=/.test(src))
}

console.log('\n[3] レベル帯は「ドラフト外」＝指名されずに残る帯')
{
  const os = youth.map(p => ovr(p)).sort((a, b) => b - a)
  console.log(`      若手のOVR 最高${os[0]} / 中央${os[Math.floor(os.length / 2)]} / 最低${os[os.length - 1]}`)
  // ドラフト候補120人のうち指名されるのは1部20クラブ × 2巡 ＝ 40人で、上から順に取られる。
  // 若手補充がその帯に入っていたら「ドラフト外レベル」ではない
  const draftTop = generateDraftPool(YEAR, new Set<string>())
    .map(p => ovr(p)).sort((a, b) => b - a)[39]
  console.log(`      その年のドラフトで指名される帯の下限 OVR${draftTop}`)
  check('若手はドラフトで指名される帯に届かない', os[0] < draftTop, `最高${os[0]} / 当落線${draftTop}`)
  check('若手が弱すぎて誰の役にも立たない、にはなっていない', os[os.length - 1] >= 45, `最低${os[os.length - 1]}`)
}

console.log('\n[4] 名簿の上限を超えない')
{
  const full = base.map(t => t.id)
  const packed: Player[] = full.flatMap(id =>
    Array.from({ length: ROSTER_MAX }, (_, i) => ({ id: `${id}-${i}`, teamId: id, status: 'active' } as unknown as Player)))
  check('満員のクラブには1人も入らない', refreshDomesticYouth(base, YEAR, packed).length === 0)
  // あと1人だけ空いている世界
  const oneShort: Player[] = full.flatMap(id =>
    Array.from({ length: ROSTER_MAX - 1 }, (_, i) => ({ id: `${id}-${i}`, teamId: id, status: 'active' } as unknown as Player)))
  const got = refreshDomesticYouth(base, YEAR, oneShort)
  const per = new Map<string, number>()
  for (const p of got) per.set(p.teamId, (per.get(p.teamId) ?? 0) + 1)
  check('空きが1人なら1人だけ入る', [...per.values()].every(n => n === 1), [...new Set(per.values())].join('/'))
}

console.log('\n[5] 入れ方は1本（海外の新加入とまったく同じ口を通る）')
{
  const season = readFileSync('src/store/slices/seasonSlice.ts', 'utf8')
  check('endSeason が refreshDomesticYouth を呼ぶ', /refreshDomesticYouth\(/.test(season))
  // ★**「入口が1つか」を見ること。並びを丸ごと固定しない。** 以前はこの行が
  //   `[...foreignRefresh.newPlayers, ...domesticYouth]` という**並びそのもの**を
  //   当てていたので、同じ配列に3つ目（下限割れの救済 rosterFill）を足しただけで
  //   落ちた。足したのは2本目の入口ではないので、落ちるのは間違い。
  const entries = (season.match(/newForeignPlayers:/g) ?? []).length
  check('newForeignPlayers に渡す口は1つ', entries === 1, `${entries} か所`)
  const line = /newForeignPlayers:\s*\[([^\]]*)\]/.exec(season)?.[1] ?? ''
  check('海外の新加入と同じ引数に混ぜている（2本目の入口を作っていない）',
    line.includes('...foreignRefresh.newPlayers') && line.includes('...domesticYouth'), line.trim())
}

console.log('\n[6] 世界を3年回して、2部・3部が痩せない')
{
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  let sd = 11
  const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff }
  players = players.map(p => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + Math.floor(rnd() * 3) } }))
  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  for (const d of DIVISIONS) standings[d].forEach((row, i) => {
    row.totalPoints = (standings[d].length - i) * DIVISION_RACES[d]
    for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: standings[d].length - i })
  })
  const foreignStandings: Record<string, SeasonStanding[]> = {}
  for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))
  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const races = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)!))
  useGameStore.setState({
    isInitialized: true, playerTeamId: MY, teams, players, foreignLeagues: fgen.updatedLeagues,
    currentSeason: { year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
      races: races.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } })),
      standings, foreignStandings, newsFeed: [], objectives: [], incomingOffers: [], transferListings: [], contractRequests: [] },
    pastSeasons: [], worldAthleticsResults: [], worldRepresentatives: [],
  } as never)

  let short = 0
  let med2 = 0
  let med3 = 0
  for (let y = 0; y < 3; y++) {
    useGameStore.getState().endSeason()
    useGameStore.getState().beginSeasonDraft()
    // ★ドラフトは「始める」だけでは誰も入らない。最後まで指名させて、指名漏れを
    //   FAへ流すところ（advanceDraft）まで通すこと。ここを飛ばすと1部だけが
    //   痩せて見え、原因を取り違える（実際に一度取り違えた）
    for (let i = 0; i < 200 && !useGameStore.getState().draftState?.isComplete; i++) useGameStore.getState().cpuPick()
    useGameStore.getState().advanceDraft()
    const st = useGameStore.getState()
    const act = st.players.filter(p => p.status === 'active')
    const sizeOf = (d: number) => st.teams.filter(t => divisionOf(t) === d)
      .map(t => act.filter(p => p.teamId === t.id).length).sort((a, b) => a - b)
    const s2 = sizeOf(2)
    const s3 = sizeOf(3)
    med2 = s2[Math.floor(s2.length / 2)]
    med3 = s3[Math.floor(s3.length / 2)]
    short = [...s2, ...s3].filter(n => n < ROSTER_MIN).length
    console.log(`      ${YEAR + y}年  2部の名簿(中央)${med2}人 / 3部${med3}人  下限割れ ${short}クラブ`)
  }
  // 若手を入れる前は3年目で 2部18 / 3部16、下限割れ 5クラブだった
  check('3年後も2部の名簿が痩せていない', med2 >= ROSTER_MIN + 4, `${med2}人`)
  check('3年後も3部の名簿が痩せていない', med3 >= ROSTER_MIN + 4, `${med3}人`)
  check('下限15人を割ったクラブが並んでいない', short <= 1, `${short}クラブ`)
}

console.log('')
if (failed > 0) { console.log(`✗ 国内2部・3部に若手が入っていません（${failed}件）`); process.exit(1) }
console.log('✓ 2部・3部にも毎年若手が入り、名簿が痩せない')
