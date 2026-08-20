/**
 * 【自チームへの買い取り打診は1本】国内52クラブと海外180クラブが**同じ関門・同じ上限**を通ること。
 *
 *   npx esbuild --bundle --platform=node --format=cjs scripts/check-offer-unified.ts \
 *     --outfile=node_modules/.cache/check-ou.cjs --log-level=error && node node_modules/.cache/check-ou.cjs
 *
 * ■何が起きていたか（2026-08-12・オーナー「一本化して国内に合わせて」）
 *   `engine/transferMarket` はCPU同士の移籍を1本にまとめてあったのに、
 *   **自チームへ来る打診だけ**が `generateTransferActivity`（国内）と
 *   `generateForeignAndLoanOffers`（海外）の2本のままでした。
 *
 *     |              | 国内         | 海外          |
 *     |--------------|--------------|---------------|
 *     | 1レースの上限  | 2件          | **無し**       |
 *     | 来はじめ      | 3戦目から     | **1戦目から**  |
 *     | 提示額        | 相場の80〜105% | 相場の95〜140% |
 *
 *   実測（同じ世界を60年ぶん・1部）：
 *
 *     一本化する前         19.98件/年   1レース最多 5件   受信箱 平均7.55件（最多19件）
 *     一本化した直後(上限2)  14.00件/年   1レース最多 2件   受信箱 平均5.00件（最多10件）
 *     いま(上限1)           7.00件/年   1レース最多 1件   受信箱 平均2.50件（最多5件）
 *
 *   > 1レース2件も来たら一年に20件くらいくるだろそれ（オーナー・2026-08-12）
 *
 *   **231クラブが毎レース抽選するので上限は必ず埋まります。**
 *   つまり「1レースの上限 × 打診が来るレース数」がそのまま1年の件数です。
 *   目安は1シーズン5件くらい（オーナー）で、いまは 1部7件／2部5件／3部4件。
 *
 * ■この点検が守るもの
 *   ① 上限は**1つだけ**（国内＋海外を合わせて1レース1件）／**1年の件数もリテラルで留める**
 *   ② 開幕から2戦目までは1件も来ない（国内の線）
 *   ③ 海外クラブにも順番が回る（国内を先に並べて打ち切ると海外は永遠に0件）
 *   ④ 提示額の式は1本（海外だけ高く出す枝を戻していない）
 *   ⑤ 貸出の関数に買い取りの枝を戻していない
 *   ⑥ **強い選手には格上から声が掛かる**（2段以上格下は主力に声を掛けない）
 */
import { readFileSync } from 'node:fs'
import { generateTransferActivity } from '../src/engine/cpuMarket'
import { generateCpuRosters, generateForeignLeaguePlayers } from '../src/engine/playerGenerator'
import { INITIAL_TEAMS } from '../src/data/teams'
import { LOWER_DIVISION_TEAMS } from '../src/data/teamsLower'
import { FOREIGN_LEAGUES } from '../src/data/foreignLeagues'
import { drawSeasonSchedules } from '../src/data/races'
import { tierBudget, tierOf } from '../src/utils/clubTier'
import { calcTransferValue } from '../src/utils/playerUtils'
import { comparePlayers } from '../src/utils/playerSort'
import { wouldMakeLineup } from '../src/utils/squadNeeds'
import { TIER_FALL_LIMIT, playerTierOf, tierLines } from '../src/utils/playerTier'
import type { ForeignClub, IncomingOffer, Player, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const MY = 'tokyo'
const YEAR = 2030
const RUNS = 25

// ★国内チームにも `leagueId` を入れる。`Team` にも `leagueId?` があるので、
//   `'leagueId' in club` で国内／海外を分けると**国内の打診に fromForeign が付く**。
//   fixture がこれを持っていないと、その間違いは緑のまま通る（最初に書いた版がそうだった）
const teams: Team[] = ([...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS] as Team[])
  .map(t => ({ ...t, leagueId: 'jpel', country: 'JPN', finance: { ...t.finance, budget: tierBudget(t) } }))
// ★海外クラブは**名簿ごと**用意する。名簿が空のクラブは穴も序列も出せないので
//   1件も打診してこない＝「海外の枝を測っていない世界」で緑になる
const fg = generateForeignLeaguePlayers(FOREIGN_LEAGUES, YEAR)
const foreignClubs: ForeignClub[] = fg.updatedLeagues.flatMap(l =>
  l.clubs.map(c => ({ ...c, leagueId: l.id, finance: { budget: tierBudget(c as never) } }))) as ForeignClub[]
const foreignPlayers: Player[] = fg.players
// ★部ごとにレース数が違う（1部10戦・2部8戦・3部7戦）。**プレイヤーは3部から始まる**ので、
//   1部だけ測ると自分の部の答えしか出ない
const schedules = drawSeasonSchedules(YEAR)
const races = schedules[1]
const foreignIds = new Set(foreignClubs.map(c => c.id))

type Run = { fresh: IncomingOffer[]; raceIndex: number; run: number }
const rounds: Run[] = []
// ★選手IDは世界ごとに使い回されるので、値段を突き合わせるときは**同じ世界の名簿**だけを見る
//   （run 0 の名簿で run 5 の打診を割ると、別人の相場で割って6倍などになる）
const players0 = [...generateCpuRosters(teams, YEAR).cpuPlayers, ...foreignPlayers]
/** 世界ごとの名簿。[6] は序列を見るので、その打診が出た世界の名簿で引く */
const worldOf: { byId: Map<string, Player>; myRoster: Player[]; players: Player[] }[] = []
for (let run = 0; run < RUNS; run++) {
  const players = run === 0 ? players0 : [...generateCpuRosters(teams, YEAR - run).cpuPlayers, ...foreignPlayers]
  worldOf[run] = {
    players,
    byId: new Map(players.map(p => [p.id, p])),
    myRoster: players.filter(p => p.teamId === MY && p.status === 'active').sort(comparePlayers('ovr')),
  }
  let live: IncomingOffer[] = []
  for (let i = 0; i < races.length; i++) {
    const r = generateTransferActivity(
      players, teams, MY, i, [], live, [], new Set(), YEAR, races.length, foreignClubs,
      // この点検の世界はレース結果を持たないので「まだ分からない」を返す＝序列で見る
      () => ({ fraction: 0, teamRaces: 0 }))
    rounds.push({ fresh: r.incomingOffers.filter(o => !live.some(l => l.id === o.id)), raceIndex: i, run })
    live = r.incomingOffers
  }
}

// 打診（移籍金つき）だけを見る。フリー接触（offeredPrice 0）と出品への入札（inc-lst-）は別の枝
const buyOffers = (rs: Run[]) => rs.map(r => ({
  ...r, fresh: r.fresh.filter(o => o.offeredPrice > 0 && !o.id.startsWith('inc-lst-')) }))
const buys = buyOffers(rounds)
const allBuys = buys.flatMap(r => r.fresh)

console.log('[1] 上限は1つ（国内＋海外を合わせて1レース1件）')
{
  const maxPerRace = Math.max(...buys.map(r => r.fresh.length))
  check('1レースに増える打診は1件まで', maxPerRace <= 1, `最多 ${maxPerRace}件`)
  // ★母数の確認。1件も来ない世界なら上限を守っているのは当たり前
  check('そもそも打診は来ている（空振りの緑ではない）', allBuys.length > 0, `${allBuys.length}件`)
  check('上限にぶつかる回がある（緩い上限ではない）',
    buys.some(r => r.fresh.length === 1), `1件の回 ${buys.filter(r => r.fresh.length === 1).length}回`)
}

console.log('')
console.log('[1.5] **1年に来る件数**（上限だけ見ても「多すぎ」は防げない）')
{
  // ★上限を見るだけでは足りない。231クラブが毎レース抽選するので上限は必ず埋まり、
  //   1年の件数は「上限 × 打診が来るレース数」で決まる。**その積をリテラルで留める。**
  //   （上限2のとき1部で14件になっていて、上限の点検はそれでも緑だった）
  const perSeason = (div: number) => {
    const sch = schedules[div]
    let live: IncomingOffer[] = []
    let got = 0
    for (let i = 0; i < sch.length; i++) {
      const r = generateTransferActivity(
        players0, teams, MY, i, [], live, [], new Set(), YEAR, sch.length, foreignClubs,
        () => ({ fraction: 0, teamRaces: 0 }))
      got += r.incomingOffers
        .filter(o => !live.some(l => l.id === o.id) && o.offeredPrice > 0 && !o.id.startsWith('inc-lst-')).length
      live = r.incomingOffers
    }
    return got
  }
  const got = [1, 2, 3].map(perSeason)
  check('1部（10戦）は1年に7件', got[0] === 7, `${got[0]}件`)
  check('2部（8戦）は1年に5件', got[1] === 5, `${got[1]}件`)
  check('3部（7戦）は1年に4件', got[2] === 4, `${got[2]}件`)
}

console.log('')
console.log('[2] 開幕直後は来ない（OFFER_START_RACE=3）')
{
  const early = buys.filter(r => r.raceIndex < 3).flatMap(r => r.fresh)
  check('開幕3戦は0件', early.length === 0, `${early.length}件`)
  check('4戦目からは来る', buys.filter(r => r.raceIndex === 3).flatMap(r => r.fresh).length > 0)
}

console.log('')
console.log('[3] 海外クラブにも順番が回る（同じ1つの市場）')
{
  const fgn = allBuys.filter(o => foreignIds.has(o.fromTeamId)).length
  const dom = allBuys.length - fgn
  check('国内クラブから来ている', dom > 0, `${dom}件`)
  check('**海外クラブからも来ている**', fgn > 0, `${fgn}件`)
  // クラブ数は国内51（自分を除く）・海外180。並びをシャッフルしていないと海外は0件になる
  const share = fgn / Math.max(1, allBuys.length)
  check('海外の割合がクラブ数に見合っている（4割以上）', share >= 0.40, `${(share * 100).toFixed(0)}%`)
  check('海外の打診に fromForeign が付いている',
    allBuys.filter(o => foreignIds.has(o.fromTeamId)).every(o => o.fromForeign === true))
  check('国内の打診に fromForeign が付いていない',
    allBuys.filter(o => !foreignIds.has(o.fromTeamId)).every(o => !o.fromForeign))
}

console.log('')
console.log('[4] 提示額の式は1本（海外だけ高く出す枝を戻していない）')
{
  // 相場の80〜105%。1000万円刻みなので、丸めのぶん少しだけ広げて見る
  const byId = new Map(players0.map(p => [p.id, p]))
  // ★run 0 の打診だけを見る（上の注記のとおり、別の世界の選手は同じIDで別人）
  const ratios = buys.filter(r => r.run === 0).flatMap(r => r.fresh)
    .map(o => ({ o, p: byId.get(o.playerId) }))
    .filter((x): x is { o: IncomingOffer; p: Player } => !!x.p)
    // 1000万円刻みに丸めるので、丸めのぶん（+1000万）だけ広げて見る
    .map(x => (x.o.offeredPrice - 1_000_000) / Math.max(1, calcTransferValue(x.p)))
  check('比べられる打診がある', ratios.length > 0, `${ratios.length}件`)
  const hi = Math.max(...ratios)
  check('相場の1.05倍を超える打診が無い（夢・スターの割増を戻していない）', hi <= 1.05, `最高 ${hi.toFixed(2)}倍`)
  const lo = Math.min(...ratios)
  check('相場の0.7倍を下回る打診も無い（式が1本）', lo >= 0.7, `最低 ${lo.toFixed(2)}倍`)
}

console.log('')
console.log('[5] 生成する場所は1か所（貸出の関数に買い取りを戻していない）')
{
  const src = readFileSync('src/engine/cpuMarket.ts', 'utf-8')
  const loanFn = src.slice(src.indexOf('export function generateLoanOffers'),
    src.indexOf('export function generateTransferActivity'))
  check('貸出の関数を見つけられた', loanFn.length > 200)
  check('**貸出の関数が IncomingOffer を作っていない**', !/incomingOffers|foreignIncoming|expiresAtRace: raceIndex \+ 5/.test(loanFn))
  check('打診を作る push は1か所だけ',
    (src.match(/newIncoming\.push\(/g) ?? []).length === 3, // 打診・出品への入札・フリー接触の3枝
    `${(src.match(/newIncoming\.push\(/g) ?? []).length}か所`)
  check('海外だけの上限（foreignCapOf）が残っていない', !/foreignCapOf/.test(src))
}

console.log('')
console.log('[6] 声が掛かるのは、選手の格から離れすぎないクラブだけ')
{
  // オーナー・2026-08-15「強い選手は上から声かけれる仕様にして」／
  // 2026-08-20「どこでもエース級がわざわざ格下に行くの？」。
  // 線は移籍の同意（appraiseMove）と**同じ `utils/playerTier` 1本**。打診を作る側が
  // 別の線を持っていたころ、格下が主力に声を掛け→GMが承諾→本人が断る、という
  // 最初から決まっている往復で1レース1件の枠が潰れていた。
  const tierById = new Map<string, number>()
  for (const t of teams) tierById.set(t.id, tierOf(t))
  for (const c of foreignClubs) tierById.set(c.id, tierOf(c as never))
  const myTier = tierById.get(MY)!
  // ★**世界ごとに名簿が違う**ので、序列も選手の格も「その打診が出た世界」で引く
  const all = buys.flatMap(r => r.fresh.map(o => ({ o, run: r.run })))
    .map(x => ({
      p: worldOf[x.run].byId.get(x.o.playerId),
      roster: worldOf[x.run].myRoster,
      run: x.run,
      tier: tierById.get(x.o.fromTeamId) ?? 20,
    }))
    .filter((x): x is { p: Player; roster: Player[]; run: number; tier: number } => !!x.p)
  const linesOf = new Map<number, number[]>()
  const ptOf = (x: { p: Player; run: number }) => {
    let l = linesOf.get(x.run)
    if (!l) { l = tierLines(worldOf[x.run].players, (id: string) => tierById.get(id) as never); linesOf.set(x.run, l) }
    return playerTierOf(x.p, l)
  }
  const starters = all.filter(x => wouldMakeLineup(x.roster, x.p))
  const farBelow = all.filter(x => x.tier - ptOf(x) >= TIER_FALL_LIMIT)
  console.log(`      自チーム格${myTier} / 打診 ${all.length}件（うち主力 ${starters.length}件・選手の格から${TIER_FALL_LIMIT}段以上下から ${farBelow.length}件）`)
  // ★空振り除け。打診が1件も無い世界だと何を見ても当たり前に緑になる
  check('主力への打診が来ている（空振りの緑ではない）', starters.length > 0, `${starters.length}件`)
  const bad = all.filter(x => x.tier - ptOf(x) > TIER_FALL_LIMIT)
  check(`選手の格から${TIER_FALL_LIMIT}段より下のクラブから声が掛かっていない`,
    bad.length === 0, `${bad.length}件`)
  // 線を別に作っていないか
  const src = readFileSync('src/engine/cpuMarket.ts', 'utf-8')
  check('線は utils/playerTier 1本（数字を手書きしていない）',
    /inTierBand\(/.test(src) && !/tier - myTier >= [0-9]/.test(src))
}

console.log('')
console.log(failed === 0 ? '\n✓ 自チームへの打診は国内も海外も1本（上限も1つ）\n' : `\n✗ ${failed}件\n`)
process.exit(failed === 0 ? 0 : 1)
