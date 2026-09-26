/**
 * 【選手の国籍の配り方】オーナー・2026-09-26
 *   「国の格を決めない？クラブと同じような感じで」「クラブの格は変えずに代表のバランス調整したい。
 *    ケニアとインドが同レベルのガチャはおかしい」「日本だけクラブの格そのままで行こう」「3めいこう」
 *
 *   1本にしたもの：どのクラブの席でも、国籍は「席の強さ（ランク）」から国の格で引く（utils/nationTier の
 *   drawNationalityForRank）。席の強さはクラブの格のまま＝クラブの強さは変わらない。
 *   分けたもの（オーナーの1点）：日本の部のクラブは日本人中心で外国籍5〜6人（rosterNationality='home'）。
 *
 *   ① 国の格ごとのランクの出方が格の順に並んでいる
 *   ② 海外クラブの初期ロスター：国の格が高いほど代表20人が強い（ケニア≠インド）・クラブの所在国と切り離す・どの国も代表20人をそろえられる
 *   ③ クラブの強さは格のまま（クラブの格の帯ごとの走る7人が格の順）
 *   ④ 日本のクラブは日本人中心で外国籍5〜6人（CPU・自チームとも）。外国籍は国の候補から引く
 *   ⑤ あとから入る選手（開幕の床）も同じ決まり
 *   ⑥ 国籍を引く口が1本（drawNationalityForRank）で、古い人数表が戻っていない
 */
import { existsSync, readFileSync } from 'node:fs'
import { HOME_FOREIGN_RANGE, nationTierOf, rankShareOf, worldNations } from '../src/utils/nationTier'
import { fillRostersForSeason, generateCpuRosters, generateForeignLeaguePlayers, generatePlayerInitialRoster } from '../src/engine/playerGenerator'
import { INITIAL_FOREIGN_CLUBS } from '../src/data/leagues'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { tierOfClubId } from '../src/utils/clubTier'
import { ovr } from '../src/utils/playerUtils'
import type { Player, Rank, WorldClub } from '../src/types'

let seed = 20260926
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)

const TIERS = [1, 2, 3, 4, 5] as const

console.log('\n[1] 国の格ごとのランクの出方')
{
  const RANKS: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']
  const center = TIERS.map(t => RANKS.reduce((a, r, i) => a + i * rankShareOf(t, r), 0))
  check('格が高い国ほど強い席に座る（中心が格の順）', center.every((c, i) => i === 0 || c < center[i - 1]), center.map(c => c.toFixed(2)).join(' > '))
  check('どの格も割合の合計が1', TIERS.every(t => Math.abs(RANKS.reduce((a, r) => a + rankShareOf(t, r), 0) - 1) < 1e-9))
  check('日本は国の候補に入っていない（日本はクラブの格のまま）', !worldNations().includes('JPN'))
}

// 世界を1つ作る（日本52＋海外180）
const jpTeams = [...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as WorldClub[]
const foreign = generateForeignLeaguePlayers(INITIAL_FOREIGN_CLUBS, 2027).players
const jp = generateCpuRosters(jpTeams as never, 2027).cpuPlayers
const world = [...foreign, ...jp]

console.log('\n[2] 海外クラブの初期ロスター＝国の格で代表が強くなる')
{
  const byNat = new Map<string, Player[]>()
  for (const p of world) if (p.nationality !== 'JPN') byNat.set(p.nationality, [...(byNat.get(p.nationality) ?? []), p])
  const top20 = (ps: Player[]) => mean(ps.map(ovr).sort((a, b) => b - a).slice(0, 20))
  const tierAvg = TIERS.map(t => mean([...byNat.entries()].filter(([n]) => nationTierOf(n) === t).map(([, ps]) => top20(ps))))
  check('代表20人の平均が国の格の順', tierAvg.every((a, i) => i === 0 || a < tierAvg[i - 1]), tierAvg.map(a => a.toFixed(1)).join(' > '))
  check('格1の国と格5の国の代表に差がある（8以上）', tierAvg[0] - tierAvg[4] >= 8, `${(tierAvg[0] - tierAvg[4]).toFixed(1)}`)
  const counts = worldNations().map(n => byNat.get(n)?.length ?? 0)
  // 人数は国の格で自然に決まる（最低人数は決めない・オーナー・2026-09-26「2でいい」）。代表20人（autoSelectEkiden）はそろうこと
  check('どの国も代表20人をそろえられる', Math.min(...counts) >= 20, `${Math.min(...counts)}`)
  const homeShare = foreign.filter(p => INITIAL_FOREIGN_CLUBS.find(c => c.id === p.teamId)?.country === p.nationality).length / foreign.length
  check('クラブの所在国に固定していない（自国の選手は少数）', homeShare < 0.3, `${(homeShare * 100).toFixed(0)}%`)
}

console.log('\n[3] クラブの強さは格のまま')
{
  const bands = [[1, 4], [5, 8], [9, 12], [13, 16], [17, 20]]
  const top7 = bands.map(([lo, hi]) => mean(INITIAL_FOREIGN_CLUBS
    .filter(c => { const t = tierOfClubId(c.id); return t >= lo && t <= hi })
    .map(c => mean(foreign.filter(p => p.teamId === c.id).map(ovr).sort((a, b) => b - a).slice(0, 7)))))
  check('クラブの格の帯ごとの走る7人が格の順', top7.every((a, i) => i === 0 || a < top7[i - 1]), top7.map(a => a.toFixed(1)).join(' > '))
  const gen = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  check('能力値は国籍を見ていない（buildRatingsForRank に国籍を渡していない）', !/buildRatingsForRank\(\{[^}]*\bnat/.test(gen))
}

console.log('\n[4] 日本のクラブは日本人中心・外国籍5〜6人')
{
  const per = new Map<string, number>()
  for (const p of jp) if (p.nationality !== 'JPN') per.set(p.teamId, (per.get(p.teamId) ?? 0) + 1)
  const ns = jpTeams.map(t => per.get(t.id) ?? 0)
  check(`CPU：どのクラブも外国籍 ${HOME_FOREIGN_RANGE[0]}〜${HOME_FOREIGN_RANGE[1]} 人`,
    ns.every(n => n >= HOME_FOREIGN_RANGE[0] && n <= HOME_FOREIGN_RANGE[1]), `${Math.min(...ns)}〜${Math.max(...ns)}`)
  const mine = generatePlayerInitialRoster(2027, 20).players
  const mf = mine.filter(p => p.nationality !== 'JPN').length
  check(`自チーム：外国籍 ${HOME_FOREIGN_RANGE[0]}〜${HOME_FOREIGN_RANGE[1]} 人`, mf >= HOME_FOREIGN_RANGE[0] && mf <= HOME_FOREIGN_RANGE[1], `${mf}`)
  const cand = new Set<string>(worldNations())
  const bad = [...new Set(jp.filter(p => p.nationality !== 'JPN').map(p => p.nationality))].filter(n => !cand.has(n))
  check('外国籍は国の候補から引いている', bad.length === 0, bad.join(','))
}

console.log('\n[5] あとから入る選手（開幕の床）も同じ決まり')
{
  const clubs = [...jpTeams, ...INITIAL_FOREIGN_CLUBS] as WorldClub[]
  const added = fillRostersForSeason(clubs, 2027, [])
  const jpIds = new Set(jpTeams.map(t => t.id))
  const a = added.filter(p => jpIds.has(p.teamId))
  const f = added.filter(p => !jpIds.has(p.teamId))
  const jpShare = a.filter(p => p.nationality !== 'JPN').length / Math.max(1, a.length)
  check('日本のクラブ：日本人中心（外国籍はおよそ2割）', jpShare > 0.12 && jpShare < 0.32, `${(jpShare * 100).toFixed(0)}%`)
  const foHome = f.filter(p => INITIAL_FOREIGN_CLUBS.find(c => c.id === p.teamId)?.country === p.nationality).length / Math.max(1, f.length)
  check('海外クラブ：所在国に固定していない', foHome < 0.3, `${(foHome * 100).toFixed(0)}%`)
  const strong = f.filter(p => ovr(p) >= mean(f.map(ovr)))
  const share = (ps: Player[], t: number) => ps.filter(p => nationTierOf(p.nationality) === t).length / Math.max(1, ps.length)
  check('海外クラブ：強い席ほど格1の国が多い', share(strong, 1) > share(f, 1), `${(share(strong, 1) * 100).toFixed(1)}% / ${(share(f, 1) * 100).toFixed(1)}%`)
  check('空振りしていない（選手が入った）', a.length > 0 && f.length > 0, `${a.length} / ${f.length}`)
}

console.log('\n[6] 国籍を引く口は1本')
{
  const gen = readFileSync('src/engine/playerGenerator.ts', 'utf8')
  // 海外の初期ロスター・日本のクラブの外国籍の席・自チームの外国籍の席・あとから入る選手（'world' と 'home'）の5つ
  check('drawNationalityForRank を通る口が5つ', (gen.match(/drawNationalityForRank\(/g) ?? []).length === 5, `${(gen.match(/drawNationalityForRank\(/g) ?? []).length}`)
  check('古い人数表が戻っていない', !existsSync('src/data/nationTalent.ts') && !existsSync('src/utils/nationTalent.ts') && !/nationTalent|buildNationalityBag/.test(gen))
  check('外国籍の枠を「2人まで・55%」で決めていない', !/teamForeignCount < 2|Math\.random\(\) < 0\.55/.test(gen))
}

console.log('')
if (failed > 0) { console.log(`✗ 国籍の配り方が決まりと違います（${failed}件）`); process.exit(1) }
console.log('✓ 国籍は席の強さから国の格で引き、日本のクラブは日本人中心で外国籍5〜6人')
