import { useState } from 'react'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { audio } from '../../utils/audio'
import { loginTodayKey } from '../../utils/loginDate'
import { C, alpha, SAIRA, FONT } from '../../styles/tokens'
import { useAdHeight, HEADER_H, NAV_H, MAIN_GAP } from '../layout/Layout'
import { GmPassSheet, IAP_ENABLED } from '../shared/GmPassSheet'


function JewelIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, verticalAlign: 'middle' }}>
      <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" fill="url(#lbsg)" stroke="#4ab8ea" strokeWidth="1.2" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="lbsg" x1="3" y1="2" x2="21" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a8e4ff"/>
          <stop offset="100%" stopColor="#3b9fd4"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

// ヘルプ・設定など他ページと同じカードの型（グラデ地＋下影＋アクセント帯の見出し）。
// このページだけ平坦なべた塗りで浮いていたので、見た目だけ揃える。
// grow: 画面に余った縦幅を各カードで分け合うときの比率（指定しなければ中身なりの高さ）。
//       flex-basis は auto・flex-shrink は 0 なので、画面が狭い端末では縮まずに従来どおりスクロールする。
function Card({ label, accent, right, grow, bodyJustify, children }: { label: string; accent: string; right?: React.ReactNode; grow?: number; bodyJustify?: 'center' | 'space-between'; children: React.ReactNode }) {
  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
      border: `1px solid ${alpha(accent, 0.35)}`,
      boxShadow: `0 3px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
      display: 'flex', flexDirection: 'column',
      flex: grow ? `${grow} 0 auto` : undefined,
    }}>
      <div style={{
        padding: '10px 14px 9px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        borderBottom: `1px solid ${alpha(accent, 0.15)}`,
        background: `linear-gradient(90deg, ${alpha(accent, 0.1)}, transparent)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          <div style={{ width: 3, height: 14, borderRadius: 2, background: accent, flexShrink: 0 }} />
          <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: accent, letterSpacing: '3px' }}>{label}</div>
        </div>
        {right}
      </div>
      <div style={{ padding: '12px 14px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: bodyJustify }}>{children}</div>
    </div>
  )
}

export default function LoginBonusPage() {
  const { loginStreak, totalLoginDays, lastLoginDate, claimLoginBonus } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const mult = adsRemoved ? 2 : 1
  const [claimResult, setClaimResult] = useState<{ gained: number; streak: number } | null>(null)
  const [gmPassOpen, setGmPassOpen] = useState(false)   // GMパス購入シート（未購入者の「2倍にする」から開く）

  const today = loginTodayKey()

  const claimedToday = lastLoginDate === today
  const streak = loginStreak ?? 0
  const total = totalLoginDays ?? 0
  const justCompletedWeek = claimedToday && streak === 0 && total > 0 && total % 7 === 0
  const displayWeekPos = justCompletedWeek ? 7 : streak
  const weekComplete = displayWeekPos === 7

  // ヘッダー・下タブ・広告バナーを引いた「実際に見えている高さ」。
  // main が position:fixed で上下を固定しているので、ここで 100dvh を使うとその分だけ縦に溢れる。
  const adH = useAdHeight()
  const pageMinHeight = `calc(100dvh - ${HEADER_H + NAV_H + MAIN_GAP + adH}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))`

  const handleClaim = () => {
    const result = claimLoginBonus()
    if (result) {
      setClaimResult({ gained: result.daily + result.weeklyBonus, streak: result.streak })
      audio.playSe('reward')
    }
  }

  const days = [
    { day: 1, reward: 100 * mult, isBonus: false },
    { day: 2, reward: 100 * mult, isBonus: false },
    { day: 3, reward: 100 * mult, isBonus: false },
    { day: 4, reward: 100 * mult, isBonus: false },
    { day: 5, reward: 100 * mult, isBonus: false },
    { day: 6, reward: 100 * mult, isBonus: false },
    { day: 7, reward: 1100 * mult, isBonus: true },
  ]

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: pageMinHeight, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '12px' }}>
          <BackButton />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: '#6dd5fa', letterSpacing: '3px', fontWeight: '900' }}>LOGIN BONUS</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text }}>ログインボーナス</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Claim result */}
        {claimResult && (
          <div style={{
            padding: '14px 16px', borderRadius: 14,
            background: `linear-gradient(135deg, ${alpha('#6dd5fa', 0.18)}, ${alpha('#6dd5fa', 0.06)})`,
            border: `1px solid ${alpha('#6dd5fa', 0.5)}`,
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 13, color: '#6dd5fa', fontWeight: 900, letterSpacing: '1px', marginBottom: 4 }}>
              受け取り完了
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 36, fontWeight: 900, color: '#6dd5fa', lineHeight: 1 }}>
              +{claimResult.gained}
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, marginTop: 4 }}>
              ジュエル · {claimResult.streak}日連続
            </div>
          </div>
        )}

        {/* Already claimed today */}
        {claimedToday && !claimResult && (
          <div style={{
            padding: '14px 16px', borderRadius: 14,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `1px solid ${C.border}`,
            boxShadow: `0 3px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)`,
            textAlign: 'center',
          }}>
            <div style={{ fontFamily: SAIRA, fontSize: 12, color: C.textDim, letterSpacing: '1px' }}>本日受取済み</div>
            <div style={{ fontSize: 11, color: C.textGhost, marginTop: 4 }}>明日10時以降に再度受け取れます</div>
          </div>
        )}

        {/* Claim button (when unclaimed) */}
        {!claimedToday && !claimResult && (
          <button
            onClick={handleClaim}
            style={{
              width: '100%', padding: '13px', borderRadius: 14, cursor: 'pointer',
              background: `linear-gradient(180deg, #1a4a7a 0%, #0f2a4a 100%)`,
              border: `2px solid ${alpha('#6dd5fa', 0.6)}`,
              boxShadow: `0 4px 0 #061525, 0 6px 16px ${alpha('#6dd5fa', 0.2)}`,
              fontFamily: SAIRA, fontSize: 18, fontWeight: 900, color: '#6dd5fa',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}
          >
            <JewelIcon size={20} />
            受け取る
          </button>
        )}

        {/* Weekly calendar */}
        <Card
          label="WEEKLY STREAK"
          accent="#6dd5fa"
          grow={1}
          right={<div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: '#6dd5fa' }}>{displayWeekPos} / 7</div>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, flex: 1 }}>
            {days.map(({ day, reward, isBonus }) => {
              const claimed = day <= displayWeekPos
              const isToday = claimedToday && day === displayWeekPos
              const isAvailable = !claimedToday && day === displayWeekPos + 1

              const accent = isBonus ? '#ffd700' : '#6dd5fa'
              let bg = alpha(C.surface2, 0.5)
              let border: string = C.border

              if (claimed) {
                bg = alpha(accent, 0.14)
                border = alpha(accent, 0.45)
              } else if (isAvailable) {
                bg = alpha(accent, 0.07)
                border = alpha(accent, 0.28)
              }

              return (
                <div key={day} style={{
                  background: bg, border: `1px solid ${border}`,
                  borderRadius: 8, padding: '7px 3px 6px',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  position: 'relative',
                }}>
                  {isToday && (
                    <div style={{
                      position: 'absolute', top: -7, left: '50%', transform: 'translateX(-50%)',
                      background: '#6dd5fa', borderRadius: 3,
                      fontFamily: SAIRA, fontSize: 7, fontWeight: 900, color: C.bg,
                      padding: '1px 4px', letterSpacing: '0.5px', whiteSpace: 'nowrap',
                    }}>TODAY</div>
                  )}

                  <div style={{ fontFamily: SAIRA, fontSize: 8, color: claimed ? accent : C.textGhost, letterSpacing: '0.5px', fontWeight: 700 }}>
                    DAY{day}
                  </div>

                  {claimed ? (
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6.5" fill={alpha(accent, 0.18)} stroke={accent} strokeWidth="1.2"/>
                      <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <JewelIcon size={13} />
                  )}

                  <div style={{ fontFamily: SAIRA, fontSize: isBonus ? 9 : 11, color: claimed ? accent : isAvailable ? alpha(accent, 0.65) : C.textGhost, fontWeight: 900, lineHeight: 1 }}>
                    +{reward}
                  </div>
                  {isBonus && (
                    <div style={{ fontFamily: SAIRA, fontSize: 7, color: claimed ? alpha(accent, 0.7) : C.textGhost, letterSpacing: '0.3px' }}>
                      {100 * mult}+{1000 * mult}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {weekComplete && (
            <div style={{
              marginTop: 12, padding: '8px 12px', borderRadius: 8,
              background: alpha('#ffd700', 0.1), border: `1px solid ${alpha('#ffd700', 0.3)}`,
              textAlign: 'center',
              fontFamily: SAIRA, fontSize: 12, color: '#ffd700', fontWeight: 700,
            }}>
              7日連続達成！明日からリセット
            </div>
          )}

          {!claimedToday && (
            <div style={{
              marginTop: 10, padding: '7px 12px', borderRadius: 8,
              background: alpha('#6dd5fa', 0.07), border: `1px solid ${alpha('#6dd5fa', 0.2)}`,
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 11, color: alpha('#6dd5fa', 0.8) }}>毎日10時に更新されます</span>
            </div>
          )}
        </Card>

        {/* Reward info */}
        <Card
          label="REWARD DETAILS"
          accent="#6dd5fa"
          grow={1}
          bodyJustify="space-between"
          right={adsRemoved
            ? <div style={{ fontFamily: SAIRA, fontSize: 11, fontWeight: 900, color: C.gold, letterSpacing: '1px' }}>GM PASS ×2</div>
            : IAP_ENABLED
              ? (
                <button
                  onClick={() => { setGmPassOpen(true); audio.playSe('tap') }}
                  className="btn-press"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
                    padding: '5px 10px', borderRadius: 999,
                    background: `linear-gradient(180deg, ${alpha(C.gold, 0.16)}, ${alpha(C.gold, 0.05)})`,
                    border: `1px solid ${alpha(C.gold, 0.45)}`,
                    fontFamily: SAIRA,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.gold, letterSpacing: '0.5px' }}>GMパスで毎日×2</span>
                  <span style={{ fontSize: 10, color: alpha(C.gold, 0.6) }}>›</span>
                </button>
              )
              : undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSub }}>毎日ログイン{adsRemoved ? '（2倍中）' : ''}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <JewelIcon size={13} />
              <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: '#6dd5fa' }}>+{100 * mult}</span>
            </div>
          </div>
          <div style={{ height: 1, background: C.border }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSub }}>7日連続ボーナス</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <JewelIcon size={13} />
              <span style={{ fontFamily: SAIRA, fontSize: 14, fontWeight: 900, color: '#ffd700' }}>+{1000 * mult}</span>
            </div>
          </div>
        </Card>

        {/* Total stats */}
        <Card label="TOTAL STATS" accent={C.gold} grow={1} bodyJustify="center">
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 30, fontWeight: 900, color: C.text, lineHeight: 1 }}>
                {total}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, whiteSpace: 'nowrap' }}>累計ログイン日数</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 30, fontWeight: 900, color: C.gold, lineHeight: 1 }}>
                {streak}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 6, whiteSpace: 'nowrap' }}>連続ログイン日数</div>
            </div>
          </div>
        </Card>

      </div>
      {gmPassOpen && <GmPassSheet onClose={() => setGmPassOpen(false)} />}
    </div>
  )
}
