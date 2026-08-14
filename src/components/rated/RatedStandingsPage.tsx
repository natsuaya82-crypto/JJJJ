import { useEffect, useState } from 'react'
import { TeamLogoSVG } from '../icons/Icons'
import { RankChip, RatedShell } from './ratedUi'
import { fetchStandings, STANDINGS_TOP, type RatedRow, type RatedStandings } from '../../lib/ratedApi'
import { C, alpha, SAIRA } from '../../styles/tokens'

// 大会全体の順位表。**トップ100と自分だけ**（オーナー判断）。
function Row({ r, rank }: { r: RatedRow; rank: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px',
      background: r.mine ? alpha(C.gold, 0.14) : C.surface2,
      borderBottom: `1px solid ${C.border}`,
    }}>
      <span style={{ width: 26, textAlign: 'center', fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.textDim, flexShrink: 0 }}>{rank}</span>
      <TeamLogoSVG primary={r.primary} secondary={r.secondary} shortName={r.teamName} teamId={r.userId} size={24} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.teamName}</div>
        <div style={{ fontSize: 9, color: C.textDim }}>GM {r.gmName}</div>
      </div>
      <RankChip rating={r.rating} size="sm" />
      <span style={{ width: 38, textAlign: 'right', fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: C.text, flexShrink: 0 }}>{r.rating}</span>
    </div>
  )
}

export default function RatedStandingsPage() {
  const [st, setSt] = useState<RatedStandings | null>(null)
  useEffect(() => { void fetchStandings().then(setSt) }, [])
  if (!st) return null

  const inTop = st.meRank > 0 && st.meRank <= STANDINGS_TOP

  return (
    <RatedShell title="順位表">
      <div style={{overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: 10 }}>
        {st.top.map((r, i) => <Row key={r.userId} r={r} rank={i + 1} />)}
      </div>

      {/* トップ100に入っていないときだけ、自分の行を下に足す */}
      {st.me && !inTop && (
        <div style={{overflow: 'hidden', border: `1px solid ${alpha(C.gold, 0.4)}` }}>
          <Row r={st.me} rank={st.meRank} />
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 8, fontFamily: SAIRA, fontSize: 10, color: C.textDim }}>
        {st.entrants}人が参加中
      </div>
    </RatedShell>
  )
}
