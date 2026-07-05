import { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { audio } from '../../utils/audio'
import { purchaseAdFree, restoreAdFree } from '../../utils/iap'
import { C, alpha } from '../../styles/tokens'

import { APP_VERSION, CHANGELOG } from '../../data/appMeta'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type NewsItem = { date: string; title: string; body: string }

// お知らせの既定値は更新履歴（CHANGELOG）。リモートに新しいお知らせがあれば上書きする。
const NEWS_FALLBACK: NewsItem[] = CHANGELOG.map(c => ({ date: c.date, title: c.title, body: c.body }))

const NEWS_URL = 'https://tokinets.com/jpel-news.json'

export default function MorePage({ onBackToTitle }: { onBackToTitle?: () => void }) {
  const { resetGame, pastSeasons, teams, players, playerTeamId, currentSeason } = useGameStore()

  const [news, setNews] = useState<NewsItem[]>(NEWS_FALLBACK)
  const [openNewsIdx, setOpenNewsIdx] = useState<number | null>(0)  // 最新だけ開いた状態。タップで詳細を展開。

  const [volSe, setVolSe] = useState(() => parseFloat(localStorage.getItem('jpel-volume-se') ?? '0.5'))
  const [volMusic, setVolMusic] = useState(() => parseFloat(localStorage.getItem('jpel-volume-music') ?? '0.5'))

  useEffect(() => {
    fetch(NEWS_URL)
      .then(r => r.json())
      .then((data: NewsItem[]) => { if (Array.isArray(data) && data.length > 0) setNews(data) })
      .catch(() => {})
  }, [])

  function handleVolSe(v: number) {
    setVolSe(v)
    localStorage.setItem('jpel-volume-se', String(v))
    audio.setSeVolume(v)
    audio.playSe('tap')
  }
  function handleVolMusic(v: number) {
    setVolMusic(v)
    localStorage.setItem('jpel-volume-music', String(v))
    audio.setMusicVolume(v)
  }

  const myTeam = teams.find(t => t.id === playerTeamId)
  const championships = myTeam?.history.championships ?? 0
  const allSeasons = [...pastSeasons, ...(currentSeason.currentRaceIndex > 0 ? [currentSeason] : [])]
    .slice(-6).reverse()
  const myMainPlayers = players
    .filter(p => p.teamId === playerTeamId && p.rosterTier === 'main')
    .sort((a, b) => ovr(b) - ovr(a))
    .slice(0, 3)

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
    border: `2px solid ${C.goldDark}`,
    borderRadius: 14,
    boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
    padding: '14px',
    marginBottom: '12px',
  }

  return (
    <div className="page-enter" style={{ padding: '20px 16px 24px', fontFamily: SAIRA }}>
      <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '3px', marginBottom: '20px', fontFamily: SAIRA, textShadow: `0 0 12px ${alpha(C.gold, 0.25)}` }}>
        設定
      </div>

      {/* お知らせ */}
      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '12px', fontFamily: SAIRA }}>お知らせ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {news.map((item, i) => {
              const open = openNewsIdx === i
              return (
                <div key={i} style={{ borderBottom: i < news.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <button
                    onClick={() => setOpenNewsIdx(open ? null : i)}
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '1px', marginBottom: '4px', fontFamily: SAIRA }}>{item.date}</div>
                      <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, fontFamily: SAIRA }}>{item.title}</div>
                    </div>
                    <span style={{ color: C.textDim, fontSize: 12, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>›</span>
                  </button>
                  {open && (
                    <div style={{ fontSize: '11px', color: C.textSub, lineHeight: 1.6, fontFamily: SAIRA, padding: '0 0 12px' }}>{item.body}</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {false && (allSeasons.length > 0 || championships > 0) && (
        <div style={cardStyle}>
          <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '12px', fontFamily: SAIRA }}>
              フランチャイズ記録
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: championships > 0 ? '14px' : '4px', flexWrap: 'wrap' }}>
              {Array.from({ length: Math.min(championships, 6) }).map((_, i) => (
                <div key={i} style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.25)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill={C.gold}>
                    <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"/>
                  </svg>
                </div>
              ))}
              {championships === 0 && <span style={{ fontSize: '12px', color: C.textGhost, fontFamily: SAIRA }}>まだ優勝なし</span>}
            </div>

            {allSeasons.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '1.5px', marginBottom: '8px', fontFamily: SAIRA }}>シーズン成績</div>
                {allSeasons.map(season => {
                  const standings = [...(season.standings ?? [])].sort((a, b) => b.totalPoints - a.totalPoints)
                  const rank = standings.findIndex(s => s.teamId === playerTeamId) + 1
                  const pts = season.standings?.find(s => s.teamId === playerTeamId)?.totalPoints ?? 0
                  const rankCol = rank === 1 ? C.gold : rank <= 3 ? C.green : C.textDim
                  const isCurrent = season.year === currentSeason.year
                  return (
                    <div key={season.year} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '7px 0', borderBottom: `1px solid ${C.border}`,
                    }}>
                      <span style={{ fontSize: '12px', color: C.textDim, width: '40px', flexShrink: 0, fontFamily: SAIRA }}>{season.year}</span>
                      {isCurrent && (
                        <span style={{ fontSize: '9px', padding: '1px 6px', borderRadius: '6px', backgroundColor: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.30)}`, color: C.gold, fontWeight: '700', fontFamily: SAIRA }}>進行中</span>
                      )}
                      <span style={{ flex: 1 }}/>
                      <span style={{ fontSize: '18px', fontWeight: '900', color: rankCol, fontFamily: SAIRA, textShadow: rank === 1 ? `0 0 12px ${alpha(C.gold, 0.25)}` : 'none' }}>
                        {rank > 0 ? rank : '—'}
                      </span>
                      <span style={{ fontSize: '10px', color: C.textDim, fontFamily: SAIRA }}>位</span>
                      <span style={{ fontSize: '12px', color: C.textDim, minWidth: '40px', textAlign: 'right', fontFamily: SAIRA }}>
                        {pts}pt
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {myMainPlayers.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '1.5px', marginBottom: '8px', fontFamily: SAIRA }}>主力選手</div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {myMainPlayers.map(p => {
                    const o = ovr(p)
                    return (
                      <div key={p.id} style={{
                        flex: 1, padding: '8px', borderRadius: '10px',
                        backgroundColor: C.surface2, border: `1px solid ${C.border}`,
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: '18px', fontWeight: '900', color: o >= 80 ? C.gold : C.textSub, fontFamily: SAIRA, textShadow: o >= 80 ? `0 0 10px ${alpha(C.gold, 0.25)}` : 'none' }}>
                          {o}
                        </div>
                        <div style={{ fontSize: '11px', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: SAIRA }}>
                          {p.name}
                        </div>
                        <div style={{ fontSize: '10px', color: C.textDim, marginTop: '2px', fontFamily: SAIRA }}>{p.age}歳</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 広告なし版（買い切り）— 課金接続は次リリースで有効化するため現在は非表示 */}
      {false && <PremiumCard cardStyle={cardStyle} />}

      {/* サウンド */}
      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '10px', color: C.gold, letterSpacing: '2px', marginBottom: '14px', fontFamily: SAIRA }}>サウンド</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {[
              { label: 'SE', value: volSe, onChange: handleVolSe },
              { label: 'MUSIC', value: volMusic, onChange: handleVolMusic },
            ].map(({ label, value, onChange }) => (
              <div key={label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: C.textSub, fontFamily: SAIRA, fontWeight: '700', letterSpacing: '1px' }}>{label}</span>
                  <span style={{ fontSize: '11px', color: C.textDim, fontFamily: SAIRA }}>{Math.round(value * 100)}</span>
                </div>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={value}
                  onChange={e => onChange(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: C.gold }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* バージョン情報 */}
      <div style={cardStyle}>
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,200,66,0.15)', borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '10px', color: C.textDim, letterSpacing: '2px', marginBottom: '8px', fontFamily: SAIRA }}>バージョン情報</div>
          <div style={{ fontSize: '14px', color: C.textSub, fontFamily: SAIRA }}>JPEL Manager {APP_VERSION}</div>
          <div style={{ fontSize: '12px', color: C.textGhost, marginTop: '4px', fontFamily: SAIRA }}>Japan Pro Ekiden League — GM Simulation</div>
        </div>
      </div>

      {/* タイトルへ戻る */}
      {onBackToTitle && (
        <button
          onClick={onBackToTitle}
          className="btn-press"
          style={{
            width: '100%', padding: '14px 16px', borderRadius: 14,
            background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
            border: `2px solid ${C.goldDark}`,
            boxShadow: '0 4px 0 #5a3500, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
            color: C.textSub, fontSize: '14px', fontWeight: '700',
            cursor: 'pointer', fontFamily: SAIRA,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '12px',
          } as React.CSSProperties}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          タイトルに戻る
        </button>
      )}

      {/* 危険な操作 */}
      <ResetCard resetGame={resetGame} />

      {/* プライバシーポリシー */}
      <button
        onClick={() => window.open('https://tokinets.com/privacy.html', '_blank')}
        style={{
          width: '100%', padding: '14px 16px', marginTop: '8px',
          background: 'none', border: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          cursor: 'pointer', fontFamily: SAIRA,
        }}
      >
        <span style={{ fontSize: '12px', color: C.textGhost }}>プライバシーポリシー</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M9 18l6-6-6-6" stroke={C.textGhost} strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  )
}

function PremiumCard({ cardStyle }: { cardStyle: React.CSSProperties }) {
  const adsRemoved = useGameStore(s => s.adsRemoved ?? false)
  const setAdsRemoved = useGameStore(s => s.setAdsRemoved)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const handlePurchase = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await purchaseAdFree()
      if (res === 'purchased') {
        setAdsRemoved(true)
        audio.playSe('reward')
        setMsg('ありがとうございます！広告なし版が有効になりました。')
      } else if (res === 'cancelled') {
        setMsg('購入をキャンセルしました。')
      } else if (res === 'unavailable') {
        setMsg('現在この端末では購入を準備中です。')
      } else {
        setMsg('購入に失敗しました。時間をおいて再度お試しください。')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const owned = await restoreAdFree()
      if (owned) { setAdsRemoved(true); setMsg('購入を復元しました。') }
      else setMsg('復元できる購入が見つかりませんでした。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cardStyle, borderColor: alpha('#6dd5fa', 0.5), boxShadow: `0 4px 0 #0e3f5a, 0 6px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)` }}>
      <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha('#6dd5fa', 0.15)}`, borderRadius: 10, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '10px', color: '#6dd5fa', letterSpacing: '2px', marginBottom: '10px', fontFamily: SAIRA }}>広告なし版</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {[
            '下部のバナー広告が消えます',
            'ログインボーナスが常時2倍',
            '※大成功・ジュエル追加は従来通り動画視聴',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: i < 2 ? '#6dd5fa' : C.textGhost, marginTop: 6, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: i < 2 ? C.textSub : C.textDim, lineHeight: 1.5, fontFamily: SAIRA }}>{t}</div>
            </div>
          ))}
        </div>

        {adsRemoved ? (
          <div style={{ padding: '11px', borderRadius: 11, textAlign: 'center', background: alpha('#6dd5fa', 0.1), border: `1px solid ${alpha('#6dd5fa', 0.4)}`, color: '#6dd5fa', fontSize: 13, fontWeight: 800, fontFamily: SAIRA }}>
            購入済み — 広告なし・ログボ2倍
          </div>
        ) : (
          <>
            <button
              onClick={handlePurchase}
              disabled={busy}
              style={{
                width: '100%', padding: '13px', borderRadius: 12, cursor: busy ? 'default' : 'pointer',
                background: `linear-gradient(180deg, #1a4a7a 0%, #0f2a4a 100%)`,
                border: `2px solid ${alpha('#6dd5fa', 0.6)}`,
                boxShadow: `0 4px 0 #061525, 0 6px 16px ${alpha('#6dd5fa', 0.2)}`,
                fontFamily: SAIRA, fontSize: 15, fontWeight: 900, color: '#6dd5fa', opacity: busy ? 0.6 : 1,
              }}
            >
              広告なし版を購入（¥500）
            </button>
            <button
              onClick={handleRestore}
              disabled={busy}
              style={{
                width: '100%', padding: '9px', marginTop: 8, borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                background: 'transparent', border: `1px solid ${C.border2}`, color: C.textDim,
                fontSize: 12, fontWeight: 700, fontFamily: SAIRA, opacity: busy ? 0.6 : 1,
              }}
            >
              購入を復元
            </button>
          </>
        )}

        {msg && <div style={{ marginTop: 10, fontSize: 11, color: C.textSub, lineHeight: 1.5, fontFamily: SAIRA, textAlign: 'center' }}>{msg}</div>}
      </div>
    </div>
  )
}

function ResetCard({ resetGame }: { resetGame: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: '#1A0D0D',
      border: `2px solid ${alpha(C.red, 0.45)}`,
      borderRadius: 14,
      boxShadow: `0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
      padding: '14px',
      marginBottom: '8px',
    }}>
      <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.red, 0.12)}`, borderRadius: 10, pointerEvents: 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ fontSize: '10px', color: C.red, letterSpacing: '2px', opacity: 0.7, marginBottom: '10px', fontFamily: SAIRA }}>危険な操作</div>
        <div style={{ fontSize: '12px', color: '#5C3030', marginBottom: '14px', lineHeight: 1.6, fontFamily: SAIRA }}>
          セーブデータをすべて削除してゲームを最初からやり直します。この操作は取り消せません。
        </div>
        {confirming ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setConfirming(false)}
              style={{
                flex: 1, padding: '11px', borderRadius: 11,
                border: `1px solid ${C.border}`, background: 'transparent',
                color: C.textSub, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
              }}
            >
              キャンセル
            </button>
            <button
              onClick={resetGame}
              style={{
                flex: 1, padding: '11px', borderRadius: 11,
                border: `2px solid ${C.red}`,
                background: `linear-gradient(180deg, #3d0a0a, #2a0606)`,
                color: C.red, fontSize: '13px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
                boxShadow: `0 4px 0 #660e10`,
              }}
            >
              本当に削除する
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            style={{
              position: 'relative', overflow: 'hidden',
              width: '100%', padding: '11px 18px', borderRadius: 11,
              border: `2px solid ${alpha(C.red, 0.45)}`,
              background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
              color: C.red,
              fontSize: '13px', fontWeight: '800', cursor: 'pointer', fontFamily: SAIRA,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              boxShadow: `0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${alpha(C.red, 0.3)}, transparent)`, pointerEvents: 'none' }} />
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ position: 'relative', zIndex: 1 }}>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ position: 'relative', zIndex: 1 }}>ゲームをリセット</span>
          </button>
        )}
      </div>
    </div>
  )
}
