import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { ovr, faMarketSalary, SPEC_COLOR } from '../../utils/playerUtils'
import { SPECIALTY_LABELS } from '../../types'
import PlayerFace from '../player/PlayerFace'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"
const HIGH_OVR = 65

function fmt(yen: number) {
  if (yen >= 100000000) return `${(yen / 100000000).toFixed(1)}億`
  return `${Math.round(yen / 10000)}万`
}

const CAT_COLOR: Record<string, string> = {
  race: C.gold, fa: C.cyan, draft: C.green, trade: C.orange,
  college: C.textSub, injury: C.red, finance: C.blue,
}
const CAT_LABEL: Record<string, string> = {
  race: 'RACE', fa: 'FA', draft: 'DRAFT', trade: 'TRADE',
  college: 'COLLEGE', injury: 'INJURY', finance: 'FINANCE',
}
const CAT_ICON: Record<string, React.ReactNode> = {
  race: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M13 4a1 1 0 100-2 1 1 0 000 2z" fill="currentColor"/><path d="M5.5 20l3-6 3 3 3-5 3.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 20h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  fa: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.8"/><path d="M3 20c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><path d="M17 14l4 4-4 4M21 18h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  draft: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M14 2v6h6M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  trade: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 16V4m0 0L3 8m4-4l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  college: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 3L2 9l10 6 10-6-10-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M2 9v6M7 12v5c0 1.7 2.2 3 5 3s5-1.3 5-3v-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
  injury: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
  finance: <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 7v1m0 8v1M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 1.5-1 2-2.5 2.5S9 13.5 9 15s1.1 2 3 2 3-1 3-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>,
}
const DEFAULT_ICON = <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>

export default function NewsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const newsFeed  = useGameStore(s => s.currentSeason.newsFeed)
  const players   = useGameStore(s => s.players)
  const teams     = useGameStore(s => s.teams)

  const initCat = (location.state as { cat?: string } | null)?.cat ?? 'all'
  const [filter, setFilter] = useState<string>(initCat)

  const presentCats = [...new Set(newsFeed.map(n => n.category))]
  const filtered = filter === 'all' ? newsFeed : newsFeed.filter(n => n.category === filter)

  const selStyle: React.CSSProperties = {
    background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 8,
    color: filter === 'all' ? C.textDim : CAT_COLOR[filter] ?? C.textSub,
    fontSize: 11, fontWeight: 700, fontFamily: SAIRA, padding: '4px 8px',
    cursor: 'pointer', outline: 'none',
  }

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textSub, fontSize: 13, padding: 0, fontFamily: SAIRA }}>
            &larr;
          </button>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>ニュース</span>
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={selStyle}>
          <option value="all">すべて</option>
          {presentCats.map(cat => (
            <option key={cat} value={cat}>{CAT_LABEL[cat] ?? cat.toUpperCase()}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textGhost, fontSize: 13, background: C.surface2, border: `1px solid ${C.border2}`, borderRadius: 12 }}>
            ニュースなし
          </div>
        ) : filtered.map((news, i) => {
          const col = CAT_COLOR[news.category] ?? C.textDim
          const isTransfer = news.category === 'trade' || news.category === 'fa'
          const relPlayer = isTransfer && news.relatedIds.length > 0
            ? players.find(p => p.id === news.relatedIds[0])
            : undefined
          const relOvr = relPlayer ? ovr(relPlayer) : 0
          const showDetail = !!relPlayer && (relOvr >= HIGH_OVR || !!news.major)
          const fromTeam = news.fromTeamId ? teams.find(t => t.id === news.fromTeamId) : undefined
          const toTeam = news.toTeamId ? teams.find(t => t.id === news.toTeamId) : undefined

          if (showDetail && relPlayer) {
            const team = teams.find(t => t.id === relPlayer.teamId)
            const specCol = SPEC_COLOR[relPlayer.specialty]
            const salary = relPlayer.contract.annualSalary
            const market = faMarketSalary(relPlayer)
            const isFA = !relPlayer.teamId

            return (
              <div key={i} style={{
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: news.major ? `2px solid ${C.gold}` : `2px solid ${alpha(col, 0.55)}`, borderRadius: 14,
                boxShadow: news.major
                  ? `0 4px 0 #5a3500, 0 6px 22px ${alpha(C.gold, 0.28)}, inset 0 1px 0 rgba(255,255,255,0.08)`
                  : `0 4px 0 #2a1800, 0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`,
                overflow: 'hidden',
              }}>
                {/* Top row */}
                <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: `1px solid ${alpha(col, 0.18)}` }}>
                  <div style={{ width: 28, height: 28, flexShrink: 0, background: `linear-gradient(180deg, ${C.surface3} 0%, #0f2440 100%)`, border: `1px solid ${alpha(col, 0.4)}`, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>
                    {CAT_ICON[news.category] ?? DEFAULT_ICON}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                      {news.major && <span style={{ fontFamily: SAIRA, fontSize: 8, fontWeight: 900, letterSpacing: '0.1em', color: '#111', background: `linear-gradient(180deg, ${C.goldHi ?? C.gold}, ${C.gold})`, padding: '1px 6px', borderRadius: 4 }}>大ニュース</span>}
                      <div style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: col }}>
                        {CAT_LABEL[news.category]}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{news.headline}</div>
                  </div>
                  <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, flexShrink: 0 }}>{news.date.slice(5)}</div>
                </div>

                {/* Player detail card */}
                <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 44, flexShrink: 0, overflow: 'hidden', borderRadius: 8, background: alpha(col, 0.08), border: `1px solid ${alpha(col, 0.2)}` }}>
                    <PlayerFace playerId={relPlayer.id} nationality={relPlayer.nationality} size={44} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: SAIRA }}>{relPlayer.name}</span>
                      {relPlayer.nationality === 'FOREIGN' && (
                        <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 4, background: alpha('#6B7BE8', 0.15), color: '#6B7BE8', border: '1px solid #6B7BE830', fontWeight: 700 }}>海外</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: specCol, fontFamily: SAIRA }}>{SPECIALTY_LABELS[relPlayer.specialty]}</span>
                      <span style={{ fontSize: 10, color: C.textDim }}>{relPlayer.age}歳</span>
                      {(fromTeam || toTeam) ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.textSub, fontWeight: 700 }}>
                          <span>{fromTeam ? fromTeam.shortName : (isFA ? 'FA' : '—')}</span>
                          <span style={{ color: C.gold }}>→</span>
                          <span style={{ color: C.gold }}>{toTeam ? toTeam.shortName : '—'}</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: C.textDim }}>
                          {isFA ? 'FA中' : team ? team.shortName : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{
                      fontFamily: SAIRA, fontSize: 26, fontWeight: 900, lineHeight: 1,
                      background: relOvr >= 80
                        ? `linear-gradient(180deg, ${C.goldHi}, ${C.gold})`
                        : `linear-gradient(180deg, ${C.textSub}, ${C.textDim})`,
                      WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                    }}>{relOvr}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim, letterSpacing: '1px' }}>OVR</div>
                    <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, fontWeight: 700, marginTop: 2 }}>
                      {news.category === 'fa' ? fmt(market) : fmt(salary)}
                    </div>
                    <div style={{ fontFamily: SAIRA, fontSize: 8, color: C.textDim }}>
                      {news.category === 'fa' ? '市場年俸' : '年俸'}
                    </div>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={i} style={{
              background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
              border: `2px solid ${C.goldDark}`, borderRadius: 12, padding: 10,
              display: 'flex', alignItems: 'center', gap: 10,
              boxShadow: `0 3px 0 #5a3500, 0 5px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            }}>
              <div style={{ width: 36, height: 36, flexShrink: 0, background: `linear-gradient(180deg, ${C.surface3} 0%, #0f2440 100%)`, border: `1px solid ${alpha(col, 0.4)}`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: col }}>
                {CAT_ICON[news.category] ?? DEFAULT_ICON}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SAIRA, fontSize: 9, fontWeight: 900, letterSpacing: '0.14em', color: col, marginBottom: 2 }}>
                  {CAT_LABEL[news.category] ?? news.category.toUpperCase()}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text, lineHeight: 1.45 }}>{news.headline}</div>
              </div>
              <div style={{ fontFamily: SAIRA, fontSize: 10, fontWeight: 700, color: C.textDim, flexShrink: 0 }}>{news.date.slice(5)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
