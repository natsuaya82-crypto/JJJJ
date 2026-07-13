import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { audio } from '../../utils/audio'
import { purchaseAdFree, restoreAdFree } from '../../utils/iap'
import { TeamLogoSVG } from '../icons/Icons'
import LogoSelectSheet from '../shared/LogoSelectSheet'

import { C, alpha } from '../../styles/tokens'

import { APP_VERSION } from '../../data/appMeta'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// 広告なし版IAPの表示フラグ（有料アプリ契約が有効になったら true に戻す）
const IAP_ENABLED = false

const OVERLAY_BG = '#0A0912'
const HEADER_H = 49  // Layout.tsx のヘッダー高と同値。詳細画面をヘッダーの下から始める

const CARD: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
  border: `1px solid ${alpha(C.gold, 0.14)}`,
  borderRadius: 14, overflow: 'hidden',
}

// ── アイコン ──
const IcTeam = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
const IcSound = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
const IcX = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
const IcHome = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcTrash = <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
const Chevron = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.textDim, flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>

// 設定リストの1行（独立カード）
function SettingRow({ icon, label, sub, onClick, danger }: {
  icon: React.ReactNode; label: string; sub?: string; onClick: () => void; danger?: boolean
}) {
  const accent = danger ? C.red : C.gold
  return (
    <button
      onClick={onClick}
      className="btn-press"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 13,
        padding: '13px 14px', marginBottom: 10, borderRadius: 14,
        background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
        border: `1px solid ${alpha(accent, 0.16)}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.04)',
        cursor: 'pointer', fontFamily: SAIRA,
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(180deg, ${alpha(accent, 0.22)} 0%, ${alpha(accent, 0.06)} 100%)`,
        border: `1px solid ${alpha(accent, 0.3)}`,
        color: accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 2px 8px ${alpha(accent, 0.12)}`,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: danger ? C.red : C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
      </div>
      {Chevron}
    </button>
  )
}

// 詳細画面（フルスクリーンのオーバーレイ）
function DetailScreen({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', top: `calc(${HEADER_H}px + env(safe-area-inset-top))`, left: 0, right: 0, bottom: 0,
      zIndex: 1000, backgroundColor: OVERLAY_BG,
      maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', fontFamily: SAIRA,
    }}>
      <div style={{
        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px',
        borderBottom: `1px solid ${alpha(C.gold, 0.12)}`,
      }}>
        <button onClick={onClose} style={{
          background: alpha(C.gold, 0.1), border: `1px solid ${alpha(C.gold, 0.25)}`, borderRadius: 10, cursor: 'pointer', color: C.gold,
          padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, flexShrink: 0,
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{title}</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 16px 32px' }}>
        {children}
      </div>
    </div>
  )
}

type Detail = null | 'team' | 'sound' | 'reset'

export default function MorePage({ onBackToTitle }: { onBackToTitle?: () => void }) {
  const { resetGame } = useGameStore()
  const teams = useGameStore(s => s.teams)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const myTeam = teams.find(t => t.id === playerTeamId)

  const [detail, setDetail] = useState<Detail>(null)

  return (
    <div className="page-enter" style={{ padding: '20px 16px 32px', fontFamily: SAIRA }}>

      {/* ページヘッダー */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 4, height: 34, borderRadius: 2, background: `linear-gradient(180deg, ${C.gold}, ${alpha(C.gold, 0.25)})`, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 9, color: alpha(C.gold, 0.5), letterSpacing: '4px', marginBottom: 3 }}>SETTINGS</div>
          <div style={{ fontSize: 26, fontWeight: 900, color: C.text, lineHeight: 1 }}>設定</div>
        </div>
      </div>

      {/* 設定リスト */}
      <div>
        <SettingRow icon={IcTeam} label="チーム編集" sub={myTeam ? `${myTeam.name}・GM ${myTeam.gmName}` : undefined} onClick={() => setDetail('team')} />
        <SettingRow icon={IcSound} label="サウンド" sub="SE・BGMの音量" onClick={() => setDetail('sound')} />
        <SettingRow icon={IcX} label="公式X（@JPEL_MANAGER）" sub="アップデート情報・お問い合わせ" onClick={() => window.open('https://x.com/JPEL_MANAGER', '_blank')} />
        {onBackToTitle && <SettingRow icon={IcHome} label="タイトルに戻る" onClick={onBackToTitle} />}
        <SettingRow icon={IcTrash} label="データリセット" sub="セーブを削除して最初から" danger onClick={() => setDetail('reset')} />
      </div>

      {/* 広告なし版IAP：契約が通るまで一時非表示。復活時は IAP_ENABLED を true に */}
      {IAP_ENABLED && <div style={{ marginTop: 16 }}><PremiumCard /></div>}

      {/* フッター */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 10, color: C.textGhost, letterSpacing: '1px' }}>JPEL Manager {APP_VERSION}</div>
        <button
          onClick={() => window.open('https://tokinets.com/privacy.html', '_blank')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SAIRA, padding: '2px 0' }}
        >
          <span style={{ fontSize: 11, color: alpha(C.textGhost, 0.55) }}>プライバシーポリシー</span>
        </button>
      </div>

      {/* 詳細画面 */}
      {detail === 'team' && <TeamEditScreen onClose={() => setDetail(null)} />}
      {detail === 'sound' && <SoundScreen onClose={() => setDetail(null)} />}
      {detail === 'reset' && <ResetScreen resetGame={resetGame} onClose={() => setDetail(null)} />}
    </div>
  )
}

function TeamEditScreen({ onClose }: { onClose: () => void }) {
  const teams = useGameStore(s => s.teams)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const updateMyTeam = useGameStore(s => s.updateMyTeam)
  const team = teams.find(t => t.id === playerTeamId)

  const [name, setName] = useState(team?.name ?? '')
  const [shortName, setShortName] = useState(team?.shortName ?? '')
  const [gmName, setGmName] = useState(team?.gmName ?? '')
  const [logoId, setLogoId] = useState(team?.logoId ?? '')
  const [saved, setSaved] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!team) return null

  const dirty = name.trim() !== team.name || shortName.trim() !== team.shortName || gmName.trim() !== team.gmName || logoId !== (team.logoId ?? '')
  const valid = name.trim() !== '' && shortName.trim() !== '' && gmName.trim() !== ''

  const handleSave = () => {
    if (!dirty || !valid) return
    updateMyTeam({ name: name.trim(), shortName: shortName.trim(), gmName: gmName.trim(), logoId: logoId || undefined })
    audio.playSe('tap')
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 10, border: 'none',
    backgroundColor: '#1E1B2E', color: C.text, fontSize: 15,
    fontFamily: SAIRA, outline: 'none', boxShadow: `inset 0 0 0 1px ${alpha(C.gold, 0.14)}`,
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { fontSize: 11, color: C.textSub, letterSpacing: '1px', marginBottom: 8 }

  return (
    <DetailScreen title="チーム編集" onClose={onClose}>
      {/* ロゴ */}
      <div style={{ ...labelStyle }}>ロゴ</div>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 12px', marginBottom: 18, borderRadius: 12, cursor: 'pointer',
          backgroundColor: alpha('#000', 0.25), border: `1px solid ${alpha(C.gold, 0.14)}`,
        }}
      >
        <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} logoId={logoId} size={40}/>
        </div>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 700, color: C.text, fontFamily: SAIRA }}>変更する</span>
        {Chevron}
      </button>

      {/* チーム名 */}
      <div style={labelStyle}>チーム名</div>
      <input type="text" value={name} onChange={e => setName(e.target.value)} maxLength={20} style={{ ...inputStyle, marginBottom: 14 }}/>

      {/* 略称 */}
      <div style={labelStyle}>略称（3文字まで）</div>
      <input type="text" value={shortName} onChange={e => setShortName(e.target.value)} maxLength={3} style={{ ...inputStyle, marginBottom: 14 }}/>

      {/* GM名 */}
      <div style={labelStyle}>GM名</div>
      <input type="text" value={gmName} onChange={e => setGmName(e.target.value)} maxLength={15} style={{ ...inputStyle, marginBottom: 22 }}/>

      <button
        onClick={handleSave}
        disabled={!dirty || !valid}
        style={{
          width: '100%', padding: '14px', borderRadius: 12, border: 'none',
          background: (dirty && valid) ? `linear-gradient(180deg, #E8C86A 0%, #C9A84C 100%)` : alpha(C.gold, 0.12),
          color: (dirty && valid) ? '#0A0912' : alpha(C.text, 0.4),
          fontSize: 15, fontWeight: 900, fontFamily: SAIRA,
          cursor: (dirty && valid) ? 'pointer' : 'default', letterSpacing: '1px',
        }}
      >
        {saved ? '保存しました' : '保存'}
      </button>

      {sheetOpen && (
        <LogoSelectSheet team={team} value={logoId} onSelect={setLogoId} onClose={() => setSheetOpen(false)} />
      )}
    </DetailScreen>
  )
}

function SoundScreen({ onClose }: { onClose: () => void }) {
  const [volSe, setVolSe] = useState(() => parseFloat(localStorage.getItem('jpel-volume-se') ?? '0.5'))
  const [volMusic, setVolMusic] = useState(() => parseFloat(localStorage.getItem('jpel-volume-music') ?? '0.5'))

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

  return (
    <DetailScreen title="サウンド" onClose={onClose}>
      <div style={CARD}>
        {([
          { label: 'SE', value: volSe, onChange: handleVolSe },
          { label: 'MUSIC', value: volMusic, onChange: handleVolMusic },
        ] as const).map(({ label, value, onChange }, i) => (
          <div key={label} style={{
            padding: '16px 16px',
            borderBottom: i === 0 ? `1px solid ${alpha(C.gold, 0.07)}` : 'none',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {label === 'SE' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: C.gold, flexShrink: 0 }}>
                    <path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                    <path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: C.gold, flexShrink: 0 }}>
                    <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="6" cy="18" r="3" stroke="currentColor" strokeWidth="1.8"/>
                    <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.8"/>
                  </svg>
                )}
                <span style={{ fontSize: 12, fontWeight: 800, color: C.textSub, letterSpacing: '1px' }}>{label}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: Math.round(value * 100) === 0 ? C.textGhost : C.gold, minWidth: 28, textAlign: 'right' }}>
                {Math.round(value * 100)}
              </span>
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
    </DetailScreen>
  )
}

function ResetScreen({ resetGame, onClose }: { resetGame: () => void; onClose: () => void }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <DetailScreen title="データリセット" onClose={onClose}>
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: '#1A0D0D',
        border: `2px solid ${alpha(C.red, 0.45)}`,
        borderRadius: 14,
        boxShadow: `0 4px 0 #660e10, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)`,
        padding: '16px',
      }}>
        <div style={{ position: 'absolute', inset: 4, border: `1px solid ${alpha(C.red, 0.12)}`, borderRadius: 10, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '10px', color: C.red, letterSpacing: '2px', opacity: 0.7, marginBottom: '10px', fontFamily: SAIRA }}>危険な操作</div>
          <div style={{ fontSize: '13px', color: '#8a5a5a', marginBottom: '16px', lineHeight: 1.7, fontFamily: SAIRA }}>
            セーブデータをすべて削除してゲームを最初からやり直します。この操作は取り消せません。
          </div>
          {confirming ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirming(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 11,
                  border: `1px solid ${C.border}`, background: 'transparent',
                  color: C.textSub, fontSize: '13px', fontWeight: '700', cursor: 'pointer', fontFamily: SAIRA,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={resetGame}
                style={{
                  flex: 1, padding: '12px', borderRadius: 11,
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
                width: '100%', padding: '13px 18px', borderRadius: 11,
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
    </DetailScreen>
  )
}

function PremiumCard() {
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
      } else if (res === 'pending') {
        setMsg('購入の承認待ちです。承認されると自動で反映されます。')
      } else if (res === 'unavailable') {
        setMsg('ストアで商品情報を取得できませんでした。しばらくしてから再度お試しください。')
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

  const CY = '#6dd5fa'

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(160deg, #0c2035 0%, #071525 60%, #0e1e2e 100%)`,
      border: `2px solid ${alpha(CY, 0.55)}`,
      borderRadius: 16,
      boxShadow: `0 4px 0 #040e1a, 0 8px 28px ${alpha(CY, 0.18)}, inset 0 1px 0 ${alpha(CY, 0.12)}`,
      padding: '18px 16px 16px',
      marginBottom: '12px',
    }}>
      {/* 上端のシアングロー */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent 0%, ${alpha(CY, 0.6)} 50%, transparent 100%)`, pointerEvents: 'none' }} />
      {/* 右上コーナーグロー */}
      <div style={{ position: 'absolute', top: -40, right: -40, width: 120, height: 120, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(CY, 0.12)} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ヘッダー：タイトルと価格を横並び */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, color: CY, letterSpacing: '3px', fontWeight: 900, fontFamily: SAIRA, marginBottom: 4, textShadow: `0 0 10px ${alpha(CY, 0.5)}` }}>AD FREE</div>
            <div style={{ fontSize: 21, fontWeight: 900, color: '#fff', fontFamily: SAIRA, lineHeight: 1.1 }}>広告なし版</div>
            <div style={{ fontSize: 10, color: alpha(CY, 0.6), fontFamily: SAIRA, marginTop: 3 }}>買い切り — 月額なし</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 32, fontWeight: 900, color: CY, fontFamily: SAIRA, lineHeight: 1, textShadow: `0 0 20px ${alpha(CY, 0.7)}` }}>¥500</div>
          </div>
        </div>

        {/* メリット一覧 */}
        <div style={{ borderRadius: 11, background: alpha('#000', 0.28), border: `1px solid ${alpha(CY, 0.14)}`, padding: '12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { badge: 'OFF', label: 'バナー広告を完全削除', sub: '画面下のスペースがすっきり' },
            { badge: '×2', label: 'ログインボーナス毎日2倍', sub: 'ジュエルの貯まり方が変わる' },
          ].map(({ badge, label, sub }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: `linear-gradient(180deg, ${alpha(CY, 0.22)} 0%, ${alpha(CY, 0.08)} 100%)`,
                border: `1.5px solid ${alpha(CY, 0.4)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: CY, fontSize: 12, fontWeight: 900, fontFamily: SAIRA,
                boxShadow: `0 2px 8px ${alpha(CY, 0.15)}`,
              }}>
                {badge}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#e8f8ff', fontFamily: SAIRA, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: alpha('#fff', 0.38), fontFamily: SAIRA }}>{sub}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: alpha('#fff', 0.25), fontFamily: SAIRA, marginTop: 2, paddingTop: 8, borderTop: `1px solid ${alpha('#fff', 0.08)}` }}>
            ※大成功・ジュエル追加の動画広告は従来通り
          </div>
        </div>

        {adsRemoved ? (
          <div style={{
            padding: '14px', borderRadius: 12, textAlign: 'center',
            background: alpha(CY, 0.1), border: `1.5px solid ${alpha(CY, 0.4)}`,
            color: CY, fontSize: 14, fontWeight: 900, fontFamily: SAIRA,
            letterSpacing: '1px', textShadow: `0 0 14px ${alpha(CY, 0.5)}`,
          }}>
            購入済み
          </div>
        ) : (
          <>
            <button
              onClick={handlePurchase}
              disabled={busy}
              style={{
                position: 'relative', overflow: 'hidden',
                width: '100%', padding: '16px', borderRadius: 13, cursor: busy ? 'default' : 'pointer',
                background: `linear-gradient(180deg, #1e6fa0 0%, #0f3d60 50%, #071e30 100%)`,
                border: `2px solid ${CY}`,
                boxShadow: `0 5px 0 #030d16, 0 8px 28px ${alpha(CY, 0.35)}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: '#fff', opacity: busy ? 0.6 : 1,
                letterSpacing: '0.5px',
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)`, pointerEvents: 'none' }} />
              {busy ? '処理中…' : '今すぐ購入　¥500'}
            </button>
            <button
              onClick={handleRestore}
              disabled={busy}
              style={{
                width: '100%', padding: '9px', marginTop: 8, borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                background: 'transparent', border: `1px solid ${alpha('#fff', 0.1)}`, color: alpha('#fff', 0.28),
                fontSize: 11, fontWeight: 700, fontFamily: SAIRA, opacity: busy ? 0.6 : 1,
              }}
            >
              購入を復元
            </button>
          </>
        )}

        {msg && <div style={{ marginTop: 10, fontSize: 11, color: alpha(CY, 0.8), lineHeight: 1.5, fontFamily: SAIRA, textAlign: 'center' }}>{msg}</div>}
      </div>
    </div>
  )
}
