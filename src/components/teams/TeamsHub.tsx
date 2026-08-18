import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { LeagueLogoSVG } from '../icons/Icons'
import { C, SAIRA, FONT, F } from '../../styles/tokens'
import { NAT_LABEL, natGeoRegion, GEO_REGION_ORDER, type GeoRegion } from '../../data/nationalities'
import { leagueNameEn } from '../../data/foreignLeagues'
import Flag from '../ui/Flag'
import PageHeader from '../ui/PageHeader'
import MenuButton from '../ui/MenuButton'
import { NationalTeamRoster } from './NationalTeamDetailPage'
import type { Nationality } from '../../types'


type NatEntry = { code: Nationality; label: string }



// 一覧の行。見た目は MenuButton 1本（`premium-menu-button` を手書きしないこと）。
// ★他のハブ（オンライン・移籍・記録室…）と同じく**英字・絵・色**を付ける。
//   ここだけ字だけの行で、下タブを行き来すると1画面だけ別物に見えていた。
function RowCard({ onClick, icon, title, en, color, right }: {
  onClick: () => void
  icon?: React.ReactNode
  title: string
  en?: string
  color?: string
  right?: React.ReactNode
}) {
  return <MenuButton icon={icon} label={title} en={en} color={color} right={right} onClick={onClick} />
}

// 地域の絵（代表の一覧）。国旗が使えない段は、地球の絵で揃える
const GLOBE = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </svg>
)
const TABLE = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M3 9h18M9 9v11" stroke="currentColor" strokeWidth="1.8"/>
  </svg>
)

// 戻るは「‹ タイトル」の横並び（記録室と同じ流儀）。タイトルは矢印のすぐ横に置く
function Header({ eyebrow, title, onBack }: { eyebrow: string; title: string; onBack?: () => void }) {
  if (!onBack) {
    return (
      <div style={{ padding: '12px 16px 12px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: 3, fontWeight: 900, marginBottom: 2 }}>{eyebrow}</div>
        <div style={{ fontFamily: SAIRA, fontSize: F.headLg, fontWeight: 900, color: C.text }}>{title}</div>
      </div>
    )
  }
  return <PageHeader title={title} onBack={onBack} />
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

  // ★**「最高」は出しません**（オーナー・2026-08-18「90いないのに最高90とかなってて
  //   ありえない」）。その国籍の選手のうちいちばん高いOVRを出していましたが、
  //   **代表に選ばれる7人とは関係のない数**でした（引退していないだけの全選手が対象で、
  //   どのクラブに居ても・代表候補でなくても入る）。代表の強さを1つの数字で言おうとすると
  //   必ずこの形になるので、数字ごと置きません。強さは中を開けば分かります。
  const natByRegion = useMemo(() => {
    const seen = new Set<Nationality>()
    const byRegion = new Map<GeoRegion, NatEntry[]>()
    for (const p of players) {
      if (p.status === 'retired') continue
      const c = p.nationality as Nationality
      if (!c || seen.has(c)) continue
      seen.add(c)
      const r = natGeoRegion(c)
      const arr = byRegion.get(r) ?? []
      arr.push({ code: c, label: NAT_LABEL[c] ?? c })
      byRegion.set(r, arr)
    }
    return byRegion
  }, [players])

  // 国の並びは国名順（あいうえお）で固定。
  // 前はOVR順だったが、目当ての国を探すのに強さ順は使えない。
  // 切り替えボタンは置かない（この画面だけの操作を増やさない）
  const sortedNats = (arr: NatEntry[]): NatEntry[] =>
    [...arr].sort((a, b) => a.label.localeCompare(b.label, 'ja'))

  const wrap = (children: React.ReactNode) => (
    <div style={{ fontFamily: FONT, paddingBottom: 90, minHeight: '100dvh' }}>{children}</div>
  )
  const listBox = (children: React.ReactNode) => (
    <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
  )

  // 代表：国ロスター（インライン）→ 戻ると国一覧へ（履歴で戻る）
  if (section === 'national' && code) {
    return wrap(<NationalTeamRoster code={code} onBack={() => navigate(-1)} />)
  }

  // 代表：地域内の国一覧
  if (section === 'national' && region) {
    const arr = sortedNats(natByRegion.get(region) ?? [])
    return wrap(<>
      <Header eyebrow="NATIONAL TEAMS" title={region} onBack={() => navigate(-1)} />
      {listBox(arr.map(n => (
        <RowCard
          key={n.code}
          onClick={() => goCode(n.code)}
          icon={<Flag code={n.code} width={30} />}
          title={n.label}
          en="NATIONAL TEAM"
          color={C.purple}
        />
      )))}
    </>)
  }

  // 代表：地域一覧
  if (section === 'national') {
    return wrap(<>
      <Header eyebrow="NATIONAL TEAMS" title="代表" onBack={() => navigate(-1)} />
      {listBox(GEO_REGION_ORDER.filter(r => natByRegion.has(r)).map(r => (
        <RowCard key={r} onClick={() => goRegion(r)} title={r} en="REGION" icon={GLOBE} color={C.purple} />
      )))}
    </>)
  }

  // リーグ（従来のハブ）
  if (section === 'leagues') {
    return wrap(<>
      <Header eyebrow={`${currentSeason.year} STANDINGS`} title="リーグ" onBack={() => navigate(-1)} />
      {listBox(<>
        {/* JPELは1枚。1部・2部・3部の切り替えは順位表のページの中でやる（同じリーグの中なので）。
            ECLは別のリーグなのでここで分ける */}
        <RowCard onClick={() => navigate('/standings')} icon={<LeagueLogoSVG leagueId="jpel" size={34} />} title="JPEL" en="JAPAN" color={C.gold} />
        <RowCard onClick={() => navigate('/standings/ecl')} icon={<LeagueLogoSVG leagueId="ecl" size={34} />} title="ECL" en="CHAMPIONS LEAGUE" color={C.red} />
        {leagues.map(l => (
          <RowCard key={l.id} onClick={() => navigate(`/teams/foreign/${l.id}`)} icon={<LeagueLogoSVG leagueId={l.id} size={34} />} title={l.countryName} en={leagueNameEn(l.id)} color={C.cyan} />
        ))}
      </>)}
    </>)
  }

  // ルート：リーグ / 代表
  return wrap(<>
    <Header eyebrow={`${currentSeason.year} TEAMS`} title="チーム" />
    {listBox(<>
      <RowCard onClick={() => goSection('leagues')} title="リーグ" en="LEAGUES" icon={TABLE} color={C.gold} />
      <RowCard onClick={() => goSection('national')} title="代表" en="NATIONAL TEAMS" icon={GLOBE} color={C.purple} />
    </>)}
  </>)
}
