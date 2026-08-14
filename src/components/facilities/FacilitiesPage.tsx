import PageHeader from '../ui/PageHeader'
import { useGameStore } from '../../store/gameStore'
import type { FacilityKey } from '../../types'
import { C, alpha, SAIRA, F } from '../../styles/tokens'
import { JewelIcon } from '../icons/Icons'
import { panelStyle } from '../ui/Panel'
import GlassButton from '../ui/GlassButton'


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

const FACILITY_META: {
  key: FacilityKey
  name: string
  desc: string
  color: string
  effects: string[]
}[] = [
  {
    key: 'trainingCamp',
    name: '合宿施設',
    desc: '選手のレース獲得経験値を底上げする育成環境',
    color: C.green,
    effects: ['Lv1: レースEXP+6%', 'Lv2: +12%', 'Lv3: +18%', 'Lv4: +24%', 'Lv5: +30%'],
  },
  {
    key: 'medicalCenter',
    name: '医療センター',
    desc: 'ハイレベルなスポーツ医学でコンディション管理を強化',
    color: C.cyan,
    effects: ['Lv1: 疲労-8%', 'Lv2: -16%', 'Lv3: -24%', 'Lv4: -32%', 'Lv5: -40%'],
  },
  {
    key: 'scoutOffice',
    name: 'スカウト拠点',
    desc: '有望選手を早期発掘し、獲得・移籍交渉を有利に運ぶ',
    color: C.orange,
    effects: ['Lv1: PT+1・成立+2%', 'Lv2: +2・+4%', 'Lv3: +3・+6%', 'Lv4: +4・+8%', 'Lv5: +5・+10%'],
  },
  {
    key: 'tacticsRoom',
    name: '戦術分析室',
    desc: 'データ分析でレース中のペース配分とメンタルを最適化する',
    color: C.blue,
    effects: ['Lv1: レース時ペース+1・メンタル+1', 'Lv2: +2', 'Lv3: +3', 'Lv4: +4', 'Lv5: +5'],
  },
]

const UPGRADE_COSTS = [100, 300, 500, 1000, 3000]
const MAX_LV = 5

export default function FacilitiesPage() {
  const teams = useGameStore(s => s.teams)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const upgradeFacility = useGameStore(s => s.upgradeFacility)
  const jewels = useGameStore(s => s.jewels)

  const myTeam = teams.find(t => t.id === playerTeamId)

  if (!myTeam) return null

  return (
    <div style={{ fontFamily: SAIRA, paddingBottom: '80px', minHeight: '100dvh' }}>
      <PageHeader eyebrow="FACILITIES" title="施設強化" />

      <div style={{ padding: '4px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ fontSize: F.label, color: C.textDim }}>所持ジュエル:</div>
          <JewelIcon size={14} />
          <div style={{ fontFamily: SAIRA, fontSize: F.sub, fontWeight: '900', color: '#6dd5fa', textShadow: `0 0 8px rgba(74,184,234,0.5)` }}>{jewels}</div>
        </div>
      </div>

      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {FACILITY_META.map(f => {
          const currentLv = myTeam.facilities?.[f.key] ?? 0
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
                {f.effects.map((eff, i) => (
                  <div key={i} style={{
                    flex: 1, padding: '6px 3px', textAlign: 'center',
                    background: currentLv > i ? alpha(f.color, 0.12) : C.surface,
                    border: `1px solid ${currentLv > i ? alpha(f.color, 0.28) : C.border}`,
                  }}>
                    <div style={{ fontFamily: SAIRA, fontSize: F.micro, color: currentLv > i ? f.color : C.textGhost, fontWeight: '700', lineHeight: 1.35 }}>{eff}</div>
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
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontFamily: SAIRA, fontWeight: '900', color: canUpgrade ? '#6dd5fa' : C.textGhost, textShadow: canUpgrade ? `0 0 6px rgba(74,184,234,0.5)` : 'none' }}>— <JewelIcon size={12}/>{nextCost!}</span>
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
