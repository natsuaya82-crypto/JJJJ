import { rankOfTeam } from '../utils/league'
import type { GmOffer, Team } from '../types'
import { rankedStandings, divisionOf } from './league'
import { tierOf, tierOfClubId } from './clubTier'

// ============================================================================
// 監督（GM）オファー。「シーズンが終わったあと、別のチームから声がかかる」仕組み。
//
// ■いつ出るか
//   シーズン終了処理の最後、来季の予算と評判が確定したあと。1シーズンに最大1件。
//   答える（行く／行かない）まで残り、答えたら消える。
//
// ■誰から来るか
//   国内チームだけ（海外クラブからは今は来ない）。声のかかり方は3種類ある。
//
//     栄転 promotion  今より格が上のクラブ。自分の部で上位だった年に出やすい
//     再建 rebuild    かつて格が高かったのに落ちているクラブ。成績に関係なく出る
//     再起 comeback   今より格が下のクラブ。低迷した年に出やすい
//
//   「上から来るだけ」だと、好成績を出し続ける以外に景色が変わらない。
//   落ちた古豪の再建や、うまくいかなかった年に下から拾われる話があると、
//   同じチームで20年やる以外の遊び方が生まれる。
//
// ■毎年は来ない
//   就任1年目には来ない（腰を据えるため）。一度オファーが出たら GM_OFFER_COOLDOWN 年は出ない。
//   悪い年でも確率はゼロにならない（下や古豪からの声はむしろ低迷時に来る）。
//
// ■受けたらどうなるか
//   移籍先が持っているもの（予算・施設・選手・ドラフト権）をそのまま受け継ぐ。
//   前のチームの物は一切持って行かない。だから受諾時に差し替える数字を
//   オファー1件に焼き付けてある（オファーを出す時点でしか分からないため）。
//
// ■解任は無い
//   成績が悪くてもクビにはならない。行くか行かないかを選ぶだけ。
// ============================================================================

// 機能のオン・オフ。false にすると声がかからなくなる（受諾処理は残る）
export const GM_OFFER_ENABLED = true

/** 一度オファーが出たら、次はこの年数だけ空ける */
export const GM_OFFER_COOLDOWN = 2

/**
 * 声がかかる確率。成績（部内順位）と評判から決める。
 * 好成績ほど高いが、**低迷しても0にはしない**（下や古豪からの声は悪い年にこそ来る）。
 * 以前は score<70 で0だったため、うまくいかない年は永久に何も起きなかった。
 */
export function offerChance(finalRank: number, gmRep: number, teamCount: number): number {
  if (finalRank <= 0) return 0
  // 部の人数（1部20・2部16・3部16）で寝ないよう、順位は割合に直してから点にする。
  // 以前は (teamCount - finalRank) * 2 で、20チーム前提のしきい値と噛み合っていなかった
  const rankFrac = teamCount > 1 ? (finalRank - 1) / (teamCount - 1) : 0
  const score = (1 - rankFrac) * 60 + gmRep   // 0〜160
  if (score >= 105) return 0.30
  if (score >= 80) return 0.24
  if (score >= 55) return 0.18
  return 0.12
}

/** オファーの種類 */
export type GmOfferKind = 'promotion' | 'rebuild' | 'comeback'

/**
 * どの種類の話が来るかを引く。
 * rankFrac は部内順位を 0（首位）〜1（最下位）にしたもの。
 * 上位なら栄転が出やすく、下位なら再起が出やすい。再建はいつでも一定で混ざる。
 */
export function pickOfferKind(rankFrac: number, rng: () => number): GmOfferKind {
  const promotion = 0.65 * (1 - rankFrac)   // 首位0.65 → 最下位0
  const comeback = 0.55 * rankFrac          // 首位0    → 最下位0.55
  const r = rng()
  if (r < promotion) return 'promotion'
  if (r < promotion + comeback) return 'comeback'
  return 'rebuild'
}

/**
 * 声をかけてくるチームの候補。
 *
 * ★順位表の得点で52チームを並べない（部ごとにレース数が10/8/7で違うため）。
 *   比べるのは「格」。国内も海外も同じ物差しなので、そのまま上下が言える。
 *
 * @param tierNow    そのクラブの今の格（utils/clubTier.ts の tierOf）
 * @param tierSeed   そのクラブのもともとの格（data/clubTiers.ts の初期値）
 */
export function offerCandidates(
  kind: GmOfferKind,
  teamIds: readonly string[],
  playerTeamId: string,
  tierNow: (id: string) => number,
  tierSeed: (id: string) => number,
): string[] {
  const mine = tierNow(playerTeamId)
  const others = teamIds.filter(id => id !== playerTeamId)
  if (kind === 'promotion') return others.filter(id => tierNow(id) < mine)
  if (kind === 'comeback') return others.filter(id => tierNow(id) > mine)
  // 再建：もともとの格より FALLEN_GAP 段以上落ちているクラブ。
  // 自分より格上でも格下でも構わない（「あの名門が今は3部」という話が要る）
  const FALLEN_GAP = 4
  return others.filter(id => tierNow(id) - tierSeed(id) >= FALLEN_GAP)
}

// オファーを1件作る。条件を満たさなければ null。
// rng は 0〜1 を返す関数（テストで差し替えられるように外から渡す）。
export function makeGmOffer(params: {
  standings: { teamId: string; totalPoints: number }[]
  playerTeamId: string
  finalRank: number
  gmRep: number
  teamCount: number
  nextYear: number
  teams: Team[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  objBonus: number
  rng: () => number
  /** 前にオファーが出た年（無ければ一度も出ていない） */
  lastOfferYear?: number
  /** 今のチームに就任した年 */
  tenureStartYear?: number
}): GmOffer | null {
  if (!GM_OFFER_ENABLED) return null
  const { standings, playerTeamId, finalRank, gmRep, teamCount, nextYear, teams, nextBudgets, objBonus, rng } = params
  const { lastOfferYear, tenureStartYear } = params
  // 就任1年目には来ない。前のオファーからも GM_OFFER_COOLDOWN 年空ける
  if (tenureStartYear != null && nextYear - tenureStartYear < 2) return null
  if (lastOfferYear != null && nextYear - lastOfferYear < GM_OFFER_COOLDOWN) return null
  if (rng() >= offerChance(finalRank, gmRep, teamCount)) return null

  const tierNow = (id: string) => tierOf(teams.find(t => t.id === id))
  const tierSeed = (id: string) => tierOfClubId(id)
  const rankFrac = teamCount > 1 ? Math.min(1, Math.max(0, (finalRank - 1) / (teamCount - 1))) : 0
  // 引いた種類に候補がいなければ他の種類へ回す（せっかく当たった機会を捨てない）
  const kinds: GmOfferKind[] = [pickOfferKind(rankFrac, rng), 'rebuild', 'promotion', 'comeback']
  let kind: GmOfferKind = 'rebuild'
  let candidates: string[] = []
  for (const k of kinds) {
    const c = offerCandidates(k, teams.map(t => t.id), playerTeamId, tierNow, tierSeed)
      .filter(id => nextBudgets[id])
    if (c.length > 0) { kind = k; candidates = c; break }
  }
  if (candidates.length === 0) return null
  const teamId = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0]
  const b = nextBudgets[teamId]
  const dest = teams.find(t => t.id === teamId)
  // 前季順位は**移籍先の部の中での順位**。来季の目標をここから引き直すので、
  // 52チームを得点で並べた順位を渡すと目標が的外れになる
  // （部ごとにレース数が10/8/7で違うため、3部のクラブは何位でも下位になる）
  const destDivision = divisionOf(dest)
  const destDivIds = new Set(teams.filter(t => divisionOf(t) === destDivision).map(t => t.id))
  const inDiv = rankedStandings(standings.filter(s => destDivIds.has(s.teamId)))
  const prevRank = rankOfTeam(inDiv, teamId)
  const destDivisionSize = destDivIds.size
  return {
    teamId,
    year: nextYear,
    budget: b.budget,
    budgetBreakdown: {
      carryover: b.carryover,
      grant: b.grant,
      raceIncome: b.raceIncome,
      sponsor: b.sponsor,
      objBonus: b.objBonus,
      expenses: b.expenses,
    },
    // 目標達成ボーナスのスカウトポイントは監督個人の成果なので持って行く。
    // 施設ぶんは移籍先のスカウト部門を使う
    scoutPoints: 5 + objBonus + (dest?.facilities?.scoutOffice ?? 0),
    prevRank: prevRank > 0 ? prevRank : finalRank,
    // 目標を引き直すときに使う。52ではなく移籍先の部の人数
    divisionSize: destDivisionSize,
    kind,
  }
}
