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

export type Competition = 'jpel' | 'reserve' | 'ecl' | 'world' | 'friend'
export const COMPETITION_BTN: Record<Competition, string> = {
  jpel:    'btn-game--gold',
  reserve: 'btn-game--blue',
  ecl:     'btn-game--red',
  world:   'btn-game--purple',
  friend:  'btn-game--gold',   // フレンド対戦。現状の既定色を維持（見た目を変えない）
}

// 順位の色の「唯一の決まり」。
//
// 金・銀・銅の色分けが画面ごとに違うルールで4通り手書きされていた
// （PlayerSheet.tsx の中だけでも2つのルールが混在）。レース結果・順位表・
// オンライン対戦の3画面で使われていた式（一番数が多い）をここに集約する。
/** 順位(1始まり) → 色。1位=金 / 2位=銀 / 3位=銅 / 4位以下=薄いグレー。 */
export function rankColor(rank: number): string {
  if (rank === 1) return C.gold
  if (rank === 2) return '#9B97A8'
  if (rank === 3) return '#CD7F32'
  return C.textGhost
}

/**
 * 色に透け具合を足す。#rgb（3桁）でも #rrggbb（6桁）でも受け取れる。
 *
 * 3桁のまま末尾をくっつけると #000 + 4d = #0004d という5桁になり、
 * 色として無効になる。無効な色を入れても画面は前の色を残すので、
 * 「一度黄色くなったボタンが、選び直しても黄色いまま」になっていた。
 * 3桁のときは先に6桁へ伸ばしてからくっつける。
 */
export const alpha = (hex: string, a: number) => {
  const h = /^#[0-9a-fA-F]{3}$/.test(hex)
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const n = Math.round(a * 255).toString(16).padStart(2, '0')
  return `${h}${n}`
}
