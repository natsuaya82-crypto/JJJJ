// レース1本ぶんの士気の増減。**国内も海外も、自チームもCPUも、ここ1本。**
//
// ■なぜ作ったのか（オーナー・2026-08-19「モラールって何？しかも機能してる？」）
//   実際に回して数えると、**2年で世界中の士気が100に張り付いて**いました。
//
//     CPU・海外の全選手      95 → 100 → 100 → …
//     自チーム（中位以上）   95 → 100 → 100 → …
//     自チーム（最下位争い） 45 →  15 →  15 → …
//
//   上げる口ばかりで下げる口が無かったためです。
//
//     ・`growPlayer` が**毎年 全選手に +5**（下がる口は1つも無い）
//     ・レースで士気が動くのは**自チームだけ**だった（232クラブ5,800人は一生100）
//     ・自チームも、下がるのはその部の下位に入ったときだけ
//
//   士気はタイムに直接掛かる（70で±0・100で+3%・10で−4.3%）ので、
//   これは「ほぼ全員が+3%」＝**掛けていないのと同じ**でした。
//   区間賞の+5も、エース／主力をベンチに置いた−4も、上限で消えて何も起きていません。
//
// ■いまの決まり（オーナー判断・2026-08-19「cとb」「03」）
//   **何も無ければ既定値(70)へ戻る。** 毎レース `MORALE_RECOVER` ぶん近づけてから、
//   そのレースの結果を足す。落ち着く先は
//
//     優勝争い 97 ／ 3位以内 80 ／ 中位 70 ／ 最下位争い 53   （＝ +2.7% 〜 −1.2%）
//
//   ★**ただ減らすだけにしないこと。** 上げる口が優勝争いにしか無いので、
//     一律で減らすと今度は中位が下に張り付いて、やはり差が消えます
//     （戻す速さ10%だと上位が全部100＝いまと同じ、40%だと差がほぼ消える。実測）。
//   ★`growPlayer` の毎年+5 は**外しました**。70へ戻る形なら要らず、
//     残すと結局100へ寄ります。
import type { Player } from '../types'
import { MORALE_DEFAULT, withMorale } from '../utils/condition'

/** 毎レース、士気を既定値(70)へこの割合だけ戻す */
export const MORALE_RECOVER = 0.3

/** そのレースの着順ぶんの増減。**部のクラブ数で決まるので、出走数を渡すこと** */
export function moraleDeltaForRank(rank: number, teamCount: number): number {
  if (rank === 1) return 8
  if (rank <= 3) return 3
  if (rank >= teamCount - 2) return -5
  return 0
}

/** そのクラブがそのレースでどうだったか */
export type RaceStanding = { rank: number; teamCount: number }

/**
 * レース1本ぶんの士気を全選手へ適用する。
 *
 * 走ったクラブの選手だけが動く（`standing` にそのクラブが無ければ何もしない）。
 * 出た選手も控えも同じだけ動く＝チームの雰囲気なので、走者だけに配らない。
 */
export function applyRaceMorale(params: {
  players: Player[]
  /** クラブID → そのレースの着順と出走クラブ数 */
  standing: Map<string, RaceStanding>
  /** 区間賞を取った選手 */
  segWinIds: Set<string>
  /** そのレースを走った選手（ベンチのエース減点に使う） */
  racingIds: Set<string>
}): Player[] {
  const { players, standing, segWinIds, racingIds } = params
  if (standing.size === 0) return players
  return players.map(p => {
    const st = standing.get(p.teamId)
    if (!st || p.status === 'retired') return p
    // ★先に既定値へ戻してから、結果ぶんを足す
    const back = (p.morale ?? MORALE_DEFAULT) + (MORALE_DEFAULT - (p.morale ?? MORALE_DEFAULT)) * MORALE_RECOVER
    // 役割ミスマッチ：エース/主力を任命したのにベンチだと下がる（口約束の代償）
    const benchPenalty = (!racingIds.has(p.id) && (p.teamRole === 'ace' || p.teamRole === 'key_player'))
      ? (p.teamRole === 'ace' ? 4 : 2) : 0
    const delta = moraleDeltaForRank(st.rank, st.teamCount) + (segWinIds.has(p.id) ? 5 : 0) - benchPenalty
    return withMorale({ ...p, morale: back }, delta)
  })
}

/** レース結果から `standing` を作る（着順表はどの大会も同じ形なので、数え方は1本） */
export function standingOf(teamRankings: readonly { teamId: string; rank: number }[]): Map<string, RaceStanding> {
  const teamCount = teamRankings.length
  return new Map(teamRankings.map(tr => [tr.teamId, { rank: tr.rank, teamCount }]))
}
