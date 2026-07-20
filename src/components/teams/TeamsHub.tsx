import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import { NAT_LABEL, natGeoRegion, GEO_REGION_ORDER, type GeoRegion } from '../../data/nationalities'
import Flag from '../ui/Flag'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type NatEntry = { code: Nationality; label: string; top: number }

// 代表チームに載せない国籍（実在国ではないバケツ）
const NON_NATION = new Set<string>(['FOREIGN', 'EUR'])

// アプリ共通の横長カード（歴代優勝・選手成績と同じ見た目）
function RowCard({ onClick, left, title, sub, right }: {
  onClick: () => void
  left?: React.ReactNode
  title: string
  sub?: string
  right?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="btn-press"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left',
        padding: '14px 16px', borderRadius: 12,
        background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
        border: `2px solid ${C.border2}`, color: C.text,
        boxShadow: '0 3px 0 #5a3500, inset 0 1px 0 rgba(255,255,255,0.06)',
        fontFamily: 'inherit',
      }}
    >
      {left && <div style={{ flexShrink: 0, display: 'flex' }}>{left}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SAIRA, fontSize: 16, fontWeight: 900, color: C.text }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      {right}
      <span style={{ color: C.textGhost, fontSize: 18, flexShrink: 0 }}>›</span>
    </button>
  )
}

function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) {
  return (
    <div style={{ padding: '12px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
      {onBack && (
        <button onClick={onBack} className="btn-press" style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
          background: C.surface2, border: `1px solid ${C.border2}`, color: C.text,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SAIRA,
        }}>‹</button>
      )}
      <div>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 2 }}>{eyebrow}</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>{title}</div>
      </div>
    </div>
  )
}

export default function TeamsHub() {
  const navigate = useNavigate()
  const { currentSeason, foreignLeagues, players } = useGameStore()
  const leagues = foreignLeagues ?? []
  const completedRaces = currentSeason.races.filter(r => r.results).length

  // section: 'root'(リーグ/代表) | 'leagues' | 'national'(地域一覧 or 国一覧)
  const [section, setSection] = useState<'root' | 'leagues' | 'national'>('root')
  const [region, setRegion] = useState<GeoRegion | null>(null)

  // 国籍ごとの最高OVR（実在国のみ）と、地域ごとの国リスト
  const { natByRegion } = useMemo(() => {
    const top = new Map<Nationality, number>()
    for (const p of players) {
      if (p.status === 'retired') continue
      const code = p.nationality as Nationality
      if (!code || NON_NATION.has(code)) continue
      const o = ovr(p)
      if (o > (top.get(code) ?? 0)) top.set(code, o)
    }
    const byRegion = new Map<GeoRegion, NatEntry[]>()
    for (const [code, t] of top) {
      const r = natGeoRegion(code)
      const arr = byRegion.get(r) ?? []
      arr.push({ code, label: NAT_LABEL[code] ?? code, top: t })
      byRegion.set(r, arr)
    }
    for (const arr of byRegion.values()) arr.sort((a, b) => b.top - a.top)
    return { natByRegion: byRegion }
  }, [players])

  const wrap = (children: React.ReactNode) => (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>
      {children}
    </div>
  )
  const list = (children: React.ReactNode) => (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  )

  // ── ルート：リーグ / 代表 ──
  if (section === 'root') {
    return wrap(<>
      <Header eyebrow={`${currentSeason.year} TEAMS`} title="チーム" />
      {list(<>
        <RowCard onClick={() => setSection('leagues')} title="リーグ" sub={`JPEL・ECL・海外${leagues.length}リーグの順位表`} />
        <RowCard onClick={() => { setSection('national'); setRegion(null) }} title="代表" sub="地域・国別の代表チーム" />
      </>)}
    </>)
  }

  // ── リーグ（従来のハブ） ──
  if (section === 'leagues') {
    return wrap(<>
      <Header eyebrow={`${currentSeason.year} STANDINGS`} title="リーグ" onBack={() => setSection('root')} />
      {list(<>
        <RowCard onClick={() => navigate('/teams/jpel')} left={<LeagueLogoSVG leagueId="jpel" size={34} />} title="JPEL" sub={`国内リーグ • ${completedRaces}戦消化`} />
        <RowCard onClick={() => navigate('/teams/ecl')} left={<LeagueLogoSVG leagueId="ecl" size={34} />} title="ECL" sub="エキデン・チャンピオンズリーグ" />
        {leagues.map(l => (
          <RowCard key={l.id} onClick={() => navigate(`/teams/foreign/${l.id}`)} left={<LeagueLogoSVG leagueId={l.id} size={34} />} title={l.countryName} sub={`${l.name} • ${l.clubs.length}クラブ`} />
        ))}
      </>)}
    </>)
  }

  // ── 代表：地域一覧 ──
  if (section === 'national' && region == null) {
    return wrap(<>
      <Header eyebrow="NATIONAL TEAMS" title="代表" onBack={() => setSection('root')} />
      {list(GEO_REGION_ORDER.filter(r => natByRegion.has(r)).map(r => {
        const arr = natByRegion.get(r) ?? []
        return <RowCard key={r} onClick={() => setRegion(r)} title={r} sub={`${arr.length}か国`} />
      }))}
    </>)
  }

  // ── 代表：地域内の国一覧 ──
  const arr = region ? (natByRegion.get(region) ?? []) : []
  return wrap(<>
    <Header eyebrow="NATIONAL TEAMS" title={region ?? '代表'} onBack={() => setRegion(null)} />
    {list(arr.map(n => (
      <RowCard
        key={n.code}
        onClick={() => navigate(`/teams/national/${n.code}`)}
        left={<Flag code={n.code} width={30} />}
        title={n.label}
        right={<div style={{ textAlign: 'right', marginRight: 2 }}>
          <div style={{ fontSize: 8, color: C.textDim }}>最高</div>
          <div style={{ fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{n.top}</div>
        </div>}
      />
    )))}
  </>)
}
