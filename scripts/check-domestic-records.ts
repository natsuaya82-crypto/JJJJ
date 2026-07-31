/**
 * 記録室の「国内限定ランキング」が海外クラブの選手を混ぜていないかを確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-domestic-records.ts
 *
 * 直したのは、引退すると player.teamId が '' になるため
 *   「海外クラブで現役を終えた選手が、通算区間賞・通算MVP・記録会の歴代トップ10に混ざる」
 * という不具合。引退時の所属を retiredTeamId に控え、旧セーブは過去シーズンから推定して埋める。
 */
import { makeIsDomestic, retiredFromOf } from '../src/utils/domesticPlayers'
import { backfillRetiredTeamIds } from '../src/utils/retiredTeamBackfill'
import type { ForeignLeague, Player, Team } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const teams = [{ id: 't1' }, { id: 't2' }] as unknown as Team[]
const leagues = [
  { id: 'kor', clubs: [{ id: 'kor_1' }, { id: 'kor_2' }] },
  { id: 'ken', clubs: [{ id: 'ken_1' }] },
] as unknown as ForeignLeague[]

const P = (id: string, o: Partial<Player> = {}) => ({ id, name: id, teamId: '', status: 'active', ...o }) as unknown as Player

console.log('\n[1] 現役選手の判定（今までと同じであること）')
const isDomestic = makeIsDomestic(teams, leagues)
check('国内チームの現役選手は国内', isDomestic(P('a', { teamId: 't1' })))
check('海外クラブの現役選手は国内でない', !isDomestic(P('b', { teamId: 'kor_1' })))
check('FA（無所属）の現役選手は国内扱い', isDomestic(P('c', { teamId: '' })))
check('ドラフト候補（__pool__）は国内でない＝記録に出さない',
  !isDomestic(P('pool', { teamId: '__pool__' })))

console.log('\n[2] 引退選手の判定')
check('国内で引退した選手は国内', isDomestic(P('d', { teamId: '', status: 'retired', retiredTeamId: 't1' })))
check('海外クラブで引退した選手は国内でない', !isDomestic(P('e', { teamId: '', status: 'retired', retiredTeamId: 'ken_1' })))
check('旧セーブ（引退時の所属が不明）は今まで通り国内扱い',
  isDomestic(P('f', { teamId: '', status: 'retired' })))
check('もう存在しない古い海外クラブIDでも国内には入れない',
  !isDomestic(P('g', { teamId: '', status: 'retired', retiredTeamId: 'seoul_hangang' })))
check('海外リーグのデータが無くても落ちない', makeIsDomestic(teams, undefined)(P('h', { teamId: 't1' })))

console.log('\n[3] 引退時の所属の控え方')
check('通常は今の所属', retiredFromOf(P('i', { teamId: 't2' })) === 't2')
check('海外へレンタル中に引退したら保有元（国内）を控える',
  retiredFromOf(P('j', { teamId: 'ken_1', loan: { ownerTeamId: 't1', untilYear: 2050 } } as Partial<Player>)) === 't1')
check('すでに入っていれば上書きしない',
  retiredFromOf(P('k', { teamId: 't2', retiredTeamId: 'kor_1' })) === 'kor_1')
check('無所属なら未設定のまま', retiredFromOf(P('l', { teamId: '' })) === undefined)
check('レンタル中に引退しても国内ランキングに残る',
  isDomestic(P('m', { teamId: '', status: 'retired', retiredTeamId: retiredFromOf(P('m', { teamId: 'ken_1', loan: { ownerTeamId: 't1', untilYear: 2050 } } as Partial<Player>)) })))

console.log('\n[4] 旧セーブの穴埋め')
const race = (pid: string) => ({ id: 'r', results: { segmentResults: [{ runners: [{ playerId: pid, rank: 1 }] }] } })
const past = [
  { year: 2044, races: [race('dom'), race('back')], secondTeamRaces: [], foreignAppsC: {} },
  { year: 2045, races: [race('dom')], secondTeamRaces: [], foreignAppsC: { kor_1: { away: [10, 2, 20, 10] }, ken_1: { back: [5, 0, 0, 0] } } },
  { year: 2046, races: [race('dom')], secondTeamRaces: [race('back')], foreignAppsC: { kor_1: { away: [0, 0, 0, 0] } } },
]
const before = [
  P('away', { status: 'retired' }),   // 海外で引退した
  P('back', { status: 'retired' }),   // 海外に行ったが国内に戻って引退した（リザーブ戦で復帰）
  P('dom', { status: 'retired' }),    // ずっと国内
  P('act', { status: 'active', teamId: 'kor_1' }), // 現役（対象外）
  P('kept', { status: 'retired', retiredTeamId: 't9' }), // すでに入っている（上書きしない）
]
const after = backfillRetiredTeamIds(before, past) as Player[]
const byId = (id: string) => after.find(p => p.id === id)!
check('海外で引退した選手に所属が入る', byId('away').retiredTeamId === 'kor_1')
check('国内に戻ってから引退した選手には入れない（リザーブ戦の出走も国内として数える）',
  byId('back').retiredTeamId === undefined)
check('ずっと国内の選手には入れない', byId('dom').retiredTeamId === undefined)
check('現役の選手は触らない', byId('act').retiredTeamId === undefined)
check('すでに入っている選手は上書きしない', byId('kept').retiredTeamId === 't9')
check('元のデータを書き換えていない', before[0].retiredTeamId === undefined)

console.log('\n[5] 穴埋めの結果が判定に効く')
check('穴埋め後、海外で引退した選手は国内ランキングから外れる', !isDomestic(byId('away')))
check('　国内に戻って引退した選手は残る', isDomestic(byId('back')))
check('　ずっと国内の選手は残る', isDomestic(byId('dom')))

console.log('\n[6] 壊れた入力でも落ちない')
check('選手が配列でない', backfillRetiredTeamIds(null, past) === null)
check('過去シーズンが配列でない', backfillRetiredTeamIds(before, undefined) === before)
check('引退選手が居なければ元の配列をそのまま返す',
  backfillRetiredTeamIds([P('x', { status: 'active' })], past).constructor === Array)
check('年が欠けた過去シーズンを混ぜても落ちない',
  Array.isArray(backfillRetiredTeamIds(before, [...past, { races: null, foreignAppsC: null }])))
check('旧形式（foreignAppearances）からも拾える',
  (backfillRetiredTeamIds([P('old', { status: 'retired' })],
    [{ year: 2040, races: [], foreignAppearances: { old: { clubId: 'ken_1', races: 3, wins: 0 } } }]) as Player[])[0].retiredTeamId === 'ken_1')
check('2回流しても結果が変わらない（冪等）',
  JSON.stringify(backfillRetiredTeamIds(after, past)) === JSON.stringify(after))

console.log(`\n${failed === 0 ? '全部OK' : `${failed}件 失敗`}\n`)
process.exit(failed === 0 ? 0 : 1)
