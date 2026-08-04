/**
 * 「ベルの数字と通知ページの件数が必ず一致する」ことを確かめる自己点検。
 *
 *   npx jiti scripts/check-notif-count.ts
 *
 * 直したのは、同じ80行ほどの数え方が NotificationsPage.tsx と NotificationPanel.tsx の
 * 両方に手書きでコピーされていたこと。コード中にも「片方だけ変えるとズレる」と
 * 注意書きが残っていて、実際にベルに「3」と出ているのに開くと1件、ということが起きていた。
 * 今は utils/notifItems.ts の collectNotifications 1本だけが数える。
 */
import { collectNotifications, contractMonthsLeft } from '../src/utils/notifItems'
import { ROSTER_MAX } from '../src/data/rosterRules'
import { loginTodayKey } from '../src/utils/loginDate'
import type { Player, Team, Season } from '../src/types'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

let failed = 0
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) { failed++; console.error(`  NG  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok  ${label}`)
}

const P = (id: string, teamId: string, extra: Partial<Player> = {}) =>
  ({ id, name: id, teamId, status: 'active', age: 25, joinedYear: 2028, contract: { annualSalary: 1000, yearsLeft: 3, faEligibleYear: 2030 }, ...extra }) as unknown as Player

const T = (id: string, extra: Record<string, unknown> = {}) =>
  ({ id, name: `${id}クラブ`, roster: { main: [] }, finance: { budget: 1_000_000, deficitStreak: 0 }, sponsors: [], ...extra }) as unknown as Team

const S = (extra: Record<string, unknown> = {}) =>
  ({ year: 2030, currentRaceIndex: 0, races: [{}, {}, {}, {}, {}, {}, {}, {}, {}, {}], ...extra }) as unknown as Season

// 「今日はログインボーナス受け取り済み・マイプレイヤー作成済み」の素の入力。
// この状態なら通知は0件になるので、足した分だけ数が増えることを確かめられる
const base = (season: Season, players: Player[] = [], teams: Team[] = [T('a')]) => ({
  currentSeason: season, players, teams, playerTeamId: 'a',
  lastLoginDate: loginTodayKey(),
  seenJoinIds: [] as string[], seenInjuryIds: [] as string[],
  myPlayerCreated: true, pendingGiftsCount: 0, clubGiftsCount: 0,
})

console.log('\n[1] 何も無ければ0件')
{
  const r = collectNotifications(base(S()))
  check('通知は0件', r.total === 0, `${r.total}件`)
}

console.log('\n[2] 用件を1つ足すと数がちょうど1つ増える')
{
  const cases: { label: string; input: ReturnType<typeof base> }[] = [
    { label: '移籍オファー', input: base(S({ incomingOffers: [{ id: 'o1', playerId: 'p1', fromTeamId: 'b', offeredPrice: 100, expiresAtRace: 5 }] }), [P('p1', 'a')]) },
    { label: 'フリー移籍の接触', input: base(S({ incomingOffers: [{ id: 'o1', playerId: 'p1', fromTeamId: 'b', offeredPrice: 0, expiresAtRace: 5 }] }), [P('p1', 'a')]) },
    { label: '引退希望', input: base(S({ retirementRequests: [{ playerId: 'p1' }] }), [P('p1', 'a')]) },
    { label: '移籍希望', input: base(S({ transferRequests: [{ playerId: 'p1' }] }), [P('p1', 'a')]) },
    { label: '入札のカウンター', input: base(S({ transferBids: [{ id: 'b1', playerId: 'p1', status: 'countered' }] }), [P('p1', 'a')]) },
    { label: '移籍金の合意', input: base(S({ transferBids: [{ id: 'b1', playerId: 'p1', status: 'fee_accepted' }] }), [P('p1', 'a')]) },
    { label: '契約の要求', input: base(S({ contractRequests: [{ playerId: 'p1', status: 'pending_gm' }] }), [P('p1', 'a')]) },
    { label: '加入のお知らせ', input: base(S(), [P('p1', 'a', { joinedYear: 2030 })]) },
    { label: '退団のお知らせ', input: base(S({ departureNotices: [{ playerId: 'p1' }] })) },
    { label: 'フリー移籍のお知らせ', input: base(S({ freeTransferNotices: [{ playerId: 'p1' }] })) },
    { label: '交渉期限切れ', input: base(S({ expiredNegotiations: [{ id: 'e1' }] })) },
    { label: 'レンタルの返事', input: base(S({ loanResponses: [{ id: 'l1' }] })) },
    { label: 'マイプレイヤー未作成', input: { ...base(S()), myPlayerCreated: false } },
    { label: 'ログインボーナス未受け取り', input: { ...base(S()), lastLoginDate: '2000-01-01' } },
    { label: '運営からのプレゼント', input: { ...base(S()), pendingGiftsCount: 1 } },
    { label: '走友会のなかまからのカード', input: { ...base(S()), clubGiftsCount: 1 } },
  ]
  for (const c of cases) check(`${c.label}で1件`, collectNotifications(c.input).total === 1, `${collectNotifications(c.input).total}件`)
}

console.log('\n[3] 退団・引退した選手あての「幽霊通知」は数えない')
{
  const gone = S({
    incomingOffers: [{ id: 'o1', playerId: 'p1', fromTeamId: 'b', offeredPrice: 100, expiresAtRace: 5 }],
    retirementRequests: [{ playerId: 'p1' }],
    transferRequests: [{ playerId: 'p1' }],
  })
  check('もう居ない選手の通知は0件', collectNotifications(base(gone, [P('p1', 'b')])).total === 0)
}

console.log('\n[4] 契約更新のリマインダーは残り6ヶ月未満だけ')
{
  const season = S({ currentRaceIndex: 8 })   // 全10戦のうち8戦消化＝残り約2.4ヶ月
  const near = collectNotifications(base(season, [P('p1', 'a', { contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)]))
  check('残り半年を切ったら1件', near.total === 1, `${near.total}件`)
  const far = collectNotifications(base(S({ currentRaceIndex: 0 }), [P('p1', 'a', { contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)]))
  check('まだ半年あるうちは出さない', far.total === 0, `${far.total}件`)
  check('月数の計算（最終年の頭は12ヶ月）', contractMonthsLeft(1, 0, 10) === 12)
  check('月数の計算（最終年で全戦終了なら0ヶ月）', contractMonthsLeft(1, 10, 10) === 0)

  // フリー移籍で接触中の選手は、接触カードに一本化して契約更新を二重に出さない
  const contacted = collectNotifications(base(
    S({ currentRaceIndex: 8, incomingOffers: [{ id: 'o1', playerId: 'p1', fromTeamId: 'b', offeredPrice: 0, expiresAtRace: 9 }] }),
    [P('p1', 'a', { contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)]))
  check('接触中の選手は接触の1件だけ', contacted.total === 1, `${contacted.total}件`)
}

console.log('\n[4.5] レンタルで借りている選手には契約の用件を出さない')
{
  // 借り物の選手は保有権が無いので契約更新も引退交渉もできない。
  // teamId は借り手（＝自分）になっているため、teamId だけ見ていると通知が出てしまっていた
  const lent = P('p1', 'a', { loan: { ownerTeamId: 'b', untilYear: 2032 }, contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)
  const season = S({ currentRaceIndex: 8, contractRequests: [{ playerId: 'p1', status: 'pending_gm' }] })
  const r = collectNotifications(base(season, [lent]))
  check('借りている選手の契約更新は数えない', r.total === 0, `${r.total}件`)
  const own = P('p2', 'a', { contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)
  check('自分の選手なら数える', collectNotifications(base(S({ currentRaceIndex: 8 }), [own])).total === 1)
}

console.log('\n[5] 数え方は「通知ページに出るカードの枚数」と揃える')
{
  // まとめて1枚のカードにしている用件は、中身が何件でも1件
  const many = Array.from({ length: ROSTER_MAX + 3 }, (_, i) => P(`m${i}`, 'a'))
  check('ロスター超過は1件', collectNotifications(base(S(), many)).total === 1)
  check('超過人数も数える', collectNotifications(base(S(), many)).rosterOver === 3)

  const contracts = S({ contractRequests: [{ playerId: 'p1', status: 'pending_gm' }, { playerId: 'p2', status: 'pending_gm' }] })
  check('契約交渉はカード1枚なので何人でも1件',
    collectNotifications(base(contracts, [P('p1', 'a'), P('p2', 'a')])).total === 1)

  // 1人ずつカードが並ぶ用件は人数分。負傷者はカードが人数分出るのに1と数えていた
  const injured = [P('i1', 'a', { status: 'injured' } as Partial<Player>), P('i2', 'a', { status: 'injured' } as Partial<Player>)]
  check('負傷者はカードが並ぶので人数分', collectNotifications(base(S(), injured)).total === 2, `${collectNotifications(base(S(), injured)).total}件`)

  const broke = collectNotifications(base(S(), [], [T('a', { finance: { budget: -1, deficitStreak: 0 } })]))
  check('補強禁止は1件', broke.total === 1 && broke.signingBanned)
  const streak = collectNotifications(base(S(), [], [T('a', { finance: { budget: 100, deficitStreak: 3 } })]))
  check('3季連続赤字でも補強禁止', streak.signingBanned)
}

console.log('\n[6] スポンサー枠が満杯ならオファーは出さない')
{
  const offers = { sponsorOffers: [{ id: 's1' }, { id: 's2' }] }
  check('枠が空いていれば1件（何件来ても1件）', collectNotifications(base(S(offers))).total === 1)
  const full = collectNotifications(base(S(offers), [], [T('a', { sponsors: [{}, {}, {}] })]))
  check('枠が満杯なら0件', full.total === 0, `${full.total}件`)
}

console.log('\n[7] 数え方がどこにもコピーし直されていない')
const walk = (dir: string): string[] => readdirSync(dir).flatMap(n => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(n) ? [p] : [])
})
const notifItems = join('src', 'utils', 'notifItems.ts')
// 「+ ○○.length」を並べて合計を作っているファイルが他にあれば、それは数え方のコピー
const counters = walk('src').filter(f => f !== notifItems && /\+\s*freeTransferNotices\.length/.test(readFileSync(f, 'utf-8')))
check('件数を足し算しているのは notifItems だけ', counters.length === 0, counters.join(', '))
const page = readFileSync(join('src', 'components', 'notifications', 'NotificationsPage.tsx'), 'utf-8')
const bell = readFileSync(join('src', 'components', 'notifications', 'useNotifCount.ts'), 'utf-8')
check('通知ページが collectNotifications を使っている', page.includes('collectNotifications'))

// 見出しの「N」を全部足すとベルの数字になる、という関係を崩さないための番人。
// 節が増えたのに合計に足し忘れる／カードは1枚なのに人数分数える、が起きると落ちる
const headCounts = [...page.matchAll(/<SectionHead[^>]*count=\{([^}]+)\}/g)].map(m => m[1].trim())
const expected = [
  // まとめて1枚のカードにしている節（アップデート記念・ログインボーナス・補強禁止・
  // ロスター超過・スポンサー・契約交渉）は必ず 1
  '1', '1', '1', '1', '1', '1',
  'pendingGifts.length', 'clubGifts.length', 'joinNotices.length', 'tradeOffers.length',
  'renewalNeeded', 'injuredPlayers.length', 'retirementRequests.length', 'transferReqs.length',
  'counteredBids.length', 'feeAcceptedBids.length', 'freeContacts.length', 'departureNotices.length',
  'freeTransferNotices.length', 'expiredNegotiations.length', 'loanResponses.length', 'incomingOffers.length',
]
check('通知ページの節の数が変わっていない', headCounts.length === expected.length, `いま${headCounts.length}節`)
check('節ごとの件数の出どころが変わっていない',
  headCounts.slice().sort().join('|') === expected.slice().sort().join('|'),
  headCounts.slice().sort().filter(x => !expected.includes(x)).join(', '))
check('ベルも同じ collectNotifications を使っている', bell.includes('collectNotifications'))

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
