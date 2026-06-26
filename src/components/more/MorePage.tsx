import { useState, useEffect } from 'react'
import { useGameStore } from '../../store/gameStore'
import { ovr } from '../../utils/playerUtils'
import { audio } from '../../utils/audio'
import { C, alpha } from '../../styles/tokens'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

type NewsItem = { date: string; title: string; body: string }

const NEWS_FALLBACK: NewsItem[] = [
  { date: '2026.06.13', title: 'JPEL Manager 配信開始', body: '日本プロ駅伝リーグGMシミュレーター、ついにリリース！' },
]

const NEWS_URL = 'https://tokinets.com/jpel-news.json'

export default function MorePage({ onBackToTitle }: { onBackToTitle?: () => void }) {
  const { resetGame, pastSeasons, teams, players, playerTeamId, currentSeason } = useGameStore()

  const [news, setNews] = useState<NewsItem[]>(NEWS_FALLBACK)

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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {news.map((item, i) => (
              <div key={i} style={{ borderBottom: i < news.length - 1 ? `1px solid ${C.border}` : 'none', paddingBottom: i < news.length - 1 ? '10px' : 0 }}>
                <div style={{ fontSize: '9px', color: C.textDim, letterSpacing: '1px', marginBottom: '4px', fontFamily: SAIRA }}>{item.date}</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: C.text, marginBottom: '3px', fontFamily: SAIRA }}>{item.title}</div>
                <div style={{ fontSize: '11px', color: C.textSub, lineHeight: 1.5, fontFamily: SAIRA }}>{item.body}</div>
              </div>
            ))}
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

      {/* 特別イベント */}
      {/* TODO: 世界駅伝選手権（未実装） */}

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
          <div style={{ fontSize: '14px', color: C.textSub, fontFamily: SAIRA }}>JPEL Manager v0.1.0</div>
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
