import type { Nationality, Player } from '../types'
import { natFaceRegion } from '../data/nationalities'
import { strHash } from './hash'

// ============================================================================
// **選手の見た目（顔の髪・3D中継の髪と靴）の唯一の決まり。** 顔（`components/player/PlayerFace`）と
// 3D中継（`components/race/stage3d`）が同じここを通る＝顔が金髪の選手は3Dでも金髪。
// ★React も store も import しないこと（3D の側から呼ぶため）
// ============================================================================

export const HAIR_STYLES = 24
export const EYE_COUNT = 27

export type HairColor = 'black_light' | 'black_dark' | 'brown_light' | 'blond_light'

function hairColorFromNationality(nat: Nationality, styleIndex: number): HairColor {
  const region = natFaceRegion(nat)
  if (region === 'africa') return 'black_dark'
  if (region === 'east_asia') return styleIndex % 3 === 0 ? 'brown_light' : 'black_light'
  if (region === 'south_asia') return styleIndex % 2 === 0 ? 'black_dark' : 'black_light'
  if (region === 'europe' || region === 'oceania') return 'blond_light'
  if (region === 'americas') {
    const choices: HairColor[] = ['black_light', 'brown_light', 'blond_light', 'black_dark', 'blond_light']
    return choices[styleIndex % choices.length]
  }
  // other
  const choices: HairColor[] = ['black_light', 'brown_light', 'blond_light', 'black_dark']
  return choices[styleIndex % choices.length]
}

// `utils/hash` の `strHash` 1本（符号付きに直して絶対値＝以前の手書きと同じ値。50万件で突き合わせ済み）
function playerHash(id: string): number {
  return Math.abs(strHash(id) | 0)
}

export function faceIndices(playerId: string, nationality: Nationality) {
  const h = playerHash(playerId)
  const h2 = (Math.imul(h, 2654435761) >>> 0)
  const h3 = (Math.imul(h, 40503) >>> 0)
  const styleIndex = h % HAIR_STYLES
  const eyeIndex = h2 % EYE_COUNT
  const flipH = h3 % 2 === 1
  const hairColor = hairColorFromNationality(nationality, styleIndex)
  // 顔素材が髪15×目18×反転2=540通りしか無く長期プレイで同じ顔が量産されるため、
  // 明度・色相・目のサイズ/位置の微差をIDから決定的に加えて組み合わせを約1.5万通りに拡張する
  const h4 = (Math.imul(h, 92837111) >>> 0)
  const brightness = [0.93, 1, 1.07][h4 % 3]
  const hue = [-6, 0, 6][(h4 >>> 3) % 3]
  const eyeScale = [0.95, 1, 1.05][(h4 >>> 6) % 3]
  const eyeShift = [-1.2, 0, 1.2][(h4 >>> 9) % 3]  // キャンバス高に対する%
  return { hairColor, styleIndex, eyeIndex, flipH, brightness, hue, eyeScale, eyeShift }
}


/** 顔の髪の色 → 3D の髪の色（顔の素材の色に合わせる） */
const HAIR_RGB: Record<HairColor, number> = {
  black_light: 0x2e2724,
  black_dark: 0x141212,
  brown_light: 0x6e4527,
  blond_light: 0xd8b060,
}

/** その選手の髪の色（3D）。マイプレイヤーは作ったときに選んだ色 */
export function hairRgbOf(p: Pick<Player, 'id' | 'nationality' | 'customFace'>): number {
  return HAIR_RGB[p.customFace?.hair ?? faceIndices(p.id, p.nationality).hairColor] ?? HAIR_RGB.black_light
}

/** 靴の色（選手ごとにバラバラ。IDから決めるので同じ選手はいつも同じ靴） */
const SHOE_RGB = [0xf2f2f2, 0x1c1c1c, 0xe8452c, 0x2f6fe0, 0xf0c53a, 0x33c46b, 0xff7a1a, 0xe23fa0, 0x7de0e8] as const

export function shoeRgbOf(playerId: string): number {
  return SHOE_RGB[(strHash(playerId + ':shoe') >>> 0) % SHOE_RGB.length]
}
