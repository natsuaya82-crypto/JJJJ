// 契約更新の要求と、引退の直訴を作る。marketSlice から切り出した（挙動不変）。
//
// ■触るときの注意
//   - **引退の話が湧くかどうかに `Math.random` を使わないこと。** この処理はチャットを
//     開くたびに走るので、乱数だと開き直すだけで何度も抽選が回り、35歳以上が次々に
//     引退を言い出す。「選手ID＋年＋消化レース数」のハッシュで、同じレース内なら
//     何度開いても同じ結果になるようにしてある（`utils/hash` の `strHash`）
//   - **直訴の札は1人1つ。** 移籍希望・海外挑戦希望を出したままの選手を引退の抽選に
//     入れると、同じ選手の札が2枚になる（判定は `utils/talkSync` の `openWishIds`）
//   - **引退の話をしている選手には契約更新の話を出さない。** 以前は別々に選んでいて、
//     同じ選手から「引退したい」と「契約を更新したい」が同時に来ていた。
//     いまこの場で引退を言い出したぶんも外すこと
//   - 更新できるかの判定は `utils/contractTalk` の `canRequestRenewal` 1本
//     （借り物・引退の話・海外承認・退団予定・更新ロック・フリー接触中をまとめて見る）
//   - 要求額は「市場価値 × 性格」。**旧仕様の『現年俸×1.2の自動昇給』は廃止のまま。**
//     走っていない選手は減額しか要求できない
//   - 移籍希望はここでは作らない（レース進行時の `generateTransferWishes`）
import { canRequestRenewal, contractTalkCtx, hasContractTalk } from '../utils/contractTalk'
import { strHash } from '../utils/hash'
import { faMarketSalary, seasonPerfProfile } from '../utils/playerUtils'
import { openWishIds } from '../utils/talkSync'
import { isOwnedBy } from '../utils/transferEligibility'
import type { ContractRequest, GameState, Player } from '../types'

export function buildContractRequests(args: {
  players: Player[]
  currentSeason: GameState['currentSeason']
  playerTeamId: string
}): { newReqs: ContractRequest[]; newRet: { playerId: string; age: number }[] } | null {
  const { players, currentSeason, playerTeamId } = args

  const racesPlayed = currentSeason.currentRaceIndex ?? 0
  if (racesPlayed === 0) return null
  // 借りている選手の引退話も出さない（引退を受理しても保有クラブに戻るだけ）
  const retPlayers = players.filter(p => isOwnedBy(p, playerTeamId) && p.age >= 35)
  const existRet = new Set((currentSeason.retirementRequests ?? []).map(r => r.playerId))
  // 直訴の札は1人1つ（判定は talkSync の openWishIds）。移籍希望・海外挑戦希望を
  // 出したままの選手は引退の抽選に入れない。入れると同じ選手の札が2枚になる
  const openWish = openWishIds(currentSeason)
  // 引退の話が湧くかどうかは Math.random ではなく「選手ID＋年＋消化レース数」から決める。
  // この関数はチャットを開くたびに走るので、乱数だと開き直すだけで何度も抽選が回り、
  // 35歳以上が次々に引退を言い出していた。同じレース内なら何度開いても結果は同じにする
  const retRoll = (id: string) => strHash(`${id}|${currentSeason.year}|${racesPlayed}`) % 100
  // 今季すでに引き留めた選手は再抽選しない
  const newRet = retPlayers.filter(p => !openWish.has(p.id) && p.retirementDeclinedYear !== currentSeason.year && p.pendingRetirementYear == null && retRoll(p.id) < 40).map(p => ({ playerId: p.id, age: p.age }))
  // 引退の話をしている選手には契約更新の話を出さない。この2つは別々に選んでいたので、
  // 同じ選手から「引退したい」と「契約を更新したい」が同じタイミングで来ていた。
  // 今この場で引退を言い出した分（newRet）も含めて外す
  const retiringIds = new Set([...existRet, ...newRet.map(r => r.playerId)])
  // 判定は contractTalk の1本だけ（借り物・引退の話・海外承認・退団予定・更新ロック・
  // フリー接触中）。今この場で引退を言い出した分も retiringIds に含めて外す
  const gcrCtx = { ...contractTalkCtx(currentSeason, playerTeamId), retiringIds }
  // 「今季すでに交渉した選手」には再生成しない（開き直しでround 1に戻るのを防ぐ）。
  // 期限切れの札はもう残らないので、ここに引っかかるのは本当に応対した話だけ
  const myPlayers = players.filter(p => canRequestRenewal(p, gcrCtx)
    && p.contract.yearsLeft === 1
    && !hasContractTalk(gcrCtx.contractRequests, p.id))
  const seasonRaces = currentSeason.races ?? []
  const newReqs: ContractRequest[] = myPlayers.map(p => {
    const personality = p.personality ?? 'salary'
    // 要求額は「市場価値 × 性格」で決める。
    // 市場価値(faMarketSalary)＝素体(OVR×年齢)×実績倍率で、実績倍率の中に
    // 今季の出場割合・平均区間順位・区間賞と、通算の出走/区間賞/優勝/MVPが入っている。
    // 旧仕様の『現年俸×1.2の自動昇給』は廃止のまま。走っていない選手は減額しか要求できない。
    const market = faMarketSalary(p, seasonPerfProfile(p.id, seasonRaces, racesPlayed))
    const persoFactor = personality === 'salary' ? 1.05 : personality === 'winning' ? 1.0 : 0.95
    const demand = Math.max(3_000_000, market * persoFactor)
    return {
      id: `cr_${Date.now()}_${p.id}`,
      playerId: p.id,
      initiatedBy: 'player' as const,
      round: 1,
      status: 'pending_gm' as const,
      expiresAtRace: racesPlayed + 6,
      demandSalary: Math.round(demand / 500000) * 500000,
      demandYears: personality === 'loyalty' ? 3 : 2,
      offerSalary: 0,
      offerYears: 0 }
  })

  if (newReqs.length === 0 && newRet.length === 0) return null
  return { newReqs, newRet }
}
