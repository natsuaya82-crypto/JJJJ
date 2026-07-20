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
  return { hairColor, styleIndex, eyeIndex, flipH }
}

type Props = {
  playerId: string
  nationality: Nationality
  size?: number  // 表示幅px（高さは比率で自動）
}

export default function PlayerFace({ playerId, nationality, size = 52 }: Props) {
  const { hairColor, styleIndex, eyeIndex, flipH } = faceIndices(playerId, nationality)
  const [ew, ex, ey] = EYE_CFG[eyeIndex]

  const w = size
  const h = Math.round(size * CH / CW)

  // 目の配置をパーセントで計算（260×320キャンバス基準）
  const eyeLeft   = `${((CW / 2 - ew / 2 + ex) / CW) * 100}%`
  const eyeTop    = `${(ey / CH) * 100}%`
  const eyeWidth  = `${(ew / CW) * 100}%`

  const hairSrc = `/faces/hair/${hairColor}_${String(styleIndex).padStart(2, '0')}.png`
  const eyeSrc  = `/faces/eyes/eye_${String(eyeIndex).padStart(2, '0')}.png`

  return (
    <div style={{ position: 'relative', width: w, height: h, flexShrink: 0, transform: flipH ? 'scaleX(-1)' : undefined }}>
      <img
        src={hairSrc}
        alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
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
