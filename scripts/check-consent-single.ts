/**
 * 「本人が行く気になるか」を、画面と実際の判定が同じものから出しているかを見る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-consent-single.ts --outfile=/tmp/ccs2.cjs && node /tmp/ccs2.cjs
 *
 * ■何が起きていたか
 *   判定の本体は utils/transferDecision の appraiseMove で、行き先（Destination）を見て決める。
 *     ・そのクラブで何番手か（走れる7区間に入るか）
 *     ・行き先が3位以内か／ECLに出ているか
 *     ・憧れの地域か
 *     ・成長の上限
 *   ところが playerConsentToMove は行き先の「格」だけを受け取り、中で
 *       buildDestination(String(destTier), destTier, [], {})
 *   と**空のロスター・空の条件**から行き先を作っていた。上の4つが全部抜けた答えになる。
 *   これを入札画面の「意欲」表示・チャットのトレード可否・ストアの6か所が使っていた。
 *   実測で 22,950通り中 9,281件（40.4%）が本物の判定と食い違っていた。
 *
 * ■いまどうなっているか
 *   playerConsentToMove の引数は Destination になったので、格だけでは呼べない。
 *   本物の行き先を渡せば appraiseMove とズレようがない、を確かめる。
 *   （唯一の違いは「主力だから残りたい」の1行。これは行き先とは別軸なので意図的に残してある）
 */
import { appraiseMove, buildDestination, CONSENT_LINE } from '../src/utils/transferDecision'
import { playerConsentToMove, isDataKeyPlayer } from '../src/utils/playerUtils'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { tierOf } from '../src/utils/clubTier'
import { playerTierOf, tierLines } from '../src/utils/playerTier'
import type { ClubTier } from '../src/utils/clubTier'
import type { Player, Team } from '../src/types'

const problems: string[] = []
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) problems.push(name)
}

const YEAR = 2030
const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const cpu = generateCpuRosters(teams, YEAR)
const players = cpu.cpuPlayers
const byTeam = new Map<string, Player[]>()
for (const p of players) {
  const l = byTeam.get(p.teamId); if (l) l.push(p); else byTeam.set(p.teamId, [p])
}

// 選手の格の線は世界から1回だけ組む（utils/playerTier）
const tierById = new Map(teams.map(t => [t.id, tierOf(t)]))
const LINES = tierLines(players, (id: string) => tierById.get(id))
const PT = (p: Player) => playerTierOf(p, LINES)

// 同じ行き先を渡したとき、窓口（playerConsentToMove）と本体（appraiseMove）の答えが一致するか。
// 「主力だから残りたい」で落ちたぶんだけは食い違ってよい（別軸なので）。
let same = 0, keyOnly = 0, bad = 0
const badEx: string[] = []
for (const p of players) {
  for (let i = 0; i < teams.length; i += 3) {
    const dest = teams[i]
    if (dest.id === p.teamId) continue
    const destTier = tierOf(dest) as ClubTier
    const srcTier = tierOf(teams.find(t => t.id === p.teamId))
    const d = buildDestination(dest.id, destTier, byTeam.get(dest.id) ?? [], { player: p })
    const real = appraiseMove(p, d, { srcTier, playFraction: 0.5, teamRaces: 0, playerTier: PT(p) })
    const shown = playerConsentToMove(p, d, srcTier, 0.5, 0, 0, false, PT(p))
    if (real.ok === shown.ok) { same++; continue }
    // 食い違うのは「主力だから残りたい」で落ちたときだけのはず
    const key = isDataKeyPlayer(p, 0.5, 0)
    if (real.ok && !shown.ok && key && real.score - 0.3 < CONSENT_LINE) { keyOnly++; continue }
    bad++
    if (badEx.length < 5) badEx.push(`${p.name} → ${dest.shortName}：窓口${shown.ok ? 'OK' : 'NG'} / 本体${real.ok ? 'OK' : 'NG'}`)
  }
}
const total = same + keyOnly + bad
console.log(`突き合わせ ${total.toLocaleString()}通り（選手${players.length}人 × 行き先${Math.ceil(teams.length / 3)}クラブ）`)
console.log('')
console.log(`  一致                         ${same.toLocaleString()}`)
console.log(`  「主力だから残りたい」で落ちた ${keyOnly.toLocaleString()}（別軸なので想定どおり）`)
console.log(`  説明のつかない食い違い        ${bad.toLocaleString()}`)
console.log('')
for (const e of badEx) console.log(`    ${e}`)
check('窓口と本体の答えが、主力ルール以外では1件も食い違わない', bad === 0, `${bad}件`)

// 格だけを渡す抜け道が塞がっているか（型で塞いであるが、値としても確かめる）
console.log('')
console.log('[抜け道が塞がっているか]')
{
  // 空のロスターから作った行き先は、本物の行き先と答えが変わる＝以前の姿
  let differ = 0
  for (const p of players.slice(0, 300)) {
    const dest = teams[5]
    const destTier = tierOf(dest) as ClubTier
    const srcTier = tierOf(teams.find(t => t.id === p.teamId))
    const fake = buildDestination(String(destTier), destTier, [], {})
    const realD = buildDestination(dest.id, destTier, byTeam.get(dest.id) ?? [], { player: p })
    if (playerConsentToMove(p, fake, srcTier, 0.5, 0, 0, false, PT(p)).ok
      !== playerConsentToMove(p, realD, srcTier, 0.5, 0, 0, false, PT(p)).ok) differ++
  }
  console.log(`  空のロスターで作った行き先と本物とでは、300人中 ${differ}人で答えが変わる`)
  check('空の行き先と本物とで答えが変わる（＝行き先を渡す意味がある）', differ > 0, '変わらないなら判定が行き先を見ていない')
}

console.log('')
if (problems.length === 0) {
  console.log('✓ 画面も店も同じ行き先・同じ判定。窓口は「主力だから残りたい」の1行を足すだけ')
  process.exit(0)
}
console.log(`✗ ${problems.length}件`)
process.exit(1)
