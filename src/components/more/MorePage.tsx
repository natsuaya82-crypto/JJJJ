import { useEffect, useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { audio, audioDiag, audioStatus } from '../../utils/audio'
import { onlineAvailable } from '../../data/featureFlags'
import { TERMS_URL, PRIVACY_URL } from '../../utils/termsConsent'
import { listBlocked, unblockUser, type BlockedUser } from '../../lib/moderationApi'
import { TeamLogoSVG } from '../icons/Icons'
import LogoSelectSheet from '../shared/LogoSelectSheet'
import BottomSheet from '../ui/BottomSheet'
import { flushSaveNow, slotHasSave } from '../../store/saveStorage'
import { SAVE_SLOTS, currentSaveSlot, switchSaveSlot, type SaveSlot } from '../../store/saveSlot'
import { GmPassCard, IAP_ENABLED } from '../shared/GmPassSheet'

import { C, alpha, SAIRA, HEADER_H } from '../../styles/tokens'

import { APP_VERSION } from '../../data/appMeta'
import { Chevron } from '../ui'



const OVERLAY_BG = C.bg

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
const IcBlock = <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M5.6 5.6l12.8 12.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>

// ── 課金カードの特典アイコン ──

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
      <Chevron size={13} />
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

type Detail = null | 'team' | 'sound' | 'reset' | 'blocked' | 'resign'

// ── ブロックした利用者 ──────────────────────────────────
// App Store の審査基準 1.2 で「ブロックできること」が要る。
// 解除の場所が無いと一度ブロックしたら二度と戻せないので、ここに一覧を置く。
function BlockedScreen({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<BlockedUser[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState('')
  const [round, setRound] = useState(0)

  useEffect(() => {
    let alive = true
    listBlocked()
      .then(r => { if (alive) setRows(r) })
      .catch(() => { if (alive) { setRows([]); setFailed(true) } })
    return () => { alive = false }
  }, [round])

  const onUnblock = async (u: BlockedUser) => {
    setBusy(u.id)
    const ok = await unblockUser(u.id)
    setBusy('')
    if (ok) { setFailed(false); setRound(n => n + 1) }
    else setFailed(true)
  }

  return (
    <DetailScreen title="ブロックした利用者" onClose={onClose}>
      <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.7, marginBottom: 14 }}>
        ブロックした相手の名前と書き込みは表示されません。解除してもフレンドには戻らないので、必要ならもう一度申請してください。
      </div>

      {rows === null ? (
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 12, padding: '40px 0' }}>読み込み中…</div>
      ) : failed ? (
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 12, padding: '40px 0' }}>通信できませんでした</div>
      ) : rows.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.textDim, fontSize: 12, padding: '40px 0' }}>ブロックしている相手はいません</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 12,
              background: C.surface2, border: `1px solid ${C.border2}`,
            }}>
              <TeamLogoSVG primary={u.primary} secondary={u.secondary} shortName={u.shortName} logoId={u.logoId} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.teamName}
                </div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>GM {u.gmName}</div>
              </div>
              <button
                onClick={() => { void onUnblock(u) }}
                disabled={busy === u.id}
                className="btn-press"
                style={{
                  padding: '8px 14px', borderRadius: 9, flexShrink: 0, cursor: busy === u.id ? 'default' : 'pointer',
                  border: `2px solid ${alpha(C.cyan, busy === u.id ? 0.25 : 0.6)}`,
                  background: `linear-gradient(180deg, ${C.surface3}, ${C.surface2})`,
                  color: busy === u.id ? C.textGhost : C.cyan, fontSize: 12, fontWeight: 900, fontFamily: SAIRA,
                }}
              >
                解除
              </button>
            </div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

export default function MorePage({ onBackToTitle }: { onBackToTitle?: () => void }) {
  const { resetGame } = useGameStore()
  const teams = useGameStore(s => s.teams)
  const playerTeamId = useGameStore(s => s.playerTeamId)
  const myTeam = teams.find(t => t.id === playerTeamId)
  const raceEventsEnabled = useGameStore(s => s.raceEventsEnabled ?? true)
  const setRaceEventsEnabled = useGameStore(s => s.setRaceEventsEnabled)

  const [detail, setDetail] = useState<Detail>(null)

  // ── セーブスロット（運営用）──
  // 入口は隠してある。フッターのバージョン表記を7回続けて叩くと出る。
  // 一般のプレイヤーに見せる機能ではないので設定の一覧には並べない。
  const [slotTaps, setSlotTaps] = useState(0)
  const [slotSheet, setSlotSheet] = useState(false)
  const [slotsUsed, setSlotsUsed] = useState<Record<number, boolean>>({})
  useEffect(() => {
    if (!slotSheet) return
    let alive = true
    void (async () => {
      const used: Record<number, boolean> = {}
      for (const s of SAVE_SLOTS) used[s] = await slotHasSave(s)
      if (alive) setSlotsUsed(used)
    })()
    return () => { alive = false }
  }, [slotSheet])
  // 切り替えは必ず書きかけを吐き出してから。switchSaveSlot の中で再読み込みが走る
  const goToSlot = (s: SaveSlot) => {
    if (s === currentSaveSlot()) { setSlotSheet(false); return }
    void (async () => {
      await flushSaveNow()
      switchSaveSlot(s)
    })()
  }

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
      {IAP_ENABLED && <GmPassCard />}

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
        {onlineAvailable() && <SettingRow icon={IcBlock} label="ブロックした利用者" sub="オンラインで表示しない相手" onClick={() => setDetail('blocked')} />}
        <SettingRow
          icon={IcRace}
          label="監督を退任する"
          sub="他クラブから就任の打診が届きます"
          onClick={() => setDetail('resign')}
        />
        {onBackToTitle && <SettingRow icon={IcHome} label="タイトルに戻る" onClick={onBackToTitle} />}
        <SettingRow icon={IcTrash} label="データリセット" sub="セーブを削除して最初から" danger onClick={() => setDetail('reset')} />
      </div>

      {/* フッター */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        {/* 7回叩くとセーブスロットの切り替えが出る（運営用の隠し入口） */}
        <div
          onClick={() => {
            const n = slotTaps + 1
            if (n >= 7) { setSlotTaps(0); setSlotSheet(true) } else setSlotTaps(n)
          }}
          style={{ fontSize: 10, color: C.textGhost, letterSpacing: '1px', cursor: 'default', userSelect: 'none' }}
        >
          JPEL Manager {APP_VERSION}{currentSaveSlot() !== 1 && ` (スロット${currentSaveSlot()})`}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => window.open(PRIVACY_URL, '_blank')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SAIRA, padding: '2px 0' }}
          >
            <span style={{ fontSize: 11, color: alpha(C.textGhost, 0.55) }}>プライバシーポリシー</span>
          </button>
          <span style={{ fontSize: 10, color: alpha(C.textGhost, 0.3) }}>|</span>
          {/* 自前の利用規約。初回起動の同意画面で出しているものと同じ内容。
              アプリ内の本文は src/data/termsText.ts にあるので、直すときは両方そろえること */}
          <button
            onClick={() => window.open(TERMS_URL, '_blank')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: SAIRA, padding: '2px 0' }}
          >
            <span style={{ fontSize: 11, color: alpha(C.textGhost, 0.55) }}>利用規約</span>
          </button>
        </div>
      </div>

      {/* 詳細画面 */}
      {detail === 'team' && <TeamEditScreen onClose={() => setDetail(null)} />}
      {detail === 'sound' && <SoundScreen onClose={() => setDetail(null)} />}
      {detail === 'blocked' && <BlockedScreen onClose={() => setDetail(null)} />}
      {detail === 'reset' && <ResetScreen resetGame={resetGame} onClose={() => setDetail(null)} />}
      {detail === 'resign' && <ResignScreen onClose={() => setDetail(null)} />}

      {/* セーブスロット（運営用）。画面下から出すものは必ず BottomSheet を通すこと */}
      <BottomSheet open={slotSheet} onClose={() => setSlotSheet(false)} title="セーブスロット（運営用）">
        <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.6, marginBottom: 10 }}>
          データを分けて持てます。切り替えるとアプリを読み込み直します。<br />
          空きのスロットを選ぶと、そのスロットは最初から始まります。
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SAVE_SLOTS.map(s => {
            const isCurrent = s === currentSaveSlot()
            const used = slotsUsed[s]
            return (
              <button
                key={s}
                onClick={() => goToSlot(s)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                  background: isCurrent ? alpha(C.gold, 0.12) : C.surface3,
                  border: `1px solid ${isCurrent ? alpha(C.gold, 0.5) : C.border}`,
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 800, color: isCurrent ? C.gold : C.text }}>
                  スロット{s}{s === 1 && <span style={{ fontSize: 10, color: C.textDim, fontWeight: 400 }}>（これまでのデータ）</span>}
                </span>
                <span style={{ fontSize: 11, color: isCurrent ? C.gold : C.textDim }}>
                  {isCurrent ? '使用中' : used === undefined ? '…' : used ? 'データあり' : '空き'}
                </span>
              </button>
            )
          })}
        </div>
      </BottomSheet>
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
        <Chevron size={13} />
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
  // 音が鳴らなかったときの理由。実機ではログが見られないので、ここに出さないと
  // 「鳴らない」以上のことが分からず、直したかどうかも確かめられない。
  // 正常なときは何も出ない。
  const [diag, setDiag] = useState<string[]>(() => audioDiag())
  // BGMがいまどうなっているか。つまみを動かすたびに読み直す。
  const [status, setStatus] = useState<string>(() => audioStatus())

  function handleVolSe(v: number) {
    setVolSe(v)
    localStorage.setItem('jpel-volume-se', String(v))
    audio.setSeVolume(v)
    audio.playSe('tap')
    setDiag(audioDiag())
    setStatus(audioStatus())
  }
  function handleVolMusic(v: number) {
    setVolMusic(v)
    localStorage.setItem('jpel-volume-music', String(v))
    audio.setMusicVolume(v)
    setDiag(audioDiag())
    setStatus(audioStatus())
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

      <div style={{ ...CARD, marginTop: 12, padding: '14px 16px' }}>
        <div style={{ fontSize: 10, color: C.textSub, letterSpacing: '1.5px', marginBottom: 8, fontFamily: SAIRA }}>BGMのようす</div>
        <div style={{ fontSize: 11, color: C.textGhost, lineHeight: 1.7, wordBreak: 'break-all' }}>{status}</div>
      </div>

      {diag.length > 0 && (
        <div style={{ ...CARD, marginTop: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 10, color: C.textSub, letterSpacing: '1.5px', marginBottom: 8, fontFamily: SAIRA }}>音が鳴らないとき</div>
          {diag.map((d, i) => (
            <div key={i} style={{ fontSize: 11, color: C.textGhost, lineHeight: 1.7, wordBreak: 'break-all' }}>{d}</div>
          ))}
        </div>
      )}
    </DetailScreen>
  )
}

// 監督を自分から辞める。押すと行き先の候補が届く（ホームに OFFER として出る）。
// シーズン途中でも押せて、受けたその日から新しいクラブを指揮する。
function ResignScreen({ onClose }: { onClose: () => void }) {
  const resign = useGameStore(s => s.resignAsGm)
  const myTeam = useGameStore(s => s.teams.find(t => t.id === s.playerTeamId))
  const [done, setDone] = useState(false)
  return (
    <DetailScreen title="監督を退任する" onClose={onClose}>
      <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.9, marginBottom: 16 }}>
        {myTeam?.name ?? '現在のクラブ'}の監督を辞め、他クラブからの打診を待ちます。<br /><br />
        ・打診は<strong style={{ color: C.text }}>すぐに届きます</strong>。受けたその日から新しいクラブを指揮します<br />
        ・<strong style={{ color: C.text }}>殿堂入りチームだけは持っていきます。</strong>選手・予算・施設は移籍先のものです<br />
        ・すべて断ったら無職のまま。次のシーズンにまた声がかかります
      </div>
      {done ? (
        <div style={{ padding: 14, borderRadius: 10, background: alpha(C.gold, 0.12), border: `1px solid ${alpha(C.gold, 0.4)}`, color: C.gold, fontSize: 12, fontWeight: 800, textAlign: 'center' }}>
          打診が届きました。ホームで確認してください。
        </div>
      ) : (
        <button
          onClick={() => { resign(); setDone(true) }}
          className="btn-game btn-game--red"
          style={{ width: '100%' }}
        >
          <span className="btn-game__inner">退任して打診を受け取る</span>
        </button>
      )}
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
            {/* オンライン（フレンド）を公開している間は、サーバー側のアカウントも一緒に消える。
                消えるものを書かずに削除させるのは審査ガイドライン 5.1.1(v) に触れるため、
                機能を開けたときだけ自動でこの一文が出るようにしてある。 */}
            {onlineAvailable() && (
              <>
                <br />
                フレンド機能で作られたアカウント（フレンドコード・走友会の登録・友達に見えているチーム情報）も同時に削除されます。
              </>
            )}
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
