// 記録パッチの中身（テキスト＋国旗＋メダルSVG）を描画する共通コンポーネント。
// 枠・背景色は呼び出し側（PlayerRow / PlayerSheet / ShareCard）が badgeColor(badge) で塗る
import type { PlayerBadge } from '../../utils/badges'
import { BADGE_COLOR } from '../../utils/badges'

export const badgeColor = (b: PlayerBadge): string => b.color ?? BADGE_COLOR[b.kind]

// 金銀銅メダル（SVG）。絵文字は使わない
export function MedalSVG({ rank, size = 10 }: { rank: 1 | 2 | 3; size?: number }) {
  const [hi, lo] = rank === 1 ? ['#FFE55C', '#D4A017'] : rank === 2 ? ['#F0F0F0', '#9E9E9E'] : ['#E0955B', '#9C5A28']
  const gid = `medal-g${rank}`
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" style={{ flexShrink: 0, display: 'inline-block', verticalAlign: '-1px', marginLeft: 2 }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={hi} />
          <stop offset="1" stopColor={lo} />
        </linearGradient>
      </defs>
      {/* リボン */}
      <path d="M3.1 0.4 L6 4.4 L8.9 0.4 L11 0.4 L7.2 5.6 L4.8 5.6 L1 0.4 Z" fill="#C0392B" />
      {/* メダル本体 */}
      <circle cx="6" cy="7.7" r="4" fill={`url(#${gid})`} stroke={lo} strokeWidth="0.6" />
      <circle cx="6" cy="7.7" r="2.7" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" />
    </svg>
  )
}

export default function BadgeContent({ badge, iconSize = 11 }: { badge: PlayerBadge; iconSize?: number }) {
  return (
    <>
      {badge.label}
      {badge.flag && (
        <img
          src={`/flags/${badge.flag}.svg`} alt="" draggable={false}
          style={{ width: iconSize, height: Math.round(iconSize * 0.75),objectFit: 'cover', display: 'inline-block', verticalAlign: '-1px', margin: '0 1px' }}
        />
      )}
      {badge.labelSuffix}
      {badge.medal && <MedalSVG rank={badge.medal} size={iconSize} />}
    </>
  )
}
