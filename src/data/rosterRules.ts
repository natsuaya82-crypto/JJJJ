// ロスターは1つだけ。1軍/2軍の区分は無い。
// 「チーム所属選手の人数上限（ROSTER_MAX）」だけで管理する。

import type { Player } from '../types'

export const ROSTER_MAX = 30          // ロスター人数上限（フラット）
export const ROSTER_MIN = 15          // ロスター人数下限（15人はOK・14人にしようとするとブロック）

// チームの在籍人数（引退除く）。放出・解雇の下限判定に使う。
export function teamRosterSize(players: Player[], teamId: string): number {
  return players.filter(p => p.teamId === teamId && p.status !== 'retired').length
}
// あと1人放出しても下限を割らないか（放出・解雇の可否）
export function canReleaseFromRoster(players: Player[], teamId: string): boolean {
  return teamRosterSize(players, teamId) > ROSTER_MIN
}

export type ContractType = 'standard' | 'development' | 'dual'

// フラットな人数上限だけで判定（契約形態は無視）
export function canSignContract(players: Player[], teamId: string, _ct?: ContractType): boolean {
  return teamRosterSize(players, teamId) < ROSTER_MAX
}

// 選手ステータス：FA / 移籍リスト入り / 契約中 の3種（契約形態の区別は廃止）
export function playerStatusLabel(p: Player): { label: string; key: 'standard' | 'dual' | 'development' | 'listed' | 'fa' } {
  if (p.teamId === '') return { label: '契約満了（FA）', key: 'fa' }
  if (p.transferListed) return { label: '移籍リスト入り', key: 'listed' }
  return { label: '契約中', key: 'standard' }
}
