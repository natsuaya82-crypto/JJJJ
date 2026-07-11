// ロスターは1つ（フラット）。1軍/2軍・契約種別（本契約/2way/育成）は廃止し、
// 「チーム所属選手の人数上限（ROSTER_MAX）」だけで管理する。
// 旧API名は呼び出し側の互換のため残しつつ、フラット前提の実装に置き換えている。

import type { Player } from '../types'

export const ROSTER_MAX = 30          // ロスター人数上限（フラット）

// 旧定数の互換エイリアス（既存importが壊れないよう残す。全てフラットの上限を指す）
export const MAIN_REG_MAX = ROSTER_MAX
export const MAIN_CONTRACT_MAX = ROSTER_MAX
export const SECOND_REG_MAX = ROSTER_MAX
export const SECOND_CONTRACT_MAX = ROSTER_MAX
export const DUAL_MAX = ROSTER_MAX

export type ContractType = 'standard' | 'development' | 'dual'

// 契約形態は廃止。全員フラット（'main'）扱い。
export function tierForContract(_ct?: ContractType): 'main' | 'second' {
  return 'main'
}

export function isMainMember(p: Player): boolean {
  return p.rosterTier !== 'second'
}
export function isSecondMember(_p: Player): boolean {
  return false
}

export type RosterCounts = { standard: number; dual: number; development: number; main: number; second: number }

export function rosterCounts(players: Player[], teamId: string): RosterCounts {
  const size = players.filter(p => p.teamId === teamId && p.status !== 'retired').length
  return { standard: size, dual: 0, development: 0, main: size, second: 0 }
}

// フラットな人数上限だけで判定（契約形態は無視）
export function canSignContract(players: Player[], teamId: string, _ct?: ContractType): boolean {
  return rosterCounts(players, teamId).main < ROSTER_MAX
}

// 選手ステータス：FA / 移籍リスト入り / 契約中 の3種（契約形態の区別は廃止）
export function playerStatusLabel(p: Player): { label: string; key: 'standard' | 'dual' | 'development' | 'listed' | 'fa' } {
  if (p.teamId === '') return { label: '契約満了（FA）', key: 'fa' }
  if (p.transferListed) return { label: '移籍リスト入り', key: 'listed' }
  return { label: '契約中', key: 'standard' }
}
