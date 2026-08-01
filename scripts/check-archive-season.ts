/**
 * 過去シーズンの保存形（許可リスト）が壊れていないかを確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-archive-season.ts
 *
 * 見ているのは3つ。
 *   1. 旧セーブ（Season丸ごと）を移行すると、残す13項目だけになるか
 *   2. 記録室・在籍履歴・歴代優勝が使う元データが1件も欠けていないか
 *   3. 保存時（archiveSeason）と移行時（toArchivedShape）の形が一致するか
 *      ＝ 片方だけ直して形がズレる事故を防ぐ
 *   4. セーブに書かない項目（ephemeralState）が、書かない物だけを落としているか
 */
import { archiveSeason, toArchivedShape } from '../src/utils/archiveSeason'
import { EPHEMERAL_KEYS, stripEphemeral } from '../src/store/ephemeralState'
import type { Season } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

// ── 旧セーブに入っていた「1年ぶんの過去シーズン」を模した生データ ──
const race = (id: string, pid: string, teamId: string) => ({
  id, name: `${id}大会`, date: '2046-01-01', location: '東京', terrain: 'flat', segments: [],
  results: { segmentResults: [{ segment: 1, runners: [{ playerId: pid, teamId, rank: 1, time: 1800, name: 'テスト選手' }] }], teamResults: [] },
})
const oldSeason: Record<string, unknown> = {
  // 残るはず（13項目）
  year: 2046,
  races: [race('r1', 'p1', 't1')],
  collegeRaces: [race('c1', 'p9', 'univ')],
  standings: [{ teamId: 't1', leaguePoints: 10, segmentPoints: 5, totalPoints: 15, raceResults: [{ raceId: 'r1', rank: 1, points: 15 }] }],
  secondTeamRaces: [race('s1', 'p2', 't1')],
  secondTeamStandings: [{ teamId: 't1', totalPoints: 8, raceResults: [] }],
  foreignStandings: { l1: [{ clubId: 'fc1', totalPoints: 30, raceResults: [{ raceId: 'x', rank: 1, points: 30 }] }] },
  foreignRaceIndex: 12,
  foreignAppearances: { p3: { clubId: 'fc1', races: 10, wins: 2, rankSum: 25, rankedRaces: 10 } },
  zeroAppearances: [{ playerId: 'p4', teamId: 't2', tier: 'main' }],
  eclRace: race('e0', 'p5', 't1'),
  eclSeries: { participants: [], races: [race('e1', 'p6', 't1')], raceIndex: 5, points: { t1: 20 } },
  // 落ちるはず（読む箇所がゼロの項目）
  newsFeed: [{ date: '2046-01-01', headline: 'x', category: 'race', relatedIds: [] }],
  chatLogs: { p1: [{ from: 'gm', text: 'x' }] },
  individualEvents: [{ id: 'ie1', results: {} }],
  objectives: [{ id: 'o1', desc: 'x', target: 1, current: 1, rewardPts: 1, done: true }],
  initialBudget: 350_000_000,
  seasonGrant: 350_000_000,
  budgetBreakdown: { carryover: 1, grant: 2, raceIncome: 3, sponsor: 4, objBonus: 5, expenses: 6 },
  seasonRaceIncome: 1234,
  transferIncome: 1, transferSpend: 2,
  eclResult: { standings: [{ id: 't1', name: 'A', points: 20 }], playerRank: 1 },
  eclCourseId: 'ec1',
  draftPool: [{ id: 'd1' }], scoutProspects: [{ id: 'sp1' }],
  trainingAssignments: { p1: 'speed' }, trainingPlan: 'balanced',
  devProspects: [{ id: 'dv1' }], sponsorOffers: [{ id: 'so1' }],
  scoutPoints: 100, phase: 'season', currentRaceIndex: 20, secondTeamRaceIndex: 8,
  transferListings: [{ id: 'tl1' }], incomingOffers: [{ id: 'io1' }],
  pendingRenewalDecisions: ['p1'], rosterSubmitted: true,
}

const KEEP = ['year', 'races', 'collegeRaces', 'standings', 'secondTeamRaces', 'secondTeamStandings',
  'foreignStandings', 'foreignRaceIndex', 'foreignAppearances', 'foreignAppsC', 'zeroAppearances',
  'eclRace', 'eclSeries'] as const

console.log('\n[1] 旧セーブの移行')
const migrated = toArchivedShape(oldSeason)
const leftover = Object.keys(migrated).filter(k => !(KEEP as readonly string[]).includes(k))
check('残す13項目以外が消えている', leftover.length === 0, `残っている: ${leftover.join(', ')}`)
for (const k of ['objectives', 'initialBudget', 'eclResult', 'newsFeed', 'chatLogs', 'trainingAssignments']) {
  check(`${k} が消えている`, migrated[k] === undefined)
}

console.log('\n[2] 記録の元データが欠けていない')
check('年', migrated.year === 2046)
check('1軍の駅伝結果', JSON.stringify(migrated.races) === JSON.stringify(oldSeason.races))
check('大学駅伝', JSON.stringify(migrated.collegeRaces) === JSON.stringify(oldSeason.collegeRaces))
check('年間順位表', JSON.stringify(migrated.standings) === JSON.stringify(oldSeason.standings))
check('リザーブ駅伝', JSON.stringify(migrated.secondTeamRaces) === JSON.stringify(oldSeason.secondTeamRaces))
check('リザーブ順位表', JSON.stringify(migrated.secondTeamStandings) === JSON.stringify(oldSeason.secondTeamStandings))
check('ECL（旧・一発勝負）', JSON.stringify(migrated.eclRace) === JSON.stringify(oldSeason.eclRace))
check('ECL 5戦シリーズ', JSON.stringify(migrated.eclSeries) === JSON.stringify(oldSeason.eclSeries))
check('出走ゼロの年の所属', JSON.stringify(migrated.zeroAppearances) === JSON.stringify(oldSeason.zeroAppearances))
check('海外マッチデー数', migrated.foreignRaceIndex === 12)

const appsC = migrated.foreignAppsC as Record<string, Record<string, number[]>>
check('海外の出場記録が圧縮版に移っている', !!appsC?.fc1?.p3)
check('　出場数・区間賞・順位合計・順位付きレース数が一致',
  JSON.stringify(appsC?.fc1?.p3) === JSON.stringify([10, 2, 25, 10]))
const fs = migrated.foreignStandings as Record<string, { clubId: string; totalPoints: number; raceResults: unknown[] }[]>
check('海外リーグ順位表の合計ポイントが残っている', fs?.l1?.[0]?.totalPoints === 30)
check('　1戦ごとの結果は落ちている（容量削減）', fs?.l1?.[0]?.raceResults.length === 0)

console.log('\n[3] 保存時と移行時で形が同じ')
const saved = archiveSeason(oldSeason as unknown as Season, {
  foreignAppsC: appsC as never,
  foreignStandings: fs as never,
  zeroAppearances: oldSeason.zeroAppearances as never,
})
const keysOf = (o: object) => Object.keys(o).sort().join(',')
check('項目名が完全に一致', keysOf(saved) === keysOf(migrated),
  `保存時=[${keysOf(saved)}] 移行時=[${keysOf(migrated)}]`)
check('中身も一致', JSON.stringify(saved) === JSON.stringify(migrated))

console.log('\n[4] 壊れた入力でも落ちない')
check('空オブジェクト', !!toArchivedShape({}))
check('海外データなし', toArchivedShape({ year: 2040 }).foreignAppsC === undefined)
check('すでに圧縮版を持つ年は二重変換しない',
  JSON.stringify(toArchivedShape({ foreignAppsC: { fc1: { p1: [1, 0, 0, 0] } }, foreignAppearances: { p2: { clubId: 'fc2', races: 5, wins: 0 } } }).foreignAppsC)
  === JSON.stringify({ fc1: { p1: [1, 0, 0, 0] } }))
check('2回流しても結果が変わらない（冪等）',
  JSON.stringify(toArchivedShape(toArchivedShape(oldSeason))) === JSON.stringify(migrated))

console.log('\n[5] セーブに書かない項目（一時的な状態）')
// 実際のストアを模した状態。一時的な項目と、絶対に消えてはいけない項目を混ぜてある
const storeLike = {
  // 消えてよい（画面の開閉状態・読まれない残骸）
  openPlayerId: 'p1', contractInfoPlayerId: 'p2', fusionPlayerId: 'p3', fusionCardIds: ['c1'],
  activeRacePhase: 'results', activeRaceSim: { tick: 3 }, activeRaceResults: { x: 1 },
  activeRaceLockedRace: { id: 'r1' }, activeRaceLockedRaceIndex: 4, setupData: { teamId: 't1' },
  // 消えたら困る
  isInitialized: true, playerTeamId: 't1', players: [{ id: 'p1' }], teams: [{ id: 't1' }],
  currentSeason: { year: 2046 }, pastSeasons: [{ year: 2045 }], draftState: { round: 1 },
  raceLineup: { 1: 'p1' }, lastRaceLineup: { 1: 'p2' }, seenJoinIds: ['a'], seenInjuryIds: ['b'],
  raceStrategy: 'balanced', raceTeamTalk: 'best', jewels: 120, adsRemoved: true,
  foreignLeagues: [{ id: 'l1' }], transferHistory: [], worldAthleticsResults: [],
}
const stripped = stripEphemeral(storeLike) as Record<string, unknown>
for (const k of EPHEMERAL_KEYS) check(`${k} を保存しない`, !(k in stripped))
// 除外リストに載っていない項目は1つ残らず残ること（＝新しく足した項目が黙って保存されない事故を防ぐ）
const lost = Object.keys(storeLike).filter(k => !(EPHEMERAL_KEYS as readonly string[]).includes(k) && !(k in stripped))
check('それ以外は全部残っている', lost.length === 0, `消えている: ${lost.join(', ')}`)
// 出走メンバーの下書きは「作りかけだが閉じても残ってほしい物」。除外してはいけない
for (const k of ['raceLineup', 'lastRaceLineup', 'draftState', 'seenJoinIds', 'currentSeason', 'pastSeasons', 'players', 'teams']) {
  check(`${k} は必ず保存される`, k in stripped)
}
check('元の状態を書き換えていない', 'openPlayerId' in storeLike)
// セーブ破壊ガードは書き込み内容の "isInitialized":true を見ているので、これが消えると保存が壊れる
check('isInitialized が残っている（セーブ破壊ガードが見ている）', stripped.isInitialized === true)

console.log(`\n${failed === 0 ? '全部OK' : `${failed}件 失敗`}\n`)
process.exit(failed === 0 ? 0 : 1)
