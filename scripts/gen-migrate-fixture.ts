/**
 * 【セーブfixtureの生成（開発ツール・checkでは実行しない）】
 *
 * check-migrate-snapshot.ts が読む「旧バージョンのセーブ」を合成して
 * scripts/fixtures/save-v29.json に書き出す。
 *
 *   npx tsx scripts/gen-migrate-fixture.ts
 *
 * ■ 一度生成したら原則作り直さないこと
 *   fixture は「過去に実在した形のセーブ」の代役。選手の能力値などは生成時の乱数で
 *   決まるが、ファイルに焼き込んだ時点で固定される（＝毎回同じ入力で migrate を検査できる）。
 *   作り直すと基準が変わり、スナップショット（snapshot-v29.json）も引き直しになる。
 *
 * ■ 中身は 2.0.1（persist v29）当時の形
 *   check-migrate-old-save.ts の合成セーブと同じ考え方（あちらは意味の検査、
 *   こちらは形の網羅が目的）。v29当時に存在した代表的なフィールドを一通り持たせる。
 *   - 順位表は全チーム1本の配列（v36で部ごとのRecordに分かれる前）
 *   - 海外順位表の行キーは clubId（v39で teamId に統一される前）
 *   - クラブ側名簿 roster.main あり（v40で落とされる前）
 *   - 世界大会の走行記録は worldAthleticsResults[].races（v37でSeason.waRacesへ移る前）
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { INITIAL_TEAMS } from '../src/data/teams'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { LEAGUE_COURSE_POOL } from '../src/data/races'
import type { Race } from '../src/types'

const YEAR = 2030

// v39 までのセーブはクラブ側にも名簿（roster.main）を持っていた
const teams = INITIAL_TEAMS.map((t, i) => {
  const { division: _d, ...rest } = t as Record<string, unknown>
  return { ...rest, roster: { main: [`ghost-${i}`] } }
})
const players = generateCpuRosters(INITIAL_TEAMS as never, YEAR).cpuPlayers

const mkRace = (i: number): Race => {
  const c = LEAGUE_COURSE_POOL[i]
  const runners = teams.flatMap(t => players.filter(p => p.teamId === t.id).slice(0, 1).map(p => ({
    playerId: p.id, teamId: t.id as string, timeSec: 1800 + i, rank: 1,
  })))
  return {
    id: `r${i}`, name: c.name, date: `${YEAR}-04-0${i + 1}`, location: c.location ?? '', type: 'league',
    segments: c.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
    results: { teamRankings: [], segmentResults: [{ segmentIndex: 1, runners }] },
  }
}
const races = [mkRace(0), mkRace(1)]

// v29 の順位表は「全チームを1本の配列」で持っていた
const flatStandings = teams.map((t, i) => ({
  teamId: t.id as string, leaguePoints: 40 - i, segmentPoints: 0, totalPoints: 40 - i,
  raceResults: [{ raceId: 'r0', rank: i + 1, points: 20 - i }],
}))
const waRace: Race = { ...mkRace(2), id: 'wa-2029-r1', name: '2029 世界選手権アジア予選 東京 第1戦' }

const state: Record<string, unknown> = {
  isInitialized: true,
  playerTeamId: teams[0].id,
  teams,
  players,
  currentSeason: {
    year: YEAR, races, standings: flatStandings, newsFeed: [
      { date: `${YEAR}-04-01`, headline: '開幕', category: 'league', relatedIds: [] },
    ], objectives: [],
    foreignStandings: { africa_east: [
      { clubId: 'ken_1', totalPoints: 42, raceResults: [{ raceId: 'fr0', rank: 1, points: 20 }] },
      { clubId: 'eth_1', totalPoints: 31, raceResults: [{ raceId: 'fr0', rank: 2, points: 16 }] },
    ] },
    chatLogs: { dup: [
      { from: 'player', text: 'A' }, { from: 'player', text: 'A' },
      { from: 'gm', text: 'B' },
    ] },
    transferListings: [], incomingOffers: [], transferBids: [],
  },
  pastSeasons: [{
    year: YEAR - 1, races: [mkRace(3)], standings: flatStandings,
    foreignStandings: { africa_east: [
      { clubId: 'eth_1', totalPoints: 55, raceResults: [{ raceId: 'pfr0', rank: 1, points: 20 }] },
      { clubId: 'ken_1', totalPoints: 12, raceResults: [{ raceId: 'pfr0', rank: 2, points: 16 }] },
    ] },
  }],
  worldAthleticsResults: [{ year: YEAR - 1, kind: 'qualifier', host: 'JPN', standings: [], advanced: [], races: [waRace] }],
  worldRepresentatives: [],
  // 当時から存在した進行系のスカラー・小物（形の網羅用）
  gmRep: 50,
  jewels: 120,
  loginStreak: 3,
  totalLoginDays: 40,
  trainingCards: [],
  raceDroppedCards: [],
  pendingGifts: [],
  giftGivenVersions: [],
  starredOpponents: [],
  starredProspects: [],
  transferHistory: [],
}

mkdirSync('scripts/fixtures', { recursive: true })
writeFileSync('scripts/fixtures/save-v29.json', JSON.stringify({ version: 29, state }, null, 1))
console.log(`scripts/fixtures/save-v29.json を書き出した（players ${players.length}人 / teams ${teams.length}）`)
