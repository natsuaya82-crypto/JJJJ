import MenuButton from '../ui/MenuButton'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { fmtYen } from '../../utils/money'
import { TeamLogoSVG } from '../icons/Icons'
import { C, alpha, SAIRA, FONT, F } from '../../styles/tokens'
import { seasonDivisionStandings, rankOfTeam } from '../../utils/league'
import { panelStyle } from '../ui/Panel'
import { facilitiesOf } from '../../utils/facilities'


export default function TeamHub() {
  const navigate = useNavigate()
  const { teams, players, playerTeamId, currentSeason } = useGameStore()
  const trainingCards = useGameStore(s => s.trainingCards) ?? []
  const raceDroppedCards = useGameStore(s => s.raceDroppedCards) ?? []
  const myTeam = teams.find(t => t.id === playerTeamId)
  const myPlayers = players.filter(p => p.teamId === playerTeamId)
  const expiringCount = myPlayers.filter(p => p.contract.yearsLeft <= 1).length
  // 全52チームぶんの順位表から、自分が走っている部だけに絞る（utils/league）
  const sortedStandings = seasonDivisionStandings(currentSeason, playerTeamId)
  const myRank = rankOfTeam(sortedStandings, playerTeamId)
  const avgOvr = myPlayers.length > 0 ? Math.round(myPlayers.reduce((s, p) => s + ovr(p), 0) / myPlayers.length) : 0

  const teamPrimary = myTeam?.colors.primary ?? C.blue

  const rankText = myRank === 1 ? C.bg : myRank <= 3 ? C.green : C.textSub

  const SECTIONS = [
    {
      key: '/team/roster',
      label: 'ロスター', en: 'ROSTER',
      desc: '1軍・リザーブ・ユースの選手管理、放出',
      countLabel: expiringCount > 0 ? `FA間近 ${expiringCount}名` : `${myPlayers.length}名在籍`,
      badge: expiringCount,
      color: C.blue,
      shadow: '#1a2050',
      urgent: expiringCount > 0,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M7 9h10M7 13h7M7 17h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: '/cards',
      label: 'カード練習', en: 'TRAINING',
      desc: 'カード合成で選手を育成',
      countLabel: trainingCards.length > 0
        ? `手持ち${trainingCards.length}枚${raceDroppedCards.length > 0 ? ` / NEW+${raceDroppedCards.length}` : ''}`
        : 'カードなし',
      badge: raceDroppedCards.length,
      color: C.purple,
      shadow: '#3b0071',
      urgent: raceDroppedCards.length > 0,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <rect x="9" y="4" width="12" height="16" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M13 9h4M13 12h4M13 15h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: '/team/nosale',
      label: '移籍方針', en: 'POLICY',
      desc: '選手ごとに非売・貸出歓迎・売出を設定する',
      countLabel: (() => {
        const n = players.filter(p => p.teamId === playerTeamId && p.status === 'active' && (p.noSale || p.loanListed || p.transferListed)).length
        return n > 0 ? `${n}名設定中` : '設定なし'
      })(),
      badge: 0,
      color: C.red,
      shadow: '#5a1010',
      urgent: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: '/sponsors',
      label: 'スポンサー', en: 'SPONSORS',
      desc: 'チーム・個人スポンサー契約管理',
      countLabel: (() => {
        const team = teams.find(t => t.id === playerTeamId)
        const cnt = (team?.sponsors ?? []).length
        const myPl = players.filter(p => p.teamId === playerTeamId)
        const personal = myPl.reduce((s, p) => s + (p.personalSponsors?.length ?? 0), 0)
        const total = cnt + personal
        return total > 0 ? `契約中 ${total}件` : '契約なし'
      })(),
      badge: 0,
      color: C.green,
      shadow: '#0a4020',
      urgent: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      key: '/team/facilities',
      label: '施設強化', en: 'FACILITIES',
      desc: '合宿・医療・スカウト・戦術分析施設のアップグレード',
      countLabel: (() => {
        const team = teams.find(t => t.id === playerTeamId)
        const total = Object.values(facilitiesOf(team)).reduce((s, v) => s + v, 0)
        return total > 0 ? `施設合計Lv${total}` : '未建設'
      })(),
      badge: 0,
      color: C.cyan,
      shadow: '#1a2030',
      urgent: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 12v4M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      key: '/budget',
      label: '財務・予算', en: 'FINANCE',
      desc: '予算・収支・年俸・スポンサー収入の管理',
      countLabel: (() => {
        const team = teams.find(t => t.id === playerTeamId)
        const b = team?.finance.budget ?? 0
        return `予算 ${fmtYen(b)}`
      })(),
      badge: 0,
      color: C.green,
      shadow: '#0d3d22',
      urgent: false,
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
          <path d="M12 7v1.5M12 15.5V17M9.5 9.5C9.5 8.1 10.6 7 12 7s2.5 1.1 2.5 2.5c0 2.5-2.5 2.5-2.5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
  ]

  return (
    <div style={{
      fontFamily: FONT,
      paddingBottom: 80,
      minHeight: '100%',
    }}>


      {/* Team hero card */}
      <div style={{
        ...panelStyle(C.gold),
        margin: '12px 12px 16px',
        background: `linear-gradient(135deg, ${teamPrimary} 0%, ${C.surface} 55%, ${C.bg} 100%)`,
        padding: '16px 16px 14px',
      }}>

        {/* Tasuki diagonal */}
        <div style={{
          position: 'absolute', top: '-40%', right: '-20%', width: 200, height: 200,
          background: `linear-gradient(135deg, transparent 45%, ${alpha(myTeam?.colors.secondary ?? C.gold, 0.15)} 50%, transparent 55%)`,
          transform: 'rotate(15deg)', pointerEvents: 'none', zIndex: 0,
        }}/>

        {/* Background glow */}
        <div style={{
          position: 'absolute', right: 16, top: 8, width: 100, height: 100, borderRadius: '50%',
          background: `radial-gradient(circle, ${alpha(teamPrimary, 0.25)} 0%, transparent 70%)`,
          filter: 'blur(20px)', pointerEvents: 'none', zIndex: 0,
        }}/>

        {/* Team row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, position: 'relative', zIndex: 2, marginBottom: 14 }}>
          {myTeam && (
            <TeamLogoSVG
              primary={myTeam.colors.primary}
              secondary={myTeam.colors.secondary}
              shortName={myTeam.shortName}
              teamId={myTeam.id}
              size={56}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SAIRA, fontSize: F.caption, color: C.gold, letterSpacing: '3px', marginBottom: 2, fontWeight: 700 }}>
              {currentSeason.year} TEAM
            </div>
            <div style={{
              fontSize: F.head, fontWeight: 900, color: C.text, lineHeight: 1.1, letterSpacing: '-0.5px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textShadow: `-1px -1px 0 #061224, 1px -1px 0 #061224, -1px 1px 0 #061224, 1px 1px 0 #061224`,
            }}>
              {myTeam?.name ?? '—'}
            </div>
            <div style={{ fontSize: F.label, color: C.textSub, marginTop: 2 }}>{myTeam?.city} · GM: {myTeam?.gmName}</div>
          </div>

          {/* Rank badge */}
          {myRank > 0 && (
            <div style={{
              ...panelStyle(myRank === 1 ? C.gold : myRank <= 3 ? C.green : C.border3),
              flexShrink: 0, width: 52, height: 52,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontFamily: SAIRA, fontSize: F.hero, fontWeight: 900, lineHeight: 1, color: rankText }}>{myRank}</div>
              <div style={{ fontFamily: SAIRA, fontSize: F.tiny, fontWeight: 700, color: rankText, opacity: 0.8 }}>位</div>
            </div>
          )}
        </div>

        {/* Stat bar */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr',
          gap: 0, position: 'relative', zIndex: 2,
          background: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.3) 100%)`,
          overflow: 'hidden',
          border: `1px solid rgba(245,200,66,0.22)`,
          boxShadow: `inset 0 2px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}>
          {[
            { label: '順位', value: myRank > 0 ? `${myRank}位` : '—', color: myRank === 1 ? C.gold : myRank <= 3 ? C.green : C.textSub, glow: myRank === 1 ? C.gold : null },
            null,
            { label: 'AVG OVR', value: `${avgOvr}`, color: avgOvr >= 80 ? C.gold : C.textSub, glow: avgOvr >= 80 ? C.gold : null },
            null,
            { label: 'FA間近', value: `${expiringCount}名`, color: expiringCount > 0 ? C.red : C.textDim, glow: expiringCount > 0 ? C.red : null },
          ].map((item, i) => {
            if (item === null) {
              return (
                <div key={i} style={{
                  width: 1,
                  background: `linear-gradient(180deg, transparent 0%, ${C.goldDark} 50%, transparent 100%)`,
                  alignSelf: 'center', height: 28,
                }}/>
              )
            }
            return (
              <div key={i} style={{ textAlign: 'center', padding: '9px 4px' }}>
                <div style={{
                  fontFamily: SAIRA, fontSize: F.title, fontWeight: 900, color: item.color, lineHeight: 1,
                  textShadow: item.glow ? `0 0 10px ${alpha(item.glow, 0.55)}` : 'none',
                }}>{item.value}</div>
                <div style={{ fontFamily: SAIRA, fontSize: F.tiny, color: C.textDim, marginTop: 2, letterSpacing: '0.1em' }}>{item.label}</div>
              </div>
            )
          })}
        </div>
      </div>


      {/* Section cards */}
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SECTIONS.map(s => (
          <MenuButton
            key={s.key}
            icon={s.icon}
            label={s.label}
            en={s.en}
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
