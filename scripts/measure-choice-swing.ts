/**
 * **駅伝中の選択肢の「効き幅」が、レースの中でどれくらいの大きさなのか**を数える。
 *   npx esbuild --bundle --platform=node --format=esm scripts/measure-choice-swing.ts --outfile=/tmp/mcs.mjs && node /tmp/mcs.mjs
 *
 * 効き幅（`EVENT_SCALE` × `CHOICE_EFFECTS`）は**区間タイムに対する割合**なので、
 * 秒に直さないと大きいのか小さいのか分からない。ここでは1部の20チームで10レース走らせて
 *
 *   ・区間タイムの分布（＝割合を秒に直すための物差し）
 *   ・チーム同士の総合タイムの差（1位と2位・隣り合う順位）
 *
 * を出し、そのうえで「攻める」の振れ幅を並べる。**順位の差より振れ幅が大きければ、
 * 選択肢1回でレースが決まる**ということ。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { generateSeasonRaces } from '../src/data/races'
import { runBackgroundRace } from '../src/engine/backgroundRace'
import { EVENT_SCALE, CHOICE_EFFECTS } from '../src/engine/interactiveRace'
import type { Team, Player } from '../src/types'

const YEAR = 2030
const teams = INITIAL_TEAMS.slice(0, 20) as Team[]
const { cpuPlayers } = generateCpuRosters(teams, YEAR)
const players: Player[] = cpuPlayers
const races = generateSeasonRaces(YEAR)

const segTimes: number[] = []
const gaps1to2: number[] = []
const gapsAdjacent: number[] = []
const totalTimes: number[] = []

for (const race of races) {
  const out = runBackgroundRace({
    race,
    entrants: teams.map(t => ({ id: t.id, roster: players.filter(p => p.teamId === t.id && p.status === 'active') })),
    players, teams, seasonProgress: 0.5,
  })
  const res = out.race.results!
  for (const sr of res.segmentResults) for (const r of sr.runners) if (r.timeSec > 0) segTimes.push(r.timeSec)
  const tt = [...res.teamRankings].sort((a, b) => a.totalTimeSec - b.totalTimeSec)
  for (const t of tt) totalTimes.push(t.totalTimeSec)
  if (tt.length >= 2) gaps1to2.push(tt[1].totalTimeSec - tt[0].totalTimeSec)
  for (let i = 1; i < tt.length; i++) gapsAdjacent.push(tt[i].totalTimeSec - tt[i - 1].totalTimeSec)
}

const q = (a: number[], p: number) => {
  const s = [...a].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}
const fmt = (s: number) => `${Math.floor(s / 60)}分${String(Math.round(s % 60)).padStart(2, '0')}秒`

console.log(`■ 区間タイム（10レース × 20チーム × 各区間 = ${segTimes.length}本）`)
console.log(`   最短 ${fmt(q(segTimes, 0))} / 中央 ${fmt(q(segTimes, 0.5))} / 最長 ${fmt(q(segTimes, 0.99))}`)

console.log(`\n■ チームの総合タイム  中央 ${fmt(q(totalTimes, 0.5))}`)
console.log(`   1位と2位の差   最小 ${q(gaps1to2, 0).toFixed(0)}秒 / 中央 ${q(gaps1to2, 0.5).toFixed(0)}秒 / 最大 ${q(gaps1to2, 0.99).toFixed(0)}秒`)
console.log(`   隣の順位との差 4分の1が ${q(gapsAdjacent, 0.25).toFixed(0)}秒以下 / 中央 ${q(gapsAdjacent, 0.5).toFixed(0)}秒`)

const agg = CHOICE_EFFECTS[0]
const mid = q(segTimes, 0.5), long = q(segTimes, 0.99)
console.log(`\n■ 「攻める」の振れ幅（成功 ${(agg.timeBonusSuccess * 100).toFixed(2)}% / 失敗 +${(agg.timeBonusFail * 100).toFixed(2)}%）`)
console.log(`   場面              倍率   中央の区間(${fmt(mid)})      長い区間(${fmt(long)})`)
for (const [id, sc] of Object.entries(EVENT_SCALE).sort((a, b) => a[1] - b[1])) {
  const a = mid * Math.abs(agg.timeBonusSuccess) * sc
  const b = long * Math.abs(agg.timeBonusSuccess) * sc
  console.log(`   ${id.padEnd(18)}${sc.toFixed(1)}   ±${a.toFixed(0)}秒 (成否の差${(a * 2).toFixed(0)}秒)   ±${b.toFixed(0)}秒 (成否の差${(b * 2).toFixed(0)}秒)`)
}

const perRace = races[0].segments.length
const avgScale = Object.values(EVENT_SCALE).reduce((s, v) => s + v, 0) / Object.values(EVENT_SCALE).length
const raceTime = q(totalTimes, 0.5)
console.log(`\n■ 1レース（${perRace}区間）ぶんを足すと`)
const luck = raceTime * Math.abs(agg.timeBonusSuccess) * avgScale * 2
console.log(`   全部「攻める」で成功しきり と 失敗しきり の差 … 約${luck.toFixed(0)}秒（${(luck / 60).toFixed(1)}分）`)
console.log(`   ＝1位と2位の差の中央値 ${q(gaps1to2, 0.5).toFixed(0)}秒 の ${(luck / q(gaps1to2, 0.5)).toFixed(1)}倍`)

// ── 運（ぶれ）と腕（EVの差）を分けて見る ──
// ぶれ = 同じ肢を押し続けたときのばらつき。腕 = いちばん良い肢と悪い肢の期待値の差。
console.log(`\n■ 「運のぶれ」と「腕の差」を分ける（1レース ${perRace}区間ぶん・成功率別）`)
console.log(`   成功率   攻めの期待値   標準の期待値   温存の期待値   最良−最悪   攻めのぶれ(±1σ)`)
for (const p of [0.4, 0.5, 0.6, 0.7, 0.8]) {
  const ev = (e: typeof agg) => (p * e.timeBonusSuccess + (1 - p) * e.timeBonusFail) * avgScale * raceTime
  const evs = CHOICE_EFFECTS.map(ev)
  const sd = Math.sqrt(perRace * p * (1 - p)) *
    (Math.abs(agg.timeBonusSuccess) + Math.abs(agg.timeBonusFail)) * avgScale * (raceTime / perRace)
  console.log(`   ${(p * 100).toFixed(0)}%      ${evs[0].toFixed(0).padStart(5)}秒        ${evs[1].toFixed(0).padStart(5)}秒        ${evs[2].toFixed(0).padStart(5)}秒        ${(Math.max(...evs) - Math.min(...evs)).toFixed(0).padStart(4)}秒        ±${sd.toFixed(0)}秒`)
}
console.log(`   （マイナス＝速い。「腕の差」は毎回いちばん良い肢を選べる人と、いちばん悪い肢を選ぶ人の差）`)
