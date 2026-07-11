import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../ui/BackButton'
import { useGameStore } from '../../store/gameStore'
import { audio } from '../../utils/audio'
import { loginTodayKey } from '../../utils/loginDate'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

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

export default function LoginBonusPage() {
  const navigate = useNavigate()
  const { loginStreak, totalLoginDays, lastLoginDate, claimLoginBonus } = useGameStore()
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const mult = adsRemoved ? 2 : 1
  const [claimResult, setClaimResult] = useState<{ gained: number; streak: number } | null>(null)

  const today = loginTodayKey()

  const claimedToday = lastLoginDate === today
  const streak = loginStreak ?? 0
  const total = totalLoginDays ?? 0
  const justCompletedWeek = claimedToday && streak === 0 && total > 0 && total % 7 === 0
  const displayWeekPos = justCompletedWeek ? 7 : streak
  const weekComplete = displayWeekPos === 7

  const totalJewels = total * 100 + Math.floor(total / 7) * 1000

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
    <div style={{ fontFamily: "'Zen Kaku Gothic New', 'Noto Sans JP', system-ui, sans-serif", paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', background: C.bg, minHeight: '100dvh' }}>
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '12px' }}>
          <BackButton />
          <div>
            <div style={{ fontFamily: SAIRA, fontSize: '10px', color: '#6dd5fa', letterSpacing: '3px', fontWeight: '900' }}>LOGIN BONUS</div>
            <div style={{ fontFamily: SAIRA, fontSize: '20px', fontWeight: '900', color: C.text }}>ログインボーナス</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

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
            background: alpha(C.surface2, 0.8),
            border: `1px solid ${C.border}`,
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
        <div style={{
          background: alpha(C.surface2, 0.8),
          border: `1px solid ${C.border}`,
          borderRadius: 14, padding: '11px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub, letterSpacing: '2px', fontWeight: 700 }}>
              WEEKLY STREAK
            </div>
            <div style={{ fontFamily: SAIRA, fontSize: 13, fontWeight: 900, color: '#6dd5fa' }}>
              {displayWeekPos} / 7
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
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
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
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
        </div>

        {/* Reward info */}
        <div style={{
          background: alpha(C.surface2, 0.8),
          border: `1px solid ${C.border}`,
          borderRadius: 14, padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub, letterSpacing: '2px', fontWeight: 700, marginBottom: 1 }}>
            REWARD DETAILS
          </div>
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
        </div>

        {/* Total stats */}
        <div style={{
          background: alpha(C.surface2, 0.8),
          border: `1px solid ${C.border}`,
          borderRadius: 14, padding: '11px 16px',
        }}>
          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textSub, letterSpacing: '2px', fontWeight: 700, marginBottom: 10 }}>
            TOTAL STATS
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, color: C.text, lineHeight: 1 }}>
                {total}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>累計ログイン日数</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, color: C.gold, lineHeight: 1 }}>
                {streak}
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>連続ログイン日数</div>
            </div>
            <div style={{ width: 1, background: C.border }} />
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <JewelIcon size={18} />
                <span style={{ fontFamily: SAIRA, fontSize: 26, fontWeight: 900, color: '#6dd5fa', lineHeight: 1 }}>
                  {totalJewels}
                </span>
              </div>
              <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>累計取得ジュエル</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
