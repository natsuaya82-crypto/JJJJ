/**
 * 【監督の移籍は次のシーズンから】実際に世界を1つ作って**走らせて**確かめる。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-gm-move.ts \
 *     --outfile=node_modules/.cache/check-gmv.cjs --log-level=error \
 *     && node -r ./scripts/ls-shim.cjs node_modules/.cache/check-gmv.cjs
 *
 * ■なぜ字面の点検と別に要るのか（`check-gm-resign` の[④]は字面を見ている）
 *   オーナー判断★13（2026-08-12）「**次シーズンの開始になるからね**」に対して、
 *   実装は長いあいだ「受けたその場で入れ替わる」ままでした。字面だけを見ていると
 *   **画面の文言を実装に合わせて書き換える**という逆向きの直し方が通ってしまいます
 *   （実際に一度そうしかけました）。だから**ふるまい**で留めます。
 *
 * ■見ること
 *   ① 退任 → 打診が届く（3件まで・年は**来季**）
 *   ② 受けても**その場では移らない**（playerTeamId は変わらない）
 *   ③ 予約中は退任し直せない（★13-a）
 *   ④ `endSeason` を通すと**移っている**（playerTeamId が変わり、予約は消える）
 *   ⑤ 移った先の予算・目標・日程が新チームのものになっている
 *   ⑥ 旧チームは CPU に戻り、移籍方針（非売・貸出歓迎）が剥がれている（★13-c）
 */
// ── 乱数のシード固定（他の import より先に効かせる） ──────────────────
let rngSeed = 20260812
Math.random = () => {
  rngSeed = (rngSeed * 1664525 + 1013904223) >>> 0
  return rngSeed / 4294967296
}

import { useGameStore } from '../src/store/gameStore'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { DIVISIONS, DIVISION_RACES, divisionOf, newSeasonStandings } from '../src/utils/league'
import type { Player, Race, SeasonStanding, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const MY = 'tokyo'

// ★就任年を古くしておく。3シーズンの縛り（GM_RESIGN_MIN_TENURE）に引っかかると
//   退任そのものができず、「移らないこと」だけが緑になる空振りの世界になる
const TENURE_FROM = YEAR - 9

function buildWorld() {
  const base = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
  const cpu = generateCpuRosters(base, YEAR)
  const fgen = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
  const players: Player[] = [...cpu.cpuPlayers, ...fgen.players]
    .map((p, i) => ({ ...p, contract: { ...p.contract, yearsLeft: 1 + (i % 3) } }))
  // ★自チームの選手に移籍方針を付けておく。付いていないと「剥がれたか」を見ても
  //   そもそも付いていないだけで緑になる
  for (const p of players) if (p.teamId === MY) { p.noSale = true; p.loanListed = true }

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
  const allRaces = generateSeasonRaces(YEAR, divisionOf(teams.find(t => t.id === MY)))
  const races: Race[] = allRaces.map(r => ({ ...r, results: { teamResults: [], segmentResults: [] } }) as Race)

  useGameStore.setState({
    isInitialized: true,
    playerTeamId: MY,
    teams,
    players,
    foreignLeagues: fgen.updatedLeagues,
    gmTenures: [{ teamId: MY, fromYear: TENURE_FROM }],
    gmOffers: [],
    pendingGmMove: null,
    currentSeason: {
      year: YEAR, phase: 'postseason', currentRaceIndex: races.length,
      races, standings, foreignStandings, newsFeed: [], objectives: [],
      incomingOffers: [], transferListings: [], contractRequests: [],
    },
    pastSeasons: [],
    worldAthleticsResults: [{ year: YEAR }],
    worldRepresentatives: [],
  } as never)
}

buildWorld()
const S = () => useGameStore.getState()

console.log('[①] 退任すると打診が届く（年は**来季**）')
S().resignAsGm()
{
  const offers = S().gmOffers ?? []
  check('打診が届いている', offers.length > 0, `${offers.length}件`)
  check('**どの打診も来季のもの**', offers.length > 0 && offers.every(o => o.year === YEAR + 1),
    offers.map(o => o.year).join(','))
}

console.log('')
console.log('[②] 受けてもその場では移らない')
const destId = (S().gmOffers ?? [])[0]?.teamId ?? ''
S().acceptGmOffer(destId)
{
  check('行き先が決まっている', !!destId, destId)
  check('**playerTeamId はまだ変わっていない**', S().playerTeamId === MY, S().playerTeamId)
  check('予約が入っている', S().pendingGmMove?.teamId === destId, JSON.stringify(S().pendingGmMove))
  check('予約の年は来季', S().pendingGmMove?.year === YEAR + 1)
  check('打診の札は消えている（答えたので）', (S().gmOffers ?? []).length === 0)
}

console.log('')
console.log('[③] 予約中はもう退任できない（★13-a 取り消せない）')
{
  S().resignAsGm()
  check('打診は届かない', (S().gmOffers ?? []).length === 0, `${(S().gmOffers ?? []).length}件`)
  check('予約は書き換わっていない', S().pendingGmMove?.teamId === destId)
}

console.log('')
console.log('[④] endSeason を通すと移っている')
const oldTeamName = S().teams.find(t => t.id === MY)?.gmName
S().endSeason()
{
  check('**playerTeamId が新チームになった**', S().playerTeamId === destId, S().playerTeamId)
  check('年が進んでいる', S().currentSeason.year === YEAR + 1, `${S().currentSeason.year}`)
  check('予約は使い切られている', !S().pendingGmMove, JSON.stringify(S().pendingGmMove))
  check('在任履歴が新チームで始まっている',
    (S().gmTenures ?? []).slice(-1)[0]?.teamId === destId
    && (S().gmTenures ?? []).slice(-1)[0]?.fromYear === YEAR + 1,
    JSON.stringify((S().gmTenures ?? []).slice(-1)[0]))
}

console.log('')
console.log('[⑤] 移った先のもので始まっている')
{
  const dest = S().teams.find(t => t.id === destId)
  check('新チームが自分のものになっている', !!dest?.isPlayerControlled)
  check('GM名を持って行っている', dest?.gmName === oldTeamName, `${dest?.gmName} / ${oldTeamName}`)
  check('予算が入っている', (S().currentSeason.initialBudget ?? 0) > 0,
    `${S().currentSeason.initialBudget}`)
  check('目標が新しく引かれている', (S().currentSeason.objectives ?? []).length > 0)
  // ★日程は移籍先の部のもの。3部から1部へ移ったのに3部の日程のままだと本数が食い違う
  const destDiv = divisionOf(dest)
  check(`日程が移籍先の部（${destDiv}部）の本数になっている`,
    S().currentSeason.races.length === DIVISION_RACES[destDiv],
    `${S().currentSeason.races.length}本 / ${DIVISION_RACES[destDiv]}本`)
}

console.log('')
console.log('[⑥] 旧チームは置いていく（★13-c）')
{
  const old = S().teams.find(t => t.id === MY)
  check('旧チームはCPUに戻っている', !old?.isPlayerControlled)
  const stillFlagged = S().players.filter(p => p.teamId === MY && (p.noSale || p.loanListed || p.transferListed))
  check('**旧チームの移籍方針が剥がれている**', stillFlagged.length === 0, `${stillFlagged.length}人`)
  const mine = S().players.filter(p => p.teamId === destId)
  check('新チームの選手を持っている（空の世界ではない）', mine.length > 0, `${mine.length}人`)
}

console.log('')
if (problems.length > 0) {
  console.log(`✗ 監督の移籍が★13どおりに動いていません（${problems.length}件）`)
  process.exit(1)
}
console.log('✓ 受けても今季は動かず、次のシーズンの開始で新チームへ移る')
