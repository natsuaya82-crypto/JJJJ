// オフシーズンにCPUクラブ同士が動くところ。`beginSeasonDraft` から切り出した（挙動不変）。
//
// ■なぜ切り出すのか
//   `beginSeasonDraft` は456行あるが、**ドラフトの処理は60行ほどしかない**。
//   残りは「解雇 → CPU間移籍 → CPU間トレード → レンタル → FA補強」という
//   オフシーズンの市場そのもので、ドラフトとは別の話が同じボタンにぶら下がっている。
//   「なぜあのクラブがあの選手を手放したのか」を追うとき、`beginSeasonDraft` を
//   開く人はいない。
//
// ■まず出したのはトレードだけ
//   golden（`draft-flow`）がどの枝を通っているかを枝ごとに壊して確かめたところ、
//   **トレードだけ壊しても差分が出なかった**＝一度も成立していない（`docs/BACKLOG.md` A-7）。
//   網の外にある処理を店子のまま触るのが一番危ないので、ここを先に関数にして
//   直接呼べるようにし、`scripts/check-cpu-trade.ts` で成立側に網を張った。
import { tradeBalance, type TradeValueCtx } from '../utils/tradeValue'
import { hasNoPlayingTime } from '../utils/transferDecision'
import { isOwnedBy } from '../utils/transferEligibility'
import { comparePlayers } from '../utils/playerSort'
import { domesticCpuTeamIds } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { calcTransferValue } from '../utils/playerUtils'
import { needsPlayer, wouldMakeLineup } from '../utils/squadNeeds'
import type { Player, Team, TransferRecord } from '../types'

/** 1軍の登録上限。ここまで埋まっているクラブは、もらう側にならない */
const TRADE_BUYER_ROSTER_MAX = 23
/** 売り手の上位何人を保護するか（エース級は出さない） */
const TRADE_SELLER_PROTECTED = 3

/**
 * CPU同士の交換（お金が足りなくても、価値の近い選手同士なら動く）。
 *
 * 成立の条件は「**もらう側では走れて、出す側では走れない**」。両方が得をする交換だけを
 * 通すので、片方が明らかに損をする組み合わせは `tradeBalance` で落ちる。
 *
 * ★1クラブにつき1オフ1件まで（買い手としても売り手としても）。
 * ★`excludeIds` は**その場で書き足す**。呼び出し側はこの後のレンタルで同じ集合を見るので、
 *   ここで動いた選手が続けて貸し出されないようにするため（1オフ1移動）。
 */
export function runCpuTrades(
  world: { players: Player[]; teams: Team[] },
  ctx: {
    playerTeamId: string
    year: number
    tradeValueCtx: TradeValueCtx
    /** 同じオフに既に動いた選手。**呼び出し側と共有し、ここで書き足す** */
    excludeIds: Set<string>
  },
): { players: Player[]; teams: Team[]; records: TransferRecord[] } {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const tradedIds = ctx.excludeIds
  const tradeCount: Record<string, number> = {}
  const cpuIds = domesticCpuTeamIds(players, world.teams, ctx.playerTeamId)

  for (const buyerId of cpuIds) {
    if ((tradeCount[buyerId] ?? 0) >= 1) continue
    const buyRoster = players.filter(p => p.teamId === buyerId && p.status === 'active')
    if (buyRoster.length >= TRADE_BUYER_ROSTER_MAX) continue
    // 出すのは「自分のところで出番が無い選手」（transferDecision の hasNoPlayingTime 1本）。
    // 以前はここに平均OVRから作った下限表（74/67/60）があった＝格とは別の物差し
    const buyerRanked = [...buyRoster].sort(comparePlayers('ovr'))
    const buyerSurplus = buyerRanked
      // レンタルで借りている選手は保有権が無いのでトレードに出せない
      .filter((p, i) => isOwnedBy(p, buyerId) && !tradedIds.has(p.id) && p.joinedYear !== ctx.year && hasNoPlayingTime(i + 1))
      .sort((a, b) => calcTransferValue(b) - calcTransferValue(a))
    if (buyerSurplus.length === 0) continue
    const offered = buyerSurplus[0]

    for (const sellerId of cpuIds) {
      if (sellerId === buyerId || (tradeCount[sellerId] ?? 0) >= 1) continue
      const sellRoster = players
        .filter(p => p.teamId === sellerId && p.status === 'active')
        .sort(comparePlayers('ovr'))
      // もらう側で走れて、出す側では走れない選手＝両方が得をする交換（squadNeeds 1本）。
      // 釣り合いは utils/tradeValue の tradeBalance 1本（以前はここだけ「×1.3」と直書きで、
      // 自チームのトレードが通る tradeValue.ts とは別の判定になっていた）
      const target = sellRoster.slice(TRADE_SELLER_PROTECTED).find((p, i) =>
        isOwnedBy(p, sellerId) &&
        !tradedIds.has(p.id) &&
        p.joinedYear !== ctx.year &&
        wouldMakeLineup(buyRoster, p) && hasNoPlayingTime(i + TRADE_SELLER_PROTECTED + 1) &&
        tradeBalance({ outPlayers: [offered], inPlayers: [p] }, ctx.tradeValueCtx).ok
      )
      // 売り手が受け取る側でも使えること（needsPlayer / wouldMakeLineup）
      if (!target || !(needsPlayer(sellRoster, offered) || wouldMakeLineup(sellRoster, offered))) continue
      tradedIds.add(offered.id); tradedIds.add(target.id)
      tradeCount[buyerId] = (tradeCount[buyerId] ?? 0) + 1
      tradeCount[sellerId] = (tradeCount[sellerId] ?? 0) + 1
      // 交換する2人とも movePlayer に通す（自チームのトレードと同じ後始末）
      for (const [pid, toId] of [[offered.id, sellerId], [target.id, buyerId]] as const) {
        const m = movePlayer({ players, teams }, pid, toId, {
          year: ctx.year,
          date: `${ctx.year}-02-01`,
          kind: 'trade' })
        if (!m.ok) continue
        players = m.players
        teams = m.teams
        if (m.record) records.push(m.record)
      }
      break
    }
  }
  return { players, teams, records }
}
