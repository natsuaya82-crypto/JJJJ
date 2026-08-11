/**
 * 【巨大アクションの分解用ゴールデン検査】runRace / endSeason を**同じ入力・同じ乱数**で走らせ、
 * 実行後の状態が前回確認したものと1バイトも変わっていないことを見る。
 *
 *   npm run check の一部として実行される。単体では:
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-action-golden.ts \
 *     --outfile=node_modules/.cache/check-ag.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-ag.cjs
 *
 * ■ 何のためにあるか
 *   runRace（約1,150行）と endSeason（約1,230行）を工程ごとの関数へ切り出す作業
 *   （docs/REFACTORING_DESIGN.md の P5）は、**挙動を1ミリも変えずに**構造だけを変える。
 *   目で見て確かめられる規模ではないので、機械に「前と同じ結果か」を言わせる。
 *
 *   1工程切り出すたびにこれを走らせ、差分ゼロを確認してからコミットすること。
 *
 * ■ 乱数について
 *   Math.random をシード固定のPRNGに差し替えてある（このファイルの冒頭で、
 *   ゲーム側のモジュールを import するより先に差し替わる）。
 *   したがって **Math.random() の呼ばれる回数と順序が変わると結果が変わる**。
 *   分解でそれが起きたら、それは「工程の切り方を間違えた」というサインなので、
 *   ゴールデンを引き直して誤魔化さず、切り方を直すこと。
 *
 * ■ 意図してゲームの挙動を変えたとき（バランス調整など）だけ、
 *   UPDATE_GOLDEN=1 を付けて実行し、差分をレビューしてからコミットする。
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

// ── 乱数のシード固定（他の import より先に効かせる） ──────────────────
let rngSeed = 20260811
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}
const resetRng = () => { rngSeed = 20260811 }

import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { newSeasonStandings, DIVISIONS, DIVISION_RACES, divisionOf } from '../src/utils/league'
import { assignLineupByTerrain } from '../src/engine/raceEngine'
import { stripEphemeral } from '../src/store/ephemeralState'
import type { SeasonStanding, Team, Player, Race } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'
const DIR = 'scripts/fixtures'

// ── シナリオ同士を隔離する ──────────────────────────────────────────
// **1シナリオ＝1プロセス**で走らせる（下の「振り分け」）。
//
// 同じプロセスで続けて走らせると、シナリオを1つ足しただけで後ろのシナリオの
// ゴールデンが変わった。zustand の状態を素に戻すだけでは足りず（setState は書いた
// キーしか置き換えない）、状態を丸ごと戻しても直らなかった＝**ストアの外にある
// モジュールの値**（カードIDの連番など）が持ち越されていた。
//
// 順序に依存する検査は、シナリオを足すたびに全部を引き直すことになり、
// **その引き直しに本物の差分が紛れる**。それでは安全網の意味が無いので、
// プロセスごと分ける。下の「素の状態」は同一プロセス内での念のための備え。
const PRISTINE_JSON: string = (() => {
  const s = useGameStore.getState() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(s)) if (typeof v !== 'function') out[k] = v
  return JSON.stringify(out)
})()
// **毎回作り直す**（同じ実体を配ると、どこかで中身を書き換えられたときに素の状態まで汚れる）
const pristine = (): Record<string, unknown> => JSON.parse(PRISTINE_JSON)

// ── 同じ初期状態を作る（毎回この関数から作り直す） ─────────────────────
function buildState(phase: 'regular' | 'postseason', racesDone: number) {
  resetRng()
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  let players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
  // 契約年数をばらけさせる（満了が出ないと契約更新の枝を通らない）
  players = players.map((p, i) => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + (i % 3) } }))

  const standings = newSeasonStandings<SeasonStanding>(base, id => ({ teamId: id, totalPoints: 0, raceResults: [] }))
  for (const d of DIVISIONS) {
    const rows = standings[d]
    rows.forEach((row, i) => {
      row.totalPoints = (rows.length - i) * DIVISION_RACES[d]
      for (let r = 0; r < DIVISION_RACES[d]; r++) row.raceResults.push({ raceId: `d${d}-r${r}`, rank: i + 1, points: rows.length - i })
    })
  }
  const foreignStandings: Record<string, SeasonStanding[]> = {}
  for (const l of fgen.updatedLeagues) foreignStandings[l.id] = l.clubs.map((c, i) => ({ teamId: c.id, totalPoints: (20 - i) * 5, raceResults: [] }))

  const teams = base.map(t => ({ ...t, finance: { ...(t.finance ?? {}), budget: 400_000_000 } })) as Team[]
  const myTeam = teams.find(t => t.id === MY)!
  const allRaces = generateSeasonRaces(YEAR, divisionOf(myTeam))
  // racesDone 本だけ「消化済み」にする
  const races: Race[] = allRaces.map((r, i) => i < racesDone
    ? { ...r, results: { teamResults: [], segmentResults: [] } } as Race
    : r)

  useGameStore.setState({
    // 前のシナリオの残りを持ち越さないよう、素の状態へ戻してから組む（上の PRISTINE）
    ...pristine(),
    isInitialized: true,
    playerTeamId: MY,
    teams,
    players,
    foreignLeagues: fgen.updatedLeagues,
    currentSeason: {
      year: YEAR, phase, currentRaceIndex: racesDone,
      races, standings, foreignStandings, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [],
    },
    pastSeasons: [],
    worldAthleticsResults: [],
    worldRepresentatives: [],
  } as never)
  return { players, races }
}

// ── 実行後の状態を安定した形で写し取る ────────────────────────────────
// 時刻など「走らせるたびに変わるのが当たり前」のものだけ落とす。
const VOLATILE = new Set(['saveTimestamp'])
// ID の一部に `Date.now()` を使っている場所が多い（card_ / evt_ / cr_ / ao_ / bid_ ほか）。
// その数字だけを伏せる。**IDの他の部分（誰の・何番目の札か）は伏せない**ので、
// 「札が増えた・順番が変わった」は今までどおり差分として出る。
const maskTime = (s: string) => s.replace(/(^|[_a-zA-Z])1[6-9]\d{11}(?=$|[_\W])/g, '$1<T>')

/** 状態を「トップレベルのキーごとのJSON文字列」に開く（丸ごとの本文も $all に入れる） */
function snapshotParts(): Record<string, string> {
  const s = stripEphemeral(useGameStore.getState() as never) as Record<string, unknown>
  const stable = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === 'string' ? maskTime(x) : x))
  const out: Record<string, string> = {}
  for (const k of Object.keys(s).sort()) {
    if (typeof s[k] === 'function' || VOLATILE.has(k)) continue
    out[k] = stable(s[k]) ?? 'undefined'
  }
  out.$all = Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n')
  return out
}
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16)

function compare(name: string, produce: () => void) {
  const file = `${DIR}/golden-${name}.json`
  let threw: string | null = null
  try {
    produce()
  } catch (e) {
    threw = (e as Error).stack ?? (e as Error).message
  }
  check(`${name} が例外なく走り切る`, threw === null, threw ? threw.split('\n').slice(0, 3).join(' / ') : '')
  if (threw) return

  const parts = snapshotParts()
  // 状態そのものは数MBあるのでリポジトリには置かず、キーごとのハッシュだけ保存する。
  // どのキーが変わったかはこれで分かる。中身を目で見たいときは下の dump を開く
  const hashes: Record<string, string> = {}
  for (const [k, v] of Object.entries(parts)) hashes[k] = `${sha(v)} (${v.length}B)`

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(DIR, { recursive: true })
    writeFileSync(file, JSON.stringify(hashes, null, 1))
    console.log(`  ゴールデンを引き直した → ${file}（差分をレビューしてからコミット）`)
    return
  }
  let golden: Record<string, string>
  try {
    golden = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    console.log(`✗ ${file} が無い。UPDATE_GOLDEN=1 で生成してコミットすること`)
    problems.push(`${name}: ゴールデンが無い`)
    return
  }
  const changed = [...new Set([...Object.keys(golden), ...Object.keys(hashes)])]
    .filter(k => k !== '$all' && golden[k] !== hashes[k])
  const same = golden.$all === hashes.$all && changed.length === 0
  check(`${name} の実行後の状態が前回と同一`, same, same ? '' : `変わったのは ${changed.join(', ') || '(全体のみ)'}`)
  if (!same) {
    // 中身を見比べたいとき用に、いまの状態をキャッシュへ書き出す（コミット対象外）
    const dump = `node_modules/.cache/golden-${name}-actual.json`
    writeFileSync(dump, parts.$all)
    console.log(`      いまの状態: ${dump}`)
    console.log(`      前の状態を作るには: git stash && UPDATE_GOLDEN=1 <このスクリプト> で引き直して比較`)
    for (const k of changed) console.log(`      ${k}: ${golden[k] ?? '(無し)'} → ${hashes[k] ?? '(無し)'}`)
  }
}

const SCENARIOS: Record<string, () => void> = {}

SCENARIOS['runRace'] = () => {
  console.log('[runRace] 第1戦を走らせる')
  const { players } = buildState('regular', 0)
  const st = useGameStore.getState()
  const race = st.currentSeason.races[0]
  const roster = players.filter(p => p.teamId === MY && p.status === 'active')
  const lineup = assignLineupByTerrain(roster, race)
  compare('runRace', () => { useGameStore.getState().runRace(lineup) })
}

SCENARIOS['runRace-final'] = () => {
  console.log('[runRace-final] 最終戦。表彰と引退表明の発表が乗る')
  // 最終戦だけを通る枝がある（engine/seasonFinaleNews の表彰・引退表明）。
  // 開幕戦のシナリオだけだとそこが1行も動かないので、最終戦ぶんも見る
  const my = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].find(t => t.id === MY) as Team
  const n = generateSeasonRaces(YEAR, divisionOf(my)).length
  const { players } = buildState('regular', n - 1)
  const st = useGameStore.getState()
  const race = st.currentSeason.races[n - 1]
  const roster = players.filter(p => p.teamId === MY && p.status === 'active')
  const lineup = assignLineupByTerrain(roster, race)
  compare('runRace-final', () => { useGameStore.getState().runRace(lineup) })
}

SCENARIOS['endSeason'] = () => {
  console.log('[endSeason] 全戦消化後のオフシーズン')
  const my = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].find(t => t.id === MY) as Team
  const n = generateSeasonRaces(YEAR, divisionOf(my)).length
  buildState('postseason', n)
  compare('endSeason', () => { useGameStore.getState().endSeason() })
}

// ── 振り分け ────────────────────────────────────────────────────────
// GOLDEN_ONLY があればそのシナリオだけを走らせる（子プロセス側）。
// 無ければ、シナリオごとに自分自身を1回ずつ呼び直す（親プロセス側）。
const only = process.env.GOLDEN_ONLY
if (only) {
  const run = SCENARIOS[only]
  if (!run) { console.log(`✗ 知らないシナリオ: ${only}`); process.exit(1) }
  run()
  console.log('')
  if (problems.length === 0) process.exit(0)
  for (const p of problems) console.log(`  ${p}`)
  process.exit(1)
}

console.log('巨大アクションのゴールデン検査（シード固定・1シナリオ1プロセス）')
console.log('')
let failed = 0
for (const name of Object.keys(SCENARIOS)) {
  const r = spawnSync(process.execPath, ['-r', './scripts/ls-shim.cjs', process.argv[1]], {
    env: { ...process.env, GOLDEN_ONLY: name },
    stdio: 'inherit',
  })
  if (r.status !== 0) failed++
}
console.log('')
if (failed === 0) {
  console.log('✓ 分解しても、レースもオフシーズンも前とまったく同じ結果になる')
  process.exit(0)
}
console.log(`✗ ${failed}シナリオが落ちました`)
process.exit(1)
