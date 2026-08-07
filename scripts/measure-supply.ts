/**
 * 「1年で何人が出場機会を求めて市場に出るか」を測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-supply.ts --outfile=/tmp/ms.cjs && node /tmp/ms.cjs
 *
 * 見たいこと：
 *   ・序列だけで決めていたころは、30人ロスターの下半分がまるごと出ていた
 *     （1クラブ23人＝市場が壊れる）。それがどこまで絞れたか
 *   ・出る人が0になっていないか（絞りすぎ）
 *   ・どの部から出るか。1部の控えが動かないと「1部下位・2部へ流れる」が起きない
 *
 * 出走の分布は本編の実測ではなく近似：走れるのは上位7人（RUNNING_SLOTS）で、
 * 故障・起用の入れ替えで序列8〜14番手にもたまに回る、という形で出走数を作る。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { comparePlayers } from '../src/utils/playerSort'
import { divisionOf, DIVISION_RACES, DIVISION_LABEL } from '../src/utils/league'
import { hasNoPlayingTime, seeksPlayingTime, RUNNING_SLOTS } from '../src/utils/transferDecision'
import type { Division, Player, Team } from '../src/types'

const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const players = generateCpuRosters(teams, 2027).cpuPlayers as Player[]

const byTeam = new Map<string, Player[]>()
for (const p of players) {
  if (p.status !== 'active') continue
  const a = byTeam.get(p.teamId) ?? []
  a.push(p)
  byTeam.set(p.teamId, a)
}

/** 序列 → その年の出走数（近似）。上位7人はほぼ皆勤、8〜14は半分以下、15以降はほぼ出ない */
function racesFor(rank: number, teamRaces: number, rnd: () => number): number {
  if (rank <= RUNNING_SLOTS) return Math.round(teamRaces * (0.85 + rnd() * 0.15))
  if (rank <= RUNNING_SLOTS * 2) return Math.round(teamRaces * rnd() * 0.5)
  return Math.round(teamRaces * rnd() * 0.12)
}

// 乱数は固定シードにして毎回同じ結果が出るようにする
let seed = 20270301
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }

type Row = { div: Division; rankOnly: number; withRate: number; roster: number }
const rows: Row[] = []

for (const t of teams) {
  const roster = (byTeam.get(t.id) ?? []).sort(comparePlayers('ovr'))
  if (roster.length === 0) continue
  const div = divisionOf(t)
  const teamRaces = DIVISION_RACES[div]
  let rankOnly = 0
  let withRate = 0
  roster.forEach((p, i) => {
    const rank = i + 1
    // 旧：序列だけ
    if (hasNoPlayingTime(rank)) rankOnly++
    // 新：序列 × 実際の出走率 × 年齢
    const races = racesFor(rank, teamRaces, rnd)
    // 前季は「1つ上の序列だった」と仮定して作る（去年スタメン→今年落ちた、が混ざる形）
    const prevRank = Math.max(1, rank - 3 + Math.floor(rnd() * 6))
    const prevRaces = racesFor(prevRank, teamRaces, rnd)
    if (seeksPlayingTime({ squadRank: rank, age: p.age, races, teamRaces, prevRaces, prevTeamRaces: teamRaces })) withRate++
  })
  rows.push({ div, rankOnly, withRate, roster: roster.length })
}

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0)
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }

console.log('■ 1クラブあたり何人が市場に出るか（52クラブ）')
console.log('')
console.log('部     クラブ数  平均在籍   序列だけ(旧)      出走率も見る(新)')
for (const d of [1, 2, 3] as Division[]) {
  const r = rows.filter(x => x.div === d)
  const f = (n: number) => n.toFixed(1).padStart(5)
  console.log(
    `${DIVISION_LABEL[d]}       ${String(r.length).padStart(2)}     ${f(sum(r.map(x => x.roster)) / r.length)}`
    + `      ${f(sum(r.map(x => x.rankOnly)) / r.length)}人 (中央値${med(r.map(x => x.rankOnly))})`
    + `   ${f(sum(r.map(x => x.withRate)) / r.length)}人 (中央値${med(r.map(x => x.withRate))})`,
  )
}
console.log('')
console.log(`全体   ${rows.length}     ${(sum(rows.map(x => x.roster)) / rows.length).toFixed(1)}`
  + `      合計${sum(rows.map(x => x.rankOnly))}人           合計${sum(rows.map(x => x.withRate))}人`)
console.log('')

// 出る人の顔ぶれ（年齢とOVRの分布）
const out: Player[] = []
for (const t of teams) {
  const roster = (byTeam.get(t.id) ?? []).sort(comparePlayers('ovr'))
  const teamRaces = DIVISION_RACES[divisionOf(t)]
  roster.forEach((p, i) => {
    const rank = i + 1
    const races = racesFor(rank, teamRaces, rnd)
    const prevRank = Math.max(1, rank - 3 + Math.floor(rnd() * 6))
    const prevRaces = racesFor(prevRank, teamRaces, rnd)
    if (seeksPlayingTime({ squadRank: rank, age: p.age, races, teamRaces, prevRaces, prevTeamRaces: teamRaces })) out.push(p)
  })
}
console.log('■ 市場に出た選手の顔ぶれ')
const ages = out.map(p => p.age).sort((a, b) => a - b)
const ovrs = out.map(p => ovr(p)).sort((a, b) => a - b)
console.log(`  人数     ${out.length}人`)
console.log(`  年齢     最小${ages[0]} / 中央${ages[Math.floor(ages.length / 2)]} / 最大${ages[ages.length - 1]}`)
console.log(`  OVR      最小${ovrs[0]} / 中央${ovrs[Math.floor(ovrs.length / 2)]} / 最大${ovrs[ovrs.length - 1]}`)
console.log(`  OVR75以上 ${out.filter(p => ovr(p) >= 75).length}人（2部・アジアが欲しがる層）`)
