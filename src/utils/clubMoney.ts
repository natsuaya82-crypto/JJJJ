import { tierBudget } from './clubTier'
import { belongsToClub } from './rosterSync'
import { isJpelLeague, mapClubs } from './world'
import type { Player, WorldClub } from '../types'

/**
 * **そのクラブが払う総年俸。数えるのはここ1本。**
 *
 * ■誰のぶんを払うのか（オーナー・2026-09-15「年俸は借りた側ね」）
 *   **レンタルで借りている選手の年俸は、借りた側が払います。** なので数える集合は
 *   `utils/rosterSync` の `belongsToClub`＝**そのクラブでプレーする人**（引退していない
 *   人は全員。怪我も借りている選手も入る）。`data/rosterRules` の `teamRosterSize` と
 *   同じ population で、人数と金額が必ず一致します。
 *
 * ■★4か所が別々に数えていました（2026-09-15 に1本化）
 *   | どこ | 何で数えていたか | 借りている選手 |
 *   |---|---|---|
 *   | 予算の請求（`engine/seasonBudget`） | `teamId` だけ | 含む |
 *   | CPUの使える枠（`engine/cpuMarket`） | `clubIndexOf` | 含む |
 *   | 画面の「総年俸」（`TeamManagement`） | 手書きの filter | 含む |
 *   | `gameStore.getSalaryTotal` | `squadPlayersOf` | **除く** |
 *
 *   最後の1つだけ答えが違い、しかも**どこからも呼ばれていませんでした**（削除済み）。
 *   呼ばれていれば「画面の総年俸と、実際に引かれる額が違う」になっていた形です。
 */
export function clubSalaryTotal(players: readonly Player[], clubId: string): number {
  let sum = 0
  for (const p of players) if (belongsToClub(p, clubId)) sum += p.contract?.annualSalary ?? 0
  return sum
}

/**
 * **移籍金の海外側の精算（唯一の場所）。**
 *
 * `movePlayer` は日本のリーグのクラブのお金しか動かしません。それは意図した設計で、
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
  clubs: WorldClub[],
  fromClubId: string,
  toClubId: string,
  fee: number,
): WorldClub[] {
  if (fee <= 0 || fromClubId === toClubId) return clubs
  let touched = false
  const next = mapClubs(clubs, (c): WorldClub => {
    // 日本のリーグのクラブは movePlayer が動かしている
    if (isJpelLeague(c.leagueId)) return c
    const delta = c.id === fromClubId ? fee : c.id === toClubId ? -fee : 0
    if (delta === 0) return c
    touched = true
    // 置き場所は国内チームとまったく同じ finance.budget 1本。
    // finance が無い古いセーブだけ、その年に限り格の年間予算から始める
    return { ...c, finance: { ...c.finance, budget: (c.finance?.budget ?? tierBudget(c)) + delta } }
  })
  return touched ? next : clubs
}
