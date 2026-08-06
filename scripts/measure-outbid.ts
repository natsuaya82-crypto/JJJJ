/**
 * 「買うときも取り合いになる」がどのくらいの頻度で効くかを測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-outbid.ts --outfile=/tmp/mo.cjs && node /tmp/mo.cjs
 *
 * 見たいこと：
 *   ・全部の入札が競り負けるなら、誰も買えなくなる（やりすぎ）
 *   ・誰も競ってこないなら、金を積む理由が生まれない（意味がない）
 *   ・「主力級だけ取り合いになる」形になっているか
 *
 * 判定に使う材料は gameStore の rivalsFor と同じ：
 *   ロスターに空き / 行き先で7区間に入れる / 本人が行く気になる(appraiseMove) / 出せる額
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { ovr, calcTransferValue } from '../src/utils/playerUtils'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import { appraiseMove, buildDestination, RUNNING_SLOTS } from '../src/utils/transferDecision'
import { bidThreshold } from '../src/data/economy'
import { POACH_PREMIUM } from '../src/data/economy'
import { ROSTER_MAX } from '../src/data/rosterRules'
import type { Player, Team } from '../src/types'

const allTeams: Team[] = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].map(t => ({
  ...t, finance: { ...t.finance, budget: tierBudget(t) },
}))
const { cpuPlayers } = generateCpuRosters(allTeams, 2027)
const players = cpuPlayers

// 自チームは1部の中位（格6あたり）とする。ここから他クラブへ入札する
const MY = allTeams.find(t => tierOf(t) === 6)!.id
const rosterCountOf = (tid: string) => players.filter(p => p.teamId === tid && p.status !== 'retired').length

const rivalsFor = (target: Player) => {
  const mv = calcTransferValue(target)
  const srcTier = tierOf(allTeams.find(t => t.id === target.teamId)!)
  return allTeams
    .filter(t => t.id !== MY && t.id !== target.teamId && rosterCountOf(t.id) < ROSTER_MAX)
    .map(t => ({ t, dest: buildDestination(t.id, tierOf(t), players, { player: target }) }))
    .filter(x => x.dest.squadRank <= RUNNING_SLOTS)
    .filter(x => appraiseMove(target, x.dest, { srcTier }).ok)
    .map(x => ({ name: x.t.shortName, willing: Math.floor(Math.min(Math.max(0, x.t.finance.budget), mv * POACH_PREMIUM)) }))
    .filter(r => r.willing > 0)
}

// 受諾ラインちょうどで入札した場合（＝最低限しか積まない買い方）
const BANDS: [string, (o: number) => boolean][] = [
  ['OVR85+ 主力級', o => o >= 85],
  ['OVR80-84   ', o => o >= 80 && o < 85],
  ['OVR75-79   ', o => o >= 75 && o < 80],
  ['OVR70-74   ', o => o >= 70 && o < 75],
  ['OVR〜69     ', o => o < 70],
]

console.log('■ 受諾ラインちょうどで入札したとき、他クラブに持っていかれる割合')
console.log('帯              人数   競合クラブ0   競り負ける   勝つのに要る額(市場価値比)')
for (const [label, hit] of BANDS) {
  const targets = players.filter(p => p.teamId !== MY && p.teamId !== '' && hit(ovr(p)))
  let noRival = 0, lost = 0
  const needRatio: number[] = []
  for (const p of targets) {
    const mv = calcTransferValue(p)
    const myFee = bidThreshold(mv, p.contract.yearsLeft <= 1, false)  // 揺れ無しのライン
    const rv = rivalsFor(p)
    const top = rv.sort((a, b) => b.willing - a.willing)[0]
    if (!top) { noRival++; continue }
    if (top.willing > myFee) { lost++; needRatio.push(top.willing / mv) }
  }
  const n = targets.length
  const pct = (v: number) => `${((v / Math.max(1, n)) * 100).toFixed(0)}%`
  const avgNeed = needRatio.length ? (needRatio.reduce((s, x) => s + x, 0) / needRatio.length).toFixed(2) : '—'
  console.log(`${label}  ${String(n).padStart(5)}   ${pct(noRival).padStart(9)}   ${pct(lost).padStart(9)}   ×${avgNeed}`)
}

console.log('\n■ 積めば勝てるか（市場価値の何倍まで出せば競り負けないか）')
{
  const stars = players.filter(p => p.teamId !== MY && p.teamId !== '' && ovr(p) >= 85)
  for (const mult of [1.0, 1.2, 1.4, 1.5, 1.8]) {
    let lost = 0
    for (const p of stars) {
      const mv = calcTransferValue(p)
      const top = rivalsFor(p).sort((a, b) => b.willing - a.willing)[0]
      if (top && top.willing > mv * mult) lost++
    }
    console.log(`  市場価値の${mult.toFixed(1)}倍を出す → OVR85+のうち ${((lost / Math.max(1, stars.length)) * 100).toFixed(0)}% で競り負ける`)
  }
}

console.log('\n■ 何クラブが取り合いに参加するか（OVR85+）')
{
  const stars = players.filter(p => p.teamId !== MY && p.teamId !== '' && ovr(p) >= 85)
  const counts = stars.map(p => rivalsFor(p).length).sort((a, b) => a - b)
  const at = (q: number) => counts[Math.floor(counts.length * q)] ?? 0
  console.log(`  中央値 ${at(0.5)}クラブ / 最小 ${counts[0] ?? 0} / 最大 ${counts[counts.length - 1] ?? 0}`)
}
