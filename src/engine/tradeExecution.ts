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
import type { Player, Team, TransferRecord } from '../types'

/** 誰をどこへ。**渡した順に動かす**（順番を変えると移籍履歴の並びが変わる） */
export type TradeMove = { playerId: string; toTeamId: string }

export type TradeMoveResult = {
  players: Player[]
  teams: Team[]
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
  world: { players: Player[]; teams: Team[] },
  moves: TradeMove[],
  opts: { year: number; date?: string; raceIndex: number; myTeamId: string },
): TradeMoveResult {
  let players = world.players
  let teams = world.teams
  const records: TransferRecord[] = []
  const notices: DepartureNotice[] = []
  for (const mv of moves) {
    const m = movePlayer({ players, teams }, mv.playerId, mv.toTeamId, {
      year: opts.year,
      date: opts.date,
      raceIndex: opts.raceIndex,
      kind: 'trade',
      myTeamId: opts.myTeamId })
    if (!m.ok) continue
    players = m.players
    teams = m.teams
    if (m.record) records.push(m.record)
    if (m.notice) notices.push(m.notice)
  }
  return { players, teams, records, notices }
}

/**
 * 指名権を入れ替える。
 *
 * ★**指名権は同一性（オブジェクトそのもの）で数える。** 同じ年・同じ巡・同じ順番の権利が
 *   2つ並ぶことがあるので、キーの文字列で消すと関係ない方が消える。
 *   そのため「渡された teams から引いて、その teams へ書き戻す」形を崩さないこと。
 */
export function swapDraftPicks(
  teams: Team[],
  a: { teamId: string; pickKeys: string[] },
  b: { teamId: string; pickKeys: string[] },
): Team[] {
  const keyOf = (pk: Team['draftPicks'][number]) => `${pk.year}-R${pk.round}-${pk.pickNumber}`
  const picksOf = (teamId: string, keys: string[]) => {
    const owned = teams.find(t => t.id === teamId)?.draftPicks ?? []
    return keys.map(k => owned.find(pk => keyOf(pk) === k)).filter(Boolean) as Team['draftPicks']
  }
  const aPicks = picksOf(a.teamId, a.pickKeys)
  const bPicks = picksOf(b.teamId, b.pickKeys)
  if (aPicks.length === 0 && bPicks.length === 0) return teams
  return teams.map(t => {
    if (t.id === a.teamId) return { ...t, draftPicks: [...(t.draftPicks ?? []).filter(pk => !aPicks.includes(pk)), ...bPicks] }
    if (t.id === b.teamId) return { ...t, draftPicks: [...(t.draftPicks ?? []).filter(pk => !bPicks.includes(pk)), ...aPicks] }
    return t
  })
}
