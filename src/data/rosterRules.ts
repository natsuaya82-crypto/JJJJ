// ロスター枠の唯一の情報源。
// 1軍：登録23人 ＝ 1軍契約(standard)18 ＋ 2way(dual)最大5
// 2軍：登録20人 ＝ 2軍契約(development)15 ＋ 2way(dual)最大5
// 2way(dual)枠は1軍/2軍で共通（同じ選手が両方に登録される）。データ上は rosterTier='main' で保持し、
// contractType==='dual' なら2軍にも所属しているものとして扱う。

import type { Player } from '../types'

export const MAIN_REG_MAX = 23        // 1軍登録上限
export const MAIN_CONTRACT_MAX = 18   // 1軍契約(standard)上限
export const SECOND_REG_MAX = 20      // 2軍登録上限
export const SECOND_CONTRACT_MAX = 15 // 2軍契約(development)上限
export const DUAL_MAX = 5             // 2way(dual)上限（1軍/2軍共通）

export type ContractType = 'standard' | 'development' | 'dual'

// 契約形態→データ上の rosterTier（standard/dual は1軍側で保持、development は2軍）
export function tierForContract(ct?: ContractType): 'main' | 'second' {
  return ct === 'development' ? 'second' : 'main'
}

// 1軍に所属（standard + dual）
export function isMainMember(p: Player): boolean {
  return p.rosterTier === 'main'
}
// 2軍に所属（development + dual）
export function isSecondMember(p: Player): boolean {
  return p.rosterTier === 'second' || p.contract.contractType === 'dual'
}

export type RosterCounts = { standard: number; dual: number; development: number; main: number; second: number }

export function rosterCounts(players: Player[], teamId: string): RosterCounts {
  const team = players.filter(p => p.teamId === teamId && p.status !== 'retired')
  const dual = team.filter(p => p.contract.contractType === 'dual').length
  const standard = team.filter(p => p.rosterTier === 'main' && p.contract.contractType !== 'dual').length
  const development = team.filter(p => p.rosterTier === 'second').length
  return { standard, dual, development, main: standard + dual, second: development + dual }
}

// 指定の契約形態でサインできる空きがあるか
export function canSignContract(players: Player[], teamId: string, ct: ContractType): boolean {
  const c = rosterCounts(players, teamId)
  if (ct === 'standard') return c.standard < MAIN_CONTRACT_MAX && c.main < MAIN_REG_MAX
  if (ct === 'dual') return c.dual < DUAL_MAX && c.main < MAIN_REG_MAX && c.second < SECOND_REG_MAX
  return c.development < SECOND_CONTRACT_MAX && c.second < SECOND_REG_MAX
}

// 選手のステータスを5種に統一：本契約 / 2way契約 / 育成契約 / 移籍リスト入り / 契約満了(FA)
export function playerStatusLabel(p: Player): { label: string; key: 'standard' | 'dual' | 'development' | 'listed' | 'fa' } {
  if (p.teamId === '') return { label: '契約満了（FA）', key: 'fa' }
  if (p.transferListed) return { label: '移籍リスト入り', key: 'listed' }
  const ct = p.contract.contractType
  if (ct === 'dual') return { label: '2way契約', key: 'dual' }
  if (ct === 'development' || p.rosterTier === 'second') return { label: '育成契約', key: 'development' }
  return { label: '本契約', key: 'standard' }
}
