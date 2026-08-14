import { strHash } from '../../utils/hash'
import { useGameStore } from '../../store/gameStore'
import { logoPresetSrc, teamLogoIdOf } from '../../data/logoPresets'
import { INITIAL_TEAMS } from '../../data/teams'
import { LOWER_DIVISION_TEAMS } from '../../data/teamsLower'

type IconProps = { size?: number; className?: string; color?: string }

export function IconDashboard({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

export function IconTeam({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 19c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M13.5 19c0-2.761 1.567-5 3.5-5s3.5 2.239 3.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconRace({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 7v5l-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12 12l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 10l-3 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M15 10l3 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9 15l-1 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M15 15l1 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconDraft({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconTransfer({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 16l-4-4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M21 12H7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconScout({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconSettings({ size = 20, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconChevronRight({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconTrophy({ size = 16, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M8 21h8M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 3H4a1 1 0 00-1 1v2a5 5 0 005 5h8a5 5 0 005-5V4a1 1 0 00-1-1h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 3h14v7a7 7 0 01-14 0V3z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

export function IconFlag({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="4" y1="22" x2="4" y2="15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconContract({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="17" x2="13" y2="17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconYen({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 2L7 10h10L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 14h12M6 18h12M12 10v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconStar({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
    </svg>
  )
}

export function IconArrowUp({ size = 12, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconArrowDown({ size = 12, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconMountain({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M3 20l7-12 4 6 2-3 5 9H3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
}

export function IconWind({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M17.7 7.7a2.5 2.5 0 111.8 4.3H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M9.6 4.6A2 2 0 1111 8H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12.6 19.4A2 2 0 1014 16H2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function IconGlobe({ size = 14, className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 3c-2.8 3-4 5.5-4 9s1.2 6 4 9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 3c2.8 3 4 5.5 4 9s-1.2 6-4 9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

type LogoFn = (p: string, s: string) => React.ReactElement

const LOGOS: Record<string, LogoFn> = {
  // 東京：王冠盾
  tokyo: (p, s) => <>
    <path d="M24 4 L40 12 V27 Q40 39 24 45 Q8 39 8 27 V12 Z" fill={p}/>
    <path d="M11 22 L11 13 L16 17 L24 11 L32 17 L37 13 L37 22 Z" fill={s} fillOpacity="0.4"/>
    <line x1="8" y1="22" x2="40" y2="22" stroke={s} strokeWidth="1.2" strokeOpacity="0.35"/>
    <path d="M15 33 Q24 39 33 33" stroke={s} strokeWidth="1.5" strokeOpacity="0.45" fill="none"/>
  </>,
  // 大阪：虎の縞模様
  osaka: (p, s) => <>
    <rect x="4" y="4" width="40" height="40" rx="8" fill={p}/>
    <path d="M4 16 L16 4 H24 L4 24 Z" fill={s} fillOpacity="0.26"/>
    <path d="M4 32 L32 4 H38 L4 38 Z" fill={s} fillOpacity="0.13"/>
    <path d="M24 44 L44 24 V31 L31 44 Z" fill={s} fillOpacity="0.26"/>
  </>,
  // 札幌：雪の結晶
  sapporo: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <line x1="24" y1="5" x2="24" y2="43" stroke={s} strokeWidth="2.5" strokeOpacity="0.6"/>
    <line x1="5" y1="24" x2="43" y2="24" stroke={s} strokeWidth="2.5" strokeOpacity="0.6"/>
    <line x1="9.4" y1="9.4" x2="38.6" y2="38.6" stroke={s} strokeWidth="2.5" strokeOpacity="0.6"/>
    <line x1="38.6" y1="9.4" x2="9.4" y2="38.6" stroke={s} strokeWidth="2.5" strokeOpacity="0.6"/>
    <line x1="20" y1="12" x2="28" y2="12" stroke={s} strokeWidth="1.5" strokeOpacity="0.45"/>
    <line x1="20" y1="36" x2="28" y2="36" stroke={s} strokeWidth="1.5" strokeOpacity="0.45"/>
    <line x1="12" y1="20" x2="12" y2="28" stroke={s} strokeWidth="1.5" strokeOpacity="0.45"/>
    <line x1="36" y1="20" x2="36" y2="28" stroke={s} strokeWidth="1.5" strokeOpacity="0.45"/>
    <circle cx="24" cy="24" r="3.5" fill={s} fillOpacity="0.7"/>
  </>,
  // 盛岡：五芒星
  morioka: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p} fillOpacity="0.22"/>
    <path d="M24 4 L27.5 14.5 H38.5 L30 21 L33.5 32 L24 26 L14.5 32 L18 21 L9.5 14.5 H20.5 Z" fill={p}/>
    <path d="M24 8.5 L27 16.5 H35.5 L29 21.5 L31.5 30 L24 25.5 L16.5 30 L19 21.5 L12.5 16.5 H21 Z" fill={s} fillOpacity="0.28"/>
  </>,
  // 青森：ねぶた炎
  aomori: (p, s) => <>
    <path d="M24 45 C9 37 8 25 14 17 C13 23 18 28 21 26 C17 18 20 9 24 3 C28 9 31 18 27 26 C30 28 35 23 34 17 C40 25 39 37 24 45 Z" fill={p}/>
    <path d="M24 40 C15 34 15 27 19 22 C19 26 22 28 24 27 C22 23 23 18 24 15 C25 18 26 23 24 27 C26 28 29 26 29 22 C33 27 32 34 24 40 Z" fill={s} fillOpacity="0.35"/>
  </>,
  // 仙台：三日月（伊達家）
  sendai: (p, s) => <>
    <path d="M32 6 A20 20 0 1 0 32 42 A13 13 0 1 1 32 6 Z" fill={p}/>
    <circle cx="37" cy="13" r="4" fill={s} fillOpacity="0.65"/>
  </>,
  // 横浜：錨
  yokohama: (p, s) => <>
    <circle cx="24" cy="16" r="11" fill={p}/>
    <line x1="24" y1="27" x2="24" y2="44" stroke={p} strokeWidth="5" strokeLinecap="round"/>
    <line x1="13" y1="39" x2="24" y2="44" stroke={p} strokeWidth="4" strokeLinecap="round"/>
    <line x1="35" y1="39" x2="24" y2="44" stroke={p} strokeWidth="4" strokeLinecap="round"/>
    <line x1="15" y1="14" x2="33" y2="14" stroke={s} strokeWidth="2" strokeOpacity="0.55"/>
    <circle cx="24" cy="16" r="5" fill={s} fillOpacity="0.3"/>
  </>,
  // 千葉：波紋の丸
  chiba: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M3 24 Q10 14 17 20 Q24 26 31 18 Q38 10 45 17 L45 45 H3 Z" fill={s} fillOpacity="0.25"/>
    <path d="M3 24 Q10 14 17 20 Q24 26 31 18 Q38 10 45 17" stroke={s} strokeWidth="2" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
  </>,
  // 埼玉：旭日
  saitama: (p, s) => <>
    <circle cx="24" cy="30" r="12" fill={p}/>
    <line x1="24" y1="17" x2="24" y2="5" stroke={p} strokeWidth="4" strokeLinecap="round"/>
    <line x1="14.5" y1="20" x2="6" y2="11" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="33.5" y1="20" x2="42" y2="11" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="9" y1="28" x2="3" y2="23" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="39" y1="28" x2="45" y2="23" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <circle cx="24" cy="30" r="7" fill={s} fillOpacity="0.3"/>
  </>,
  // 長野：山岳
  nagano: (p, s) => <>
    <polygon points="24,4 44,43 4,43" fill={p}/>
    <polygon points="24,4 29,18 19,18" fill="#FFFFFF" fillOpacity="0.6"/>
    <line x1="4" y1="43" x2="44" y2="43" stroke={s} strokeWidth="2" strokeOpacity="0.4"/>
    <polygon points="24,4 27,17 21,17" fill={s} fillOpacity="0.15"/>
  </>,
  // 新潟：稲の葉
  niigata: (p, s) => <>
    <path d="M24 44 C8 38 6 26 8 14 C12 6 20 4 24 4 C28 4 36 6 40 14 C42 26 40 38 24 44 Z" fill={p}/>
    <line x1="24" y1="44" x2="24" y2="7" stroke={s} strokeWidth="1.5" strokeOpacity="0.5"/>
    <path d="M24 20 Q31 16 37 14" stroke={s} strokeWidth="1.2" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
    <path d="M24 28 Q31 24 38 22" stroke={s} strokeWidth="1.2" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
    <path d="M24 20 Q17 16 11 14" stroke={s} strokeWidth="1.2" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
    <path d="M24 28 Q17 24 10 22" stroke={s} strokeWidth="1.2" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
  </>,
  // 静岡：富士山
  shizuoka: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M5 36 L14 18 L19 24 L24 14 L29 24 L34 18 L43 36 Z" fill={s} fillOpacity="0.35"/>
    <path d="M19 24 L24 14 L29 24 Z" fill="#FFFFFF" fillOpacity="0.6"/>
    <line x1="5" y1="36" x2="43" y2="36" stroke={s} strokeWidth="1.5" strokeOpacity="0.3"/>
  </>,
  // 名古屋：彗星菱形
  nagoya: (p, s) => <>
    <path d="M24 4 L44 24 L24 44 L4 24 Z" fill={p}/>
    <path d="M24 11 L37 24 L24 37 L11 24 Z" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.4"/>
    <line x1="6" y1="6" x2="20" y2="20" stroke={s} strokeWidth="4" strokeOpacity="0.35" strokeLinecap="round"/>
    <line x1="3" y1="11" x2="14" y2="17" stroke={s} strokeWidth="2.5" strokeOpacity="0.2" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4.5" fill={s} fillOpacity="0.4"/>
  </>,
  // 京都：扇
  kyoto: (p, s) => <>
    <path d="M24 40 L4 14 Q14 2 24 4 Q34 2 44 14 Z" fill={p}/>
    <line x1="24" y1="40" x2="4" y2="14" stroke={s} strokeWidth="0.8" strokeOpacity="0.3"/>
    <line x1="24" y1="40" x2="14" y2="6" stroke={s} strokeWidth="0.8" strokeOpacity="0.3"/>
    <line x1="24" y1="40" x2="24" y2="4" stroke={s} strokeWidth="0.8" strokeOpacity="0.3"/>
    <line x1="24" y1="40" x2="34" y2="6" stroke={s} strokeWidth="0.8" strokeOpacity="0.3"/>
    <line x1="24" y1="40" x2="44" y2="14" stroke={s} strokeWidth="0.8" strokeOpacity="0.3"/>
    <path d="M6 16 Q15 4 24 5 Q33 4 42 16" stroke={s} strokeWidth="2" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
    <path d="M10 24 Q17 14 24 15 Q31 14 38 24" stroke={s} strokeWidth="1.5" strokeOpacity="0.3" fill="none" strokeLinecap="round"/>
    <circle cx="24" cy="40" r="2.5" fill={s} fillOpacity="0.6"/>
  </>,
  // 神戸：五角形（港）
  kobe: (p, s) => <>
    <polygon points="24,3 44,17.5 36.3,41 11.7,41 4,17.5" fill={p}/>
    <polygon points="24,9 38.4,20 33.2,37.4 14.8,37.4 9.6,20" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.4"/>
    <path d="M24 41 L24 28 M18 34 L30 34" stroke={s} strokeWidth="2" strokeOpacity="0.5"/>
    <circle cx="24" cy="28" r="4" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.5"/>
  </>,
  // 広島：鳳凰の翼
  hiroshima: (p, s) => <>
    <path d="M24 27 C18 21 8 17 4 9 Q12 7 18 15 L24 21 L30 15 Q36 7 44 9 C40 17 30 21 24 27 Z" fill={p}/>
    <path d="M24 27 C22 31 20 36 22 41 L24 45 L26 41 C28 36 26 31 24 27 Z" fill={p}/>
    <path d="M24 27 C20 23 12 20 8 14 Q14 13 19 19 L24 23 L29 19 Q34 13 40 14 C36 20 28 23 24 27 Z" fill={s} fillOpacity="0.3"/>
    <circle cx="24" cy="21" r="3" fill={s} fillOpacity="0.5"/>
  </>,
  // 岡山：桃
  okayama: (p, s) => <>
    <path d="M24 43 C8 40 4 28 8 17 C11 9 17 5 24 5 C31 5 37 9 40 17 C44 28 40 40 24 43 Z" fill={p}/>
    <path d="M18 5 C20 1 28 1 30 5" stroke={s} strokeWidth="3" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
    <path d="M24 43 L24 18" stroke={s} strokeWidth="1" strokeOpacity="0.2" fill="none"/>
    <path d="M24 25 Q28 22 33 20" stroke={s} strokeWidth="1.2" strokeOpacity="0.35" fill="none" strokeLinecap="round"/>
  </>,
  // 福岡：南十字星
  fukuoka: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="11" r="3.5" fill={s} fillOpacity="0.85"/>
    <circle cx="24" cy="37" r="3.5" fill={s} fillOpacity="0.85"/>
    <circle cx="13" cy="22" r="2.8" fill={s} fillOpacity="0.75"/>
    <circle cx="35" cy="22" r="2.8" fill={s} fillOpacity="0.75"/>
    <circle cx="32" cy="30" r="2" fill={s} fillOpacity="0.65"/>
  </>,
  // 鹿児島：火山
  kagoshima: (p, s) => <>
    <polygon points="24,6 44,43 4,43" fill={p}/>
    <circle cx="18" cy="10" r="2.5" fill={s} fillOpacity="0.65"/>
    <circle cx="24" cy="7" r="3" fill={s} fillOpacity="0.75"/>
    <circle cx="30" cy="10" r="2" fill={s} fillOpacity="0.6"/>
    <path d="M20 16 Q22 11 24 9 Q26 11 28 16" stroke={s} strokeWidth="1.5" strokeOpacity="0.4" fill="none"/>
    <line x1="4" y1="43" x2="44" y2="43" stroke={s} strokeWidth="2" strokeOpacity="0.35"/>
  </>,
  // 沖縄：太陽（ティーダ）
  okinawa: (p, s) => <>
    <line x1="37" y1="24" x2="45" y2="24" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="32.8" y1="32.8" x2="38.5" y2="38.5" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="24" y1="37" x2="24" y2="45" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="15.2" y1="32.8" x2="9.5" y2="38.5" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="11" y1="24" x2="3" y2="24" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="15.2" y1="15.2" x2="9.5" y2="9.5" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="24" y1="11" x2="24" y2="3" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <line x1="32.8" y1="15.2" x2="38.5" y2="9.5" stroke={p} strokeWidth="4.5" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="10" fill={p}/>
    <circle cx="24" cy="24" r="6" fill={s} fillOpacity="0.35"/>
  </>,

  // === K-League ===
  seoul_hangang: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M3 22 Q10 13 18 20 Q24 26 30 17 Q37 9 45 18" stroke={s} strokeWidth="2.5" strokeOpacity="0.75" fill="none" strokeLinecap="round"/>
    <path d="M3 30 Q10 21 18 28 Q24 34 30 25 Q37 17 45 26" stroke={s} strokeWidth="1.8" strokeOpacity="0.5" fill="none" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4.5" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.4"/>
  </>,
  busan_marine: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <line x1="24" y1="8" x2="24" y2="38" stroke={s} strokeWidth="3.5" strokeOpacity="0.7"/>
    <line x1="13" y1="15" x2="35" y2="15" stroke={s} strokeWidth="3.5" strokeOpacity="0.7"/>
    <circle cx="24" cy="15" r="5" fill="none" stroke={s} strokeWidth="2" strokeOpacity="0.6"/>
    <path d="M10 36 Q17 30 24 34 Q31 38 38 36" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" fill="none" strokeLinecap="round"/>
    <circle cx="11" cy="36" r="3.5" fill={s} fillOpacity="0.6"/>
    <circle cx="37" cy="36" r="3.5" fill={s} fillOpacity="0.6"/>
  </>,
  incheon_runners: (p, s) => <>
    <path d="M24 4 L44 24 L24 44 L4 24 Z" fill={p}/>
    <path d="M24 12 L36 24 L24 36 L12 24 Z" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.5"/>
    <path d="M4 20 L12 24 L4 28" stroke={s} strokeWidth="2.5" strokeOpacity="0.65" strokeLinecap="round" fill="none"/>
    <path d="M44 20 L36 24 L44 28" stroke={s} strokeWidth="2.5" strokeOpacity="0.65" strokeLinecap="round" fill="none"/>
    <circle cx="24" cy="24" r="4" fill={s} fillOpacity="0.6"/>
  </>,
  daegu_athletes: (p, s) => <>
    <polygon points="24,4 41.6,14 41.6,34 24,44 6.4,34 6.4,14" fill={p}/>
    <polygon points="24,10 36.4,17 36.4,31 24,38 11.6,31 11.6,17" fill="none" stroke={s} strokeWidth="2" strokeOpacity="0.45"/>
    <polygon points="24,17 30,21 30,28 24,32 18,28 18,21" fill={s} fillOpacity="0.38"/>
  </>,
  gwangju_pace: (p, s) => <>
    <path d="M24 45 C8 36 7 23 14 15 C13 22 18 27 21 25 C17 16 20 8 24 3 C28 8 31 16 27 25 C30 27 35 22 34 15 C41 23 40 36 24 45 Z" fill={p}/>
    <path d="M24 39 C15 33 14 25 19 20 C19 24 22 26 24 25 C22 21 23 17 24 14 C25 17 26 21 24 25 C26 26 29 24 29 20 C33 25 32 33 24 39 Z" fill={s} fillOpacity="0.42"/>
  </>,
  jeju_wind: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 24 Q31 15 24 7 Q17 14 22 22" stroke={s} strokeWidth="3" strokeOpacity="0.7" fill="none" strokeLinecap="round"/>
    <path d="M24 24 Q33 29 41 22 Q36 14 28 20" stroke={s} strokeWidth="2.5" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
    <path d="M24 24 Q17 33 24 41 Q31 34 26 26" stroke={s} strokeWidth="2" strokeOpacity="0.42" fill="none" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4" fill={s} fillOpacity="0.72"/>
  </>,

  // === 中国長距離選手権 ===
  beijing_changpao: (p, s) => <>
    <rect x="4" y="20" width="40" height="24" rx="2" fill={p}/>
    <rect x="8" y="28" width="7" height="16" fill={s} fillOpacity="0.45"/>
    <rect x="21" y="26" width="6" height="18" fill={s} fillOpacity="0.45"/>
    <rect x="33" y="28" width="7" height="16" fill={s} fillOpacity="0.45"/>
    <path d="M2 22 L24 7 L46 22" fill={p} stroke={s} strokeWidth="1.5" strokeOpacity="0.5" strokeLinejoin="round"/>
    <path d="M5 12 Q24 5 43 12" stroke={s} strokeWidth="1" strokeOpacity="0.3" fill="none" strokeLinecap="round"/>
  </>,
  shanghai_speed: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M29 5 L16 23 L25 23 L19 43 L31 21 L22 21 Z" fill={s} fillOpacity="0.82"/>
  </>,
  chengdu_mountain: (p, s) => <>
    <circle cx="24" cy="27" r="17" fill={p}/>
    <ellipse cx="13" cy="11" rx="9" ry="8" fill={p}/>
    <ellipse cx="35" cy="11" rx="9" ry="8" fill={p}/>
    <ellipse cx="14" cy="12" rx="6" ry="5" fill={s} fillOpacity="0.52"/>
    <ellipse cx="34" cy="12" rx="6" ry="5" fill={s} fillOpacity="0.52"/>
    <circle cx="18" cy="24" r="3.2" fill={s} fillOpacity="0.65"/>
    <circle cx="30" cy="24" r="3.2" fill={s} fillOpacity="0.65"/>
    <path d="M20 31 Q24 29 28 31" stroke={s} strokeWidth="1.8" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
  </>,
  guangzhou_dawn: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 5 L26.5 14.5 H37 L28.5 20.5 L31.5 30 L24 25 L16.5 30 L19.5 20.5 L11 14.5 H21.5 Z" fill={s} fillOpacity="0.55"/>
    <circle cx="24" cy="24" r="5" fill={p}/>
    <circle cx="24" cy="24" r="3" fill={s} fillOpacity="0.5"/>
  </>,
  wuhan_distance: (p, s) => <>
    <line x1="24" y1="44" x2="24" y2="8" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <rect x="16" y="8" width="16" height="5" rx="2" fill={p}/>
    <rect x="13" y="16" width="22" height="5" rx="2" fill={p}/>
    <rect x="10" y="24" width="28" height="5" rx="2" fill={p}/>
    <rect x="7" y="32" width="34" height="6" rx="2" fill={p}/>
    <path d="M14 8 Q24 4 34 8" stroke={s} strokeWidth="1.5" strokeOpacity="0.4" fill="none" strokeLinecap="round"/>
    <path d="M11 16 Q24 12 37 16" stroke={s} strokeWidth="1" strokeOpacity="0.3" fill="none" strokeLinecap="round"/>
  </>,
  xi_an_ancient: (p, s) => <>
    <rect x="4" y="30" width="40" height="14" rx="2" fill={p}/>
    <rect x="7" y="22" width="6" height="10" rx="1" fill={p}/>
    <rect x="17" y="22" width="6" height="10" rx="1" fill={p}/>
    <rect x="25" y="22" width="6" height="10" rx="1" fill={p}/>
    <rect x="35" y="22" width="6" height="10" rx="1" fill={p}/>
    <path d="M17 22 L24 12 L31 22 Z" fill={p}/>
    <path d="M19 22 L24 14 L29 22 Z" fill={s} fillOpacity="0.32"/>
    <line x1="4" y1="35" x2="44" y2="35" stroke={s} strokeWidth="1" strokeOpacity="0.28"/>
  </>,

  // === アフリカ駅伝エリートリーグ ===
  addis_elite: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 5 L26.5 17 H38.5 L29 24 L32.5 36 L24 29.5 L15.5 36 L19 24 L9.5 17 H21.5 Z" fill={s} fillOpacity="0.72"/>
    <circle cx="24" cy="24" r="4" fill={p}/>
  </>,
  great_rift: (p, s) => <>
    <line x1="24" y1="45" x2="24" y2="22" stroke={p} strokeWidth="5" strokeLinecap="round"/>
    <path d="M4 19 Q14 11 24 13 Q34 11 44 19 Q34 26 24 26 Q14 26 4 19 Z" fill={p}/>
    <path d="M8 19 Q16 14 24 15 Q32 14 40 19 Q32 23 24 23 Q16 23 8 19 Z" fill={s} fillOpacity="0.35"/>
    <path d="M24 23 Q18 21 13 26" stroke={p} strokeWidth="2" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
    <path d="M24 23 Q30 21 35 26" stroke={p} strokeWidth="2" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
  </>,
  nairobi_harriers: (p, s) => <>
    <path d="M24 4 L38 10 L40 30 L24 44 L8 30 L10 10 Z" fill={p}/>
    <path d="M24 9 L35 14 L37 29 L24 41 L11 29 L13 14 Z" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.4"/>
    <line x1="24" y1="9" x2="24" y2="41" stroke={s} strokeWidth="2" strokeOpacity="0.5"/>
    <line x1="12" y1="18" x2="36" y2="18" stroke={s} strokeWidth="1.5" strokeOpacity="0.35"/>
    <line x1="11" y1="28" x2="37" y2="28" stroke={s} strokeWidth="1.5" strokeOpacity="0.35"/>
  </>,
  kampala_harriers: (p, s) => <>
    <circle cx="24" cy="32" r="13" fill={p}/>
    <path d="M24 31 Q20 25 18 17 Q22 15 24 17 Q26 15 30 17 Q28 25 24 31 Z" fill={p}/>
    <circle cx="24" cy="13" r="5.5" fill={p}/>
    <path d="M20 9 Q24 4 28 9" fill={s} fillOpacity="0.68"/>
    <path d="M21 10 Q24 6 27 10" fill={p}/>
    <circle cx="18" cy="32" r="3" fill={s} fillOpacity="0.62"/>
    <circle cx="30" cy="32" r="3" fill={s} fillOpacity="0.62"/>
    <path d="M18 34 Q24 38 30 34" stroke={s} strokeWidth="1.5" strokeOpacity="0.4" fill="none" strokeLinecap="round"/>
  </>,
  kilimanjaro: (p, s) => <>
    <polygon points="24,4 44,44 4,44" fill={p}/>
    <polygon points="24,4 30,21 18,21" fill="#FFFFFF" fillOpacity="0.75"/>
    <path d="M10 44 Q18 38 24 40 Q30 42 38 44" stroke={s} strokeWidth="1.5" strokeOpacity="0.3" fill="none"/>
    <line x1="4" y1="44" x2="44" y2="44" stroke={s} strokeWidth="2" strokeOpacity="0.38"/>
  </>,
  asmara_highland: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <rect x="21" y="4" width="6" height="40" rx="3" fill={s} fillOpacity="0.78"/>
    <rect x="4" y="21" width="40" height="6" rx="3" fill={s} fillOpacity="0.78"/>
    <rect x="11" y="8" width="5" height="5" rx="2" fill={s} fillOpacity="0.42"/>
    <rect x="32" y="8" width="5" height="5" rx="2" fill={s} fillOpacity="0.42"/>
    <rect x="11" y="35" width="5" height="5" rx="2" fill={s} fillOpacity="0.42"/>
    <rect x="32" y="35" width="5" height="5" rx="2" fill={s} fillOpacity="0.42"/>
  </>,

  // === ユーロ駅伝シリーズ ===
  thames_harriers: (p, s) => <>
    <rect x="4" y="28" width="40" height="10" rx="2" fill={p}/>
    <rect x="7" y="13" width="10" height="27" rx="2" fill={p}/>
    <rect x="31" y="13" width="10" height="27" rx="2" fill={p}/>
    <path d="M17 28 Q24 20 31 28" stroke={s} strokeWidth="2.2" strokeOpacity="0.62" fill="none"/>
    <line x1="12" y1="7" x2="12" y2="13" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="36" y1="7" x2="36" y2="13" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="12" y1="7" x2="36" y2="7" stroke={s} strokeWidth="1" strokeOpacity="0.3"/>
  </>,
  berlin_lauflab: (p, s) => <>
    <rect x="4" y="33" width="40" height="11" rx="2" fill={p}/>
    <rect x="8" y="17" width="5" height="18" fill={p}/>
    <rect x="15" y="17" width="5" height="18" fill={p}/>
    <rect x="22" y="13" width="4" height="22" fill={p}/>
    <rect x="29" y="17" width="5" height="18" fill={p}/>
    <rect x="36" y="17" width="5" height="18" fill={p}/>
    <line x1="5" y1="17" x2="43" y2="17" stroke={s} strokeWidth="2.5" strokeOpacity="0.52" strokeLinecap="round"/>
  </>,
  paris_athletique: (p, s) => <>
    <path d="M17 44 L20 26 L24 19 L28 26 L31 44 Z" fill={p}/>
    <path d="M20 26 L13 7 L24 11 L35 7 L28 26 Z" fill={p}/>
    <line x1="16" y1="26" x2="32" y2="26" stroke={s} strokeWidth="2" strokeOpacity="0.52"/>
    <line x1="13" y1="34" x2="35" y2="34" stroke={s} strokeWidth="2" strokeOpacity="0.52"/>
    <path d="M19 7 Q24 3 29 7" stroke={s} strokeWidth="1.5" strokeOpacity="0.42" fill="none" strokeLinecap="round"/>
    <line x1="10" y1="44" x2="38" y2="44" stroke={s} strokeWidth="3" strokeOpacity="0.38" strokeLinecap="round"/>
  </>,
  amstel_runners: (p, s) => <>
    <circle cx="24" cy="24" r="5" fill={p}/>
    <path d="M24 19 L22 7 L28 9 L26 19 Z" fill={p}/>
    <path d="M29 24 L41 22 L39 28 L29 27 Z" fill={p}/>
    <path d="M24 29 L26 41 L20 39 L22 29 Z" fill={p}/>
    <path d="M19 24 L7 26 L9 20 L19 21 Z" fill={p}/>
    <circle cx="24" cy="24" r="3" fill={s} fillOpacity="0.55"/>
    <line x1="24" y1="29" x2="24" y2="44" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="17" y1="44" x2="31" y2="44" stroke={p} strokeWidth="3" strokeLinecap="round"/>
  </>,
  milan_marathon: (p, s) => <>
    <path d="M14 44 L14 20 Q14 4 24 4 Q34 4 34 20 L34 44 Z" fill={p}/>
    <circle cx="24" cy="22" r="8.5" fill="none" stroke={s} strokeWidth="2" strokeOpacity="0.5"/>
    <circle cx="24" cy="22" r="3.5" fill={s} fillOpacity="0.45"/>
    <line x1="24" y1="13.5" x2="24" y2="30.5" stroke={s} strokeWidth="1" strokeOpacity="0.3"/>
    <line x1="15.5" y1="22" x2="32.5" y2="22" stroke={s} strokeWidth="1" strokeOpacity="0.3"/>
    <line x1="18.5" y1="16" x2="29.5" y2="28" stroke={s} strokeWidth="1" strokeOpacity="0.28"/>
    <line x1="29.5" y1="16" x2="18.5" y2="28" stroke={s} strokeWidth="1" strokeOpacity="0.28"/>
    <line x1="10" y1="44" x2="38" y2="44" stroke={s} strokeWidth="2" strokeOpacity="0.35" strokeLinecap="round"/>
  </>,
  stockholm_nordic: (p, s) => <>
    <rect x="3" y="3" width="42" height="42" rx="7" fill={p}/>
    <rect x="3" y="18" width="42" height="12" fill={s} fillOpacity="0.78"/>
    <rect x="14" y="3" width="10" height="42" fill={s} fillOpacity="0.78"/>
  </>,

  // === USAランニングリーグ ===
  new_york_ac: (p, s) => <>
    <path d="M20 44 L20 22 L24 17 L28 22 L28 44 Z" fill={p}/>
    <path d="M22 22 Q20 14 22 10 Q24 7 26 10 Q28 14 26 22 Z" fill={p}/>
    <path d="M22 12 Q20 8 22 5 Q24 3 26 5 Q28 8 26 12 Z" fill={s} fillOpacity="0.82"/>
    <rect x="17" y="40" width="14" height="4" rx="2" fill={p}/>
    <line x1="12" y1="27" x2="20" y2="27" stroke={s} strokeWidth="1.5" strokeOpacity="0.42"/>
    <line x1="28" y1="27" x2="36" y2="27" stroke={s} strokeWidth="1.5" strokeOpacity="0.42"/>
  </>,
  la_track: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 5 L27.5 15.5 H38.5 L30 22 L33.5 33 L24 27 L14.5 33 L18 22 L9.5 15.5 H20.5 Z" fill={s} fillOpacity="0.82"/>
  </>,
  boston_distance: (p, s) => <>
    <path d="M24 4 L40 10 L40 28 Q40 40 24 44 Q8 40 8 28 L8 10 Z" fill={p}/>
    <path d="M24 12 L26.2 18.8 H33 L27.8 23 L30 29.5 L24 25.8 L18 29.5 L20.2 23 L15 18.8 H21.8 Z" fill={s} fillOpacity="0.68"/>
  </>,
  portland_trail: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 13 Q27 18 24 22 Q21 18 24 13 Z" fill={s} fillOpacity="0.72"/>
    <path d="M13 24 Q18 21 22 24 Q18 27 13 24 Z" fill={s} fillOpacity="0.62"/>
    <path d="M35 24 Q30 27 26 24 Q30 21 35 24 Z" fill={s} fillOpacity="0.62"/>
    <path d="M24 35 Q21 30 24 26 Q27 30 24 35 Z" fill={s} fillOpacity="0.52"/>
    <path d="M15 15 Q19 17 20 22 Q14 20 15 15 Z" fill={s} fillOpacity="0.52"/>
    <path d="M33 15 Q29 17 28 22 Q34 20 33 15 Z" fill={s} fillOpacity="0.52"/>
    <path d="M15 33 Q19 31 20 26 Q14 28 15 33 Z" fill={s} fillOpacity="0.42"/>
    <path d="M33 33 Q29 31 28 26 Q34 28 33 33 Z" fill={s} fillOpacity="0.42"/>
    <circle cx="24" cy="24" r="5" fill={p}/>
    <circle cx="24" cy="24" r="3" fill={s} fillOpacity="0.45"/>
  </>,
  chicago_wind: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 4 L26.5 21.5 L44 24 L26.5 26.5 L24 44 L21.5 26.5 L4 24 L21.5 21.5 Z" fill={s} fillOpacity="0.82"/>
  </>,
  denver_altitude: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M4 40 L13 21 L22 33 L24 18 L26 33 L35 21 L44 40 Z" fill={s} fillOpacity="0.7"/>
    <path d="M11 21 L13 26 L9 26 Z" fill="#FFFFFF" fillOpacity="0.65"/>
    <path d="M35 21 L37 26 L33 26 Z" fill="#FFFFFF" fillOpacity="0.55"/>
  </>,

  // === オセアニア駅伝カップ ===
  sydney_striders: (p, s) => <>
    <line x1="4" y1="40" x2="44" y2="40" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <path d="M7 40 Q11 22 19 20 L19 40 Z" fill={p}/>
    <path d="M15 40 Q21 17 28 15 L28 40 Z" fill={p}/>
    <path d="M24 40 Q33 22 38 24 L38 40 Z" fill={p}/>
    <path d="M9 40 Q12 27 18 24" stroke={s} strokeWidth="1.5" strokeOpacity="0.35" fill="none"/>
    <path d="M17 40 Q22 23 27 19" stroke={s} strokeWidth="1.5" strokeOpacity="0.35" fill="none"/>
  </>,
  melbourne_harriers: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M23 7 L24.5 12 H29.5 L25.8 15 L27.2 20 L23 17 L18.8 20 L20.2 15 L16.5 12 H21.5 Z" fill={s} fillOpacity="0.88"/>
    <path d="M9 17 L9.9 19.7 H12.8 L10.5 21.4 L11.4 24.2 L9 22.5 L6.6 24.2 L7.5 21.4 L5.2 19.7 H8.1 Z" fill={s} fillOpacity="0.75"/>
    <path d="M37 17 L37.9 19.7 H40.8 L38.5 21.4 L39.4 24.2 L37 22.5 L34.6 24.2 L35.5 21.4 L33.2 19.7 H36.1 Z" fill={s} fillOpacity="0.75"/>
    <path d="M17 30 L17.9 32.7 H20.8 L18.5 34.4 L19.4 37.2 L17 35.5 L14.6 37.2 L15.5 34.4 L13.2 32.7 H16.1 Z" fill={s} fillOpacity="0.75"/>
    <circle cx="30" cy="32" r="2.8" fill={s} fillOpacity="0.65"/>
  </>,
  brisbane_road: (p, s) => <>
    <circle cx="24" cy="27" r="11" fill={p}/>
    <line x1="24" y1="4" x2="24" y2="14" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="39" y1="9" x2="32" y2="16" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="44" y1="24" x2="36" y2="24" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="39" y1="39" x2="32" y2="33" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="9" y1="9" x2="16" y2="16" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="4" y1="24" x2="12" y2="24" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="9" y1="39" x2="16" y2="33" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <circle cx="24" cy="27" r="6.5" fill={s} fillOpacity="0.42"/>
  </>,
  auckland_ac: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 43 C12 43 4 34 4 22 C4 13 10 6 19 6 C25 6 30 10 30 17 C30 21 28 24 24 24 C21 24 19 22 19 19 C19 17 20.5 16 22 16" stroke={s} strokeWidth="3" strokeOpacity="0.72" fill="none" strokeLinecap="round"/>
    <circle cx="22" cy="16" r="2.8" fill={s} fillOpacity="0.68"/>
  </>,
  wellington_wind: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 24 C24 13 33 11 35 18 C37 23 33 27 27 25" stroke={s} strokeWidth="2.5" strokeOpacity="0.72" fill="none" strokeLinecap="round"/>
    <path d="M24 24 C35 24 37 33 31 35 C26 37 22 32 25 27" stroke={s} strokeWidth="2.2" strokeOpacity="0.58" fill="none" strokeLinecap="round"/>
    <path d="M24 24 C13 24 11 15 17 13 C22 11 26 15 24 21" stroke={s} strokeWidth="1.8" strokeOpacity="0.45" fill="none" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="3.5" fill={s} fillOpacity="0.68"/>
  </>,
  perth_coast: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <ellipse cx="24" cy="31" rx="11" ry="7" fill={s} fillOpacity="0.67"/>
    <path d="M22 29 Q19 21 21 14 Q23 10 25 14 Q27 21 25 29 Z" fill={s} fillOpacity="0.67"/>
    <circle cx="24" cy="12" r="5" fill={s} fillOpacity="0.67"/>
    <path d="M24 10 L30 9 L27 12 Z" fill={p}/>
    <circle cx="25.5" cy="11" r="1.3" fill={p}/>
  </>,

  // === 南米長距離リーグ ===
  sao_paulo_ac: (p, s) => <>
    <polygon points="24,4 44,24 24,44 4,24" fill={p}/>
    <circle cx="24" cy="24" r="11.5" fill={s} fillOpacity="0.65"/>
    <circle cx="24" cy="16.5" r="2.2" fill={p}/>
    <circle cx="17.5" cy="22" r="1.9" fill={p}/>
    <circle cx="30.5" cy="22" r="1.9" fill={p}/>
    <circle cx="20" cy="28" r="1.9" fill={p}/>
    <circle cx="27.5" cy="26.5" r="1.5" fill={p}/>
  </>,
  bogota_altitude: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 20 C20 17 7 19 3 23 C7 25 16 24 20 26 C22 27 22 31 24 34 C26 31 26 27 28 26 C32 24 41 25 45 23 C41 19 28 17 24 20 Z" fill={s} fillOpacity="0.72"/>
    <circle cx="24" cy="14" r="5" fill={s} fillOpacity="0.67"/>
    <path d="M21 11 Q24 8 27 11" stroke={p} strokeWidth="1.5" fill="none" strokeOpacity="0.5"/>
  </>,
  quito_andes: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="24" r="8" fill={s} fillOpacity="0.62"/>
    <line x1="24" y1="4" x2="24" y2="14" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="24" y1="34" x2="24" y2="44" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="4" y1="24" x2="14" y2="24" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="34" y1="24" x2="44" y2="24" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="9.5" y1="9.5" x2="16.8" y2="16.8" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="38.5" y1="9.5" x2="31.2" y2="16.8" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="9.5" y1="38.5" x2="16.8" y2="31.2" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="38.5" y1="38.5" x2="31.2" y2="31.2" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <circle cx="24" cy="24" r="4.5" fill={s} fillOpacity="0.88"/>
  </>,
  lima_maratona: (p, s) => <>
    <circle cx="24" cy="24" r="14" fill={p}/>
    <line x1="24" y1="4" x2="24" y2="8" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="24" y1="40" x2="24" y2="44" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="4" y1="24" x2="8" y2="24" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="40" y1="24" x2="44" y2="24" stroke={p} strokeWidth="3.5" strokeLinecap="round"/>
    <line x1="9.5" y1="9.5" x2="12.4" y2="12.4" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="38.5" y1="9.5" x2="35.6" y2="12.4" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="9.5" y1="38.5" x2="12.4" y2="35.6" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <line x1="38.5" y1="38.5" x2="35.6" y2="35.6" stroke={p} strokeWidth="3" strokeLinecap="round"/>
    <circle cx="20" cy="22" r="2.2" fill={s} fillOpacity="0.65"/>
    <circle cx="28" cy="22" r="2.2" fill={s} fillOpacity="0.65"/>
    <path d="M20 29 Q24 33 28 29" stroke={s} strokeWidth="1.8" strokeOpacity="0.55" fill="none" strokeLinecap="round"/>
  </>,
  buenos_aires_rc: (p, s) => <>
    <rect x="3" y="3" width="42" height="42" rx="6" fill={p}/>
    <circle cx="24" cy="24" r="9" fill={s} fillOpacity="0.82"/>
    <circle cx="24" cy="24" r="6" fill={p}/>
    <line x1="24" y1="3" x2="24" y2="13" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="24" y1="35" x2="24" y2="45" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="3" y1="24" x2="13" y2="24" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="35" y1="24" x2="45" y2="24" stroke={s} strokeWidth="3" strokeOpacity="0.72" strokeLinecap="round"/>
    <line x1="9.5" y1="9.5" x2="15.8" y2="15.8" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="38.5" y1="9.5" x2="32.2" y2="15.8" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="9.5" y1="38.5" x2="15.8" y2="32.2" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
    <line x1="38.5" y1="38.5" x2="32.2" y2="32.2" stroke={s} strokeWidth="2.5" strokeOpacity="0.6" strokeLinecap="round"/>
  </>,
  santiago_trail: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M5 40 L13 26 L19 34 L24 20 L29 34 L35 26 L43 40 Z" fill={s} fillOpacity="0.55"/>
    <path d="M24 5 L26.2 12.5 H33 L27.5 17 L29.5 24 L24 20 L18.5 24 L20.5 17 L15 12.5 H21.8 Z" fill={s} fillOpacity="0.82"/>
  </>,
}

const DEFAULT_LOGO: LogoFn = (p, s) => <>
  <path d="M24 3 L42 13.5 V34.5 L24 45 L6 34.5 V13.5 Z" fill={p}/>
  <path d="M24 9 L37.6 17 V31 L24 39 L10.4 31 V17 Z" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.4"/>
  <circle cx="24" cy="24" r="4" fill={s} fillOpacity="0.35"/>
</>

// 専用ロゴを持たないクラブ（海外クラブ等）用の紋章プール。全部同じ六角形にならないよう、
// クラブIDのハッシュで多彩なデザインを割り当てる。
const LOGO_POOL: LogoFn[] = Object.values(LOGOS)
// 式は utils/hash の1本（`| 0` で畳むのは既に割り当たっているロゴを変えないため）
function logoHash(id: string): number {
  return Math.abs(strHash(id) | 0)
}

// 専用ロゴ（public/logos/<id>.png）を持つチーム。
// 以前は20個のIDを手書きで並べていたが、チームを足すたびにここにも足す必要があり、
// 足し忘れるとそのチームだけロゴがハッシュ生成の代替図形になる（実際に2部3部で起きた）。
// リーグのチームは全部ロゴを持っているので、チームデータから導出する。
const PNG_TEAM_IDS = new Set([...INITIAL_TEAMS, ...LOWER_DIVISION_TEAMS].map(t => t.id))

export function TeamLogoSVG({ primary, secondary, shortName, size = 48, teamId, logoId }: {
  primary: string; secondary: string; shortName: string; size?: number; teamId?: string; logoId?: string
}) {
  // プレイヤーが選んだプリセットロゴを最優先。logoId を明示指定（プレビュー等）が無ければ、teamId から自チームの選択を引く。
  const storeLogoId = useGameStore(s => teamId ? s.teams.find(t => t.id === teamId)?.logoId : undefined)
  // 国代表チーム（nat_JPN等）はクラブロゴではなく国旗を表示する（レース中・区間結果・順位表すべて共通）
  if (teamId?.startsWith('nat_')) {
    const w = Math.round(size * 1.2)
    const h = Math.round((w * 3) / 4)
    return (
      <img
        src={`/flags/${teamId.slice(4)}.svg`}
        alt="" width={w} height={h} draggable={false}
        style={{ width: w, height: h,objectFit: 'cover', display: 'block', flexShrink: 0, border: '1px solid rgba(0,0,0,0.35)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)' }}
      />
    )
  }
  const rawLogoId = logoId ?? storeLogoId
  // 'team:tokyo' の形は「そのチームがもともと持っているロゴ」の指定。
  // ロゴ未選択のままオンラインに出たとき、相手の画面でも同じ絵が出るようにするために使う
  // （data/logoPresets の defaultLogoIdFor が送っている）。ここで teamId 相当に読み替える。
  const logoTeamId = teamLogoIdOf(rawLogoId)
  const resolvedTeamId = logoTeamId ?? teamId
  const resolvedLogoId = logoTeamId ? undefined : rawLogoId
  if (resolvedLogoId) {
    return (
      <img
        src={logoPresetSrc(resolvedLogoId)}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block' }}
      />
    )
  }
  if (resolvedTeamId && PNG_TEAM_IDS.has(resolvedTeamId)) {
    return (
      <img
        src={`/logos/${resolvedTeamId}.png`}
        width={size}
        height={size}
        style={{ objectFit: 'contain', display: 'block', transform: 'scale(1.8)', transformOrigin: 'center' }}
      />
    )
  }
  const uid = resolvedTeamId ?? shortName ?? 'x'
  const p = `url(#lg-${uid})`
  // 専用ロゴがあれば最優先。無ければ全部同じ六角形にせず、ID/名からハッシュでプールから多彩に割り当てる。
  const logoFn = (resolvedTeamId && LOGOS[resolvedTeamId])
    || (LOGO_POOL.length > 0 ? LOGO_POOL[logoHash(uid) % LOGO_POOL.length] : DEFAULT_LOGO)
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <radialGradient id={`lg-${uid}`} cx="38%" cy="32%" r="65%">
          <stop offset="0%" stopColor={primary} stopOpacity="1"/>
          <stop offset="100%" stopColor={primary} stopOpacity="0.75"/>
        </radialGradient>
      </defs>
      {logoFn(p, secondary)}
    </svg>
  )
}

const LEAGUE_COLORS: Record<string, { primary: string; secondary: string }> = {
  jpel:           { primary: '#C9A84C', secondary: '#14121F' },
  ecl:            { primary: '#B01E10', secondary: '#F5C842' },
  k_league:       { primary: '#CD2E3A', secondary: '#FFFFFF' },
  china_distance: { primary: '#DE2910', secondary: '#FFDE00' },
  africa_elite:   { primary: '#078930', secondary: '#FCDD09' },
  euro_ekiden:    { primary: '#003399', secondary: '#FFCC00' },
  usa_running:    { primary: '#B22234', secondary: '#FFFFFF' },
  oceania_cup:    { primary: '#003087', secondary: '#FFD700' },
  south_america:  { primary: '#009C3B', secondary: '#FFDF00' },
  asia_ekiden:    { primary: '#0E7C7B', secondary: '#F4C430' },
  asia_me_ekiden: { primary: '#8A1538', secondary: '#E8C36B' },
  // 再編後の9リーグ
  asia_league:     { primary: '#0E7C7B', secondary: '#F4C430' },
  africa_east:     { primary: '#006600', secondary: '#FCDD09' },
  africa_ns:       { primary: '#C1272D', secondary: '#006233' },
  europe_ws:       { primary: '#003399', secondary: '#FFCC00' },
  europe_ne:       { primary: '#006AA7', secondary: '#FECC02' },
  north_america:   { primary: '#B22234', secondary: '#3C3B6E' },
  central_america: { primary: '#002B7F', secondary: '#CE1126' },
  oceania:         { primary: '#00843D', secondary: '#FFCD00' },
}

const LEAGUE_LOGOS: Record<string, (p: string, s: string) => React.ReactElement> = {
  // JPEL：金の盾に襷の斜めラインとトラックの円
  jpel: (p, s) => <>
    <path d="M24 3 L43 9 V26 Q43 38 24 45 Q5 38 5 26 V9 Z" fill={s} stroke={p} strokeWidth="2.5"/>
    <path d="M10 38 L31 9 H39 L18 41 Z" fill={p} fillOpacity="0.95"/>
    <circle cx="14" cy="15" r="4.5" fill={p}/>
    <circle cx="33" cy="33" r="6" fill="none" stroke={p} strokeWidth="2" strokeOpacity="0.8"/>
  </>,
  // ECL：深紅の地球儀と月桂樹のスウッシュ（世界一決定戦）
  ecl: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="21" r="11" fill="none" stroke={s} strokeWidth="2"/>
    <ellipse cx="24" cy="21" rx="5" ry="11" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.85"/>
    <line x1="13" y1="21" x2="35" y2="21" stroke={s} strokeWidth="1.5" strokeOpacity="0.85"/>
    <path d="M9 32 Q24 41 39 32" stroke={s} strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <path d="M12 30 L9 35 M36 30 L39 35 M18 34 L16 39 M30 34 L32 39" stroke={s} strokeWidth="2" strokeLinecap="round" strokeOpacity="0.85"/>
    <path d="M24 6 L25.4 9 L28.5 9.3 L26.2 11.4 L26.9 14.5 L24 12.9 L21.1 14.5 L21.8 11.4 L19.5 9.3 L22.6 9 Z" fill={s}/>
  </>,
  k_league: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 3 A21 21 0 0 1 24 45 A10.5 10.5 0 0 1 24 24 A10.5 10.5 0 0 0 24 3 Z" fill={s} fillOpacity="0.65"/>
    <circle cx="24" cy="13.5" r="5.5" fill={p}/>
    <circle cx="24" cy="34.5" r="5.5" fill={s} fillOpacity="0.82"/>
    <line x1="4" y1="10" x2="9" y2="10" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="4" y1="14" x2="9" y2="14" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="39" y1="10" x2="44" y2="10" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="39" y1="14" x2="44" y2="14" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="4" y1="34" x2="9" y2="34" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="4" y1="38" x2="9" y2="38" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="39" y1="34" x2="44" y2="34" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
    <line x1="39" y1="38" x2="44" y2="38" stroke={s} strokeWidth="2" strokeOpacity="0.55" strokeLinecap="round"/>
  </>,
  china_distance: (p, s) => <>
    <rect x="3" y="3" width="42" height="42" rx="8" fill={p}/>
    <ellipse cx="24" cy="24" rx="14" ry="18" fill="none" stroke={s} strokeWidth="2.5" strokeOpacity="0.72"/>
    <ellipse cx="24" cy="24" rx="10" ry="13" fill="none" stroke={s} strokeWidth="1.5" strokeOpacity="0.42"/>
    <line x1="10" y1="24" x2="38" y2="24" stroke={s} strokeWidth="1.5" strokeOpacity="0.5"/>
    <line x1="12" y1="17" x2="36" y2="17" stroke={s} strokeWidth="1" strokeOpacity="0.35"/>
    <line x1="12" y1="31" x2="36" y2="31" stroke={s} strokeWidth="1" strokeOpacity="0.35"/>
    <circle cx="24" cy="3" r="2.8" fill={s} fillOpacity="0.72"/>
    <path d="M20 43 L16 47" stroke={s} strokeWidth="2" strokeOpacity="0.52" strokeLinecap="round"/>
    <path d="M28 43 L32 47" stroke={s} strokeWidth="2" strokeOpacity="0.52" strokeLinecap="round"/>
  </>,
  africa_elite: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <line x1="24" y1="45" x2="24" y2="22" stroke={s} strokeWidth="5" strokeOpacity="0.72" strokeLinecap="round"/>
    <path d="M4 18 Q14 10 24 12 Q34 10 44 18 Q34 25 24 25 Q14 25 4 18 Z" fill={s} fillOpacity="0.72"/>
    <path d="M8 18 Q16 13 24 14 Q32 13 40 18 Q32 22 24 22 Q16 22 8 18 Z" fill={p}/>
    <path d="M10 19 Q18 15 24 16 Q30 15 38 19" stroke={s} strokeWidth="1.5" strokeOpacity="0.4" fill="none" strokeLinecap="round"/>
    <circle cx="24" cy="45" r="3.5" fill={s} fillOpacity="0.5"/>
  </>,
  euro_ekiden: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="10" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="31" cy="12" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="36" cy="17" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="38" cy="24" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="36" cy="31" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="31" cy="36" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="24" cy="38" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="17" cy="36" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="12" cy="31" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="10" cy="24" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="12" cy="17" r="2.2" fill={s} fillOpacity="0.92"/>
    <circle cx="17" cy="12" r="2.2" fill={s} fillOpacity="0.92"/>
  </>,
  usa_running: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 4 L26.5 21.5 L44 24 L26.5 26.5 L24 44 L21.5 26.5 L4 24 L21.5 21.5 Z" fill={s} fillOpacity="0.82"/>
    <circle cx="24" cy="24" r="6.5" fill={p}/>
    <path d="M20 22 Q24 18 28 22 Q24 26 20 22 Z" fill={s} fillOpacity="0.5"/>
  </>,
  oceania_cup: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M3 34 Q10 26 17 32 Q24 38 31 32 Q38 26 45 34 L45 46 L3 46 Z" fill={s} fillOpacity="0.3"/>
    <path d="M21.5 7 L23.2 12.5 H28.5 L24.5 15.8 L26.2 21.5 L21.5 18 L16.8 21.5 L18.5 15.8 L14.5 12.5 H19.8 Z" fill={s} fillOpacity="0.92"/>
    <circle cx="11" cy="17" r="2.8" fill={s} fillOpacity="0.82"/>
    <circle cx="35" cy="17" r="2.8" fill={s} fillOpacity="0.82"/>
    <circle cx="18" cy="28" r="2.8" fill={s} fillOpacity="0.82"/>
    <circle cx="31" cy="30" r="2.2" fill={s} fillOpacity="0.72"/>
  </>,
  south_america: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M4 40 L13 24 L19 33 L24 19 L29 33 L35 24 L44 40 Z" fill={s} fillOpacity="0.42"/>
    <path d="M24 17 C20 14 7 16 3 21 C7 23 15 22 19 24 C21 25 21 30 24 32 C27 30 27 25 29 24 C33 22 41 23 45 21 C41 16 28 14 24 17 Z" fill={s} fillOpacity="0.77"/>
    <circle cx="24" cy="11" r="5.5" fill={s} fillOpacity="0.72"/>
  </>,
  // アジア駅伝（東・東南）：昇る朝日と放射
  asia_ekiden: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="27" r="8.5" fill={s} fillOpacity="0.9"/>
    <path d="M24 9 V15 M11 13 L15 17 M37 13 L33 17 M6 24 H12 M42 24 H36" stroke={s} strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.85"/>
    <path d="M6 37 Q24 31 42 37" stroke={s} strokeWidth="2" fill="none" strokeLinecap="round" strokeOpacity="0.55"/>
  </>,
  // アジア・中東駅伝（南中央＋湾岸）：三日月と星
  asia_me_ekiden: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M31 8 A18 18 0 1 0 31 40 A13.5 13.5 0 1 1 31 8 Z" fill={s} fillOpacity="0.9"/>
    <path d="M33 20 L35 25.5 H40.8 L36 29 L37.8 34.5 L33 31 L28.2 34.5 L30 29 L25.2 25.5 H31 Z" fill={s} fillOpacity="0.92"/>
  </>,
  // ── 再編後の9リーグ（旧IDのままだと全部フォールバックの丸に点になるため個別デザインを割当） ──
  // アフリカ北・南：砂丘と椰子
  africa_ns: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M3 36 Q14 27 24 33 Q34 39 45 31 L45 46 L3 46 Z" fill={s} fillOpacity="0.45"/>
    <path d="M30 12 Q34 10 38 13 M30 12 Q28 8 32 5 M30 12 Q25 9 22 12 M30 12 Q33 6 38 7 M30 12 L29 24" stroke={s} strokeWidth="2" fill="none" strokeLinecap="round" strokeOpacity="0.9"/>
    <circle cx="13" cy="14" r="3.4" fill={s} fillOpacity="0.85"/>
  </>,
  // ヨーロッパ北東：ノルディックのコンパス星
  europe_ne: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <path d="M24 5 L27 21 L43 24 L27 27 L24 43 L21 27 L5 24 L21 21 Z" fill={s} fillOpacity="0.9"/>
    <circle cx="24" cy="24" r="4.5" fill={p} stroke={s} strokeWidth="1.6"/>
    <circle cx="24" cy="24" r="17" fill="none" stroke={s} strokeWidth="1.4" strokeOpacity="0.4"/>
  </>,
  // 中央アメリカ：マヤのピラミッドと太陽
  central_america: (p, s) => <>
    <circle cx="24" cy="24" r="21" fill={p}/>
    <circle cx="24" cy="13" r="4.5" fill={s} fillOpacity="0.85"/>
    <path d="M8 39 H40 M11 34 H37 M14 29 H34 M17 24 H31 M20 24 V39 M28 24 V39" stroke={s} strokeWidth="2.4" strokeLinecap="round" strokeOpacity="0.9"/>
  </>,
}
// 新リーグID → 既存デザインの流用（色はLEAGUE_COLORSでリーグごとに変わる）
LEAGUE_LOGOS.asia_league = LEAGUE_LOGOS.asia_ekiden
LEAGUE_LOGOS.africa_east = LEAGUE_LOGOS.africa_elite
LEAGUE_LOGOS.europe_ws = LEAGUE_LOGOS.euro_ekiden
LEAGUE_LOGOS.north_america = LEAGUE_LOGOS.usa_running
LEAGUE_LOGOS.oceania = LEAGUE_LOGOS.oceania_cup

export function LeagueLogoSVG({ leagueId, size = 48 }: { leagueId: string; size?: number }) {
  const colors = LEAGUE_COLORS[leagueId] ?? { primary: '#4B5563', secondary: '#FFFFFF' }
  const { primary: p, secondary: s } = colors
  const logoFn = LEAGUE_LOGOS[leagueId]
  if (!logoFn) return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="21" fill={p} fillOpacity="0.6"/>
      <circle cx="24" cy="24" r="5" fill={s} fillOpacity="0.4"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {logoFn(p, s)}
    </svg>
  )
}

export function SpecialtyIcon({ specialty, size = 14 }: { specialty: string; size?: number }) {
  if (specialty === 'mountain_up' || specialty === 'mountain_down') {
    return <IconMountain size={size} />
  }
  if (specialty === 'sprinter') {
    return <IconWind size={size} />
  }
  return <IconRace size={size} />
}

// ジュエルのアイコン。**5画面が同じSVGを別々に持っていた**（グラデーションの id だけ違う）。
// 大きさと透明度だけ選べる。中の面取り（detailed）はジュエルのページだけが出していたので
// 見た目を変えないよう任意にしてある。
export function JewelIcon({ size = 14, opacity = 1, detailed = false }: {
  size?: number
  opacity?: number
  /** 中に面取りの線を1本入れる（ジュエルのページの表示） */
  detailed?: boolean
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ opacity, flexShrink: 0 }}>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="url(#jewel-grad)" stroke="#4ab8ea" strokeWidth="1.2" strokeLinejoin="round"/>
      {detailed && (
        <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="none" stroke="#a8e4ff" strokeWidth="0.6" strokeLinejoin="round" opacity="0.5" transform="scale(0.55) translate(10.9 10.9)"/>
      )}
      <defs>
        <linearGradient id="jewel-grad" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a8e4ff"/>
          <stop offset="100%" stopColor="#3b9fd4"/>
        </linearGradient>
      </defs>
    </svg>
  )
}
