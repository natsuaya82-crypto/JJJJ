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
import { collectNotifications, contractMonthsLeft, expiredNegText, EXPIRED_NEG_TEXT, asCardCount, chatReplyLine } from '../src/utils/notifItems'
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
    { label: '海外挑戦希望', input: base(S({ overseasRequests: [{ playerId: 'p1', region: 'europe' }] }), [P('p1', 'a')]) },
    { label: '入札のカウンター', input: base(S({ transferBids: [{ id: 'b1', playerId: 'p1', status: 'countered' }] }), [P('p1', 'a')]) },
    { label: '移籍金の合意', input: base(S({ transferBids: [{ id: 'b1', playerId: 'p1', status: 'fee_accepted' }] }), [P('p1', 'a')]) },
    { label: '契約の要求', input: base(S({ contractRequests: [{ playerId: 'p1', status: 'pending_gm' }] }), [P('p1', 'a')]) },
    { label: '加入のお知らせ', input: base(S(), [P('p1', 'a', { joinedYear: 2030 })]) },
    { label: '退団のお知らせ', input: base(S({ departureNotices: [{ playerId: 'p1' }] })) },
    { label: 'フリー移籍のお知らせ', input: base(S({ freeTransferNotices: [{ playerId: 'p1' }] })) },
    { label: '交渉期限切れ', input: base(S({ expiredNegotiations: [{ id: 'e1' }] })) },
    { label: 'レンタルの返事', input: base(S({ loanResponses: [{ id: 'l1' }] })) },
    { label: '獲得オファーの逆提示', input: base(S({ acquisitionOffers: [{ id: 'a1', playerId: 'p1', status: 'countered' }] }), [P('p1', 'b')], [T('a'), T('b')]) },
    { label: 'レンタルの申し込み', input: base(S({ incomingLoanOffers: [{ id: 'i1', fromTeamId: 'b', playerId: 'p1', direction: 'lend_out', years: 1, expiresAtRace: 5 }] }), [P('p1', 'a')], [T('a'), T('b')]) },
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

console.log('\n[4.7] チャットを開いて札ができても数字は変わらない')
{
  // 「契約満了間近だがまだ話していない」→ チャットで条件を出して札(contractRequest)ができる、
  // という流れで数字が動かないこと。ここが動くのがベルのズレの正体だった
  const p = P('p1', 'a', { contract: { annualSalary: 1000, yearsLeft: 1, faEligibleYear: 2030 } } as Partial<Player>)
  const before = collectNotifications(base(S({ currentRaceIndex: 8 }), [p]))
  const after = collectNotifications(base(S({ currentRaceIndex: 8, contractRequests: [{ playerId: 'p1', status: 'pending_gm' }] }), [p]))
  check('札ができる前は1件', before.total === 1, `${before.total}件`)
  check('札ができても1件のまま', after.total === 1, `${after.total}件`)
  check('札があるほうは「交渉中」として同じ行に出る', after.renewalPlayers.length === 1 && !!after.renewalPlayers[0].req)
}

console.log('\n[4.8] ケガ中の選手あての用件も数える')
{
  // 以前は「現役＝status === active」で見ていたので、交渉中の選手がケガをした瞬間に
  // オファーも直訴もベルから消えて、そのまま期限切れになっていた
  const hurt = [P('p1', 'a', { status: 'injured' } as Partial<Player>)]
  const r = collectNotifications(base(S({
    incomingOffers: [{ id: 'o1', playerId: 'p1', fromTeamId: 'b', offeredPrice: 100, expiresAtRace: 5 }],
    retirementRequests: [{ playerId: 'p1' }],
  }), hurt))
  check('ケガ中でも移籍オファーを数える', r.incomingOffers.length === 1)
  check('ケガ中でも引退希望を数える', r.retirementRequests.length === 1)
}

console.log('\n[4.9] カードを作れないトレード打診はベルにも数えない')
{
  const offer = (extra: Record<string, unknown> = {}) => ({
    id: 't1', fromTeamId: 'b', offeredPlayerIds: ['x1'], requestedPlayerIds: ['p1'],
    expiresAtRace: 5, message: '', ...extra,
  })
  const roster = [P('p1', 'a'), P('x1', 'b')]
  const both = [T('a'), T('b')]
  check('ちゃんとした打診は1件',
    collectNotifications({ ...base(S({ pendingTradeOffers: [offer()] }), roster, both) }).total === 1)
  check('相手クラブが分からない打診は数えない',
    collectNotifications(base(S({ pendingTradeOffers: [offer({ fromTeamId: 'zzz' })] }), roster, both)).total === 0)
  check('こちらが出す選手が居ない打診は数えない',
    collectNotifications(base(S({ pendingTradeOffers: [offer({ requestedPlayerIds: [] })] }), roster, both)).total === 0)
  check('もらう選手が居ない打診は数えない',
    collectNotifications(base(S({ pendingTradeOffers: [offer({ offeredPlayerIds: [] })] }), roster, both)).total === 0)
}

console.log('\n[4.9] まとめて1枚のカードにしている用件は、何人いても1件')
{
  // 通知ページでは「移籍要望」「海外挑戦希望」は人数に関係なくカード1枚
  //（「N人が移籍を希望」）。ここを人数分数えると、ベルは2なのにカードは1枚になる。
  // 「引退申請」は1人ずつカードが並ぶので人数分でよい
  const tr2 = collectNotifications(base(S({ transferRequests: [{ playerId: 'p1' }, { playerId: 'p2' }] }), [P('p1', 'a'), P('p2', 'a')]))
  check('移籍希望が2人でも1件', tr2.transferReqs.length === 2 && tr2.total === 1, `${tr2.total}件`)
  const ov2 = collectNotifications(base(S({ overseasRequests: [{ playerId: 'p1', region: 'europe' }, { playerId: 'p2', region: 'europe' }] }), [P('p1', 'a'), P('p2', 'a')]))
  check('海外挑戦希望が2人でも1件', ov2.overseasReqs.length === 2 && ov2.total === 1, `${ov2.total}件`)
  const ret2 = collectNotifications(base(S({ retirementRequests: [{ playerId: 'p1' }, { playerId: 'p2' }] }), [P('p1', 'a'), P('p2', 'a')]))
  check('引退希望は1人ずつカードが出るので2件', ret2.total === 2, `${ret2.total}件`)
  // 3種類が混ざっても、まとめている2つは1ずつ
  const mix = collectNotifications(base(S({
    transferRequests: [{ playerId: 'p1' }, { playerId: 'p2' }],
    overseasRequests: [{ playerId: 'p3', region: 'europe' }],
    retirementRequests: [{ playerId: 'p4' }],
  }), [P('p1', 'a'), P('p2', 'a'), P('p3', 'a'), P('p4', 'a')]))
  check('混ざっても 1+1+1=3件', mix.total === 3, `${mix.total}件`)
}

console.log('\n[4.95] チャットで返事するものは1本で数える')
{
  // チャットには返事のボタンが出ているのに、ベルにも通知ページにも出ていなかったもの。
  // 種類は2つあるが、通知ページでは「N件があなたの返事待ち」のカード1枚にまとめている。
  // だからベルも1（節の見出しに出る数字だけが2）
  const both = [T('a'), T('b')]
  const all = collectNotifications(base(S({
    acquisitionOffers: [{ id: 'a1', playerId: 'p1', status: 'countered' }],
    incomingLoanOffers: [{ id: 'i1', fromTeamId: 'b', playerId: 'p1', direction: 'lend_out', years: 1, expiresAtRace: 5 }],
  }), [P('p1', 'a')], both))
  check('2種類あってもカードは1枚なので1件', all.chatReplies.length === 2 && all.total === 1, `${all.total}件`)

  // こちらの返事を待っていないものは数えない
  const pending = collectNotifications(base(S({ acquisitionOffers: [{ id: 'a1', playerId: 'p1', status: 'pending' }] }), [P('p1', 'b')], both))
  check('選手の返事待ち(pending)は数えない', pending.total === 0, `${pending.total}件`)
  // トレードの逆提示はチャット一覧に行が出ない（移籍ページからしか開けない）ので数えない。
  // ここを足すと「ベルは1件なのにチャットには何も無い」というズレになる
  const trade = collectNotifications(base(S({ tradeNegotiations: [{ id: 'n1', targetTeamId: 'b', status: 'countered' }] }), [], both))
  check('トレードの逆提示はチャットに行が出ないので数えない', trade.total === 0, `${trade.total}件`)
  const outgoing = collectNotifications(base(S({ loanRequests: [{ id: 'r1', playerId: 'p1', toTeamId: 'b' }] }), [P('p1', 'a')], both))
  check('こちらから出したレンタル希望は数えない', outgoing.total === 0, `${outgoing.total}件`)

  // チャットにカードが出せないもの（選手やクラブが見つからない）はベルにも出さない
  const ghostP = collectNotifications(base(S({ acquisitionOffers: [{ id: 'a1', playerId: 'zzz', status: 'countered' }] }), [], both))
  check('居ない選手の逆提示は数えない', ghostP.total === 0, `${ghostP.total}件`)
  // 海外クラブからのレンタルは fromTeamId が国内チーム一覧に無い。チャットは
  // 「他クラブ」としてカードを出すので、ベルもちゃんと数える
  const foreignL = collectNotifications(base(S({ incomingLoanOffers: [{ id: 'i1', fromTeamId: 'eu-1', playerId: 'p1', direction: 'lend_out', years: 1, expiresAtRace: 5, fromForeign: true }] }), [P('p1', 'a')], both))
  check('海外クラブからのレンタルも数える', foreignL.total === 1, `${foreignL.total}件`)
  const ghostL = collectNotifications(base(S({ incomingLoanOffers: [{ id: 'i1', fromTeamId: 'b', playerId: 'zzz', direction: 'lend_out', years: 1, expiresAtRace: 5 }] }), [P('p1', 'a')], both))
  check('居ない選手のレンタルは数えない', ghostL.total === 0, `${ghostL.total}件`)
}

console.log('\n[5] 数え方は「通知ページに出るカードの枚数」と揃える')
{
  // まとめて1枚のカードにしている用件は、中身が何件でも1件
  const many = Array.from({ length: ROSTER_MAX + 3 }, (_, i) => P(`m${i}`, 'a'))
  check('ロスター超過は1件', collectNotifications(base(S(), many)).total === 1)
  check('超過人数も数える', collectNotifications(base(S(), many)).rosterOver === 3)

  // 契約更新は1人ずつカードが並ぶので人数分。
  // 以前は「まだ話していない選手」を人数、「札があって応対待ち」をまとめて1件と
  // 別々に数えていたので、チャットを開いて札が作られた瞬間に数字が勝手に減っていた
  const contracts = S({ contractRequests: [{ playerId: 'p1', status: 'pending_gm' }, { playerId: 'p2', status: 'pending_gm' }] })
  check('契約更新はカードが並ぶので人数分',
    collectNotifications(base(contracts, [P('p1', 'a'), P('p2', 'a')])).total === 2,
    `${collectNotifications(base(contracts, [P('p1', 'a'), P('p2', 'a')])).total}件`)

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
  // まとめて1枚のカードにしている節（ログインボーナス・補強禁止・ロスター超過・
  // スポンサー）は必ず 1。
  // ★アップデート記念（マイプレイヤー未作成）は廃止済みなので、ここは5つではなく4つ。
  //   配布枠560が終了し、GameState.myPlayerCreated は古いセーブに残るだけになった
  '1', '1', '1', '1',
  'pendingGifts.length', 'clubGifts.length', 'joinNotices.length', 'tradeOffers.length',
  'renewalNeeded', 'injuredPlayers.length', 'retirementRequests.length', 'transferReqs.length',
  'overseasReqs.length', 'chatReplies.length',
  'counteredBids.length', 'feeAcceptedBids.length', 'freeContacts.length', 'departureNotices.length',
  'freeTransferNotices.length', 'expiredNegotiations.length', 'loanResponses.length',
  // 買い取り打診は「選手ごと」に1件。1人に5クラブ来ても行は1つ＝ベルも1（notifItems.offersByPlayer）
  'incomingOfferPlayers.length',
  // 行き先が決まらなかった退団予定の選手の去就（残ってくれ／契約を解除する）
  'stayOrLeave.length',
]
check('通知ページの節の数が変わっていない', headCounts.length === expected.length, `いま${headCounts.length}節`)
check('節ごとの件数の出どころが変わっていない',
  headCounts.slice().sort().join('|') === expected.slice().sort().join('|'),
  headCounts.slice().sort().filter(x => !expected.includes(x)).join(', '))
check('ベルも同じ collectNotifications を使っている', bell.includes('collectNotifications'))

// 「交渉期限切れ」の節は種類ごとに文言を変える箱。種類を増やして文言を足し忘れると
// undefined が出て画面が真っ白になるので、全種類ぶん揃っているかを見る
// ★一覧をここに写さないこと。写した瞬間に「増やしたのに片方だけ古い」が起きる
//   （実際に sale_refused / sale_roster_min を足したとき、この写しだけ6件のままだった）。
//   種類が全部そろっているかは EXPIRED_NEG_TEXT が Record<ExpiredNegKind, …> なので tsc が見る。
//   ここで見るのは「どの種類にもちゃんと文言が入っているか」だけ。
const NEG_KINDS = Object.keys(EXPIRED_NEG_TEXT) as (keyof typeof EXPIRED_NEG_TEXT)[]
for (const k of NEG_KINDS) {
  const t = expiredNegText(k)
  check(`交渉期限切れ「${k}」の文言がある`, typeof t?.title === 'function' && typeof t?.note === 'string' && t.title('選手A').includes('選手A'))
}
check('種類が入っていない古いセーブは入札として扱う', expiredNegText(undefined) === EXPIRED_NEG_TEXT.bid)
// 文言が空・使い回しになっていないか（種類を足したのに中身を書き忘れる、を見る）
check('種類ごとに違う文言が入っている',
  new Set(NEG_KINDS.map(k => EXPIRED_NEG_TEXT[k].title('X') + EXPIRED_NEG_TEXT[k].note)).size === NEG_KINDS.length,
  `${NEG_KINDS.length}種類`)

console.log('\n[X] まとめて1枚のカードで出すものは、中身が何件でも1（asCardCount）')
{
  // ★ここが「レンタルが通知に来ないのにチャットだけ増える」の正体。
  //   ベルは chatReplies をまとめて1と数えているのに、ChatPage だけが
  //   incomingLoanOffers.length と**件数ぶん**足していた。
  const loanSeason = (n: number) => S({
    incomingLoanOffers: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, fromTeamId: 'b', playerId: 'p1', direction: 'lend_out', years: 1, expiresAtRace: 5 })),
  })
  const one = collectNotifications(base(loanSeason(1), [P('p1', 'a')]))
  const three = collectNotifications(base(loanSeason(3), [P('p1', 'a')]))
  check('レンタルの申し込み1件でベルは1', one.total === 1, `${one.total}件`)
  check('レンタルの申し込み3件でもベルは1（カードは1枚だから）', three.total === 1, `${three.total}件`)
  check('中身は3件そのまま持っている（数え方だけが1）', three.chatReplies.length === 3, `${three.chatReplies.length}件`)

  // 数え方そのもの
  check('asCardCount は空なら0', asCardCount([]) === 0)
  check('asCardCount は1件でも5件でも1', asCardCount([1]) === 1 && asCardCount([1, 2, 3, 4, 5]) === 1)

  // カードが1枚しか出ない以上、何が待っているかは**文**で伝える
  const line3 = chatReplyLine(three.chatReplies)
  check('カードの文面にレンタルと件数が出る', line3.includes('レンタル') && line3.includes('3件'), line3)
  const mixed = chatReplyLine([{ kind: 'loan' }, { kind: 'acquisition' }, { kind: 'acquisition' }])
  check('レンタルと獲得が混ざったら両方出る',
    mixed.includes('レンタルの申し込み 1件') && mixed.includes('獲得オファーの返答 2件'), mixed)
  check('空でも文面が空にならない', chatReplyLine([]).length > 0)
}

console.log('\n[Y] 画面が自分で数え直していないこと')
{
  // ベル・通知ページ・チャットの三者一致は「数え方が1本しか無いこと」で保つ。
  // ChatPage が incomingLoanOffers.length と件数ぶん足す形に戻ったら落とす。
  // **ファイルを名指しで読む**（相対パスの字面では判定しない）
  // ★コメントを落としてから見る。**コメントの字に当てないこと。**
  //   最初はそのまま検索していて、「以前は incomingLoanOffers.length と足していた」という
  //   経緯のコメント自体に当たって落ちた。見張りたいのは動くコードのほう
  const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const CHAT = 'src/components/team/ChatPage.tsx'
  const chat = codeOnly(readFileSync(CHAT, 'utf8'))
  check(`${CHAT} がレンタルを件数ぶん足していない`, !/incomingLoanOffers\.length/.test(chat))
  check(`${CHAT} が asCardCount を通している`, /asCardCount\s*\(/.test(chat))
  // 「まとめて1枚」の数え方を画面で書き直していないか
  const NOTIF = 'src/components/notifications/NotificationsPage.tsx'
  const notif = codeOnly(readFileSync(NOTIF, 'utf8'))
  check(`${NOTIF} がカードの文面を直書きしていない`, /chatReplyLine\s*\(/.test(notif))
}

console.log(failed === 0 ? '\n全部OK\n' : `\n${failed}件 NG\n`)
if (failed > 0) process.exit(1)
