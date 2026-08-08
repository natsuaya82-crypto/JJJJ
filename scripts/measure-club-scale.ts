/**
 * 「クラブの規模」を格1本にした影響を測る。
 *   npx esbuild --bundle --platform=node --format=cjs scripts/measure-club-scale.ts --outfile=/tmp/mcs.cjs && node /tmp/mcs.cjs
 *
 * 前は国内だけ cpuTeamTier（ロスターの平均OVR → elite/mid/weak）という第2の物差しがあり、
 * そこからOVRの下限表が6つぶら下がっていた。それを全部
 *   ・格（tierOf / tierStrength）… どれだけ動くか・何人獲れるか
 *   ・needsPlayer / wouldMakeLineup … 誰を獲るか
 *   ・hasNoPlayingTime           … 誰が余っているか（出番が無い＝走れる人数の2倍より下）
 * に寄せた。何が変わるのかを実際の52クラブ・全選手で数える。
 */
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { generateCpuRosters } from '../src/engine/playerGenerator'
import { tierOf, tierStrength } from '../src/utils/clubTier'
import { needsPlayer, squadRankOf } from '../src/utils/squadNeeds'
import { hasNoPlayingTime } from '../src/utils/transferDecision'
import { ovr } from '../src/utils/playerUtils'
import { RUNNING_SLOTS } from '../src/data/rosterRules'
import { divisionOf } from '../src/utils/league'
import type { Team } from '../src/types'

const YEAR = 2030
const teams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[]
const { cpuPlayers } = generateCpuRosters(teams, YEAR)
const rosterOf = (id: string) => cpuPlayers.filter(p => p.teamId === id && p.status === 'active')

// ── 旧: cpuTeamTier（ロスターの平均OVR）─────────────────────
const oldScale = (id: string): 'elite' | 'mid' | 'weak' => {
  const r = rosterOf(id)
  if (r.length === 0) return 'weak'
  const avg = r.reduce((s, p) => s + ovr(p), 0) / r.length
  return avg >= 79 ? 'elite' : avg >= 73 ? 'mid' : 'weak'
}

console.log('[1] 旧「規模」と格の対応（国内52クラブ）')
{
  const byScale: Record<string, number[]> = { elite: [], mid: [], weak: [] }
  for (const t of teams) byScale[oldScale(t.id)].push(tierOf(t))
  for (const k of ['elite', 'mid', 'weak']) {
    const v = byScale[k].sort((a, b) => a - b)
    console.log(`  ${k.padEnd(5)} ${String(v.length).padStart(2)}クラブ  格 ${v.length ? `${v[0]}〜${v[v.length - 1]}` : '—'}`)
  }
  const elite = byScale.elite, mid = byScale.mid
  const overlap = elite.filter(t => mid.includes(t))
  console.log(`  → elite と mid で同じ格が ${new Set(overlap).size} 種類かぶっている（同じ格なのに獲る基準が違っていた）`)
}

console.log('')
console.log('[2] 誰を獲るか：旧のOVR下限 vs 「必要か・走れるか」')
{
  // 旧: 有料移籍の下限 minOvr - 4（elite 70 / mid 63 / weak 56）
  const oldMin = (id: string) => ({ elite: 74, mid: 67, weak: 60 }[oldScale(id)] - 4)
  const pool = [...cpuPlayers].sort((a, b) => ovr(b) - ovr(a))
  for (const target of [90, 85, 80, 75, 70, 65]) {
    const p = pool.find(x => ovr(x) <= target)
    if (!p) continue
    const oldPass = teams.filter(t => t.id !== p.teamId && ovr(p) >= oldMin(t.id))
    const newPass = teams.filter(t => t.id !== p.teamId && needsPlayer(rosterOf(t.id), p))
    const tiersNew = newPass.map(t => tierOf(t)).sort((a, b) => a - b)
    console.log(`  OVR${String(ovr(p)).padStart(2)}  旧の下限を通る ${String(oldPass.length).padStart(2)}クラブ  →  必要としている ${String(newPass.length).padStart(2)}クラブ` +
      (tiersNew.length ? `（格${tiersNew[0]}〜${tiersNew[tiersNew.length - 1]}）` : ''))
  }
}

console.log('')
console.log('[3] 誰を出すか：旧のOVR下限 vs 「出番が無い序列」')
{
  let oldTotal = 0, newTotal = 0
  const rows: string[] = []
  for (const t of teams) {
    const r = rosterOf(t.id)
    const th = { elite: 72, mid: 65, weak: 58 }[oldScale(t.id)]
    // 旧: OVR65以上 かつ 平均-5未満（在籍20人超の枝）／満了は th 未満
    const avg = r.reduce((s, p) => s + ovr(p), 0) / Math.max(1, r.length)
    const oldSpare = r.filter(p => ovr(p) >= 65 && (ovr(p) < avg - 5 || ovr(p) < th))
    const newSpare = r.filter(p => hasNoPlayingTime(squadRankOf(r, p)))
    oldTotal += oldSpare.length; newTotal += newSpare.length
    if (rows.length < 6) rows.push(`  ${t.shortName.padEnd(8)} ${divisionOf(t)}部 格${String(tierOf(t)).padStart(2)}  在籍${String(r.length).padStart(2)}  旧${String(oldSpare.length).padStart(2)}人 → 新${String(newSpare.length).padStart(2)}人`)
  }
  rows.forEach(r => console.log(r))
  console.log(`  合計  旧 ${oldTotal}人 → 新 ${newTotal}人（出番が無い＝${RUNNING_SLOTS * 2}番手より下）`)
  const zero = teams.filter(t => {
    const r = rosterOf(t.id)
    const avg = r.reduce((s, p) => s + ovr(p), 0) / Math.max(1, r.length)
    const th = { elite: 72, mid: 65, weak: 58 }[oldScale(t.id)]
    return r.filter(p => ovr(p) >= 65 && (ovr(p) < avg - 5 || ovr(p) < th)).length === 0
  })
  console.log(`  → 旧では「出せる選手が1人もいない」クラブが ${zero.length} あった（下限65を全員が下回る／上回る）`)
}

console.log('')
console.log('[4] どれだけ動くか：格から出す打診の発生率と獲得枠')
{
  console.log('  格   打診率   1オフの獲得枠')
  for (const tier of [1, 5, 8, 11, 14, 17, 20] as const) {
    const rate = 0.15 + 0.30 * tierStrength(tier)
    const cap = 2 + Math.round(2 * tierStrength(tier))
    console.log(`  ${String(tier).padStart(2)}   ${(rate * 100).toFixed(0).padStart(3)}%     ${cap}人`)
  }
  console.log('  （旧は elite 45% / mid 30% / weak 15%、枠は 4 / 3 / 2。端は同じで間が滑らかになる）')
}

console.log('')
console.log('[5] 契約更新：旧のOVR下限 vs 「出番があるか・穴か」')
{
  let oldKeep = 0, newKeep = 0, teamsAll = 0
  for (const t of teams) {
    const r = rosterOf(t.id)
    if (r.length === 0) continue
    teamsAll++
    const th = { elite: 72, mid: 65, weak: 58 }[oldScale(t.id)]
    oldKeep += r.filter(p => ovr(p) >= th).length
    newKeep += r.filter(p => !hasNoPlayingTime(squadRankOf(r, p)) || needsPlayer(r, p)).length
  }
  console.log(`  更新の対象になる人数（全${teamsAll}クラブ合計）  旧 ${oldKeep}人 → 新 ${newKeep}人`)
  console.log('  → 旧は下限がクラブの平均に連動するので、弱いクラブほど下限も下がり実質全員が通っていた')
}

console.log('')
console.log('✓ 規模の物差しは格1本。獲るのは needsPlayer / wouldMakeLineup、余りは hasNoPlayingTime')
