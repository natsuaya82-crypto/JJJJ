import type { ReactElement } from 'react'

type Props = { size?: number; color?: string }

// ── Shoes ────────────────────────────────────────────────────────────────────

export function ShoeEntryIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 19h20v1.5a1.5 1.5 0 01-1.5 1.5H3.5A1.5 1.5 0 012 19.5V19z" fill={color} opacity="0.4"/>
      <path d="M3 19V13Q3 9.5 7.5 9L11 8L15 9L18 11L22 16V19H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M11.5 9V19" stroke={color} strokeWidth="0.8" opacity="0.35"/>
      <path d="M9 12H14M8 14.5H15" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function ShoeRaceIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 20h20v1a1 1 0 01-1 1H3a1 1 0 01-1-1v-1z" fill={color} opacity="0.4"/>
      <path d="M3 20V16Q3 12.5 7 12L11 11L15 11.5L19 13.5L22 17V20H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5 17Q10 15.5 17 16.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/>
      <path d="M10 13H15" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function ShoeMountainIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 16.5h20V18.5a2 2 0 01-2 2H4a2 2 0 01-2-2V16.5z" fill={color} opacity="0.3"/>
      <path d="M5 16.5V20.5M8 16.5V21M11 16.5V20.5M14 16.5V21M17 16.5V20.5M20 16.5V21" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M3 16.5V10Q3 6.5 7.5 6L12 5.5L16 6.5L19 9.5L22 13.5V16.5H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 10.5H14M7 13H15" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

export function ShoeProIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 20h20v1.5H2V20z" fill={color} opacity="0.5"/>
      <path d="M2.5 20L21.5 19.5" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M3 19.5V17Q3 14 6.5 13L10 12.5L14 13L18 14.5L22 17.5V19.5H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M8 15.5L13 14M12 16.5L17 15" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function ShoeLegendIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 17H22V18.5H2V17z" fill={color} opacity="0.35"/>
      <path d="M5 18.5V21M8.5 18.5V21.5M12 18.5V21M15.5 18.5V21.5M19 18.5V21" stroke={color} strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M3 17V13Q3 9.5 7.5 8.5L12 8L15.5 9L18.5 11.5L22 15V17H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 11H14M8 13.5H15" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
      <path d="M20 7l.6 1.8H23l-1.5 1.1.6 1.9L20 10.7l-2.1 1 .6-1.9L17 8.8h2.4z" fill={color} opacity="0.75"/>
    </svg>
  )
}

export function ShoeFlatIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 21h20v1H2v-1z" fill={color} opacity="0.4"/>
      <path d="M3 21V18.5Q3 15.5 6 15L10 14.5L14 15L18 16L22 19V21H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M5 18Q11 16.5 18.5 17.5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

export function ShoeTrailIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M2 15.5h20V17.5H2V15.5z" fill={color} opacity="0.25"/>
      <path d="M4 15.5V20M6.5 15.5V21M9 15.5V20M11.5 15.5V21M14 15.5V20M16.5 15.5V21M19 15.5V20M21 15.5V20" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M3 15.5V8Q3 4.5 8.5 4L13 3.5L17 5L19.5 8L22 12V15.5H3z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 7.5H14M8 10H15M8 12.5H14" stroke={color} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

// ── Wear ─────────────────────────────────────────────────────────────────────

export function WearBasicIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 3H16V4.5Q16 8 19 9L18 21H6L5 9Q8 8 8 4.5V3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8 3Q10 6.5 12 6.5Q14 6.5 16 3" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

export function WearCompressionIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 3H16L18 7.5L19.5 21H4.5L6 7.5L8 3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8 3Q10 6 12 6Q14 6 16 3" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M7 10H17M6.5 14H17.5M7 18H17" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function WearAeroIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 3H15L16.5 7L18 21H6L7.5 7L9 3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 3Q10.5 5.5 12 5.5Q13.5 5.5 15 3" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M12 5.5V21" stroke={color} strokeWidth="1" strokeDasharray="2 1.5" opacity="0.45"/>
      <path d="M6.5 8L4.5 6.5M7 12L5 10.5M7.5 16L5.5 14.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.4"/>
      <path d="M17.5 8L19.5 6.5M17 12L19 10.5M16.5 16L18.5 14.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

export function WearChampionIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 4H17L19 9L20 21H4L5 9L7 4z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M7 4Q9 8 12 8Q15 8 17 4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 11l1.1 3.2H16.4L13.8 16l1 3L12 17.3 9.2 19l1-3L7.6 14.2H10.9L12 11z" fill={color} opacity="0.75"/>
    </svg>
  )
}

export function WearArmSleeveIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="3" width="8" height="18" rx="4" stroke={color} strokeWidth="1.8"/>
      <path d="M8.5 7.5H15.5M8.5 11.5H15.5M8.5 15.5H15.5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.5"/>
      <path d="M8 4H16M8 20H16" stroke={color} strokeWidth="2.2" strokeLinecap="round" opacity="0.65"/>
    </svg>
  )
}

export function WearWindbreakerIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 4H17L19 9L20 21H4L5 9L7 4z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M7 4Q8 1.5 12 1.5Q16 1.5 17 4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 6V21" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
      <path d="M6 16H10M14 16H18" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M4 12Q2.5 12.5 3 14.5M20 12Q21.5 12.5 21 14.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

// ── Accessory ────────────────────────────────────────────────────────────────

export function AccBandIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9.5" y="4" width="5" height="16" rx="2.5" stroke={color} strokeWidth="1.3"/>
      <rect x="7" y="13" width="10" height="5.5" rx="2.5" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15"/>
      <path d="M9.5 14.5H14.5M9.5 16.5H14.5" stroke={color} strokeWidth="0.9" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function AccGpsIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="7" y="7" width="10" height="10" rx="2.5" stroke={color} strokeWidth="1.8"/>
      <path d="M10 7V4H14V7M10 17V20H14V17" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10.5 12.5Q12 10.5 13.5 12.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9.5 13.5Q12 9 14.5 13.5" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.55"/>
      <circle cx="12" cy="14" r="1.1" fill={color}/>
    </svg>
  )
}

export function AccNutritionIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M10 3H14Q15 3 15 5V16Q15 20 12 21Q9 20 9 16V5Q9 3 10 3z" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M10 3H14" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <path d="M13.5 3V5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M13 9L11 13H13L11 17.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function AccGlassesIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="6.5" cy="12" rx="4" ry="3" stroke={color} strokeWidth="1.8"/>
      <ellipse cx="17.5" cy="12" rx="4" ry="3" stroke={color} strokeWidth="1.8"/>
      <ellipse cx="6.5" cy="12" rx="4" ry="3" fill={color} fillOpacity="0.12"/>
      <ellipse cx="17.5" cy="12" rx="4" ry="3" fill={color} fillOpacity="0.12"/>
      <path d="M10.5 12H13.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M2.5 11.5L1.5 11" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M21.5 11.5L22.5 11" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

export function AccEarpieceIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="14.5" cy="9" rx="3.5" ry="3" stroke={color} strokeWidth="1.8"/>
      <circle cx="14.5" cy="9" r="1.4" fill={color} opacity="0.65"/>
      <path d="M11 9Q8 9 7 12Q7 16 9 17Q11 18 12 16" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M18.5 6.5Q20.5 9 18.5 11.5" stroke={color} strokeWidth="1.3" strokeLinecap="round" opacity="0.55"/>
      <path d="M20.5 5Q23 9 20.5 13" stroke={color} strokeWidth="1" strokeLinecap="round" opacity="0.35"/>
    </svg>
  )
}

export function AccResistanceBandIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="13.5" rx="8" ry="5" stroke={color} strokeWidth="2.5"/>
      <ellipse cx="12" cy="13.5" rx="5" ry="3" stroke={color} strokeWidth="0.9" opacity="0.3"/>
      <path d="M3.5 13.5H2M20.5 13.5H22" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M2 11.5L1 13.5L2 15.5M22 11.5L23 13.5L22 15.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function AccCompressionSocksIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 3H15V15.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M9 3V15.5" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M9 15.5Q7 15.5 7 17.5Q7 20.5 10 21H17V18Q17 15.5 15 15.5" stroke={color} strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M9 6.5H15M9 10H15M9 13H15" stroke={color} strokeWidth="1" strokeDasharray="2.5 1.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M10 3H14" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

export function AccFoamRollerIcon({ size = 24, color = 'currentColor' }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="9" width="20" height="7" rx="3.5" stroke={color} strokeWidth="1.8"/>
      <path d="M7 9V16M12 9V16M17 9V16" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity="0.45"/>
      <path d="M9 6.5Q12 4 15 6.5" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M14.5 5L15.5 7L13 6.5" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// ── Icon map ─────────────────────────────────────────────────────────────────

export const GEAR_ICON_MAP: Record<string, (props: Props) => ReactElement> = {
  // Shoes
  shoe_entry:    ShoeEntryIcon,
  shoe_race:     ShoeRaceIcon,
  shoe_mountain: ShoeMountainIcon,
  shoe_pro:      ShoeProIcon,
  shoe_legend:   ShoeLegendIcon,
  shoe_flat:     ShoeFlatIcon,
  shoe_trail:    ShoeTrailIcon,
  // Wear
  wear_basic:        WearBasicIcon,
  wear_compression:  WearCompressionIcon,
  wear_aero:         WearAeroIcon,
  wear_champion:     WearChampionIcon,
  wear_arm_sleeve:   WearArmSleeveIcon,
  wear_windbreaker:  WearWindbreakerIcon,
  // Accessory
  acc_band:             AccBandIcon,
  acc_gps:              AccGpsIcon,
  acc_nutrition:        AccNutritionIcon,
  acc_glasses:          AccGlassesIcon,
  acc_earpiece:         AccEarpieceIcon,
  acc_resistance_band:  AccResistanceBandIcon,
  acc_compression_socks: AccCompressionSocksIcon,
  acc_foam_roller:      AccFoamRollerIcon,
}
