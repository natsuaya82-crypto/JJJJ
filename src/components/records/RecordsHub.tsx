import MenuButton from '../ui/MenuButton'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { gmCareerTitles, titleRows } from '../../utils/teamHistory'
import { makeTeamIdAt } from '../../utils/gmTenure'
import { C, alpha, DIV_STAR, SAIRA, FONT } from '../../styles/tokens'
import BackButton from '../ui/BackButton'
import { DIVISION_LABEL, rankOfTeam, seasonDivisionStandings } from '../../utils/league'


export default function RecordsHub() {
  const navigate = useNavigate()
  const { currentSeason, pastSeasons, playerTeamId, gmTenures} = useGameStore()

  // 監督は別のチームへ移れる。過去の順位は「その年に指揮していたチーム」で引く。
  // 今のチームで引くと、移った瞬間に自分の優勝が消えて移籍先の過去が自分の成績になる（utils/gmTenure.ts）
  const teamIdAt = makeTeamIdAt(gmTenures, playerTeamId)
  // 優勝回数はセーブに持たず、過去シーズンの順位表から数え直す（utils/teamHistory.ts）
  // ★記録室は**監督の記録**。数え方は utils/teamHistory の gmCareerTitles 1本
  //   （ここに条件分岐で2通り書かないこと。RecordsPage と同じ答えを返す）
  // ★**部ごと**（オーナー・2026-08-12）。合計だと3部優勝と1部優勝が混ざる
  const gmTitles = gmCareerTitles(pastSeasons, gmTenures, playerTeamId)
  const championships = gmTitles.total
  const completedRaces = currentSeason.races.filter(r => r.results).length
  // 自分の部の中での順位。**通し順位（1〜52）は出さない**（格を決める内部の数・utils/clubStanding）
  const myStanding = rankOfTeam(seasonDivisionStandings(currentSeason, playerTeamId), playerTeamId)

  const SECTIONS = [
    {
      key: '/records/franchise',
      label: '自チーム記録',
      desc: '優勝記録・歴代種目別記録・シーズン成績',
      countLabel: `${completedRaces}戦 / ${currentSeason.races.length}戦`,
      badge: 0,
      color: C.gold,
      shadow: '#5a3500',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l7 3v5c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M9.5 12l1.8 1.8L15 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: '/records/individual',
      label: '個人ランキング',
      desc: '今季・通算JPEL区間賞・MVP',
      countLabel: '選手ランキング',
      badge: 0,
      color: C.green,
      shadow: '#0f3a24',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M17 13l1.5 3 3-.5-2 2.5 2 2.5-3-.5-1.5 3-1.5-3-3 .5 2-2.5-2-2.5 3 .5 1.5-3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: '/records/players',
      label: '区間記録',
      desc: '歴代全駅伝の区間タイムランキング',
      countLabel: `全区間記録`,
      badge: 0,
      color: C.blue,
      shadow: '#1a2050',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="13" r="8" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 13V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M9 2h6M12 5V2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: '/records/champions',
      label: '歴代優勝',
      desc: '大会別の歴代優勝・優勝回数ランキング・ECLの記録',
      countLabel: '大会別に一覧',
      badge: 0,
      color: C.gold,
      shadow: '#5a4200',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M12 14v4M8 21h8M10 18h4v3h-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: '/records/gm',
      label: 'GMキャリア',
      desc: 'GM評判・キャリア統計・順位推移・育成実績',
      countLabel: 'あなたの実績',
      badge: 0,
      color: C.cyan,
      shadow: '#0d3a4a',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6"/>
        </svg>
      ),
    },
    {
      key: '/records/draft',
      label: '歴代ドラフト',
      desc: '2027年度からの歴代ドラフト指名選手',
      countLabel: '年度別に一覧',
      badge: 0,
      color: C.orange,
      shadow: '#5a2800',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M12 16l-4-4M12 16l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    // 実績/トロフィーは「今シーズンの目標」と役割が被るためメニューから廃止（データと獲得処理は残す）
  ]

  return (
    <div style={{ fontFamily: FONT, paddingBottom: '80px', minHeight: '100dvh' }}>
      <div style={{ padding: '12px 16px 16px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>
          {currentSeason.year} RECORDS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <BackButton />
            <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>記録室</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* ★**部ごとの札**にする。合計の★だけだと3部優勝も1部優勝も同じ見た目になる */}
            {titleRows(gmTitles.titles).map(r => (
              <div key={r.division} style={{ padding: '4px 10px', borderRadius: '20px', background: alpha(DIV_STAR[r.division], 0.12), border: `1px solid ${alpha(DIV_STAR[r.division], 0.28)}`, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ fontSize: '9px', color: C.textDim }}>{DIVISION_LABEL[r.division]}</span>
                <span style={{ fontFamily: SAIRA, fontSize: '12px', color: DIV_STAR[r.division] }}>★</span>
                <span style={{ fontFamily: SAIRA, fontSize: '12px', fontWeight: '800', color: DIV_STAR[r.division], textShadow: `0 0 6px ${alpha(DIV_STAR[r.division], 0.5)}` }}>{r.count}</span>
              </div>
            ))}
            <div style={{ padding: '4px 10px', borderRadius: '20px', background: myStanding <= 3 ? alpha(C.green, 0.12) : C.surface2, border: `1px solid ${myStanding <= 3 ? alpha(C.green, 0.28) : C.border}`, display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ fontSize: '9px', color: C.textDim }}>現在</span>
              <span style={{ fontFamily: SAIRA, fontSize: '13px', fontWeight: '900', color: myStanding <= 3 ? C.green : C.textSub, textShadow: myStanding <= 3 ? `0 0 6px ${alpha(C.green, 0.4)}` : 'none' }}>{myStanding > 0 ? myStanding : '—'}</span>
              <span style={{ fontSize: '9px', color: C.textDim }}>位</span>
            </div>
          </div>
        </div>

        {pastSeasons.length > 0 && (
          <div style={{
            padding: '10px 12px', borderRadius: '14px', position: 'relative', overflow: 'hidden',
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.border2}`,
            boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)`,
            marginBottom: '4px',
          }}>
            <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }}/>
            <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px' }}>過去の成績</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {pastSeasons.slice(-4).reverse().map(season => {
                const rank = rankOfTeam(seasonDivisionStandings(season, teamIdAt(season.year)), teamIdAt(season.year))
                const rankCol = rank === 1 ? C.gold : rank <= 3 ? C.green : C.textDim
                return (
                  <div key={season.year} style={{ flex: 1, textAlign: 'center', padding: '6px', borderRadius: '8px', background: C.surface }}>
                    <div style={{ fontFamily: SAIRA, fontSize: '9px', color: C.textDim, marginBottom: '3px' }}>{season.year}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '15px', fontWeight: '900', color: rankCol, textShadow: rank <= 3 ? `0 0 6px ${alpha(rankCol, 0.5)}` : 'none' }}>{rank > 0 ? rank : '—'}</div>
                    <div style={{ fontFamily: SAIRA, fontSize: '8px', color: C.textGhost }}>位</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {SECTIONS.map(s => (
          <MenuButton
            key={s.key}
            icon={s.icon}
            label={s.label}
            badge={s.badge}
            badgeColor={s.color}
            color={s.color}
            onClick={() => navigate(s.key)}
          />
        ))}
      </div>
    </div>
  )
}
