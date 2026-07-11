import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../../store/gameStore'
import { C } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

export default function TransferHub() {
  const navigate = useNavigate()
  const { currentSeason, players, playerTeamId, getTransferWindow, gmRep } = useGameStore()
  const loanSlots = players.filter(p => p.teamId === playerTeamId && p.loan && p.loan.ownerTeamId !== playerTeamId).length
  const starredOpponents = useGameStore(s => s.starredOpponents ?? [])

  const win = getTransferWindow()
  const pendingTrades = currentSeason.pendingTradeOffers ?? []
  const tradeNegs = currentSeason.tradeNegotiations ?? []
  const faPlayers = players.filter(p => p.teamId === '' && p.status === 'active')
  const transferBids = (currentSeason.transferBids ?? []).filter(b => b.status !== 'complete' && b.status !== 'failed')
  const allListings = currentSeason.transferListings ?? []
  const incomingOffers = currentSeason.incomingOffers ?? []

  const gmRepColor = (gmRep ?? 50) >= 70 ? C.gold : (gmRep ?? 50) >= 45 ? C.textSub : C.red

  void win; void gmRepColor

  const activeBidsNeedAction = transferBids.filter(b => b.status === 'fee_accepted' || b.status === 'countered' || b.status === 'player_neg')


  const starredCount = starredOpponents.length

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
      key: 'offers',
      path: '/transfer/offers',
      label: 'オファー一覧',
      desc: '受けたオファー・出したオファーを確認',
      countLabel: (incomingOffers.length + activeBidsNeedAction.length) > 0 ? `${incomingOffers.length + activeBidsNeedAction.length}件` : 'オファーなし',
      badge: incomingOffers.length + activeBidsNeedAction.length,
      color: C.blue,
      shadow: '#1a2050',
      urgent: incomingOffers.length > 0,
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
      countLabel: `スカウトPT: ${currentSeason.scoutPoints}`,
      badge: currentSeason.scoutPoints,
      color: C.orange,
      shadow: '#5a2800',
      urgent: currentSeason.scoutPoints > 0,
    },
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
  }

  return (
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: '80px', background: C.bg, minHeight: '100%' }}>
      <div style={{ padding: '12px 16px 14px' }}>
        <div style={{ fontFamily: SAIRA, fontSize: '10px', color: C.gold, letterSpacing: '3px', fontWeight: '900', marginBottom: '4px' }}>
          {currentSeason.year} TRANSFER
        </div>
        <div style={{ fontFamily: SAIRA, fontSize: '22px', fontWeight: '900', color: C.text }}>移籍</div>
      </div>

      <div style={{ padding: '0 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {SECTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => navigate((s as { path?: string }).path ?? `/transfer/${s.key}`)}
                className="btn-press"
                style={{
                  width: '100%', padding: '12px 14px',
                  borderRadius: 14,
                  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
                  border: `2px solid ${C.goldDark}`,
                  boxShadow: `0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
                  display: 'flex', alignItems: 'center', gap: 12,
                  fontFamily: 'inherit', cursor: 'pointer',
                  position: 'relative', overflow: 'hidden',
                } as React.CSSProperties}
              >
                <div style={{ position: 'absolute', inset: 3, border: '1px solid rgba(245,200,66,0.2)', borderRadius: 10, pointerEvents: 'none' }}/>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0, position: 'relative', zIndex: 1,
                  background: 'linear-gradient(180deg, #2a4060 0%, #122440 100%)',
                  border: `2px solid ${C.bg}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: s.color,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -2px 4px rgba(0,0,0,0.3)',
                }}>
                  {ICONS[s.key]}
                </div>
                <div style={{ flex: 1, textAlign: 'left', position: 'relative', zIndex: 1 }}>
                  <span style={{ fontFamily: SAIRA, fontSize: 15, fontWeight: 800, color: C.text }}>{s.label}</span>
                  {s.badge > 0 && (
                    <span style={{ marginLeft: 7, padding: '1px 7px', borderRadius: 6, background: s.color, color: C.bg, fontSize: 10, fontWeight: 900 }}>
                      {s.badge}
                    </span>
                  )}
                </div>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: C.goldDark, position: 'relative', zIndex: 1 }}>
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
  )
}
