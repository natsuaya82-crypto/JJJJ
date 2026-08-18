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

// Decorative header SVG for CardTraining page
export function CardTrainingHeaderSVG({ width = 100, height = 72 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 100 72" fill="none">
      {/* Back cards */}
      <rect x="42" y="8" width="32" height="44" rx="4" fill="#1a1030" stroke={C.purple} strokeWidth="1.2" opacity="0.6" transform="rotate(12 58 30)"/>
      <rect x="28" y="10" width="32" height="44" rx="4" fill="#1a1030" stroke="#7c3aed" strokeWidth="1.2" opacity="0.7" transform="rotate(-8 44 32)"/>
      {/* Front card */}
      <rect x="30" y="14" width="38" height="50" rx="5" fill="#2d1060" stroke={C.purple} strokeWidth="2"/>
      {/* Card inner frame */}
      <rect x="33" y="17" width="32" height="44" rx="3" stroke="#c084fc" strokeWidth="0.8" opacity="0.4"/>
      {/* Lightning bolt on card */}
      <path d="M49 26l-5 10h5l-5 10" stroke={C.amber} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      {/* Sparkles */}
      <path d="M75 16l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" fill={C.amber} opacity="0.9"/>
      <path d="M82 36l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill="#c084fc" opacity="0.8"/>
      <path d="M22 28l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" fill={C.purple} opacity="0.7"/>
      <path d="M88 52l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill={C.amber} opacity="0.6"/>
      {/* Stat label lines on card */}
      <rect x="36" y="50" width="14" height="2" rx="1" fill="#c084fc" opacity="0.5"/>
      <rect x="36" y="55" width="8" height="2" rx="1" fill="#c084fc" opacity="0.3"/>
    </svg>
  )
}
