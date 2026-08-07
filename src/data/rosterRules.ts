// ロスターは1つだけ。1軍/2軍の区分は無い。
// 「チーム所属選手の人数上限（ROSTER_MAX）」だけで管理する。

import type { Player } from '../types'

export const ROSTER_MAX = 30          // ロスター人数上限（フラット）
export const ROSTER_MIN = 15          // ロスター人数下限（15人はOK・14人にしようとするとブロック）

/**
 * 駅伝で実際に走れる人数。ここに入れるかどうかが「出られるか」の境目。
 * 移籍の判断（transferDecision）と、クラブの必要（squadNeeds）の両方が使うので、
 * どちらにも依存しないここに置く。
 */
export const RUNNING_SLOTS = 7

/**
 * そのクラブのロスター上限。**上限を数えるのはここ1本。**
 * ドラフトで指名した選手を迎える枠を空けておく必要があるので、
 * 未消化の指名権のぶんだけ上限を下げる（指名が終わっていれば0）。
 */
export function rosterCapOf(pendingDraftPicks: number = 0): number {
  return ROSTER_MAX - Math.max(0, pendingDraftPicks)
}

// チームの在籍人数（引退除く）。放出・解雇の下限判定に使う。
export function teamRosterSize(players: Player[], teamId: string): number {
  return players.filter(p => p.teamId === teamId && p.status !== 'retired').length
}
// あと1人放出しても下限を割らないか（放出・解雇の可否）
export function canReleaseFromRoster(players: Player[], teamId: string): boolean {
  return teamRosterSize(players, teamId) > ROSTER_MIN
}

export type ContractType = 'standard' | 'development' | 'dual'

// フラットな人数上限だけで判定。契約形態(ContractType)による枠の違いは廃止済みなので、
// 受け取るだけで使わない第3引数は持たない（呼び出し側が「形態で枠が変わる」と誤解する元）
export function canSignContract(players: Player[], teamId: string): boolean {
  return teamRosterSize(players, teamId) < ROSTER_MAX
}

// 「この選手と契約したら人数が増えるのか」で見る枠判定。
// すでに在籍している選手との契約（トレードで来た直後の再契約など）は人数が増えないので枠は要らない。
// movePlayer が「クラブが変わるときだけ枠を見る」（utils/movePlayer.ts の clubChanged）のと
// 同じ条件をここに置く。画面側が canSignContract を直に呼んで弾いていたせいで、
// 30人ちょうどのときトレードは通るのにそのあとの契約提示だけ弾かれていた。
// 契約の可否を画面から見るときは必ずこちらを使うこと。
export function canSignPlayer(players: Player[], teamId: string, playerId: string): boolean {
  if (players.some(p => p.id === playerId && p.teamId === teamId)) return true
  return canSignContract(players, teamId)
}

// 選手ステータス：FA / 移籍リスト入り / 契約中 の3種（契約形態の区別は廃止）
export function playerStatusLabel(p: Player): { label: string; key: 'standard' | 'dual' | 'development' | 'listed' | 'fa' } {
  if (p.teamId === '') return { label: '契約満了（FA）', key: 'fa' }
  if (p.transferListed) return { label: '移籍リスト入り', key: 'listed' }
  return { label: '契約中', key: 'standard' }
}
