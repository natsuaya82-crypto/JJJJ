import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
// 選べるのは国内52クラブ全部。**どのクラブを選んでも3部・格20から始まる**
// （降格させる処理は gameStore の startSetup。utils/domesticClubs.ts に名簿がある）
import { ALL_DOMESTIC_TEAMS } from '../../utils/domesticClubs'
import LogoSelectSheet from '../shared/LogoSelectSheet'
import GlassButton from '../ui/GlassButton'
import PageHeader from '../ui/PageHeader'
import { panelStyle } from '../ui/Panel'
import { C, alpha, FONT, SAIRA } from '../../styles/tokens'

// ============================================================================
// **最初のチーム選び。ゲームが始まる前なので `Layout` を通らない。**
//
// ★**背景を塗らないこと。** 写真は `App.tsx` の `AppBackground` が1枚で全画面に
//   敷いている。ここで `backgroundColor` を置くと写真が隠れる（実際に
//   `#0A0912` で塗りつぶしていて、タイトルから入ると真っ黒になっていた）。
// ★色・ボタン・カードは共通の部品を通す。ここは長いあいだ一掃の外に居て、
//   古い紫寄りの配色（#0A0912 / #C9A84C / #F0EDE8 …）が63件残っていた。
// ============================================================================

type Step = 'welcome' | 'team_select' | 'customize' | 'confirm'

/** 入力欄。5か所で同じものを使う */
const INPUT: React.CSSProperties = {
  width: '100%', padding: '14px 16px', border: 'none',
  background: 'rgba(0,0,0,0.35)', color: C.text, fontSize: 16,
  fontFamily: 'inherit', outline: 'none',
  boxShadow: `inset 0 0 0 1px ${C.border2}`,
  boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = {
  fontSize: 11, color: C.textSub, letterSpacing: '2px', display: 'block', marginBottom: 8,
}

export default function Onboarding() {
  const { startSetup, beginInauguralDraft } = useGameStore()
  // 広告帯の高さ。買い切り版なら0（Layout.tsx / DraftRoom.tsx と同じ考え方）
  const adH = useGameStore(s => s.adsRemoved ?? false) ? 0 : 50
  const [step, setStep] = useState<Step>('welcome')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamShortName, setTeamShortName] = useState('')
  const [region, setRegion] = useState('')   // 本拠地・地域（自由入力）
  const [city, setCity] = useState('')       // 本拠地・市（自由入力）
  const [gmName, setGmName] = useState('')
  const [selectedLogoId, setSelectedLogoId] = useState('')
  const [logoSheetOpen, setLogoSheetOpen] = useState(false)
  const [nameError, setNameError] = useState('')

  const selectedTeam = ALL_DOMESTIC_TEAMS.find(t => t.id === selectedTeamId)!

  function handleConfirm() {
    if (!teamName.trim()) { setNameError('チーム名を入力してください'); return }
    if (!teamShortName.trim()) { setNameError('略称を入力してください'); return }
    if (!gmName.trim()) { setNameError('GM名を入力してください'); return }
    setNameError('')
    startSetup({ teamId: selectedTeamId, teamName: teamName.trim(), teamShortName: teamShortName.trim(), gmName: gmName.trim(), logoId: selectedLogoId || undefined, region: region.trim() || undefined, city: city.trim() || undefined })
    beginInauguralDraft()
  }

  return (
    <div style={{
      height: '100svh',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      maxWidth: 480, margin: '0 auto',
      fontFamily: FONT,
      position: 'relative',
      overflow: 'hidden',
      // この画面は Layout を通らないので、セーフエリアを自前で確保する。
      // 足さないと見出しがステータスバーの裏に潜り込む
      paddingTop: 'env(safe-area-inset-top)',
      boxSizing: 'border-box',
    }}>

      {/* ---- WELCOME ---- */}
      {step === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
          {/* Logo */}
          <div style={{ marginBottom: 32, position: 'relative' }}>
            <svg width="100" height="100" viewBox="0 0 100 100">
              <defs>
                <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={C.gold} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={C.gold} stopOpacity="0"/>
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="50" fill="url(#glow)"/>
              <path d="M50 8L62 42H97L68 61L80 95L50 75L20 95L32 61L3 42H38Z"
                fill="none" stroke={C.gold} strokeWidth="2" opacity="0.4"/>
              <path d="M50 14L60 43H91L67 58L77 89L50 72L23 89L33 58L9 43H40Z"
                fill={C.gold} fillOpacity="0.15"/>
              <path d="M50 18L58 44H87L65 57L74 84L50 68L26 84L35 57L13 44H42Z"
                fill={C.gold} fillOpacity="0.8"/>
            </svg>
          </div>

          <div style={{ fontFamily: SAIRA, fontSize: 11, color: C.textDim, letterSpacing: '4px', marginBottom: 8 }}>
            JAPAN PRO EKIDEN LEAGUE
          </div>
          <div style={{ fontSize: 36, fontWeight: 900, color: C.text, letterSpacing: '-1px', marginBottom: 8, lineHeight: 1.1 }}>
            JPEL Manager
          </div>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 48, lineHeight: 1.6, maxWidth: 280 }}>
            日本初のプロ駅伝リーグ。52チームのひとつを率い、頂点を目指せ。
          </div>

          <GlassButton full size="lg" onClick={() => setStep('team_select')} style={{ letterSpacing: '1px' }}>
            GM就任
          </GlassButton>
        </div>
      )}

      {/* Ad banner — 実機のAdMobバナーはsafe-areaの上に出るため、帯も同じ位置に合わせる（Layoutと同じ配置）。
          買い切り版（adsRemoved）では帯ごと出さない。前は無条件に描いていたので、
          課金済みでも黒い枠だけが残っていた */}
      {adH > 0 && (
        <div style={{
          position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
          width: '100%', maxWidth: 480, height: adH,
          background: 'rgba(0,0,0,0.55)', borderTop: `1px solid ${C.border}`,
          zIndex: 60,
        }}/>
      )}

      {/* ---- TEAM SELECT ---- */}
      {step === 'team_select' && (
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '24px 20px 12px', flexShrink: 0 }}>
            <div style={{ fontFamily: SAIRA, fontSize: 10, color: C.textDim, letterSpacing: '3px', marginBottom: 6 }}>STEP 1 / 2</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>チームを選択</div>
            <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>率いるチームを選んでください</div>
            <div style={{ fontSize: 11, color: C.gold, marginTop: 6 }}>どのチームを選んでも JPEL 3部からのスタートです</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, boxSizing: 'border-box', padding: `0 14px calc(${adH}px + env(safe-area-inset-bottom) + 120px)` }}>
            {(['北海道・東北', '関東', '中部', '関西', '中国・四国', '九州・沖縄'] as const).map(region => {
              const regionTeams = ALL_DOMESTIC_TEAMS.filter(t => {
                if (region === '北海道・東北') return ['北海道','東北'].includes(t.region)
                if (region === '関東') return t.region === '関東'
                if (region === '中部') return t.region === '中部'
                if (region === '関西') return t.region === '関西'
                if (region === '中国・四国') return ['中国','四国'].includes(t.region)
                return ['九州','沖縄'].includes(t.region)
              })
              return (
                <div key={region} style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: '2px', padding: '0 2px', marginBottom: 8 }}>
                    {region}
                  </div>
                  {regionTeams.map(team => {
                    const selected = selectedTeamId === team.id
                    // ★行の形は `ui/Panel`（右下だけ斜めに切る）。左の帯はそのクラブの色
                    return (
                      <div
                        key={team.id}
                        className="btn-press"
                        onClick={() => {
                          setSelectedTeamId(team.id)
                          setTeamName(team.name)
                          setTeamShortName(team.shortName)
                          setRegion(team.region)
                          setCity(team.city)
                          setStep('customize')
                        }}
                        style={{
                          ...panelStyle(team.colors.primary),
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '12px 14px', marginBottom: 7, cursor: 'pointer',
                          ...(selected ? { background: `linear-gradient(160deg, ${alpha(team.colors.primary, 0.16)}, ${C.bg})` } : {}),
                        }}
                      >
                        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={40}/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{team.name}</div>
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{team.city}</div>
                        </div>
                        {selected && (
                          <div style={{
                            width: 22, height: 22, borderRadius: '50%',
                            background: `linear-gradient(135deg, ${C.gold}, ${C.goldHi})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M5 12l5 5L20 7" stroke={C.bg} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

        </div>
      )}

      {/* ---- CUSTOMIZE ---- */}
      {step === 'customize' && (
        <div style={{ flex: 1, width: '100%', overflowY: 'auto', minHeight: 0, boxSizing: 'border-box', padding: `0 20px calc(${adH}px + env(safe-area-inset-bottom) + 24px)` }}>
          <div style={{ margin: '0 -20px' }}>
            <PageHeader title="チームをカスタマイズ" eyebrow="STEP 2 / 2" onBack={() => setStep('team_select')} />
          </div>

          {/* Team preview */}
          <div style={{
            ...panelStyle(selectedTeam.colors.primary),
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28, padding: 16,
            background: `linear-gradient(135deg, ${alpha(selectedTeam.colors.primary, 0.18)}, ${C.bg})`,
          }}>
            <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={56}/>
            <div>
              <div style={{ fontSize: 12, color: selectedTeam.colors.secondary, opacity: 0.85 }}>{(city || selectedTeam.city)} / {(region || selectedTeam.region)}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{teamName || selectedTeam.name}</div>
            </div>
          </div>

          {/* Logo select */}
          <div style={{ marginBottom: 20 }}>
            <label style={LABEL}>チームロゴ</label>
            <button
              type="button"
              onClick={() => setLogoSheetOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', cursor: 'pointer',
                background: 'rgba(0,0,0,0.35)', border: `1px solid ${C.border2}`,
              }}
            >
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={40}/>
              </div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 700, color: C.text }}>変更する</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.textSub, flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Team name */}
          <div style={{ marginBottom: 20 }}>
            <label style={LABEL}>チーム名</label>
            <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)}
              maxLength={20} placeholder="例：福岡サザンクロス" style={INPUT} />
          </div>

          {/* Short name */}
          <div style={{ marginBottom: 20 }}>
            <label style={LABEL}>略称（3文字まで）</label>
            <input type="text" value={teamShortName} onChange={e => setTeamShortName(e.target.value)}
              maxLength={3} placeholder="例：福岡" style={INPUT} />
          </div>

          {/* 本拠地（地域・市）自由入力 */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>地域</label>
              <input type="text" value={region} onChange={e => setRegion(e.target.value)}
                maxLength={10} placeholder="例：九州" style={INPUT} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>本拠地</label>
              <input type="text" value={city} onChange={e => setCity(e.target.value)}
                maxLength={12} placeholder="例：福岡" style={INPUT} />
            </div>
          </div>

          {/* GM name */}
          <div style={{ marginBottom: 12 }}>
            <label style={LABEL}>あなたの名前</label>
            <input type="text" value={gmName} onChange={e => setGmName(e.target.value)}
              maxLength={15} placeholder="例：山田" style={INPUT} />
          </div>

          {nameError && (
            <div style={{ fontSize: 12, color: C.red, marginBottom: 12, padding: '8px 12px', background: alpha(C.red, 0.12) }}>
              {nameError}
            </div>
          )}

          <div style={{ ...panelStyle(), fontSize: 11, color: C.textDim, marginBottom: 32, padding: '10px 12px', lineHeight: 1.7 }}>
            初年度のドラフトは<b style={{ color: C.gold }}>見学</b>です。<br/>
            代わりに、あとで選手を1人つくって加入させられます。<br/>
            指名に参加できるのは2年目からです。
          </div>

          <GlassButton full size="lg" onClick={handleConfirm}>
            ドラフトへ進む
          </GlassButton>

        </div>
      )}

      {logoSheetOpen && (
        <LogoSelectSheet team={selectedTeam} value={selectedLogoId} onSelect={setSelectedLogoId} onClose={() => setLogoSheetOpen(false)} />
      )}
    </div>
  )
}
