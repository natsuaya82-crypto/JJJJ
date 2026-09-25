import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import type { FacilityKey } from '../../types'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { JewelIcon } from '../icons/Icons'
import { panelStyle } from '../ui/Panel'
import GlassButton from '../ui/GlassButton'
import {
  facilitiesOf, FACILITY_MAX_LEVEL, FACILITY_UPGRADE_COSTS,
  facilityMedFatigueMultiplier, facilityScoutPoints, facilityScoutNegoBonus, facilityTacticsStatBonus,
} from '../../utils/facilities'
import { facilityExpMultiplier } from '../../engine/growth'
import { myClub } from '../../utils/world'


function FacilityIconSVG({ facilityKey, color, size = 26 }: { facilityKey: FacilityKey; color: string; size?: number }) {
  if (facilityKey === 'trainingCamp') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="15.5" cy="4" r="2" fill={color}/>
      <path d="M8 21l3-7 3 3 2-6.5 2.5 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 13.5l3.5-5.5 3.5 1.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 9l3 1.5-2 3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
  if (facilityKey === 'medicalCenter') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 3h6v6h6v6h-6v6H9v-6H3v-6h6V3z" fill={color} opacity="0.25" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  )
  if (facilityKey === 'scoutOffice') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="10" cy="10" r="5.5" stroke={color} strokeWidth="1.8"/>
      <path d="M14.5 14.5L20 20" stroke={color} strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M8 10h4M10 8v4" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 21h18" stroke={color} strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M6 21V13" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <path d="M12 21V8" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <path d="M18 21V11" stroke={color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="6" cy="11" r="2" fill={color}/>
      <circle cx="12" cy="6" r="2" fill={color}/>
      <circle cx="18" cy="9" r="2" fill={color}/>
      <path d="M6 11l6-5 6 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

// レベルの並び（Lv1〜上限）。上限は `utils/facilities` 1本
const LEVELS = Array.from({ length: FACILITY_MAX_LEVEL }, (_, i) => i + 1)
const pct = (v: number) => `${Math.round(v * 100)}%`

// ★**効き目の数字を画面に書かないこと。** 実際に掛ける側から出す
//   （合宿＝`engine/growth` の `facilityExpMultiplier`、ほか3つは `utils/facilities`）。
//   以前はここに 'Lv1: 疲労-8%' のような文字列で焼いてあり、engine 側を変えても
//   画面の数字だけが元のまま残る形だった。
const FACILITY_META: {
  key: FacilityKey
  name: string
  desc: string
  color: string
  effect: (lv: number) => string
}[] = [
  {
    key: 'trainingCamp',
    name: '合宿施設',
    desc: '選手のレース獲得経験値を底上げする育成環境',
    color: C.green,
    effect: lv => `${lv === 1 ? 'レースEXP+' : '+'}${pct(facilityExpMultiplier(lv) - 1)}`,
  },
  {
    key: 'medicalCenter',
    name: '医療センター',
    desc: 'ハイレベルなスポーツ医学でコンディション管理を強化',
    color: C.cyan,
    effect: lv => `${lv === 1 ? '疲労-' : '-'}${pct(1 - facilityMedFatigueMultiplier(lv))}`,
  },
  {
    key: 'scoutOffice',
    name: 'スカウト拠点',
    desc: '有望選手を早期発掘し、獲得・移籍交渉を有利に運ぶ',
    color: C.orange,
    effect: lv => `${lv === 1 ? 'PT+' : '+'}${facilityScoutPoints(lv)}・${lv === 1 ? '成立+' : '+'}${pct(facilityScoutNegoBonus(lv))}`,
  },
  {
    key: 'tacticsRoom',
    name: '戦術分析室',
    desc: 'データ分析でレース中のペース配分とメンタルを最適化する',
    color: C.blue,
    effect: lv => lv === 1
      ? `レース時ペース+${facilityTacticsStatBonus(1)}・メンタル+${facilityTacticsStatBonus(1)}`
      : `+${facilityTacticsStatBonus(lv)}`,
  },
]

// 値段も上限も `utils/facilities` 1本（store の `upgradeFacility` と同じところから出す）
const UPGRADE_COSTS = FACILITY_UPGRADE_COSTS
const MAX_LV = FACILITY_MAX_LEVEL

export default function FacilitiesPage() {
  const clubs = useGameStore(s => s.clubs)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const upgradeFacility = useGameStore(s => s.upgradeFacility)
  const jewels = useGameStore(s => s.jewels)

  const myTeam = myClub({ clubs, playerTeamId })

  if (!myTeam) return null
  // ★施設は `facilitiesOf` を通す（格から出る土台＋自分で建てたぶん）
  const myFac = facilitiesOf(myTeam)

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader eyebrow="FACILITIES" title="施設強化" />

      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: F.label, color: C.textDim }}>所持ジュエル:</div>
          <JewelIcon size={14} />
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: '900', color: C.jewel, textShadow: `0 0 8px rgba(74,184,234,0.5)` }}>{jewels}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {FACILITY_META.map(f => {
          const currentLv = myFac[f.key]
          const nextCost = currentLv < MAX_LV ? UPGRADE_COSTS[currentLv] : null
          const canUpgrade = nextCost !== null && jewels >= nextCost

          return (
            <div key={f.key} style={panelStyle(currentLv > 0 ? f.color : alpha(f.color, 0.4))}>

              <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{
                  width: '48px', height: '48px', flexShrink: 0,
                  background: alpha(f.color, 0.12), border: `1px solid ${alpha(f.color, 0.28)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FacilityIconSVG facilityKey={f.key} color={f.color} size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontFamily: SAIRA, fontSize: F.title, fontWeight: '800', color: C.text }}>{f.name}</span>
                    {currentLv > 0 && (
                      <span style={{
                        fontFamily: SAIRA, padding: '2px 8px', fontSize: F.caption, fontWeight: '800',
                        background: alpha(f.color, 0.2), color: f.color, border: `1px solid ${alpha(f.color, 0.35)}`,
                      }}>Lv{currentLv}</span>
                    )}
                    {currentLv === 0 && (
                      <span style={{ fontFamily: SAIRA, padding: '2px 8px', fontSize: F.tiny, color: C.textGhost, background: C.surface, border: `1px solid ${C.border}` }}>未建設</span>
                    )}
                  </div>
                  <div style={{ fontSize: F.label, color: C.textDim, lineHeight: 1.4 }}>{f.desc}</div>
                </div>
              </div>

              <div style={{ padding: '0 16px 10px', display: 'flex', gap: '5px' }}>
                {[1, 2, 3, 4, 5].map(lv => (
                  <div key={lv} style={{
                    height: '4px', flex: 1,
                    background: currentLv >= lv ? f.color : C.surface,
                    transition: 'background-color 0.2s',
                  }}/>
                ))}
              </div>

              <div style={{ padding: '8px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: '5px' }}>
                {LEVELS.map(lv => (
                  <div key={lv} style={{
                    flex: 1, padding: '6px 3px', textAlign: 'center',
                    background: currentLv >= lv ? alpha(f.color, 0.12) : C.surface,
                    border: `1px solid ${currentLv >= lv ? alpha(f.color, 0.28) : C.border}`,
                  }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.micro, color: currentLv >= lv ? f.color : C.textGhost, fontWeight: '700', lineHeight: 1.35 }}>{`Lv${lv}: ${f.effect(lv)}`}</div>
                  </div>
                ))}
              </div>

              <div style={{ padding: '10px 14px 14px' }}>
                {currentLv >= MAX_LV ? (
                  <div style={{ textAlign: 'center', padding: '10px', fontFamily: SAIRA, fontSize: F.label, color: C.gold, fontWeight: '700', background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.22)}` }}>
                    MAX レベル達成
                  </div>
                ) : (
                  <GlassButton
                    full
                    color={f.color}
                    disabled={!canUpgrade}
                    style={{ gap: 8, fontFamily: SAIRA }}
                    onClick={() => upgradeFacility(f.key)}
                  >
                    <span>Lv{currentLv + 1}に強化</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: SAIRA, fontWeight: '900', color: canUpgrade ? C.jewel : C.textGhost, textShadow: canUpgrade ? `0 0 6px rgba(74,184,234,0.5)` : 'none' }}>— <JewelIcon size={12}/>{nextCost!}</span>
                    {!canUpgrade && nextCost && jewels < nextCost && (
                      <span style={{ fontSize: F.caption, opacity: 0.6 }}>（ジュエル不足）</span>
                    )}
                  </GlassButton>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
