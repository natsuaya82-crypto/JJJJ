/**
 * 【競り勝ったクラブは、海外でも移籍金を払う】
 *
 * ■なぜ要るのか（2026-08-16・オーナー「なんで手書きしてんの？」の調べで発覚）
 *   当時の `movePlayer` は日本のリーグのクラブのお金しか動かさず、相手が海外クラブのときは
 *   呼ぶ側が海外の側を別に精算する形（`settleForeignFee`・2026-09-25 に廃止）でした。
 *   いまは `movePlayer` が `utils/clubMoney` の `payBetween` で両側を動かします。
 *
 *   当時、自チームが売る道（`marketOps` / `marketSlice`）には入っていたのに、
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
import { divisionLeagueId } from '../src/utils/world'
import type { ForeignClub, Player, Season, Team, WorldClub } from '../src/types'

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
  id, name: id, shortName: id, tier: 8, leagueId: divisionLeagueId(1),
  colors: { primary: '#111', secondary: '#eee' },
  finance: { budget: 1_000_000_000 },
} as unknown as Team)

const FC = (id: string): ForeignClub => ({
  id, name: id, shortName: id, tier: 3, country: 'KEN', leagueId: 'africa_east',
  finance: { budget: 1_000_000_000 },
} as unknown as ForeignClub)


const SEASON = { year: YEAR, races: [], eclSeries: undefined } as unknown as Season

/** 競り負けを1件だけ流して、海外クラブの手元資金がどうなるかを返す */
function runOutbid(toClubId: string, foreign: ForeignClub[]) {
  const players = [P('p1', 'home')]
  const clubs: WorldClub[] = [T('home'), T('other'), ...foreign]
  return applySettledTransfers({
    origPlayers: players, players, clubs,
    currentSeason: SEASON, listings: [], txList: [],
    outbidMoves: [{ playerId: 'p1', toTeamId: toClubId, fee: FEE, playerName: '名p1', clubName: toClubId }],
    playerTeamId: 'me', raceDate: `${YEAR}-05-01`, raceClock: 3,
    // 本人はどこへでも行く（ここで見たいのはお金の動きだけ）
    destinationOf: () => ({ tier: 1, squadRank: 1, isForeign: true, region: 'africa' } as never),
    // 行き先は格1で固定なので、選手の格も1（＝落ちる話ではない）を返す
    playerTierOf: () => 1 as never,
  } as never)
}

console.log('[1] 海外クラブが競り勝ったら、そのクラブの資金から移籍金が引かれる')
{
  const before = FC('ken1')
  const out = runOutbid('ken1', [before])
  const after = out.clubs.find(c => c.id === 'ken1')!
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
  const out = runOutbid('other', [before])
  const after = out.clubs.find(c => c.id === 'ken1')!
  check('無関係な海外クラブの資金は変わらない',
    (after.finance?.budget ?? 0) === (before.finance?.budget ?? 0))
  check('国内クラブへは動いている', out.players.find(p => p.id === 'p1')?.teamId === 'other')
}

console.log('\n[3] 精算した結果を捨てていない（呼ぶ側が state に戻している）')
{
  const race = readFileSync('src/store/slices/raceSlice.ts', 'utf8')
  // ★ここが本体。`runRace` は長いあいだ foreignLeagues を**一度も書き戻していなかった**
  //   いまはクラブが1つの並び（clubs）なので、applied.clubs を受け取り → 次の処理へ渡し →
  //   最後に state の clubs へ書く、の鎖が切れていないことを見る
  check('runRace が applied.clubs を state に戻す',
    /clubsWithCpuTx = applied\.clubs/.test(race)
    && /clubs: clubsWithCpuTx/.test(race)
    && /clubsAfterLoan = loanResult\.clubs/.test(race)
    && /let clubsAfterFreeMoves = clubsAfterLoan/.test(race)
    && /^\s*clubs: clubsAfterFreeMoves,/m.test(race))
  const apply = readFileSync('src/engine/applyTransfers.ts', 'utf8')
  // 移籍金は movePlayer が両側で動かす（utils/clubMoney の payBetween）。その結果を捨てない
  check('CPU間売買と競り負けの2つとも movePlayer の結果のクラブを受け取る',
    (apply.match(/clubsNow = m\.clubs\n/g) ?? []).length === 2)
  check('  お金を止める money: false を渡していない', !/money:\s*false/.test(apply))
}

console.log('')
if (failed > 0) { console.log(`✗ 海外クラブが移籍金を払わずに選手を得られます（${failed}件）`); process.exit(1) }
console.log('✓ 競り勝ったクラブは、海外でも移籍金を払う')
