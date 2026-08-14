import { rankOfTeam } from '../utils/league'
import type { GmOffer, GmTenure, Team } from '../types'
import { divisionOf, seasonDivisionStandings, type SeasonStandingsLike } from './league'
import { tierOf, tierOfClubId } from './clubTier'
import { facilitiesOf } from './facilities'

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
 * 自分から退任できるようになるまでの在任年数（オーナー判断・2026-08-12）。
 * 就任年を1年目と数えて「就任年 + これ > 今年」のあいだは押せない ＝ **4年目から**。
 *
 * ★上の GM_OFFER_COOLDOWN とは別物。**混ぜないこと。**
 *     GM_OFFER_COOLDOWN    … 年1回ランダムで**声が掛かる**間隔（相手から来る話）
 *     GM_RESIGN_MIN_TENURE … 自分から**辞められる**ようになるまで（こちらから出る話）
 *   同じ「監督の去就の年数」でも意味が違うので、片方を動かしてももう片方は動かない。
 *
 * これが無かったころは、退任ボタンにガードが1つも無く（`gmOffers` が空かどうかだけ）、
 * しかも resignOffers は抽選をしないので**押せば必ず3件届いた**。
 * 押し続ければ格上へ無限に登れる状態だった。
 */
export const GM_RESIGN_MIN_TENURE = 3

/**
 * いま自分から退任できるか。**残り年数の計算を画面に書かないための1本。**
 *
 * 数え方は `gmTenures` の**いま指揮しているチームの fromYear** から。
 * 新しいカウンタは足さない（在任の記録は utils/gmTenure に1本ある）。
 * 履歴が無い・壊れているセーブは normalizeTenures と同じ扱いで「今年から就任」とみなす
 * ＝すぐには辞められない。
 */
export function canResignAsGm(
  tenures: GmTenure[] | undefined,
  year: number,
): { ok: true } | { ok: false; yearsLeft: number } {
  const list = (tenures ?? []).filter(t => t && typeof t.fromYear === 'number')
  // いま指揮しているのは toYear が無いもの。無ければ一番新しい fromYear に倒す
  const cur = list.find(t => t.toYear == null)
    ?? (list.length > 0 ? list.reduce((a, b) => (b.fromYear > a.fromYear ? b : a)) : undefined)
  const from = cur?.fromYear ?? year
  const yearsLeft = from + GM_RESIGN_MIN_TENURE - year
  return yearsLeft > 0 ? { ok: false, yearsLeft } : { ok: true }
}

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
  /** 今季の順位表（部ごと）。移籍先の部の中での順位を引くのに使う */
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
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
  const { season, playerTeamId, finalRank, gmRep, teamCount, nextYear, teams, nextBudgets, objBonus, rng } = params
  const { lastOfferYear, tenureStartYear } = params
  // ★**移籍したら3シーズンは、退任もオファーも無い**（2026-08-12・オーナー判断）。
  //   退任ボタン側は canResignAsGm が同じ GM_RESIGN_MIN_TENURE で止める。**線は1本**。
  //   以前ここだけ「就任1年目には来ない」の2年で、**押せないのにオファーだけ来る**年があった。
  if (tenureStartYear != null && nextYear - tenureStartYear < GM_RESIGN_MIN_TENURE) return null
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
  return buildOffer({ teamId, kind, season, teams, nextBudgets, nextYear, objBonus, finalRank })
}

/**
 * オファー1件を組み立てる。**中身の作り方はここ1本。**
 * 年に1回ランダムに来るぶん（makeGmOffer）も、退任したときに一度に届くぶん（resignOffers）も
 * 同じ形にする。別々に書くと、片方だけ予算や目標の引き直しがずれる。
 */
export function buildOffer(a: {
  teamId: string
  kind: GmOfferKind
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
  teams: Team[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  nextYear: number
  objBonus: number
  /** 移籍先の前季順位が引けないときの代わり */
  finalRank: number
}): GmOffer {
  const b = a.nextBudgets[a.teamId]
  const dest = a.teams.find(t => t.id === a.teamId)
  // 前季順位は**移籍先の部の中での順位**（順位表は部ごとに分かれている）。
  // 来季の目標をここから引き直すので、部をまたいだ順位を使うと目標が的外れになる
  const destDivision = divisionOf(dest)
  const prevRank = rankOfTeam(seasonDivisionStandings(a.season, a.teamId), a.teamId)
  const destDivisionSize = a.teams.filter(t => divisionOf(t) === destDivision).length
  return {
    teamId: a.teamId,
    year: a.nextYear,
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
    scoutPoints: 5 + a.objBonus + facilitiesOf(dest).scoutOffice,
    prevRank: prevRank > 0 ? prevRank : a.finalRank,
    // 目標を引き直すときに使う。52ではなく移籍先の部の人数
    divisionSize: destDivisionSize,
    kind: a.kind,
  }
}

/**
 * 監督が自分から退任したときに届くオファー。**声がかかるかの抽選はしない**
 * （辞めると決めた以上、行き先が0件では詰むため）。
 *
 * 3つの話（栄転・名門再建・再起）から**1件ずつ**選ぶので、
 * 「格上」「落ちぶれた名門」「3部」が並ぶ。候補が居ない話は飛ばす。
 */
export function resignOffers(params: {
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
  playerTeamId: string
  finalRank: number
  nextYear: number
  teams: Team[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  rng: () => number
  tierNow: (id: string) => number
  tierSeed: (id: string) => number
}): GmOffer[] {
  const { season, playerTeamId, finalRank, nextYear, teams, nextBudgets, rng, tierNow, tierSeed } = params
  const ids = teams.map(t => t.id)
  const out: GmOffer[] = []
  const taken = new Set<string>()
  for (const kind of ['promotion', 'rebuild', 'comeback'] as GmOfferKind[]) {
    const c = offerCandidates(kind, ids, playerTeamId, tierNow, tierSeed)
      .filter(id => nextBudgets[id] && !taken.has(id))
    if (c.length === 0) continue
    const teamId = c[Math.floor(rng() * c.length)] ?? c[0]
    taken.add(teamId)
    out.push(buildOffer({ teamId, kind, season, teams, nextBudgets, nextYear, objBonus: 0, finalRank }))
  }
  return out
}
