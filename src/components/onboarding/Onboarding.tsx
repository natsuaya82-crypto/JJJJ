import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
// 選べるのは国内52クラブ全部。**どのクラブを選んでも3部・格20から始まる**
// （降格させる処理は gameStore の startSetup。utils/domesticClubs.ts に名簿がある）
import { ALL_DOMESTIC_TEAMS } from '../../utils/domesticClubs'
import LogoSelectSheet from '../shared/LogoSelectSheet'
import GlassButton from '../ui/GlassButton'
import { panelStyle } from '../ui/Panel'
import { F, C, alpha } from '../../styles/tokens'

type Step = 'welcome' | 'team_select' | 'customize' | 'confirm'

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
      // ★背景を塗らないこと。写真は App.tsx の AppBackground が1枚で全画面に敷いている
      //   （塗ると星の画面が真っ黒になる。2026-08-14 に直したのが main で戻っていた）
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      maxWidth: '480px', margin: '0 auto',
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
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
          <div style={{ marginBottom: '32px', position: 'relative' }}>
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

          <div style={{ fontSize: F.label, color: C.border3, letterSpacing: '4px', marginBottom: '8px' }}>
            JAPAN PRO EKIDEN LEAGUE
          </div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: C.text, letterSpacing: '-1px', marginBottom: '8px', lineHeight: 1.1 }}>
            JPEL Manager
          </div>
          <div style={{ fontSize: F.bodyLg, color: C.textGhost, marginBottom: '48px', lineHeight: 1.6, maxWidth: '280px' }}>
            日本初のプロ駅伝リーグ。52チームのひとつを率い、頂点を目指せ。
          </div>

          {/* ★押すボタンは ui/GlassButton 1本。金のベタ塗り＋黒い字は⑩で落ちる */}
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
          width: '100%', maxWidth: '480px', height: `${adH}px`,
          backgroundColor: C.bg, borderTop: `1px solid ${C.surface}`,
          zIndex: 60,
        }}/>
      )}

      {/* ---- TEAM SELECT ---- */}
      {step === 'team_select' && (
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '24px 20px 12px', flexShrink: 0 }}>
            <div style={{ fontSize: F.caption, color: C.border3, letterSpacing: '3px', marginBottom: '6px' }}>STEP 1 / 2</div>
            <div style={{ fontSize: F.headLg, fontWeight: '900', color: C.text }}>チームを選択</div>
            <div style={{ fontSize: F.body, color: C.textGhost, marginTop: '4px' }}>率いるチームを選んでください</div>
            <div style={{ fontSize: F.label, color: C.gold, marginTop: '6px' }}>どのチームを選んでも JPEL 3部からのスタートです</div>
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
                <div key={region} style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: F.caption, color: C.border3, letterSpacing: '2px', padding: '0 2px', marginBottom: '8px' }}>
                    {region}
                  </div>
                  {regionTeams.map(team => {
                    const selected = selectedTeamId === team.id
                    return (
                      <div
                        key={team.id}
                        onClick={() => {
                          setSelectedTeamId(team.id)
                          setTeamName(team.name)
                          setTeamShortName(team.shortName)
                          setRegion(team.region)
                          setCity(team.city)
                          setStep('customize')
                        }}
                        style={{
                          position: 'relative',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px',
                          marginBottom: '7px',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          // カードは ui/Panel 1本。選んだチームは左の帯がそのチームの色になる。
                          // **枠＋下に影の板を書かないこと**（他の画面と揃わなくなる）
                          ...panelStyle(selected ? team.colors.primary : undefined),
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Glass highlight */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
                          background: selected
                            ? `linear-gradient(180deg, ${team.colors.primary}18 0%, transparent 100%)`
                            : 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)',
                          pointerEvents: 'none',
                        }}/>

                        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={40}/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: F.sub, fontWeight: '700', color: C.text }}>{team.name}</div>
                          <div style={{ fontSize: F.caption, color: C.border3, marginTop: '1px' }}>{team.city}</div>
                        </div>
                        {selected && (
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: `linear-gradient(135deg, ${C.gold}, ${C.goldHi})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 8px rgba(201,168,76,0.5)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px 0 20px' }}>
            <button onClick={() => setStep('team_select')} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: C.textGhost,
              padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '36px', minHeight: '36px', flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div>
              <div style={{ fontSize: F.caption, color: C.border3, letterSpacing: '3px' }}>STEP 2 / 2</div>
              <div style={{ fontSize: F.head, fontWeight: '900', color: C.text, lineHeight: 1.2 }}>チームをカスタマイズ</div>
            </div>
          </div>

          {/* Team preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px',
            padding: '16px',
            background: `linear-gradient(135deg, ${selectedTeam.colors.primary}25, ${C.bg})`,
            border: `1px solid ${selectedTeam.colors.primary}40`,
          }}>
            <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={56}/>
            <div>
              <div style={{ fontSize: F.body, color: selectedTeam.colors.secondary, opacity: 0.8 }}>{(city || selectedTeam.city)} / {(region || selectedTeam.region)}</div>
              <div style={{ fontSize: F.title, fontWeight: '800', color: C.text }}>{teamName || selectedTeam.name}</div>
            </div>
          </div>

          {/* Logo select */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              チームロゴ
            </label>
            <button
              type="button"
              onClick={() => setLogoSheetOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px',cursor: 'pointer',
                backgroundColor: C.surface, border: `1px solid ${C.surface2}`,
              }}
            >
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={40}/>
              </div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: F.bodyLg, fontWeight: 700, color: C.text }}>変更する</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: C.textGhost, flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Team name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              チーム名
            </label>
            <input
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              maxLength={20}
              placeholder="例：福岡サザンクロス"
              style={{
                width: '100%', padding: '14px 16px',border: 'none',
                backgroundColor: C.surface, color: C.text, fontSize: F.title,
                fontFamily: 'inherit', outline: 'none',
                boxShadow: `inset 0 0 0 1px ${C.surface2}`,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Short name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              略称（3文字まで）
            </label>
            <input
              type="text"
              value={teamShortName}
              onChange={e => setTeamShortName(e.target.value)}
              maxLength={3}
              placeholder="例：福岡"
              style={{
                width: '100%', padding: '14px 16px',border: 'none',
                backgroundColor: C.surface, color: C.text, fontSize: F.title,
                fontFamily: 'inherit', outline: 'none',
                boxShadow: `inset 0 0 0 1px ${C.surface2}`,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 本拠地（地域・市）自由入力 */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
                地域
              </label>
              <input
                type="text"
                value={region}
                onChange={e => setRegion(e.target.value)}
                maxLength={10}
                placeholder="例：九州"
                style={{
                  width: '100%', padding: '14px 16px',border: 'none',
                  backgroundColor: C.surface, color: C.text, fontSize: F.title,
                  fontFamily: 'inherit', outline: 'none',
                  boxShadow: `inset 0 0 0 1px ${C.surface2}`,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
                本拠地
              </label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                maxLength={12}
                placeholder="例：福岡"
                style={{
                  width: '100%', padding: '14px 16px',border: 'none',
                  backgroundColor: C.surface, color: C.text, fontSize: F.title,
                  fontFamily: 'inherit', outline: 'none',
                  boxShadow: `inset 0 0 0 1px ${C.surface2}`,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* GM name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: F.label, color: C.textGhost, letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              あなたの名前
            </label>
            <input
              type="text"
              value={gmName}
              onChange={e => setGmName(e.target.value)}
              maxLength={15}
              placeholder="例：山田"
              style={{
                width: '100%', padding: '14px 16px',border: 'none',
                backgroundColor: C.surface, color: C.text, fontSize: F.title,
                fontFamily: 'inherit', outline: 'none',
                boxShadow: `inset 0 0 0 1px ${C.surface2}`,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {nameError && (
            <div style={{ fontSize: F.body, color: C.red, marginBottom: '12px', padding: '8px 12px',backgroundColor: alpha(C.red, 0.08) }}>
              {nameError}
            </div>
          )}

          <div style={{ fontSize: F.label, color: C.border3, marginBottom: '32px', padding: '10px 12px',backgroundColor: C.bg, border: `1px solid ${C.surface2}` }}>
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
