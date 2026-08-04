/**
 * 「リザーブ戦に出せる選手の決め方が1か所しか無い」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-reserve-squad.ts
 *
 * もとは同じ段階フィルタが CPU側(gameStore の runSecondTeamRace)と
 * プレイヤー側(ReserveLeaguePage)に別々に手書きされていて、片方だけ条件を変えると
 * 「自分は出せないのにCPUは出してくる」というズレが起きる形だった。
 * 今は utils/reserveSquad.ts の reserveSquadPool 1本だけが決める。
 */
import { reserveSquadPool, RESERVE_OVR_CAP } from '../src/utils/reserveSquad'
import { ovr } from '../src/utils/playerUtils'
import type { Player } from '../src/types'
import { readFileSync } from 'node:fs'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

// OVR だけを指定した素の選手
const P = (id: string, o: number, extra: Partial<Player> = {}) => ({
  id, name: id, age: 21, potential: 90, teamId: 't1',
  status: 'active', morale: 70, draftYear: 2020, joinedYear: 2020, specialty: 'balanced',
  ratings: { speed: o, stamina: o, mountainUp: o, mountainDown: o, pacing: o, mental: o, recovery: o },
  contract: { annualSalary: 10000000, yearsLeft: 2, faEligibleYear: 2035 },
  career: { totalRaces: 0, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ...extra,
}) as unknown as Player

const ids = (list: Player[]) => list.map(p => p.id).sort().join(',')

console.log('\n[1] 上限は80。境界はどちら側か')
{
  check('上限は80', RESERVE_OVR_CAP === 80, String(RESERVE_OVR_CAP))
  const roster = [P('ちょうど80', 80), P('81', 81), P('79', 79)]
  const pool = reserveSquadPool(roster, new Set(), 2)
  check('ちょうど80は出せる', pool.some(p => p.id === 'ちょうど80'))
  check('81は出せない', !pool.some(p => p.id === '81'))
}

console.log('\n[2] ①その週の1軍に出ていない80以下だけで足りるとき')
{
  const roster = [P('控えA', 70), P('控えB', 70), P('控えC', 70), P('1軍', 70), P('強い', 90)]
  const pool = reserveSquadPool(roster, new Set(['1軍']), 3)
  check('控えだけになる', ids(pool) === '控えA,控えB,控えC', ids(pool))
  check('1軍で走った選手は入らない', !pool.some(p => p.id === '1軍'))
  check('80超は入らない', pool.every(p => ovr(p) <= 80))
}

console.log('\n[3] ②足りなければ1軍に出た選手も解禁（80以下のまま）')
{
  const roster = [P('控えA', 70), P('1軍A', 70), P('1軍B', 70), P('強い', 90)]
  const pool = reserveSquadPool(roster, new Set(['1軍A', '1軍B']), 3)
  check('1軍の選手まで広がる', ids(pool) === '1軍A,1軍B,控えA', ids(pool))
  check('それでも80超は入らない', !pool.some(p => p.id === '強い'))
}

console.log('\n[4] ③それでも足りなければ80超も解禁（詰み対策）')
{
  const roster = [P('控えA', 70), P('強いA', 90), P('強いB', 90)]
  const pool = reserveSquadPool(roster, new Set(), 3)
  check('全員が対象になる', ids(pool) === '強いA,強いB,控えA', ids(pool))
  // 人数がそもそも足りない場合も、空ではなくロスター全部を返す（組めないなら呼ぶ側で弾く）
  const few = reserveSquadPool([P('ひとり', 70)], new Set(), 6)
  check('人数不足でも空にはならない', few.length === 1)
}

console.log('\n[5] 頭数に数えない選手（故障者）の扱い')
{
  const ok = (p: Player) => p.status !== 'injured'
  // 控えは3人いるが2人が故障 → 数えられるのは1人なので次の段階へ進む
  const roster = [
    P('控えA', 70), P('控え故障B', 70, { status: 'injured' }), P('控え故障C', 70, { status: 'injured' }),
    P('1軍A', 70), P('1軍B', 70),
  ]
  const pool = reserveSquadPool(roster, new Set(['1軍A', '1軍B']), 3, ok)
  check('故障者は頭数に入れずに次の段階へ', pool.some(p => p.id === '1軍A'), ids(pool))
  // 数に入れないだけで、一覧からは消さない（画面側で「故障」と出して選べなくする）
  check('故障者も一覧には残る', pool.some(p => p.id === '控え故障B'))
  // 数えない指定が無いときは故障者も1人と数える＝段階が進まない
  const naive = reserveSquadPool(roster, new Set(['1軍A', '1軍B']), 3)
  check('指定が無ければ全員数える', !naive.some(p => p.id === '1軍A'), ids(naive))
}

console.log('\n[6] 手書きのフィルタが復活していない')
{
  const store = readFileSync('src/store/gameStore.ts', 'utf-8')
  const page = readFileSync('src/components/reserve/ReserveLeaguePage.tsx', 'utf-8')
  check('CPU側は reserveSquadPool を呼ぶ', store.includes('reserveSquadPool('))
  check('プレイヤー側も reserveSquadPool を呼ぶ', page.includes('reserveSquadPool('))
  check('古い isMainSquadRegular が残っていない', !store.includes('isMainSquadRegular') && !page.includes('isMainSquadRegular'))
  // ovr(p) <= 80 / < 81 のような直書きが画面側に戻っていないか
  check('画面側にOVR上限の直書きが無い', !/ovr\([^)]*\)\s*(<=?\s*80|<\s*81)/.test(page))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
process.exit(failed === 0 ? 0 : 1)
