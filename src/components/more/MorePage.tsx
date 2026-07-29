import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { audio } from '../../utils/audio'
import { purchaseAdFree, restoreAdFree } from '../../utils/iap'
import { TeamLogoSVG } from '../icons/Icons'
import LogoSelectSheet from '../shared/LogoSelectSheet'
import NoticeDialog from '../ui/NoticeDialog'

import { C, alpha } from '../../styles/tokens'

import { APP_VERSION } from '../../data/appMeta'

const SAIRA = "'Saira Condensed', system-ui, sans-serif"

// GMパス（買い切りIAP）の表示フラグ（有料アプリ契約が有効になったら true に戻す）
const IAP_ENABLED = true

const OVERLAY_BG = C.bg
const HEADER_H = 49  // Layout.tsx のヘッダー高と同値。詳細画面をヘッダーの下から始める

const CARD: React.CSSProperties = {
  background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
  border: `1px solid ${alpha(C.gold, 0.14)}`,
  borderRadius: 14, overflow: 'hidden',
}

// ── アイコン ──
const IcTeam = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
const IcSound = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M15.54 8.46a5 5 0 010 7.07" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
const IcRace = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 4v16M4 5h13l-2.5 3.5L17 12H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcX = <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
const IcHome = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M3 12l9-9 9 9M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
const IcTrash = <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
const Chevron = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.textDim, flexShrink: 0 }}><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>

// ── 課金カードの特典アイコン ──
const IcBannerOff = <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="2.5" y="14" width="19" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.7"/><path d="M4 21.5L20 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>
const IcFullOff = <svg width="19" height="19" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2.4" stroke="currentColor" strokeWidth="1.7"/><path d="M4 20.5L20.5 3.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>
const IcStarBadge = <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3.2l2.5 5.7 6.2.5-4.7 4 1.4 6-5.4-3.2-5.4 3.2 1.4-6-4.7-4 6.2-.5z" fill="currentColor"/></svg>
const IcTwoX = <span style={{ fontSize: 13, fontWeight: 900, fontFamily: SAIRA, letterSpacing: '-0.5px' }}>×2</span>

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
          background: 'transparent', border: 'none', cursor: 'pointer', color: C.text,
          padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, flexShrink: 0,
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
  const raceEventsEnabled = useGameStore(s => s.raceEventsEnabled ?? true)
  const setRaceEventsEnabled = useGameStore(s => s.setRaceEventsEnabled)

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

      {/* GMパス（買い切り）：一番目に付く位置に置く。IAP_ENABLED で表示を切り替え */}
      {IAP_ENABLED && <PremiumCard />}

      {/* 設定リスト */}
      <div>
        <SettingRow icon={IcTeam} label="チーム編集" sub={myTeam ? `${myTeam.name}・GM ${myTeam.gmName}` : undefined} onClick={() => setDetail('team')} />
        <SettingRow icon={IcSound} label="サウンド" sub="SE・BGMの音量" onClick={() => setDetail('sound')} />
        <SettingRow
          icon={IcRace}
          label="レース中の選択イベント"
          sub={raceEventsEnabled ? 'オン（区間ごとに監督判断あり）' : 'オフ（流し見・自動進行）'}
          onClick={() => setRaceEventsEnabled(!raceEventsEnabled)}
        />
        <SettingRow icon={IcX} label="公式X（@JPEL_MANAGER）" sub="アップデート情報・お問い合わせ" onClick={() => window.open('https://x.com/JPEL_MANAGER', '_blank')} />
        {onBackToTitle && <SettingRow icon={IcHome} label="タイトルに戻る" onClick={onBackToTitle} />}
        <SettingRow icon={IcTrash} label="データリセット" sub="セーブを削除して最初から" danger onClick={() => setDetail('reset')} />
      </div>

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
  const [region, setRegion] = useState(team?.region ?? '')
  const [city, setCity] = useState(team?.city ?? '')
  const [saved, setSaved] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  if (!team) return null

  const dirty = name.trim() !== team.name || shortName.trim() !== team.shortName || gmName.trim() !== team.gmName || logoId !== (team.logoId ?? '') || region.trim() !== team.region || city.trim() !== team.city
  const valid = name.trim() !== '' && shortName.trim() !== '' && gmName.trim() !== ''

  const handleSave = () => {
    if (!dirty || !valid) return
    updateMyTeam({ name: name.trim(), shortName: shortName.trim(), gmName: gmName.trim(), logoId: logoId || undefined, region: region.trim() || team.region, city: city.trim() || team.city })
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

      {/* 本拠地（地域・市）自由入力 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>地域</div>
          <input type="text" value={region} onChange={e => setRegion(e.target.value)} maxLength={10} placeholder="例：九州" style={inputStyle}/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>本拠地</div>
          <input type="text" value={city} onChange={e => setCity(e.target.value)} maxLength={12} placeholder="例：福岡" style={inputStyle}/>
        </div>
      </div>

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
  const [msg, setMsg] = useState<{ title: string; body?: string } | null>(null)

  const handlePurchase = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await purchaseAdFree()
      if (res === 'purchased') {
        setAdsRemoved(true)
        audio.playSe('reward')
        setMsg({ title: 'ありがとうございます！', body: 'GMパスが有効になりました。' })
      } else if (res === 'cancelled') {
        setMsg({ title: '購入をキャンセルしました' })
      } else if (res === 'pending') {
        setMsg({ title: '承認待ちです', body: 'ご家族の承認が下りたあと、アプリを開き直すと有効になります。反映されないときは「購入を復元」を押してください。' })
      } else if (res === 'unavailable') {
        setMsg({ title: '商品情報を取得できませんでした', body: 'App Storeに接続できないか、商品が一時的に取得できない状態です。通信環境をご確認のうえ、しばらくしてから再度お試しください。' })
      } else if (res === 'timeout') {
        setMsg({ title: '応答がありませんでした', body: 'App Storeからの返事が返ってきませんでした。もし購入が完了していた場合は「購入を復元」を押すと有効になります。二重に課金されることはありません。' })
      } else {
        setMsg({ title: '購入に失敗しました', body: '時間をおいて再度お試しください。' })
      }
    } catch {
      setMsg({ title: '購入に失敗しました', body: '時間をおいて再度お試しください。' })
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async () => {
    if (busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await restoreAdFree()
      if (res === 'restored') {
        setAdsRemoved(true)
        setMsg({ title: '購入を復元しました' })
      } else if (res === 'none') {
        setMsg({ title: '復元できる購入が見つかりませんでした', body: '購入時と同じApple IDでサインインしているかご確認ください。' })
      } else {
        // 通信できなかっただけの場合に「購入がありません」と出すと、
        // 購入済みの方に嘘の案内をしてしまうので必ず分ける。
        setMsg({ title: '確認できませんでした', body: 'App Storeに接続できませんでした。通信環境をご確認のうえ、もう一度お試しください。' })
      }
    } catch {
      setMsg({ title: '確認できませんでした', body: '時間をおいて再度お試しください。' })
    } finally {
      setBusy(false)
    }
  }

  const G = C.gold

  return (
    <div style={{
      position: 'relative', overflow: 'hidden',
      background: `linear-gradient(180deg, ${C.surface3} 0%, ${C.surface2} 100%)`,
      border: `1.5px solid ${alpha(G, 0.42)}`,
      borderRadius: 16,
      boxShadow: `0 3px 0 rgba(0,0,0,0.45), 0 10px 26px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.05)`,
      padding: '16px 15px 15px',
      marginBottom: '18px',
    }}>
      {/* 上端の金のハイライト（設定カードと同じ質感で、少し格を上げる） */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent 0%, ${alpha(G, 0.55)} 50%, transparent 100%)`, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: -50, right: -50, width: 150, height: 150, borderRadius: '50%', background: `radial-gradient(circle, ${alpha(G, 0.10)} 0%, transparent 70%)`, pointerEvents: 'none' }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* ヘッダー：ページ見出しと同じ「縦バー＋EYEBROW＋タイトル」の型 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <div style={{ width: 4, height: 34, borderRadius: 2, background: `linear-gradient(180deg, ${G}, ${alpha(G, 0.25)})`, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, color: alpha(G, 0.5), letterSpacing: '4px', marginBottom: 3 }}>GM PASS</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: C.text, lineHeight: 1 }}>GMパス</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 30, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.5px',
              background: `linear-gradient(180deg, ${C.goldHi} 0%, ${G} 52%, ${C.goldDark} 100%)`,
              WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: `drop-shadow(0 2px 8px ${alpha(G, 0.28)})`,
            }}>¥600</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: '1px', marginTop: 3 }}>買い切り・月額なし</div>
          </div>
        </div>

        {/* 特典一覧：設定カードのアイコンタイルと同じ形で揃える */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 13 }}>
          {[
            { icon: IcBannerOff, label: 'バナー広告を削除', sub: '画面下のスペースがすっきり' },
            { icon: IcFullOff, label: 'シーズン更新の全画面広告なし', sub: '「次のシーズンへ」がそのまま進む' },
            { icon: IcStarBadge, label: '大成功を1日1回タダで確約', sub: '合成画面のボタンから。毎朝10時に復活' },
            { icon: IcTwoX, label: 'ログインボーナス毎日2倍', sub: '100→200・7日目 1100→2200ジュエル' },
          ].map(({ icon, label, sub }, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                background: `linear-gradient(180deg, ${alpha(G, 0.22)} 0%, ${alpha(G, 0.06)} 100%)`,
                border: `1px solid ${alpha(G, 0.3)}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: G, boxShadow: `0 2px 8px ${alpha(G, 0.12)}`,
              }}>
                {icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 10, color: C.textDim }}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${alpha(G, 0.16)}, transparent)`, marginBottom: 12 }} />

        {adsRemoved ? (
          <div style={{
            padding: '14px', borderRadius: 13, textAlign: 'center',
            background: `linear-gradient(180deg, ${alpha(G, 0.16)}, ${alpha(G, 0.05)})`,
            border: `1.5px solid ${alpha(G, 0.45)}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M4 12.5l5 5L20 6.5" stroke={G} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 14, fontWeight: 900, color: G, letterSpacing: '1px' }}>購入済み — ありがとうございます</span>
          </div>
        ) : (
          <>
            <button
              onClick={handlePurchase}
              disabled={busy}
              className="btn-press"
              style={{
                position: 'relative', overflow: 'hidden',
                width: '100%', padding: '15px', borderRadius: 13, cursor: busy ? 'default' : 'pointer',
                background: `linear-gradient(180deg, ${C.goldHi} 0%, ${G} 46%, ${C.goldDark} 100%)`,
                border: `1.5px solid ${alpha('#fff5d0', 0.85)}`,
                boxShadow: `0 5px 0 #5a3500, 0 9px 24px ${alpha(G, 0.28)}, inset 0 1px 0 rgba(255,255,255,0.55)`,
                fontFamily: SAIRA, fontSize: 17, fontWeight: 900, color: '#3a2400', opacity: busy ? 0.6 : 1,
                letterSpacing: '0.5px',
              }}
            >
              {/* 上半分の艶 */}
              <span style={{ position: 'absolute', top: 1, left: 5, right: 5, height: '44%', background: 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0))', borderRadius: '9px 9px 40% 40%', pointerEvents: 'none' }} />
              <span style={{ position: 'relative' }}>{busy ? '処理中…' : '購入する　¥600'}</span>
            </button>
            <button
              onClick={handleRestore}
              disabled={busy}
              style={{
                width: '100%', padding: '10px', marginTop: 9, borderRadius: 11, cursor: busy ? 'default' : 'pointer',
                background: 'transparent', border: `1px solid ${alpha(G, 0.14)}`, color: C.textDim,
                fontSize: 11, fontWeight: 700, fontFamily: SAIRA, opacity: busy ? 0.6 : 1,
              }}
            >
              購入を復元
            </button>
          </>
        )}

        <div style={{ fontSize: 9.5, color: C.textGhost, lineHeight: 1.6, marginTop: 10, textAlign: 'center' }}>
          ※動画広告（ジュエル追加・2回目以降の大成功）は任意で見られます
        </div>

      </div>

      {msg && <NoticeDialog title={msg.title} message={msg.body} onClose={() => setMsg(null)} />}
    </div>
  )
}
