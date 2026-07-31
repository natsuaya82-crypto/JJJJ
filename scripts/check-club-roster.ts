/**
 * 「どの選手がどのクラブに居るか」の持ち方を確かめる自己点検スクリプト。
 *
 *   npx jiti scripts/check-club-roster.ts
 *
 * 直したのは、海外クラブだけが「クラブ側の選手名簿(playerIds)」を持っていて、
 * 選手側の teamId と二重管理になっていたこと。片方だけ更新されると
 *   ・所属なし表示（クラブから消える）
 *   ・同じ選手が2つのクラブに居る（増殖）
 * が起きていた。今は国内チームも海外クラブも teamId 一本で、国が違うだけの同じ扱い。
 */
import { belongsToClub, clubMemberIds, clubMembersByClub, isSquadMember, rebuildRosters } from '../src/utils/rosterSync'
import { restoreTeamIdsFromLegacyClubs, dropLegacyClubRosters } from '../src/utils/legacyClubRoster'
import type { Player, Team } from '../src/types'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', rosterTier: 'main', contract: { annualSalary: 1000, yearsLeft: 2, faEligibleYear: 2030 }, ...extra }) as unknown as Player

console.log('\n[1] 所属の条件（国内チームでも海外クラブでも同じルール）')
check('そのクラブの現役選手は所属', belongsToClub(P('a', 't1'), 't1'))
check('別のクラブの選手は所属でない', !belongsToClub(P('b', 'kor_1'), 't1'))
check('引退した選手は所属でない', !belongsToClub(P('c', 't1', { status: 'retired' }), 't1'))
check('負傷中でも所属したまま（人数に数える）', belongsToClub(P('d', 't1', { status: 'injured' }), 't1'))
check('status が付いていない古い海外選手も所属として数える',
  belongsToClub(P('e', 'kor_1', { status: undefined as unknown as Player['status'] }), 'kor_1'))
check('レンタルで来ている選手も所属（実際にそのクラブで走るから）',
  belongsToClub(P('f', 't1', { loan: { ownerTeamId: 'kor_1', untilYear: 2031 } as Player['loan'] }), 't1'))
check('無所属（FA）はどのクラブにも属さない', !belongsToClub(P('g', ''), 't1'))
check('ドラフト候補（__pool__）はどのクラブにも属さない', !belongsToClub(P('h', '__pool__'), 't1'))

console.log('\n[2] 国内チームと海外クラブで結果が同じ（国が違うだけ）')
{
  const domestic = [P('d1', 't1'), P('d2', 't1'), P('d3', 't2')]
  const foreign = [P('f1', 'kor_1'), P('f2', 'kor_1'), P('f3', 'ken_1')]
  check('国内チームの人数が数えられる', clubMemberIds(domestic, 't1').length === 2)
  check('海外クラブも同じ数え方で数えられる', clubMemberIds(foreign, 'kor_1').length === 2)
  check('同じ形のデータなら国内も海外も同じ結果',
    clubMemberIds(domestic, 't1').length === clubMemberIds(foreign, 'kor_1').length)
}

console.log('\n[3] まとめて引く版（clubMembersByClub）が1件ずつと一致する')
{
  const players = [
    P('p1', 't1'), P('p2', 't1'), P('p3', 'kor_1'),
    P('p4', 'kor_1'), P('p5', 'ken_1'), P('p6', ''),
    P('p7', 't1', { status: 'retired' }),
    P('p8', 'kor_1', { status: 'injured' }),
  ]
  const map = clubMembersByClub(players)
  for (const clubId of ['t1', 'kor_1', 'ken_1']) {
    const one = clubMemberIds(players, clubId)
    const many = map.get(clubId) ?? []
    check(`${clubId} の一覧が一致`, one.length === many.length && one.every((id, i) => id === many[i]),
      `1件ずつ=${one.join(',')} / まとめて=${many.join(',')}`)
  }
  check('引退選手はどのクラブの一覧にも入らない', !(map.get('t1') ?? []).includes('p7'))
  check('負傷選手はクラブの一覧に入る', (map.get('kor_1') ?? []).includes('p8'))
  check('無所属（FA）はどのクラブの一覧にも入らない',
    [...map.values()].every(ids => !ids.includes('p6')))
}

console.log('\n[4] 名簿(team.roster)に並べる人は、レンタル中を除いた所属者')
{
  const loaned = P('L', 't1', { loan: { ownerTeamId: 'kor_1', untilYear: 2031 } as Player['loan'] })
  check('レンタル中の選手は所属だが名簿には並べない',
    belongsToClub(loaned, 't1') && !isSquadMember(loaned, 't1'))
  const players = [P('m1', 't1'), loaned]
  const teams = [{ id: 't1', roster: { main: [], second: [] } }] as unknown as Team[]
  const rebuilt = rebuildRosters(players, teams)
  check('組み直した名簿にレンタル中は入らない',
    rebuilt[0].roster.main.length === 1 && rebuilt[0].roster.main[0] === 'm1')
  check('クラブの所属人数は2人のまま（出走はできる）', clubMemberIds(players, 't1').length === 2)
}

console.log('\n[5] 旧セーブの引っ越し（version 22）')
{
  const legacy = () => [
    { id: 'kor', clubs: [{ id: 'kor_1', playerIds: ['x1', 'x2', 'x5'] }, { id: 'kor_2', playerIds: [] }] },
    { id: 'ken', clubs: [{ id: 'ken_1', playerIds: ['x3'] }] },
  ]
  // 旧バグ：海外選手が契約満了で teamId を空にされ、名簿にだけ残っていた
  const players = [
    P('x1', '', { faSinceYear: 2030 }),
    P('x2', 'kor_1'),
    P('x3', '', { status: 'retired' }),
    P('x4', ''),
    P('x5', '', { status: undefined as unknown as Player['status'] }),
  ]
  const leagues = legacy()
  const fixed = restoreTeamIdsFromLegacyClubs(players, leagues)
  check('名簿にしか居なかった選手の所属が戻る', fixed.find(p => p.id === 'x1')?.teamId === 'kor_1')
  check('戻した選手のFA期間はリセットされる', fixed.find(p => p.id === 'x1')?.faSinceYear === undefined)
  check('もともと所属が正しい選手は触らない', fixed.find(p => p.id === 'x2')?.teamId === 'kor_1')
  check('引退した選手は戻さない', fixed.find(p => p.id === 'x3')?.teamId === '')
  check('名簿に居ない本物のFAは無所属のまま', fixed.find(p => p.id === 'x4')?.teamId === '')
  check('status が付いていない古い海外選手も所属が戻る', fixed.find(p => p.id === 'x5')?.teamId === 'kor_1')

  dropLegacyClubRosters(leagues)
  const anyLeft = leagues.some(l => l.clubs.some(c => 'playerIds' in c))
  check('クラブ側の名簿は消える（以後セーブに残らない）', !anyLeft)

  // 2回流しても壊れない（冪等）
  const again = restoreTeamIdsFromLegacyClubs(fixed, leagues)
  check('2回流しても結果が変わらない（冪等）', again === fixed)

  // 名簿が無い新しいセーブでも落ちない
  check('名簿が無いセーブでもそのまま返す', restoreTeamIdsFromLegacyClubs(players, undefined) === players)
  dropLegacyClubRosters(undefined)
  check('名簿が無いセーブでも消す処理が落ちない', true)
}

console.log('\n[6] 端の条件で落ちない')
check('選手が0人でも落ちない', clubMemberIds([], 't1').length === 0)
check('選手が0人ならまとめて版も空', clubMembersByClub([]).size === 0)

if (failed > 0) {
  console.error(`\n${failed}件 NG\n`)
  process.exit(1)
}
console.log('\n全部OK\n')
