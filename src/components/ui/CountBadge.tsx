import { C, F, SAIRA } from '../../styles/tokens'

/**
 * 【未読の数字】赤い丸に件数。**見た目も上限の出し方もここ1本。**
 *
 * ベル・下タブの「オンライン」・ホームの「チャット」で同じものを使う。
 * 画面ごとに書き写すと、片方だけ大きさや `9+` の出し方がずれる
 * （`check-ui-tokens` の予算が見張っているのと同じ形の事故）。
 */
export default function CountBadge({ count, max = 9 }: { count: number; max?: number }) {
  if (count <= 0) return null
  return (
    <span style={{
      position: 'absolute', top: -2, right: -2,
      minWidth: 16, height: 16, borderRadius: '50%',
      padding: '0 3px', boxSizing: 'border-box',
      background: C.red, color: C.text,
      fontSize: F.tiny, fontWeight: 900, fontFamily: SAIRA,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: `1.5px solid ${C.bg}`, lineHeight: 1,
    }}>{count > max ? `${max}+` : count}</span>
  )
}
