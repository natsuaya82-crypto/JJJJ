// ドラフト指名順の決定（gameStore から移設）。
// 順位からの基準番号（standingsPickNumbers）とロッタリー（draftLotteryOrder）。

import { type Division, type SeasonStanding, type Team } from '../types'
import { EMPTY_TEAM_HISTORY, type TeamHistoryMap, teamHistoriesOf } from '../utils/teamHistory'

export function pickExistsAnywhere(teams: Team[], ownerId: string, year: number, round: number): boolean {
  return teams.some(t => (t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === ownerId))
}

// 指名権番号を「前年順位の逆順」で振るためのマップ。最下位=1（全体1位指名）〜優勝=N。
// 各チームの直近シーズン順位（過去シーズンの順位表から数え直した最新年）を使い、成績の悪い順に 1,2,3... を割り当てる。
// 履歴なし（開幕年など）は最下位扱いとし、配列順を維持（＝従来と同じ挙動でフォールバック）。
// そのチームの直近シーズンの順位（履歴が無ければ最下位扱い）。
// ★ドラフト順の基準はこれ1本。standingsPickNumbers と draftLotteryOrder が
//   同じ中身を別々に持っていて、片方だけ直すと基準がズレる形だった
function latestRank(t: Team, histories: TeamHistoryMap): number {
  const past = histories[t.id]?.seasonResults ?? []
  if (past.length === 0) return Number.POSITIVE_INFINITY
  return past.reduce((best, r) => (r.year > best.year ? r : best)).rank
}

/** 成績が悪い順（順位の数字が大きい順）に並べる。ドラフト順の入口2つが同じ並びを使う */
function worstFirst(teams: Team[], histories: TeamHistoryMap): Team[] {
  return [...teams].sort((a, b) => latestRank(b, histories) - latestRank(a, histories))
}

export function standingsPickNumbers(teams: Team[], histories: TeamHistoryMap): Map<string, number> {
  const sorted = worstFirst(teams, histories)
  const map = new Map<string, number>()
  sorted.forEach((t, i) => map.set(t.id, i + 1))
  return map
}

// 2年目以降のドラフト順（1巡目）を決める加重抽選。
// 前年下位5チームだけ抽選で全体1〜5位の指名順を決め、残り（6位以降）は前年順位の逆順。
// teamId → 全体指名順位(1=全体1位) を返す。
export function draftLotteryOrder(teams: Team[], histories: TeamHistoryMap): Map<string, number> {
  const sorted = worstFirst(teams, histories)
  // 下位5チームの重み（最下位ほど高い＝1位指名を引きやすい）
  const LOTTERY_WEIGHTS = [40, 25, 18, 11, 6]
  const pool = sorted.slice(0, 5).map((t, i) => ({ id: t.id, w: LOTTERY_WEIGHTS[i] ?? 1 }))
  const lotteryOrder: string[] = []
  while (pool.length > 0) {
    const total = pool.reduce((s, x) => s + x.w, 0)
    let r = Math.random() * total
    let idx = pool.length - 1
    for (let i = 0; i < pool.length; i++) { r -= pool[i].w; if (r <= 0) { idx = i; break } }
    lotteryOrder.push(pool[idx].id)
    pool.splice(idx, 1)
  }
  const full = [...lotteryOrder, ...sorted.slice(5).map(t => t.id)]
  const map = new Map<string, number>()
  full.forEach((id, i) => map.set(id, i + 1))
  return map
}

// ドラフト順の計算に渡す形。成績はセーブに持たないので、過去シーズンから数え直して詰め替える
export function draftOrderTeams(teams: Team[], pastSeasons: { year: number; standings?: Partial<Record<Division, SeasonStanding[]>> }[]) {
  const histories = teamHistoriesOf(pastSeasons)
  return teams.map(t => ({ id: t.id, seasonResults: (histories[t.id] ?? EMPTY_TEAM_HISTORY).seasonResults }))
}

// トレードの値付けに要るものを state から1回で取り出す。
// 成立(tradePlayer)・チャット交渉(proposeTrade)・逆提示を飲む(acceptTradeCounter)・
// 相手からの打診を飲む(acceptTradeOffer) が、全部この同じ ctx を使う
