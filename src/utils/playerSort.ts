// 選手一覧の並び替え。キー・ラベル・比較関数がTeamManagement/ScoutPage/TransferPageの
// 3箇所にバラバラに手書きされていて、呼び方（OVR順／評価順／総合値）も見た目も揃っていなかった。
// ここに1本化する。「評価順」「総合値」は使わず、全部「OVR順」に統一する。
import type { Player } from '../types'
import { ovr, calcTransferValue } from './playerUtils'

export type PlayerSortKey = 'ovr' | 'age' | 'specialty' | 'value' | 'salary' | 'name'

export const PLAYER_SORT_LABEL: Record<PlayerSortKey, string> = {
  ovr: 'OVR順', age: '年齢順', specialty: 'タイプ順',
  value: '市場価値順', salary: '年俸順', name: '名前順',
}

// 各キーの「昇順(asc)」の中身。dir='desc'はこれを反転するだけなので、
// 値そのものの意味（OVRが高い方／年上／市場価値が高い方…のどちらが先か）はここだけ見ればわかる
function baseDiff(key: PlayerSortKey, a: Player, b: Player): number {
  switch (key) {
    case 'ovr': return ovr(a) - ovr(b)
    case 'age': return a.age - b.age
    case 'specialty': return a.specialty.localeCompare(b.specialty)
    case 'value': return calcTransferValue(a) - calcTransferValue(b)
    case 'salary': return a.contract.annualSalary - b.contract.annualSalary
    case 'name': return a.name.localeCompare(b.name)
  }
}

/**
 * 選手配列の Array.sort 用比較関数を返す。
 * dir省略時は 'desc'（OVR・市場価値・年俸は高い方が先頭、年齢は年上が先頭、名前はZ→A）。
 * 呼び出し側で欲しい並びに合わせて 'asc'/'desc' を渡すこと（このファイルは並び順の中身を変えない）。
 */
export function comparePlayers(key: PlayerSortKey, dir: 'asc' | 'desc' = 'desc'): (a: Player, b: Player) => number {
  return (a, b) => {
    const d = baseDiff(key, a, b)
    return dir === 'asc' ? d : -d
  }
}
