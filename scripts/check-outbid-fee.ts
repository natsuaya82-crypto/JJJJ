/**
 * 【競り勝ったクラブは、海外でも移籍金を払う】
 *
 * ■なぜ要るのか（2026-08-16・オーナー「なんで手書きしてんの？」の調べで発覚）
 *   `movePlayer` は `teams`（国内52クラブ）しか知りません。相手が海外クラブのときは
 *   `utils/clubMoney` の `settleForeignFee` を **`movePlayer` のすぐ外で**呼ばないと、
 *   **片側しかお金が動きません**（CLAUDE.md の決まり）。
 *
 *   自チームが売る道（`marketOps` / `marketSlice`）には入っていたのに、
 *   **CPU間の売買と、入札に競り負けて選手を持っていかれる道**（`engine/applyTransfers`）
 *   には1行も入っていませんでした。つまり
 *
 *     海外クラブは、移籍金を払わずに選手を持っていける
 *
 *   状態でした。しかも `runRace` は `foreignLeagues` を state に**一度も書き戻して
 *   いなかった**ので、精算しても捨てられます。両方直しました。
 *
 * ■この点検が守るもの
 *   世界を1つ作って**実際に競り負けさせ**、海外クラブの手元資金が移籍金ぶん
 *   減っていることを見ます。関数を叩くだけだと「呼んでいるか」しか分かりません。
 */
import { readFileSync } from 'node:fs'
import { applySettledTransfers } from '../src/engine/applyTransfers'
import type { ForeignClub, ForeignLeague, Player, Season, Team } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const YEAR = 2030
const FEE = 200_000_000

const P = (id: string, teamId: string): Player => ({
  id, name: `名${id}`, teamId, age: 26, specialty: 'pacemaker', nationality: 'JPN', status: 'active',
  ratings: { speed: 80, stamina: 80, mountainUp: 80, mountainDown: 80, pacing: 80, mental: 80, recovery: 80 },
  potential: 88, growthCurve: 'normal', morale: 60, fatigue: 0, draftYear: 2020,
  contract: { annualSalary: 20_000_000, yearsLeft: 3 },
} as unknown as Player)

const T = (id: string): Team => ({
  id, name: id, shortName: id, tier: 8,
  colors: { primary: '#111', secondary: '#eee' },
  finance: { budget: 1_000_000_000 },
} as unknown as Team)

const FC = (id: string): ForeignClub => ({
  id, name: id, shortName: id, tier: 3, country: 'KEN',
  finance: { budget: 1_000_000_000 },
} as unknown as ForeignClub)

const leaguesOf = (clubs: ForeignClub[]): ForeignLeague[] =>
  [{ id: 'eaf', name: '東アフリカ', country: 'KEN', clubs } as unknown as ForeignLeague]

const SEASON = { year: YEAR, races: [], eclSeries: undefined } as unknown as Season

/** 競り負けを1件だけ流して、海外クラブの手元資金がどうなるかを返す */
function runOutbid(toClubId: string, leagues: ForeignLeague[]) {
  const players = [P('p1', 'home')]
  const teams = [T('home'), T('other')]
  return applySettledTransfers({
    origPlayers: players, players, teams, foreignLeagues: leagues,
    currentSeason: SEASON, listings: [], txList: [],
    outbidMoves: [{ playerId: 'p1', toTeamId: toClubId, fee: FEE, playerName: '名p1', clubName: toClubId }],
    playerTeamId: 'me', raceDate: `${YEAR}-05-01`, raceClock: 3,
    // 本人はどこへでも行く（ここで見たいのはお金の動きだけ）
    destinationOf: () => ({ tier: 1, squadRank: 1, isForeign: true, region: 'africa' } as never),
  } as never)
}

console.log('[1] 海外クラブが競り勝ったら、そのクラブの資金から移籍金が引かれる')
{
  const before = FC('ken1')
  const out = runOutbid('ken1', leaguesOf([before]))
  const after = out.foreignLeagues[0].clubs.find(c => c.id === 'ken1')!
  const paid = (before.finance?.budget ?? 0) - (after.finance?.budget ?? 0)
  console.log(`      ken1 の手元資金 ${before.finance?.budget} → ${after.finance?.budget}`)
  // ★空振り除け。そもそも選手が動いていない世界だと、お金が動かないのは当たり前
  check('選手が実際に動いている（空振りの緑ではない）',
    out.players.find(p => p.id === 'p1')?.teamId === 'ken1',
    String(out.players.find(p => p.id === 'p1')?.teamId))
  check('移籍金ぶん減っている', paid === FEE, `${paid}円`)
}

console.log('\n[2] 国内クラブが競り勝ったときは、海外の資金は動かない')
{
  const before = FC('ken1')
  const out = runOutbid('other', leaguesOf([before]))
  const after = out.foreignLeagues[0].clubs.find(c => c.id === 'ken1')!
  check('無関係な海外クラブの資金は変わらない',
    (after.finance?.budget ?? 0) === (before.finance?.budget ?? 0))
  check('国内クラブへは動いている', out.players.find(p => p.id === 'p1')?.teamId === 'other')
}

console.log('\n[3] 精算した結果を捨てていない（呼ぶ側が state に戻している）')
{
  const race = readFileSync('src/store/slices/raceSlice.ts', 'utf8')
  // ★ここが本体。`runRace` は長いあいだ foreignLeagues を**一度も書き戻していなかった**
  check('runRace が applied.foreignLeagues を state に戻す',
    /foreignLeagues: applied\.foreignLeagues/.test(race))
  const apply = readFileSync('src/engine/applyTransfers.ts', 'utf8')
  check('CPU間売買のあとに精算する', /settleForeignFee\(leaguesAfterFees, tx\./.test(apply))
  check('競り負けのあとにも精算する', /settleForeignFee\(leaguesAfterFees, before\?\./.test(apply))
  // 「国内同士なら何も起きない」ので、呼ぶ側で分岐しないこと（CLAUDE.md）
  check('呼ぶ側で「海外なら」と分岐していない',
    !/isForeign[\s\S]{0,60}settleForeignFee/.test(apply))
}

console.log('')
if (failed > 0) { console.log(`✗ 海外クラブが移籍金を払わずに選手を得られます（${failed}件）`); process.exit(1) }
console.log('✓ 競り勝ったクラブは、海外でも移籍金を払う')
