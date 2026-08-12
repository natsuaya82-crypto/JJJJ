/**
 * 【買い取りの打診は通知に出さない】ベルと通知ページから外れていること。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-offer-notif.ts \
 *     --outfile=node_modules/.cache/check-on.cjs --log-level=error && node node_modules/.cache/check-on.cjs
 *
 * ■なぜ外したのか（2026-08-12・オーナー判断「受信箱はいいけど通知に来なければいい」）
 *   打診は1レースに1〜2件しか来ないが、**5レース残る**（`expiresAtRace: raceIndex + 5`）。
 *   その結果ベルには**常時8〜11件**が並び続けていた。実測（1部10戦）：
 *
 *     1シーズンに来る打診 のべ16件 ／ 受信箱は常時 5.8件（最多11件）
 *
 *   **来る量は変えていない。**通知に出さなくしただけ。返事は
 *   **移籍ページ**（「他クラブからのオファー N件 — 要確認」）と**チャット**でできる。
 *
 * ■この点検が守るもの
 *   ベルの数字と通知ページのカードの枚数は**必ず一致**させる（`utils/notifItems` の決まり）。
 *   片方だけ戻すと、また食い違いが生まれる。
 */
import { readFileSync } from 'node:fs'
import { collectNotifications } from '../src/utils/notifItems'
import type { IncomingOffer, Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030, MY = 'me'
const P = (id: string): Player => ({
  id, name: id, teamId: MY, age: 24, status: 'active', specialty: 'long',
  nationality: 'JPN', joinedYear: YEAR - 3, growthCurve: 'normal',
  contract: { annualSalary: 5_000_000, yearsLeft: 2 },
  career: { totalRaces: 20, segmentWins: 0, championships: 0, mvpAwards: 0 },
  ratings: Object.fromEntries(['speed', 'stamina', 'mountainUp', 'mountainDown', 'pacing', 'mental', 'recovery']
    .map(k => [k, 60])),
  potential: 75,
} as unknown as Player)

const offer = (i: number, playerId: string): IncomingOffer => ({
  id: `inc-${i}`, fromTeamId: `t${i}`, playerId, offeredPrice: 100_000_000,
  expiresAtRace: 99, round: 1,
} as unknown as IncomingOffer)

const players = [P('a'), P('b'), P('c')]
const teams = [{ id: MY, shortName: MY, division: 1, tier: 10,
  finance: { budget: 1e9, deficitStreak: 0 }, roster: { main: [] } }] as unknown as Team[]

// ★足りない項目があると total が NaN になる（最初に書いた版がそれで落ちた）。
//   collectNotifications が読む配列は全部入れておく
const call = (offers: IncomingOffer[]) => collectNotifications({
  players, teams, playerTeamId: MY,
  lastLoginDate: undefined, seenJoinIds: [], seenInjuryIds: [],
  pendingGiftsCount: 0, clubGiftsCount: 0,
  currentSeason: {
    year: YEAR, races: [], currentRaceIndex: 0, incomingOffers: offers,
    transferBids: [], contractRequests: [], transferListings: [], newsFeed: [],
    stayOrLeave: [], seenFreeContactIds: [], freeTransferNotices: [], departureNotices: [],
    expiredNegotiations: [], loanResponses: [], retirementRequests: [], transferRequests: [],
    overseasRequests: [], tradeOffers: [], loanOffers: [], sponsorOffers: [], joinNotices: [],
    pendingSales: [], scoutMissions: [], objectives: [],
  } as unknown as Season,
} as never)

console.log('[1] 打診が何件あってもベルの数字は増えない')
{
  const none = call([]).total
  const three = call([offer(1, 'a'), offer(2, 'b'), offer(3, 'c')]).total
  const many = call(Array.from({ length: 11 }, (_, i) => offer(i, ['a', 'b', 'c'][i % 3]))).total
  check('0件のときと3件のときで同じ', none === three, `${none} / ${three}`)
  check('0件のときと11件のときで同じ', none === many, `${none} / ${many}`)
  // ★母数の確認。そもそも打診が届いていない世界なら、この点検は何も守っていない
  check('打診そのものは届いている（空振りの緑ではない）',
    call([offer(1, 'a')]).incomingOfferPlayers.length === 1,
    `${call([offer(1, 'a')]).incomingOfferPlayers.length}人`)
}

console.log('')
console.log('[2] 通知ページにも出さない（ベルと枚数を必ず揃える）')
{
  const page = readFileSync('src/components/notifications/NotificationsPage.tsx', 'utf-8')
  check('通知ページに「移籍オファー」の節が無い', !/SectionHead label="移籍オファー"/.test(page))
  check('通知ページが incomingOfferPlayers を読んでいない', !/incomingOfferPlayers/.test(page))
}

console.log('')
console.log('[3] 返事の導線は残っている（外しても詰まらないこと）')
{
  const tp = readFileSync('src/components/transfer/TransferPage.tsx', 'utf-8')
  check('移籍ページに「要確認」の一覧がある', /他クラブからのオファー/.test(tp))
  check('移籍ページが打診を読んでいる', /offersAwaitingReply\(/.test(tp))
}

console.log('')
console.log(failed === 0 ? '\n✓ 買い取りの打診はベルにも通知ページにも出ない（返事は移籍ページで）\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
