import { transferCapOf } from '../data/economy'
import type { GameStore, SetGame } from './gameStore'
import { appendChatLog } from '../utils/chatLog'
import { saleAnswers, keepSaleAnswers } from '../utils/saleAnswer'

// 移籍・交渉の「取引の実行」ヘルパー（gameStore から移設）。
// 判定そのものは utils/transferDecision・utils/transferBid が正。ここは
// 合意後に選手を動かし、チャットとニュースへ書く「実行役」だけを持つ。

import { counterCeiling } from '../data/economy'

import { type GameState, type Player } from '../types'
import { MAJOR_NEWS_OVR, isBigClub, isStepUp, isWorldChallenge } from '../utils/clubTier'
import { clubById, isJpelLeague, jpelClubById, myClub, myLeagueRaces } from '../utils/world'
import { bigClub, findClub } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { clubLabel, overseasMoveHeadline, soldPlayerHeadline } from '../utils/newsItems'
import { marketValueOf, ovr } from '../utils/playerUtils'
import { type PlayRateWorld } from '../utils/playRate'
import { type TradeValueCtx } from '../utils/tradeValue'

// 指名権のバックフィル判定。「自分が今持っているか」ではなく「どこかのチームが保有しているか」で見る。
// 売却・トレード済みの指名権を「欠落」と誤認して再生成（複製）しないため。
export function tradeValueCtxOf(state: Pick<GameState, 'currentSeason' | 'clubs' | 'players'>): TradeValueCtx {
  return {
    // 出場は各選手の**クラブの日程**で数える（playerUtils の perfOf 1本。marketValueOf と同じ）
    world: state,
    // 出す側での序列（＝余剰か）を数えるために要る。渡さないと全員が主力扱いになり、
    // 現金の移籍と値段が食い違う
    players: state.players }
}


// `faAllowedDespiteBan` は `utils/bidGate` へ移しました（画面の「押せるか」も同じ門を通すため）。

// レースのタイム計算に乗せる補正をまとめて適用した選手配列を返す。
//   1) 戦術分析室：所属チームの施設Lvぶん「ペース配分」「メンタル」を強化
//      （以前は全7能力に+Lvしていて実質OVR+5相当と壊れ性能だったため2能力に限定）
//   2) 国籍ケミストリー：自チームの出走メンバーの最多国籍が7人以上なら、その国籍の選手の士気を加算
// 以前は runRace の中だけでこの補正を作っていたが、リーグ戦は画面側（interactiveRace）で
// タイムを計算してから preComputedResults として渡すため、補正が一切反映されていなかった。
// 画面と store の両方からこの関数を呼ぶことで、施設とケミストリーの効果を必ず効かせる。
/**
 * 逆提示に相手が応じられる上限。**国内も海外も同じ**（オーナー・2026-09-15
 * 「海外とか日本とかもう差分がないんだから一本化して」）。
 *
 * ★以前は `if (offer.fromForeign) return ceil` で**海外クラブだけ予算を見ず青天井**でした。
 *   理由は「海外クラブは国内の入れ物に居ないので予算を見ない」でしたが、**その前提はもう
 *   ありません**——海外クラブの資金も `finance.budget` 1本で、他所（`engine/cpuMarket` /
 *   `utils/transferRivals` / `engine/transferMarket`）は全部 `transferCapOf(budget)` を
 *   通しています。ここだけ残っていたので、国内52クラブだけが予算をやりくりし、
 *   海外180クラブは常に上限いっぱい払えていました。
 *   クラブは `utils/clubs` の `findClub` 1本で引く（国内・海外を区別しない引き方）。
 */
export function willingFeeFor(
  state: PlayRateWorld,
  offer: { fromTeamId: string; offeredPrice: number; fromForeign?: boolean },
  player: Player,
): number {
  // 市場価値は `playerUtils.marketValueOf` 1本（出品の希望額・入札の受諾ライン・画面と同じ材料）
  const ceil = counterCeiling(marketValueOf(player, state), offer.offeredPrice)
  // クラブは国内52＋海外180から引く（どちらも `finance.budget` を持つ）。
  // 上限の式は `transferCapOf`（手元の資金）1本＝他所とまったく同じ
  const club = clubById(state.clubs, offer.fromTeamId)
  return Math.min(transferCapOf(club?.finance?.budget ?? 0), ceil)
}

export function sellMove(
  state: Pick<GameState, 'players' | 'clubs' | 'playerTeamId' | 'currentSeason'>,
  playerId: string, toTeamId: string, fee: number, toName: string,
) {
  return movePlayer(state, playerId, toTeamId, {
    year: state.currentSeason.year,
    date: myLeagueRaces(state.currentSeason, state.playerTeamId)[state.currentSeason.currentRaceIndex]?.date,
    raceIndex: state.currentSeason.currentRaceIndex,
    fee, toName,
    myTeamId: state.playerTeamId,
    lockUntilYear: state.currentSeason.year + 1 })
}

/**
 * 自チームの選手を売り払う（成立後の後始末を全部やる）。**売却の唯一の出口。**
 *
 * ■なぜ1本にしたのか
 *   「承諾して売る」と「逆提示に応じて売る」で、同じ後始末が丸ごと2つ書かれていた。
 *   しかもその中がさらに国内・海外で分かれていたので同じ処理が4つあり、
 *   ニュース・移籍履歴・退団のお知らせ・出品の掃除のどれかを片方だけ直す事故が起きていた。
 *   違うのは「いくらで売れたか」だけなので、金額だけ受け取る。
 *
 * ■国内と海外の違い
 *   見出しが変わり、ビッグクラブ（格2以上＝世界最高峰）へ送り出したときだけ実績が付く。
 *   お金は movePlayer が両側で動かす（どのリーグのクラブでも同じ）。
 */
/**
 * そのクラブは格1（世界に数クラブ）か。**大ニュースの判定はこれを通す。**
 * 格は毎年動くので、必ず「いまのクラブ」から引く（clubTiers.ts の初期値を見ない）。
 */

export function finalizeSale(
  state: GameState,
  offer: { id: string; playerId: string; fromTeamId: string; fromForeign?: boolean },
  fee: number,
): Partial<GameState> {
  const player = state.players.find(p => p.id === offer.playerId)!
  const date = myLeagueRaces(state.currentSeason, state.playerTeamId)[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
  // 行き先がどれだけ大きいかは**クラブの格**で言う（リーグでは言えない。utils/clubTier）。
  //   ビッグクラブ（格2以上）＝世界最高峰／自クラブより格上＝ステップアップ
  // 以前は「4大リーグのIDに入っているか」で、格3まで上がったクラブが最高峰扱いされず、
  // 格9まで落ちたクラブが最高峰のままだった。
  const destClub = clubById(state.clubs, offer.fromTeamId)
  const me = myClub(state)
  const toBigClub = !!offer.fromForeign && isBigClub(destClub)
  // 「世界へ挑戦」の見出しは clubTier の isWorldChallenge 1本（日本から海外・格4以上）
  const toWorldChallenge = !!offer.fromForeign && isWorldChallenge(me, destClub)
  const toStepUp = !!offer.fromForeign && isStepUp(me, destClub)
  const toName = offer.fromForeign
    ? (destClub && !isJpelLeague(destClub.leagueId) ? destClub.shortName : '海外クラブ')
    : (jpelClubById(state.clubs, offer.fromTeamId)?.shortName ?? '')

  const moved = sellMove(state, offer.playerId, offer.fromTeamId, fee, toName)
  const headline = offer.fromForeign
    ? overseasMoveHeadline({ playerName: player.name, playerOvr: ovr(player), clubName: toName, fee, worldChallenge: toWorldChallenge, stepUp: toStepUp })
    : soldPlayerHeadline({ playerName: player.name, toLabel: clubLabel(offer.fromTeamId, state.clubs), fee })

  return {
    players: moved.players,
    clubs: moved.clubs,
    transferHistory: [...(state.transferHistory ?? []), ...(moved.record ? [moved.record] : [])].slice(-400),
    // 世界最高峰（ビッグクラブ）へ送り出したのは初回だけ実績になる
    achievements: toBigClub && !(state.achievements ?? []).some(a => a.id === 'overseas-pioneer')
      ? [...(state.achievements ?? []), { id: 'overseas-pioneer', name: '世界へ翔ぶ', desc: `${state.currentSeason.year}年 ${player.name}を世界最高峰のクラブへ送り出した`, earnedAtYear: state.currentSeason.year, rarity: 'legendary' as const }]
      : state.achievements,
    currentSeason: {
      ...state.currentSeason,
      transferIncome: (state.currentSeason.transferIncome ?? 0) + moved.income,
      incomingOffers: (state.currentSeason.incomingOffers ?? []).filter(o => o.id !== offer.id),
      // 売却した選手の出品（自分のもの含む）は市場から掃除する
      transferListings: (state.currentSeason.transferListings ?? []).filter(l => l.playerId !== offer.playerId),
      newsFeed: [{
        date, headline, category: 'trade' as const, relatedIds: [player.id],
        major: toBigClub || ovr(player) >= MAJOR_NEWS_OVR || bigClub(state, offer.fromTeamId) }, ...state.currentSeason.newsFeed].slice(0, 30),
      departureNotices: [...(state.currentSeason.departureNotices ?? []), ...(moved.notice ? [moved.notice] : [])] } }
}

// ── 「譲る」と返事をした話の決着 ─────────────────────────────
// 買う側の入札が1レース待つのに、売る側だけタップで即成立していたので揃える。
//
// ★行き先は**GMが選んだクラブで確定**。
//   以前はここで全オファーを本人の希望順に並べ直し、一番良いものを勝たせていた。
//   そのため「台北に譲る」を押したのにマドリードへ移籍する、という
//   GMの意思をまるごと無視する動きになっていた。売る相手を決めるのはGM。
//   本人にできるのは「その行き先なら行く／行かない」だけ（下の consentToLeave）。
//
// ★返事は**選手ごとに1件**。ここで全部決着させる（utils/saleAnswer）。
//   置き場所がシーズンに1件しか無かったころは、同じレース間に2人ぶん返事をすると
//   前の返事が上書きされ、その選手は決着もせずチャットに承諾ボタンが戻っていた。
export function settleSaleAnswers(set: SetGame, get: () => GameStore): void {
  const cs0 = get().currentSeason
  const answers = saleAnswers(cs0)
  // 先に全部落としてから決着させる（acceptIncomingOffer の中で札を見るため）
  if (answers.length > 0) set(st => ({ currentSeason: keepSaleAnswers(st.currentSeason, () => false) }))
  for (const ps of answers) {
    const winner = ps.offerId
    const beforeName = get().players.find(x => x.id === ps.playerId)?.name ?? ''
    const winnerId = (cs0.incomingOffers ?? []).find(o => o.id === winner)?.fromTeamId
    const winnerName = findClub(get().clubs, winnerId)?.shortName ?? '相手クラブ'
    const outcome = get().acceptIncomingOffer(winner, true)
    const p = get().players.find(x => x.id === ps.playerId)

    // ★決着は必ず会話に書く。ここが無かったので「譲ります」と返事をしてレースを
    //   進めても、成立したのか流れたのかが会話にも通知にも出ず、次の打診だけが来ていた。
    if (outcome === 'sold') {
      set(st => ({ currentSeason: appendChatLog(st.currentSeason, ps.playerId, {
        from: 'player',
        text: `（代理人）${beforeName}の${winnerName}への移籍が成立しました。お世話になりました` }) }))
    } else if (p) {
      // 流れたときも黙って消さず、会話と通知の両方に理由を残す
      const kind = outcome === 'roster_min' ? 'sale_roster_min' as const : 'sale_refused' as const
      const reason = outcome === 'roster_min'
        ? `（代理人）在籍人数が下限を下回るため、${p.name}の移籍は成立しませんでした。残留します`
        : `（代理人）${p.name}は最後まで悩みましたが、移籍しないことに決めました。残留します`
      // ★本人が「行かない」と決めた以上、**そのとき話が乗っていたクラブは今季もう来ない**
      //   （2026-08-12・オーナー判断）。「移籍しないことに決めました。残留します」の直後に
      //   同じクラブからまた「◯億でお譲りいただけないでしょうか」が並ぶのを止める。
      //
      //   ★以前は条件が `outcome === 'refused'` で、**一度も走っていませんでした**。
      //     `refused` は逆提示（クラブが額に応じなかった）でしか起きず、本人が断ったときは
      //     `refused_by_player` が返ります（`utils/offerResult.ts`）。そのため実際に
      //     止まっていたのは `acceptIncomingOffer` の中で控えるGMが選んだ1クラブだけでした。
      const refusedClubs = outcome === 'refused_by_player' || outcome === 'refused'
        ? [...new Set((cs0.incomingOffers ?? []).filter(o => o.playerId === ps.playerId).map(o => o.fromTeamId))]
        : []
      if (refusedClubs.length > 0) {
        const year = get().currentSeason.year
        set(st => ({ players: st.players.map(pl => pl.id === ps.playerId
          ? { ...pl, saleRefused: { ...(pl.saleRefused ?? {}), ...Object.fromEntries(refusedClubs.map(c => [c, year])) } }
          : pl) }))
      }
      set(st => ({ currentSeason: {
        ...appendChatLog(st.currentSeason, ps.playerId, { from: 'player', text: reason }),
        // 残った札は全部たたむ。残すと次のレースでまた同じ返事を求められる
        incomingOffers: (st.currentSeason.incomingOffers ?? []).filter(o => o.playerId !== ps.playerId),
        expiredNegotiations: [
          ...(st.currentSeason.expiredNegotiations ?? []),
          { id: `sale_${ps.playerId}_${st.currentSeason.currentRaceIndex}`, playerId: p.id, playerName: p.name, kind },
        ] } }))
    }
  }
}
