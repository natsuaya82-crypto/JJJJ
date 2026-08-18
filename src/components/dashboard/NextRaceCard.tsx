import type { Race } from '../../types'
import { C, CARD, alpha, COMPETITION_BTN, SAIRA, F } from '../../styles/tokens'
import { InfoTile } from '../ui'
import { courseTypeOf } from '../../data/races'
import { panelStyle } from '../ui/Panel'

const WEATHER_LABEL: Record<string, string> = { sunny: '晴れ', cloudy: '曇り', rainy: '雨', windy: '強風' }
const WEATHER_COLOR: Record<string, string> = { sunny: C.gold, cloudy: CARD.textDim, rainy: C.blue, windy: C.cyan }

const RACE_TYPE_LABEL: Record<string, string> = { league: 'LEAGUE', college: 'COLLEGE' }

interface Props {
  race: Race
  raceNumber: number
  totalRaces: number
  onClick: () => void
  variant?: 'main' | 'reserve' | 'ecl'   // reserve=青 / ecl=赤 にして1軍と区別
  ctaLabel?: string   // CTAの文言を差し替える（例：出場権のないECLは「観戦する」）
  secondaryCtaLabel?: string   // CTAの横に置く副ボタン（例：ECL観戦の「スキップ」）
  onSecondaryClick?: () => void
}

export default function NextRaceCard({ race, raceNumber, totalRaces, onClick, variant = 'main', ctaLabel, secondaryCtaLabel, onSecondaryClick }: Props) {
  const totalDist = race.segments.reduce((s, sg) => s + sg.distanceKm, 0).toFixed(1)
  const isReserve = variant === 'reserve'
  // アクセント色一式（金＝1軍 / 青＝リザーブ / 赤＝ECL）。
  // ボタンの色だけはレース画面と同じ COMPETITION_BTN から引く（大会→色の対応は1箇所に）。
  // 世界選手権はこのカードを使わず Dashboard 側に専用UIがある（そちらは既に紫）。
  const AC = variant === 'ecl' ? {
    border: C.red, shadowDeep: '#5a1010', frame: 'rgba(232,70,42,0.35)',
    headerGrad: `linear-gradient(90deg, ${alpha(C.red, 0.20)}, ${alpha(C.red, 0.04)})`,
    headerBorder: alpha(C.red, 0.20),
    badgeGrad: `linear-gradient(180deg, #ff8a75 0%, ${C.red} 60%, #7a1610 100%)`,
    badgeBorder: '#5a1010', badgeShadow: '#3f0c08',
    divider: '#7a1610', tileBorder: alpha(C.red, 0.15), btnClass: COMPETITION_BTN.ecl,
    typeLabel: 'ECL', nextColor: C.red,
  } : isReserve ? {
    border: C.blue, shadowDeep: '#2f3a7a', frame: 'rgba(121,134,203,0.35)',
    headerGrad: `linear-gradient(90deg, ${alpha(C.blue, 0.20)}, ${alpha(C.blue, 0.04)})`,
    headerBorder: alpha(C.blue, 0.20),
    badgeGrad: `linear-gradient(180deg, #aab3e6 0%, ${C.blue} 60%, #4a56a8 100%)`,
    badgeBorder: '#2f3a7a', badgeShadow: '#232c5e',
    divider: '#4a56a8', tileBorder: alpha(C.blue, 0.15), btnClass: COMPETITION_BTN.reserve,
    typeLabel: 'RESERVE', nextColor: C.cyan,
  } : {
    border: C.gold, shadowDeep: CARD.goldDark, frame: 'rgba(245,200,66,0.28)',
    headerGrad: `linear-gradient(90deg, ${alpha(C.gold, 0.18)}, ${alpha(C.gold, 0.04)})`,
    headerBorder: alpha(C.gold, 0.18),
    badgeGrad: `linear-gradient(180deg, ${C.goldHi} 0%, ${C.gold} 60%, ${C.goldDark} 100%)`,
    badgeBorder: CARD.goldDark, badgeShadow: '#5a3500',
    divider: C.goldDark, tileBorder: alpha(C.gold, 0.12), btnClass: COMPETITION_BTN.jpel,
    typeLabel: RACE_TYPE_LABEL[race.type] ?? race.type.toUpperCase(), nextColor: C.cyan,
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="pressable"
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
      style={panelStyle(AC.border)}
    >

      {/* Tasuki accent */}
      <div style={{
        position: 'absolute', top: '-40%', right: '-20%', width: 200, height: 200,
        background: `linear-gradient(135deg, transparent 45%, ${alpha(C.cyan, 0.12)} 50%, transparent 55%)`,
        transform: 'rotate(15deg)', pointerEvents: 'none', zIndex: 0,
      }}/>

      {/* Header */}
      <div style={{
        background: AC.headerGrad,
        padding: '14px 16px 12px',
        borderBottom: `1px solid ${AC.headerBorder}`,
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: AC.nextColor, boxShadow: `0 0 8px ${AC.nextColor}` }}/>
              <span style={{ fontFamily: SAIRA, fontSize: F.caption, color: AC.nextColor, letterSpacing: '0.22em', fontWeight: 900 }}>
                NEXT RACE — {raceNumber}/{totalRaces}
              </span>
            </div>
            <div style={{
              fontSize: F.head, fontWeight: 900, color: C.text, lineHeight: 1.1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textShadow: `-1px -1px 0 ${C.outline}, 1px -1px 0 ${C.outline}, -1px 1px 0 ${C.outline}, 1px 1px 0 ${C.outline}`,
            }}>
              {race.name}
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: F.label, color: C.textSub, marginTop: 3, letterSpacing: '0.06em' }}>
              {race.date.replace(/-/g, '/')} · {race.location}
            </div>
          </div>
          <div style={{
            padding: '5px 12px', flexShrink: 0,
            background: AC.badgeGrad,
            border: `1px solid ${AC.badgeBorder}`,
            fontFamily: SAIRA, fontSize: F.label, fontWeight: 900, color: C.bg,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
            textShadow: 'none',
          }}>
            {AC.typeLabel}
          </div>
        </div>
      </div>

      {/* Info tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr 1px 1fr',
        padding: '10px 16px 10px', gap: 0,
        background: `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.2) 100%)`,
        borderBottom: `1px solid ${AC.tileBorder}`,
        position: 'relative', zIndex: 2,
      }}>
        {[
          { label: '区間数', value: `${race.segments.length}区間` },
          null,
          { label: '総距離', value: `${totalDist}km` },
          null,
          { label: 'コース', value: courseTypeOf(race.segments) },
          null,
          { label: '天候', value: WEATHER_LABEL[race.conditions.weather] ?? '—', color: WEATHER_COLOR[race.conditions.weather] },
        ].map((item, i) => {
          if (item === null) {
            return (
              <div key={i} style={{
                width: 1, alignSelf: 'center', height: 24,
                background: `linear-gradient(180deg, transparent, ${AC.divider}, transparent)`,
              }}/>
            )
          }
          return (
            <div key={i} style={{ textAlign: 'center', padding: '2px 0' }}>
              <InfoTile label={item.label} value={item.value} color={(item as { color?: string }).color}/>
            </div>
          )
        })}
      </div>

      {/* CTA：白文字＋共通の縁取り（金・青とも btn-game のCSSに準拠） */}
      <div style={{ padding: '10px 14px 12px', position: 'relative', zIndex: 2, display: 'flex', gap: 8 }}>
        <button className={`btn-game ${AC.btnClass}`} style={{ flex: 1, minWidth: 0, border: 'none', cursor: 'pointer' }}>
          <span className="btn-game__inner" style={{ fontSize: F.sub, padding: '11px 14px',fontWeight: 900 }}>
            {ctaLabel ?? '出走メンバーを組む'}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          </span>
        </button>
        {/* ★横に並ぶボタンは**同じ部品・同じ色**で出すこと。片方だけ別部品にすると
             透け方がわずかに違って「別のボタン」に見える（オーナー・2026-08-14） */}
        {secondaryCtaLabel && onSecondaryClick && (
          <button
            className={`btn-game ${AC.btnClass}`}
            style={{ flexShrink: 0, border: 'none', cursor: 'pointer' }}
            onClick={e => { e.stopPropagation(); onSecondaryClick() }}
          >
            <span className="btn-game__inner" style={{ fontSize: F.bodyLg, padding: '11px 14px', fontWeight: 900, gap: 4 }}>
              {secondaryCtaLabel}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                <path d="M5 18l6-6-6-6M13 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
