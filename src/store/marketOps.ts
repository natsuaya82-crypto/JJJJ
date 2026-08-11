// 移籍・交渉の「取引の実行」ヘルパー（gameStore から移設）。
// 判定そのものは utils/transferDecision・utils/transferBid が正。ここは
// 合意後に選手を動かし、チャットとニュースへ書く「実行役」だけを持つ。

import { counterCeiling } from '../data/economy'
import { ROSTER_MIN, teamRosterSize } from '../data/rosterRules'
import { type GameState, type Player, type Team } from '../types'
import { MAJOR_NEWS_OVR, allTieredClubs, isBigClub, isStepUp } from '../utils/clubTier'
import { bigClub, leagueOfClub } from '../utils/clubs'
import { movePlayer } from '../utils/movePlayer'
import { clubLabel, overseasMoveHeadline, soldPlayerHeadline } from '../utils/newsItems'
import { type PerfProfile, calcTransferValue, faMarketSalary, ovr } from '../utils/playerUtils'
import { type TradeValueCtx } from '../utils/tradeValue'

// 指名権のバックフィル判定。「自分が今持っているか」ではなく「どこかのチームが保有しているか」で見る。
// 売却・トレード済みの指名権を「欠落」と誤認して再生成（複製）しないため。
export function tradeValueCtxOf(state: { currentSeason: GameState['currentSeason']; pastSeasons: GameState['pastSeasons'] }): TradeValueCtx {
  return {
    races: state.currentSeason.races,
    teamRaces: state.currentSeason.currentRaceIndex,
    currentSeason: state.currentSeason,
    pastSeasons: state.pastSeasons }
}


// 今季の活躍データの取得口。海外リーグ在籍中の選手は国内レースに出ないので、
// foreignAppearances 側から同じ形（PerfProfile）で作る。国内・海外を同じ物差しで見るための1本化。
export function acquisitionDesiredSalary(player: Player, source: 'fa' | 'scout', playFraction = 0.5, teamRaces = 0, perf?: PerfProfile): number {
  // 市場給与(素体×実績倍率)と現年俸のブレンド。市場中心＋現年俸で急変を防ぐ。
  // → 衰えれば市場給与が下がって希望も下がる／現在高給でもすぐ暴落しない。
  const market = faMarketSalary(player, perf)
  const cur = player.contract.annualSalary
  const c = player.career
  const achieve = 1 + Math.min(0.20, c.championships * 0.04 + c.mvpAwards * 0.03)
  let desired = (market * 0.65 + cur * 0.35) * achieve
  const personality = player.personality ?? 'salary'
  if (personality === 'salary') desired *= 1.10   // 金型は高め
  if (source === 'scout' && teamRaces >= 3) {
    // 引き抜き：よく出てる主力ほど手放させるのに上乗せ
    const playMult = playFraction >= 0.8 ? 1.35 : playFraction >= 0.6 ? 1.18 : 1.0
    desired *= playMult
  }
  return Math.round(desired / 500000) * 500000
}


// 補強禁止中でも、ロスターが下限(15人)以下のときはFA獲得だけ通す。
// 契約満了・引退で15人を割ると開幕できないのに、補強禁止中はドラフト(年2人)しか手段が無く、
// シーズンが進まない＝収入も入らないので永久に抜け出せない詰みになるため。
// 対象はFAのみ。引き抜き・移籍金・トレード・レンタル・海外獲得は禁止のまま。
export function faAllowedDespiteBan(players: Player[], teamId: string): boolean {
  return teamRosterSize(players, teamId) <= ROSTER_MIN
}

// レースのタイム計算に乗せる補正をまとめて適用した選手配列を返す。
//   1) 戦術分析室：所属チームの施設Lvぶん「ペース配分」「メンタル」を強化
//      （以前は全7能力に+Lvしていて実質OVR+5相当と壊れ性能だったため2能力に限定）
//   2) 国籍ケミストリー：自チームの出走メンバーの最多国籍が7人以上なら、その国籍の選手の士気を加算
// 以前は runRace の中だけでこの補正を作っていたが、リーグ戦は画面側（interactiveRace）で
// タイムを計算してから preComputedResults として渡すため、補正が一切反映されていなかった。
// 画面と store の両方からこの関数を呼ぶことで、施設とケミストリーの効果を必ず効かせる。
export function willingFeeFor(
  state: { teams: Team[] },
  offer: { fromTeamId: string; offeredPrice: number; fromForeign?: boolean },
  player: Player,
): number {
  const ceil = counterCeiling(calcTransferValue(player), offer.offeredPrice)
  if (offer.fromForeign) return ceil
  const budget = state.teams.find(t => t.id === offer.fromTeamId)?.finance.budget ?? 0
  return Math.min(budget, ceil)
}

export function sellMove(
  state: Pick<GameState, 'players' | 'teams' | 'playerTeamId' | 'currentSeason'>,
  playerId: string, toTeamId: string, fee: number, toName: string,
) {
  return movePlayer(state, playerId, toTeamId, {
    year: state.currentSeason.year,
    date: state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date,
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
 *   海外クラブは teams に居ないので入金が自クラブ側だけになる。見出しも変わり、
 *   ビッグクラブ（格2以上＝世界最高峰）へ送り出したときだけ実績が付く。その3つ以外は同じ。
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
  const date = state.currentSeason.races[state.currentSeason.currentRaceIndex]?.date ?? `${state.currentSeason.year}-06-01`
  const league = offer.fromForeign ? leagueOfClub(state.foreignLeagues, offer.fromTeamId) : undefined
  // 行き先がどれだけ大きいかは**クラブの格**で言う（リーグでは言えない。utils/clubTier）。
  //   ビッグクラブ（格2以上）＝世界最高峰／自クラブより格上＝ステップアップ
  // 以前は「4大リーグのIDに入っているか」で、格3まで上がったクラブが最高峰扱いされず、
  // 格9まで落ちたクラブが最高峰のままだった。
  const destClub = allTieredClubs(state.teams, state.foreignLeagues).find(c => c.id === offer.fromTeamId)
  const myClub = state.teams.find(t => t.id === state.playerTeamId)
  const toBigClub = !!offer.fromForeign && isBigClub(destClub)
  const toStepUp = !!offer.fromForeign && isStepUp(myClub, destClub)
  const toName = offer.fromForeign
    ? (league?.clubs.find(c => c.id === offer.fromTeamId)?.shortName ?? '海外クラブ')
    : (state.teams.find(t => t.id === offer.fromTeamId)?.shortName ?? '')

  const moved = sellMove(state, offer.playerId, offer.fromTeamId, fee, toName)
  const headline = offer.fromForeign
    ? overseasMoveHeadline({ playerName: player.name, playerOvr: ovr(player), clubName: toName, fee, big: toBigClub, stepUp: toStepUp })
    : soldPlayerHeadline({ playerName: player.name, toLabel: clubLabel(offer.fromTeamId, state.teams), fee })

  return {
    players: moved.players,
    teams: moved.teams,
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
