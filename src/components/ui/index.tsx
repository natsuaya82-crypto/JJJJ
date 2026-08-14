import type { CSSProperties, ReactNode } from 'react'
import { C, alpha, F } from '../../styles/tokens'

/* ── SectionLabel ─────────────────────────── */
export function SectionLabel({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`section-bar label-caps ${className ?? ''}`} style={{ color: C.textDim, ...style }}>
      {children}
    </div>
  )
}

/* ── Card ─────────────────────────────────── */
type CardVariant = 'default' | 'gold' | 'flat'
interface CardProps {
  children: ReactNode
  variant?: CardVariant
  onClick?: () => void
  style?: CSSProperties
  className?: string
  padding?: string
}
export function Card({ children, variant = 'default', onClick, style, className, padding = '14px 16px' }: CardProps) {
  const base: CSSProperties = {
    padding,
    ...(variant === 'gold'
      ? { background: `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})`, border: `1px solid ${alpha(C.gold, 0.3)}` }
      : variant === 'flat'
      ? { background: C.surface, border: `1px solid ${C.border}` }
      : { background: C.surface2, border: `1px solid ${C.border}` }),
    ...style,
  }
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        className={`pressable ${className ?? ''}`}
        style={{ ...base, cursor: 'pointer' }}
        onClick={onClick}
        onKeyDown={e => e.key === 'Enter' && onClick()}
      >
        {children}
      </div>
    )
  }
  return <div className={className} style={base}>{children}</div>
}

/* ── Button ───────────────────────────────── */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
interface BtnProps {
  children: ReactNode
  variant?: BtnVariant
  onClick?: () => void
  disabled?: boolean
  fullWidth?: boolean
  size?: 'sm' | 'md' | 'lg'
  style?: CSSProperties
}
export function Btn({ children, variant = 'primary', onClick, disabled, fullWidth, size = 'md', style }: BtnProps) {
  const heights = { sm: '38px', md: '46px', lg: '52px' }
  const fontSizes = { sm: '12px', md: '14px', lg: '15px' }

  const variantStyle: CSSProperties = (() => {
    switch (variant) {
      case 'primary':
        return {
          background: `linear-gradient(135deg, ${C.gold}, ${C.goldHi})`,
          color: C.bg,
          border: 'none',
          boxShadow: `0 0 20px ${alpha(C.gold, 0.3)}`,
        }
      case 'secondary':
        return {
          background: alpha(C.gold, 0.1),
          color: C.gold,
          border: `1px solid ${alpha(C.gold, 0.3)}`,
        }
      case 'ghost':
        return {
          background: 'none',
          color: C.textSub,
          border: `1px solid ${C.border2}`,
        }
      case 'danger':
        return {
          background: 'transparent',
          color: C.red,
          border: `1px solid ${alpha(C.red, 0.4)}`,
        }
    }
  })()

  return (
    <button
      className="btn-press"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        height: heights[size],
        width: fullWidth ? '100%' : undefined,
        padding: '0 20px',
        fontSize: fontSizes[size],
        fontWeight: '700',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'transform 0.1s ease, opacity 0.1s ease',
        fontFamily: 'inherit',
        ...variantStyle,
        ...style,
      }}
    >
      {children}
    </button>
  )
}

/* ── Badge / Pill ─────────────────────────── */
interface BadgeProps {
  children: ReactNode
  color?: string
  style?: CSSProperties
}
export function Badge({ children, color = C.gold, style }: BadgeProps) {
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px 8px',
      backgroundColor: alpha(color, 0.15),
      border: `1px solid ${alpha(color, 0.35)}`,
      fontSize: F.caption,
      fontWeight: '700',
      color,
      letterSpacing: '0.3px',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {children}
    </span>
  )
}

/* ── Chevron ──────────────────────────────── */
export function Chevron({ color = C.textDim, size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 18l6-6-6-6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

/* ── InfoTile ─────────────────────────────── */
export function InfoTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      backgroundColor: 'rgba(0,0,0,0.3)',
      padding: '9px 6px',
      border: '1px solid rgba(255,255,255,0.04)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: F.bodyLg, fontWeight: '700', color: color ?? C.text }}>{value}</div>
      <div style={{ fontSize: F.caption, color: C.textDim, marginTop: '2px' }}>{label}</div>
    </div>
  )
}

/* ── ProgressBar ──────────────────────────── */
export function ProgressBar({ pct, color = C.gold }: { pct: number; color?: string }) {
  return (
    <div className="progress-track">
      <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}/>
    </div>
  )
}

/* ── Divider ──────────────────────────────── */
export function Divider() {
  return <div style={{ height: '1px', backgroundColor: C.border, margin: '4px 0' }}/>
}
