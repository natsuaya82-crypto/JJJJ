// トレードが成立したあとの「物の動かし方」。marketSlice から切り出した（挙動不変）。
//
// ■なぜ1本にするのか
//   成立の入口は2つある。
//     ・こちらから出す／飲む（`tradePlayer`。チャットの交渉もここへ集まる）
//     ・相手から届いた打診を飲む（`acceptTradeOffer`）
//   この2つに**同じ手順がまるごと二度書き**されていた（選手を1人ずつ movePlayer で
//   動かし、移籍履歴と退団のお知らせを集め、指名権を入れ替える）。
//   片方だけ直す事故が起きる形なので、動かし方はここ1本にする。
//
// ■ここでやらないこと
//   ・成立していいかの判定（釣り合い・ロスター上限・本人の同意）… 呼び出し側の関門
//   ・ニュースの文面 … 入口ごとに書き分けたいので呼び出し側（`utils/newsItems`）
//   ・現金（移籍金）の受け渡し … `tradePlayer` にしか無い（打診を飲む側に現金は無い）
import { movePlayer, type DepartureNotice } from '../utils/movePlayer'
import type { Player, Team, TransferRecord, WorldClub } from '../types'
import { clubById, mapClubs } from '../utils/world'
import { holdsDraftPicks } from '../data/leagueRules'

/** 誰をどこへ。**渡した順に動かす**（順番を変えると移籍履歴の並びが変わる） */
export type TradeMove = { playerId: string; toTeamId: string }

export type TradeMoveResult = {
  players: Player[]
  clubs: WorldClub[]
  /** 移籍履歴に足すぶん */
  records: TransferRecord[]
  /** 自チームから出ていく選手の退団のお知らせ（movePlayer が作るのは自チーム発だけ） */
  notices: DepartureNotice[]
}

/**
 * トレードで選手を動かす。**出入りとも movePlayer 1本**を通すので、
 * 「片方だけ加入年が入らない」といった書き分けが起きない。
 */
export function runTradeMoves(
  world: { players: Player[]; clubs: WorldClub[] },
  moves: TradeMove[],
  opts: { year: number; date?: string; raceIndex: number; myTeamId: string },
): TradeMoveResult {
  let players = world.players
  let clubs = world.clubs
  const records: TransferRecord[] = []
  const notices: DepartureNotice[] = []
  for (const mv of moves) {
    const m = movePlayer({ players, clubs }, mv.playerId, mv.toTeamId, {
      year: opts.year,
      date: opts.date,
      raceIndex: opts.raceIndex,
      kind: 'trade',
      myTeamId: opts.myTeamId })
    if (!m.ok) continue
    players = m.players
    clubs = m.clubs
    if (m.record) records.push(m.record)
    if (m.notice) notices.push(m.notice)
  }
  return { players, clubs, records, notices }
}

/**
 * トレードの中身に入れてよい指名権。**相手が指名権を持てないクラブなら空**
 * （data/leagueRules の draftPicks）。持てないクラブへ渡すと、こちらから消えて向こうにも入らない。
 * 画面（TradeChatView の札）も同じ `holdsDraftPicks` を見て出さない。
 */
export function tradablePickKeys(clubs: readonly WorldClub[], targetTeamId: string, keys: readonly string[]): string[] {
  return holdsDraftPicks(clubById(clubs, targetTeamId)) ? [...keys] : []
}

/**
 * 指名権を入れ替える。
 *
 * ★**指名権は同一性（オブジェクトそのもの）で数える。** 同じ年・同じ巡・同じ順番の権利が
 *   2つ並ぶことがあるので、キーの文字列で消すと関係ない方が消える。
 *   そのため「渡された clubs から引いて、その clubs へ書き戻す」形を崩さないこと。
 * ★指名権を持てるのは決まり（data/leagueRules の draftPicks）のあるリーグのクラブだけ。
 *   持てないクラブとの入れ替えは呼ぶ側で中身から外してある（`holdsDraftPicks`）。
 */
export function swapDraftPicks(
  clubs: WorldClub[],
  a: { teamId: string; pickKeys: string[] },
  b: { teamId: string; pickKeys: string[] },
): WorldClub[] {
  const keyOf = (pk: Team['draftPicks'][number]) => `${pk.year}-R${pk.round}-${pk.pickNumber}`
  const picksOf = (teamId: string, keys: string[]) => {
    const owned = clubById(clubs, teamId)?.draftPicks ?? []
    return keys.map(k => owned.find(pk => keyOf(pk) === k)).filter(Boolean) as Team['draftPicks']
  }
  const aPicks = picksOf(a.teamId, a.pickKeys)
  const bPicks = picksOf(b.teamId, b.pickKeys)
  if (aPicks.length === 0 && bPicks.length === 0) return clubs
  return mapClubs(clubs, (t): WorldClub => {
    if (!holdsDraftPicks(t)) return t
    if (t.id === a.teamId) return { ...t, draftPicks: [...(t.draftPicks ?? []).filter(pk => !aPicks.includes(pk)), ...bPicks] }
    if (t.id === b.teamId) return { ...t, draftPicks: [...(t.draftPicks ?? []).filter(pk => !bPicks.includes(pk)), ...aPicks] }
    return t
  })
}
