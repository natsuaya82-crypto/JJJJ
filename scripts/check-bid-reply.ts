/**
 * 【出した入札には必ず返事が来る】
 *
 * ■なぜ要るのか（オーナー・2026-08-15）
 *   「移籍オファー送ってるのに何週経っても返事来ないのと、勝手に選手移籍してるのはなに？」
 *
 *   入札は**1レースで必ず決着します**（`pending` は必ず
 *   `fee_accepted` / `countered` / `rejected` / `failed` のどれかになる）。
 *   ところが終わり方のうち3つが**通知を出していませんでした**。
 *
 *   | 終わり方 | 何が起きた | 前 |
 *   |---|---|---|
 *   | `rejected`（額不足・通常） | 提示額が足りない | **通知なし** |
 *   | `rejected`（額不足・出品中） | 希望額に届かない | **通知なし** |
 *   | `failed` | 話している間に相手が他所へ移った | **通知なし** |
 *
 *   札は一覧からも消える（「出したオファー」は pending / countered / player_neg しか
 *   出さない）ので、遊ぶ側からは**送ったのに永久に返事が来ない**ように見え、
 *   さらに狙っていた選手が別のクラブに居るので**勝手に移籍した**ように見えます。
 *   2つの訴えは同じ1か所が原因でした。
 *
 *   主力ガード（`locked`）のときだけは「黙って却下すると入札が消えたようにしか
 *   見えない」と気づいて通知していたのに、**同じことが起きる額不足の枝が
 *   2つとも漏れて**いました。
 *
 * ■来季まで交渉できなくなるのは「決裂した」ときだけ
 *   額が足りない・競り負けた・相手が移った、は**そのときの事情**なので、また出せます。
 *   判定は `engine/bidResolution` の `locksNegotiation` 1本。
 *   以前は本編の1戦とサブの1戦に別々に書いてあり、**サブ側は競り負けても
 *   来季までロック**していました（同じ入札が進め方で違う結果になる）。
 */
import { readFileSync } from 'node:fs'
import { resolveBid } from '../src/utils/transferBid'
import { locksNegotiation } from '../src/engine/bidResolution'
import { EXPIRED_NEG_TEXT } from '../src/utils/notifItems'
import type { ExpiredNegKind, Player, TransferBid } from '../src/types'

let failed = 0
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`  ${ok ? 'ok' : 'NG'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`)
  if (!ok) failed++
}

const P = (over: Partial<Player> = {}): Player => ({
  id: 'p1', name: '田中 太郎', teamId: 'b', age: 26, specialty: 'pacemaker',
  nationality: 'JPN', status: 'active',
  ratings: { speed: 70, stamina: 70, mountainUp: 70, mountainDown: 70, pacing: 70, mental: 70, recovery: 70 },
  potential: 80, growthCurve: 'normal', morale: 60, fatigue: 0,
  // ★**入団年を入れること。** 無いと「ドラフト当年の新人」扱いになり、
  //   主力ガード（keyPlayerStatus が 'locked'）で門前払いの枝に落ちて、
  //   額不足の枝を1行も通らない＝この点検が空振りする（実際に一度そうなった）
  draftYear: 2020,
  contract: { annualSalary: 10_000_000, yearsLeft: 3 },
  ...over,
} as unknown as Player)

const BID = (over: Partial<TransferBid> = {}): TransferBid => ({
  id: 'bid1', playerId: 'p1', targetTeamId: 'b', offeredFee: 1_000_000,
  round: 1, status: 'pending', submittedAtRace: 0, ...over,
} as TransferBid)

const CTX = (players: Player[], rand = 0.5) => ({
  players, listings: [],
  currentSeason: { year: 2030, races: [], eclSeries: undefined },
  pastSeasons: [] as never,
  raceIndex: 1,
  rand: () => rand,
})

console.log('[1] 出した入札は1レースで必ず決着する（pending のまま残らない）')
{
  const r = resolveBid(BID(), CTX([P()]) as never)
  check('pending のままにならない', r.bid.status !== 'pending', r.bid.status)
}

console.log('\n[2] **どの終わり方でも必ず返事が来る**')
{
  // ① 額が足りない（いちばんよく通る道）
  const low = resolveBid(BID({ offeredFee: 1_000_000 }), CTX([P()]) as never)
  check('額不足で断られたら通知が出る', low.bid.status === 'rejected' && !!low.expired,
    `${low.bid.status} / 通知${low.expired ? 'あり' : 'なし'}`)
  check('その通知は「断られた」種類', low.expired?.kind === 'bid_rejected', String(low.expired?.kind))

  // ② 話している間に相手が他所へ移った
  const gone = resolveBid(BID(), CTX([P({ teamId: 'zzz' })]) as never)
  check('相手が他所へ移ったら通知が出る', gone.bid.status === 'failed' && !!gone.expired,
    `${gone.bid.status} / 通知${gone.expired ? 'あり' : 'なし'}`)
  check('その通知は「他所へ移った」種類', gone.expired?.kind === 'bid_gone', String(gone.expired?.kind))

  // ③ 費用合意のあとに相手が他所へ移った
  const goneAfter = resolveBid(BID({ status: 'fee_accepted', feeAcceptedAtRace: 1 }), CTX([P({ teamId: 'zzz' })]) as never)
  check('費用合意のあとでも、移っていたら通知が出る', !!goneAfter.expired, String(goneAfter.expired?.kind))

  // ★空振り除け。通知が出ない終わり方が残っていないか、まとめて見る
  const outcomes = [low, gone, goneAfter]
  check('終わり方を3通り試せている（空振りの緑ではない）',
    new Set(outcomes.map(o => o.bid.status)).size >= 2)
}

console.log('\n[3] 文面がある（種類を足して文面を足し忘れていない）')
{
  for (const k of ['bid', 'bid_rejected', 'bid_gone', 'outbid'] as ExpiredNegKind[]) {
    const t = EXPIRED_NEG_TEXT[k]
    check(`${k} の文面がある`, !!t && t.title('◯◯').length > 0 && t.note.length > 0)
  }
  // ★**文面と判定が食い違わないこと。** 「来季まで交渉できません」と書いてあるのに
  //   交渉できる（またはその逆）を防ぐ。判定は locksNegotiation 1本なので突き合わせる
  for (const k of ['bid', 'bid_rejected', 'bid_gone', 'outbid'] as ExpiredNegKind[]) {
    const says = EXPIRED_NEG_TEXT[k].note.includes('来季まで交渉できません')
    check(`${k} の文面と判定が合っている`, says === locksNegotiation(k),
      `文面「${EXPIRED_NEG_TEXT[k].note}」/ 止める=${locksNegotiation(k)}`)
  }
}

console.log('\n[4] 来季まで交渉できなくなるのは「決裂した」ときだけ（locksNegotiation 1本）')
{
  check('主力ガードで門前払いは止める', locksNegotiation('bid'))
  // ★オーナー・2026-08-19「額が足りないのも、そんな額では移籍できません。交渉決裂で終わりでしょ」
  check('額が足りずに断られたら止める', locksNegotiation('bid_rejected'))
  // ★この2つを止めないのは、選手がもう相手クラブへ移っていて、どのみち
  //   `isTransferLocked`（移籍したばかり・2年）でオファーを出せないから
  check('競り負けは止めない（相手クラブへ移っている）', !locksNegotiation('outbid'))
  check('相手が他所へ移ったのは止めない', !locksNegotiation('bid_gone'))
  // 種類が入っていない古いセーブは、元々入札ぶんだけだったので入札として扱う
  check('種類が無いときは入札として扱う（古いセーブ）', locksNegotiation(undefined))
}

console.log('\n[5] 進め方で結果が変わらない（本編の1戦とサブの1戦が同じ判断を通す）')
{
  const sub = readFileSync('src/store/slices/competitionSlice.ts', 'utf8')
  check('サブの1戦も locksNegotiation を通す', /locksNegotiation\(r\.expired\.kind\)/.test(sub))
  // ★ここが本体。無条件で積む形に戻ったら落とす
  check('無条件で来季までロックする形に戻っていない',
    !/expiredNegs\.push\(r\.expired\)\s*\n\s*lockedIds\.push\(/.test(sub))
  const eng = readFileSync('src/engine/bidResolution.ts', 'utf8')
  check('本編の1戦も同じ関数を通す', /locksNegotiation\(r\.expired\.kind\)/.test(eng))
  check('種類の一覧は1か所だけ', (eng.match(/NO_LOCK_KINDS/g) ?? []).length === 2)
}

console.log('')
if (failed > 0) { console.log(`✗ 出した入札の返事が返らない・扱いが揃っていません（${failed}件）`); process.exit(1) }
console.log('✓ どの終わり方でも返事が来る。来季まで止まるのは決裂したときだけ')
