import { useState, useEffect } from 'react'
import { C, alpha } from '../../styles/tokens'
import { terrainColor, terrainLabel } from './raceUtils'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type StoredChoiceData = {
  event: {
    id: string
    type: string
    situation: string
    battleContext: string
    choices: { id: string; text: string; lowStaminaText?: string }[]
  }
  segIdx: number
  segDistanceKm: number
  segUphillPct: number
  segDownhillPct: number
  lowStaminaHint: boolean
}

export default function RaceChoicePage() {
  const [data, setData] = useState<StoredChoiceData | null>(null)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem('race_pending_event')
    if (raw) {
      try { setData(JSON.parse(raw)) } catch { /* ignore */ }
    }
    // If data appears after mount
    function onStorage(e: StorageEvent) {
      if (e.key === 'race_pending_event' && e.newValue) {
        try { setData(JSON.parse(e.newValue)) } catch { /* ignore */ }
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function handleChoice(i: number) {
    if (selected !== null || !data) return
    setSelected(i)
    localStorage.setItem('race_choice_result', JSON.stringify({ choiceIdx: i, eventId: data.event.id }))
    setTimeout(() => window.close(), 400)
  }

  const segCol = data
    ? terrainColor(data.segUphillPct, data.segDownhillPct)
    : C.blue

  if (!data) {
    return (
      <div style={{
        minHeight: '100svh', background: C.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SAIRA, color: C.textGhost, fontSize: 13,
      }}>
        データ読み込み中...
      </div>
    )
  }

  const { event, segIdx, segDistanceKm, segUphillPct, segDownhillPct, lowStaminaHint } = data

  return (
    <div style={{
      minHeight: '100svh', background: C.bg,
      fontFamily: SAIRA, padding: '16px 12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${segCol}, ${alpha(segCol, 0.5)})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 900, color: C.bg,
        }}>
          {segIdx}
        </div>
        <div>
          <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 2 }}>
            {terrainLabel(segUphillPct, segDownhillPct, segDistanceKm)} · {segDistanceKm.toFixed(1)}km
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: segCol }}>{event.type}</div>
        </div>
      </div>

      {/* Event card */}
      <div style={{
        borderRadius: 16,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${alpha(segCol, 0.5)}`,
        position: 'relative', overflow: 'hidden',
        boxShadow: `0 4px 0 ${alpha(segCol, 0.22)}, 0 6px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}>
        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(segCol, 0.15)}`, borderRadius: 12, pointerEvents: 'none' }}/>

        <div style={{ padding: '16px 16px 14px', position: 'relative' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.55, marginBottom: 8 }}>
            {event.situation}
          </div>
          <div style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>
            {event.battleContext}
          </div>
        </div>

        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${alpha(segCol, 0.3)}, transparent)` }}/>

        <div style={{ padding: '10px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
          {event.choices.map((choice, i) => {
            const label = ['A', 'B', 'C'][i]
            const isLowAlt = lowStaminaHint && !!choice.lowStaminaText
            const displayText = isLowAlt ? choice.lowStaminaText! : choice.text
            const isSelected = selected === i
            const isDimmed = selected !== null && selected !== i
            return (
              <button
                key={choice.id}
                onClick={() => handleChoice(i)}
                disabled={selected !== null}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 14px', borderRadius: 12,
                  cursor: selected !== null ? 'default' : 'pointer',
                  fontFamily: 'inherit',
                  background: isSelected
                    ? `linear-gradient(180deg, ${alpha(segCol, 0.25)}, ${alpha(segCol, 0.1)})`
                    : `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  border: `2px solid ${isSelected ? segCol : isLowAlt ? alpha(C.red, 0.4) : C.border}`,
                  boxShadow: isSelected
                    ? `0 0 16px ${alpha(segCol, 0.5)}, 0 3px 0 rgba(0,0,0,0.35)`
                    : `0 3px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
                  textAlign: 'left',
                  opacity: isDimmed ? 0.35 : 1,
                  transition: 'opacity 0.25s, border-color 0.15s, box-shadow 0.15s, background 0.15s',
                }}
              >
                <div style={{
                  width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                  background: isSelected ? alpha(segCol, 0.3) : isLowAlt ? alpha(C.red, 0.12) : alpha(segCol, 0.12),
                  border: `1px solid ${isSelected ? segCol : isLowAlt ? alpha(C.red, 0.4) : alpha(segCol, 0.35)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 900, color: isLowAlt ? C.red : segCol,
                }}>
                  {label}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: isLowAlt ? alpha(C.red, 0.85) : C.text, lineHeight: 1.4 }}>
                  {displayText}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
