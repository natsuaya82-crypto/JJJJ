/* Design tokens — JS 側で inline style に使う定数 */

export const C = {
  bg:        '#0a1729',
  surface:   '#0f1f38',
  surface2:  '#1a2c47',
  surface3:  '#243a5a',
  border:    '#1a3252',
  border2:   '#1e3a5c',
  border3:   '#2a4a6a',
  text:      '#ffffff',
  textSub:   '#c8d4e3',
  textDim:   '#8c9aaf',
  textGhost: '#4a6080',
  gold:      '#f5c842',
  goldHi:    '#ffe082',
  goldDark:  '#b8860b',
  red:       '#ff4757',
  green:     '#2ecc71',
  blue:      '#7986CB',
  cyan:      '#5ed4ff',
  orange:    '#FF9800',
  pink:      '#EC407A',
  purple:    '#A855F7',  // 世界選手権（プレステージ枠）
  purpleDark:'#6D28D9',
} as const

export const R = {
  sm:  '8px',
  md:  '12px',
  lg:  '16px',
  xl:  '20px',
  full:'9999px',
} as const

export const alpha = (hex: string, a: number) => {
  const n = Math.round(a * 255).toString(16).padStart(2, '0')
  return `${hex}${n}`
}
