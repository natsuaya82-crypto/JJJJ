import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import { NAT_LABEL, natGeoRegion, natFlag, GEO_REGION_ORDER, type GeoRegion } from '../../data/nationalities'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type HubCard = { key: string; path: string; label: string; desc: string; icon: React.ReactNode }
type NatCard = { code: Nationality; label: string; flag: string; count: number; top: number }
type RegionGroup = { region: GeoRegion; nations: NatCard[]; top: number }

// 代表チームに載せない国籍（実在国ではないバケツ）
const NON_NATION = new Set<string>(['FOREIGN', 'EUR'])

export default function TeamsHub() {
  const navigate = useNavigate()
  const { currentSeason, foreignLeagues, players } = useGameStore()
  const leagues = foreignLeagues ?? []
  const completedRaces = currentSeason.races.filter(r => r.results).length
  const [tab, setTab] = useState<'league' | 'national'>('league')
  const [openRegions, setOpenRegions] = useState<Set<GeoRegion>>(new Set())
  const toggleRegion = (r: GeoRegion) => setOpenRegions(prev => {
    const next = new Set(prev)
    next.has(r) ? next.delete(r) : next.add(r)
    return next
  })

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

  // 代表チーム：全 active 選手を国籍でグルーピングし、さらに地域でまとめる（バケツ国籍は除外）
  const regionGroups: RegionGroup[] = useMemo(() => {
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
    const cards: NatCard[] = Array.from(by.entries())
      .map(([code, v]) => ({ code, label: NAT_LABEL[code] ?? code, flag: natFlag(code), count: v.count, top: v.top }))

    const byRegion = new Map<GeoRegion, NatCard[]>()
    for (const c of cards) {
      const r = natGeoRegion(c.code)
      const arr = byRegion.get(r) ?? []
      arr.push(c)
      byRegion.set(r, arr)
    }
    return GEO_REGION_ORDER
      .filter(r => byRegion.has(r))
      .map(region => {
        const nations = (byRegion.get(region) ?? []).sort((a, b) => b.top - a.top || b.count - a.count)
        return { region, nations, top: nations[0]?.top ?? 0 }
      })
  }, [players])

  const totalNations = regionGroups.reduce((s, g) => s + g.nations.length, 0)

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
          <div style={{ fontSize: 10, color: C.textDim, marginBottom: 8, paddingLeft: 4 }}>{regionGroups.length}地域 • 全 {totalNations} 代表（地域をタップで展開）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {regionGroups.map(g => {
              const open = openRegions.has(g.region)
              return (
                <div key={g.region}>
                  {/* 地域ヘッダー */}
                  <button
                    onClick={() => toggleRegion(g.region)}
                    className="btn-press"
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                      background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                      border: `2px solid ${C.goldDark}`,
                      display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'inherit', textAlign: 'left',
                    } as React.CSSProperties}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.gold, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                    <span style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text, flex: 1 }}>{g.region}</span>
                    <span style={{ fontSize: 10, color: C.textDim }}>{g.nations.length}か国</span>
                  </button>

                  {/* 展開時：国リスト */}
                  {open && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', margin: '6px 0 2px 10px' }}>
                      {g.nations.map(n => (
                        <button
                          key={n.code}
                          onClick={() => navigate(`/teams/national/${n.code}`)}
                          className="btn-press"
                          style={{
                            width: '100%', padding: '10px 12px', borderRadius: 11, cursor: 'pointer',
                            background: C.surface2, border: `1px solid ${C.border}`,
                            display: 'flex', alignItems: 'center', gap: 11, fontFamily: 'inherit', textAlign: 'left',
                          } as React.CSSProperties}
                        >
                          <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{n.flag}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '14px', fontWeight: '800', color: C.text }}>{n.label}</div>
                            <div style={{ fontSize: '10px', color: C.textDim }}>{n.count}名</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 8, color: C.textDim }}>最高</div>
                            <div style={{ fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{n.top}</div>
                          </div>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
