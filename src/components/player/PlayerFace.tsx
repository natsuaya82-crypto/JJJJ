import type { Nationality } from '../../types'
import { useGameStore } from '../../store/gameStore'
import { faceIndices, HAIR_STYLES, EYE_COUNT, type HairColor } from '../../utils/playerFace'

// Python face_generator.py と同じ定数
const CW = 260
const CH = 320

// EYE_CFG: [幅, 左右オフセット, 上端y] — Python の EYE_CFG と完全一致
const EYE_CFG: [number, number, number][] = [
  [108, -2, 142], [108, -2, 134], [108, -2, 141], [108, -2, 139],
  [108, -2, 139], [108, -2, 139], [108, -2, 128], [108, -2, 138],
  [108, -2, 147], [108, -2, 134], [108, -2, 149], [108,  1, 134],
  [101,  4, 140], [101, -2, 140], [101, -2, 140], [101, -2, 140],
  [101, -2, 145], [101, -2, 145],
  // 18〜26: 新規追加分
  [100, -2, 146], [100, -2, 146], [100, -2, 146], [100, -2, 146],
  [100, -2, 146], [100, -2, 146], [100, -2, 146], [100, -2, 146],
  [100, -2, 146],
]

type CustomFace = { style: number; eye: number; hair: HairColor; flip: boolean }
type Props = {
  playerId: string
  nationality: Nationality
  size?: number  // 表示幅px（高さは比率で自動）
  customFace?: CustomFace  // マイプレイヤーの手動指定顔（あれば自動生成を上書き）
}

export default function PlayerFace({ playerId, nationality, size = 52, customFace }: Props) {
  // propで来なければストアから引く（マイプレイヤーの顔を全画面で反映）。通常選手はundefinedで安定＝再描画ループなし
  const storeFace = useGameStore(s => customFace ? undefined : s.players.find(p => p.id === playerId)?.customFace)
  const face = customFace ?? storeFace
  const auto = faceIndices(playerId, nationality)
  // 手動指定顔があればそれを使う（明度/色相/目の微揺らぎは無し＝指定通りに描画）
  const hairColor = face ? face.hair : auto.hairColor
  // 壊れた値（NaN・範囲外）が入っていても必ず有効なインデックスに落とす
  const inRange = (v: number, max: number) => (Number.isInteger(v) && v >= 0 && v < max ? v : 0)
  const styleIndex = inRange(face ? (face.style % HAIR_STYLES) : auto.styleIndex, HAIR_STYLES)
  const eyeIndex = inRange(face ? (face.eye % EYE_COUNT) : auto.eyeIndex, EYE_COUNT)
  const flipH = face ? face.flip : auto.flipH
  const brightness = face ? 1 : auto.brightness
  const hue = face ? 0 : auto.hue
  const eyeScale = face ? 1 : auto.eyeScale
  const eyeShift = face ? 0 : auto.eyeShift
  // customFace の値が壊れている（NaN・範囲外）と undefined を分割代入して例外＝画面が真っ白になるため保険をかける
  const [ew, ex, ey] = EYE_CFG[eyeIndex] ?? EYE_CFG[0]

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
