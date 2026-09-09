import type { ReactElement } from 'react'
import type { CardStatKey } from '../../types'
import { C } from '../../styles/tokens'

type Props = { size?: number; color?: string }

export function SpeedIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" fill={color} stroke={color} strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}

export function StaminaIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 21C12 21 3 15.5 3 9a5 5 0 019-3 5 5 0 019 3c0 6.5-9 12-9 12z" fill={color} stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
    </svg>
  )
}

export function MountainUpIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 20l6-10 4 6 3-4 5 8H3z" fill={color} opacity="0.5" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M17 4l3 6h-6l3-6z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round"/>
      <path d="M17 4v10" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 1.5"/>
    </svg>
  )
}

export function MountainDownIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 20l6-10 4 6 3-4 5 8H3z" fill={color} opacity="0.5" stroke={color} strokeWidth="1.3" strokeLinejoin="round"/>
      <path d="M17 14l3-6h-6l3 6z" fill={color} stroke={color} strokeWidth="1" strokeLinejoin="round"/>
      <path d="M17 14V4" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 1.5"/>
    </svg>
  )
}

export function PacingIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="8" stroke={color} strokeWidth="1.6"/>
      <path d="M12 6V5M12 5l-1.5-1M12 5l1.5-1" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 13V9" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 13l3.5 2" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="12" cy="13" r="1.2" fill={color}/>
    </svg>
  )
}

export function MentalIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 2l2.2 6.5H21l-5.6 4 2.2 6.5L12 15l-5.6 4 2.2-6.5L3 8.5h6.8L12 2z" fill={color} stroke={color} strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  )
}

export function RecoveryIcon({ size = 18, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 12h6M12 9v6" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M12 21a9 9 0 100-18 9 9 0 000 18z" stroke={color} strokeWidth="1.6"/>
    </svg>
  )
}

export const STAT_ICON_MAP: Record<CardStatKey, (props: Props) => ReactElement> = {
  speed: SpeedIcon,
  stamina: StaminaIcon,
  mountainUp: MountainUpIcon,
  mountainDown: MountainDownIcon,
  pacing: PacingIcon,
  mental: MentalIcon,
  recovery: RecoveryIcon,
}

/**
 * **優勝トロフィー。** 大きさだけ渡せる。
 *
 * ★このアプリのアイコンは全部インラインSVGです。**絵文字を書かないこと**——
 *   2026-08-20 に 🏆 を2か所へ直書きして、そこだけ見た目が浮いていました
 *   （リポジトリ全体で絵文字はその2件だけ＝作法を確認せずに貼った）。
 */
export function TrophyIcon({ size = 16, color = C.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      {/* ★浅くて広い椀にすること。細長くするとワイングラスに見えます（最初そうなった） */}
      <path d="M5 3h14v4a7 7 0 01-14 0V3z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      {/* 取っ手。これが無いとゴブレットに見える */}
      <path d="M5 4H2v1.5A3.5 3.5 0 005.4 9M19 4h3v1.5A3.5 3.5 0 0118.6 9" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M12 14v4M8 21h8" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/** 選手（人）。プレゼントの中身を並べるときに使う */
export function RunnerIcon({ size = 16, color = C.gold }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, display: 'block' }}>
      <circle cx="14" cy="4.5" r="2.2" stroke={color} strokeWidth="1.8"/>
      <path d="M15.5 9L11 11l1.5 4 3 5M11 11L7 13.5M12.5 15L8 17l-2 4" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15.5 9l3.5 2.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}
