/**
 * 「必要だから動く」（`utils/squadNeeds` の `needsPlayer`）が、関門として効いているかを確かめる。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-demand-gates.ts --outfile=/tmp/cdg.cjs && node /tmp/cdg.cjs
 *
 * 世界の232クラブ（日本のリーグ52＋海外180を1つの並びで）に、OVRの違う選手を1人ずつ当て、
 * 「その選手を必要とするクラブ」を数える。
 *   ・誰も欲しがらない … 関門が閉じている
 *   ・全クラブが欲しがる … 関門が素通り（需要を見ていないのと同じ）
 *   ・強い選手ほど欲しがるクラブが多い … 需要が強さを見ている
 * 国内か海外かで別に数えないこと（クラブが選手を獲る理由は、どのリーグでも同じ）。
 */
import { INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { ovr } from '../src/utils/playerUtils'
import { needsPlayer } from '../src/utils/squadNeeds'
import { playersByClub } from '../src/utils/rosterSync'
import type { Player, WorldClub } from '../src/types'

let ng = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) ng++
}

const jpel = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS]
const clubs: WorldClub[] = [...jpel, ...INITIAL_FOREIGN_CLUBS] as WorldClub[]
const players: Player[] = [
  ...generateCpuRosters(jpel, 2027).cpuPlayers,
  ...generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, 2027).players,
]
const byClub = playersByClub(players)
const rosterOf = (id: string) => (byClub.get(id) ?? []).filter(p => p.status === 'active')

// OVRごとに1人（33歳以下）。同じ選手を全クラブに当てる
const byOvr = new Map<number, Player>()
for (const p of players) {
  if (p.status !== 'active' || p.age > 33) continue
  if (!byOvr.has(ovr(p))) byOvr.set(ovr(p), p)
}

console.log(`その選手を「必要」とするクラブ（全${clubs.length}クラブ）`)
const counts: { o: number; n: number }[] = []
for (const o of [70, 74, 77, 80, 85, 90]) {
  const p = byOvr.get(o)
  if (!p) continue
  const n = clubs.filter(c => needsPlayer(rosterOf(c.id), p)).length
  counts.push({ o, n })
  console.log(`  OVR${o}  ${String(n).padStart(3)} (${Math.round(n / clubs.length * 100)}%)`)
}
check('OVRの見本が揃っている', counts.length >= 5, counts.map(c => c.o).join('/'))
check('どの選手も、どこかのクラブは欲しがる（関門が閉じていない）', counts.every(c => c.n > 0))
check('どの選手も、全クラブが欲しがりはしない（関門が素通りでない）', counts.every(c => c.n < clubs.length))
const lo = counts[0], hi = counts[counts.length - 1]
check('強い選手ほど欲しがるクラブが多い', !!lo && !!hi && hi.n > lo.n, `OVR${lo?.o} ${lo?.n} → OVR${hi?.o} ${hi?.n}`)

if (ng > 0) { console.log(`\n✗ ${ng}件 NG`); process.exit(1) }
console.log('\n✓ 「必要だから動く」は関門として効いている')
