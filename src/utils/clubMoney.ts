import { tierBudget } from './clubTier'
import type { ForeignLeague } from '../types'

/**
 * **移籍金の海外側の精算（唯一の場所）。**
 *
 * `movePlayer` は `teams`（国内52クラブ）しか知りません。それは意図した設計で、
 * 崩さないことになっています（`docs/BACKLOG.md` A-4）。そのため
 * **相手が海外クラブのときは、片側（国内）しかお金が動きませんでした。**
 *
 *   自チームが海外クラブへ売る … 自チームは受け取るが、**海外クラブは払っていない**
 *   自チームが海外から買う     … 自チームは払うが、**海外クラブは受け取っていない**
 *
 * つまり移籍のたびに世界のお金が湧いたり消えたりしていました。
 * オフの市場（`engine/transferMarket`）は自前の帳簿を持っているので合っていて、
 * **自チームがからむシーズン中の移籍だけ**が漏れていた、という形です。
 *
 * この関数は `movePlayer` の**すぐ外側**で呼びます。渡したIDが海外クラブでなければ
 * 何もしないので、国内同士かどうかを呼ぶ側で分岐しないこと。
 *
 * @param fromClubId 選手を出した側（受け取る）
 * @param toClubId   選手を受け取った側（払う）
 */
export function settleForeignFee(
  leagues: readonly ForeignLeague[] | undefined,
  fromClubId: string,
  toClubId: string,
  fee: number,
): ForeignLeague[] {
  const src = leagues ?? []
  if (fee <= 0 || fromClubId === toClubId) return src as ForeignLeague[]
  let touched = false
  const next = src.map(l => ({
    ...l,
    clubs: l.clubs.map(c => {
      const delta = c.id === fromClubId ? fee : c.id === toClubId ? -fee : 0
      if (delta === 0) return c
      touched = true
      // 置き場所は国内チームとまったく同じ finance.budget 1本。
      // finance が無い古いセーブだけ、その年に限り格の年間予算から始める
      return { ...c, finance: { ...c.finance, budget: (c.finance?.budget ?? tierBudget(c)) + delta } }
    }),
  }))
  return touched ? next : (src as ForeignLeague[])
}
