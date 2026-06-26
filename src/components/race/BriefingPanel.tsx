import type { Player, Race } from '../../types'
import { C, alpha } from '../../styles/tokens'
import { FORM_LABELS } from '../../utils/playerUtils'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export function BriefingPanel({ race, assignedPlayers }: {
  race: Race
  assignedPlayers: Player[]
}) {
  if (assignedPlayers.length === 0) return null

  type Item = { color: string; text: string }
  const items: Item[] = []

  const highFatigue = assignedPlayers.filter(p => p.fatigue >= 70)
  if (highFatigue.length > 0) items.push({ color: C.red, text: `疲労高: ${highFatigue.map(p => p.name).join('・')}` })

  const injured = assignedPlayers.filter(p => p.status === 'injured')
  if (injured.length > 0) items.push({ color: C.red, text: `負傷出場: ${injured.map(p => p.name).join('・')} — リスクあり` })

  const greatForm = assignedPlayers.filter(p => Math.round(p.form ?? 0) === 2)
  if (greatForm.length > 0) items.push({ color: '#FFB800', text: `${FORM_LABELS[2]}: ${greatForm.map(p => p.name).join('・')} — ピークパフォ期待` })

  const goodForm = assignedPlayers.filter(p => Math.round(p.form ?? 0) === 1)
  if (goodForm.length > 0) items.push({ color: C.green, text: `${FORM_LABELS[1]}: ${goodForm.map(p => p.name).join('・')}` })

  const badForm = assignedPlayers.filter(p => (p.form ?? 0) <= -1)
  if (badForm.length > 0) items.push({ color: C.orange, text: `不調: ${badForm.map(p => p.name).join('・')}` })

  const expiringContracts = assignedPlayers.filter(p => p.contract.yearsLeft <= 1)
  if (expiringContracts.length > 0) items.push({ color: C.textDim, text: `今季FA: ${expiringContracts.map(p => p.name).join('・')} — 契約更新を検討` })

  const hasMountain = race.segments.some(s => s.uphillPct >= 30 || s.downhillPct >= 30)
  const hasSprint = race.segments.some(s => s.uphillPct < 10 && s.downhillPct < 10 && s.distanceKm <= 10)

  if (hasMountain) {
    const mtAce = assignedPlayers.filter(p => p.traits?.includes('mountain_ace'))
    if (mtAce.length > 0) items.push({ color: C.green, text: `山岳特化 の出番: ${mtAce.map(p => p.name).join('・')}` })
  }
  if (hasSprint) {
    const burst = assignedPlayers.filter(p => p.traits?.includes('sprint_burst'))
    if (burst.length > 0) items.push({ color: C.pink, text: `切れ味抜群 が活躍: ${burst.map(p => p.name).join('・')}` })
  }

  if (items.length === 0) return null

  return (
    <div style={{
      margin: '4px 12px 8px',
      padding: '10px 14px',
      borderRadius: 14,
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `2px solid ${C.goldDark}`,
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
      fontFamily: SAIRA,
    }}>
      <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.gold, 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />
      <div style={{
        fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px',
        textShadow: '-1px -1px 0 #061224,1px -1px 0 #061224,-1px 1px 0 #061224,1px 1px 0 #061224',
      }}>
        試合前ブリーフィング
      </div>
      {items.map(({ color, text }, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '5px 0',
          borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none',
        }}>
          <div style={{ width: '3px', borderRadius: '2px', alignSelf: 'stretch', flexShrink: 0, backgroundColor: color }}/>
          <div style={{ fontSize: '10px', color: C.textSub, lineHeight: 1.5 }}>{text}</div>
        </div>
      ))}
    </div>
  )
}
