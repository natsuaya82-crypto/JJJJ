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
    isInitialized: true,
    playerTeamId: MY,
    teams,
    players,
    foreignLeagues: fgen.updatedLeagues,
    // カード類は明示的に空へ。setState は書いたキーしか置き換えないので、
    // 消し忘れると前のシナリオで配られたカードが次のシナリオへ持ち越される
    trainingCards: [],
    raceDroppedCards: [],
    jewels: 0,
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

console.log('巨大アクションのゴールデン検査（シード固定・状態まるごと比較）')
console.log('')

console.log('[1] runRace（第1戦を走らせる）')
{
  const { players } = buildState('regular', 0)
  const st = useGameStore.getState()
  const race = st.currentSeason.races[0]
  const roster = players.filter(p => p.teamId === MY && p.status === 'active')
  const lineup = assignLineupByTerrain(roster, race)
  compare('runRace', () => { useGameStore.getState().runRace(lineup) })
}

console.log('')
console.log('[2] endSeason（全戦消化後のオフシーズン）')
{
  const my = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].find(t => t.id === MY) as Team
  const n = generateSeasonRaces(YEAR, divisionOf(my)).length
  buildState('postseason', n)
  compare('endSeason', () => { useGameStore.getState().endSeason() })
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 分解しても、レースもオフシーズンも前とまったく同じ結果になる')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
for (const p of problems) console.log(`  ${p}`)
process.exit(1)
