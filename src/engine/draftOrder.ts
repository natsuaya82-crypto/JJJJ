// ドラフト指名順の決定（gameStore から移設）。
// 順位からの基準番号（standingsPickNumbers）とロッタリー（draftLotteryOrder）。

import { type Division, type SeasonStanding, type Team } from '../types'
import { domesticThroughRank } from '../utils/league'
import { EMPTY_TEAM_HISTORY, type TeamHistoryMap, teamHistoriesOf } from '../utils/teamHistory'

export function pickExistsAnywhere(teams: Team[], ownerId: string, year: number, round: number): boolean {
  return teams.some(t => (t.draftPicks ?? []).some(pk => pk.year === year && pk.round === round && pk.originallyOwnedBy === ownerId))
}

// 指名権番号を「前年成績の逆順」で振るためのマップ。最下位=1（全体1位指名）〜優勝=N。
// 履歴なし（開幕年など）は最下位扱いとし、配列順を維持（＝従来と同じ挙動でフォールバック）。
//
// ★ドラフト順の基準はこれ1本。standingsPickNumbers と draftLotteryOrder が
//   同じ中身を別々に持っていて、片方だけ直すと基準がズレる形だった
//
// ★★**部内順位ではなく通し順位で見ること。**（オーナー・2026-08-20
//   「昇格組が前年の19位20位と入れ替わるってだけじゃないの？」）
//   部内順位のまま比べていたので、前年2部1位で昇格したクラブが
//   「いちばん成績が良かったクラブ」になり、**優勝クラブより後ろの全体最後**に
//   指名していた（実測：昇格組が20位指名と18位指名）。
//   通し順位（部→部内順位で数える）にすると、昇格組は21位・22位＝**1部の最下位2つより下**
//   になり、そのまま「19位・20位の枠に入る」形になる。格を決めるのと同じ物差しなので、
//   ここに新しい基準を作らないこと。
function latestRank(t: Team, histories: TeamHistoryMap): number {
  const past = histories[t.id]?.seasonResults ?? []
  if (past.length === 0) return Number.POSITIVE_INFINITY
  const last = past.reduce((best, r) => (r.year > best.year ? r : best))
  return domesticThroughRank(last.division, last.rank)
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
