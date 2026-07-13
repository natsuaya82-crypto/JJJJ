import { useState } from 'react'
import { useGameStore } from '../../store/gameStore'
import { TeamLogoSVG } from '../icons/Icons'
import { INITIAL_TEAMS } from '../../data/teams'
import LogoSelectSheet from '../shared/LogoSelectSheet'

type Step = 'welcome' | 'team_select' | 'customize' | 'confirm'

export default function Onboarding() {
  const { startSetup, beginInauguralDraft } = useGameStore()
  const [step, setStep] = useState<Step>('welcome')
  const [selectedTeamId, setSelectedTeamId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamShortName, setTeamShortName] = useState('')
  const [gmName, setGmName] = useState('')
  const [selectedLogoId, setSelectedLogoId] = useState('')
  const [logoSheetOpen, setLogoSheetOpen] = useState(false)
  const [nameError, setNameError] = useState('')

  const selectedTeam = INITIAL_TEAMS.find(t => t.id === selectedTeamId)!

  function handleConfirm() {
    if (!teamName.trim()) { setNameError('チーム名を入力してください'); return }
    if (!teamShortName.trim()) { setNameError('略称を入力してください'); return }
    if (!gmName.trim()) { setNameError('GM名を入力してください'); return }
    setNameError('')
    startSetup({ teamId: selectedTeamId, teamName: teamName.trim(), teamShortName: teamShortName.trim(), gmName: gmName.trim(), logoId: selectedLogoId || undefined })
    beginInauguralDraft()
  }

  return (
    <div style={{
      height: '100svh',
      backgroundColor: '#0A0912',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      maxWidth: '480px', margin: '0 auto',
      fontFamily: "'Noto Sans JP', 'Hiragino Sans', system-ui, sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ---- WELCOME ---- */}
      {step === 'welcome' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
          {/* Logo */}
          <div style={{ marginBottom: '32px', position: 'relative' }}>
            <svg width="100" height="100" viewBox="0 0 100 100">
              <defs>
                <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#C9A84C" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#C9A84C" stopOpacity="0"/>
                </radialGradient>
              </defs>
              <circle cx="50" cy="50" r="50" fill="url(#glow)"/>
              <path d="M50 8L62 42H97L68 61L80 95L50 75L20 95L32 61L3 42H38Z"
                fill="none" stroke="#C9A84C" strokeWidth="2" opacity="0.4"/>
              <path d="M50 14L60 43H91L67 58L77 89L50 72L23 89L33 58L9 43H40Z"
                fill="#C9A84C" fillOpacity="0.15"/>
              <path d="M50 18L58 44H87L65 57L74 84L50 68L26 84L35 57L13 44H42Z"
                fill="#C9A84C" fillOpacity="0.8"/>
            </svg>
          </div>

          <div style={{ fontSize: '11px', color: '#5C5870', letterSpacing: '4px', marginBottom: '8px' }}>
            JAPAN PRO EKIDEN LEAGUE
          </div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: '#F0EDE8', letterSpacing: '-1px', marginBottom: '8px', lineHeight: 1.1 }}>
            JPEL Manager
          </div>
          <div style={{ fontSize: '13px', color: '#9B97A8', marginBottom: '48px', lineHeight: 1.6, maxWidth: '280px' }}>
            日本初のプロ駅伝リーグ。20チームのひとつを率い、頂点を目指せ。
          </div>

          <button onClick={() => setStep('team_select')} style={{
            width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(135deg, #C9A84C, #E8C86A)',
            color: '#0A0912', fontSize: '16px', fontWeight: '900',
            cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '1px',
            boxShadow: '0 0 24px rgba(201,168,76,0.4)',
          }}>
            GM就任
          </button>
        </div>
      )}

      {/* Ad banner — 実機のAdMobバナーはsafe-areaの上に出るため、帯も同じ位置に合わせる（Layoutと同じ配置） */}
      <div style={{
        position: 'fixed', bottom: 'env(safe-area-inset-bottom)', left: 0, right: 0, margin: '0 auto',
        width: '100%', maxWidth: '480px', height: '50px',
        backgroundColor: '#070610', borderTop: '1px solid #1E1B2E',
        zIndex: 60,
      }}/>

      {/* ---- TEAM SELECT ---- */}
      {step === 'team_select' && (
        <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '24px 20px 12px', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px', marginBottom: '6px' }}>STEP 1 / 2</div>
            <div style={{ fontSize: '22px', fontWeight: '900', color: '#F0EDE8' }}>チームを選択</div>
            <div style={{ fontSize: '12px', color: '#9B97A8', marginTop: '4px' }}>率いるチームを選んでください</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 170px', minHeight: 0 }}>
            {(['北海道・東北', '関東', '中部', '関西', '中国・四国', '九州・沖縄'] as const).map(region => {
              const regionTeams = INITIAL_TEAMS.filter(t => {
                if (region === '北海道・東北') return ['北海道','東北'].includes(t.region)
                if (region === '関東') return t.region === '関東'
                if (region === '中部') return t.region === '中部'
                if (region === '関西') return t.region === '関西'
                if (region === '中国・四国') return ['中国','四国'].includes(t.region)
                return ['九州','沖縄'].includes(t.region)
              })
              return (
                <div key={region} style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '2px', padding: '0 2px', marginBottom: '8px' }}>
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
                          setStep('customize')
                        }}
                        style={{
                          position: 'relative',
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          marginBottom: '7px',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          background: selected
                            ? `linear-gradient(160deg, ${team.colors.primary}28 0%, ${team.colors.primary}0E 100%)`
                            : 'linear-gradient(180deg, #24223A 0%, #1A1828 100%)',
                          border: selected
                            ? `1px solid ${team.colors.primary}65`
                            : '1px solid #2E2B42',
                          boxShadow: selected
                            ? `0 3px 0 ${team.colors.primary}30, 0 6px 18px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)`
                            : '0 3px 0 #0D0B1A, 0 6px 16px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {/* Glass highlight */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
                          background: selected
                            ? `linear-gradient(180deg, ${team.colors.primary}18 0%, transparent 100%)`
                            : 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, transparent 100%)',
                          borderRadius: '13px 13px 50% 50%',
                          pointerEvents: 'none',
                        }}/>

                        <TeamLogoSVG primary={team.colors.primary} secondary={team.colors.secondary} shortName={team.shortName} teamId={team.id} size={40}/>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: '700', color: '#F0EDE8' }}>{team.name}</div>
                          <div style={{ fontSize: '10px', color: '#5C5870', marginTop: '1px' }}>{team.city}</div>
                        </div>
                        {selected && (
                          <div style={{
                            width: '22px', height: '22px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #C9A84C, #E8C86A)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 0 8px rgba(201,168,76,0.5)',
                            flexShrink: 0,
                          }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                              <path d="M5 12l5 5L20 7" stroke="#0A0912" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
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
        <div style={{ flex: 1, width: '100%', overflowY: 'auto', padding: '0 20px 100px', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '12px 0 20px' }}>
            <button onClick={() => setStep('team_select')} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#9B97A8',
              padding: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              minWidth: '36px', minHeight: '36px', flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div>
              <div style={{ fontSize: '10px', color: '#5C5870', letterSpacing: '3px' }}>STEP 2 / 2</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#F0EDE8', lineHeight: 1.2 }}>チームをカスタマイズ</div>
            </div>
          </div>

          {/* Team preview */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px',
            padding: '16px', borderRadius: '16px',
            background: `linear-gradient(135deg, ${selectedTeam.colors.primary}25, #1A1828)`,
            border: `1px solid ${selectedTeam.colors.primary}40`,
          }}>
            <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={56}/>
            <div>
              <div style={{ fontSize: '12px', color: selectedTeam.colors.secondary, opacity: 0.8 }}>{selectedTeam.city} / {selectedTeam.region}</div>
              <div style={{ fontSize: '16px', fontWeight: '800', color: '#F0EDE8' }}>{teamName || selectedTeam.name}</div>
            </div>
          </div>

          {/* Logo select */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', color: '#9B97A8', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              チームロゴ
            </label>
            <button
              type="button"
              onClick={() => setLogoSheetOpen(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px', borderRadius: '12px', cursor: 'pointer',
                backgroundColor: '#1E1B2E', border: '1px solid #2E2B42',
              }}
            >
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <TeamLogoSVG primary={selectedTeam.colors.primary} secondary={selectedTeam.colors.secondary} shortName={selectedTeam.shortName} teamId={selectedTeam.id} logoId={selectedLogoId} size={40}/>
              </div>
              <span style={{ flex: 1, textAlign: 'left', fontSize: '13px', fontWeight: 700, color: '#F0EDE8' }}>変更する</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ color: '#9B97A8', flexShrink: 0 }}>
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Team name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', color: '#9B97A8', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              チーム名
            </label>
            <input
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              maxLength={20}
              placeholder="例：福岡サザンクロス"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '12px', border: 'none',
                backgroundColor: '#1E1B2E', color: '#F0EDE8', fontSize: '16px',
                fontFamily: 'inherit', outline: 'none',
                boxShadow: 'inset 0 0 0 1px #2E2B42',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Short name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ fontSize: '11px', color: '#9B97A8', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              略称（3文字まで）
            </label>
            <input
              type="text"
              value={teamShortName}
              onChange={e => setTeamShortName(e.target.value)}
              maxLength={3}
              placeholder="例：福岡"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '12px', border: 'none',
                backgroundColor: '#1E1B2E', color: '#F0EDE8', fontSize: '16px',
                fontFamily: 'inherit', outline: 'none',
                boxShadow: 'inset 0 0 0 1px #2E2B42',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* GM name */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: '#9B97A8', letterSpacing: '2px', display: 'block', marginBottom: '8px' }}>
              あなたの名前
            </label>
            <input
              type="text"
              value={gmName}
              onChange={e => setGmName(e.target.value)}
              maxLength={15}
              placeholder="例：山田"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: '12px', border: 'none',
                backgroundColor: '#1E1B2E', color: '#F0EDE8', fontSize: '16px',
                fontFamily: 'inherit', outline: 'none',
                boxShadow: 'inset 0 0 0 1px #2E2B42',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {nameError && (
            <div style={{ fontSize: '12px', color: '#E8462A', marginBottom: '12px', padding: '8px 12px', borderRadius: '8px', backgroundColor: '#E8462A15' }}>
              {nameError}
            </div>
          )}

          <div style={{ fontSize: '11px', color: '#5C5870', marginBottom: '32px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#1A1828', border: '1px solid #2E2B42' }}>
            このあとドラフトでチームを作ります。<br/>
            新規参入チームのため、全体1番目の指名権あり。
          </div>

          <button onClick={handleConfirm} style={{
            position: 'relative', overflow: 'hidden',
            width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
            background: 'linear-gradient(180deg, #E8C86A 0%, #C9A84C 60%, #A8873A 100%)',
            color: '#0A0912', fontSize: '15px', fontWeight: '900',
            cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 0 #6B5020, 0 8px 20px rgba(201,168,76,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '45%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.25) 0%, transparent 100%)',
              borderRadius: '13px 13px 50% 50%', pointerEvents: 'none',
            }}/>
            ドラフトへ進む
          </button>

        </div>
      )}

      {logoSheetOpen && (
        <LogoSelectSheet team={selectedTeam} value={selectedLogoId} onSelect={setSelectedLogoId} onClose={() => setLogoSheetOpen(false)} />
      )}
    </div>
  )
}
