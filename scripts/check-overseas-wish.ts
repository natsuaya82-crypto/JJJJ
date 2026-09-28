/**
 * 【海外挑戦の直訴は、自チームがもう憧れの地域にいるなら出ない】
 *
 * オーナー・2026-09-28「直します」。以前は自チームがヨーロッパのリーグのクラブでも、
 * スピード系の選手が「ヨーロッパでやりたい」と言い出していた。
 * 戻し方：engine/playerWishes の `dreamRegionOf(p.specialty) !== myRegion` を消す
 */
import { generatePlayerWishes } from '../src/engine/playerWishes'
import { dreamRegionOf } from '../src/utils/transferDecision'
import type { Player, Season, WorldClub } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const club = (id: string, leagueId: string, country: string) =>
  ({ id, leagueId, country, name: id, shortName: id }) as unknown as WorldClub
const clubs = [club('eu', 'europe_ws', 'ESP'), club('jp', 'jpel-1', 'JPN')]
const player = (teamId: string) => ({
  id: `p-${teamId}`, name: 'x', teamId, status: 'active', age: 25, specialty: 'sprinter',
  ratings: { speed: 90, stamina: 90, mountainUp: 90, mountainDown: 90, pacing: 90, mental: 90, recovery: 90 },
  contract: { annualSalary: 1e10, yearsLeft: 3 }, morale: 70, fatigue: 0,
  career: { totalRaces: 0, segmentWins: 0 },
}) as unknown as Player
const season = { year: YEAR, currentRaceIndex: 0, leagues: {} } as unknown as Season

console.log('[1] 自チームが憧れの地域のリーグにいるなら、海外挑戦を言い出さない')
check('スピード系の憧れはヨーロッパ（前提）', dreamRegionOf('sprinter') === 'europe')
const run = (teamId: string) => generatePlayerWishes({
  players: [player(teamId)], currentSeason: season, myStandings: [], playerTeamId: teamId,
  races: [], clubs, worldRepresentatives: [], rng: () => 0,
}).overseasRequests.length
check('日本のクラブの選手は言い出す（空振りしていない）', run('jp') === 1, `${run('jp')}件`)
check('ヨーロッパのクラブの選手は言い出さない', run('eu') === 0, `${run('eu')}件`)

console.log('')
if (failed > 0) { console.log(`✗ ${failed}件`); process.exit(1) }
console.log('✓ 海外挑戦の直訴は、憧れの地域の外にいる選手だけ')
