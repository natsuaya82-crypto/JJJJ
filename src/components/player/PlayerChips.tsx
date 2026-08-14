import type { CSSProperties } from 'react'
import type { Nationality, Specialty } from '../../types'
import { SPECIALTY_LABELS } from '../../types'
import { SPEC_COLOR } from '../../utils/playerUtils'
import { isForeignNat } from '../../data/nationalities'
import { C, alpha } from '../../styles/tokens'

// ============================================================================
// 選手の名前の横に出る小さな札。**同じ札はここ1本で描く。**
//
// ■なぜ要るのか
//   タイプの札（「山登り」「エース」など）を、画面ごとに手書きしていた。
//   同じ札のはずなのに実測で**8通り**あった。
//     角の丸み  4 / 5 / 6 / 7 / 10
//     背景の濃さ 0.08 / 0.09 / 0.10 / 0.12 / 0.15
//     枠線      あったり無かったり
//   ロスターで見た札と移籍市場で見た札とドラフトで見た札が別物に見える状態で、
//   直すときも8か所を探して回ることになる。
//
// ■大きさだけは選べる
//   一覧の行（sm）と、見出しや詳細（md）で文字の大きさは変えたい。
//   変えていいのはそこだけで、色・濃さ・枠線・丸みは1つに固定する。
// ============================================================================

type Size = 'sm' | 'md'

const SIZES: Record<Size, { fontSize: number; padding: string }> = {
  sm: { fontSize: 8, padding: '1px 4px' },
  md: { fontSize: 9, padding: '1px 5px' },
}

/** 札の見た目（色だけ差し替える）。タイプ以外の札もこれに合わせる */
function chipStyle(color: string, size: Size = 'md'): CSSProperties {
  return {
    ...SIZES[size],
    backgroundColor: alpha(color, 0.08),
    border: `1px solid ${alpha(color, 0.25)}`,
    color,
    fontWeight: 700,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  }
}

/**
 * 選手タイプの札。**タイプの札を自前で書かないこと**（`npm run check` が見張る）。
 *
 * highlight: その区間の推奨タイプと一致しているとき（区間配置で使う）。
 *            枠線を濃くして ✓ を足す。
 */
export function SpecChip({ specialty, size = 'md', highlight }: {
  specialty: Specialty
  size?: Size
  highlight?: boolean
}) {
  const color = SPEC_COLOR[specialty]
  const s = chipStyle(color, size)
  return (
    <span style={highlight ? { ...s, border: `1px solid ${color}` } : s}>
      {SPECIALTY_LABELS[specialty]}{highlight ? ' ✓' : ''}
    </span>
  )
}

/** 外国人選手の「外」。国籍から出すので、呼ぶ側が条件を書かなくていい（該当しなければ何も出ない） */
export function ForeignChip({ nationality, size = 'sm' }: { nationality: Nationality; size?: Size }) {
  if (!isForeignNat(nationality)) return null
  return <span style={chipStyle(C.blue, size)}>外</span>
}
