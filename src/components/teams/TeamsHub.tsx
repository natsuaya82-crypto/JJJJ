import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import { NAT_LABEL } from '../../data/nationalities'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type HubCard = { key: string; path: string; label: string; desc: string; icon: React.ReactNode }
type NatCard = { code: Nationality; label: string; count: number; top: number }

// 代表チームに載せない国籍（実在国ではないバケツ）
const NON_NATION = new Set<string>(['FOREIGN', 'EUR'])

export default function TeamsHub() {
  const navigate = useNavigate()
  const { currentSeason, foreignLeagues, players } = useGameStore()
  const leagues = foreignLeagues ?? []
  const completedRaces = currentSeason.races.filter(r => r.results).length
  const [tab, setTab] = useState<'league' | 'national'>('league')

  const cards: HubCard[] = [
    {
      key: 'jpel', path: '/teams/jpel', label: 'JPEL', desc: `国内リーグ • ${completedRaces}戦消化`,
      icon: <LeagueLogoSVG leagueId="jpel" size={40} />,
    },
    {
      key: 'ecl', path: '/teams/ecl', label: 'ECL', desc: 'エキデン・チャンピオンズリーグ',
      icon: <LeagueLogoSVG leagueId="ecl" size={40} />,
    },
    ...leagues.map(l => ({
      key: l.id, path: `/teams/foreign/${l.id}`, label: l.countryName,
      desc: `${l.name} • ${l.clubs.length}クラブ`,
      icon: <LeagueLogoSVG leagueId={l.id} size={40} />,
    })),
  ]

  // 代表チーム：全 active 選手を国籍でグルーピング（バケツ国籍は除外）
  const natCards: NatCard[] = useMemo(() => {
    const by = new Map<Nationality, { count: number; top: number }>()
    for (const p of players) {
      if (p.status === 'retired') continue
      const code = p.nationality as Nationality
      if (!code || NON_NATION.has(code)) continue
      const cur = by.get(code) ?? { count: 0, top: 0 }
      cur.count += 1
      const o = ovr(p)
      if (o > cur.top) cur.top = o
      by.set(code, cur)
    }
    return Array.from(by.entries())
      .map(([code, v]) => ({ code, label: NAT_LABEL[code] ?? code, count: v.count, top: v.top }))
      .sort((a, b) => b.top - a.top || b.count - a.count)
  }, [players])

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 10px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>{currentSeason.year} TEAMS</div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>チーム</div>
      </div>

      {/* リーグ / 代表 セグメント */}
      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
        {([['league', 'リーグ'], ['national', '代表']] as const).map(([key, label]) => {
          const active = tab === key
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="btn-press"
              style={{
                flex: 1, padding: '9px 0', borderRadius: 11, cursor: 'pointer',
                fontFamily: SAIRA, fontSize: 14, fontWeight: 900, letterSpacing: 1,
                color: active ? '#1A1206' : C.textDim,
                background: active ? `linear-gradient(180deg, ${C.gold}, ${C.goldDark})` : C.surface2,
                border: `2px solid ${active ? C.goldDark : C.border}`,
                boxShadow: active ? '0 3px 0 #5a3500' : 'none',
              } as React.CSSProperties}
            >
              {label}
            </button>
          )
        })}
      </div>

      {tab === 'league' ? (
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cards.map(s => (
            <button
              key={s.key}
              onClick={() => navigate(s.path)}
              className="btn-press"
              style={{
                width: '100%', padding: '13px 14px', borderRadius: 14, cursor: 'pointer',
                background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                border: `2px solid ${C.goldDark}`,
                boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                display: 'flex', alignItems: 'center', gap: 12,
                fontFamily: 'inherit', position: 'relative', overflow: 'hidden',
              } as React.CSSProperties}
            >
              <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
              <div style={{ flexShrink: 0, position: 'relative', zIndex: 1, display: 'flex' }}>{s.icon}</div>
              <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '800', color: C.text, marginBottom: '2px' }}>{s.label}</div>
                <div style={{ fontSize: '10px', color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 8, paddingLeft: 4 }}>全 {natCards.length} 代表 • 国籍別の選手を表示</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {natCards.map((n, i) => (
              <button
                key={n.code}
                onClick={() => navigate(`/teams/national/${n.code}`)}
                className="btn-press"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12, cursor: 'pointer',
                  background: C.surface2, border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', gap: 12, fontFamily: 'inherit', textAlign: 'left',
                } as React.CSSProperties}
              >
                <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: C.textDim, width: 22, textAlign: 'center' }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '800', color: C.text }}>{n.label}</div>
                  <div style={{ fontSize: '10px', color: C.textDim }}>{n.count}名</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 8, color: C.textDim }}>最高</div>
                  <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{n.top}</div>
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
