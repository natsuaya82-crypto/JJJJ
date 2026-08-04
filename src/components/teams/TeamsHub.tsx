import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C } from '../../styles/tokens'
import { ovr } from '../../utils/playerUtils'
import { NAT_LABEL, natGeoRegion, GEO_REGION_ORDER, type GeoRegion } from '../../data/nationalities'
import Flag from '../ui/Flag'
import BackButton from '../ui/BackButton'
import { NationalTeamRoster } from './NationalTeamDetailPage'
import type { Nationality } from '../../types'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type NatEntry = { code: Nationality; label: string; top: number }


// 移籍市場と同じ金枠カード。説明文は出さない（タイトルのみ）。
function RowCard({ onClick, icon, title, right }: {
  onClick: () => void
  icon?: React.ReactNode
  title: string
  right?: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="btn-press"
      style={{
        width: '100%', padding: '12px 14px', borderRadius: 14,
        background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
        border: `2px solid ${C.goldDark}`,
        boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
        display: 'flex', alignItems: 'center', gap: 12,
        fontFamily: 'inherit', cursor: 'pointer', position: 'relative', overflow: 'hidden',
      } as React.CSSProperties}
    >
      <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }} />
      {icon && (
        <div style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0, position: 'relative', zIndex: 1,
          background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)', border: `2px solid ${C.bg}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
        }}>{icon}</div>
      )}
      {/* アイコン無しカードも同じ高さに揃える（minHeight=アイコンと同じ40px） */}
      <div style={{ flex: 1, textAlign: 'left', position: 'relative', zIndex: 1, minHeight: 40, display: 'flex', alignItems: 'center' }}>
        <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.text }}>{title}</span>
      </div>
      {right && <div style={{ position: 'relative', zIndex: 1 }}>{right}</div>}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}>
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

// 戻るは「‹ タイトル」の横並び（記録室と同じ流儀）。タイトルは矢印のすぐ横に置く
function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) {
  if (!onBack) {
    return (
      <div style={{ padding: '12px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 2 }}>{eyebrow}</div>
        <div style={{ fontFamily: SAIRA, fontSize: 22, fontWeight: 900, color: C.text }}>{title}</div>
      </div>
    )
  }
  return (
    <div style={{ padding: '8px 8px 10px', display: 'flex', alignItems: 'center', gap: 2 }}>
      <BackButton onClick={onBack} />
      <div style={{ fontFamily: SAIRA, fontSize: 19, fontWeight: 900, color: C.text }}>{title}</div>
    </div>
  )
}

export default function TeamsHub() {
  const navigate = useNavigate()
  const { currentSeason, foreignLeagues, players } = useGameStore()
  const leagues = foreignLeagues ?? []

  // 画面の階層はURLクエリで持つ（履歴に載せる）。リーグ詳細等から戻ったとき
  // 「チームのルート」でなく直前の一覧（リーグ一覧・国一覧）に戻れるようにするため。
  const [searchParams] = useSearchParams()
  const section = (searchParams.get('s') as 'leagues' | 'national' | null) ?? 'root'
  const region = searchParams.get('r') as GeoRegion | null
  const code = searchParams.get('c') as Nationality | null
  const goSection = (s: 'leagues' | 'national') => navigate(`/teams?s=${s}`)
  const goRegion = (r: GeoRegion) => navigate(`/teams?s=national&r=${encodeURIComponent(r)}`)
  const goCode = (c: Nationality) => navigate(`/teams?s=national&r=${encodeURIComponent(region ?? '')}&c=${c}`)

  const natByRegion = useMemo(() => {
    const top = new Map<Nationality, number>()
    for (const p of players) {
      if (p.status === 'retired') continue
      const c = p.nationality as Nationality
      if (!c) continue
      const o = ovr(p)
      if (o > (top.get(c) ?? 0)) top.set(c, o)
    }
    const byRegion = new Map<GeoRegion, NatEntry[]>()
    for (const [c, t] of top) {
      const r = natGeoRegion(c)
      const arr = byRegion.get(r) ?? []
      arr.push({ code: c, label: NAT_LABEL[c] ?? c, top: t })
      byRegion.set(r, arr)
    }
    for (const arr of byRegion.values()) arr.sort((a, b) => b.top - a.top)
    return byRegion
  }, [players])

  const wrap = (children: React.ReactNode) => (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 90, background: C.bg, minHeight: '100dvh' }}>{children}</div>
  )
  const listBox = (children: React.ReactNode) => (
    <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
  )

  // 代表：国ロスター（インライン）→ 戻ると国一覧へ（履歴で戻る）
  if (section === 'national' && code) {
    return wrap(<NationalTeamRoster code={code} onBack={() => navigate(-1)} />)
  }

  // 代表：地域内の国一覧
  if (section === 'national' && region) {
    const arr = natByRegion.get(region) ?? []
    return wrap(<>
      <Header eyebrow="NATIONAL TEAMS" title={region} onBack={() => navigate(-1)} />
      {listBox(arr.map(n => (
        <RowCard
          key={n.code}
          onClick={() => goCode(n.code)}
          icon={<Flag code={n.code} width={30} />}
          title={n.label}
          right={<div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 8, color: C.textDim }}>最高</div>
            <div style={{ fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: C.gold, lineHeight: 1 }}>{n.top}</div>
          </div>}
        />
      )))}
    </>)
  }

  // 代表：地域一覧
  if (section === 'national') {
    return wrap(<>
      <Header eyebrow="NATIONAL TEAMS" title="代表" onBack={() => navigate(-1)} />
      {listBox(GEO_REGION_ORDER.filter(r => natByRegion.has(r)).map(r => (
        <RowCard key={r} onClick={() => goRegion(r)} title={r} />
      )))}
    </>)
  }

  // リーグ（従来のハブ）
  if (section === 'leagues') {
    return wrap(<>
      <Header eyebrow={`${currentSeason.year} STANDINGS`} title="リーグ" onBack={() => navigate(-1)} />
      {listBox(<>
        <RowCard onClick={() => navigate('/standings/jpel')} icon={<LeagueLogoSVG leagueId="jpel" size={34} />} title="JPEL" />
        <RowCard onClick={() => navigate('/standings/reserve')} icon={<LeagueLogoSVG leagueId="jpel" size={34} />} title="リザーブ" />
        <RowCard onClick={() => navigate('/standings/ecl')} icon={<LeagueLogoSVG leagueId="ecl" size={34} />} title="ECL" />
        {leagues.map(l => (
          <RowCard key={l.id} onClick={() => navigate(`/teams/foreign/${l.id}`)} icon={<LeagueLogoSVG leagueId={l.id} size={34} />} title={l.countryName} />
        ))}
      </>)}
    </>)
  }

  // ルート：リーグ / 代表
  return wrap(<>
    <Header eyebrow={`${currentSeason.year} TEAMS`} title="チーム" />
    {listBox(<>
      <RowCard onClick={() => goSection('leagues')} title="リーグ" />
      <RowCard onClick={() => goSection('national')} title="代表" />
    </>)}
  </>)
}
