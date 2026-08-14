import type { CardStatKey, CardRarity } from '../../types'
import { CARD_NAMES, RARITY_COLORS, RARITY_LABELS, REST_CARD_NAME } from '../../utils/cardCombo'
import { STAT_ICON_MAP } from '../icons/StatIcons'
import { SAIRA, REST_ACCENT } from '../../styles/tokens'



// 練習カードのビジュアル。SVGでカード枠（レア度で色/ホロ演出）を描き、中央に能力アイコンを載せる。
// kind==='rest' の完全休養カードは休養アイコン＋「疲労 -N」を表示する。
export default function TrainingCardSVG({
  statKey, rarity, width = 82, selected = false, count, dimmed = false, kind, value,
}: {
  statKey: CardStatKey
  rarity: CardRarity
  width?: number
  selected?: boolean
  count?: number
  dimmed?: boolean
  kind?: 'rest'
  value?: number
}) {
  const isRest = kind === 'rest'
  const col = RARITY_COLORS[rarity]
  const accent = isRest ? REST_ACCENT : col
  const h = Math.round(width * 1.4)
  const holo = rarity === 'epic' || rarity === 'legendary'
  const uid = `${kind ?? 'stat'}_${statKey}_${rarity}`

  return (
    <div style={{ position: 'relative', width, height: h, opacity: dimmed ? 0.4 : 1, transition: 'opacity 0.15s' }}>
      <svg width={width} height={h} viewBox="0 0 100 140" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={`bg_${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#20202e" />
            <stop offset="55%" stopColor="#171722" />
            <stop offset="100%" stopColor={col} stopOpacity="0.22" />
          </linearGradient>
          <linearGradient id={`frame_${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={col} />
            <stop offset="50%" stopColor={col} stopOpacity="0.6" />
            <stop offset="100%" stopColor={col} />
          </linearGradient>
          {holo && (
            <linearGradient id={`holo_${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff" stopOpacity="0" />
              <stop offset="45%" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="55%" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          )}
        </defs>

        {/* body */}
        <rect x="3" y="3" width="94" height="134" rx="11"
          fill={`url(#bg_${uid})`}
          stroke={`url(#frame_${uid})`} strokeWidth={selected ? 4 : 2.5} />
        {/* inner hairline */}
        <rect x="7" y="7" width="86" height="126" rx="8" fill="none" stroke={col} strokeOpacity="0.25" strokeWidth="1" />
        {/* top gloss */}
        <rect x="8" y="8" width="84" height="34" rx="7" fill="#fff" fillOpacity="0.05" />
        {/* holo shine */}
        {holo && <rect x="3" y="3" width="94" height="134" rx="11" fill={`url(#holo_${uid})`} />}
        {/* rarity gem */}
        <circle cx="50" cy="118" r="4.5" fill={col} stroke="#fff" strokeOpacity="0.5" strokeWidth="0.8" />
        {selected && (
          <rect x="1.5" y="1.5" width="97" height="137" rx="12" fill="none" stroke="#fff" strokeOpacity="0.85" strokeWidth="1" />
        )}
      </svg>

      {/* rarity label */}
      <div style={{
        position: 'absolute', top: width * 0.09, left: 0, right: 0, textAlign: 'center',
        fontFamily: SAIRA, fontSize: width * 0.11, fontWeight: 900, letterSpacing: 0.5,
        color: col, textShadow: `0 0 6px ${col}88`,
      }}>{RARITY_LABELS[rarity]}</div>

      {/* icon */}
      <div style={{
        position: 'absolute', top: '30%', left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
        filter: `drop-shadow(0 0 6px ${accent}66)`,
      }}>
        {isRest ? (
          <svg width={Math.round(width * 0.44)} height={Math.round(width * 0.44)} viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="20" fill="none" stroke={accent} strokeWidth="3" />
            <text x="22" y="22" textAnchor="middle" dominantBaseline="central"
              fontFamily={SAIRA} fontSize="24" fontWeight={900} fill={accent}>休</text>
          </svg>
        ) : (
          STAT_ICON_MAP[statKey]({ size: Math.round(width * 0.44), color: col })
        )}
      </div>

      {/* name plate */}
      <div style={{
        position: 'absolute', bottom: isRest ? width * 0.3 : width * 0.2, left: 0, right: 0, textAlign: 'center',
        fontFamily: SAIRA, fontSize: width * 0.145, fontWeight: 900, color: '#fff',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)', padding: '0 4px',
      }}>{isRest ? REST_CARD_NAME : CARD_NAMES[statKey]}</div>

      {/* rest: 疲労回復量 */}
      {isRest && value != null && (
        <div style={{
          position: 'absolute', bottom: width * 0.16, left: 0, right: 0, textAlign: 'center',
          fontFamily: SAIRA, fontSize: width * 0.12, fontWeight: 900, color: accent,
          textShadow: `0 0 6px ${accent}88`,
        }}>疲労 -{value}</div>
      )}

      {/* count badge */}
      {count != null && count > 1 && (
        <div style={{
          position: 'absolute', top: -5, right: -5,
          minWidth: width * 0.26, height: width * 0.26,
          padding: '0 4px',
          background: col, color: '#fff',
          fontFamily: SAIRA, fontSize: width * 0.16, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1.5px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}>×{count}</div>
      )}
    </div>
  )
}
