import { tierBudget } from './clubTier'
import { belongsToClub } from './rosterSync'
import { mapClubs } from './world'
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
 * **クラブ間でお金を動かす唯一の場所。** 払う側から受け取る側へ `amount`。
 *
 * 移籍金（`utils/movePlayer`）もトレードの現金もここを通る。**どのリーグのクラブでも同じ**
 * （置き場所は `finance.budget` 1本）。`amount` がマイナスなら向きが逆になるだけ。
 *
 * ★以前は `movePlayer` が日本のリーグのクラブのお金しか動かさず、海外の側は呼ぶ側が
 *   `settleForeignFee` で別に精算していた（6か所）。呼び忘れた道だけ「海外クラブが
 *   移籍金を払わずに選手を持っていく」になっていた（競り負けの道で実際に起きた）。
 *   **海外の側を別に精算する関数を戻さないこと。**
 *
 * @param payerId 払う側（選手を受け取る側）
 * @param payeeId 受け取る側（選手を出した側）
 */
export function payBetween(
  clubs: WorldClub[],
  payerId: string,
  payeeId: string,
  amount: number,
): WorldClub[] {
  if (amount === 0 || payerId === payeeId) return clubs
  let touched = false
  const next = mapClubs(clubs, (c): WorldClub => {
    const delta = c.id === payeeId ? amount : c.id === payerId ? -amount : 0
    if (delta === 0) return c
    touched = true
    // finance が無い古いセーブの海外クラブだけ、その年に限り格の年間予算から始める
    return { ...c, finance: { ...c.finance, budget: (c.finance?.budget ?? tierBudget(c)) + delta } }
  })
  return touched ? next : clubs
}
