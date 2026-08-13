import { useEffect, useState } from 'react'
import { TeamLogoSVG } from '../icons/Icons'
import { RankChip, RatedShell } from './ratedUi'
import { fetchStandings, type RatedRow } from '../../lib/ratedApi'
import { C, alpha, SAIRA } from '../../styles/tokens'

// 大会全体の順位表（レート順）。**別ページ**。
export default function RatedStandingsPage() {
  const [rows, setRows] = useState<RatedRow[] | null>(null)
  useEffect(() => { void fetchStandings().then(setRows) }, [])
  if (!rows) return null

  return (
    <RatedShell title="順位表">
      <div style={{ borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        {rows.map((r, i) => (
          <div key={r.userId} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
            background: r.mine ? alpha(C.gold, 0.14) : C.surface2,
            borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ width: 22, textAlign: 'center', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>{i + 1}</span>
            <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.teamName} teamId={r.userId} size={24} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
              <div style={{ fontSize: 9, color: C.textDim }}>GM {r.gmName}</div>
            </div>
            <RankChip rating={r.rating} size="sm" />
            <span style={{ width: 38, textAlign: 'right', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.text, flexShrink: 0 }}>{r.rating}</span>
          </div>
        ))}
      </div>
    </RatedShell>
  )
}
