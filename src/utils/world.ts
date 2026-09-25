import type { ForeignLeague } from '../types'
import type { TieredTeam } from './clubTier'

// ============================================================================
// 世界の層（入れ物の核）
//
// **クラブを探す・書くのはこのファイルと utils/clubs.ts だけ。** 入れ物（国内の `teams`・海外の
// `foreignLeagues[].clubs`）を直に読んで find / filter / map するのはここの中だけで、
// 外からは下の関数（と utils/clubs.ts の findClub / makeClubIndex / allForeignClubs …）を呼ぶ。
// `scripts/check-world-layer.ts` が層の外の直読み・直書きを数える。
//
// ★**自チームは `myClub` 1本。** `teams.find(t => t.id === playerTeamId)` を書かないこと
//   （以前は約50か所に手書きがあった）。自チームへの書き込みも `withMyClub` 1本。
//   自チームかどうかを見るだけなら id の比較でよい（`t.id === playerTeamId`）。
//
// ★**このファイルは実行時の import を持たないこと。** league.ts や clubTier.ts からも
//   呼ばれるので、何かを import すると循環して最上位の定数が未初期化のまま読まれる
//   （utils/clubs.ts に置いたとき、clubTier の DIVISIONS が undefined で落ちた）。
// ============================================================================

type MyWorld<T extends { id: string }> = {
  teams: readonly T[] | null | undefined
  playerTeamId: string | null | undefined
}

/** 自チーム。見つからなければ undefined */
export function myClub<T extends { id: string }>(w: MyWorld<T>): T | undefined {
  const id = w.playerTeamId
  return (w.teams ?? []).find(t => t.id === id)
}

/** 自チームだけを fn で書き換えた並びを返す（ほかのクラブは同じ実体のまま） */
export function withMyClub<T extends { id: string }>(
  w: { teams: readonly T[]; playerTeamId: string },
  fn: (t: T) => T,
): T[] {
  return w.teams.map(t => t.id === w.playerTeamId ? fn(t) : t)
}

/**
 * id でクラブの実体（保存されている形そのもの）を引く。見つからなければ undefined。
 * `findClub` は画面用の見た目（Club）を返し、こちらは予算・施設・指名権を持った実体を返す。
 * ★`teams.find(t => t.id === id)` を層の外に書かないこと。
 */
export function teamById<T extends { id: string }>(
  teams: readonly T[] | null | undefined,
  id: string | null | undefined,
): T | undefined {
  return (teams ?? []).find(t => t.id === id)
}

/**
 * 国内チームと海外クラブを1つの配列にまとめる。格を引くときの「クラブ一覧」はこれ。
 *
 * 国内・海外で別の引き方をしないための入口。どちらも `{ id, tier }` を持つので、
 * tierOf から見れば区別が要らない（いずれ海外のクラブを指揮することがあるので、
 * ここで分けてしまうとその時に全部書き直しになる）。
 */
export function allTieredClubs(
  teams: readonly TieredTeam[] | undefined,
  foreignLeagues?: readonly { clubs: readonly TieredTeam[] }[],
): TieredTeam[] {
  return [...(teams ?? []), ...(foreignLeagues ?? []).flatMap(l => [...l.clubs])]
}

/** id でリーグを引く。見つからなければ undefined */
export function leagueById(
  foreignLeagues: ForeignLeague[] | null | undefined,
  leagueId: string | null | undefined,
): ForeignLeague | undefined {
  return (foreignLeagues ?? []).find(l => l.id === leagueId)
}
