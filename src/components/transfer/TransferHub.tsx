import MenuButton from '../ui/MenuButton'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { C, SAIRA, FONT } from '../../styles/tokens'


export default function TransferHub() {
  const navigate = useNavigate()
  const { currentSeason, players, playerTeamId, getTransferWindow, gmRep } = useGameStore()
  const loanSlots = players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length
  const starredOpponents = useGameStore(s => s.starredOpponents) ?? []
  const starredProspects = useGameStore(s => s.starredProspects) ?? []

  const win = getTransferWindow()
  const tradeNegs = currentSeason.tradeNegotiations ?? []
  const allListings = currentSeason.transferListings ?? []

  const gmRepColor = (gmRep ?? 50) >= 70 ? C.gold : (gmRep ?? 50) >= 45 ? C.textSub : C.red

  void win; void gmRepColor



  // ★はドラフト候補(starredProspects)にも付くので合算（ウォッチリストページの表示件数と揃える）。
  // 獲得済み（自チーム所属）の選手はウォッチリストから外れた扱いにして数えない
  const myIds = new Set(players.filter(p => p.teamId === playerTeamId).map(p => p.id))
  const starredCount = starredOpponents.filter(id => !myIds.has(id)).length
    + starredProspects.filter(id => !starredOpponents.includes(id) && !myIds.has(id)).length

  const SECTIONS = [
    {
      key: 'market',
      label: '移籍市場',
      desc: '他クラブが出品中の選手を獲得',
      countLabel: allListings.length > 0 ? `${allListings.length}件出品中` : '市場確認',
      badge: allListings.length,
      color: C.gold,
      shadow: '#5a3500',
      urgent: allListings.length > 0,
    },
    {
      key: 'trade',
      path: '/transfer/trade',
      label: 'トレード',
      desc: '他クラブと選手・指名権を交換',
      countLabel: tradeNegs.length > 0 ? `交渉中 ${tradeNegs.length}件` : '選手を交換',
      badge: tradeNegs.length,
      color: C.orange,
      shadow: '#5a2800',
      urgent: tradeNegs.length > 0,
    },
    {
      key: 'rental',
      path: '/transfer/rental',
      label: 'レンタル',
      desc: '選手を借りる・若手を貸し出す',
      countLabel: `レンタル枠 ${loanSlots}/3`,
      badge: 0,
      color: C.blue,
      shadow: '#1a2050',
      urgent: false,
    },
    {
      key: 'scout',
      path: '/scout',
      label: 'スカウト',
      desc: '大学・高校選手のスカウティング',
      countLabel: '候補を見る',
      badge: 0,
      color: C.orange,
      shadow: '#5a2800',
      urgent: false,
    },
    // 出品・指名権売却は次バージョンでは出さないので非表示（コードは /transfer/listings に残置）。
    // 復活させるときはこのタイルを戻すだけでOK。
    // {
    //   key: 'listings',
    //   path: '/transfer/listings',
    //   label: '出品・指名権売却',
    //   desc: '自チームの選手を出品・指名権を売る',
    //   countLabel: allListings.filter(l => l.fromTeamId === playerTeamId).length > 0 ? `${allListings.filter(l => l.fromTeamId === playerTeamId).length}件出品中` : '資金をつくる',
    //   badge: allListings.filter(l => l.fromTeamId === playerTeamId).length,
    //   color: C.green,
    //   shadow: '#0d3d22',
    //   urgent: false,
    // },
    {
      key: 'watchlist',
      path: '/transfer/starred',
      label: 'WATCHLIST',
      desc: '注目している他チームの選手一覧',
      countLabel: starredCount > 0 ? `${starredCount}名` : '選手なし',
      badge: starredCount,
      color: C.gold,
      shadow: '#5a3500',
      urgent: false,
    },
  ]

  const ICONS: Record<string, React.ReactNode> = {
    scout: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M21 21l-4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M11 8v3M11 14v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    market: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M7 16l-4-4 4-4M17 8l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M3 12h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    offers: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    trade: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M8 7h12M8 7l3-3M8 7l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 17H4M16 17l-3-3M16 17l-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    fa: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 20c0-3.5 3-6 7-6s7 2.5 7 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M18 5l3 3-3 3M21 8h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    rental: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M3 8h13l-3-3M21 16H8l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    watchlist: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      </svg>
    ),
    listings: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3v12M12 3l-4 4M12 3l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M4 15v4a2 2 0 002 2h12a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  }

  return (
    <div style={{ fontFamily: FONT, paddingBottom: '80px', background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>
          {currentSeason.year} TRANSFER
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>移籍</div>
      </div>

      <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SECTIONS.map(s => (
              <MenuButton
                key={s.key}
                icon={ICONS[s.key]}
                label={s.label}
                badge={s.badge}
                badgeColor={s.color}
                onClick={() => navigate((s as { path?: string }).path ?? `/transfer/${s.key}`)}
              />
            ))}
          </div>
        </div>
      </div>
  )
}
