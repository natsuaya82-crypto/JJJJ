import type { GmOffer, GmTenure, WorldClub } from '../types'
import { rankOfTeam, seasonLeagueStandings, type SeasonStandingsLike } from './league'
import { tierOf, tierOfClubId } from './clubTier'
import { facilitiesOf, facilityScoutPoints } from './facilities'
import { clubById, clubIds, clubsInLeague, jpelClubs, otherClubs } from './world'

// ============================================================================
// 監督（GM）オファー。「シーズンが終わったあと、別のチームから声がかかる」仕組み。
//
// ■いつ出るか
//   シーズン終了処理の最後、来季の予算と評判が確定したあと。1シーズンに最大1件。
//   答える（行く／行かない）まで残り、答えたら消える。
//
// ■誰から来るか
//   **自チーム以外の231クラブ**（日本のリーグ51＋海外180）。国内か海外かで割合を決めない
//   （オーナー・2026-09-25。格の並びで自然に決まる）。声の掛かる範囲は `offerTierRange` 1本で、
//   年に1回のオファーも退任したときの打診も同じここを通る。話の種類は3つ。
//
//     栄転 promotion  範囲の中で、今より格が上のクラブ
//     再建 rebuild    かつて格が高かったのに落ちているクラブ（範囲は問わない）
//     再起 comeback   範囲の中で、今より格が下のクラブ
//
//   「上から来るだけ」だと、好成績を出し続ける以外に景色が変わらない。
//   落ちた古豪の再建や、うまくいかなかった年に下から拾われる話があると、
//   同じチームで20年やる以外の遊び方が生まれる。
//
// ■毎年は来ない
//   移籍して GM_RESIGN_MIN_TENURE 年は来ない。一度オファーが出たら GM_OFFER_COOLDOWN 年は出ない。
//   悪い年でも確率はゼロにならない（下や古豪からの声はむしろ低迷時に来る）。
//
// ■受けたらどうなるか
//   移籍先が持っているもの（予算・施設・選手・ドラフト権）をそのまま受け継ぐ。
//   前のチームの物は一切持って行かない。だから受諾時に差し替える数字を
//   オファー1件に焼き付けてある（オファーを出す時点でしか分からないため）。
//   海外クラブでも同じ（store の applyGmMove 1本）。
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
 * 声がかかる確率。成績（リーグ内の順位）と評判から決める。
 * 好成績ほど高いが、**低迷しても0にはしない**（下や古豪からの声は悪い年にこそ来る）。
 * 以前は score<70 で0だったため、うまくいかない年は永久に何も起きなかった。
 */
export function offerChance(finalRank: number, gmRep: number, teamCount: number): number {
  if (finalRank <= 0) return 0
  // リーグの人数で寝ないよう、順位は割合に直してから点にする。
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

/** 範囲の幅の最大（首位なら格上へこの段数だけ、最下位なら格下へこの段数だけ）。オーナー・2026-09-25 */
const OFFER_RANGE_STEPS = 5

/** 再建：もともとの格よりこの段数以上落ちているクラブ */
const FALLEN_GAP = 4

/**
 * **声が掛かる範囲（格の上端〜下端）。年に1回のオファーも退任の打診もここ1本**（オーナー・2026-09-25）。
 *
 *   真ん中 … 自分のリーグのクラブを格の高い順に並べ、自分の最終順位が k 位なら k 番目の格
 *            （優勝＝そのリーグで一番高い格／最下位＝一番低い格）。国内も海外も同じ
 *   幅     … 順位の割合 f（首位0〜最下位1）から、上へ round(5×(1−f)) 段・下へ round(5×f) 段
 *            ＝優勝は格上0〜5段だけ／真ん中は上下2〜3段／最下位は格下0〜5段だけ
 *
 * ★格は数が小さいほど上（格1が頂点）。`top` ≤ `bottom`。
 *
 * @param leagueTiers 自分のリーグのクラブの格（自チームも入れる。並びは問わない）
 * @param rank        自分の最終順位（1〜）
 */
export function offerTierRange(leagueTiers: readonly number[], rank: number): {
  center: number; top: number; bottom: number; rankFrac: number
} | null {
  const n = leagueTiers.length
  if (n === 0 || rank < 1 || rank > n) return null
  const sorted = [...leagueTiers].sort((a, b) => a - b)
  const center = sorted[rank - 1]
  const rankFrac = n > 1 ? (rank - 1) / (n - 1) : 0
  return {
    center,
    top: center - Math.round(OFFER_RANGE_STEPS * (1 - rankFrac)),
    bottom: center + Math.round(OFFER_RANGE_STEPS * rankFrac),
    rankFrac,
  }
}

/** 格を読む2本（いまの格・もともとの格）。点検は差し替えて渡す */
export type OfferTiers = {
  /** そのクラブの今の格（utils/clubTier の tierOf） */
  tierNow: (id: string) => number
  /** そのクラブのもともとの格（data/clubTiers の初期値）。海外は格が動かないので再建にはならない */
  tierSeed: (id: string) => number
}

/** 世界のクラブから格を読む（store から呼ぶときはこれ） */
export function worldOfferTiers(clubs: readonly WorldClub[]): OfferTiers {
  return { tierNow: id => tierOf(clubById(clubs, id)), tierSeed: id => tierOfClubId(id) }
}

/** そのクラブの話は3種類のどれか（今の自分の格と比べる）。落ちた古豪なら再建 */
function kindOf(id: string, mine: number, t: OfferTiers): GmOfferKind {
  if (t.tierNow(id) - t.tierSeed(id) >= FALLEN_GAP) return 'rebuild'
  return t.tierNow(id) < mine ? 'promotion' : 'comeback'
}

/**
 * 声をかけてくるクラブの候補を、話の種類ごとに。**候補の決まりはここ1本。**
 *
 * ★順位表の得点でクラブを並べない（リーグごとにレース数が違うため）。比べるのは「格」。
 *   国内も海外も同じ物差しなので、そのまま上下が言える。
 */
export function offerPools(a: {
  clubs: readonly WorldClub[]
  playerTeamId: string
  /** 今季の順位表（リーグごと）。自分のリーグと最終順位をここから引く */
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
  tiers: OfferTiers
}): { pools: Record<GmOfferKind, string[]>; rankFrac: number } | null {
  const rows = seasonLeagueStandings(a.season, a.playerTeamId)
  const range = offerTierRange(rows.map(r => a.tiers.tierNow(r.teamId)), rankOfTeam(rows, a.playerTeamId))
  if (!range) return null
  const mine = a.tiers.tierNow(a.playerTeamId)
  const pools: Record<GmOfferKind, string[]> = { promotion: [], rebuild: [], comeback: [] }
  for (const id of clubIds(otherClubs(a.clubs, a.playerTeamId))) {
    const tier = a.tiers.tierNow(id)
    const kind = kindOf(id, mine, a.tiers)
    // 再建は範囲を問わない（「あの名門が今は3部」という話が要る）。栄転・再起は範囲の中だけ
    if (kind === 'rebuild') pools.rebuild.push(id)
    else if (tier >= range.top && tier <= range.bottom && tier !== mine) pools[kind].push(id)
  }
  return { pools, rankFrac: range.rankFrac }
}

/**
 * 候補から `count` 件を引く。**引き方はここ1本**（年に1回は1件・退任は2件）。
 *
 * 話の種類の重みは順位の割合 f から（上位ほど栄転・下位ほど再起、再建は残り）。
 * **候補の居ない種類は引かない**——範囲が上だけ（優勝）のときに再起を引いて空振りする、
 * といった無駄が起きない。範囲の上下の段数も同じ f から出ているので、端では重みと範囲が揃う
 * （f=0 は再起の重みも範囲の下も0、f=1 は栄転の重みも範囲の上も0）。
 */
export function drawOffers(
  pools: Record<GmOfferKind, string[]>,
  rankFrac: number,
  count: number,
  rng: () => number,
  taken: Set<string> = new Set(),
): { teamId: string; kind: GmOfferKind }[] {
  const weight: Record<GmOfferKind, number> = {
    promotion: 0.65 * (1 - rankFrac),   // 首位0.65 → 最下位0
    comeback: 0.55 * rankFrac,          // 首位0    → 最下位0.55
    rebuild: 0,
  }
  weight.rebuild = 1 - weight.promotion - weight.comeback
  const out: { teamId: string; kind: GmOfferKind }[] = []
  while (out.length < count) {
    const open = (['promotion', 'comeback', 'rebuild'] as GmOfferKind[])
      .map(k => ({ k, ids: pools[k].filter(id => !taken.has(id)) }))
      .filter(o => o.ids.length > 0 && weight[o.k] > 0)
    if (open.length === 0) break
    const total = open.reduce((s, o) => s + weight[o.k], 0)
    let r = rng() * total
    const pick = open.find(o => (r -= weight[o.k]) < 0) ?? open[open.length - 1]
    const teamId = pick.ids[Math.floor(rng() * pick.ids.length)] ?? pick.ids[0]
    taken.add(teamId)
    out.push({ teamId, kind: pick.k })
  }
  return out
}

// オファーを1件作る。条件を満たさなければ null。
// rng は 0〜1 を返す関数（テストで差し替えられるように外から渡す）。
export function makeGmOffer(params: {
  /** 今季の順位表（リーグごと）。自分の最終順位と、移籍先のリーグの中での順位を引く */
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
  playerTeamId: string
  gmRep: number
  nextYear: number
  clubs: readonly WorldClub[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  objBonus: number
  rng: () => number
  /** 前にオファーが出た年（無ければ一度も出ていない） */
  lastOfferYear?: number
  /** 今のチームに就任した年 */
  tenureStartYear?: number
  /** 格の読み方（点検が差し替える。無ければ世界のクラブから） */
  tiers?: OfferTiers
}): GmOffer | null {
  if (!GM_OFFER_ENABLED) return null
  const { season, playerTeamId, gmRep, nextYear, clubs, nextBudgets, objBonus, rng } = params
  const { lastOfferYear, tenureStartYear } = params
  // ★**移籍したら3シーズンは、退任もオファーも無い**（2026-08-12・オーナー判断）。
  //   退任ボタン側は canResignAsGm が同じ GM_RESIGN_MIN_TENURE で止める。**線は1本**。
  //   以前ここだけ「就任1年目には来ない」の2年で、**押せないのにオファーだけ来る**年があった。
  if (tenureStartYear != null && nextYear - tenureStartYear < GM_RESIGN_MIN_TENURE) return null
  if (lastOfferYear != null && nextYear - lastOfferYear < GM_OFFER_COOLDOWN) return null
  const rows = seasonLeagueStandings(season, playerTeamId)
  const finalRank = rankOfTeam(rows, playerTeamId)
  if (rng() >= offerChance(finalRank, gmRep, rows.length)) return null

  const p = offerPools({ clubs, playerTeamId, season, tiers: params.tiers ?? worldOfferTiers(clubs) })
  if (!p) return null
  const [hit] = drawOffers(withBudgets(p.pools, nextBudgets), p.rankFrac, 1, rng)
  if (!hit) return null
  return buildOffer({ ...hit, season, clubs, nextBudgets, nextYear, objBonus, finalRank })
}

/** 来季予算が引けないクラブは声をかけられない（受けた瞬間に差し替える数字が無い） */
function withBudgets(pools: Record<GmOfferKind, string[]>, nextBudgets: Record<string, unknown>): Record<GmOfferKind, string[]> {
  const has = (ids: string[]) => ids.filter(id => nextBudgets[id])
  return { promotion: has(pools.promotion), rebuild: has(pools.rebuild), comeback: has(pools.comeback) }
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
  clubs: readonly WorldClub[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  nextYear: number
  objBonus: number
  /** 移籍先の前季順位が引けないときの代わり */
  finalRank: number
}): GmOffer {
  const b = a.nextBudgets[a.teamId]
  const dest = clubById(a.clubs, a.teamId)
  // 前季順位は**移籍先のリーグの中での順位**（順位表はリーグごとに分かれている）。
  // 来季の目標をここから引き直すので、リーグをまたいだ順位を使うと目標が的外れになる
  const prevRank = rankOfTeam(seasonLeagueStandings(a.season, a.teamId), a.teamId)
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
    scoutPoints: 5 + a.objBonus + facilityScoutPoints(facilitiesOf(dest).scoutOffice),
    prevRank: prevRank > 0 ? prevRank : a.finalRank,
    // 目標を引き直すときに使う。移籍先のリーグの人数（日本の部も海外リーグも同じ）
    divisionSize: clubsInLeague(a.clubs, dest?.leagueId).length,
    kind: a.kind,
  }
}

/**
 * 監督が自分から退任したときに届くオファー。**声がかかるかの抽選はしない**
 * （辞めると決めた以上、行き先が0件では詰むため）。
 *
 * 届くのは3件（オーナー・2026-09-25）。
 *   ・2件は年に1回のオファーと同じ範囲から（`offerPools` / `drawOffers`）
 *   ・1件は**日本のクラブ**。どこで指揮していても、自チーム以外から格の範囲を問わずに選ぶ
 *     ＝範囲に候補が居なくても、必ず1件は行き先がある
 */
export function resignOffers(params: {
  season: SeasonStandingsLike<{ teamId: string; totalPoints: number }>
  playerTeamId: string
  nextYear: number
  clubs: readonly WorldClub[]
  nextBudgets: Record<string, GmOffer['budgetBreakdown'] & { budget: number }>
  rng: () => number
  tiers?: OfferTiers
}): GmOffer[] {
  const { season, playerTeamId, nextYear, clubs, nextBudgets, rng } = params
  const tiers = params.tiers ?? worldOfferTiers(clubs)
  const finalRank = rankOfTeam(seasonLeagueStandings(season, playerTeamId), playerTeamId)
  const taken = new Set<string>()
  const p = offerPools({ clubs, playerTeamId, season, tiers })
  const picks = p ? drawOffers(withBudgets(p.pools, nextBudgets), p.rankFrac, 2, rng, taken) : []
  const japan = clubIds(otherClubs(jpelClubs(clubs), playerTeamId)).filter(id => nextBudgets[id] && !taken.has(id))
  if (japan.length > 0) {
    const teamId = japan[Math.floor(rng() * japan.length)] ?? japan[0]
    picks.push({ teamId, kind: kindOf(teamId, tiers.tierNow(playerTeamId), tiers) })
  }
  return picks.map(pk => buildOffer({ ...pk, season, clubs, nextBudgets, nextYear, objBonus: 0, finalRank }))
}
