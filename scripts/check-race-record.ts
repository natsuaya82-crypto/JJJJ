/**
 * 走行記録を詰めて戻したときに、中身が1つも変わらないことを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-race-record.ts --outfile=/tmp/crr.cjs && node /tmp/crr.cjs
 *
 * 過去シーズンの記録は本体のセーブから外して別ファイルに置く（store/seasonArchive.ts）。
 * 外す前に「書いたものを読み戻して一致するか」を必ず確かめるが、
 * そもそも詰め方が壊れていたら一致してしまっても中身が違う。ここで詰め方そのものを見る。
 *
 * 順位・順位ポイント・区間賞は保存せず作り直すので、本編のレースが出した値と
 * 1つでも違えば落とす。
 */
import { simulateRace } from '../src/engine/raceEngine'
import { packRaceResults, unpackRace } from '../src/utils/raceRecord'
import { LEAGUE_COURSE_POOL } from '../src/data/races'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import type { Race } from '../src/types'

const teams = INITIAL_TEAMS.slice(0, 20)
// 20クラブぶんのロスターを実際に作る（BASE_PLAYERS は未所属のFAだけなので走れない）
const players = generateCpuRosters(teams, 2028).cpuPlayers

let checked = 0
const problems: string[] = []

for (const tpl of LEAGUE_COURSE_POOL.slice(0, 6)) {
  const race: Race = {
    id: `chk-${tpl.name}`, name: tpl.name, date: '2028-04-01', location: tpl.location ?? '',
    type: 'league', segments: tpl.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
  }
  // 全チームぶんのオーダーを組む（上位から区間数ぶん）。lineups は 区間番号 → 選手ID
  const lineups: Record<string, Record<number, string>> = {}
  for (const t of teams) {
    const roster = players.filter(p => p.teamId === t.id).slice(0, race.segments.length)
    lineups[t.id] = Object.fromEntries(race.segments.map((seg, i) => [seg.index, roster[i]?.id]).filter(([, id]) => id))
  }
  const results = simulateRace(race, lineups, teams, players, 1)
  const packed = packRaceResults({ ...race, results })
  if (!packed) { problems.push(`${race.name}: 詰められなかった`); continue }
  const back = unpackRace(packed)

  // 区間結果
  if (back.segmentResults.length !== results.segmentResults.length) {
    problems.push(`${race.name}: 区間数が違う ${results.segmentResults.length} → ${back.segmentResults.length}`)
  }
  for (let i = 0; i < results.segmentResults.length; i++) {
    const a = results.segmentResults[i], b = back.segmentResults[i]
    if (a.segmentIndex !== b.segmentIndex) problems.push(`${race.name} 第${i + 1}区: 区間番号が違う`)
    if (a.runners.length !== b.runners.length) problems.push(`${race.name} 第${i + 1}区: 走者数が違う`)
    for (let j = 0; j < a.runners.length; j++) {
      const x = a.runners[j], y = b.runners[j]
      if (!y) { problems.push(`${race.name} 第${i + 1}区: 走者が足りない`); break }
      if (x.playerId !== y.playerId) problems.push(`${race.name} 第${i + 1}区${j + 1}位: 選手が違う`)
      if (x.teamId !== y.teamId) problems.push(`${race.name} 第${i + 1}区${j + 1}位: クラブが違う`)
      if (x.rank !== y.rank) problems.push(`${race.name} 第${i + 1}区${j + 1}位: 区間内順位が違う ${x.rank} → ${y.rank}`)
      // タイムは1/100秒まで持つ。差は5ミリ秒以内
      if (Math.abs(x.timeSec - y.timeSec) > 0.005) {
        problems.push(`${race.name} 第${i + 1}区${j + 1}位: タイムが違う ${x.timeSec} → ${y.timeSec}`)
      }
      checked++
    }
  }

  // チーム順位・順位ポイント・区間賞ポイント（保存せず作り直しているぶん）
  if (back.teamRankings.length !== results.teamRankings.length) {
    problems.push(`${race.name}: 出走クラブ数が違う ${results.teamRankings.length} → ${back.teamRankings.length}`)
  }
  for (let i = 0; i < results.teamRankings.length; i++) {
    const a = results.teamRankings[i], b = back.teamRankings[i]
    if (!b) { problems.push(`${race.name}: チーム順位が足りない`); break }
    if (a.teamId !== b.teamId) problems.push(`${race.name} ${i + 1}位: クラブが違う ${a.teamId} → ${b.teamId}`)
    if (a.rank !== b.rank) problems.push(`${race.name} ${a.teamId}: 順位が違う ${a.rank} → ${b.rank}`)
    if (a.positionPoints !== b.positionPoints) problems.push(`${race.name} ${a.teamId}: 順位ポイントが違う ${a.positionPoints} → ${b.positionPoints}`)
    if (a.segmentPoints !== b.segmentPoints) problems.push(`${race.name} ${a.teamId}: 区間賞ポイントが違う ${a.segmentPoints} → ${b.segmentPoints}`)
    if (Math.abs(a.totalTimeSec - b.totalTimeSec) > 0.1) {
      problems.push(`${race.name} ${a.teamId}: 合計タイムが違う ${a.totalTimeSec} → ${b.totalTimeSec}`)
    }
  }
}

// 大きさの比較
const tpl = LEAGUE_COURSE_POOL[0]
const race: Race = {
  id: 'size', name: tpl.name, date: '2028-04-01', location: tpl.location ?? '',
  type: 'league', segments: tpl.segments, conditions: { temperature: 18, weather: 'sunny', elevation: 0 },
}
const lineups: Record<string, Record<number, string>> = {}
for (const t of teams) {
  const roster = players.filter(p => p.teamId === t.id).slice(0, race.segments.length)
  lineups[t.id] = Object.fromEntries(race.segments.map((seg, i) => [seg.index, roster[i]?.id]).filter(([, id]) => id))
}
const res = simulateRace(race, lineups, teams, players, 1)
const rawLen = JSON.stringify(res).length
const packedLen = JSON.stringify(packRaceResults({ ...race, results: res })).length

console.log(`確かめた走者\u3000\u3000 ${checked}人ぶん（${LEAGUE_COURSE_POOL.slice(0, 6).length}レース）`)
console.log(`1レースの大きさ  そのまま ${rawLen}バイト → 詰めると ${packedLen}バイト（${Math.round((1 - packedLen / rawLen) * 100)}%減）`)
console.log('')
if (problems.length === 0) {
  console.log('✓ 詰めて戻しても中身は変わらない（順位・順位ポイント・区間賞も作り直しで一致）')
  process.exit(0)
}
console.log(`✗ ${problems.length}件の食い違い`)
for (const p of problems.slice(0, 20)) console.log(`  ${p}`)
process.exit(1)
