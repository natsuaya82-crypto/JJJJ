import type { Nationality } from '../../types'
import { natFaceRegion } from '../../data/nationalities'

// Python face_generator.py と同じ定数
const CW = 260
const CH = 320
const HAIR_STYLES = 15
const EYE_COUNT = 18

// EYE_CFG: [幅, 左右オフセット, 上端y] — Python の EYE_CFG と完全一致
const EYE_CFG: [number, number, number][] = [
  [108, -2, 142], [108, -2, 134], [108, -2, 141], [108, -2, 139],
  [108, -2, 139], [108, -2, 139], [108, -2, 128], [108, -2, 138],
  [108, -2, 147], [108, -2, 134], [108, -2, 149], [108,  1, 134],
  [101, -2, 140], [101, -2, 140], [101, -2, 140], [101, -2, 140],
  [101, -2, 145], [101, -2, 145],
]

type HairColor = 'black_light' | 'black_dark' | 'brown_light' | 'blond_light'

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

function playerHash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(31, h) + id.charCodeAt(i) | 0
  }
  return Math.abs(h)
}

function faceIndices(playerId: string, nationality: Nationality) {
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

type Props = {
  playerId: string
  nationality: Nationality
  size?: number  // 表示幅px（高さは比率で自動）
}

export default function PlayerFace({ playerId, nationality, size = 52 }: Props) {
  const { hairColor, styleIndex, eyeIndex, flipH, brightness, hue, eyeScale, eyeShift } = faceIndices(playerId, nationality)
  const [ew, ex, ey] = EYE_CFG[eyeIndex]

  const w = size
  const h = Math.round(size * CH / CW)

  // 目の配置をパーセントで計算（260×320キャンバス基準）。eyeShift/eyeScaleで個体差を付ける
  const eyeLeft   = `${((CW / 2 - (ew * eyeScale) / 2 + ex) / CW) * 100}%`
  const eyeTop    = `${(ey / CH) * 100 + eyeShift}%`
  const eyeWidth  = `${((ew * eyeScale) / CW) * 100}%`

  const hairSrc = `/faces/hair/${hairColor}_${String(styleIndex).padStart(2, '0')}.png`
  const eyeSrc  = `/faces/eyes/eye_${String(eyeIndex).padStart(2, '0')}.png`

  return (
    <div style={{ position: 'relative', width: w, height: h, flexShrink: 0, transform: flipH ? 'scaleX(-1)' : undefined }}>
      <img
        src={hairSrc}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', filter: (brightness !== 1 || hue !== 0) ? `brightness(${brightness}) hue-rotate(${hue}deg)` : undefined }}
        draggable={false}
      />
      <img
        src={eyeSrc}
        alt=""
        style={{
          position: 'absolute',
          left: eyeLeft,
          top: eyeTop,
          width: eyeWidth,
          height: 'auto',
        }}
        draggable={false}
      />
    </div>
  )
}
